import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type Td404Device = {
  id: string;
  name: string | null;
  rawName?: string | null;
  bonded?: boolean;
  transport?: 'bluetooth-spp';
  sdkId?: 'td404';
  likelyTd404?: boolean;
};

export type Td404PngLabelResult = {
  bytesSent: number;
  jobBytes?: number;
  copies?: number;
  decodeMs?: number;
  encodeMs?: number;
  writeMs?: number;
  path?: string;
  dryRun?: boolean;
  jobBase64?: string;
  wireBmpBase64?: string;
  bytesPerRow?: number;
  heightDots?: number;
  widthDots?: number;
  gitSha?: string;
  buildTime?: string;
  nativeRev?: string;
  reference?: string;
  bitmapX?: number;
  bitmapY?: number;
  requestedX?: number;
  requestedY?: number;
  pngWidth?: number;
  pngHeight?: number;
  fit?: string;
  marginL?: number;
  marginR?: number;
  marginT?: number;
  marginB?: number;
};

export type Td404MonoLabelResult = {
  bytesSent: number;
  jobBytes?: number;
  copies?: number;
  writeMs?: number;
  path?: string;
  dryRun?: boolean;
  reference?: string;
  bitmapX?: number;
  bitmapY?: number;
  marginL?: number;
  marginR?: number;
  marginT?: number;
  marginB?: number;
  jobBase64?: string;
  wireBmpBase64?: string;
  bytesPerRow?: number;
  heightDots?: number;
  widthDots?: number;
  gitSha?: string;
  buildTime?: string;
};

type NativeTd404 = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  getBondedDevices(): Promise<Td404Device[]>;
  startScan(): Promise<{ discoveryStarted?: boolean; bondedCount?: number; reason?: string } | void>;
  stopScan(): Promise<void>;
  connect(
    macAddress: string,
    name: string | null,
  ): Promise<{ id: string; name: string | null; transport: string; sdkId: string }>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectedDevice(): Td404Device | null;
  printBase64(base64: string): Promise<{ bytesSent: number }>;
  printRaw?(bytes: Uint8Array): Promise<{ bytesSent: number }>;
  printPngLabel?(options: Record<string, unknown>): Promise<Td404PngLabelResult>;
  printMonoLabel?(
    monoBytes: Uint8Array,
    options: Record<string, unknown>,
  ): Promise<Td404MonoLabelResult>;
  renderPdfPages?(
    uri: string,
    options?: Record<string, unknown>,
  ): Promise<RenderPdfResult>;
  addListener(
    eventName: string,
    listener: (event: Td404Device | Record<string, unknown>) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeTd404 | null | undefined;

function getNative(): NativeTd404 | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeTd404>('Td404Printer');
  } catch {
    cached = null;
  }
  return cached;
}

export function isTd404NativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

/** Adapter power only. Returns null when the helper is missing (older APK). */
export function isTd404BluetoothEnabled(): boolean | null {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return null;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return null;
  }
}

export async function getTd404BondedDevices(): Promise<Td404Device[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startTd404Scan(
  onDevice: (device: Td404Device) => void,
  onFinished?: (error?: Error) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'TD-404 Bluetooth module requires a development build (`npx expo run:android`). Not available in Expo Go.',
    );
  }

  const foundSub = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as Td404Device);
  });
  const finishSub = onFinished
    ? mod.addListener('onScanFinished', () => onFinished())
    : null;

  void mod
    .startScan()
    .then((result) => {
      if (result && result.discoveryStarted === false) {
        onFinished?.();
      }
    })
    .catch((error) => {
      foundSub.remove();
      finishSub?.remove();
      const err = error instanceof Error ? error : new Error(String(error));
      onFinished?.(err);
    });

  return {
    stop: async () => {
      foundSub.remove();
      finishSub?.remove();
      await mod.stopScan().catch(() => {});
    },
  };
}

export async function connectTd404(macAddress: string, name: string | null) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  await mod.stopScan().catch(() => {});
  return mod.connect(macAddress, name);
}

export async function disconnectTd404() {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export function isTd404Connected(): boolean {
  const mod = getNative();
  return Boolean(mod?.isConnected());
}

export async function printTd404Base64(base64: string) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  return mod.printBase64(base64);
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function safeBytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  if (len === 0) return '';
  const parts: string[] = [];
  const CHUNK_SIZE = 16384;
  let buf = '';
  const mainLen = len - (len % 3);
  for (let i = 0; i < mainLen; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    buf +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      B64_CHARS[chunk & 63];
    if (buf.length >= CHUNK_SIZE) {
      parts.push(buf);
      buf = '';
    }
  }
  const remaining = len - mainLen;
  if (remaining === 1) {
    const chunk = bytes[mainLen];
    buf += B64_CHARS[chunk >> 2] + B64_CHARS[(chunk & 3) << 4] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[mainLen] << 8) | bytes[mainLen + 1];
    buf +=
      B64_CHARS[chunk >> 10] +
      B64_CHARS[(chunk >> 4) & 63] +
      B64_CHARS[(chunk & 15) << 2] +
      '=';
  }
  if (buf.length > 0) parts.push(buf);
  return parts.join('');
}

export async function printTd404Raw(bytes: Uint8Array) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  if (typeof mod.printRaw === 'function') {
    try {
      return await mod.printRaw(bytes);
    } catch {
      // If native printRaw fails or is not supported, fall back to safe base64
    }
  }
  return mod.printBase64(safeBytesToBase64(bytes));
}

export type Td404PngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  density?: number | null;
  speed?: number | null;
  xDots?: number;
  yDots?: number;
  copies?: number;
  media?: 'gap' | 'bline' | 'continuous';
  /** TSPL SET TEAR. Default on. */
  tearOn?: boolean;
  orientation?: number;
  dpi?: number;
  /** TSPL DIRECTION: 1 (default, matches JS pipeline / preview) or 0. */
  direction?: 0 | 1;
  /** Luminance cutoff (0–255) for black ink. Default 160 keeps thin text and barcodes solid. */
  threshold?: number;
  /** Whether to use Floyd-Steinberg error diffusion dithering for photos / halftones. */
  dither?: boolean;
  /** Dev-only: build TSPL job and return bytes without a socket write. Default off. */
  dryRun?: boolean;
  gitSha?: string;
  buildTime?: string;
};

/**
 * Native SDK fast path: PNG → LabelCommand → SPP write (no JS rasterize).
 * Returns null when the native module / method is unavailable.
 */
export async function printTd404PngLabel(
  options: Td404PngLabelOptions,
): Promise<Td404PngLabelResult | null> {
  const mod = getNative();
  if (!mod || typeof mod.printPngLabel !== 'function') return null;
  if (!options.dryRun && !mod.isConnected()) {
    throw new Error('No TD-404 printer connected.');
  }
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    gapMm: options.gapMm ?? 3,
    density: options.density ?? 10,
    speed: options.speed ?? 3,
    xDots: options.xDots ?? 0,
    yDots: options.yDots ?? 0,
    copies: options.copies ?? 1,
    media: options.media ?? 'gap',
    tearOn: options.tearOn !== false,
    orientation: options.orientation ?? 0,
    dpi: options.dpi ?? 304,
    direction: options.direction ?? 1,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
    dryRun: options.dryRun === true,
    gitSha: options.gitSha ?? 'unknown',
    buildTime: options.buildTime ?? 'unknown',
  });
}

export type Td404MonoLabelOptions = {
  monoBytes: Uint8Array;
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  density?: number | null;
  speed?: number | null;
  xDots?: number;
  yDots?: number;
  copies?: number;
  media?: 'gap' | 'bline' | 'continuous';
  /** TSPL SET TEAR. Default on. */
  tearOn?: boolean;
  dpi?: number;
  direction?: 0 | 1;
  dryRun?: boolean;
  gitSha?: string;
  buildTime?: string;
};

function packedPageDotsMm(widthMm: number, heightMm: number, dpi: number) {
  const dpm = dpi === 304 ? 12 : dpi === 203 ? 8 : Number.NaN;
  if (!Number.isFinite(dpm)) {
    throw new Error(`TD-404 dpi ${dpi} is not 203 or 304`);
  }
  const sizeDotsW = Math.max(1, Math.round(widthMm * dpm));
  const sizeDotsH = Math.max(1, Math.round(heightMm * dpm));
  const packedW = Math.max(8, Math.ceil(sizeDotsW / 8) * 8);
  return { packedW, packedH: sizeDotsH };
}

function padMonoRows(
  data: Uint8Array,
  srcBytesPerRow: number,
  height: number,
  destBytesPerRow: number,
): Uint8Array {
  if (srcBytesPerRow === destBytesPerRow && data.length === destBytesPerRow * height) return data;
  const out = new Uint8Array(destBytesPerRow * height);
  const copy = Math.min(srcBytesPerRow, destBytesPerRow);
  for (let y = 0; y < height; y++) {
    const srcOff = y * srcBytesPerRow;
    out.set(data.subarray(srcOff, srcOff + Math.min(copy, Math.max(0, data.length - srcOff))), y * destBytesPerRow);
  }
  return out;
}

function normalizeTd404MonoBufferLocal(
  options: Td404MonoLabelOptions,
  dpi: number,
): Td404MonoLabelOptions {
  const { packedW, packedH } = packedPageDotsMm(options.widthMm, options.heightMm, dpi);
  if (options.heightDots !== packedH) {
    throw new Error(
      `TD-404 mono heightDots (${options.heightDots}) != packedH (${packedH}) for ${options.widthMm}x${options.heightMm}mm @ ${dpi} dpi`,
    );
  }
  const destBpr = packedW / 8;
  return {
    ...options,
    widthDots: packedW,
    heightDots: packedH,
    bytesPerRow: destBpr,
    monoBytes: padMonoRows(options.monoBytes, options.bytesPerRow, packedH, destBpr),
  };
}

function assertTd404MonoBufferLocal(options: Td404MonoLabelOptions, dpi: number): void {
  const { packedW, packedH } = packedPageDotsMm(options.widthMm, options.heightMm, dpi);
  if (options.bytesPerRow * 8 !== packedW) {
    throw new Error(
      `TD-404 mono buffer bytesPerRow*8 (${options.bytesPerRow * 8}) != packedW (${packedW}) for ${options.widthMm}x${options.heightMm}mm @ ${dpi} dpi`,
    );
  }
  if (options.widthDots !== packedW) {
    throw new Error(`TD-404 mono widthDots (${options.widthDots}) != packedW (${packedW})`);
  }
  if (options.heightDots !== packedH) {
    throw new Error(`TD-404 mono heightDots (${options.heightDots}) != packedH (${packedH})`);
  }
  const expectedLen = options.bytesPerRow * options.heightDots;
  if (options.monoBytes.length !== expectedLen) {
    throw new Error(
      `TD-404 mono buffer length ${options.monoBytes.length} != bytesPerRow*heightDots (${expectedLen})`,
    );
  }
}

/**
 * Native path: packed 1-bit buffer → TSPL BITMAP → SPP (no PNG decode).
 * Returns null when the native module / method is unavailable.
 */
export async function printTd404MonoLabel(
  options: Td404MonoLabelOptions,
): Promise<Td404MonoLabelResult | null> {
  const dpi = options.dpi ?? 304;
  const mono = normalizeTd404MonoBufferLocal(options, dpi);
  assertTd404MonoBufferLocal(mono, dpi);
  const mod = getNative();
  if (!mod || typeof mod.printMonoLabel !== 'function') return null;
  if (!mono.dryRun && !mod.isConnected()) {
    throw new Error('No TD-404 printer connected.');
  }
  return mod.printMonoLabel(mono.monoBytes, {
    widthDots: mono.widthDots,
    heightDots: mono.heightDots,
    bytesPerRow: mono.bytesPerRow,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    gapMm: options.gapMm ?? 3,
    density: options.density ?? 10,
    speed: options.speed ?? 3,
    xDots: options.xDots ?? 0,
    yDots: options.yDots ?? 0,
    copies: options.copies ?? 1,
    media: options.media ?? 'gap',
    tearOn: options.tearOn !== false,
    dpi,
    direction: options.direction ?? 1,
    dryRun: options.dryRun === true,
    gitSha: options.gitSha ?? 'unknown',
    buildTime: options.buildTime ?? 'unknown',
  });
}

export type RenderedPdfPage = {
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  base64: string;
};

export type RenderPdfResult = {
  pageCount: number;
  pages: RenderedPdfPage[];
};

/**
 * Native Android hardware-accelerated PDF renderer.
 * Converts any PDF URI into rendered page Bitmaps/PNGs at target DPI.
 */
export async function renderPdfPages(
  uriString: string,
  options?: { dpi?: number; maxPages?: number },
): Promise<RenderPdfResult | null> {
  const mod = getNative();
  if (!mod || typeof mod.renderPdfPages !== 'function') return null;
  return mod.renderPdfPages(uriString, options as Record<string, unknown> | undefined);
}

export type Td404ConnectionEvent = {
  connected: boolean;
  id?: string;
  name?: string;
  transport?: string;
  sdkId?: string;
};

/**
 * Native `onConnectionChanged`. Fires both on explicit disconnect() and when a
 * write throws IOException and the module closes the dead socket itself — the
 * router needs both, not just the ones it initiated.
 */
export function addTd404ConnectionListener(
  listener: (event: Td404ConnectionEvent) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onConnectionChanged', (event) => {
    listener((event ?? {}) as Td404ConnectionEvent);
  });
}

export async function getTd404ConnectionInfo(): Promise<{
  connected: boolean;
  mac: string | null;
  name: string | null;
  transport: string;
  sdkId: string;
  socketClass: string;
} | null> {
  const mod = getNative() as (NativeTd404 & {
    getConnectionInfo?(): {
      connected: boolean;
      mac: string | null;
      name: string | null;
      transport: string;
      sdkId: string;
      socketClass: string;
    };
  }) | null;
  if (!mod || typeof mod.getConnectionInfo !== 'function') return null;
  try {
    return mod.getConnectionInfo();
  } catch {
    return null;
  }
}

