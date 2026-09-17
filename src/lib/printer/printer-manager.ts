import Constants from 'expo-constants';
import { AppState, type AppStateStatus, NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { PRINT_DPI, mmToDots, printMediaSizeMm } from '@/lib/label-geometry';
import {
  connectWifiPrinter,
  wifiPrintRaw,
  wifiPrintSample,
} from '@/lib/printer/backend-api';
import {
  createPrintSpec,
  DEFAULT_PRINTER_PROFILE,
  PRINTER_PROFILES,
  type PrinterProfile,
} from '@/lib/printer/print-spec';
import {
  BLUETOOTH_OFF_MESSAGE,
  bluetoothOffScanResult,
} from '@/lib/printer/bluetooth-guard';
import { joshEffectiveDpi, joshGapTypeFromMedia } from '@/lib/printer/josh-print';
import {
  isLikelyTezName,
  isLikelyShaktiName,
  isLikelyJoshName,
  isLikelyTd404Name,
  isLikelyDevName,
  isLikelyLabelXName,
  shouldUseTsplCommandSet,
} from '@/lib/printer/printer-heuristics';
import { encodeTscTextSample } from '@/lib/printer/tsc';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { type SeznikPrinterModelId, SEZNIK_PRINTER_MODELS } from '@/constants/printer-models';

export type DiscoveredPrinter = {
  id: string;
  name: string | null;
  rssi: number | null;
  transport?: 'bluetooth-spp' | 'bluetooth-ble' | 'wifi' | 'josh-lpapi' | 'tez-spp' | 'dev-spp' | 'labelx-spp';
  sdkId?: 'td404' | 'josh' | 'tez' | 'dev' | 'labelx' | 'generic';
  likelyTd404?: boolean;
  likelyJosh?: boolean;
  likelyTez?: boolean;
  likelyShakti?: boolean;
  likelyDev?: boolean;
  likelyLabelX?: boolean;
  bonded?: boolean;
};

export type BluetoothCapabilities = {
  platform: typeof Platform.OS;
  isExpoGo: boolean;
  isWeb: boolean;
  classicSppAvailable: boolean;
  bleAvailable: boolean;
  joshAvailable: boolean;
  tezAvailable: boolean;
  devAvailable: boolean;
  labelxAvailable: boolean;
  canScan: boolean;
  bluetoothOn: boolean;
  reason: string | null;
};

/** Connection state machine — prevents invalid transitions & duplicate operations. */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'reconnecting'
  | 'error';

/** Diagnostic info snapshot for the debug screen. */
export type DiagnosticInfo = {
  connectionState: ConnectionState;
  activeTransport: string | null;
  deviceId: string | null;
  deviceName: string | null;
  bleNegotiatedMtu: number;
  bleChunkSize: number;
  bleServiceUuid: string | null;
  bleCharacteristicUuid: string | null;
  bleWriteWithResponse: boolean | null;
  lastPrintTimingMs: PrintTimingEntry[] | null;
  lastError: string | null;
  printQueueLength: number;
  retryCount: number;
};

export type PrintTimingEntry = {
  stage: string;
  durationMs: number;
};

/**
 * Debug print pipeline timer.
 * Collects high-resolution (Date.now) timing around every pipeline stage.
 * Disabled by default in production; enable via `PrintTimingLogger.enabled`.
 */
export class PrintTimingLogger {
  static enabled = __DEV__ ?? false;
  private entries: PrintTimingEntry[] = [];
  private marks = new Map<string, number>();

  start(stage: string): void {
    if (!PrintTimingLogger.enabled) return;
    this.marks.set(stage, Date.now());
  }

  end(stage: string): number {
    if (!PrintTimingLogger.enabled) return 0;
    const startTime = this.marks.get(stage);
    if (startTime == null) return 0;
    const duration = Date.now() - startTime;
    this.entries.push({ stage, durationMs: duration });
    this.marks.delete(stage);
    return duration;
  }

  getEntries(): PrintTimingEntry[] {
    return [...this.entries];
  }

  reset(): void {
    this.entries = [];
    this.marks.clear();
  }

  dump(label = 'PRINT PIPELINE'): void {
    if (!PrintTimingLogger.enabled || this.entries.length === 0) return;
    const total = this.entries.reduce((sum, e) => sum + e.durationMs, 0);
    const lines = this.entries.map(
      (e) => `  [${e.stage}] ${e.durationMs}ms`,
    );
    console.info(
      `\n=== ${label} (${total}ms total) ===\n${lines.join('\n')}\n${'='.repeat(40)}`,
    );
  }
}

const SCAN_TIMEOUT_MS = 8000;
const BLE_SCAN_MS = 2500;
/** Default BLE payload chunk (128 bytes allows fast bursts on standard BLE peripherals). */
const BLE_DEFAULT_CHUNK = 128;
/** Inter-chunk delay in ms. Packet bursting is used so writes complete in < 500ms. */
const BLE_INTER_CHUNK_MS = 1;
const BLE_BURST_INTERVAL = 8;
/** Max write retries: 1 reconnect attempt + 1 retry write. No blind multi-retry. */
const PRINT_MAX_RETRIES = 1;
/** MTU we request from the peripheral. */
const BLE_REQUESTED_MTU = 512;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  if (len === 0) return '';
  const parts: string[] = [];
  const CHUNK_SIZE = 16384; // 16KB text blocks avoid Hermes GC pressure
  let buf = '';
  const mainLen = len - (len % 3);
  for (let i = 0; i < mainLen; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    buf +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      B64_CHARS[chunk & 63];
    if (buf.length >= CHUNK_SIZE) {
      parts.push(buf);
      buf = '';
    }
  }
  const remaining = len - mainLen;
  if (remaining === 1) {
    const chunk = bytes[mainLen];
    buf += B64_CHARS[chunk >> 2] + B64_CHARS[(chunk & 3) << 4] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[mainLen] << 8) | bytes[mainLen + 1];
    buf +=
      B64_CHARS[chunk >> 10] +
      B64_CHARS[(chunk >> 4) & 63] +
      B64_CHARS[(chunk & 15) << 2] +
      '=';
  }
  if (buf.length > 0) parts.push(buf);
  return parts.join('');
}

export {
  isLikelyTezName,
  isLikelyShaktiName,
  isLikelyTd404Name,
  isLikelyJoshName,
  isLikelyDevName,
  isLikelyLabelXName,
  shouldUseTsplCommandSet,
} from './printer-heuristics';

function isExpoGoRuntime(): boolean {
  // appOwnership === 'expo' means Expo Go (not a standalone / dev-client build).
  return Constants.appOwnership === 'expo';
}

type WritableTarget = {
  serviceUUID: string;
  characteristicUUID: string;
  withResponse: boolean;
};

type ActiveTransport = 'td404-spp' | 'ble' | 'wifi' | 'josh-lpapi' | 'tez-spp' | 'dev-spp' | 'labelx-spp' | null;

class PrinterManager {
  private ble: any = null;
  private bleLoadTried = false;
  private bleLoadError: string | null = null;
  private connectedDevice: any = null;
  private writableTarget: WritableTarget | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private scanAbort: (() => void) | null = null;
  private activeTransport: ActiveTransport = null;
  private td404ScanStop: (() => Promise<void>) | null = null;
  private joshScanStop: (() => Promise<void>) | null = null;
  private tezScanStop: (() => Promise<void>) | null = null;
  private devScanStop: (() => Promise<void>) | null = null;
  private labelxScanStop: (() => Promise<void>) | null = null;
  private backendPrinterId: string | null = null;
  private lastScanError: string | null = null;
  /** Negotiated BLE ATT MTU. Payload = mtu - 3. */
  private bleNegotiatedMtu: number = 0;
  /** Serializes print() so batch copies never overlap on the wire. */
  private printChain: Promise<void> = Promise.resolve();
  /** Connection state machine — prevents invalid transitions. */
  private connectionState: ConnectionState = 'disconnected';
  /** Single-flight connect guard: if a connect() is in progress, all callers share this promise. */
  private connectInFlight: Promise<void> | null = null;
  private connectInFlightDeviceId: string | null = null;
  /** Last print timing entries for diagnostics. */
  private lastPrintTiming: PrintTimingEntry[] | null = null;
  /** Last error message for diagnostics. */
  private lastErrorMessage: string | null = null;
  /** Retry count for the last print job. */
  private lastRetryCount: number = 0;
  /** Number of pending jobs in the serial print chain. */
  private printQueueDepth: number = 0;

  get transport(): ActiveTransport {
    return this.activeTransport;
  }

  get isLabelX(): boolean {
    if (this.activeTransport === 'td404-spp' || this.activeTransport === 'josh-lpapi' || this.activeTransport === 'tez-spp' || this.activeTransport === 'dev-spp') return false;
    if (this.activeTransport === 'labelx-spp') return true;
    const store = usePrinterStore.getState();
    const name = store.deviceName ?? store.lastDeviceName;
    if (store.sdkId === 'labelx' || store.transport === 'labelx-spp') {
      return true;
    }
    if (isLikelyLabelXName(name)) {
      return true;
    }
    if (this.activeTransport === null && Boolean(this.getLabelX()?.isLabelXConnected?.())) {
      return true;
    }
    return false;
  }

  get isJosh(): boolean {
    if (this.activeTransport === 'td404-spp' || this.activeTransport === 'tez-spp' || this.activeTransport === 'dev-spp' || this.activeTransport === 'labelx-spp') return false;
    if (this.activeTransport === 'josh-lpapi') return true;
    const store = usePrinterStore.getState();
    if (store.transport === 'bluetooth-spp' || store.sdkId === 'td404' || store.sdkId === 'tez' || store.sdkId === 'dev' || store.sdkId === 'labelx') return false;
    const name = store.deviceName ?? store.lastDeviceName;
    if (isLikelyTd404Name(name) || isLikelyTezName(name) || isLikelyShaktiName(name) || isLikelyDevName(name) || isLikelyLabelXName(name)) return false;
    if (store.sdkId === 'josh' || store.transport === 'josh-lpapi') {
      return true;
    }
    if (this.activeTransport === null && Boolean(this.getJosh()?.isJoshConnected?.())) {
      return true;
    }
    if (isLikelyJoshName(name)) {
      return true;
    }
    return false;
  }

  get isTez(): boolean {
    if (this.activeTransport === 'td404-spp' || this.activeTransport === 'josh-lpapi' || this.activeTransport === 'dev-spp' || this.activeTransport === 'labelx-spp') return false;
    if (this.activeTransport === 'tez-spp') return true;
    const store = usePrinterStore.getState();
    if (store.sdkId === 'tez' || store.transport === 'tez-spp') return true;
    if (this.activeTransport === null && Boolean(this.getTez()?.isTezConnected?.())) return true;
    const name = store.deviceName ?? store.lastDeviceName;
    if (isLikelyTezName(name) || isLikelyShaktiName(name)) return true;
    if (isLikelyTd404Name(name) || isLikelyJoshName(name) || isLikelyDevName(name) || isLikelyLabelXName(name)) return false;
    return false;
  }

  get isDev(): boolean {
    if (this.activeTransport === 'td404-spp' || this.activeTransport === 'josh-lpapi' || this.activeTransport === 'tez-spp' || this.activeTransport === 'labelx-spp') return false;
    if (this.activeTransport === 'dev-spp') return true;
    const store = usePrinterStore.getState();
    if (store.selectedPrinterModel === 'dev' && (store.status === 'connected' || Boolean(this.getDev()?.isDevConnected?.()))) {
      return true;
    }
    const name = store.deviceName ?? store.lastDeviceName;
    if (store.sdkId === 'dev' || store.transport === 'dev-spp') {
      return true;
    }
    if (isLikelyDevName(name)) {
      return true;
    }
    if (store.transport === 'bluetooth-spp' || store.sdkId === 'td404' || store.sdkId === 'josh' || store.sdkId === 'tez' || store.sdkId === 'labelx') return false;
    if (isLikelyTd404Name(name) || isLikelyJoshName(name) || isLikelyTezName(name) || isLikelyShaktiName(name) || isLikelyLabelXName(name)) return false;
    if (this.activeTransport === null && Boolean(this.getDev()?.isDevConnected?.())) {
      return true;
    }
    return false;
  }

  private hasBleNative(): boolean {
    try {
      return Boolean(
        NativeModules.BleClientManager ||
          NativeModules.BleManager ||
          NativeModules.RNBlePlx,
      );
    } catch {
      return false;
    }
  }

  private getBle(): any {
    if (!this.bleLoadTried) {
      this.bleLoadTried = true;
      try {
        // Expo Go ships neither ble-plx nor our TD-404 module — detect early.
        if (!this.hasBleNative()) {
          this.ble = null;
          this.bleLoadError =
            'BLE native module missing (Expo Go / web cannot scan Bluetooth printers).';
          return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BleManager } = require('react-native-ble-plx');
        this.ble = new BleManager();
      } catch (error) {
        this.ble = null;
        this.bleLoadError =
          error instanceof Error ? error.message : 'Failed to initialize BLE manager.';
      }
    }
    return this.ble;
  }

  private getTd404() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('td404-printer') as typeof import('td404-printer');
    } catch {
      return null;
    }
  }

  private getJosh() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('josh-printer') as typeof import('josh-printer');
    } catch {
      return null;
    }
  }

  private getTez() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('tez-printer') as typeof import('tez-printer');
    } catch {
      return null;
    }
  }

  private getDev() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('dev-printer') as typeof import('dev-printer');
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('../../../modules/dev-printer/src/index') as typeof import('dev-printer');
      } catch {
        return null;
      }
    }
  }

  private getLabelX() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('../../../modules/labelx-printer/src/index') as typeof import('../../../modules/labelx-printer/src/index');
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('labelx-printer') as typeof import('../../../modules/labelx-printer/src/index');
      } catch {
        return null;
      }
    }
  }

  getCapabilities(): BluetoothCapabilities {
    const isWeb = Platform.OS === 'web';
    const expoGo = isExpoGoRuntime();
    const td404 = this.getTd404();
    const classicSppAvailable = Boolean(td404?.isTd404NativeAvailable());
    const josh = this.getJosh();
    const joshAvailable = Boolean(josh?.isJoshNativeAvailable());
    const tez = this.getTez();
    const tezAvailable = Boolean(tez?.isTezNativeAvailable());
    const dev = this.getDev();
    const devAvailable = Boolean(dev?.isDevNativeAvailable());
    const labelx = this.getLabelX();
    const labelxAvailable = Boolean(labelx?.isLabelXNativeAvailable());
    const bleAvailable = this.hasBleNative() || this.ble !== null;

    let reason: string | null = null;
    if (isWeb) {
      reason =
        'Bluetooth scan is not available in the browser. Use an Android development build, or connect the printer over Wi‑Fi below.';
    } else if (expoGo && !classicSppAvailable && !bleAvailable && !joshAvailable && !tezAvailable && !devAvailable && !labelxAvailable) {
      reason =
        'You are running Expo Go. Bluetooth printer modules need a development build. Run: npx expo run:android';
    } else if (!classicSppAvailable && !bleAvailable && !joshAvailable && !tezAvailable && !devAvailable && !labelxAvailable) {
      reason =
        this.bleLoadError ||
        'No Bluetooth native modules are linked. Rebuild the app with npx expo run:android.';
    }

    return {
      platform: Platform.OS,
      isExpoGo: expoGo,
      isWeb,
      classicSppAvailable,
      bleAvailable,
      joshAvailable,
      tezAvailable,
      devAvailable,
      labelxAvailable,
      canScan: classicSppAvailable || bleAvailable || joshAvailable || tezAvailable || devAvailable || labelxAvailable,
      bluetoothOn: this.isBluetoothEnabled(),
      reason,
    };
  }

  /**
   * Phone Bluetooth adapter power. Does not start scan, discovery, or connect.
   * When the native helper is missing (older APK), returns true so scan can
   * still run — JS wrappers swallow BT_OFF instead of crashing LogBox.
   */
  isBluetoothEnabled(): boolean {
    if (Platform.OS === 'web') return false;
    try {
      const td404 = this.getTd404();
      const td = td404?.isTd404BluetoothEnabled?.();
      if (typeof td === 'boolean') return td;
    } catch {
      // fall through
    }
    try {
      const josh = this.getJosh();
      const js = josh?.isJoshBluetoothEnabled?.();
      if (typeof js === 'boolean') return js;
    } catch {
      // fall through
    }
    try {
      const tez = this.getTez();
      const tz = tez?.isTezBluetoothEnabled?.();
      if (typeof tz === 'boolean') return tz;
    } catch {
      // fall through
    }
    try {
      const dev = this.getDev();
      const dv = dev?.isDevBluetoothEnabled?.();
      if (typeof dv === 'boolean') return dv;
    } catch {
      // fall through
    }
    try {
      const labelx = this.getLabelX();
      const lx = labelx?.isLabelXBluetoothEnabled?.();
      if (typeof lx === 'boolean') return lx;
    } catch {
      // fall through
    }
    return true;
  }

  get isAvailable(): boolean {
    return this.getCapabilities().canScan;
  }

  get usesTd404CommandSet(): boolean {
    const store = usePrinterStore.getState();
    if (this.isTez || store.sdkId === 'tez' || this.activeTransport === 'tez-spp') {
      return false;
    }
    if (this.isDev || store.sdkId === 'dev' || this.activeTransport === 'dev-spp') {
      return false;
    }
    if (this.isJosh || store.sdkId === 'josh' || this.activeTransport === 'josh-lpapi') {
      return false;
    }
    if (this.isLabelX || store.sdkId === 'labelx' || this.activeTransport === 'labelx-spp') {
      return false;
    }
    return shouldUseTsplCommandSet({
      activeTransport: this.activeTransport,
      storeTransport: store.transport,
      sdkId: store.sdkId,
      deviceName: store.deviceName ?? store.lastDeviceName,
    });
  }

  /**
   * Resolve the PrinterProfile for the currently connected (or last connected) printer.
   * Uses device name heuristics and sdkId to pick the best match from PRINTER_PROFILES.
   */
  getActivePrinterProfile(): PrinterProfile {
    const store = usePrinterStore.getState();
    const settings = useSettingsStore.getState().printing;
    const name = (store.deviceName ?? store.lastDeviceName ?? '').toLowerCase();

    // Label X OEM LuckPrinter (Seznik MiniX / GD985)
    if (
      this.isLabelX ||
      store.sdkId === 'labelx' ||
      this.activeTransport === 'labelx-spp' ||
      isLikelyLabelXName(name)
    ) {
      const dpi = 203; // Standard LuckPrinter / MiniX resolution (8 dots/mm)
      const alignment = settings.printerAlignment ?? 'center';
      const headWidthMm = settings.printheadWidthMm ?? 48;
      const headWidthDots = mmToDots(headWidthMm, dpi);
      return {
        id: 'labelx-spp',
        name: store.deviceName ?? 'Seznik MiniX Label X',
        dpi,
        printheadWidthMm: headWidthMm,
        printheadWidthDots: headWidthDots,
        maxHeightMm: 1000,
        alignment,
        commandLanguage: 'tspl',
      };
    }

    // DEV OEM AutoReplyPrint printer
    if (
      this.isDev ||
      store.selectedPrinterModel === 'dev' ||
      store.sdkId === 'dev' ||
      this.activeTransport === 'dev-spp'
    ) {
      const dpi = 203; // Standard Dev printer resolution (8 dots/mm)
      const alignment = settings.printerAlignment ?? 'center';
      const headWidthMm = 48; // Physical DEV thermal head is 48mm (384 dots at 203 DPI)
      const headWidthDots = mmToDots(headWidthMm, dpi);
      return {
        id: 'dev-spp',
        name: store.deviceName ?? 'SEZNIK DEV',
        dpi,
        printheadWidthMm: headWidthMm,
        printheadWidthDots: headWidthDots,
        maxHeightMm: 1000,
        alignment,
        commandLanguage: 'tspl',
      };
    }

    // TEZ / SHAKTI OEM PrintSDK printer
    if (
      this.isTez ||
      store.sdkId === 'tez' ||
      this.activeTransport === 'tez-spp' ||
      isLikelyTezName(name) ||
      isLikelyShaktiName(name)
    ) {
      const dpi = 203; // Standard Flashlabel OEM resolution (8 dots/mm)
      const alignment = settings.printerAlignment ?? 'center';
      const headWidthMm = settings.printheadWidthMm ?? 108;
      const headWidthDots = mmToDots(headWidthMm, dpi);
      return {
        id: 'tez-spp',
        name: store.deviceName ?? 'TEZ Label Printer',
        dpi,
        printheadWidthMm: headWidthMm,
        printheadWidthDots: headWidthDots,
        maxHeightMm: 1000,
        alignment,
        commandLanguage: 'tspl',
      };
    }

    // JOSH / LPAPI printer
    if (store.sdkId === 'josh' || this.activeTransport === 'josh-lpapi') {
      const dpi = joshEffectiveDpi(settings.printerDpi);
      const alignment = 'center';
      const headWidthMm = settings.printheadWidthMm === 108 ? 50 : (settings.printheadWidthMm ?? 50);
      const headWidthDots = mmToDots(headWidthMm, dpi);
      return {
        id: 'josh-lpapi',
        name: store.deviceName ?? 'JOSH Label Printer',
        dpi,
        printheadWidthMm: headWidthMm,
        printheadWidthDots: headWidthDots,
        maxHeightMm: 1000,
        alignment,
        commandLanguage: 'tspl',
      };
    }

    // Receipt printers (ESC/POS, left-aligned)
    if (!this.usesTd404CommandSet) {
      if (/80mm|80pos|pos80|tsp|tm-t|tm-m/i.test(name)) {
        return PRINTER_PROFILES['receipt-80mm'];
      }
      return PRINTER_PROFILES['receipt-58mm'];
    }

    // TSPL label printers. DPI comes from the selected printer MODEL, not from a
    // global setting: TSPL prints one bitmap dot per head dot, so a stale 304
    // against a real 203 head prints everything 1.5x oversized and clipped (and
    // 203 on a 304 head prints at 0.67x). The model the user explicitly picked
    // on the connect screen is the only reliable source we have — the global
    // `printerDpi` setting leaks across printers and defaults to TD-404's 304.
    // It stays supported, but only as a deliberate per-model override.
    const modelDpi = SEZNIK_PRINTER_MODELS[store.selectedPrinterModel]?.defaultDpi;
    const dpi = settings.printerDpi ?? modelDpi ?? PRINT_DPI;
    const alignment = settings.printerAlignment ?? 'center';
    const headWidthMm = settings.printheadWidthMm ?? 108;
    const headWidthDots = mmToDots(headWidthMm, dpi);

    if (dpi === 304) {
      const base = headWidthMm >= 106 ? PRINTER_PROFILES['td404-304'] : PRINTER_PROFILES['generic-304-4in'];
      return { ...base, alignment };
    }

    if (dpi === 300) {
      const base = PRINTER_PROFILES['generic-300-4in'];
      return { ...base, alignment, printheadWidthMm: headWidthMm, printheadWidthDots: headWidthDots };
    }

    if (dpi === 203) {
      const base = headWidthMm >= 106 ? PRINTER_PROFILES['td404-203'] : PRINTER_PROFILES['generic-203-4in'];
      return { ...base, alignment };
    }

    return {
      id: `custom-${dpi}`,
      name: `Custom Thermal Label Printer (${dpi} DPI)`,
      dpi,
      printheadWidthMm: headWidthMm,
      printheadWidthDots: headWidthDots,
      maxHeightMm: 1000,
      alignment,
      commandLanguage: 'tspl',
    };
  }

  /** Returns the DPI of the active printer profile. */
  getPrintDpi(): number {
    return this.getActivePrinterProfile().dpi;
  }

  getLastScanError(): string | null {
    return this.lastScanError;
  }

  private async ensurePermissions(mode: 'full' | 'connect-only' = 'full'): Promise<void> {
    if (Platform.OS !== 'android') return;
    const api = Platform.Version as number;

    if (api >= 31) {
      const wanted =
        mode === 'connect-only'
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ];
      const results = await PermissionsAndroid.requestMultiple(wanted);
      const connectOk =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED;
      if (!connectOk) {
        throw new Error('Bluetooth Connect permission was denied.');
      }
      if (mode === 'full') {
        const scanOk =
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED;
        if (!scanOk) {
          // Still allow bonded-device listing with CONNECT only.
          console.warn('[printer] BLUETOOTH_SCAN denied — paired list only');
        }
      }
      return;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Location permission (required for Bluetooth scanning) was denied.');
    }
  }

  private async waitForBlePoweredOn(ble: any, timeoutMs = 8000): Promise<void> {
    const state = await ble.state();
    if (state === 'PoweredOn') return;
    if (state === 'Unauthorized') {
      throw new Error('Bluetooth permission is not granted for this app.');
    }
    if (state === 'Unsupported') {
      throw new Error('This device does not support Bluetooth LE.');
    }
    if (state === 'PoweredOff') {
      throw new Error('Bluetooth is turned off. Enable Bluetooth and try again.');
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub?.remove?.();
        reject(new Error(`Bluetooth not ready (state: ${state}). Turn Bluetooth on and retry.`));
      }, timeoutMs);
      const sub = ble.onStateChange((next: string) => {
        if (next === 'PoweredOn') {
          clearTimeout(timer);
          sub?.remove?.();
          resolve();
        } else if (next === 'PoweredOff') {
          clearTimeout(timer);
          sub?.remove?.();
          reject(new Error('Bluetooth is turned off. Enable Bluetooth and try again.'));
        }
      }, true);
    });
  }

  /**
   * Dual discovery: paired classic BT (native) + nearby classic inquiry + BLE nearby.
   * Throws a clear error when the runtime cannot scan (Expo Go / web).
   */
  async startScan(onDevice: (device: DiscoveredPrinter) => void): Promise<{
    paired: number;
    nearby: number;
    errors: string[];
  }> {
    this.lastScanError = null;
    const caps = this.getCapabilities();
    if (!caps.canScan) {
      usePrinterStore.getState().setStatus('disconnected');
      const msg = caps.reason || 'Bluetooth scanning is unavailable.';
      this.lastScanError = msg;
      throw new Error(msg);
    }

    if (!this.isBluetoothEnabled()) {
      usePrinterStore.getState().setStatus('disconnected');
      this.lastScanError = BLUETOOTH_OFF_MESSAGE;
      return bluetoothOffScanResult();
    }

    await this.ensurePermissions('full');
    this.stopScan();
    // If a background connection attempt is in progress, cancel it so discovery is never blocked
    if (this.connectionState === 'connecting' && this.connectInFlight) {
      console.info('[printer] startScan() cancelling in-progress background connection');
      this.connectInFlight = null;
      this.connectInFlightDeviceId = null;
      void this.disconnect().catch(() => {});
    }
    usePrinterStore.getState().setStatus('scanning');

    const td404 = this.getTd404();
    const hasNative = Boolean(td404?.isTd404NativeAvailable());
    const josh = this.getJosh();
    const hasJoshNative = Boolean(josh?.isJoshNativeAvailable());
    const tez = this.getTez();
    const hasTezNative = Boolean(tez?.isTezNativeAvailable());
    const dev = this.getDev();
    const hasDevNative = Boolean(dev?.isDevNativeAvailable());
    const ble = this.getBle();
    const errors: string[] = [];
    const seen = new Set<string>();
    let paired = 0;
    let nearby = 0;

    const emit = (device: DiscoveredPrinter) => {
      const key = device.id.toUpperCase();
      if (seen.has(key)) {
        // Upgrade bonded flag if we see the same MAC again.
        onDevice(device);
        return;
      }
      seen.add(key);
      if (device.bonded) paired += 1;
      else nearby += 1;
      onDevice(device);
    };

    // 1) Paired devices (works even when printer is not discoverable).
    if (hasNative && td404) {
      try {
        await this.ensurePermissions('connect-only');
        const bonded = await td404.getTd404BondedDevices();
        for (const d of bonded) {
          const isLabelX = isLikelyLabelXName(d.name);
          const isJosh = !isLabelX && isLikelyJoshName(d.name);
          const isTd = !isLabelX && isLikelyTd404Name(d.name);
          const isTz = !isLabelX && isLikelyTezName(d.name);
          const isShakti = !isLabelX && isLikelyShaktiName(d.name);
          const isDev = !isLabelX && isLikelyDevName(d.name);
          if (isLabelX) {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'labelx-spp',
              sdkId: 'labelx',
              likelyLabelX: true,
              likelyTd404: false,
              likelyJosh: false,
              likelyDev: false,
              bonded: true,
            });
          } else if (isJosh) {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'josh-lpapi',
              sdkId: 'josh',
              likelyTd404: false,
              likelyJosh: true,
              likelyDev: false,
              bonded: true,
            });
          } else if (isTd) {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'td404',
              likelyTd404: true,
              likelyJosh: false,
              likelyDev: false,
              bonded: true,
            });
          } else if (isTz || isShakti) {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'tez-spp',
              sdkId: 'tez',
              likelyTd404: false,
              likelyJosh: false,
              likelyTez: isTz,
              likelyShakti: isShakti,
              likelyDev: false,
              bonded: true,
            });
          } else if (isDev) {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'dev-spp',
              sdkId: 'dev',
              likelyTd404: false,
              likelyJosh: false,
              likelyDev: true,
              bonded: true,
            });
          } else {
            emit({
              id: d.id,
              name: d.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'generic',
              likelyTd404: false,
              likelyJosh: false,
              likelyDev: false,
              bonded: true,
            });
          }
        }
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Failed to read paired Bluetooth devices.',
        );
      }
    }

    const labelx = this.getLabelX();
    const hasLabelXNative = Boolean(labelx?.isLabelXNativeAvailable());

    // Nearby classic inquiry. Skip BLE when SPP is available — TD-404 / Tez are classic BT.
    await Promise.all([
      hasNative && td404
        ? this.startTd404Scan(td404, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Classic BT scan failed.');
          })
        : Promise.resolve(),
      hasTezNative && tez
        ? this.startTezScan(tez, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'TEZ scan failed.');
          })
        : Promise.resolve(),
      hasJoshNative && josh
        ? this.startJoshScan(josh, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'JOSH scan failed.');
          })
        : Promise.resolve(),
      hasDevNative && dev
        ? this.startDevScan(dev, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'DEV scan failed.');
          })
        : Promise.resolve(),
      hasLabelXNative && labelx
        ? this.startLabelXScan(labelx, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Label X scan failed.');
          })
        : Promise.resolve(),
      !hasNative && ble
        ? this.startBleScan(ble, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'BLE scan failed.');
          })
        : Promise.resolve(),
    ]);

    const store = usePrinterStore.getState();
    if (store.status === 'scanning') {
      store.setStatus(this.isConnected ? 'connected' : 'disconnected');
    }

    if (paired + nearby === 0 && errors.length) {
      this.lastScanError = errors.join(' · ');
    }

    return { paired, nearby, errors };
  }

  /**
   * Dedicated Model-Isolated Scan.
   * Only activates the selected label printer model's native SDK without launching
   * other native drivers concurrently, avoiding RFCOMM socket conflicts and discovery collisions.
   */
  async startModelScan(
    model: SeznikPrinterModelId,
    onDevice: (device: DiscoveredPrinter) => void,
    onFinished?: (error?: Error) => void,
  ): Promise<{ paired: number; nearby: number; errors: string[] }> {
    if (!this.isBluetoothEnabled()) {
      return bluetoothOffScanResult();
    }
    const store = usePrinterStore.getState();
    store.setStatus('scanning');
    this.stopScan();

    const seen = new Set<string>();
    const emit = (d: DiscoveredPrinter) => {
      const key = (d.id || '').toUpperCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      onDevice(d);
    };

    let paired = 0;
    let nearby = 0;
    const errors: string[] = [];

    try {
      await this.ensurePermissions('full');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bluetooth permissions missing';
      errors.push(msg);
      store.setStatus(this.isConnected ? 'connected' : 'disconnected');
      onFinished?.(e instanceof Error ? e : new Error(msg));
      return { paired: 0, nearby: 0, errors };
    }

    if (model === 'td404') {
      const td404 = this.getTd404();
      if (td404?.isTd404NativeAvailable()) {
        try {
          const bonded = await td404.getTd404BondedDevices();
          for (const b of bonded) {
            paired++;
            emit({
              id: b.id,
              name: b.name ?? b.id,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'td404',
              likelyTd404: true,
              bonded: true,
            });
          }
        } catch {}
        try {
          await this.startTd404Scan(td404, (d) => {
            nearby++;
            emit(d);
          });
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'TD-404 scan failed');
        }
      } else {
        errors.push('TD-404 native module not available in this build');
      }
    } else if (model === 'josh') {
      const josh = this.getJosh();
      if (josh?.isJoshNativeAvailable()) {
        try {
          await this.startJoshScan(josh, (d) => {
            nearby++;
            emit(d);
          });
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'JOSH scan failed');
        }
      } else {
        errors.push('JOSH native module not available in this build');
      }
    } else if (model === 'dev') {
      const dev = this.getDev();
      if (dev?.isDevNativeAvailable()) {
        try {
          const bonded = await dev.getDevBondedDevices();
          for (const b of bonded) {
            paired++;
            emit({
              id: b.id,
              name: b.name ?? b.id,
              rssi: null,
              transport: 'dev-spp',
              sdkId: 'dev',
              likelyDev: true,
              bonded: true,
            });
          }
        } catch {}
        try {
          await this.startDevScan(dev, (d) => {
            nearby++;
            emit(d);
          });
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'DEV scan failed');
        }
      } else {
        errors.push('DEV native module not available in this build');
      }
    } else if (model === 'tez') {
      const tez = this.getTez();
      if (tez?.isTezNativeAvailable()) {
        try {
          const bonded = await tez.getTezBondedDevices();
          for (const b of bonded) {
            paired++;
            emit({
              id: b.id,
              name: b.name ?? b.id,
              rssi: null,
              transport: 'tez-spp',
              sdkId: 'tez',
              likelyTez: true,
              bonded: true,
            });
          }
        } catch {}
        try {
          await this.startTezScan(tez, (d) => {
            nearby++;
            emit(d);
          });
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'TEZ scan failed');
        }
      } else {
        errors.push('TEZ native module not available in this build');
      }
    } else if (model === 'labelx') {
      const labelx = this.getLabelX();
      if (labelx?.isLabelXNativeAvailable()) {
        try {
          const bonded = await labelx.getLabelXBondedDevices();
          for (const b of bonded) {
            paired++;
            emit({
              id: b.mac,
              name: b.name ?? b.mac,
              rssi: null,
              transport: 'labelx-spp',
              sdkId: 'labelx',
              likelyLabelX: true,
              bonded: true,
            });
          }
        } catch {}
        try {
          await this.startLabelXScan(labelx, (d) => {
            nearby++;
            emit(d);
          });
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'LABEL X scan failed');
        }
      } else {
        errors.push('LABEL X native module not available in this build');
      }
    }

    if (store.status === 'scanning') {
      store.setStatus(this.isConnected ? 'connected' : 'disconnected');
    }
    onFinished?.();
    return { paired, nearby, errors };
  }

  /**
   * Connect strictly using the selected model's driver after disconnecting any others.
   */
  async connectModel(
    model: SeznikPrinterModelId,
    deviceId: string,
    deviceName?: string | null,
  ): Promise<void> {
    const store = usePrinterStore.getState();
    store.setStatus('connecting');
    this.connectionState = 'connecting';
    this.stopScan();

    // 1. Cleanly disconnect all existing bridges first
    await this.disconnect().catch(() => {});

    await this.ensurePermissions('connect-only');

    try {
      if (model === 'td404') {
        const td404 = this.getTd404();
        if (!td404?.isTd404NativeAvailable()) {
          throw new Error('TD-404 module not available in this build.');
        }
        const res = await td404.connectTd404(deviceId, deviceName ?? 'TEJAS/RUDRA');
        this.activeTransport = 'td404-spp';
        this.connectionState = 'connected';
        store.setConnectedDevice(res.id, res.name ?? deviceName ?? deviceId, {
          transport: 'bluetooth-spp',
          sdkId: 'td404',
          model: 'td404',
        });
      } else if (model === 'josh') {
        const josh = this.getJosh();
        if (!josh?.isJoshNativeAvailable()) {
          throw new Error('JOSH module not available in this build.');
        }
        const res = await josh.connectJosh(deviceId, deviceName ?? 'JOSH');
        this.activeTransport = 'josh-lpapi';
        this.connectionState = 'connected';
        store.setConnectedDevice(res.id, res.name ?? deviceName ?? deviceId, {
          transport: 'josh-lpapi',
          sdkId: 'josh',
          model: 'josh',
        });
      } else if (model === 'dev') {
        const dev = this.getDev();
        if (!dev?.isDevNativeAvailable()) {
          throw new Error('DEV module not available in this build.');
        }
        const res = await dev.connectDev(deviceId, deviceName ?? 'DEV');
        this.activeTransport = 'dev-spp';
        this.connectionState = 'connected';
        store.setConnectedDevice(res.id, res.name ?? deviceName ?? deviceId, {
          transport: 'dev-spp',
          sdkId: 'dev',
          model: 'dev',
        });
      } else if (model === 'tez') {
        const tez = this.getTez();
        if (!tez?.isTezNativeAvailable()) {
          throw new Error('TEZ module not available in this build.');
        }
        const res = await tez.connectTez(deviceId, deviceName ?? 'TEZ');
        this.activeTransport = 'tez-spp';
        this.connectionState = 'connected';
        store.setConnectedDevice(res.id, res.name ?? deviceName ?? deviceId, {
          transport: 'tez-spp',
          sdkId: 'tez',
          model: 'tez',
        });
      } else if (model === 'labelx') {
        const labelx = this.getLabelX();
        if (!labelx?.isLabelXNativeAvailable()) {
          throw new Error('LABEL X module not available in this build.');
        }
        const res = await labelx.connectLabelX(deviceId, deviceName ?? 'LABEL X');
        this.activeTransport = 'labelx-spp';
        this.connectionState = 'connected';
        store.setConnectedDevice(res.mac || deviceId, res.name ?? deviceName ?? deviceId, {
          transport: 'labelx-spp',
          sdkId: 'labelx',
          model: 'labelx',
        });
      }
    } catch (err) {
      this.connectionState = 'disconnected';
      store.clearConnection();
      throw err;
    }
  }

  isModelConnected(model: SeznikPrinterModelId): boolean {
    if (model === 'td404') return Boolean(this.getTd404()?.isTd404Connected());
    if (model === 'josh') return Boolean(this.getJosh()?.isJoshConnected());
    if (model === 'dev') return Boolean(this.getDev()?.isDevConnected());
    if (model === 'tez') return Boolean(this.getTez()?.isTezConnected());
    if (model === 'labelx') return Boolean(this.getLabelX()?.isLabelXConnected());
    return false;
  }

  private startDevScan(
    dev: NonNullable<ReturnType<PrinterManager['getDev']>>,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        void this.devScanStop?.().catch(() => {});
        this.devScanStop = null;
        if (error) reject(error);
        else resolve();
      };

      try {
        const handle = dev.startDevScan(
          (device) => {
            // Full heuristic checks — don't blindly claim non-TD404 devices as DEV
            const isDev = isLikelyDevName(device.name);
            const isJosh = !isDev && isLikelyJoshName(device.name);
            const isTez = !isDev && !isJosh && isLikelyTezName(device.name);
            const isShakti = !isDev && !isJosh && !isTez && isLikelyShaktiName(device.name);
            const isTd = !isDev && !isJosh && !isTez && !isShakti && isLikelyTd404Name(device.name);
            if (isJosh) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'josh-lpapi',
                sdkId: 'josh',
                likelyJosh: true,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTez || isShakti) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'tez-spp',
                sdkId: 'tez',
                likelyTez: isTez,
                likelyShakti: isShakti,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTd) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'bluetooth-spp',
                sdkId: 'td404',
                likelyTd404: true,
                likelyJosh: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isDev) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'dev-spp',
                sdkId: 'dev',
                likelyDev: true,
                likelyTd404: false,
                likelyJosh: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            // Generic / unidentified device — NEVER label as DEV!
            onDevice({
              id: device.id,
              name: device.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'generic',
              likelyDev: false,
              likelyTd404: false,
              likelyJosh: false,
              bonded: device.bonded ?? false,
            });
          },
          (error) => finish(error),
        );
        this.devScanStop = handle.stop;
        setTimeout(() => finish(), SCAN_TIMEOUT_MS);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('DEV scan failed to start.'));
      }
    });
  }

  private startTezScan(
    tez: NonNullable<ReturnType<PrinterManager['getTez']>>,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        void this.tezScanStop?.().catch(() => {});
        this.tezScanStop = null;
        if (error) reject(error);
        else resolve();
      };

      try {
        const handle = tez.startTezScan(
          (device) => {
            // Full heuristic checks — don't blindly claim non-TD404 devices as TEZ
            const isJosh = isLikelyJoshName(device.name);
            const isTd = isLikelyTd404Name(device.name);
            const isDev = isLikelyDevName(device.name);
            const isShakti = isLikelyShaktiName(device.name);
            const isTez = isLikelyTezName(device.name);

            if (isJosh) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'josh-lpapi',
                sdkId: 'josh',
                likelyJosh: true,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTd) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'bluetooth-spp',
                sdkId: 'td404',
                likelyTd404: true,
                likelyJosh: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isDev) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'dev-spp',
                sdkId: 'dev',
                likelyDev: true,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTez || isShakti) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'tez-spp',
                sdkId: 'tez',
                likelyTez: isTez,
                likelyShakti: isShakti,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            // Generic / unidentified device
            onDevice({
              id: device.id,
              name: device.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'generic',
              likelyTd404: false,
              likelyJosh: false,
              likelyDev: false,
              bonded: device.bonded ?? false,
            });
          },
          (error) => finish(error),
        );
        this.tezScanStop = handle.stop;
        setTimeout(() => finish(), SCAN_TIMEOUT_MS);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('TEZ scan failed to start.'));
      }
    });
  }

  private startJoshScan(
    josh: NonNullable<ReturnType<PrinterManager['getJosh']>>,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        void this.joshScanStop?.().catch(() => {});
        this.joshScanStop = null;
        if (error) reject(error);
        else resolve();
      };

      try {
        const handle = josh.startJoshDiscovery(
          (device) => {
            const isDev = isLikelyDevName(device.name);
            const isTez = !isDev && isLikelyTezName(device.name);
            const isShakti = !isDev && !isTez && isLikelyShaktiName(device.name);
            const isTd = isLikelyTd404Name(device.name);
            const isJosh = isLikelyJoshName(device.name);

            if (isDev) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'dev-spp',
                sdkId: 'dev',
                likelyDev: true,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTez || isShakti) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'tez-spp',
                sdkId: 'tez',
                likelyTez: isTez,
                likelyShakti: isShakti,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isTd) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'bluetooth-spp',
                sdkId: 'td404',
                likelyTd404: true,
                likelyJosh: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            if (isJosh) {
              onDevice({
                id: device.id,
                name: device.name,
                rssi: null,
                transport: 'josh-lpapi',
                sdkId: 'josh',
                likelyJosh: true,
                likelyTd404: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            // Generic / unidentified device
            onDevice({
              id: device.id,
              name: device.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'generic',
              likelyTd404: false,
              likelyJosh: false,
              likelyDev: false,
              bonded: device.bonded ?? false,
            });
          },
          (error) => finish(error),
        );
        this.joshScanStop = handle.stop;
        setTimeout(() => finish(), SCAN_TIMEOUT_MS);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('JOSH scan failed to start.'));
      }
    });
  }

  private startLabelXScan(
    labelx: NonNullable<ReturnType<PrinterManager['getLabelX']>>,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        void this.labelxScanStop?.().catch(() => {});
        this.labelxScanStop = null;
        if (error) reject(error);
        else resolve();
      };

      try {
        const handle = labelx.startLabelXScan(
          (device: any) => {
            const isLabelX = isLikelyLabelXName(device.name);
            if (isLabelX) {
              onDevice({
                id: device.mac || (device as any).id,
                name: device.name,
                rssi: null,
                transport: 'labelx-spp',
                sdkId: 'labelx',
                likelyLabelX: true,
                likelyTd404: false,
                likelyJosh: false,
                likelyDev: false,
                bonded: device.bonded ?? false,
              });
              return;
            }
            onDevice({
              id: device.mac || (device as any).id,
              name: device.name,
              rssi: null,
              transport: 'bluetooth-spp',
              sdkId: 'generic',
              likelyLabelX: false,
              likelyTd404: false,
              likelyJosh: false,
              bonded: device.bonded ?? false,
            });
          },
          (error: any) => finish(error),
        );
        this.labelxScanStop = handle.stop;
        setTimeout(() => finish(), SCAN_TIMEOUT_MS);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Label X scan failed to start.'));
      }
    });
  }

  private startTd404Scan(
    td404: NonNullable<ReturnType<PrinterManager['getTd404']>>,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        void this.td404ScanStop?.().catch(() => {});
        this.td404ScanStop = null;
        if (this.scanTimer) {
          clearTimeout(this.scanTimer);
          this.scanTimer = null;
        }
        this.scanAbort = null;
        if (error) reject(error);
        else resolve();
      };

      try {
        const handle = td404.startTd404Scan((device) => {
          onDevice({
            id: device.id,
            name: device.name,
            rssi: null,
            transport: 'bluetooth-spp',
            sdkId: 'td404',
            likelyTd404: device.likelyTd404 ?? isLikelyTd404Name(device.name),
            bonded: device.bonded,
          });
        }, (error) => finish(error));
        this.td404ScanStop = handle.stop;
        this.scanAbort = () => finish();
        this.scanTimer = setTimeout(() => finish(), SCAN_TIMEOUT_MS);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('TD-404 scan failed to start.'));
      }
    });
  }

  private async startBleScan(
    ble: any,
    onDevice: (device: DiscoveredPrinter) => void,
  ): Promise<void> {
    if (!this.isBluetoothEnabled()) {
      return;
    }
    await this.waitForBlePoweredOn(ble);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        try {
          ble.stopDeviceScan();
        } catch {
          // ignore
        }
        if (error) reject(error);
        else resolve();
      };

      try {
        ble.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
          if (error) {
            finish(new Error(error.message ?? 'BLE scan failed.'));
            return;
          }
          if (!device) return;
          const name = device.name ?? device.localName ?? null;
          onDevice({
            id: device.id,
            name: name ?? `BLE ${String(device.id).slice(0, 8)}`,
            rssi: device.rssi ?? null,
            transport: 'bluetooth-ble',
            sdkId: isLikelyTd404Name(name) ? 'td404' : 'generic',
            likelyTd404: isLikelyTd404Name(name),
            bonded: false,
          });
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('BLE scan failed to start.'));
        return;
      }

      setTimeout(() => finish(), BLE_SCAN_MS);
    });
  }

  stopScan(): void {
    this.scanAbort?.();
    this.scanAbort = null;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    void this.td404ScanStop?.().catch(() => {});
    this.td404ScanStop = null;
    void this.joshScanStop?.().catch(() => {});
    this.joshScanStop = null;
    void this.tezScanStop?.().catch(() => {});
    this.tezScanStop = null;
    void this.devScanStop?.().catch(() => {});
    this.devScanStop = null;
    void this.labelxScanStop?.().catch(() => {});
    this.labelxScanStop = null;
    try {
      this.ble?.stopDeviceScan();
    } catch {
      // ignore
    }
  }

  async connect(
    deviceId: string,
    deviceName: string | null,
    transport?: DiscoveredPrinter['transport'],
  ): Promise<void> {
    // Single-flight guard: if a connect to the same device is in progress, share it.
    if (
      this.connectInFlight &&
      this.connectInFlightDeviceId === deviceId &&
      this.connectionState === 'connecting'
    ) {
      console.info('[printer] connect() deduped — sharing existing flight for', deviceId);
      return this.connectInFlight;
    }

    // If a connect is in flight to a DIFFERENT device (e.g. background auto-reconnect),
    // abort/disconnect it immediately so the user's manual selection takes priority!
    if (
      this.connectInFlight &&
      this.connectInFlightDeviceId &&
      this.connectInFlightDeviceId !== deviceId
    ) {
      console.info(
        `[printer] connect() switching target from ${this.connectInFlightDeviceId} to ${deviceId} — cancelling previous flight`,
      );
      this.connectInFlight = null;
      this.connectInFlightDeviceId = null;
      await this.disconnect().catch(() => {});
    }

    // If already connected to this device, no-op.
    if (this.isConnected && usePrinterStore.getState().deviceId === deviceId) {
      console.info('[printer] connect() no-op — already connected to', deviceId);
      return;
    }

    this.connectInFlightDeviceId = deviceId;
    this.connectionState = 'connecting';
    const flight = this.connectInner(deviceId, deviceName, transport);
    this.connectInFlight = flight;

    try {
      await flight;
      this.connectionState = 'connected';
    } catch (error) {
      this.connectionState = 'error';
      throw error;
    } finally {
      if (this.connectInFlight === flight) {
        this.connectInFlight = null;
        this.connectInFlightDeviceId = null;
      }
    }
  }

  private async connectInner(
    deviceId: string,
    deviceName: string | null,
    transport?: DiscoveredPrinter['transport'],
  ): Promise<void> {
    this.stopScan();
    usePrinterStore.getState().setStatus('connecting');
    if (transport !== 'wifi' && !this.isBluetoothEnabled()) {
      usePrinterStore.getState().clearConnection();
      throw new Error(BLUETOOTH_OFF_MESSAGE);
    }
    const connectStart = Date.now();

    // ── Routing diagnostics ──────────────────────────────────────────
    console.info(
      `[CONN-ROUTE] connectInner called: id=${deviceId}, name=${deviceName ?? 'null'}, transport=${transport ?? 'undefined'}`,
    );

    const isTargetLabelX =
      isLikelyLabelXName(deviceName) ||
      (!isLikelyDevName(deviceName) &&
        !isLikelyTezName(deviceName) &&
        !isLikelyTd404Name(deviceName) &&
        !isLikelyJoshName(deviceName) &&
        transport === 'labelx-spp');

    const isTargetJosh =
      !isTargetLabelX &&
      (isLikelyJoshName(deviceName) ||
        (!isLikelyDevName(deviceName) &&
          !isLikelyTezName(deviceName) &&
          !isLikelyTd404Name(deviceName) &&
          transport === 'josh-lpapi'));

    const isTargetTez =
      !isTargetLabelX &&
      !isTargetJosh &&
      (isLikelyTezName(deviceName) ||
        isLikelyShaktiName(deviceName) ||
        (!isLikelyDevName(deviceName) &&
          !isLikelyTd404Name(deviceName) &&
          transport === 'tez-spp'));

    const isTargetTd404 =
      !isTargetLabelX &&
      !isTargetJosh &&
      !isTargetTez &&
      (isLikelyTd404Name(deviceName) ||
        (!isLikelyDevName(deviceName) &&
          (transport === 'bluetooth-spp' || !transport)));

    const isTargetDev =
      !isTargetLabelX &&
      !isTargetJosh &&
      !isTargetTez &&
      !isTargetTd404 &&
      (isLikelyDevName(deviceName) || transport === 'dev-spp');

    console.info(
      `[CONN-ROUTE] isTargetLabelX=${isTargetLabelX}, isTargetTez=${isTargetTez}, isTargetTd404=${isTargetTd404}, isTargetDev=${isTargetDev}, isTargetJosh=${isTargetJosh}, ` +
      `labelxNameMatch=${isLikelyLabelXName(deviceName)}, devNameMatch=${isLikelyDevName(deviceName)}, tezNameMatch=${isLikelyTezName(deviceName) || isLikelyShaktiName(deviceName)}, td404NameMatch=${isLikelyTd404Name(deviceName)}, joshNameMatch=${isLikelyJoshName(deviceName)}`,
    );

    if (isTargetLabelX) {
      const labelx = this.getLabelX();
      const diag = labelx?.getLabelXNativeDiagnostic?.() ?? {
        isLinked: false,
        isAvailable: false,
        reason: 'Label X module failed to load (require error)',
      };
      console.info(
        `[CONN-ROUTE] Label X path: isLinked=${diag.isLinked}, isAvailable=${diag.isAvailable}, reason=${diag.reason ?? 'OK'}`,
      );

      if (!labelx || !diag.isAvailable) {
        const reason = diag.reason ?? 'Label X native module is not available in running APK. Install a development build.';
        console.error(`[CONN-ROUTE] Label X path BLOCKED: ${reason}`);
        usePrinterStore.getState().clearConnection();
        throw new Error(`Label X printer cannot connect: ${reason}`);
      }

      try {
        await this.ensurePermissions('connect-only');
        console.info(
          `[LABELX-CONN] Initiating Label X connection: mac=${deviceId}, name=${deviceName ?? 'unknown'}, transport=${transport ?? 'auto'}`,
        );

        if (labelx.isLabelXConnected()) {
          console.info('[LABELX-CONN] Closing lingering Label X SDK session');
          await labelx.disconnectLabelX().catch(() => {});
        }
        const dev = this.getDev();
        if (dev?.isDevConnected()) {
          await dev.disconnectDev().catch(() => {});
        }
        const tez = this.getTez();
        if (tez?.isTezConnected()) {
          await tez.disconnectTez().catch(() => {});
        }
        const td404 = this.getTd404();
        if (td404?.isTd404Connected()) {
          await td404.disconnectTd404().catch(() => {});
        }
        const josh = this.getJosh();
        if (josh?.isJoshConnected()) {
          await josh.disconnectJosh().catch(() => {});
        }
        if (this.connectedDevice) {
          await this.connectedDevice.cancelConnection().catch(() => {});
          this.connectedDevice = null;
          this.writableTarget = null;
        }

        console.info(`[LABELX-CONN] Submitting Label X connect request → ${deviceId} (${deviceName ?? 'LabelX'})`);
        const result = await labelx.connectLabelX(deviceId, deviceName);
        this.activeTransport = 'labelx-spp';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        this.lastErrorMessage = null;
        console.info(
          `[LABELX-CONN] Label X connected in ${Date.now() - connectStart} ms → ${result.mac} (${result.name ?? deviceName})`,
        );
        usePrinterStore.getState().setConnectedDevice(result.mac, result.name ?? deviceName ?? deviceId, {
          transport: 'labelx-spp',
          sdkId: 'labelx',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn(
          `[LABELX-CONN] Label X connect failed after ${Date.now() - connectStart} ms:`,
          error,
        );
        this.activeTransport = null;
        usePrinterStore.getState().clearConnection();
        const msg = error instanceof Error ? error.message : String(error);
        this.lastErrorMessage = msg;
        throw new Error(`Failed to connect to Label X printer (${msg})`);
      }
    }

    if (isTargetDev) {
      const dev = this.getDev();
      const diag = dev?.getDevNativeDiagnostic?.() ?? {
        isLinked: false,
        isAvailable: false,
        reason: 'DEV module failed to load (require error)',
      };
      console.info(
        `[CONN-ROUTE] DEV path: isLinked=${diag.isLinked}, isAvailable=${diag.isAvailable}, reason=${diag.reason ?? 'OK'}`,
      );

      if (!dev || !diag.isAvailable) {
        const reason = diag.reason ?? 'DEV native module is not available in running APK. Install the newly built app-debug.apk.';
        console.error(`[CONN-ROUTE] DEV path BLOCKED: ${reason}`);
        usePrinterStore.getState().clearConnection();
        throw new Error(`Dev printer cannot connect: ${reason}`);
      }

      try {
        await this.ensurePermissions('connect-only');
        console.info(
          `[DEV-CONN] Initiating DEV connection: mac=${deviceId}, name=${deviceName ?? 'unknown'}, transport=${transport ?? 'auto'}`,
        );

        if (dev.isDevConnected()) {
          console.info('[DEV-CONN] Closing lingering DEV SDK session');
          await dev.disconnectDev().catch(() => {});
        }
        const tez = this.getTez();
        if (tez?.isTezConnected()) {
          console.info('[DEV-CONN] Closing active TEZ session');
          await tez.disconnectTez().catch(() => {});
        }
        const td404 = this.getTd404();
        if (td404?.isTd404Connected()) {
          console.info('[DEV-CONN] Closing active TD-404 SPP socket');
          await td404.disconnectTd404().catch(() => {});
        }
        const josh = this.getJosh();
        if (josh?.isJoshConnected()) {
          console.info('[DEV-CONN] Closing active JOSH LPAPI session');
          await josh.disconnectJosh().catch(() => {});
        }
        if (this.connectedDevice) {
          console.info('[DEV-CONN] Closing active BLE peripheral connection');
          await this.connectedDevice.cancelConnection().catch(() => {});
          this.connectedDevice = null;
          this.writableTarget = null;
        }

        console.info(`[DEV-CONN] Submitting DEV connect request → ${deviceId} (${deviceName ?? 'DEV'})`);
        const result = await dev.connectDev(deviceId, deviceName);
        this.activeTransport = 'dev-spp';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        this.lastErrorMessage = null;
        console.info(
          `[DEV-CONN] DEV connected in ${Date.now() - connectStart} ms → ${result.id} (${result.name ?? deviceName})`,
        );
        usePrinterStore.getState().setConnectedDevice(result.id, result.name ?? deviceName ?? deviceId, {
          transport: 'dev-spp',
          sdkId: 'dev',
          model: 'dev',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn(
          `[DEV-CONN] DEV connect failed after ${Date.now() - connectStart} ms:`,
          error,
        );
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        usePrinterStore.getState().clearConnection();
        throw error instanceof Error ? error : new Error('Failed to connect to Dev printer.');
      }
    }

    if (isTargetTez) {
      const tez = this.getTez();
      const diag = tez?.getTezNativeDiagnostic?.() ?? {
        isLinked: false,
        isAvailable: false,
        reason: 'TEZ module failed to load (require error)',
      };
      console.info(
        `[CONN-ROUTE] TEZ path: isLinked=${diag.isLinked}, isAvailable=${diag.isAvailable}, reason=${diag.reason ?? 'OK'}`,
      );

      if (!tez || !diag.isAvailable) {
        const reason = diag.reason ?? 'Tez native module is missing. Install a new development build.';
        console.warn(`[CONN-ROUTE] TEZ path blocked: ${reason}`);
        usePrinterStore.getState().clearConnection();
        throw new Error(reason);
      }

      try {
        await this.ensurePermissions('connect-only');
        console.info(
          `[TEZ-CONN] Initiating TEZ connection: mac=${deviceId}, name=${deviceName ?? 'unknown'}, transport=${transport ?? 'auto'}`,
        );

        if (tez.isTezConnected()) {
          console.info('[TEZ-CONN] Closing lingering TEZ SDK session');
          await tez.disconnectTez().catch(() => {});
        }
        const dev = this.getDev();
        if (dev?.isDevConnected()) {
          console.info('[TEZ-CONN] Closing active DEV session');
          await dev.disconnectDev().catch(() => {});
        }
        const td404 = this.getTd404();
        if (td404?.isTd404Connected()) {
          console.info('[TEZ-CONN] Closing active TD-404 SPP socket');
          await td404.disconnectTd404().catch(() => {});
        }
        const josh = this.getJosh();
        if (josh?.isJoshConnected()) {
          console.info('[TEZ-CONN] Closing active JOSH LPAPI session');
          await josh.disconnectJosh().catch(() => {});
        }
        if (this.connectedDevice) {
          console.info('[TEZ-CONN] Closing active BLE peripheral connection');
          await this.connectedDevice.cancelConnection().catch(() => {});
          this.connectedDevice = null;
          this.writableTarget = null;
        }

        console.info(`[TEZ-CONN] Submitting TEZ connect request → ${deviceId} (${deviceName ?? 'TEZ'})`);
        const result = await tez.connectTez(deviceId, deviceName);
        this.activeTransport = 'tez-spp';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        this.lastErrorMessage = null;
        console.info(
          `[TEZ-CONN] TEZ connected in ${Date.now() - connectStart} ms → ${result.id} (${result.name ?? deviceName})`,
        );
        usePrinterStore.getState().setConnectedDevice(result.id, result.name ?? deviceName ?? deviceId, {
          transport: 'tez-spp',
          sdkId: 'tez',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn(
          `[TEZ-CONN] TEZ connect failed after ${Date.now() - connectStart} ms:`,
          error,
        );
        const formatted = tez.formatTezConnectError?.(error)
          ?? (error instanceof Error ? error.message : String(error));
        this.lastErrorMessage = formatted;
        usePrinterStore.getState().clearConnection();
        throw new Error(formatted);
      }
    }

    if (isTargetJosh) {
      const josh = this.getJosh();
      const diag = josh?.getJoshNativeDiagnostic?.() ?? {
        isLinked: false,
        isAvailable: false,
        reason: 'JOSH module failed to load (require error)',
      };
      console.info(
        `[CONN-ROUTE] JOSH path: isLinked=${diag.isLinked}, isAvailable=${diag.isAvailable}, reason=${diag.reason ?? 'OK'}`,
      );

      if (!josh || !diag.isAvailable) {
        // JOSH native module is not available — do NOT silently fall through to SPP.
        // JOSH printers cannot process TSPL/ESCPOS over raw SPP.
        const reason = diag.reason ?? 'JOSH native module is not available in running APK. Install the newly built app-debug.apk.';
        console.error(`[CONN-ROUTE] JOSH path BLOCKED: ${reason}`);
        usePrinterStore.getState().clearConnection();
        throw new Error(`JOSH printer cannot connect: ${reason}`);
      }

      try {
        await this.ensurePermissions('connect-only');
        console.info(
          `[JOSH-CONN-P1:IDENTIFY] Initiating JOSH connection: mac=${deviceId}, name=${deviceName ?? 'unknown'}, transport=${transport ?? 'auto'}`,
        );

        // PHASE 2: Clean up any active connections before LPAPI opens RFCOMM
        // Pre-disconnect any lingering JOSH SDK session or in-progress connecting attempt
        console.info('[JOSH-CONN-P2:PREPARE] Ensuring JOSH SDK is idle before opening connection');
        await josh.disconnectJosh().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 150));
        const dev = this.getDev();
        if (dev?.isDevConnected()) {
          console.info('[JOSH-CONN-P2:PREPARE] Closing active DEV session before opening JOSH');
          await dev.disconnectDev().catch(() => {});
        }
        const tez = this.getTez();
        if (tez?.isTezConnected()) {
          console.info('[JOSH-CONN-P2:PREPARE] Closing active TEZ session before opening JOSH');
          await tez.disconnectTez().catch(() => {});
        }
        const td404 = this.getTd404();
        if (td404?.isTd404Connected()) {
          console.info('[JOSH-CONN-P2:PREPARE] Closing active TD-404 SPP socket to free Bluetooth channel for JOSH');
          await td404.disconnectTd404().catch(() => {});
        }
        if (this.connectedDevice) {
          console.info('[JOSH-CONN-P2:PREPARE] Closing active BLE peripheral connection');
          await this.connectedDevice.cancelConnection().catch(() => {});
          this.connectedDevice = null;
          this.writableTarget = null;
        }

        console.info(`[JOSH-CONN-P3:OPEN] Submitting LPAPI connection request → ${deviceId} (${deviceName ?? 'JOSH'})`);
        const result = await josh.connectJosh(deviceId, deviceName);
        this.activeTransport = 'josh-lpapi';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        this.lastErrorMessage = null;
        console.info(
          `[JOSH-CONN-P4:CONFIRMED] JOSH connected in ${Date.now() - connectStart} ms → ${result.id} (${result.name ?? deviceName})`,
        );
        usePrinterStore.getState().setConnectedDevice(result.id, result.name ?? deviceName ?? deviceId, {
          transport: 'josh-lpapi',
          sdkId: 'josh',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn(
          `[JOSH-CONN-P4:FAILED] JOSH connect failed after ${Date.now() - connectStart} ms:`,
          error,
        );
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        // JOSH printers do NOT support raw SPP — never fall back to classic SPP.
        usePrinterStore.getState().clearConnection();
        throw error instanceof Error ? error : new Error('Failed to connect to JOSH printer.');
      }
    }

    // ── Guard: if transport was explicitly josh-lpapi but we reached here, block SPP ──
    if (transport === 'josh-lpapi') {
      console.error('[CONN-ROUTE] transport=josh-lpapi but JOSH path was not taken — blocking SPP fallback');
      usePrinterStore.getState().clearConnection();
      throw new Error('JOSH printer routing failed. The device was identified as JOSH but the JOSH connection path was not entered.');
    }

    const preferSpp =
      transport === 'bluetooth-spp' ||
      (transport !== 'bluetooth-ble' && transport !== 'wifi' && Platform.OS === 'android');
    const td404 = this.getTd404();

    if (preferSpp && td404?.isTd404NativeAvailable()) {
      try {
        await this.ensurePermissions('connect-only');
        const dev = this.getDev();
        if (dev?.isDevConnected()) {
          console.info('[printer] Closing active DEV session before opening SPP');
          await dev.disconnectDev().catch(() => {});
        }
        const tez = this.getTez();
        if (tez?.isTezConnected()) {
          console.info('[printer] Closing active TEZ session before opening SPP');
          await tez.disconnectTez().catch(() => {});
        }
        const josh = this.getJosh();
        if (josh?.isJoshConnected()) {
          console.info('[printer] Closing active JOSH LPAPI session before opening SPP');
          await josh.disconnectJosh().catch(() => {});
        }
        console.info('[printer] SPP connect →', deviceId, deviceName);
        // Native Kotlin module handles its own timeout with proper socket cleanup.
        // A JS-side Promise.race would leave a zombie socket if it fires first.
        const result = await td404.connectTd404(deviceId, deviceName);
        this.activeTransport = 'td404-spp';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        this.lastErrorMessage = null;
        console.info('[printer] SPP connected in', Date.now() - connectStart, 'ms →', result.id);
        usePrinterStore.getState().setConnectedDevice(result.id, result.name ?? deviceId, {
          transport: 'bluetooth-spp',
          sdkId: 'td404',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn('[printer] SPP connect failed after', Date.now() - connectStart, 'ms:', error);
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        if (transport === 'bluetooth-spp' || !this.getBle()) {
          usePrinterStore.getState().clearConnection();
          throw error instanceof Error ? error : new Error('Failed to connect to TD-404 printer.');
        }
      }
    }

    if (transport === 'wifi') {
      throw new Error('Use connectWifi() for Wi‑Fi printers.');
    }

    await this.connectBle(deviceId, deviceName);
  }

  /** Connect by MAC from Android Bluetooth settings (classic SPP). */
  async connectByMac(macAddress: string, name?: string): Promise<void> {
    const mac = macAddress.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      throw new Error('Enter a MAC like AA:BB:CC:DD:EE:FF (from Android Bluetooth settings).');
    }
    const td404 = this.getTd404();
    if (!td404?.isTd404NativeAvailable()) {
      throw new Error(
        'Classic Bluetooth MAC connect needs a development build (`npx expo run:android`). Expo Go cannot open SPP.',
      );
    }
    await this.connect(mac, name ?? mac, 'bluetooth-spp');
  }

  /** Connect specifically to DEV AutoReplyPrint printer by MAC address. */
  async connectDevByMac(macAddress: string, name?: string): Promise<void> {
    const mac = macAddress.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      throw new Error('Enter a MAC like AA:BB:CC:DD:EE:FF (from Android Bluetooth settings).');
    }
    const dev = this.getDev();
    if (!dev?.isDevNativeAvailable()) {
      throw new Error(
        'SEZNIK DEV AutoReplyPrint Bluetooth connect needs a development build (`npx expo run:android`).',
      );
    }
    await this.connect(mac, name ?? 'DEV', 'dev-spp');
  }

  /** Connect specifically to JOSH LPAPI printer by MAC address. */
  async connectJoshByMac(macAddress: string, name?: string): Promise<void> {
    const mac = macAddress.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      throw new Error('Enter a MAC like AA:BB:CC:DD:EE:FF (from Android Bluetooth settings).');
    }
    const josh = this.getJosh();
    if (!josh?.isJoshNativeAvailable()) {
      throw new Error(
        'JOSH LPAPI Bluetooth connect needs a development build (`npx expo run:android`).',
      );
    }
    await this.connect(mac, name ?? 'JOSH', 'josh-lpapi');
  }

  /** Connect specifically to TEZ / SHAKTI OEM PrintSDK printer by MAC address. */
  async connectTezByMac(macAddress: string, name?: string): Promise<void> {
    const mac = macAddress.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      throw new Error('Enter a MAC like AA:BB:CC:DD:EE:FF (from Android Bluetooth settings).');
    }
    const tez = this.getTez();
    if (!tez?.isTezNativeAvailable()) {
      throw new Error(
        'TEZ OEM PrintSDK Bluetooth connect needs a development build (`npx expo run:android`).',
      );
    }
    await this.connect(mac, name ?? 'TEZ', 'tez-spp');
  }

  /** Connect specifically to Label X / LuckPrinter OEM printer by MAC address. */
  async connectLabelXByMac(macAddress: string, name?: string): Promise<void> {
    const mac = macAddress.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      throw new Error('Enter a MAC like AA:BB:CC:DD:EE:FF (from Android Bluetooth settings).');
    }
    const labelx = this.getLabelX();
    if (!labelx?.isLabelXNativeAvailable()) {
      throw new Error(
        'Label X OEM Bluetooth connect needs a development build (`npx expo run:android`).',
      );
    }
    await this.connect(mac, name ?? 'Label X', 'labelx-spp');
  }

  async connectWifi(ip: string, port = 9100, name?: string): Promise<void> {
    this.stopScan();
    usePrinterStore.getState().setStatus('connecting');
    try {
      const printer = await connectWifiPrinter({ ip, port, name });
      this.activeTransport = 'wifi';
      this.backendPrinterId = printer.id;
      this.connectedDevice = null;
      this.writableTarget = null;
      usePrinterStore.getState().setConnectedDevice(printer.id, printer.name || `${ip}:${port}`, {
        transport: 'wifi',
        sdkId: 'td404',
        backendPrinterId: printer.id,
      });
    } catch (error) {
      usePrinterStore.getState().clearConnection();
      throw error instanceof Error ? error : new Error('Wi‑Fi connect failed.');
    }
  }

  private async connectBle(deviceId: string, deviceName: string | null): Promise<void> {
    const ble = this.getBle();
    if (!ble) throw new Error('Bluetooth LE module is not available.');
    const connectStart = Date.now();
    console.info('[printer] BLE connect →', deviceId, deviceName);

    try {
      await this.waitForBlePoweredOn(ble);
      const device = await ble.connectToDevice(deviceId, { timeout: 12000 });

      // Negotiate a larger MTU before service discovery for maximum throughput.
      try {
        const mtuResult = await device.requestMTU(BLE_REQUESTED_MTU);
        this.bleNegotiatedMtu = mtuResult?.mtu ?? 0;
        console.info('[printer] BLE MTU negotiated:', this.bleNegotiatedMtu);
      } catch (mtuErr) {
        this.bleNegotiatedMtu = 0;
        console.warn('[printer] BLE MTU negotiation failed, using default chunk size:', mtuErr);
      }

      await device.discoverAllServicesAndCharacteristics();
      this.writableTarget = await this.findWritableTarget(device);
      if (!this.writableTarget) {
        await device.cancelConnection().catch(() => {});
        throw new Error('This device does not expose a writable printer characteristic.');
      }
      this.connectedDevice = device;
      this.activeTransport = 'ble';
      this.backendPrinterId = null;
      console.info(
        '[printer] BLE connected in', Date.now() - connectStart, 'ms →',
        deviceId, '| MTU:', this.bleNegotiatedMtu,
        '| writeWithResponse:', this.writableTarget.withResponse,
      );

      device.onDisconnected(() => {
        console.info('[printer] BLE disconnected (peripheral-initiated)');
        this.connectedDevice = null;
        this.writableTarget = null;
        this.activeTransport = null;
        this.bleNegotiatedMtu = 0;
        usePrinterStore.getState().clearConnection();
      });

      const name = deviceName ?? device.name ?? deviceId;
      usePrinterStore.getState().setConnectedDevice(deviceId, name, {
        transport: 'bluetooth-ble',
        sdkId: isLikelyTd404Name(name) ? 'td404' : 'generic',
        backendPrinterId: null,
      });
    } catch (error) {
      console.warn('[printer] BLE connect failed after', Date.now() - connectStart, 'ms:', error);
      this.activeTransport = null;
      this.bleNegotiatedMtu = 0;
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
    // Prevent disconnect during active transmission.
    if (this.connectionState === 'printing') {
      console.warn('[printer] disconnect blocked — print in progress');
      return;
    }
    console.info('[printer] disconnect requested, transport:', this.activeTransport);
    if (this.activeTransport === 'labelx-spp') {
      await this.getLabelX()?.disconnectLabelX().catch(() => {});
    }
    if (this.activeTransport === 'dev-spp') {
      await this.getDev()?.disconnectDev().catch(() => {});
    }
    if (this.activeTransport === 'td404-spp') {
      await this.getTd404()?.disconnectTd404();
    }
    if (this.activeTransport === 'tez-spp') {
      await this.getTez()?.disconnectTez();
    }
    if (this.activeTransport === 'josh-lpapi') {
      await this.getJosh()?.disconnectJosh();
    }
    if (this.activeTransport === 'wifi' && this.backendPrinterId) {
      try {
        const { getBackendBaseUrl } = await import('@/lib/printer/backend-api');
        await fetch(`${getBackendBaseUrl()}/api/printers/${this.backendPrinterId}`, {
          method: 'DELETE',
        });
      } catch {
        // ignore
      }
    }
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection().catch(() => {});
      this.connectedDevice = null;
      this.writableTarget = null;
    }
    this.activeTransport = null;
    this.backendPrinterId = null;
    this.bleNegotiatedMtu = 0;
    this.connectionState = 'disconnected';
    usePrinterStore.getState().clearConnection();
  }

  get isConnected(): boolean {
    if (this.activeTransport === 'labelx-spp') {
      return Boolean(this.getLabelX()?.isLabelXConnected());
    }
    if (this.activeTransport === 'dev-spp') {
      return Boolean(this.getDev()?.isDevConnected());
    }
    if (this.activeTransport === 'td404-spp') {
      return Boolean(this.getTd404()?.isTd404Connected());
    }
    if (this.activeTransport === 'tez-spp') {
      return Boolean(this.getTez()?.isTezConnected());
    }
    if (this.activeTransport === 'josh-lpapi') {
      return Boolean(this.getJosh()?.isJoshConnected());
    }
    if (this.activeTransport === 'wifi') {
      return Boolean(this.backendPrinterId);
    }
    return this.connectedDevice !== null && this.writableTarget !== null;
  }

  /** Effective BLE write chunk (bytes per characteristic write). */
  private get bleChunkSize(): number {
    if (this.bleNegotiatedMtu > 3) return this.bleNegotiatedMtu - 3;
    return BLE_DEFAULT_CHUNK;
  }

  /**
   * Lightweight connection health check.
   * Does NOT perform I/O — only validates that the transport handle is still viable.
   * Use this to avoid starting expensive data preparation when the connection is dead.
   */
  isConnectionHealthy(): boolean {
    if (this.activeTransport === 'labelx-spp') {
      return Boolean(this.getLabelX()?.isLabelXConnected());
    }
    if (this.activeTransport === 'dev-spp') {
      return Boolean(this.getDev()?.isDevConnected());
    }
    if (this.activeTransport === 'td404-spp') {
      return Boolean(this.getTd404()?.isTd404Connected());
    }
    if (this.activeTransport === 'tez-spp') {
      return Boolean(this.getTez()?.isTezConnected());
    }
    if (this.activeTransport === 'josh-lpapi') {
      return Boolean(this.getJosh()?.isJoshConnected());
    }
    if (this.activeTransport === 'wifi') {
      return Boolean(this.backendPrinterId);
    }
    if (this.activeTransport === 'ble') {
      return this.connectedDevice !== null && this.writableTarget !== null;
    }
    // activeTransport is null — probe native modules to auto-restore.
    // This avoids a full reconnect cycle (150–1500ms) when the socket is actually alive.
    if (this.getLabelX()?.isLabelXConnected?.()) {
      console.info('[printer] isConnectionHealthy: auto-restoring labelx-spp');
      this.activeTransport = 'labelx-spp';
      return true;
    }
    if (this.getDev()?.isDevConnected?.()) {
      console.info('[printer] isConnectionHealthy: auto-restoring dev-spp');
      this.activeTransport = 'dev-spp';
      return true;
    }
    if (this.getTd404()?.isTd404Connected?.()) {
      console.info('[printer] isConnectionHealthy: auto-restoring td404-spp');
      this.activeTransport = 'td404-spp';
      return true;
    }
    if (this.getTez()?.isTezConnected?.()) {
      console.info('[printer] isConnectionHealthy: auto-restoring tez-spp');
      this.activeTransport = 'tez-spp';
      return true;
    }
    if (this.getJosh()?.isJoshConnected?.()) {
      console.info('[printer] isConnectionHealthy: auto-restoring josh-lpapi');
      this.activeTransport = 'josh-lpapi';
      return true;
    }
    return false;
  }

  /**
   * Ensure the printer is connected before printing.
   * If already connected and healthy, returns immediately (< 1ms).
   * If disconnected, attempts ONE reconnect to the last known device.
   * Returns the connection latency in ms for diagnostics.
   *
   * Call this in parallel with data preparation to overlap connection
   * verification with ViewShot capture.
   */
  async ensureConnected(): Promise<{ alreadyConnected: boolean; reconnectMs: number }> {
    if (this.isConnectionHealthy()) {
      return { alreadyConnected: true, reconnectMs: 0 };
    }

    if (!this.isBluetoothEnabled()) {
      this.connectionState = 'error';
      this.lastErrorMessage = BLUETOOTH_OFF_MESSAGE;
      throw new Error(BLUETOOTH_OFF_MESSAGE);
    }

    // Connection is dead or missing — attempt reconnect.
    const t0 = Date.now();
    console.info('[printer] ensureConnected: connection unhealthy, attempting reconnect');
    this.connectionState = 'reconnecting';
    const reconnected = await this.reconnectLastDevice();
    const elapsed = Date.now() - t0;

    if (!reconnected) {
      this.connectionState = 'error';
      this.lastErrorMessage = 'Printer disconnected. Reconnect failed.';
      throw new Error('Printer disconnected. Reconnect Bluetooth and try again.');
    }

    this.connectionState = 'connected';
    console.info('[printer] ensureConnected: reconnected in', elapsed, 'ms');
    return { alreadyConnected: false, reconnectMs: elapsed };
  }

  /** Tear down a stale TD-404/Josh socket and open the OEM PrintSDK session. */
  private async ensureTezTransport(): Promise<void> {
    const store = usePrinterStore.getState();
    const deviceId = store.deviceId ?? store.lastDeviceId;
    const deviceName = store.deviceName ?? store.lastDeviceName;
    if (!deviceId) {
      throw new Error('No Tez/Shakti printer selected. Connect Seznik/Tez first.');
    }

    const tez = this.getTez();
    if (!tez?.isTezNativeAvailable()) {
      throw new Error('Tez printer module is not available in this build. Install a development client that includes tez-printer.');
    }

    if (this.activeTransport === 'tez-spp' && tez.isTezConnected()) {
      return;
    }

    if (this.activeTransport === 'td404-spp') {
      console.info('[TEZ-CONN] Closing stale TD-404 SPP session before OEM connect');
      await this.getTd404()?.disconnectTd404().catch(() => {});
      this.activeTransport = null;
    }
    if (this.activeTransport === 'josh-lpapi') {
      console.info('[TEZ-CONN] Closing stale JOSH session before OEM connect');
      await this.getJosh()?.disconnectJosh().catch(() => {});
      this.activeTransport = null;
    }

    await this.connect(deviceId, deviceName, 'tez-spp');
  }

  /** Snapshot of internal state for the diagnostics screen. */
  getDiagnostics(): DiagnosticInfo {
    const store = usePrinterStore.getState();
    return {
      connectionState: this.connectionState,
      activeTransport: this.activeTransport,
      deviceId: store.deviceId,
      deviceName: store.deviceName,
      bleNegotiatedMtu: this.bleNegotiatedMtu,
      bleChunkSize: this.bleChunkSize,
      bleServiceUuid: this.writableTarget?.serviceUUID ?? null,
      bleCharacteristicUuid: this.writableTarget?.characteristicUUID ?? null,
      bleWriteWithResponse: this.writableTarget?.withResponse ?? null,
      lastPrintTimingMs: this.lastPrintTiming,
      lastError: this.lastErrorMessage,
      printQueueLength: this.printQueueDepth,
      retryCount: this.lastRetryCount,
    };
  }

  /** Store timing data from the last print for the diagnostics screen. */
  setLastPrintTiming(entries: PrintTimingEntry[]): void {
    this.lastPrintTiming = entries;
  }

  /**
   * Attempt to reconnect to the last known device.
   * Useful when navigating back to the print screen.
   * No-op if already connected or no last device is stored.
   */
  async reconnectLastDevice(): Promise<boolean> {
    if (this.isTez) {
      try {
        await this.ensureTezTransport();
        return true;
      } catch (error) {
        console.warn('[printer] Tez auto-reconnect failed:', error);
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        return false;
      }
    }
    if (this.isConnected) return true;
    const store = usePrinterStore.getState();
    if (!store.lastDeviceId) return false;
    if (!this.isBluetoothEnabled()) {
      this.lastErrorMessage = BLUETOOTH_OFF_MESSAGE;
      return false;
    }
    try {
      const isLabelXDevice =
        store.sdkId === 'labelx' ||
        store.transport === 'labelx-spp' ||
        (Boolean(store.lastDeviceName) && isLikelyLabelXName(store.lastDeviceName));
      const isDevDevice =
        !isLabelXDevice &&
        (store.sdkId === 'dev' ||
          store.transport === 'dev-spp' ||
          (Boolean(store.lastDeviceName) && isLikelyDevName(store.lastDeviceName)));
      const isTezDevice =
        !isLabelXDevice &&
        !isDevDevice &&
        (store.sdkId === 'tez' ||
          store.transport === 'tez-spp' ||
          (Boolean(store.lastDeviceName) &&
            (isLikelyTezName(store.lastDeviceName) || isLikelyShaktiName(store.lastDeviceName))));
      const isTd = !isLabelXDevice && !isDevDevice && !isTezDevice && isLikelyTd404Name(store.lastDeviceName);
      const isTargetJosh =
        !isLabelXDevice &&
        !isTd &&
        !isDevDevice &&
        !isTezDevice &&
        (store.sdkId === 'josh' ||
          store.transport === 'josh-lpapi' ||
          (Boolean(store.lastDeviceName) && isLikelyJoshName(store.lastDeviceName)));

      console.info(
        `[printer] auto-reconnect → ${store.lastDeviceId} ${store.lastDeviceName ?? ''} (isLabelX=${isLabelXDevice}, isDev=${isDevDevice}, isTez=${isTezDevice}, isTargetJosh=${isTargetJosh})`,
      );
      if (isLabelXDevice) {
        console.info(
          `[LABELX-CONN] Auto-reconnect identified Label X printer: ${store.lastDeviceId} (${store.lastDeviceName ?? 'LabelX'})`,
        );
      } else if (isDevDevice) {
        console.info(
          `[DEV-CONN] Auto-reconnect identified DEV printer: ${store.lastDeviceId} (${store.lastDeviceName ?? 'DEV'})`,
        );
      } else if (isTezDevice) {
        console.info(
          `[TEZ-CONN] Auto-reconnect identified TEZ printer: ${store.lastDeviceId} (${store.lastDeviceName ?? 'TEZ'})`,
        );
      } else if (isTargetJosh) {
        console.info(
          `[JOSH-CONN-P1:IDENTIFY] Auto-reconnect identified JOSH printer: ${store.lastDeviceId} (${store.lastDeviceName ?? 'JOSH'})`,
        );
      }
      const transport = isLabelXDevice
        ? 'labelx-spp'
        : isDevDevice
          ? 'dev-spp'
          : isTezDevice
            ? 'tez-spp'
            : isTargetJosh
              ? 'josh-lpapi'
              : (store.transport ?? 'bluetooth-spp');
      // For Wi-Fi, skip — requires explicit IP entry.
      if (transport === 'wifi') return false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Auto-reconnect timeout (6s)')), 6000);
      });
      try {
        await Promise.race([
          this.connect(
            store.lastDeviceId,
            store.lastDeviceName,
            transport as DiscoveredPrinter['transport'],
          ),
          timeoutPromise,
        ]);
        return true;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      console.warn('[printer] auto-reconnect failed:', error);
      this.lastErrorMessage = error instanceof Error ? error.message : String(error);
      usePrinterStore.getState().clearConnection();
      return false;
    }
  }

  async printRawTspl(tspl: string | Uint8Array): Promise<void> {
    if (!this.isConnected) throw new Error('No printer connected. Connect to printer before printing.');
    const bytes = typeof tspl === 'string' ? new TextEncoder().encode(tspl) : tspl;
    await this.print(bytes);
  }

  async printTestLabel(text = 'Sez Print OK'): Promise<void> {
    if (!this.isConnected) throw new Error('No printer connected.');

    if (this.activeTransport === 'labelx-spp' || this.isLabelX) {
      console.info(`[LABELX-PRINT] Test print dispatching via Label X SDK: "${text}"`);
      const labelx = this.getLabelX();
      if (!labelx) throw new Error('Label X module not available.');
      if (!labelx.isLabelXConnected()) {
        console.info('[LABELX-CONN] Printer identified as Label X but session not active. Reconnecting...');
        const store = usePrinterStore.getState();
        await this.connect(store.deviceId ?? store.lastDeviceId!, store.deviceName ?? store.lastDeviceName, 'labelx-spp');
      }
      console.info('[LABELX-PRINT] Submitting test print to Label X hardware...');
      await labelx.printLabelXTestLabel(text);
      console.info('[LABELX-PRINT] Label X test print completed successfully');
      return;
    }

    if (this.activeTransport === 'dev-spp' || this.isDev) {
      console.info(`[DEV-PRINT] Test print dispatching via Dev SDK: "${text}"`);
      const dev = this.getDev();
      if (!dev) throw new Error('Dev module not available.');
      if (!dev.isDevConnected()) {
        console.info('[DEV-CONN] Printer identified as DEV but session not active. Reconnecting...');
        const store = usePrinterStore.getState();
        await this.connect(store.deviceId ?? store.lastDeviceId!, store.deviceName ?? store.lastDeviceName, 'dev-spp');
      }
      const store = usePrinterStore.getState();
      const devMode = store.devCommandSet ?? 'tspl';
      console.info(`[DEV-PRINT] Submitting test print to Dev hardware (mode=${devMode})...`);
      await dev.testDevPrint(devMode);
      console.info('[DEV-PRINT] Dev test print completed successfully');
      return;
    }

    if (this.activeTransport === 'tez-spp' || this.isTez) {
      console.info(`[TEZ-PRINT] Test print dispatching via Tez SDK: "${text}"`);
      await this.ensureTezTransport();
      const tez = this.getTez();
      if (!tez) throw new Error('Tez module not available.');
      console.info('[TEZ-PRINT] Submitting test text to Tez hardware...');
      await tez.printTezTestText(text);
      console.info('[TEZ-PRINT] Tez test print completed successfully');
      return;
    }

    if (this.activeTransport === 'josh-lpapi' || this.isJosh) {
      console.info(`[JOSH-PRINT-P1:PREFLIGHT] Test print dispatching via JOSH LPAPI SDK: "${text}"`);
      const josh = this.getJosh();
      if (!josh) throw new Error('JOSH module not available.');
      if (!josh.isJoshConnected()) {
        console.info('[JOSH-CONN-P2:PREPARE] Printer identified as JOSH but LPAPI session not active. Reconnecting...');
        const store = usePrinterStore.getState();
        await this.connect(store.deviceId ?? store.lastDeviceId!, store.deviceName ?? store.lastDeviceName, 'josh-lpapi');
      }
      console.info('[JOSH-PRINT-P3:SUBMIT] Submitting test text to LPAPI hardware...');
      await josh.printJoshTestText(text);
      console.info('[JOSH-PRINT-P5:FINALIZE] JOSH test print completed successfully');
      return;
    }

    if (this.activeTransport === 'wifi' && this.backendPrinterId) {
      await wifiPrintSample(this.backendPrinterId, { text });
      return;
    }

    if (this.usesTd404CommandSet) {
      await this.print(
        encodeTscTextSample({ text, widthMm: 50, heightMm: 30 }),
      );
      return;
    }

    const parts: number[] = [0x1b, 0x40];
    for (let i = 0; i < text.length; i++) parts.push(text.charCodeAt(i) & 0xff);
    parts.push(0x0a, 0x0a, 0x1d, 0x56, 0x00);
    await this.print(Uint8Array.from(parts));
  }

  /**
   * SDK-style fast print: PNG → native LabelCommand → SPP (no JS rasterize).
   * Same fire-and-forget write semantics as Ninestar sendDataToPrinter(..., false).
   * Returns false when transport/native path is unavailable (caller falls back).
   * Throws if the native path is selected but the write fails.
   */
  async printPngLabelFast(options: {
    pngBase64: string;
    widthMm: number;
    heightMm: number;
    gapMm: number;
    copies?: number;
    density?: number | null;
    speed?: number | null;
    vOffsetMm?: number;
    hOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    orientation?: number;
    dpi?: number;
    threshold?: number;
    dither?: boolean;
  }): Promise<boolean> {
    if (this.activeTransport === 'labelx-spp' || this.isLabelX) {
      return this.printLabelXPngLabelFast(options);
    }
    if (this.activeTransport === 'dev-spp' || this.isDev) {
      return this.printDevPngLabelFast(options);
    }
    if (this.activeTransport === 'tez-spp' || this.isTez) {
      return this.printTezPngLabelFast(options);
    }
    if (this.activeTransport === 'josh-lpapi' || this.isJosh) {
      return this.printJoshPngLabelFast(options);
    }
    if (this.activeTransport !== 'td404-spp' || !this.usesTd404CommandSet) {
      return false;
    }
    const td404 = this.getTd404();
    if (!td404 || typeof td404.printTd404PngLabel !== 'function') {
      return false;
    }

    this.printQueueDepth++;
    const run = this.printChain.then(async () => {
      const store = usePrinterStore.getState();
      store.setStatus('printing');
      this.connectionState = 'printing';
      try {
        await this.ensureConnected();
        const dpi = options.dpi ?? this.getPrintDpi();
        const profile = this.getActivePrinterProfile();
        const spec = createPrintSpec({
          widthMm: options.widthMm,
          heightMm: options.heightMm,
          dpi,
          profile,
          mediaType: options.media ?? 'gap',
          gapMm: options.gapMm,
          calibration: {
            horizontalOffsetMm: options.hOffsetMm ?? 0,
            verticalOffsetMm: options.vOffsetMm ?? 0,
          },
        });
        const t0 = Date.now();
        const result = await td404.printTd404PngLabel({
          pngBase64: options.pngBase64,
          widthMm: spec.widthMm,
          heightMm: spec.heightMm,
          gapMm: spec.gapMm,
          density: options.density ?? 10,
          speed: options.speed ?? 3,
          xDots: spec.xOffsetDots,
          yDots: spec.yOffsetDots,
          copies: Math.max(1, Math.round(options.copies ?? 1)),
          media: options.media ?? 'gap',
          orientation: options.orientation ?? 0,
          dpi: spec.dpi,
          direction: 1,
          threshold: options.threshold ?? 160,
          dither: options.dither ?? false,
        });
        if (!result) {
          // Module present but method missing at runtime (old binary) — signal fallback.
          const err = new Error('NATIVE_PNG_UNAVAILABLE');
          (err as Error & { code?: string }).code = 'NATIVE_PNG_UNAVAILABLE';
          throw err;
        }
        console.info(
          '[printer] SDK fast print done in',
          Date.now() - t0,
          'ms |',
          result,
        );
      } finally {
        const currentStore = usePrinterStore.getState();
        if (currentStore.status === 'printing') {
          currentStore.setStatus(this.isConnected ? 'connected' : 'disconnected');
        }
        this.connectionState = this.isConnected ? 'connected' : 'disconnected';
      }
    });
    this.printChain = run.then(
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
    );
    try {
      await run;
      return true;
    } catch (error) {
      const code = error instanceof Error ? (error as Error & { code?: string }).code : null;
      const msg = error instanceof Error ? error.message : String(error);
      if (code === 'NATIVE_PNG_UNAVAILABLE' || msg.includes('NATIVE_PNG_UNAVAILABLE')) {
        console.warn('[printer] Native printPngLabel missing — falling back to JS raster path');
        return false;
      }
      throw error;
    }
  }

  /**
   * Label X / GD985 OEM SDK fast print: PNG → native LuckPrinter printTag / print via OEM AAR.
   * Direct high-resolution thermal print with hardware flow control and status feedback.
   */
  async printLabelXPngLabelFast(options: {
    pngBase64: string;
    widthMm?: number;
    heightMm?: number;
    gapMm?: number;
    copies?: number;
    density?: number | null;
    speed?: number | null;
    dpi?: number;
    hOffsetMm?: number;
    vOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    paperType?: 'tag' | 'continuous' | 'blacktag';
    threshold?: number;
    dither?: boolean;
  }): Promise<boolean> {
    if (!this.isLabelX) {
      return false;
    }
    this.activeTransport = 'labelx-spp';
    const labelx = this.getLabelX();
    if (!labelx || typeof labelx.printLabelXPngLabel !== 'function') {
      return false;
    }

    this.printQueueDepth++;
    const run = this.printChain.then(async () => {
      const store = usePrinterStore.getState();
      store.setStatus('printing');
      this.connectionState = 'printing';
      try {
        console.info(
          `[LABELX-PRINT] Fast PNG print: ${options.widthMm ?? 48}mm copies=${options.copies ?? 1} density=${options.density ?? 1}`,
        );
        await this.ensureConnected();
        const t0 = Date.now();

        const paperType = options.paperType ?? (
          options.media === 'bline' ? 'blacktag' : (options.media === 'continuous' ? 'continuous' : 'tag')
        );

        const result = await labelx.printLabelXPngLabel({
          pngBase64: options.pngBase64,
          copies: Math.max(1, Math.round(options.copies ?? 1)),
          widthMm: options.widthMm ?? 48,
          widthDots: 384,
          paperType,
          density: options.density !== null && options.density !== undefined ? Math.min(2, Math.max(0, options.density)) : 1,
          threshold: options.threshold ?? 145,
          dither: options.dither ?? true,
        });

        const elapsed = Date.now() - t0;
        console.info(
          `[LABELX-PRINT] Label X print job dispatched in ${elapsed} ms: success=${result.success}`,
        );
        this.lastPrintTiming = [
          { stage: 'labelx-dispatch', durationMs: elapsed },
          { stage: 'total', durationMs: elapsed },
        ];
      } finally {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
        if (this.printQueueDepth === 0) {
          this.connectionState = 'connected';
          store.setStatus('connected');
        }
      }
    });

    this.printChain = run.catch((err) => {
      console.warn('[LABELX-PRINT] Print error caught in serial chain:', err);
    });

    await run;
    return true;
  }

  /**
   * DEV SDK fast print: PNG → native Dev Label print (AutoReplyPrint).
   * Direct bitmap print with 203 DPI, 50x30mm label formatting.
   */
  async printDevPngLabelFast(options: {
    pngBase64: string;
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    copies?: number;
    density?: number | null;
    speed?: number | null;
    orientation?: number;
    dpi?: number;
    hOffsetMm?: number;
    vOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    commandSet?: 'tspl' | 'escpos' | 'auto';
    /** Halftone/photo content only — ordered dither stipples solid shapes and text. */
    dither?: boolean;
    threshold?: number;
  }): Promise<boolean> {
    if (!this.isDev) {
      return false;
    }
    this.activeTransport = 'dev-spp';
    const dev = this.getDev();
    if (!dev || typeof dev.printDevPngLabel !== 'function') {
      return false;
    }

    this.printQueueDepth++;
    const run = this.printChain.then(async () => {
      const store = usePrinterStore.getState();
      store.setStatus('printing');
      this.connectionState = 'printing';
      const profile = this.getActivePrinterProfile();
      try {
        const cmdSet = options.commandSet ?? store.devCommandSet ?? 'tspl';
        console.info(
          `[DEV-PRINT] mm-locked PNG print: ${options.widthMm}x${options.heightMm}mm copies=${options.copies ?? 1} engine=${cmdSet} density=${options.density ?? 14} speed=${options.speed ?? 3} gap=${options.gapMm ?? 2} offset=${options.hOffsetMm ?? 0}x${options.vOffsetMm ?? 0} threshold=${options.threshold ?? 160}`,
        );
        await this.ensureConnected();
        const t0 = Date.now();
        const result = await dev.printDevPngLabel({
          pngBase64: options.pngBase64,
          widthMm: options.widthMm,
          heightMm: options.heightMm,
          copies: Math.max(1, Math.round(options.copies ?? 1)),
          density: options.density ?? 14,
          speed: options.speed ?? 3,
          gapMm: options.gapMm ?? 2,
          media: options.media ?? 'gap',
          commandSet: cmdSet,
          hOffsetMm: options.hOffsetMm ?? 0,
          vOffsetMm: options.vOffsetMm ?? 0,
          printheadWidthMm: profile.printheadWidthMm,
          dither: options.dither ?? false,
          threshold: options.threshold ?? 160,
        });
        console.info(
          `[DEV-PRINT] Dev print completed in ${Date.now() - t0} ms |`,
          result,
        );
      } finally {
        const currentStore = usePrinterStore.getState();
        if (currentStore.status === 'printing') {
          currentStore.setStatus(this.isConnected ? 'connected' : 'disconnected');
        }
        this.connectionState = this.isConnected ? 'connected' : 'disconnected';
      }
    });
    this.printChain = run.then(
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
    );
    try {
      await run;
      return true;
    } catch (error) {
      console.error('[DEV-PRINT] Dev print failed:', error);
      throw error;
    }
  }

  /**
   * JOSH SDK fast print: PNG → LPAPI printBitmap (handled by native module).
   * Direct bitmap print, bypasses TSPL rasterization completely.
   */
  async printJoshPngLabelFast(options: {
    pngBase64: string;
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    copies?: number;
    density?: number | null;
    speed?: number | null;
    orientation?: number;
    dpi?: number;
    hOffsetMm?: number;
    vOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    alignment?: 'left' | 'center';
  }): Promise<boolean> {
    if (!this.isJosh) {
      return false;
    }
    this.activeTransport = 'josh-lpapi';
    const josh = this.getJosh();
    if (!josh || typeof josh.printJoshPngLabel !== 'function') {
      return false;
    }

    this.printQueueDepth++;
    const run = this.printChain.then(async () => {
      const store = usePrinterStore.getState();
      store.setStatus('printing');
      this.connectionState = 'printing';
      try {
        const profile = this.getActivePrinterProfile();
        const dpi = joshEffectiveDpi(options.dpi ?? profile.dpi);
        const gapType = joshGapTypeFromMedia(options.media ?? 'gap');
        const gapLength =
          options.gapMm != null ? Math.max(0, Math.round(options.gapMm)) : 3;
        console.info(
          `[JOSH-PRINT-P1:PREFLIGHT] mm-locked PNG print: ${options.widthMm}x${options.heightMm}mm dpi=${dpi} gapType=${gapType} gap=${gapLength}mm density=${options.density ?? 'auto'} speed=${options.speed ?? 'auto'} offset=${options.hOffsetMm ?? 0}x${options.vOffsetMm ?? 0}`,
        );
        await this.ensureConnected();
        const t0 = Date.now();
        console.info('[JOSH-PRINT-P3:SUBMIT] Submitting label millimetres to LPAPI startJob...');
        const result = await josh.printJoshPngLabel({
          pngBase64: options.pngBase64,
          widthMm: options.widthMm,
          heightMm: options.heightMm,
          copies: Math.max(1, Math.round(options.copies ?? 1)),
          density: options.density != null ? options.density : -1,
          speed: options.speed != null ? options.speed : -1,
          orientation: options.orientation ?? 0,
          gapType,
          gapLength,
          dpi,
          hOffsetMm: options.hOffsetMm ?? 0,
          vOffsetMm: options.vOffsetMm ?? 0,
          alignment: options.alignment ?? profile.alignment,
        });
        console.info(
          `[JOSH-PRINT-P5:FINALIZE] JOSH mm print completed in ${Date.now() - t0} ms |`,
          result,
        );
      } finally {
        const currentStore = usePrinterStore.getState();
        if (currentStore.status === 'printing') {
          currentStore.setStatus(this.isConnected ? 'connected' : 'disconnected');
        }
        this.connectionState = this.isConnected ? 'connected' : 'disconnected';
      }
    });
    this.printChain = run.then(
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
    );
    try {
      await run;
      return true;
    } catch (error) {
      console.error('[JOSH-PRINT-P5:FAILED] JOSH print failed:', error);
      throw error;
    }
  }

  /**
   * TEZ / SHAKTI OEM SDK fast print: PNG -> PrintImgHelper printImg via local PrintSDK.
   * Direct bitmap print, bypasses TSPL rasterization completely.
   */
  async printTezPngLabelFast(options: {
    pngBase64: string;
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    copies?: number;
    density?: number | null;
    speed?: number | null;
    orientation?: number;
    dpi?: number;
    hOffsetMm?: number;
    vOffsetMm?: number;
    media?: 'gap' | 'bline' | 'continuous';
    threshold?: number;
  }): Promise<boolean> {
    if (!this.isTez) {
      throw new Error('Connected printer is not a Tez/Shakti printer.');
    }
    const tez = this.getTez();
    if (!tez || typeof tez.printTezPngLabel !== 'function') {
      throw new Error('Tez printer module is not available in this build.');
    }

    this.printQueueDepth++;
    const run = this.printChain.then(async () => {
      const store = usePrinterStore.getState();
      store.setStatus('printing');
      this.connectionState = 'printing';
      try {
        const paperType = options.media === 'continuous' ? 1 : options.media === 'bline' ? 2 : 0;
        console.info(
          `[TEZ-PRINT] mm-locked PNG print: ${options.widthMm}x${options.heightMm}mm paperType=${paperType} copies=${options.copies ?? 1} density=${options.density ?? 8} speed=${options.speed ?? 4} gapMm=${options.gapMm ?? 'n/a'} offset=${options.hOffsetMm ?? 0}x${options.vOffsetMm ?? 0}`,
        );
        await this.ensureTezTransport();
        const t0 = Date.now();
        const result = await tez.printTezPngLabel({
          pngBase64: options.pngBase64,
          widthMm: options.widthMm,
          heightMm: options.heightMm,
          copies: Math.max(1, Math.round(options.copies ?? 1)),
          density: options.density ?? 8,
          speed: options.speed ?? 4,
          paperType,
          gapMm: options.gapMm,
          hOffsetMm: options.hOffsetMm ?? 0,
          vOffsetMm: options.vOffsetMm ?? 0,
          // Prefer caller threshold; 168 keeps borders/text solid after OEM setImgData.
          threshold: options.threshold ?? 168,
        });
        console.info(
          `[TEZ-PRINT] Tez print completed in ${Date.now() - t0} ms |`,
          result,
        );
      } finally {
        const currentStore = usePrinterStore.getState();
        if (currentStore.status === 'printing') {
          currentStore.setStatus(this.isConnected ? 'connected' : 'disconnected');
        }
        this.connectionState = this.isConnected ? 'connected' : 'disconnected';
      }
    });
    this.printChain = run.then(
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
      () => {
        this.printQueueDepth = Math.max(0, this.printQueueDepth - 1);
      },
    );
    try {
      await run;
      return true;
    } catch (error) {
      console.error('[TEZ-PRINT] Tez print failed:', error);
      throw error;
    }
  }

  async calibrateDev(paperType = 0): Promise<boolean> {
    if (!this.isDev) throw new Error('Connected printer is not a Dev printer.');
    const dev = this.getDev();
    if (!dev) throw new Error('Dev printer module not available.');
    await this.ensureConnected();
    const res = await dev.calibrateDev(paperType);
    return Boolean(res?.success);
  }

  async calibrateTez(paperType = 0): Promise<boolean> {
    if (!this.isTez) throw new Error('Connected printer is not a Tez/Shakti printer.');
    const tez = this.getTez();
    if (!tez) throw new Error('Tez printer module not available.');
    await this.ensureTezTransport();
    const res = await tez.calibrateTez(paperType);
    return Boolean(res?.success);
  }

  async print(bytes: Uint8Array): Promise<void> {
    // Serialize all transports so a second job cannot start while SPP/BLE is
    // still writing — overlapping writes were a source of intermittent garbage
    // / polarity flips on subsequent labels in a batch.
    this.printQueueDepth++;
    const run = this.printChain.then(() => this.printWithRetry(bytes));
    this.printChain = run.then(
      () => { this.printQueueDepth = Math.max(0, this.printQueueDepth - 1); },
      () => { this.printQueueDepth = Math.max(0, this.printQueueDepth - 1); },
    );
    return run;
  }

  /**
   * Event-driven retry: on write failure, check connection → reconnect once
   * if dead → retry immediately (no arbitrary sleep). Avoids blind multi-retry
   * with sleep(500)/sleep(1000) that added 1.5s+ latency on every failure.
   */
  private async printWithRetry(bytes: Uint8Array): Promise<void> {
    const store = usePrinterStore.getState();
    store.setStatus('printing');
    this.connectionState = 'printing';
    this.lastRetryCount = 0;
    try {
      try {
        await this.printUnlocked(bytes);
        return; // success on first attempt
      } catch (firstError) {
        const error = firstError instanceof Error ? firstError : new Error(String(firstError));
        this.lastErrorMessage = error.message;

        // If the connection is still alive, the write itself failed — don't retry
        // (could cause duplicate prints on printers that partially received data).
        if (this.isConnected) {
          console.warn('[printer] write failed but connection alive, not retrying:', error.message);
          throw error;
        }

        // Connection is dead — attempt ONE reconnect, then retry immediately.
        console.warn('[printer] write failed, connection dead. Attempting reconnect:', error.message);
        this.connectionState = 'reconnecting';
        this.lastRetryCount = 1;

        const reconnected = await this.reconnectLastDevice();
        if (!reconnected) {
          console.warn('[printer] reconnect failed, giving up');
          this.lastErrorMessage = 'Printer disconnected during print. Reconnect failed.';
          throw new Error('Printer disconnected during transmission. Reconnect and try again.');
        }

        // Reconnected — retry the write immediately (no sleep).
        console.info('[printer] reconnected, retrying write immediately');
        this.connectionState = 'printing';
        await this.printUnlocked(bytes);
      }
    } finally {
      // Restore previous status (connected) unless the connection dropped.
      const currentStore = usePrinterStore.getState();
      if (currentStore.status === 'printing') {
        currentStore.setStatus(this.isConnected ? 'connected' : 'disconnected');
      }
      this.connectionState = this.isConnected ? 'connected' : 'disconnected';
    }
  }

  private async printUnlocked(bytes: Uint8Array): Promise<void> {
    const writeStart = Date.now();

    if (this.activeTransport === 'dev-spp') {
      throw new Error('DEV printers require bitmap printing via AutoReplyPrint SDK. Please print from the label editor.');
    }

    if (this.activeTransport === 'tez-spp') {
      throw new Error('Tez/Shakti printers require bitmap printing via OEM PrintSDK. Please print from the label editor.');
    }

    if (this.activeTransport === 'josh-lpapi') {
      throw new Error('JOSH printers require bitmap printing via LPAPI SDK. Please print from the label editor.');
    }

    if (this.activeTransport === 'wifi' && this.backendPrinterId) {
      console.info('[printer] Wi-Fi write:', bytes.length, 'bytes');
      await wifiPrintRaw(this.backendPrinterId, bytes);
      console.info('[printer] Wi-Fi write done in', Date.now() - writeStart, 'ms');
      return;
    }

    if (this.activeTransport === 'td404-spp') {
      const td404 = this.getTd404();
      if (!td404?.isTd404Connected()) throw new Error('No printer connected.');
      console.info('[printer] SPP write:', bytes.length, 'bytes');
      if (typeof td404.printTd404Raw === 'function') {
        await td404.printTd404Raw(bytes);
      } else {
        const b64Start = Date.now();
        const b64 = bytesToBase64(bytes);
        console.info('[printer] SPP base64 encoded in', Date.now() - b64Start, 'ms |', b64.length, 'chars');
        await td404.printTd404Base64(b64);
      }
      console.info('[printer] SPP write done in', Date.now() - writeStart, 'ms');
      return;
    }

    if (!this.connectedDevice || !this.writableTarget) {
      throw new Error('No printer connected.');
    }

    // BLE: pre-encode entire payload to base64 once, then slice per chunk.
    // This eliminates N-1 redundant base64 encoding setups in the hot loop.
    const chunkSize = this.bleChunkSize;
    const { serviceUUID, characteristicUUID, withResponse } = this.writableTarget;

    const b64Start = Date.now();
    const fullBase64 = bytesToBase64(bytes);
    const b64Time = Date.now() - b64Start;

    // base64 chunk size: each 3 raw bytes = 4 base64 chars
    const b64ChunkSize = Math.ceil(chunkSize / 3) * 4;
    const totalChunks = Math.ceil(fullBase64.length / b64ChunkSize);
    console.info(
      '[printer] BLE write:', bytes.length, 'bytes |',
      totalChunks, 'chunks @', chunkSize, 'B/chunk |',
      withResponse ? 'withResponse' : 'withoutResponse', '|',
      'base64 pre-encode:', b64Time, 'ms',
    );

    let chunkIndex = 0;
    for (let b64Offset = 0; b64Offset < fullBase64.length; b64Offset += b64ChunkSize) {
      const payload = fullBase64.slice(b64Offset, b64Offset + b64ChunkSize);
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
        chunkIndex++;
        // Micro-pause on burst intervals to prevent buffer backpressure while keeping speed high
        if (chunkIndex % BLE_BURST_INTERVAL === 0 && b64Offset + b64ChunkSize < fullBase64.length) {
          await new Promise<void>((r) => setTimeout(r, BLE_INTER_CHUNK_MS));
        }
      }
    }
    console.info('[printer] BLE write done in', Date.now() - writeStart, 'ms');
  }
}

let manager: PrinterManager | null = null;
let appStateListenerSetup = false;

/**
 * Listen for app state changes to clean up stale BLE connections.
 * Android kills GATT connections in the background; stale handles cause the
 * next print to hang. Proactively disconnect after 30s of backgrounding.
 */
function setupAppStateListener() {
  if (appStateListenerSetup || Platform.OS === 'web') return;
  appStateListenerSetup = true;

  let backgroundedAt: number | null = null;
  const BG_DISCONNECT_MS = 30_000;

  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      backgroundedAt = Date.now();
    } else if (nextState === 'active' && backgroundedAt) {
      const elapsed = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (elapsed > BG_DISCONNECT_MS && manager?.isConnected) {
        console.info('[printer] app was backgrounded for', Math.round(elapsed / 1000), 's — disconnecting stale BLE/SPP');
        void manager.disconnect().catch(() => {});
      }
    }
  });
}

export function getPrinterManager(): PrinterManager {
  if (!manager) {
    manager = new PrinterManager();
    setupAppStateListener();
  }
  return manager;
}
