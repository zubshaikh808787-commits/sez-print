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
};

type NativeTd404 = {
  isAvailable(): boolean;
  getBondedDevices(): Promise<Td404Device[]>;
  startScan(): Promise<{ discoveryStarted?: boolean; bondedCount?: number } | void>;
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
  onFinished?: () => void,
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

  void mod.startScan();

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
  orientation?: number;
  dpi?: number;
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
  if (!mod.isConnected()) {
    throw new Error('No TD-404 printer connected.');
  }
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    gapMm: options.gapMm ?? 2,
    density: options.density ?? 8,
    speed: options.speed ?? 6,
    xDots: options.xDots ?? 0,
    yDots: options.yDots ?? 0,
    copies: options.copies ?? 1,
    media: options.media ?? 'gap',
    orientation: options.orientation ?? 0,
    dpi: options.dpi ?? 203,
  });
}

