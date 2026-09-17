import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  LabelXDiscoveredDevice,
  LabelXPrintOptions,
  LabelXPrintResult,
  LabelXScanResult,
  LabelXStatusResult,
} from './types';

type NativeLabelXPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  initSdk(asKey?: string): boolean;
  getBondedDevices(): Promise<LabelXDiscoveredDevice[]>;
  startScan(): Promise<LabelXScanResult>;
  stopScan(): Promise<void>;
  connect(macAddress: string, deviceName?: string | null, btType?: number): Promise<LabelXDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<LabelXStatusResult>;
  printPngLabel(options: Record<string, unknown>): Promise<LabelXPrintResult>;
  printTestLabel(text?: string): Promise<{ success: boolean }>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeLabelXPrinter | null | undefined;

function getNative(): NativeLabelXPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeLabelXPrinter>('LabelXPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getLabelXNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'Label X SDK is only supported on Android' };
  }
  let mod: NativeLabelXPrinter | null = null;
  try {
    mod = requireNativeModule<NativeLabelXPrinter>('LabelXPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'LabelXPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('LabelXPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but LuckPrinter SDK initialization failed',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isLabelXAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isLabelXBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isLabelXConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isLabelXNativeAvailable = isLabelXAvailable;

export async function getLabelXBondedDevices(): Promise<LabelXDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startLabelXScan(
  onDevice: (device: LabelXDiscoveredDevice) => void,
  onFinishedOrFailed?: ((error?: any) => void) | (() => void),
  onFailed?: (error: string) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();

  const handleFail = (err: string | Error) => {
    if (typeof onFailed === 'function') {
      onFailed(typeof err === 'string' ? err : err.message);
    } else if (typeof onFinishedOrFailed === 'function') {
      onFinishedOrFailed(err);
    }
  };

  if (!mod) {
    handleFail('Label X printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as LabelXDiscoveredDevice);
  });

  const subFinished = mod.addListener('onScanFinished', () => {
    if (typeof onFinishedOrFailed === 'function' && !onFailed) {
      onFinishedOrFailed();
    }
    cleanup();
  });

  const subFailed = mod.addListener('onScanFailed', (evt: unknown) => {
    const err = (evt as { error?: string })?.error || 'Scan failed';
    handleFail(err);
    cleanup();
  });

  const cleanup = () => {
    subFound.remove();
    subFinished.remove();
    subFailed.remove();
  };

  try {
    void mod.startScan();
  } catch (err) {
    cleanup();
    handleFail(err instanceof Error ? err : new Error('Failed to start scan'));
  }

  return {
    stop: async () => {
      cleanup();
      try {
        await mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export async function connectLabelX(
  macAddress: string,
  deviceName?: string | null,
  btType?: number,
): Promise<LabelXDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.connect(macAddress, deviceName ?? null, btType);
}

export async function disconnectLabelX(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}

export async function printLabelXPngLabel(options: LabelXPrintOptions): Promise<LabelXPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    copies: options.copies ?? 1,
    widthMm: options.widthMm ?? 48,
    widthDots: options.widthDots ?? 384,
    paperType: options.paperType ?? 'tag',
    density: options.density ?? 1,
    threshold: options.threshold ?? 145,
    dither: options.dither ?? true,
  });
}

export async function getLabelXStatus(): Promise<LabelXStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.getStatus();
}

export async function printLabelXTestLabel(text?: string): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.printTestLabel(text);
}
