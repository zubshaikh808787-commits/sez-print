/**
 * printer-platform / storage
 *
 * Persistence for printer-core, which is pure TypeScript and deliberately knows
 * nothing about AsyncStorage.
 *
 * Two separate stores, because they have different lifetimes:
 *  - device memory survives forever (the fast-reconnect cache)
 *  - the queue holds one interrupted batch at a time
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DeviceMemory, KnownDevice, QueueBatch, QueueStorage } from '@/printer-core';

const DEVICES_KEY = 'printer-core/known-devices/v1';
const QUEUE_KEY = 'printer-core/queue/v1';

/**
 * Remembered `{mac, name, driverId, dialect}` per §5.1 — on reconnect we go
 * straight to the device and skip discovery entirely, turning a ~14 s connect
 * into well under 2 s.
 */
export class AsyncStorageDeviceMemory implements DeviceMemory {
  private cache: Record<string, KnownDevice> | undefined;

  private async read(): Promise<Record<string, KnownDevice>> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(DEVICES_KEY);
      this.cache = raw ? (JSON.parse(raw) as Record<string, KnownDevice>) : {};
    } catch {
      // Corrupt or unreadable storage must not brick discovery.
      this.cache = {};
    }
    return this.cache;
  }

  private async write(map: Record<string, KnownDevice>): Promise<void> {
    this.cache = map;
    try {
      await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(map));
    } catch {
      // Losing the cache costs a slow reconnect, not correctness.
    }
  }

  async get(deviceId: string): Promise<KnownDevice | undefined> {
    return (await this.read())[deviceId];
  }

  async set(record: KnownDevice): Promise<void> {
    const map = await this.read();
    await this.write({ ...map, [record.deviceId]: record });
  }

  async all(): Promise<KnownDevice[]> {
    return Object.values(await this.read());
  }

  async remove(deviceId: string): Promise<void> {
    const map = { ...(await this.read()) };
    delete map[deviceId];
    await this.write(map);
  }
}

/**
 * One interrupted batch. Only row data and per-item state are stored — never the
 * rendered rasters — so a 500-label run costs kilobytes and resumes at 301.
 */
export class AsyncStorageQueueStorage implements QueueStorage {
  async load(): Promise<QueueBatch | undefined> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueueBatch) : undefined;
    } catch {
      return undefined;
    }
  }

  async save(batch: QueueBatch): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(batch));
    } catch {
      // A failed persist costs resumability, not the run in progress.
    }
  }

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      // ignore
    }
  }
}
