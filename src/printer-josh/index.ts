/**
 * printer-josh — JOSH (DothanTech LPAPI) bridge.
 *
 * A thin adapter over the existing `josh-printer` native module, which wraps
 * DothanTech's LPAPI SDK for the JOSH printer family.
 *
 * Android only. LPAPI has no iOS equivalent in the vendor zip; `platforms`
 * says so and the UI can state "Android-only" instead of failing mysteriously.
 *
 * Dialect notes:
 *   JOSH actually supports vector, bitmap, ESC/POS, and raw command modes, but
 *   the current `josh-printer` module only exposes a bitmap (PNG→raster) print
 *   path. `dialects: ['bitmap']` reflects what THIS bridge can deliver today.
 *   The optional `printVector()` upgrade can be wired in once the vector LPAPI
 *   calls are exposed by the native module.
 *
 *   `dialectIsDeviceSetting: false` is used here because the bitmap path does
 *   NOT write a persistent language flag to the device (only `setPrinterParam`
 *   with LANGUAGE key does that, and we never call it in bitmap mode).
 */
import {
  addJoshConnectionListener,
  connectJosh,
  disconnectJosh,
  isJoshConnected,
  printJoshPngLabel,
} from 'josh-printer';
import type { JoshPngLabelOptions } from 'josh-printer';

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
import { isLikelyJoshName } from '@/lib/printer/printer-heuristics';
import { joshGapTypeFromMedia } from '@/lib/printer/josh-print';

export const JOSH_DRIVER_ID = 'josh';

export class JoshDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: JOSH_DRIVER_ID,
    displayName: 'JOSH (LPAPI)',
    platforms: ['android'],
    transports: ['spp'],
    // Bitmap-only in this build. The LPAPI SDK also supports vector, ESC/POS,
    // and raw command paths but those are not exposed by the native module yet.
    dialects: ['bitmap'],
    defaultDialect: 'bitmap',
    dialectIsDeviceSetting: false,
    dpi: 203,
    headWidthDots: 576,  // 72 mm × 8 dots/mm; update when per-model profile lands
    maxLabelHeightMm: 1000,
    // JOSH LPAPI has native copy support in the print job params (copies field).
    nativeCopies: true,
    // printBitmap() blocks on a CountDownLatch released by the SDK's real
    // PrintProgress.Success hardware ACK — see RasterJob.confirmed below. A
    // DataEnded 200ms fallback exists for models that never send that ACK; that
    // path is distinguished natively (confirmedByDevice) rather than assumed.
    statusQuery: false,
    physicalCompletionCallback: true,
    maxChunkBytes: 2048,
    mediaTypes: ['gap', 'bline', 'continuous'],
    requiresLicenseKey: false,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'bitmap';
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private nativeWatch: { remove: () => void } | undefined;

  /** Discovery filter only. Reuses the heuristics the app already trusts. */
  claims(device: DiscoveredDevice): boolean {
    return isLikelyJoshName(device.name);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    const result = await connectJosh(deviceId, name ?? null);
    const resolvedName = result?.name ?? name ?? null;
    const profile = resolveProfile(JOSH_DRIVER_ID, resolvedName);

    this.device = {
      id: result?.macAddress ?? deviceId,
      name: resolvedName,
      driverId: JOSH_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    this.watchNative();
    return this.device;
  }

  /**
   * Idempotent and total. JOSH's LPAPI singleton requires api.quit() to
   * release the underlying JNI handle. The native module does this inside
   * its disconnect() call.
   */
  async disconnect(): Promise<void> {
    this.nativeWatch?.remove();
    this.nativeWatch = undefined;
    this.device = undefined;
    try {
      await disconnectJosh();
    } catch {
      // A disconnect that throws is still a disconnect.
    }
  }

  isConnected(): boolean {
    try {
      return isJoshConnected();
    } catch {
      return false;
    }
  }

  connectedDevice(): ConnectedDevice | undefined {
    return this.device;
  }

  /**
   * The JOSH module does not expose a native getStatus() call in the
   * bitmap-only path. Report connectivity only so the UI shows something
   * honest rather than a fabricated "ready" or a silent null.
   */
  async getStatus(): Promise<PrinterStatus> {
    if (!this.isConnected()) {
      return makeStatus({ disconnected: true, message: 'JOSH printer disconnected.' });
    }
    return makeStatus({});
  }

  /** Bitmap is the only dialect this build of the bridge supports. */
  async getDialects(): Promise<DeviceDialects> {
    return { supported: this.capabilities.dialects, active: this.dialect };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (!this.capabilities.dialects.includes(dialect)) {
      throw new Error(`JOSH bridge does not support dialect "${dialect}" in this build.`);
    }
    this.dialect = dialect;
  }

  async printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    if (!this.isConnected()) throw new Error('No JOSH printer connected.');

    const profile = resolveProfile(JOSH_DRIVER_ID, this.device?.name);
    const dpi = profile?.dpi ?? this.capabilities.dpi;
    const started = Date.now();
    onProgress?.({ stage: 'transferring' });

    const gapType = joshGapTypeFromMedia(job.media === 'circle' ? 'gap' : job.media);

    const options: JoshPngLabelOptions = {
      pngBase64: job.png,
      widthMm: job.widthMm,
      heightMm: job.heightMm,
      dpi,
      copies: job.copies,
      density: job.density,
      speed: job.speed,
      orientation: job.rotation,
      gapType,
      gapLength: Math.round(job.gapMm),
      hOffsetMm: job.hOffsetMm ?? 0,
      vOffsetMm: job.vOffsetMm ?? 0,
      alignment: 'center',
    };

    const result = await printJoshPngLabel(options);
    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: true,
      copies: result?.copies ?? job.copies,
      durationMs: result?.totalMs ?? Date.now() - started,
      // true only when the SDK's own PrintProgress.Success ACK fired, not when
      // the native DataEnded fallback resolved the job in its place.
      confirmed: result?.confirmedByDevice ?? false,
      raw: result as unknown as Record<string, unknown>,
    };
  }

  onDisconnected(cb: (reason: string) => void): Unsubscribe {
    this.disconnectListeners.add(cb);
    return () => {
      this.disconnectListeners.delete(cb);
    };
  }

  /** Bridge the native `onJoshConnectionStateChanged` event onto the contract's callback. */
  private watchNative(): void {
    this.nativeWatch?.remove();
    this.nativeWatch = addJoshConnectionListener((event) => {
      if (event.isConnected) return;
      this.device = undefined;
      for (const listener of this.disconnectListeners) {
        try {
          listener('JOSH printer disconnected');
        } catch {
          // ignore
        }
      }
    });
  }
}

export const joshDriver = new JoshDriver();
