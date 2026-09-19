/**
 * printer-core / contract
 *
 * The one interface every printer bridge implements. Pure TypeScript — this file
 * must never import a native module, `react-native`, or a brand-specific package.
 * App screens depend on these types and never learn a brand name exists.
 */

export type Transport = 'spp' | 'ble' | 'usb' | 'net';
export type Dialect = 'vector' | 'bitmap' | 'tspl' | 'escpos' | 'cpcl';
export type Media = 'gap' | 'bline' | 'continuous' | 'circle';
export type Platform = 'android' | 'ios';

export interface PrinterCapabilities {
  driverId: string;
  /** Human label for settings screens. Never shown during discovery. */
  displayName: string;
  platforms: Platform[];
  transports: Transport[];
  dialects: Dialect[];
  defaultDialect: Dialect;
  /** true = the dialect persists on the hardware across power cycles (JOSH only). */
  dialectIsDeviceSetting: boolean;
  /** 304 is real, not a typo: the TD-404 head is 304 dpi, not 300. */
  dpi: 203 | 300 | 304;
  headWidthDots: number;
  maxLabelHeightMm: number;
  /** Can the firmware repeat a label itself (`PRINT n,m`)? */
  nativeCopies: boolean;
  statusQuery: boolean;
  /** true = a resolved print means paper physically fed out, not just "bytes written". */
  physicalCompletionCallback: boolean;
  /** 2048 over SPP, <= 500 over BLE. */
  maxChunkBytes: number;
  mediaTypes: Media[];
  /** LABELX `asKey`. */
  requiresLicenseKey: boolean;
}

export interface DiscoveredDevice {
  /** Stable handle for connect(). MAC on Android, peripheral UUID on iOS. */
  id: string;
  name: string | null;
  transport: Transport;
  bonded?: boolean;
  rssi?: number;
  /** Untouched payload from the scan backend, for driver-specific claims(). */
  raw?: Record<string, unknown>;
}

export interface ConnectedDevice {
  id: string;
  name: string | null;
  driverId: string;
  transport: Transport;
  /** Model string used to look up geometry in profiles.json. */
  model?: string;
}

export interface RasterJob {
  /** base64 PNG, ALREADY rasterised at the printer's exact dot size. */
  png: string;
  widthMm: number;
  heightMm: number;
  gapMm: number;
  media: Media;
  copies: number;
  /** Darkness. Normalised 0..15; bridges map onto their SDK's scale. */
  density: number;
  speed: number;
  rotation: 0 | 90 | 180 | 270;
  hOffsetMm?: number;
  vOffsetMm?: number;
  /** Set by the router from the active route. Callers leave this undefined. */
  dialect?: Dialect;
}

export interface Progress {
  /** 0..1 where known, otherwise undefined and only `stage` is meaningful. */
  fraction?: number;
  stage: 'encoding' | 'transferring' | 'printing' | 'done';
  page?: number;
  pages?: number;
}

export interface PrintResult {
  success: boolean;
  copies: number;
  durationMs: number;
  /** true only when the bridge has physical confirmation, not just a completed write. */
  confirmed: boolean;
  raw?: Record<string, unknown>;
}

export interface PrinterStatus {
  ready: boolean;
  noPaper: boolean;
  coverOpen: boolean;
  overheat: boolean;
  lowBattery: boolean;
  busy: boolean;
  labelNotDetected: boolean;
  /** Set when the link itself is gone, as opposed to a printer-reported fault. */
  disconnected?: boolean;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface DeviceDialects {
  supported: Dialect[];
  active: Dialect;
}

/** Vector primitives — the optional JOSH upgrade path. No photos, no custom fonts. */
export type VectorElement =
  | { kind: 'text'; xMm: number; yMm: number; text: string; fontHeightMm: number; bold?: boolean; rotation?: 0 | 90 | 180 | 270 }
  | { kind: 'barcode1d'; xMm: number; yMm: number; data: string; heightMm: number; symbology: string; showText?: boolean }
  | { kind: 'qrcode'; xMm: number; yMm: number; data: string; sizeMm: number }
  | { kind: 'line'; xMm: number; yMm: number; widthMm: number; heightMm: number }
  | { kind: 'box'; xMm: number; yMm: number; widthMm: number; heightMm: number; strokeMm: number };

export interface VectorDoc {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  media: Media;
  copies: number;
  density: number;
  speed: number;
  rotation: 0 | 90 | 180 | 270;
  elements: VectorElement[];
}

export type Unsubscribe = () => void;

export interface PrinterDriver {
  readonly capabilities: PrinterCapabilities;

  /** Discovery filter only. Must be synchronous, cheap, and side-effect free. */
  claims(device: DiscoveredDevice): boolean;

  connect(deviceId: string, name?: string | null): Promise<ConnectedDevice>;
  /** MUST be idempotent and total: release the native handle, do not just drop the reference. */
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getStatus(): Promise<PrinterStatus>;
  getDialects(): Promise<DeviceDialects>;
  setDialect(dialect: Dialect): Promise<void>;
  calibrate?(media: Media): Promise<void>;

  printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult>;
  /** Optional upgrade — implemented only where `capabilities.dialects` includes 'vector'. */
  printVector?(doc: VectorDoc): Promise<PrintResult>;

  onDisconnected(cb: (reason: string) => void): Unsubscribe;
}

/** Thrown when a job outlives the connection it was queued for. */
export class StaleRouteError extends Error {
  readonly expectedEpoch: number;
  readonly currentEpoch: number;

  constructor(expectedEpoch: number, currentEpoch: number) {
    super(
      `Print job was queued for connection epoch ${expectedEpoch}, but the active connection is epoch ${currentEpoch}. The job was discarded rather than sent to the wrong printer.`,
    );
    this.name = 'StaleRouteError';
    this.expectedEpoch = expectedEpoch;
    this.currentEpoch = currentEpoch;
  }
}

export class NoRouteError extends Error {
  constructor() {
    super('No printer is connected.');
    this.name = 'NoRouteError';
  }
}

export class UnknownDriverError extends Error {
  constructor(driverId: string) {
    super(`No driver registered under id "${driverId}".`);
    this.name = 'UnknownDriverError';
  }
}
