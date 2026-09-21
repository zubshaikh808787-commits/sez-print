/**
 * printer-tejas — TEJAS / RUDRA bridge (Ninestar TD-404).
 *
 * A thin adapter over the existing `td404-printer` native module.
 *
 * IMPORTANT deviation from the plan: §6 and §7 describe this brand's SPP path as
 * going through the vendor's `PrinterManager` / `portManager`, with a true
 * per-label handshake (`addQueryPrinterStatus(RESPONSE_MODE.ON)` +
 * `isReadReceive=true` → `onReceive`). The module actually shipped in this repo
 * (`Td404PrinterModule.kt`) does NOT do that: it opens a raw `BluetoothSocket`
 * itself, builds the TSPL bytes with the vendor's `LabelCommand` byte-builder, and
 * writes them fire-and-forget (`isReadReceive=false`), paced in 4 KB chunks to
 * avoid overrunning the printer's UART FIFO. There is no `getStatus()` and no
 * per-label ACK.
 *
 * So this driver is honest about what's really there:
 *   - `statusQuery: false`, `physicalCompletionCallback: false`
 *   - `getStatus()` reports link liveness only, not paper/cover/heat flags
 *   - the queue falls back to the computed feed-time delay, same as DEV
 *
 * Wiring up the real handshake is a native follow-up, not something this
 * TypeScript layer can fake. Tracked back to the plan's open blocker list.
 */
import {
  addTd404ConnectionListener,
  connectTd404,
  disconnectTd404,
  getTd404ConnectionInfo,
  isTd404Connected,
  printTd404PngLabel,
} from 'td404-printer';
import type { Td404PngLabelOptions } from 'td404-printer';

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
import { isLikelyTd404Name } from '@/lib/printer/printer-heuristics';

export const TEJAS_DRIVER_ID = 'tejas';

const MEDIA_TO_NATIVE: Record<Media, Td404PngLabelOptions['media']> = {
  gap: 'gap',
  bline: 'bline',
  continuous: 'continuous',
  circle: 'gap', // no circular media support on this head; closest safe default
};

export class TejasDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: TEJAS_DRIVER_ID,
    displayName: 'TEJAS / RUDRA (TD-404)',
    platforms: ['android'],
    transports: ['spp'],
    // TSPL only in this build. The vendor SDK also offers ESC/POS and CPCL byte
    // builders (LabelCommand / EscCommand / CpclCommand all accept a bitmap), but
    // the native module only wires up the TSPL path today.
    dialects: ['tspl'],
    defaultDialect: 'tspl',
    dialectIsDeviceSetting: false,
    // Real head is 304 dpi (12 dots/mm) per printPngLabelNative's dpm table.
    dpi: 304,
    headWidthDots: 1280,
    maxLabelHeightMm: 1000,
    // PRINT n,m is not exposed by this module; every copy is a separate job.
    nativeCopies: false,
    statusQuery: false,
    physicalCompletionCallback: false,
    maxChunkBytes: 1024,
    mediaTypes: ['gap', 'bline', 'continuous'],
    requiresLicenseKey: false,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'tspl';
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private nativeWatch: { remove: () => void } | undefined;

  /** Discovery filter only. Reuses the heuristics the app already trusts. */
  claims(device: DiscoveredDevice): boolean {
    return isLikelyTd404Name(device.name);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    const result = await connectTd404(deviceId, name ?? null);
    const resolvedName = result?.name ?? name ?? null;
    const profile = resolveProfile(TEJAS_DRIVER_ID, resolvedName);

    this.device = {
      id: result?.id ?? deviceId,
      name: resolvedName,
      driverId: TEJAS_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    this.watchNative();
    return this.device;
  }

  /**
   * Idempotent and total — mirrors `closeSocket()`, which nulls the socket, the
   * MAC and the name every time it runs, whether or not one was open.
   */
  async disconnect(): Promise<void> {
    this.nativeWatch?.remove();
    this.nativeWatch = undefined;
    this.device = undefined;
    try {
      await disconnectTd404();
    } catch {
      // closeSocket() on the native side never throws; swallow defensively anyway.
    }
  }

  isConnected(): boolean {
    try {
      return isTd404Connected();
    } catch {
      return false;
    }
  }

  connectedDevice(): ConnectedDevice | undefined {
    return this.device;
  }

  /**
   * No printer-reported status exists on this module — only socket liveness.
   * A disconnected socket is reported as `disconnected`, never guessed as
   * "no paper" or similar, so the UI does not show a fault the printer never sent.
   */
  async getStatus(): Promise<PrinterStatus> {
    const info = await getTd404ConnectionInfo();
    const alive = info?.connected ?? this.isConnected();
    if (!alive) {
      return makeStatus({ disconnected: true, message: 'Printer disconnected.' });
    }
    return makeStatus({ raw: (info ?? undefined) as Record<string, unknown> | undefined });
  }

  /** TSPL is the only dialect this module speaks. Nothing is written to the device. */
  async getDialects(): Promise<DeviceDialects> {
    return { supported: this.capabilities.dialects, active: this.dialect };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (dialect !== 'tspl') {
      throw new Error('This build of the TEJAS/RUDRA bridge only speaks TSPL.');
    }
    this.dialect = dialect;
  }

  async printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    if (!this.isConnected()) throw new Error('No TEJAS/RUDRA printer connected.');

    const dialect = job.dialect ?? this.dialect;
    if (dialect !== 'tspl') {
      throw new Error(`TEJAS/RUDRA cannot print dialect "${dialect}" in this build.`);
    }

    const profile = resolveProfile(TEJAS_DRIVER_ID, this.device?.name);
    const dpi = profile?.dpi ?? this.capabilities.dpi;
    const started = Date.now();
    onProgress?.({ stage: 'transferring' });

    // No native PRINT n,m here — copies are sent as separate jobs, paced by the
    // same interLabelDelayMs the bulk queue already applies between rows.
    let bytesSent = 0;
    for (let copy = 0; copy < Math.max(1, job.copies); copy += 1) {
      const options: Td404PngLabelOptions = {
        pngBase64: job.png,
        widthMm: job.widthMm,
        heightMm: job.heightMm,
        gapMm: job.gapMm,
        density: job.density,
        speed: job.speed,
        copies: 1,
        media: MEDIA_TO_NATIVE[job.media],
        orientation: job.rotation,
        dpi,
        xDots: job.hOffsetMm ? Math.round((job.hOffsetMm * dpi) / 25.4) : 0,
        yDots: job.vOffsetMm ? Math.round((job.vOffsetMm * dpi) / 25.4) : 0,
      };
      const result = await printTd404PngLabel(options);
      if (!result) throw new Error('TD-404 native print path is unavailable on this build.');
      bytesSent += result.bytesSent ?? 0;
      onProgress?.({ stage: 'printing', page: copy + 1, pages: job.copies });
    }

    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: true,
      copies: job.copies,
      durationMs: Date.now() - started,
      // The write completed; there is no ACK to confirm paper actually fed out.
      confirmed: false,
      raw: { bytesSent },
    };
  }

  // No `calibrate()` — deliberately omitted rather than implemented-to-throw.
  // `calibrate` is optional on the contract specifically so callers can feature-
  // detect with `driver.calibrate` before calling; a method that always throws
  // would defeat that check.

  onDisconnected(cb: (reason: string) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  /** Bridge the native `onConnectionChanged` event onto the contract's callback. */
  private watchNative(): void {
    this.nativeWatch?.remove();
    this.nativeWatch = addTd404ConnectionListener((event) => {
      if (event.connected) return;
      this.device = undefined;
      for (const listener of this.disconnectListeners) {
        try {
          listener('TEJAS/RUDRA printer disconnected');
        } catch {
          // ignore
        }
      }
    });
  }
}

export const tejasDriver = new TejasDriver();
