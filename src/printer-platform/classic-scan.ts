/**
 * printer-platform / classic-scan
 *
 * THE single Bluetooth Classic scan. Bridges do not scan.
 *
 * It is built on the DEV module's BroadcastReceiver, which despite living in that
 * folder is not brand-filtered: it emits every ACTION_FOUND device and every bonded
 * device, tagging each with `likelyDev` for its own convenience. That makes it a
 * general-purpose classic scanner, so it serves all brands and we avoid running
 * concurrent inquiries — which produce duplicates, missed devices and flaky
 * connects.
 *
 * Per-brand filtering happens in each driver's `claims()`, never here.
 */
import {
  addDevScanListeners,
  getDevBondedDevices,
  startDevScanRaw,
  stopDevScanRaw,
} from 'dev-printer';
import type { DevDiscoveredDevice } from 'dev-printer';

import type { DiscoveredDevice, ScanBackend } from '@/printer-core';

function toDiscovered(device: DevDiscoveredDevice): DiscoveredDevice {
  // `name` is the module's display name and falls back to "Bluetooth <mac>" when
  // the radio gave us nothing. `rawName` is the truth, and claims() must only ever
  // see the truth — otherwise a nameless device could match on its MAC text.
  const raw = device.rawName ?? null;
  return {
    id: device.id,
    name: raw && raw.trim().length > 0 ? raw : null,
    transport: 'spp',
    bonded: device.bonded,
    raw: device as unknown as Record<string, unknown>,
  };
}

export class ClassicScanBackend implements ScanBackend {
  private subscription: { remove: () => void } | undefined;

  async listBonded(): Promise<DiscoveredDevice[]> {
    const bonded = await getDevBondedDevices();
    return bonded.map(toDiscovered);
  }

  async start(onDevice: (device: DiscoveredDevice) => void): Promise<void> {
    this.subscription?.remove();
    this.subscription = addDevScanListeners({
      onDevice: (device) => onDevice(toDiscovered(device)),
    });

    const result = await startDevScanRaw();
    if (!result.discoveryStarted) {
      this.subscription.remove();
      this.subscription = undefined;
      throw new Error(
        result.reason === 'BT_OFF'
          ? 'Bluetooth is off. Turn it on to look for printers.'
          : (result.reason ?? 'Could not start the Bluetooth scan.'),
      );
    }
  }

  /**
   * Always called before a connect. RFCOMM is unreliable while the adapter is in
   * inquiry, which is the single most common cause of a slow or failed connect.
   */
  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = undefined;
    await stopDevScanRaw();
  }
}

export const classicScanBackend = new ClassicScanBackend();
