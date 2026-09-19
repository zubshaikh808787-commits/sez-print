/**
 * printer-platform — where printer-core meets the device.
 *
 * This is the ONLY place that registers drivers and hands core its native
 * capabilities. App screens import from here (or from `@/printer-core` for types)
 * and never import a brand package directly.
 *
 * Registration is additive and does not disturb the existing printer-manager
 * paths; nothing here runs until `initPrinterPlatform()` is called.
 */
import { Platform } from 'react-native';

import { Discovery, registry, router } from '@/printer-core';
import type { Dialect, KnownDevice, Route, TaggedDevice } from '@/printer-core';
import { devDriver, DEV_DRIVER_ID } from '@/printer-dev';
import { tejasDriver } from '@/printer-tejas';

import { classicScanBackend } from './classic-scan';
import { AsyncStorageDeviceMemory, AsyncStorageQueueStorage } from './storage';

export { AsyncStorageDeviceMemory, AsyncStorageQueueStorage } from './storage';
export { ClassicScanBackend, classicScanBackend } from './classic-scan';

/**
 * Tie-break order when several drivers claim one device, most specific first.
 * The brands with the narrowest, most distinctive name prefixes come first; the
 * generic SPP fallback will go last once it exists.
 */
const CLAIM_SPECIFICITY = ['labelx', 'tejas', 'josh', 'tez', DEV_DRIVER_ID, 'generic-spp'];

export const deviceMemory = new AsyncStorageDeviceMemory();
export const queueStorage = new AsyncStorageQueueStorage();

export const discovery = new Discovery({
  backend: classicScanBackend,
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  memory: deviceMemory,
  specificity: CLAIM_SPECIFICITY,
});

let initialised = false;

/** Idempotent. Safe to call from a layout effect on every mount. */
export function initPrinterPlatform(): void {
  if (initialised) return;
  initialised = true;

  // Bridges register here as they are migrated. Order does not matter —
  // `specificity` decides claim conflicts, not registration order.
  registry.replace(devDriver);
  registry.replace(tejasDriver);
}

export function isPrinterPlatformReady(): boolean {
  return initialised;
}

/**
 * Connect, with the §5 fast path: stop the scan first (RFCOMM is unreliable during
 * inquiry), then open exactly one route, then remember the device so the next
 * connect can skip discovery entirely.
 */
export async function connectPrinter(
  deviceId: string,
  opts: { driverId?: string; name?: string | null; dialect?: Dialect } = {},
): Promise<Route> {
  initPrinterPlatform();

  let driverId = opts.driverId;
  if (!driverId) {
    const known = await deviceMemory.get(deviceId);
    driverId = known?.driverId ?? discovery.list().find((d) => d.id === deviceId)?.driverId;
  }
  if (!driverId) {
    throw new Error('No driver could be matched to this device. Pick the printer type manually.');
  }

  // Always cancel discovery before connecting.
  await discovery.stop();

  const route = await router.open(driverId, deviceId, { name: opts.name, dialect: opts.dialect });

  await discovery.remember({
    deviceId: route.deviceId,
    name: route.deviceName,
    driverId: route.driverId,
    dialect: route.dialect,
  });

  return route;
}

export async function disconnectPrinter(): Promise<void> {
  await router.close('disconnected by user');
}

/** Remembered printers, newest first — the list to offer before scanning. */
export async function knownPrinters(): Promise<KnownDevice[]> {
  initPrinterPlatform();
  return discovery.knownDevices();
}

/** One unified, pre-tagged device list. No brand dropdown. */
export async function scanForPrinters(): Promise<TaggedDevice[]> {
  initPrinterPlatform();
  await discovery.start({ clear: true });
  return discovery.list();
}

export { discovery as printerDiscovery, router as printerRouter };
