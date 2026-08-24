import { PermissionsAndroid, Platform } from 'react-native';

import { usePrinterStore } from '@/stores/printer-store';

export type DiscoveredPrinter = {
  id: string;
  name: string | null;
  rssi: number | null;
};

const SCAN_TIMEOUT_MS = 10000;
const WRITE_CHUNK_SIZE = 180;

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

type WritableTarget = {
  serviceUUID: string;
  characteristicUUID: string;
  withResponse: boolean;
};

/**
 * BLE printer manager built on react-native-ble-plx. The native module is loaded
 * lazily so the app still runs in Expo Go (where printing is unavailable).
 */
class PrinterManager {
  private ble: any = null;
  private bleLoadTried = false;
  private connectedDevice: any = null;
  private writableTarget: WritableTarget | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  private getBle(): any {
    if (!this.bleLoadTried) {
      this.bleLoadTried = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BleManager } = require('react-native-ble-plx');
        this.ble = new BleManager();
      } catch {
        this.ble = null;
      }
    }
    return this.ble;
  }

  get isAvailable(): boolean {
    return Platform.OS !== 'web' && this.getBle() !== null;
  }

  private async ensurePermissions(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const api = Platform.Version as number;
    if (api >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const denied = Object.values(results).some(
        (r) => r !== PermissionsAndroid.RESULTS.GRANTED,
      );
      if (denied) throw new Error('Bluetooth permissions were denied.');
    } else {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Location permission (required for Bluetooth scanning) was denied.');
      }
    }
  }

  async startScan(onDevice: (device: DiscoveredPrinter) => void): Promise<void> {
    const ble = this.getBle();
    if (!ble) {
      throw new Error(
        'Bluetooth module is not available. Build the app with `npx expo run:android` or `run:ios` to enable printing.',
      );
    }
    await this.ensurePermissions();
    usePrinterStore.getState().setStatus('scanning');

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        this.stopScan();
        const store = usePrinterStore.getState();
        if (store.status === 'scanning') {
          store.setStatus(this.connectedDevice ? 'connected' : 'disconnected');
        }
        if (error) reject(error);
        else resolve();
      };

      ble.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
        if (error) {
          finish(new Error(error.message ?? 'Bluetooth scan failed.'));
          return;
        }
        if (device && (device.name || device.localName)) {
          onDevice({
            id: device.id,
            name: device.name ?? device.localName ?? null,
            rssi: device.rssi ?? null,
          });
        }
      });

      this.scanTimer = setTimeout(() => finish(), SCAN_TIMEOUT_MS);
    });
  }

  stopScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.ble?.stopDeviceScan();
  }

  async connect(deviceId: string, deviceName: string | null): Promise<void> {
    const ble = this.getBle();
    if (!ble) throw new Error('Bluetooth module is not available.');
    this.stopScan();
    usePrinterStore.getState().setStatus('connecting');

    try {
      const device = await ble.connectToDevice(deviceId, { timeout: 12000 });
      await device.discoverAllServicesAndCharacteristics();
      this.writableTarget = await this.findWritableTarget(device);
      if (!this.writableTarget) {
        await device.cancelConnection().catch(() => {});
        throw new Error('This device does not expose a writable printer characteristic.');
      }
      this.connectedDevice = device;

      device.onDisconnected(() => {
        this.connectedDevice = null;
        this.writableTarget = null;
        usePrinterStore.getState().clearConnection();
      });

      usePrinterStore
        .getState()
        .setConnectedDevice(deviceId, deviceName ?? device.name ?? deviceId);
    } catch (error) {
      usePrinterStore.getState().clearConnection();
      throw error instanceof Error ? error : new Error('Failed to connect to printer.');
    }
  }

  private async findWritableTarget(device: any): Promise<WritableTarget | null> {
    const services = await device.services();
    let fallback: WritableTarget | null = null;
    for (const service of services) {
      const characteristics = await service.characteristics();
      for (const ch of characteristics) {
        if (ch.isWritableWithoutResponse || ch.isWritableWithResponse) {
          const target: WritableTarget = {
            serviceUUID: service.uuid,
            characteristicUUID: ch.uuid,
            withResponse: !ch.isWritableWithoutResponse,
          };
          // Prefer well-known serial/printer service UUIDs.
          const uuid = service.uuid.toLowerCase();
          if (
            uuid.startsWith('0000ff00') ||
            uuid.startsWith('0000ffe0') ||
            uuid.startsWith('0000ae30') ||
            uuid.startsWith('49535343') ||
            uuid.startsWith('0000fee7')
          ) {
            return target;
          }
          if (!fallback) fallback = target;
        }
      }
    }
    return fallback;
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection().catch(() => {});
      this.connectedDevice = null;
      this.writableTarget = null;
    }
    usePrinterStore.getState().clearConnection();
  }

  get isConnected(): boolean {
    return this.connectedDevice !== null && this.writableTarget !== null;
  }

  /** Send raw ESC/POS bytes to the connected printer in BLE-sized chunks. */
  async print(bytes: Uint8Array): Promise<void> {
    if (!this.connectedDevice || !this.writableTarget) {
      throw new Error('No printer connected.');
    }
    const { serviceUUID, characteristicUUID, withResponse } = this.writableTarget;
    for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + WRITE_CHUNK_SIZE);
      const payload = bytesToBase64(chunk);
      if (withResponse) {
        await this.connectedDevice.writeCharacteristicWithResponseForService(
          serviceUUID,
          characteristicUUID,
          payload,
        );
      } else {
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          serviceUUID,
          characteristicUUID,
          payload,
        );
        // Small pacing delay so slow printers don't drop unacknowledged packets.
        await new Promise((r) => setTimeout(r, 12));
      }
    }
  }
}

let manager: PrinterManager | null = null;

export function getPrinterManager(): PrinterManager {
  if (!manager) manager = new PrinterManager();
  return manager;
}
