import type { MediaProfile } from '@/printing/document/types';
import type { RenderedPrintJob } from '@/printing/renderer/UniversalRenderer';

export type PrinterTransport = 'bluetooth' | 'ble' | 'wifi' | 'usb' | string;

export type PrinterCapabilities = {
  printerId: string;
  model: string;
  dpiX: number;
  dpiY: number;
  dotsPerMmX?: number;
  dotsPerMmY?: number;
  maxWidthMm: number;
  maxHeightMm?: number;
  printableWidthMm: number;
  printableHeightMm?: number;
  supportedMediaTypes: string[];
  supportedProtocols: string[];
  supportsGap: boolean;
  supportsBlackMark: boolean;
  supportsContinuous: boolean;
  colorMode: 'mono' | 'grayscale' | string;
  transport: PrinterTransport;
  adapterId: string;
};

export type PrinterStatus = {
  connected: boolean;
  ready: boolean;
  message?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type PrinterAdapter = {
  id: string;
  getCapabilities(): Promise<PrinterCapabilities>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<PrinterStatus>;
  validateMedia(media: MediaProfile): ValidationResult;
  encode(job: RenderedPrintJob, options?: EncodeOptions): Promise<Uint8Array>;
  send(data: Uint8Array): Promise<void>;
  cancel(): Promise<void>;
};

export type EncodeOptions = {
  gapMm?: number;
  mediaType?: 'gap' | 'bline' | 'continuous';
  density?: number | null;
  speed?: number | null;
  offsetXmm?: number;
  offsetYmm?: number;
};

export type PrinterProfile = {
  printerId: string;
  model: string;
  dpiX: number;
  dpiY: number;
  dotsPerMmX?: number;
  dotsPerMmY?: number;
  printableWidthMm: number;
  printableHeightMm?: number;
  adapterId: string;
  calibration?: {
    scaleX: number;
    scaleY: number;
    offsetXmm: number;
    offsetYmm: number;
  };
};
