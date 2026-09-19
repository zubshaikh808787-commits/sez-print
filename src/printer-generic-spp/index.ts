/**
 * printer-generic-spp — Generic Bluetooth Classic SPP Fallback Bridge.
 *
 * A safety net driver for unbranded or standard thermal label printers communicating
 * via standard Bluetooth Serial Port Profile (RFCOMM). Supports both TSPL and ESC/POS dialects.
 *
 * This driver acts as the universal fallback: claims() returns true with the lowest
 * specificity ranking so any unmatched device can still be connected and printed to.
 */
import {
  connectVardrz,
  disconnectVardrz,
  isVardrzConnected,
  printVardrzPic,
  printVardrzTscLabel,
} from '@/lib/printer/vardrz-printer';

import {
  ConnectedDevice,
  DeviceDialects,
  Dialect,
  DiscoveredDevice,
  Media,
  PrintResult,
  PrinterCapabilities,
  PrinterDriver,
  PrinterStatus,
  Progress,
  RasterJob,
  Unsubscribe,
} from '@/printer-core';
import { makeStatus, resolveProfile } from '@/printer-core';

export const GENERIC_SPP_DRIVER_ID = 'generic-spp';

export class GenericSppDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: GENERIC_SPP_DRIVER_ID,
    displayName: 'Generic Thermal (SPP)',
    platforms: ['android'],
    transports: ['spp'],
    dialects: ['tspl', 'escpos'],
    defaultDialect: 'tspl',
    dialectIsDeviceSetting: false,
    dpi: 203,
    headWidthDots: 384,
    maxLabelHeightMm: 1000,
    nativeCopies: false,
    statusQuery: false,
    physicalCompletionCallback: false,
    maxChunkBytes: 2048,
    mediaTypes: ['gap', 'continuous'],
    requiresLicenseKey: false,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'tspl';
  private readonly disconnectListeners = new Set<(reason: string) => void>();

  /** Fallback claim: accepts any device, ranked lowest in discovery specificity. */
  claims(_device: DiscoveredDevice): boolean {
    return true;
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    await connectVardrz(deviceId);
    const resolvedName = name ?? 'Generic SPP Printer';
    const profile = resolveProfile(GENERIC_SPP_DRIVER_ID, resolvedName);

    this.device = {
      id: deviceId,
      name: resolvedName,
      driverId: GENERIC_SPP_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    return this.device;
  }

  async disconnect(): Promise<void> {
    const dev = this.device;
    this.device = undefined;
    if (dev) {
      await disconnectVardrz(dev.id).catch(() => {});
    } else {
      await disconnectVardrz().catch(() => {});
    }
  }

  isConnected(): boolean {
    return Boolean(this.device);
  }

  async getStatus(): Promise<PrinterStatus> {
    const connected = await isVardrzConnected().catch(() => false);
    if (!connected) {
      return makeStatus({ ready: false, noPaper: false });
    }
    return makeStatus({ ready: true });
  }

  async getDialects(): Promise<DeviceDialects> {
    return {
      supported: ['tspl', 'escpos'],
      active: this.dialect,
    };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (dialect !== 'tspl' && dialect !== 'escpos') {
      throw new Error(`Generic SPP driver does not support dialect "${dialect}"`);
    }
    this.dialect = dialect;
  }

  async printRaster(
    job: RasterJob,
    onProgress?: (p: Progress) => void,
  ): Promise<PrintResult> {
    if (!this.device) {
      throw new Error('Generic SPP driver: not connected');
    }

    const started = Date.now();
    const dialect = job.dialect ?? this.dialect;
    onProgress?.({ stage: 'encoding', fraction: 0.1 });

    const cleanPng = job.png.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    if (dialect === 'escpos') {
      await printVardrzPic(cleanPng, {
        width: Math.round(job.widthMm * 8),
        center: true,
        left: job.hOffsetMm ? Math.round(job.hOffsetMm * 8) : 0,
      });
    } else {
      const success = await printVardrzTscLabel(cleanPng, {
        widthMm: job.widthMm,
        heightMm: job.heightMm,
        gapMm: job.gapMm,
        hOffsetMm: job.hOffsetMm,
        vOffsetMm: job.vOffsetMm,
        copies: job.copies,
        paperWidth: job.widthMm > 58 ? '80mm' : '58mm',
      });
      if (!success) {
        throw new Error('Generic SPP TSPL label print returned failure');
      }
    }

    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: true,
      copies: job.copies,
      durationMs: Date.now() - started,
      confirmed: false,
      raw: {},
    };
  }

  onDisconnected(cb: (reason: string) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }
}

export const genericSppDriver = new GenericSppDriver();
