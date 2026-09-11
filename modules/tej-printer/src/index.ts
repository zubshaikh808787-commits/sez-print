import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type TejDevice = {
  id: string;
  name: string | null;
  address: string;
  modelKey: string;
  transport: 'bluetooth-spp';
  sdkId: 'tej';
  bonded?: boolean;
};

export type TejPrinterState = {
  state: 'DISCONNECTED' | 'SCANNING' | 'CONNECTING' | 'CONNECTED' | 'PRINTING' | 'RECONNECTING' | 'ERROR';
  isConnected: boolean;
};

export type TejStatus = {
  isOk: boolean;
  isPrinting: boolean;
  isCoverOpen: boolean;
  isOutOfPaper: boolean;
  isLowBattery: boolean;
  isOverheated: boolean;
  rawCode: number;
  rawHex: string;
};

export type TejPrintOptions = {
  pngBase64: string;
  copies?: number;
  paperType?: 'gap' | 'continuous' | 'black' | 'tattoo' | 'bline' | 'receipt';
  dpiDotsPerMm?: number; // 8 = 203 DPI, 12 = 304 DPI
  density?: number;
  widthMm?: number;
  heightMm?: number;
};

type NativeTejPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  getState(): TejPrinterState;
  getBondedDevices(): Promise<TejDevice[]>;
  startScan(timeoutMs?: number): Promise<{ scanStarted?: boolean }>;
  stopScan(): Promise<void>;
  connect(address: string, name?: string | null, modelKey?: string | null): Promise<TejDevice>;
  disconnect(): Promise<void>;
  getStatus(): Promise<TejStatus>;
  setDensity(density: number): Promise<boolean>;
  printPngLabel(options: Record<string, unknown>): Promise<{ success: boolean; copies: number; paperType: string }>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeTejPrinter | null | undefined;

function getNative(): NativeTejPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeTejPrinter>('TejPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getTejNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'Tej printer is only supported on Android' };
  }
  let mod: NativeTejPrinter | null = null;
  try {
    mod = requireNativeModule<NativeTejPrinter>('TejPrinter');
  } catch (err: any) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'TejPrinter' is not compiled into the APK (${err?.message ?? 'not found'}).`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('TejPrinter') returned null",
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

export function isTejNativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isTejBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return true;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return true;
  }
}

export function isTejConnected(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.getState()?.isConnected);
  } catch {
    return false;
  }
}

export function addTejDeviceFoundListener(
  listener: (device: TejDevice) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onTejDeviceFound', listener);
}

export function addTejScanFinishedListener(
  listener: () => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onTejScanFinished', listener);
}

export function addTejConnectionStateListener(
  listener: (event: { state: string; isConnected: boolean; deviceAddress?: string; deviceName?: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onTejConnectionStateChanged', listener);
}

export function addTejPrintProgressListener(
  listener: (event: { current: number; total: number; progress: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onTejPrintProgress', listener);
}

export function addTejErrorListener(
  listener: (event: { code: string; message: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onTejError', listener);
}

export async function getTejBondedDevices(): Promise<TejDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  return mod.getBondedDevices();
}

export function startTejScan(
  onDevice: (device: TejDevice) => void,
  onError?: (error: Error) => void,
  timeoutMs = 10_000,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    onError?.(new Error('Tej native module is unavailable.'));
    return { stop: async () => {} };
  }

  const subDevice = mod.addListener('onTejDeviceFound', (device: TejDevice) => {
    onDevice(device);
  });

  const subError = mod.addListener('onTejError', (event: { code: string; message: string }) => {
    if (event.code.includes('SCAN')) {
      onError?.(new Error(`[${event.code}] ${event.message}`));
    }
  });

  void mod.startScan(timeoutMs).catch((err) => {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  return {
    stop: async () => {
      try {
        subDevice.remove();
        subError.remove();
        await mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export async function connectTej(
  address: string,
  name?: string | null,
  modelKey?: string | null,
): Promise<TejDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Tej native module is unavailable.');
  return mod.connect(address, name, modelKey);
}

export async function disconnectTej(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export async function getTejStatus(): Promise<TejStatus> {
  const mod = getNative();
  if (!mod) throw new Error('Tej native module is unavailable.');
  return mod.getStatus();
}

export async function setTejDensity(density: number): Promise<boolean> {
  const mod = getNative();
  if (!mod) throw new Error('Tej native module is unavailable.');
  return mod.setDensity(density);
}

export async function printTejPngLabel(
  options: TejPrintOptions,
): Promise<{ success: boolean; copies: number; paperType: string }> {
  const mod = getNative();
  if (!mod) throw new Error('Tej native module is unavailable.');
  return mod.printPngLabel(options as Record<string, unknown>);
}
