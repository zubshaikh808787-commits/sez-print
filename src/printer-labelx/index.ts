/**
 * printer-labelx — LABELX (LuckPrinter SDK) bridge.
 *
 * A thin adapter over the existing `labelx-printer` native module, which wraps
 * the LuckPrinter SDK (LuckBleSDK / LuckPrinterSdk) for the LABELX / GD985
 * printer family.
 *
 * Android only. The iOS `LuckBleSDK.xcframework` exists in the vendor zip but
 * the native module has not been wired for iOS yet. `platforms: ['android']`
 * reflects the current build reality.
 *
 * Bitmap-only. LuckPrinter has no command language — all printing is done by
 * passing a bitmap to one of the `printTag` / `printBlackTag` / `printCircleTag`
 * / `printLuck` methods. The paper-type routing is driven by `RasterJob.media`.
 *
 * `requiresLicenseKey: true` — the `asKey` is bundled in the native module
 * with a default abroad key. If the key is invalid or not matched, the SDK
 * returns error code 2147483647 (`Integer.MAX_VALUE`). The current module uses
 * the known working default key.
 */
import {
  connectLabelX,
  disconnectLabelX,
  isLabelXConnected,
  printLabelXPngLabel,
  getLabelXStatus,
} from 'labelx-printer';
import type { LabelXPrintOptions } from 'labelx-printer';

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
import { isLikelyLabelXName } from '@/lib/printer/printer-heuristics';
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export const LABELX_DRIVER_ID = 'labelx';

/** Map RasterJob.media to the LuckPrinter `paperType` string. */
const MEDIA_TO_PAPER_TYPE: Record<Media, LabelXPrintOptions['paperType']> = {
  gap: 'tag',
  bline: 'blacktag',
  continuous: 'continuous',
  circle: 'tag',  // No dedicated circle method; caller should use gap stock
};

function addLabelXConnectionListener(
  listener: (event: { connected: boolean; name?: string; mac?: string }) => void
): { remove: () => void } {
  if (Platform.OS !== 'android') return { remove: () => {} };
  try {
    const mod = requireNativeModule<{
      addListener(name: string, cb: (e: unknown) => void): { remove: () => void };
    }>('LabelXPrinter');
    return mod.addListener('onConnectionChanged', listener as (e: unknown) => void);
  } catch {
    return { remove: () => {} };
  }
}

export class LabelXDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: LABELX_DRIVER_ID,
    displayName: 'LABELX (GD985 / LuckPrinter)',
    platforms: ['android'],
    transports: ['spp'],
    // LuckPrinter is bitmap-only — it has no command language.
    dialects: ['bitmap'],
    defaultDialect: 'bitmap',
    dialectIsDeviceSetting: false,
    dpi: 203,
    headWidthDots: 384,  // GD985 is 48 mm head @ 203 DPI = 384 dots
    maxLabelHeightMm: 1000,
    // No native PRINT n,m copies — each copy is a separate job.
    nativeCopies: false,
    // The LuckPrinter `onPrintSuccess()` fires when paper has physically fed out.
    statusQuery: true,
    physicalCompletionCallback: true,
    maxChunkBytes: 2048,
    mediaTypes: ['gap', 'bline', 'continuous'],
    // asKey is bundled in native module; mark true so the UI can warn if key is wrong.
    requiresLicenseKey: true,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'bitmap';
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private nativeWatch: { remove: () => void } | undefined;

  /** Discovery filter only. Reuses the heuristics the app already trusts. */
  claims(device: DiscoveredDevice): boolean {
    return isLikelyLabelXName(device.name);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    const result = await connectLabelX(deviceId, name ?? null);
    const resolvedName = result?.name ?? name ?? null;
    const profile = resolveProfile(LABELX_DRIVER_ID, resolvedName);

    this.device = {
      id: result?.mac ?? deviceId,
      name: resolvedName,
      driverId: LABELX_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    this.watchNative();
    return this.device;
  }

  /**
   * Idempotent and total. LuckPrinter is a singleton — `disconnectLuck()` +
   * `scanHelper.unInit()` is done inside the native module's disconnect().
   */
  async disconnect(): Promise<void> {
    this.nativeWatch?.remove();
    this.nativeWatch = undefined;
    this.device = undefined;
    try {
      await disconnectLabelX();
    } catch {
      // A teardown that throws is still a teardown.
    }
  }

  isConnected(): boolean {
    try {
      return isLabelXConnected();
    } catch {
      return false;
    }
  }

  connectedDevice(): ConnectedDevice | undefined {
    return this.device;
  }

  async getStatus(): Promise<PrinterStatus> {
    if (!this.isConnected()) {
      return makeStatus({ disconnected: true, message: 'LABELX printer disconnected.' });
    }
    try {
      const raw = await getLabelXStatus();
      return makeStatus({
        noPaper: raw.paperOut,
        coverOpen: raw.coverOpen,
        overheat: raw.overheating,
        lowBattery: raw.lowBattery,
        busy: raw.printing,
        raw: raw as unknown as Record<string, unknown>,
      });
    } catch {
      return makeStatus({});
    }
  }

  /** Bitmap is the only dialect. The dropdown is hidden when `dialects.length === 1`. */
  async getDialects(): Promise<DeviceDialects> {
    return { supported: this.capabilities.dialects, active: this.dialect };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (dialect !== 'bitmap') {
      throw new Error(`LABELX supports bitmap only. Requested: "${dialect}".`);
    }
    this.dialect = dialect;
  }

  async printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    if (!this.isConnected()) throw new Error('No LABELX printer connected.');

    const profile = resolveProfile(LABELX_DRIVER_ID, this.device?.name);
    const dpi = profile?.dpi ?? this.capabilities.dpi;
    const widthDots = Math.round((job.widthMm * dpi) / 25.4);
    const started = Date.now();
    onProgress?.({ stage: 'transferring' });

    // Copies are sent as separate jobs because `nativeCopies: false`.
    for (let copy = 0; copy < Math.max(1, job.copies); copy += 1) {
      const options: LabelXPrintOptions = {
        pngBase64: job.png,
        copies: 1,
        widthMm: job.widthMm,
        widthDots,
        paperType: MEDIA_TO_PAPER_TYPE[job.media],
        density: Math.min(2, Math.max(0, Math.round(job.density / 5))),
        threshold: 145,
        dither: true,
      };
      const result = await printLabelXPngLabel(options);
      if (!result?.success) {
        throw new Error('LABELX print failed: ' + JSON.stringify(result));
      }
      onProgress?.({ stage: 'printing', page: copy + 1, pages: job.copies });
    }

    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: true,
      copies: job.copies,
      durationMs: Date.now() - started,
      // physicalCompletionCallback is true — the native print resolves after
      // paper has physically fed out (onPrintSuccess fires on completion).
      confirmed: true,
      raw: {},
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
    this.nativeWatch = addLabelXConnectionListener((event) => {
      if (event.connected) return;
      this.device = undefined;
      for (const listener of this.disconnectListeners) {
        try {
          listener('LABELX printer disconnected');
        } catch {
          // ignore
        }
      }
    });
  }
}

export const labelxDriver = new LabelXDriver();
