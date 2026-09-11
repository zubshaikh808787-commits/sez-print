import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type JoshDevice = {
  id: string;
  name: string | null;
  macAddress: string;
  transport: 'josh-lpapi';
  sdkId: 'josh';
  bonded?: boolean;
};

export type JoshPrinterState = {
  state: string;
  isConnected: boolean;
  isPrinting: boolean;
  isDiscovering: boolean;
  printerName: string | null;
  macAddress: string | null;
  lastError: string | null;
  lastConnectedAt: number;
  density: number;
  speed: number;
  gapType: number;
  gapLength: number;
};

export type JoshPrintResult = {
  jobId: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  targetW: number;
  targetH: number;
  density: number;
  speed: number;
  decodeMs: number;
  fitMs: number;
  submitMs: number;
  waitMs: number;
  totalMs: number;
};

export type JoshPngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  dpi?: number;
  copies?: number;
  density?: number;
  speed?: number;
  direction?: number;
  orientation?: number;
  gapType?: number;
  gapLength?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: 'left' | 'center';
};

type NativeJoshPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  isDeviceNameSupported(name: string | null): boolean;
  startDiscovery(): Promise<{ discoveryStarted?: boolean }>;
  stopDiscovery(): Promise<void>;
  connect(macAddress: string, name: string | null): Promise<JoshDevice>;
  disconnect(): Promise<void>;
  reconnect(): Promise<boolean>;
  getState(): JoshPrinterState;
  isConnected(): boolean;
  configureParams(params: {
    density?: number;
    speed?: number;
    gapType?: number;
    gapLength?: number;
  }): Promise<void>;
  printTestText(text: string): Promise<boolean>;
  printPngLabel(options: Record<string, unknown>): Promise<JoshPrintResult>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeJoshPrinter | null | undefined;

function getNative(): NativeJoshPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getJoshNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'JOSH LPAPI is only supported on Android' };
  }
  let mod: NativeJoshPrinter | null = null;
  try {
    mod = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch (err: any) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'JoshPrinter' is not compiled into the APK running on this device (${err?.message ?? 'not found'}). An APK reinstall is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('JoshPrinter') returned null — native code not present in running APK",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but manager initialization failed',
    };
  } catch (err: any) {
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${err?.message}` };
  }
}

export function isJoshNativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

/** Adapter power only. Returns null when the helper is missing (older APK). */
export function isJoshBluetoothEnabled(): boolean | null {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return null;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return null;
  }
}

export function isDeviceNameSupported(name: string | null | undefined): boolean {
  const mod = getNative();
  if (!mod || !name) return false;
  try {
    return Boolean(mod.isDeviceNameSupported(name));
  } catch {
    return false;
  }
}

export function startJoshDiscovery(
  onDevice: (device: JoshDevice) => void,
  onFinished?: (error?: Error) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'JOSH Bluetooth module requires a development build (`npx expo run:android`). Not available in Expo Go.',
    );
  }

  const foundSub = mod.addListener('onJoshPrinterDiscovered', (payload) => {
    onDevice(payload as JoshDevice);
  });
  const finishSub = onFinished
    ? mod.addListener('onJoshScanFinished', () => onFinished())
    : null;

  void mod
    .startDiscovery()
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
      await mod.stopDiscovery().catch(() => {});
    },
  };
}

export async function connectJosh(
  macAddress: string,
  name: string | null = null,
): Promise<JoshDevice> {
  const mod = getNative();
  if (!mod) throw new Error('JOSH Bluetooth module is not available.');
  await mod.stopDiscovery().catch(() => {});
  return mod.connect(macAddress, name);
}

export async function disconnectJosh(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export async function reconnectJosh(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.reconnect();
}

export function isJoshConnected(): boolean {
  const mod = getNative();
  return Boolean(mod?.isConnected());
}

export function getJoshState(): JoshPrinterState | null {
  const mod = getNative();
  if (!mod) return null;
  try {
    return mod.getState();
  } catch {
    return null;
  }
}

export async function configureJoshParams(params: {
  density?: number;
  speed?: number;
  gapType?: number;
  gapLength?: number;
}): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.configureParams(params);
}

export async function printJoshPngLabel(
  options: JoshPngLabelOptions,
): Promise<JoshPrintResult> {
  const mod = getNative();
  if (!mod || typeof mod.printPngLabel !== 'function') {
    throw new Error('JOSH printPngLabel is not available on this platform.');
  }
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi: options.dpi ?? 203,
    copies: options.copies ?? 1,
    density: options.density ?? -1,
    speed: options.speed ?? -1,
    direction: options.direction ?? options.orientation ?? 0,
    gapType: options.gapType ?? 2,
    gapLength: options.gapLength ?? 3,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    alignment: options.alignment ?? 'left',
  });
}

export async function printJoshTestText(text?: string): Promise<boolean> {
  const mod = getNative();
  if (!mod || typeof mod.printTestText !== 'function') {
    throw new Error('JOSH printTestText is not available on this platform.');
  }
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }
  return mod.printTestText(text ?? 'Sez Print JOSH OK');
}

export function addJoshConnectionListener(
  listener: (event: { state: string; isConnected: boolean; printerName?: string; macAddress?: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshConnectionStateChanged', listener);
}

export function addJoshPrintProgressListener(
  listener: (event: { jobId: string; progress: string; [key: string]: any }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshPrintProgress', listener);
}

export function addJoshErrorListener(
  listener: (event: { code: string; message: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshError', listener);
}
