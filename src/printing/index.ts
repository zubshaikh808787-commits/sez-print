/**
 * Universal print engine — no printer SDK imports.
 */

export type {
  PrintDocument,
  PrintElement,
  MediaProfile,
  GrayBitmap,
  ImageFitMode,
  MediaShapeKind,
  TextElementData,
  QrCodeElementData,
  ImageElementData,
  BarcodeElementData,
  ShapeElementData,
} from '@/printing/document/types';
export { createPrintDocument, ZERO_MARGINS } from '@/printing/document/types';
export { MEDIA_PROFILES, mediaFromSize } from '@/printing/document/media';
export {
  MM_PER_INCH,
  mmToDotsX,
  mmToDotsY,
  dotsToMmX,
  dotsToMmY,
  rectMmToDots,
  pageSizeDots,
  type AxisDpi,
  type DotRect,
} from '@/printing/geometry/units';
export {
  renderPrintDocument,
  createArtworkDocument,
  type RenderConfiguration,
  type RenderedPrintJob,
} from '@/printing/renderer/UniversalRenderer';
export { createPhysicalProofDocument } from '@/printing/renderer/physical-proof';
export { logPrintTrace } from '@/printing/trace';
export type { RenderedBitmap } from '@/printing/raster/bitmap';
export type {
  PrinterAdapter,
  PrinterCapabilities,
  PrinterProfile,
  ValidationResult,
} from '@/printing/printer/types';
export { validatePrintRequest } from '@/printing/printer/validate';
export { PrintQueue, defaultPrintQueue } from '@/printing/printer/PrintQueue';
export {
  convertLabelToPrintDocument,
  type ConvertOptions,
} from '@/printing/document/convert';
