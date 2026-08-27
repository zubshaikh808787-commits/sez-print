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
