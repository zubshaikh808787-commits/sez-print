import type { MediaProfile } from '@/printing/document/types';
import type { RenderedPrintJob } from '@/printing/renderer/UniversalRenderer';
import type {
  EncodeOptions,
  PrinterAdapter,
  PrinterCapabilities,
  ValidationResult,
} from '@/printing/printer/types';

/** Unit-test only. Never used as a production printer. */
export function createTestPrinterAdapter(dpi: number, maxWidthMm = 108): PrinterAdapter {
  const capabilities: PrinterCapabilities = {
    printerId: `test-${dpi}`,
    model: `TestPrinter ${dpi} DPI`,
    dpiX: dpi,
    dpiY: dpi,
    maxWidthMm,
    maxHeightMm: 1000,
    printableWidthMm: maxWidthMm,
    printableHeightMm: 1000,
    supportedMediaTypes: ['gap', 'continuous', 'diecut'],
    supportedProtocols: ['test'],
    supportsGap: true,
    supportsBlackMark: true,
    supportsContinuous: true,
    colorMode: 'mono',
    transport: 'usb',
    adapterId: `test-${dpi}`,
  };
  const sent: Uint8Array[] = [];
  return {
    id: capabilities.adapterId,
    async getCapabilities() {
      return capabilities;
    },
    async connect() {},
    async disconnect() {},
    async getStatus() {
      return { connected: true, ready: true };
    },
    validateMedia(_media: MediaProfile): ValidationResult {
      return { ok: true, errors: [], warnings: [] };
    },
    async encode(job: RenderedPrintJob, _options?: EncodeOptions) {
      return job.bitmap.data;
    },
    async send(data: Uint8Array) {
      sent.push(data);
    },
    async cancel() {},
  };
}
