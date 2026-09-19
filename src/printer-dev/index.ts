/**
 * printer-dev — DEV 2-in-1 bridge (AutoReplyPrint).
 *
 * A thin adapter over the existing `dev-printer` native module, which is already
 * the reference implementation: its `closeHandle()` correctly closes the output
 * stream, then the socket, then calls `CP_Port_Close`, then nulls all three.
 * Nothing here rewrites that — this file only translates it to the contract.
 *
 * Android only. JNA plus a bundled `.so` have no iOS equivalent, so `platforms`
 * says so and the UI can state "this printer is Android-only" instead of failing
 * mysteriously at connect time.
 */
import {
  addDevConnectionListener,
  calibrateDev,
  connectDev,
  disconnectDev,
  getDevStatus,
  isDevConnected,
  printDevPngLabel,
} from 'dev-printer';
import type { DevPrintOptions } from 'dev-printer';

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
import { isLikelyDevName } from '@/lib/printer/printer-heuristics';

export const DEV_DRIVER_ID = 'dev';

/** DEV's own paper-type numbering, from the module's DEV_PAPER_TYPE. */
const PAPER_TYPE: Record<string, number> = { gap: 0, continuous: 1, bline: 2 };

export class DevDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: DEV_DRIVER_ID,
    displayName: 'DEV 2-in-1',
    platforms: ['android'],
    transports: ['spp'],
    dialects: ['tspl', 'escpos'],
    // Label stock defaults to TSPL. The native side treats anything that is not
    // exactly "tspl" as ESC/POS, and that path is a different geometry universe.
    defaultDialect: 'tspl',
    dialectIsDeviceSetting: false,
    dpi: 203,
    headWidthDots: 384,
    maxLabelHeightMm: 1000,
    nativeCopies: true,
    statusQuery: true,
    // The SDK resolves when the write completes, not when paper has fed out.
    physicalCompletionCallback: false,
    maxChunkBytes: 2048,
    mediaTypes: ['gap', 'bline', 'continuous'],
    requiresLicenseKey: false,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'tspl';
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private nativeWatch: { remove: () => void } | undefined;

  /** Discovery filter only. Reuses the heuristics the app already trusts. */
  claims(device: DiscoveredDevice): boolean {
    return isLikelyDevName(device.name);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    const result = await connectDev(deviceId, name ?? null);
    const resolvedName = result?.name ?? name ?? null;
    const profile = resolveProfile(DEV_DRIVER_ID, resolvedName);

    this.device = {
      id: result?.id ?? deviceId,
      name: resolvedName,
      driverId: DEV_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    this.watchNative();
    return this.device;
  }

  /**
   * Idempotent and total. Safe to call when nothing is open, which is exactly what
   * the router's closeAll() does to every registered driver on every switch.
   */
  async disconnect(): Promise<void> {
    this.nativeWatch?.remove();
    this.nativeWatch = undefined;
    this.device = undefined;
    try {
      await disconnectDev();
    } catch {
      // A teardown that throws is still a teardown. The native closeHandle() is
      // itself idempotent, so swallowing here cannot leak a handle.
    }
  }

  isConnected(): boolean {
    try {
      return isDevConnected();
    } catch {
      return false;
    }
  }

  connectedDevice(): ConnectedDevice | undefined {
    return this.device;
  }

  async getStatus(): Promise<PrinterStatus> {
    if (!this.isConnected()) {
      return makeStatus({ disconnected: true, message: 'Printer disconnected.' });
    }
    const raw = await getDevStatus();
    return makeStatus({
      noPaper: raw.noPaper,
      coverOpen: raw.coverOpen,
      overheat: raw.overheat,
      lowBattery: raw.lowVoltage,
      // The SDK has no "printing" flag; hasError without a specific cause is the
      // closest thing to "not usable right now".
      busy: false,
      labelNotDetected: raw.isLabelMode && !raw.isLabelPaper,
      message: raw.error ?? undefined,
      raw: raw as unknown as Record<string, unknown>,
    });
  }

  /** Per-job on DEV — nothing is written to the device, so this is local state. */
  async getDialects(): Promise<DeviceDialects> {
    return { supported: this.capabilities.dialects, active: this.dialect };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (!this.capabilities.dialects.includes(dialect)) {
      throw new Error(`DEV does not support dialect "${dialect}".`);
    }
    this.dialect = dialect;
  }

  async calibrate(media: Media): Promise<void> {
    await calibrateDev(PAPER_TYPE[media] ?? PAPER_TYPE.gap);
  }

  async printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    if (!this.isConnected()) throw new Error('No DEV printer connected.');

    const dialect = job.dialect ?? this.dialect;
    if (dialect !== 'tspl' && dialect !== 'escpos') {
      throw new Error(`DEV cannot print dialect "${dialect}".`);
    }

    const profile = resolveProfile(DEV_DRIVER_ID, this.device?.name);
    const started = Date.now();
    onProgress?.({ stage: 'transferring' });

    const options: DevPrintOptions = {
      pngBase64: job.png,
      widthMm: job.widthMm,
      heightMm: job.heightMm,
      gapMm: job.gapMm,
      media: job.media === 'circle' ? 'gap' : job.media,
      copies: job.copies,
      density: job.density,
      speed: job.speed,
      rotation: job.rotation,
      commandSet: dialect,
      hOffsetMm: job.hOffsetMm ?? 0,
      vOffsetMm: job.vOffsetMm ?? 0,
      printheadWidthMm: profile?.maxWidthMm ?? 48,
    };

    const result = await printDevPngLabel(options);
    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: Boolean(result?.success),
      copies: result?.copies ?? job.copies,
      durationMs: result?.durationMs ?? Date.now() - started,
      // The write completed; paper feeding out is inferred, not reported.
      confirmed: false,
      raw: result as unknown as Record<string, unknown>,
    };
  }

  onDisconnected(cb: (reason: string) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  /** Bridge the native `onConnectionChanged` event onto the contract's callback. */
  private watchNative(): void {
    this.nativeWatch?.remove();
    this.nativeWatch = addDevConnectionListener((event) => {
      if (event.connected) return;
      this.device = undefined;
      for (const listener of this.disconnectListeners) {
        try {
          listener('DEV printer disconnected');
        } catch {
          // ignore
        }
      }
    });
  }
}

export const devDriver = new DevDriver();
