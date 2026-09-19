/**
 * printer-core / discovery
 *
 * ONE radio, ONE scan.
 *
 * Bridges do not scan. Concurrent classic discovery plus BLE scans produce
 * duplicates, missed devices and flaky connects. Each bridge contributes only
 * `claims(device) => boolean`; this module runs the single scan, dedupes, and
 * tags every row with the driver that will handle it.
 *
 * The user sees one device list. No brand dropdown.
 */
import { DiscoveredDevice, Platform, Unsubscribe } from './contract';
import { registry } from './registry';

/**
 * Supplied by the native layer — the one place that touches the adapter.
 * Core never imports it, so this file stays pure TypeScript.
 */
export interface ScanBackend {
  /** Paired devices. Cheap: no radio inquiry, so this is the fast path on reconnect. */
  listBonded(): Promise<DiscoveredDevice[]>;
  /** Begin the single inquiry/BLE scan. Must be idempotent. */
  start(onDevice: (device: DiscoveredDevice) => void): Promise<void>;
  /** Must be safe to call when no scan is running. */
  stop(): Promise<void>;
}

/** Remembered `{mac, name, driverId, dialect}` — the §5 fast-connect cache. */
export interface KnownDevice {
  deviceId: string;
  name: string | null;
  driverId: string;
  dialect?: string;
  model?: string;
  lastConnectedAt: number;
  /** true when the user resolved a claim conflict by hand. Never auto-overwritten. */
  pinnedByUser?: boolean;
}

export interface DeviceMemory {
  get(deviceId: string): Promise<KnownDevice | undefined>;
  set(record: KnownDevice): Promise<void>;
  all(): Promise<KnownDevice[]>;
  remove(deviceId: string): Promise<void>;
}

/** In-memory fallback. The app swaps in an AsyncStorage-backed implementation. */
export class MemoryDeviceMemory implements DeviceMemory {
  private readonly map = new Map<string, KnownDevice>();

  async get(deviceId: string): Promise<KnownDevice | undefined> {
    return this.map.get(deviceId);
  }

  async set(record: KnownDevice): Promise<void> {
    this.map.set(record.deviceId, record);
  }

  async all(): Promise<KnownDevice[]> {
    return [...this.map.values()];
  }

  async remove(deviceId: string): Promise<void> {
    this.map.delete(deviceId);
  }
}

/** One row in the unified device list. */
export interface TaggedDevice extends DiscoveredDevice {
  /** The driver that will handle this device, or undefined when nothing claimed it. */
  driverId?: string;
  /** Every driver that claimed it. Length > 1 means the user may need to choose. */
  candidates: string[];
  /** true when `driverId` came from memory (previous success or user pin). */
  remembered: boolean;
  /** true when more than one driver claimed and the user has not resolved it. */
  ambiguous: boolean;
}

export interface DiscoveryOptions {
  backend: ScanBackend;
  platform: Platform;
  memory?: DeviceMemory;
  /**
   * Tie-break order for a device claimed by several drivers, most specific first.
   * Anything omitted falls back to registration order.
   */
  specificity?: string[];
  /** Cap on the single inquiry. Android classic discovery is ~12 s if left alone. */
  scanTimeoutMs?: number;
}

export type DevicesListener = (devices: TaggedDevice[]) => void;
export type ScanStateListener = (scanning: boolean, error?: Error) => void;

export class Discovery {
  private readonly backend: ScanBackend;
  private readonly platform: Platform;
  private readonly memory: DeviceMemory;
  private readonly specificity: string[];
  private readonly scanTimeoutMs: number;

  private readonly devices = new Map<string, TaggedDevice>();
  private readonly deviceListeners = new Set<DevicesListener>();
  private readonly stateListeners = new Set<ScanStateListener>();
  private scanning = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: DiscoveryOptions) {
    this.backend = options.backend;
    this.platform = options.platform;
    this.memory = options.memory ?? new MemoryDeviceMemory();
    this.specificity = options.specificity ?? [];
    this.scanTimeoutMs = options.scanTimeoutMs ?? 12000;
  }

  get isScanning(): boolean {
    return this.scanning;
  }

  list(): TaggedDevice[] {
    return [...this.devices.values()];
  }

  onDevices(listener: DevicesListener): Unsubscribe {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  onScanState(listener: ScanStateListener): Unsubscribe {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitDevices(): void {
    const snapshot = this.list();
    for (const listener of this.deviceListeners) {
      try {
        listener(snapshot);
      } catch {
        // A listener must never be able to break discovery.
      }
    }
  }

  private emitScanState(error?: Error): void {
    for (const listener of this.stateListeners) {
      try {
        listener(this.scanning, error);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Which drivers claim this device, most specific first.
   * Drivers that cannot run on this platform are excluded, so an iOS user never
   * sees a row that would fail mysteriously on connect.
   */
  private claimants(device: DiscoveredDevice): string[] {
    const claiming = registry
      .forPlatform(this.platform)
      .filter((driver) => {
        try {
          return driver.claims(device);
        } catch {
          return false;
        }
      })
      .map((driver) => driver.capabilities.driverId);

    if (claiming.length < 2) return claiming;

    const order = (id: string) => {
      const explicit = this.specificity.indexOf(id);
      return explicit === -1 ? this.specificity.length + registry.ids().indexOf(id) : explicit;
    };
    return [...claiming].sort((a, b) => order(a) - order(b));
  }

  private async tag(device: DiscoveredDevice): Promise<TaggedDevice> {
    const candidates = this.claimants(device);
    const known = await this.memory.get(device.id);

    // Memory wins: a previous successful connect, or a conflict the user resolved.
    if (known && registry.has(known.driverId)) {
      return { ...device, driverId: known.driverId, candidates, remembered: true, ambiguous: false };
    }

    return {
      ...device,
      driverId: candidates[0],
      candidates,
      remembered: false,
      ambiguous: candidates.length > 1,
    };
  }

  private async ingest(device: DiscoveredDevice): Promise<void> {
    const previous = this.devices.get(device.id);
    const tagged = await this.tag(device);

    // A later sighting usually carries a better name and a fresher RSSI, but a
    // scan result with no name must not erase a name we already had.
    if (previous) {
      tagged.name = device.name ?? previous.name;
      tagged.bonded = device.bonded ?? previous.bonded;
    }

    this.devices.set(device.id, tagged);
    this.emitDevices();
  }

  /** Paired devices only — no inquiry. Call this before start() so the list is never empty. */
  async loadBonded(): Promise<TaggedDevice[]> {
    let bonded: DiscoveredDevice[] = [];
    try {
      bonded = await this.backend.listBonded();
    } catch {
      bonded = [];
    }
    for (const device of bonded) {
      await this.ingest({ ...device, bonded: true });
    }
    return this.list();
  }

  /** Start the one scan. Idempotent: a second call while scanning is a no-op. */
  async start(options: { clear?: boolean } = {}): Promise<void> {
    if (this.scanning) return;
    if (options.clear) this.devices.clear();

    this.scanning = true;
    this.emitScanState();

    await this.loadBonded();

    try {
      await this.backend.start((device) => {
        void this.ingest(device);
      });
    } catch (error) {
      this.scanning = false;
      this.emitScanState(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    this.timer = setTimeout(() => {
      void this.stop();
    }, this.scanTimeoutMs);
  }

  /**
   * Stop the scan. ALWAYS call this before connecting — RFCOMM is unreliable while
   * the adapter is in inquiry (plan §5.2).
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.scanning) return;
    this.scanning = false;
    try {
      await this.backend.stop();
    } catch {
      // ignore
    }
    this.emitScanState();
  }

  /** The user resolved an ambiguous row. Remembered from here on. */
  async assign(deviceId: string, driverId: string): Promise<void> {
    if (!registry.has(driverId)) throw new Error(`No driver registered under id "${driverId}".`);
    const device = this.devices.get(deviceId);
    await this.memory.set({
      deviceId,
      name: device?.name ?? null,
      driverId,
      lastConnectedAt: Date.now(),
      pinnedByUser: true,
    });
    if (device) {
      this.devices.set(deviceId, { ...device, driverId, remembered: true, ambiguous: false });
      this.emitDevices();
    }
  }

  /** Record a successful connect so the next one skips discovery entirely. */
  async remember(record: Omit<KnownDevice, 'lastConnectedAt'>): Promise<void> {
    const existing = await this.memory.get(record.deviceId);
    await this.memory.set({
      ...record,
      pinnedByUser: existing?.pinnedByUser ?? record.pinnedByUser,
      lastConnectedAt: Date.now(),
    });
  }

  /** Forget a device — used when a connect keeps failing against a remembered driver. */
  async forget(deviceId: string): Promise<void> {
    await this.memory.remove(deviceId);
    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.set(deviceId, await this.tag({ ...device }));
      this.emitDevices();
    }
  }

  /** Remembered devices, newest first — the "reconnect without scanning" list. */
  async knownDevices(): Promise<KnownDevice[]> {
    const all = await this.memory.all();
    return all
      .filter((record) => registry.has(record.driverId))
      .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  }
}
