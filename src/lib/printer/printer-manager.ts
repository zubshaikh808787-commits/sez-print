import Constants from 'expo-constants';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import { PRINT_DPI } from '@/lib/label-geometry';
import {
  connectWifiPrinter,
  wifiPrintRaw,
  wifiPrintSample,
} from '@/lib/printer/backend-api';
import {
  DEFAULT_PRINTER_PROFILE,
  PRINTER_PROFILES,
  type PrinterProfile,
} from '@/lib/printer/print-spec';
import { encodeTscTextSample } from '@/lib/printer/tsc';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

export type DiscoveredPrinter = {
  id: string;
  name: string | null;
  rssi: number | null;
  transport?: 'bluetooth-spp' | 'bluetooth-ble' | 'wifi';
  sdkId?: 'td404' | 'generic';
  likelyTd404?: boolean;
  bonded?: boolean;
};

export type BluetoothCapabilities = {
  platform: typeof Platform.OS;
  isExpoGo: boolean;
  isWeb: boolean;
  classicSppAvailable: boolean;
  bleAvailable: boolean;
  canScan: boolean;
  reason: string | null;
};

const SCAN_TIMEOUT_MS = 8000;
const BLE_SCAN_MS = 2500;
/** Default BLE payload chunk (128 bytes allows fast bursts on standard BLE peripherals). */
const BLE_DEFAULT_CHUNK = 128;
/** Inter-chunk delay in ms. Packet bursting is used so writes complete in < 500ms. */
const BLE_INTER_CHUNK_MS = 1;
const BLE_BURST_INTERVAL = 4;
/** MTU we request from the peripheral. */
const BLE_REQUESTED_MTU = 512;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  if (len === 0) return '';

  const CHUNK_SIZE = 0x8000; // 32KB block
  const b64Chunks: string[] = [];
  const mainLen = len - (len % 3);

  let str = '';
  for (let i = 0; i < mainLen; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    str +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      B64_CHARS[chunk & 63];
    if (str.length >= CHUNK_SIZE) {
      b64Chunks.push(str);
      str = '';
    }
  }
  if (str.length > 0) b64Chunks.push(str);

  const remaining = len - mainLen;
  if (remaining === 1) {
    const chunk = bytes[mainLen];
    b64Chunks.push(B64_CHARS[chunk >> 2] + B64_CHARS[(chunk & 3) << 4] + '==');
  } else if (remaining === 2) {
    const chunk = (bytes[mainLen] << 8) | bytes[mainLen + 1];
    b64Chunks.push(
      B64_CHARS[chunk >> 10] +
        B64_CHARS[(chunk >> 4) & 63] +
        B64_CHARS[(chunk & 15) << 2] +
        '=',
    );
  }
  return b64Chunks.join('');
}

export function isLikelyTd404Name(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes('td-404') ||
    n.includes('td404') ||
    n.includes('td 404') ||
    n.includes('ninestar') ||
    n.includes('nsprinter') ||
    n.includes('labelprinter') ||
    n.includes('label printer') ||
    n.includes('tpl') ||
    n.startsWith('btprinter') ||
    n.includes('gp-') ||
    n.includes('printer') ||
    // Common BLE / desktop thermal label printers (TSPL), e.g. "Thermal-3536-BLE".
    n.includes('thermal') ||
    n.includes('label') ||
    n.includes('sticker') ||
    n.includes('barcode') ||
    n.includes('niimbot') ||
    n.includes('phomemo') ||
    n.includes('marklife') ||
    n.includes('zebra') ||
    n.includes('godex') ||
    n.includes('tsc')
  );
}

/** True when this connection should get TSPL label jobs (SIZE/GAP/BITMAP), not ESC/POS receipts. */
export function shouldUseTsplCommandSet(opts: {
  activeTransport: string | null;
  storeTransport: string | null;
  sdkId: string | null;
  deviceName: string | null;
}): boolean {
  if (
    opts.activeTransport === 'td404-spp' ||
    opts.activeTransport === 'wifi' ||
    opts.sdkId === 'td404' ||
    opts.storeTransport === 'bluetooth-spp' ||
    opts.storeTransport === 'wifi'
  ) {
    return true;
  }
  // BLE label printers were incorrectly classified as ESC/POS → continuous overlapping
  // dumps and left clipping. Prefer TSPL whenever the name looks like a label printer.
  if (opts.activeTransport === 'bluetooth-ble' || opts.storeTransport === 'bluetooth-ble') {
    return isLikelyTd404Name(opts.deviceName);
  }
  return false;
}

function isExpoGoRuntime(): boolean {
  // appOwnership === 'expo' means Expo Go (not a standalone / dev-client build).
  return Constants.appOwnership === 'expo';
}

type WritableTarget = {
  serviceUUID: string;
  characteristicUUID: string;
  withResponse: boolean;
};

type ActiveTransport = 'td404-spp' | 'ble' | 'wifi' | null;

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
  private backendPrinterId: string | null = null;
  private lastScanError: string | null = null;
  /** Negotiated BLE ATT MTU. Payload = mtu - 3. */
  private bleNegotiatedMtu: number = 0;
  /** Serializes print() so batch copies never overlap on the wire. */
  private printChain: Promise<void> = Promise.resolve();

  private getBle(): any {
    if (!this.bleLoadTried) {
      this.bleLoadTried = true;
      try {
        // Expo Go ships neither ble-plx nor our TD-404 module — detect early.
        const native =
          NativeModules.BleClientManager ||
          NativeModules.BleManager ||
          NativeModules.RNBlePlx ||
          null;
        if (!native) {
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

  getCapabilities(): BluetoothCapabilities {
    const isWeb = Platform.OS === 'web';
    const expoGo = isExpoGoRuntime();
    const td404 = this.getTd404();
    const classicSppAvailable = Boolean(td404?.isTd404NativeAvailable());
    // Probe BLE (lazy).
    const bleAvailable = this.getBle() !== null;

    let reason: string | null = null;
    if (isWeb) {
      reason =
        'Bluetooth scan is not available in the browser. Use an Android development build, or connect the printer over Wi‑Fi below.';
    } else if (expoGo && !classicSppAvailable && !bleAvailable) {
      reason =
        'You are running Expo Go. TD-404 classic Bluetooth needs a development build. Run: npx expo run:android';
    } else if (!classicSppAvailable && !bleAvailable) {
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
      canScan: classicSppAvailable || bleAvailable,
      reason,
    };
  }

  get isAvailable(): boolean {
    return this.getCapabilities().canScan;
  }

  get usesTd404CommandSet(): boolean {
    const store = usePrinterStore.getState();
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

    // Receipt printers (ESC/POS, left-aligned)
    if (!this.usesTd404CommandSet) {
      if (/80mm|80pos|pos80|tsp|tm-t|tm-m/i.test(name)) {
        return PRINTER_PROFILES['receipt-80mm'];
      }
      return PRINTER_PROFILES['receipt-58mm'];
    }

    // TSPL label printers — resolve from user settings (default 304 DPI / 12 dots/mm)
    const dpi = settings.printerDpi ?? 304;
    const alignment = settings.printerAlignment ?? 'center';
    const headWidthMm = settings.printheadWidthMm ?? 108;
    const headWidthDots = Math.round((headWidthMm * dpi) / 25.4);

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

    await this.ensurePermissions('full');
    this.stopScan();
    usePrinterStore.getState().setStatus('scanning');

    const td404 = this.getTd404();
    const hasNative = Boolean(td404?.isTd404NativeAvailable());
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
          emit({
            id: d.id,
            name: d.name,
            rssi: null,
            transport: 'bluetooth-spp',
            sdkId: 'td404',
            likelyTd404: d.likelyTd404 ?? isLikelyTd404Name(d.name),
            bonded: true,
          });
        }
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Failed to read paired Bluetooth devices.',
        );
      }
    }

    // Nearby classic inquiry. Skip BLE when SPP is available — TD-404 is classic BT.
    await Promise.all([
      hasNative && td404
        ? this.startTd404Scan(td404, emit).catch((err) => {
            errors.push(err instanceof Error ? err.message : 'Classic BT scan failed.');
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
        }, () => finish());
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
    this.stopScan();
    usePrinterStore.getState().setStatus('connecting');
    const connectStart = Date.now();

    const preferSpp =
      transport === 'bluetooth-spp' ||
      (transport !== 'bluetooth-ble' && transport !== 'wifi' && Platform.OS === 'android');
    const td404 = this.getTd404();

    if (preferSpp && td404?.isTd404NativeAvailable()) {
      try {
        await this.ensurePermissions('connect-only');
        console.info('[printer] SPP connect →', deviceId, deviceName);
        // Native Kotlin module handles its own 8s timeout with proper socket cleanup.
        // A JS-side Promise.race would leave a zombie socket if it fires first.
        const result = await td404.connectTd404(deviceId, deviceName);
        this.activeTransport = 'td404-spp';
        this.connectedDevice = null;
        this.writableTarget = null;
        this.backendPrinterId = null;
        this.bleNegotiatedMtu = 0;
        console.info('[printer] SPP connected in', Date.now() - connectStart, 'ms →', result.id);
        usePrinterStore.getState().setConnectedDevice(result.id, result.name ?? deviceId, {
          transport: 'bluetooth-spp',
          sdkId: 'td404',
          backendPrinterId: null,
        });
        return;
      } catch (error) {
        console.warn('[printer] SPP connect failed after', Date.now() - connectStart, 'ms:', error);
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
    console.info('[printer] disconnect requested, transport:', this.activeTransport);
    if (this.activeTransport === 'td404-spp') {
      await this.getTd404()?.disconnectTd404();
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
    usePrinterStore.getState().clearConnection();
  }

  get isConnected(): boolean {
    if (this.activeTransport === 'td404-spp') {
      return Boolean(this.getTd404()?.isTd404Connected());
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
   * Attempt to reconnect to the last known device.
   * Useful when navigating back to the print screen.
   * No-op if already connected or no last device is stored.
   */
  async reconnectLastDevice(): Promise<boolean> {
    if (this.isConnected) return true;
    const store = usePrinterStore.getState();
    if (!store.lastDeviceId) return false;
    try {
      console.info('[printer] auto-reconnect →', store.lastDeviceId, store.lastDeviceName);
      const transport = store.transport ?? undefined;
      // For Wi-Fi, skip — requires explicit IP entry.
      if (transport === 'wifi') return false;
      await this.connect(
        store.lastDeviceId,
        store.lastDeviceName,
        transport as DiscoveredPrinter['transport'],
      );
      return true;
    } catch (error) {
      console.warn('[printer] auto-reconnect failed:', error);
      return false;
    }
  }

  async printTestLabel(text = 'Sez Print OK'): Promise<void> {
    if (!this.isConnected) throw new Error('No printer connected.');

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

  async print(bytes: Uint8Array): Promise<void> {
    // Serialize all transports so a second job cannot start while SPP/BLE is
    // still writing — overlapping writes were a source of intermittent garbage
    // / polarity flips on subsequent labels in a batch.
    const run = this.printChain.then(() => this.printUnlocked(bytes));
    this.printChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async printUnlocked(bytes: Uint8Array): Promise<void> {
    const writeStart = Date.now();

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
      await td404.printTd404Base64(bytesToBase64(bytes));
      console.info('[printer] SPP write done in', Date.now() - writeStart, 'ms');
      return;
    }

    if (!this.connectedDevice || !this.writableTarget) {
      throw new Error('No printer connected.');
    }

    // BLE: use negotiated MTU chunk size with inter-chunk pacing.
    const chunkSize = this.bleChunkSize;
    const { serviceUUID, characteristicUUID, withResponse } = this.writableTarget;
    const totalChunks = Math.ceil(bytes.length / chunkSize);
    console.info(
      '[printer] BLE write:', bytes.length, 'bytes |',
      totalChunks, 'chunks @', chunkSize, 'B/chunk |',
      withResponse ? 'withResponse' : 'withoutResponse',
    );

    let chunkIndex = 0;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
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
        chunkIndex++;
        // Micro-pause only on burst intervals to prevent buffer backpressure while keeping speed high
        if (chunkIndex % BLE_BURST_INTERVAL === 0 && offset + chunkSize < bytes.length) {
          await new Promise<void>((r) => setTimeout(r, BLE_INTER_CHUNK_MS));
        }
      }
    }
    console.info('[printer] BLE write done in', Date.now() - writeStart, 'ms');
  }
}

let manager: PrinterManager | null = null;

export function getPrinterManager(): PrinterManager {
  if (!manager) manager = new PrinterManager();
  return manager;
}
