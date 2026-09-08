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
export {
  TsplBuilder,
  setSize,
  setGap,
  setBline,
  clear,
  drawBox,
  drawCircle,
  drawText,
  drawBarcode,
  drawQrCode,
  printCommand,
  type TextOptions,
  type BarcodeOptions,
  type QrCodeOptions,
  type TsplBuilderOptions,
} from '@/printing/tspl-builder';
export {
  PRINTER_DPI,
  DOTS_PER_MM,
  computeDotsPerMm,
  calculateCalibrationAdjustment,
  generateCalibrationTspl,
  type SupportedDpi,
  type CalibrationAdjustment,
  type CalibrationBoxParams,
  type CalibrationBoxResult,
} from '@/printing/calibration';
export {
  exportCanvasToTspl,
  exportCanvasBoundaryToTspl,
  exportCanvasBoundaryJob,
  mmToScreenPx,
  screenPxToMm,
  computeScreenFitScale,
  applyDragToMm,
  applyResizeToMm,
  generateRulerTicks,
  resolveTsplFont,
  tsplFontHeightMm,
  calculateCode128WidthMm,
  resolveQrCellWidth,
  calculateQrFootprintMm,
  validateScannability,
  snapToGridMm,
  getElementFootprintMm,
  moveElementInCanvas,
  resizeElementInCanvas,
  rotateElementInCanvas,
  reorderElementInCanvas,
  deleteElementInCanvas,
  CanvasHistoryManager,
  createMonochromePatternRaster,
  exportUnifiedCanvasJob,
  substituteSequencePlaceholders,
  exportBatchCanvasJob,
  validateCanvasPrintJob,
  type CanvasBoxElement,
  type CanvasTextElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasElement,
  type CanvasDocument,
  type BackgroundReference,
  type RulerTick,
  type TsplFontResolution,
  type ScannabilityResult,
  type ExportCanvasOptions,
  type ResizeHandle,
  type ReorderAction,
  type CanvasBitmapRaster,
  type CanvasPrintJobResult,
  type ExportCanvasJobOptions,
  type MediaSensorType,
  type BatchJobOptions,
  type BatchPrintJobResult,
  type PrintValidationIssue,
  type PrintValidationReport,
} from '@/printing/canvas-export';
export {
  detectLabelContour,
  createSyntheticLabelImage,
  generateShapeBoundaryRaster,
  type LabelShapeType,
  type LabelShapeDefinition,
  type DetectedLabelShape,
  type ContourDetectOptions,
} from '@/printing/contour-detection';


