/**
 * printer-tez — TEZ / SHAKTI bridge (Flashlabel OEM PrintSDK).
 *
 * A thin adapter over the existing `tez-printer` native module, which wraps the
 * Flashlabel Y50 / YXSDK OEM PrintSDK for the Tez, Shakti, and Seznik printer
 * family sold under the "Sez-Nik" brand.
 *
 * Android only. The Y50 iOS SDK status is unknown; `platforms: ['android']`
 * reflects the current build reality.
 *
 * The native module uses SPP (RFCOMM). It wraps the OEM's `PrinterManage`,
 * `Printer`, and `Command` classes via reflection to bypass the OEM name filter
 * that would otherwise reject Seznik/Tej device names.
 *
 * Stale APK guard: the native module exposes `getNativeRevision()`. If the
 * running APK doesn't match `TEZ_NATIVE_REVISION`, all connect calls throw a
 * clear "install a new build" error rather than failing with a cryptic JNI crash.
 */
import {
  connectTez,
  disconnectTez,
  isTezConnected,
  printTezImage,
  getTezStatus,
  calibrateTez,
} from 'tez-printer';
import type { TezPrintOptions } from 'tez-printer';

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
import { isLikelyTezName, isLikelyShaktiName } from '@/lib/printer/printer-heuristics';
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export const TEZ_DRIVER_ID = 'tez';

/** Map RasterJob.media to the TEZ paperType string understood by the native module. */
const MEDIA_TO_PAPER_TYPE: Record<Media, 'gap' | 'continuous' | 'black'> = {
  gap: 'gap',
  bline: 'black',
  continuous: 'continuous',
  circle: 'gap',
};

function addTezConnectionListener(
  listener: (event: { connected: boolean; name?: string; mac?: string }) => void
): { remove: () => void } {
  if (Platform.OS !== 'android') return { remove: () => {} };
  try {
    const mod = requireNativeModule<{
      addListener(name: string, cb: (e: unknown) => void): { remove: () => void };
    }>('TezPrinter');
    // TezPrinterModule does not yet fire a connection-change event, but we wire
    // this up here so the bridge is future-ready when the native side adds it.
    return mod.addListener('onConnectionChanged', listener as (e: unknown) => void);
  } catch {
    return { remove: () => {} };
  }
}

export class TezDriver implements PrinterDriver {
  readonly capabilities: PrinterCapabilities = {
    driverId: TEZ_DRIVER_ID,
    displayName: 'TEZ / SHAKTI (Flashlabel Y50)',
    platforms: ['android'],
    transports: ['spp'],
    dialects: ['bitmap'],
    defaultDialect: 'bitmap',
    dialectIsDeviceSetting: false,
    dpi: 203,
    headWidthDots: 384,  // Y50 is 48 mm head @ 203 DPI = 384 dots
    maxLabelHeightMm: 1000,
    nativeCopies: true,
    // PrintPipeline.executePrint() resolves the job from the OEM SDK's readCall()
    // callback, not on write-complete — see RasterJob.confirmed on printRaster().
    // A 15s safety timer resolves it anyway if the OEM never calls back; that path
    // is distinguished at the native layer (confirmedByDevice) and surfaced below.
    statusQuery: true,
    physicalCompletionCallback: true,
    maxChunkBytes: 2048,
    mediaTypes: ['gap', 'bline', 'continuous'],
    requiresLicenseKey: false,
  };

  private device: ConnectedDevice | undefined;
  private dialect: Dialect = 'bitmap';
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private nativeWatch: { remove: () => void } | undefined;

  /**
   * Discovery filter. Matches both Tez and Shakti name patterns, as both
   * models use the same native SDK (Flashlabel OEM PrintSDK).
   */
  claims(device: DiscoveredDevice): boolean {
    return isLikelyTezName(device.name) || isLikelyShaktiName(device.name);
  }

  async connect(deviceId: string, name?: string | null): Promise<ConnectedDevice> {
    const result = await connectTez(deviceId, name ?? null);
    const resolvedName = result?.name ?? name ?? null;
    const profile = resolveProfile(TEZ_DRIVER_ID, resolvedName);

    this.device = {
      id: result?.id ?? deviceId,
      name: resolvedName,
      driverId: TEZ_DRIVER_ID,
      transport: 'spp',
      model: profile?.model,
    };

    this.watchNative();
    return this.device;
  }

  /**
   * Idempotent and total. The OEM SDK is a singleton; the native module calls
   * `printer.disconnect()` + clears all handles inside its disconnect().
   */
  async disconnect(): Promise<void> {
    this.nativeWatch?.remove();
    this.nativeWatch = undefined;
    this.device = undefined;
    try {
      await disconnectTez();
    } catch {
      // A teardown that throws is still a teardown.
    }
  }

  isConnected(): boolean {
    try {
      return isTezConnected();
    } catch {
      return false;
    }
  }

  connectedDevice(): ConnectedDevice | undefined {
    return this.device;
  }

  async getStatus(): Promise<PrinterStatus> {
    if (!this.isConnected()) {
      return makeStatus({ disconnected: true, message: 'TEZ/SHAKTI printer disconnected.' });
    }
    try {
      const raw = await getTezStatus();
      return makeStatus({
        noPaper: raw.isNoPaper,
        coverOpen: raw.isCoverOpen,
        overheat: raw.isOverheat,
        lowBattery: raw.isLowBattery,
        busy: raw.isPrinting,
        message: raw.errorMessage ?? undefined,
        raw: raw as unknown as Record<string, unknown>,
      });
    } catch {
      return makeStatus({});
    }
  }

  /** Bitmap is the only dialect in this build. */
  async getDialects(): Promise<DeviceDialects> {
    return { supported: this.capabilities.dialects, active: this.dialect };
  }

  async setDialect(dialect: Dialect): Promise<void> {
    if (dialect !== 'bitmap') {
      throw new Error(`TEZ/SHAKTI bridge supports bitmap only. Requested: "${dialect}".`);
    }
    this.dialect = dialect;
  }

  async calibrate(media: Media): Promise<void> {
    const paperType = MEDIA_TO_PAPER_TYPE[media];
    await calibrateTez(paperType);
  }

  async printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult> {
    if (!this.isConnected()) throw new Error('No TEZ/SHAKTI printer connected.');

    const profile = resolveProfile(TEZ_DRIVER_ID, this.device?.name);
    const dpi = profile?.dpi ?? this.capabilities.dpi;
    const started = Date.now();
    onProgress?.({ stage: 'transferring' });

    const options: TezPrintOptions = {
      pngBase64: job.png,
      widthMm: job.widthMm,
      heightMm: job.heightMm,
      copies: job.copies,
      density: job.density,
      speed: job.speed,
      paperType: MEDIA_TO_PAPER_TYPE[job.media],
      gapMm: job.gapMm,
      threshold: 128,
      hOffsetMm: job.hOffsetMm ?? 0,
      vOffsetMm: job.vOffsetMm ?? 0,
    };

    // Suppress unused variable warning — dpi may be needed for future scaling
    void dpi;

    const result = await printTezImage(options);
    onProgress?.({ stage: 'done', fraction: 1 });

    return {
      success: result?.success ?? true,
      copies: job.copies,
      durationMs: result?.durationMs ?? Date.now() - started,
      // true only when the OEM SDK's own readCall() ACK fired, not when the
      // native 15s safety timer resolved the job in its place.
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

  /** Wire up native disconnect event (future-ready; native side may not fire it yet). */
  private watchNative(): void {
    this.nativeWatch?.remove();
    this.nativeWatch = addTezConnectionListener((event) => {
      if (event.connected) return;
      this.device = undefined;
      for (const listener of this.disconnectListeners) {
        try {
          listener('TEZ/SHAKTI printer disconnected');
        } catch {
          // ignore
        }
      }
    });
  }
}

export const tezDriver = new TezDriver();
