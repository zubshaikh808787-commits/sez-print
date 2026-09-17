import { dotsPerMm as dotsPerMmForDpi } from '@/lib/printer/print-spec';
import type { MediaProfile } from '@/printing/document/types';
import type { RenderedPrintJob } from '@/printing/renderer/UniversalRenderer';
import type {
  EncodeOptions,
  PrinterAdapter,
  PrinterCapabilities,
  PrinterStatus,
  ValidationResult,
} from '@/printing/printer/types';
import { validatePrintRequest } from '@/printing/printer/validate';
import { createPrintDocument } from '@/printing/document/types';

function packWidthDown(dots: number): number {
  const n = Math.max(1, Math.round(dots));
  return Math.max(8, Math.floor(n / 8) * 8);
}

/**
 * TD-404 / generic TSPL adapter.
 * Protocol encoding lives here. The universal renderer never imports this file.
 */
export function createTd404Capabilities(params: {
  printerId?: string;
  model?: string;
  dpi: number;
  maxWidthMm: number;
  transport: PrinterCapabilities['transport'];
}): PrinterCapabilities {
  const dpi = params.dpi;
  // Single source of truth for the 304→12 / 203→8 hardware special case: print-spec.ts `dotsPerMm`.
  const dotsPerMm = dpi === 304 || dpi === 203 ? dotsPerMmForDpi(dpi) : undefined;
  return {
    printerId: params.printerId ?? 'td404',
    model: params.model ?? 'TD-404',
    dpiX: dpi,
    dpiY: dpi,
    dotsPerMmX: dotsPerMm,
    dotsPerMmY: dotsPerMm,
    maxWidthMm: params.maxWidthMm,
    maxHeightMm: 1000,
    printableWidthMm: params.maxWidthMm,
    printableHeightMm: 1000,
    supportedMediaTypes: ['gap', 'blackmark', 'continuous', 'diecut', 'custom'],
    supportedProtocols: ['tspl'],
    supportsGap: true,
    supportsBlackMark: true,
    supportsContinuous: true,
    colorMode: 'mono',
    transport: params.transport,
    adapterId: 'td404-tspl',
  };
}

export type Td404EncodeFns = {
  encodeTspl: (job: RenderedPrintJob, options: EncodeOptions, packedWidthDots: number) => Uint8Array;
  send: (data: Uint8Array) => Promise<void>;
  getStatus?: () => Promise<PrinterStatus>;
  connect?: () => Promise<void>;
  disconnect?: () => Promise<void>;
};

export function createTd404Adapter(
  capabilities: PrinterCapabilities,
  fns: Td404EncodeFns,
): PrinterAdapter {
  return {
    id: capabilities.adapterId,
    async getCapabilities() {
      return capabilities;
    },
    async connect() {
      await fns.connect?.();
    },
    async disconnect() {
      await fns.disconnect?.();
    },
    async getStatus() {
      return fns.getStatus?.() ?? { connected: true, ready: true };
    },
    validateMedia(media: MediaProfile): ValidationResult {
      return validatePrintRequest(
        createPrintDocument({ widthMm: media.widthMm, heightMm: media.heightMm }),
        media,
        capabilities,
      );
    },
    async encode(job: RenderedPrintJob, options: EncodeOptions = {}): Promise<Uint8Array> {
      const packedW = packWidthDown(job.widthDots);
      if (job.bitmap.pixelFormat !== '1bpp') {
        throw new Error('TD-404 adapter expects a 1bpp bitmap from the universal renderer.');
      }
      const isAlreadyPacked =
        packedW === job.widthDots ||
        job.bitmap.widthDots === packedW ||
        job.bitmap.bytesPerRow === packedW / 8;
      const packedJob =
        isAlreadyPacked
          ? {
              ...job,
              widthDots: packedW,
              bitmap: {
                ...job.bitmap,
                widthDots: packedW,
                bytesPerRow: packedW / 8,
              },
            }
          : {
              ...job,
              widthDots: packedW,
              bitmap: {
                ...job.bitmap,
                widthDots: packedW,
                bytesPerRow: packedW / 8,
                data: packCrop1bpp(
                  job.bitmap.data,
                  job.bitmap.bytesPerRow ?? Math.ceil(job.widthDots / 8),
                  job.heightDots,
                  packedW / 8,
                ),
              },
            };
      return fns.encodeTspl(packedJob, options, packedW);
    },
    async send(data: Uint8Array) {
      await fns.send(data);
    },
    async cancel() {
      return;
    },
  };
}

function packCrop1bpp(
  data: Uint8Array,
  srcBpr: number,
  height: number,
  destBpr: number,
): Uint8Array {
  if (srcBpr === destBpr) return data;
  const out = new Uint8Array(destBpr * height);
  const copyBpr = Math.min(srcBpr, destBpr);
  for (let y = 0; y < height; y++) {
    out.set(data.subarray(y * srcBpr, y * srcBpr + copyBpr), y * destBpr);
  }
  return out;
}
