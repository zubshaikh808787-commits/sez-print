import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  DevCalibrationResult,
  DevDiscoveredDevice,
  DevPrintOptions,
  DevPrintResult,
  DevStatusResult,
} from './types';

type NativeDevPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  getBondedDevices(): Promise<DevDiscoveredDevice[]>;
  startScan(): Promise<{ discoveryStarted: boolean; bondedCount: number; reason?: string }>;
  stopScan(): Promise<void>;
  connect(macAddress: string, deviceName?: string | null): Promise<DevDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<DevStatusResult>;
  calibrate(paperType?: number): Promise<DevCalibrationResult>;
  printPngLabel(options: Record<string, unknown>): Promise<DevPrintResult>;
  printReceiptText(text: string, options?: Record<string, unknown>): Promise<{ success: boolean }>;
  testPrint(options?: unknown): Promise<{ success: boolean }>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeDevPrinter | null | undefined;

function getNative(): NativeDevPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeDevPrinter>('DevPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getDevNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'DEV SDK is only supported on Android' };
  }
  let mod: NativeDevPrinter | null = null;
  try {
    mod = requireNativeModule<NativeDevPrinter>('DevPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'DevPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('DevPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but AutoReplyPrint SDK initialization failed',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isDevAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isDevBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isDevConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isDevNativeAvailable = isDevAvailable;

export async function getDevBondedDevices(): Promise<DevDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startDevScan(
  onDevice: (device: DevDiscoveredDevice) => void,
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
    handleFail('Dev printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as DevDiscoveredDevice);
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

export async function connectDev(
  macAddress: string,
  deviceName?: string | null,
): Promise<DevDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.connect(macAddress, deviceName ?? null);
}

export async function disconnectDev(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}

export async function printDevPngLabel(options: DevPrintOptions): Promise<DevPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    gapMm: options.gapMm ?? 2,
    copies: options.copies ?? 1,
    density: options.density ?? 14,
    speed: options.speed ?? 3,
    media: options.media ?? 'gap',
    // Default to TSPL, not 'auto'. Native treats anything that isn't exactly
    // "tspl" as ESC/POS (`useEscPos = commandSet != "tspl"`), and the ESC/POS
    // engine is a different geometry universe: it ignores heightMm entirely and
    // derives size from the source bitmap's aspect, centres on the printhead
    // rather than the label, and byte-aligns height (a silent vertical stretch).
    // Labels must go through the mm-locked, gap-sensor-aware TSPL path.
    commandSet: options.commandSet ?? 'tspl',
    rotation: options.rotation ?? 0,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    printheadWidthMm: options.printheadWidthMm ?? 48,
  });
}

export async function printDevReceiptText(
  text: string,
  options?: Record<string, unknown>,
): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.printReceiptText(text, options);
}

export async function calibrateDev(paperType?: number): Promise<DevCalibrationResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.calibrate(paperType);
}

export async function getDevStatus(): Promise<DevStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.getStatus();
}

export async function testDevPrint(mode?: 'tspl' | 'escpos'): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.testPrint(mode ? { mode } : undefined);
}

export type DevConnectionEvent = {
  connected: boolean;
  id?: string;
  name?: string;
  transport?: string;
  sdkId?: string;
};

/**
 * Native `onConnectionChanged`. The router needs this to learn about a link the
 * SDK dropped on its own, rather than discovering it on the next failed print.
 */
export function addDevConnectionListener(
  listener: (event: DevConnectionEvent) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onConnectionChanged', (event) => {
    listener((event ?? {}) as DevConnectionEvent);
  });
}

/**
 * Raw scan subscription over the DEV module's BroadcastReceiver.
 *
 * The receiver is NOT brand-filtered — it emits every ACTION_FOUND device and
 * every bonded device, tagging each with `likelyDev`. That makes it usable as the
 * one shared classic-Bluetooth scan for all brands, which is what printer-core's
 * discovery requires. Per-brand filtering happens in each driver's `claims()`.
 */
export function addDevScanListeners(handlers: {
  onDevice: (device: DevDiscoveredDevice) => void;
  onFinished?: () => void;
}): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  const found = mod.addListener('onDeviceFound', (payload) => {
    handlers.onDevice(payload as DevDiscoveredDevice);
  });
  const finished = handlers.onFinished
    ? mod.addListener('onScanFinished', () => handlers.onFinished?.())
    : null;
  return {
    remove: () => {
      found.remove();
      finished?.remove();
    },
  };
}

export async function startDevScanRaw(): Promise<{ discoveryStarted: boolean; bondedCount: number; reason?: string }> {
  const mod = getNative();
  if (!mod) return { discoveryStarted: false, bondedCount: 0, reason: 'Dev printer module not available' };
  return mod.startScan();
}

export async function stopDevScanRaw(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.stopScan().catch(() => {});
}
