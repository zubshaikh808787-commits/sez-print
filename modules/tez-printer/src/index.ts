import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  TezCalibrationResult,
  TezDiscoveredDevice,
  TezPrintOptions,
  TezPrintResult,
  TezStatusResult,
  parsePaperType,
} from './types';

export const TEZ_NATIVE_REVISION = 'tez-connect-v2';

const STALE_TEZ_APK_MESSAGE =
  'Install a new development build to connect Seznik. Plug the phone in over USB and run: npx expo run:android';

type NativeTezPrinter = {
  isAvailable(): boolean;
  getNativeRevision?(): string;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  getBondedDevices(): TezDiscoveredDevice[];
  startScan(): boolean;
  stopScan(): boolean;
  connect(macAddress: string, deviceName?: string | null): Promise<TezDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  calibrate(paperType: number): Promise<TezCalibrationResult>;
  getStatus(): Promise<TezStatusResult>;
  getBatteryLevel(): Promise<number>;
  printImage(options: Record<string, unknown>): Promise<TezPrintResult>;
  printTestText(text: string): Promise<TezPrintResult>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeTezPrinter | null | undefined;

function getNative(): NativeTezPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeTezPrinter>('TezPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getTezNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'Tez/Shakti SDK is only supported on Android' };
  }
  let mod: NativeTezPrinter | null = null;
  try {
    mod = requireNativeModule<NativeTezPrinter>('TezPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'TezPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('TezPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    const revision = typeof mod.getNativeRevision === 'function' ? mod.getNativeRevision() : null;
    const current = revision === TEZ_NATIVE_REVISION;
    return {
      isLinked: true,
      isAvailable: available,
      reason: current
        ? available ? undefined : 'Native module is linked, but initialization failed'
        : STALE_TEZ_APK_MESSAGE,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isTezAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isTezBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isTezConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isTezNativeAvailable = isTezAvailable;

export async function getTezBondedDevices(): Promise<TezDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return mod.getBondedDevices() ?? [];
  } catch {
    return [];
  }
}

export function startTezScan(
  onDevice: (device: TezDiscoveredDevice) => void,
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
    handleFail('Tez printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as TezDiscoveredDevice);
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
    mod.startScan();
  } catch (err) {
    cleanup();
    handleFail(err instanceof Error ? err : new Error('Failed to start scan'));
  }

  return {
    stop: async () => {
      cleanup();
      try {
        mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export function getTezNativeRevision(): string | null {
  const mod = getNative();
  if (!mod || typeof mod.getNativeRevision !== 'function') return null;
  try {
    return mod.getNativeRevision();
  } catch {
    return null;
  }
}

export function formatTezConnectError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/DeviceItem\.name|null object reference/i.test(msg)) {
    return STALE_TEZ_APK_MESSAGE;
  }
  return msg;
}

export async function connectTez(
  macAddress: string,
  deviceName?: string | null,
): Promise<TezDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  const revision = getTezNativeRevision();
  console.info(`[TEZ-CONN] nativeRevision=${revision ?? 'missing'} expected=${TEZ_NATIVE_REVISION}`);
  if (revision !== TEZ_NATIVE_REVISION) {
    throw new Error(STALE_TEZ_APK_MESSAGE);
  }
  try {
    return await mod.connect(macAddress, deviceName ?? null);
  } catch (error) {
    throw new Error(formatTezConnectError(error));
  }
}

export async function disconnectTez(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}


export async function printTezImage(options: TezPrintOptions): Promise<TezPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');

  const paperTypeInt = parsePaperType(options.paperType);

  return mod.printImage({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    copies: options.copies ?? 1,
    density: options.density ?? 8,
    speed: options.speed ?? 4.0,
    paperType: paperTypeInt,
    threshold: options.threshold ?? 128,
  });
}

export const printTezPngLabel = printTezImage;

export async function printTezTestText(text: string): Promise<TezPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.printTestText(text);
}

export async function calibrateTez(
  paperType: 'gap' | 'continuous' | 'black' | 'tattoo' | number = 'gap',
): Promise<TezCalibrationResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.calibrate(parsePaperType(paperType));
}

export async function getTezStatus(): Promise<TezStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.getStatus();
}

export async function getTezBatteryLevel(): Promise<number> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.getBatteryLevel();
}
