/**
 * LabelDocument → PrintDocument converter.
 *
 * Bridges the editor's rich element model (text, images, barcodes, QR codes,
 * shapes, clipart, signatures, tables, etc.) to the universal print engine's
 * element model (text, image, barcode, qrcode, rectangle, ellipse, line).
 *
 * This is the single integration point between the editing UI and the
 * SDK-free print renderer.
 */

import {
  createPrintDocument,
  type BarcodeElementData,
  type GrayBitmap,
  type ImageElementData,
  type ImageFitMode,
  type MediaShapeKind,
  type PrintDocument,
  type PrintElement,
  type QrCodeElementData,
  type ShapeElementData,
  type TextElementData,
} from '@/printing/document/types';
import {
  elementSizeMm,
  ptToMm,
  type LabelDocument,
  type LabelElement,
  type MediaShape,
} from '@/lib/label-document';
import { DRAWING_COLORS } from '@/components/editor/types';
import { applySerialOffset } from '@/lib/serial-content';
import { canRenderWithBitmapFont } from '@/printing/renderer/text';
import { logPrintTrace } from '@/printing';

export type ConvertOptions = {
  /**
   * Callback to render a complex element that cannot be natively rasterized
   * (e.g. arctext, signature, table) into a GrayBitmap via ViewShot.
   * When null, such elements are silently skipped.
   */
  renderElementFallback?: (
    element: LabelElement,
    widthDots: number,
    heightDots: number,
    scale: number,
  ) => Promise<GrayBitmap | null>;

  /**
   * Callback to decode an image URI into a GrayBitmap.
   * Required for image elements. If not provided, image elements are skipped.
   */
  decodeImageUri?: (uri: string) => Promise<GrayBitmap | null>;

  /** DPI for computing fallback render dimensions. Default 304. */
  dpi?: number;

  /** Key-value dictionary to substitute {{placeholder}} tokens. */
  templateVariables?: Record<string, string>;
};

/**
 * Convert a LabelDocument (editor model) to a PrintDocument (print model).
 *
 * All geometry is preserved in millimetres. Element types that the universal
 * renderer supports natively (text, image, barcode, qrcode, line, rectangle,
 * ellipse) are mapped directly. Others use a ViewShot fallback.
 */
function replacePlaceholders(text: string, vars?: Record<string, string>): string {
  if (!vars || !text || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

export async function convertLabelToPrintDocument(
  doc: LabelDocument,
  options: ConvertOptions = {},
): Promise<PrintDocument> {
  const elements: PrintElement[] = [];
  const { renderElementFallback, decodeImageUri, dpi = 304, templateVariables } = options;
  const dotsPerMm = dpi === 304 ? 12 : dpi === 203 ? 8 : dpi / 25.4;

  // Only visible & printable elements
  const printable = doc.elements.filter((el) => el.needPrinting !== false);

  logPrintTrace('CONVERT_START', {
    docId: doc.id,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    elementCount: printable.length,
    totalElements: doc.elements.length,
  });

  for (const el of printable) {
    const converted = await convertElement(el, {
      renderElementFallback,
      decodeImageUri,
      dpi,
      dotsPerMm,
      docWidthMm: doc.widthMm,
      docHeightMm: doc.heightMm,
      templateVariables,
    });
    if (converted) {
      elements.push(converted);
    }
  }

  const shape = mapMediaShape(doc.mediaShape);

  logPrintTrace('CONVERT_COMPLETE', {
    docId: doc.id,
    convertedElements: elements.length,
    skippedElements: printable.length - elements.length,
    shape,
  });

  return createPrintDocument({
    id: doc.id,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    orientation: doc.orientation,
    shape,
    elements,
    safeAreaInset: (doc as any).safeAreaInset,
    cornerRadiusMm: (doc as any).cornerRadiusMm,
  });
}

type ConvertContext = {
  renderElementFallback?: ConvertOptions['renderElementFallback'];
  decodeImageUri?: ConvertOptions['decodeImageUri'];
  dpi: number;
  dotsPerMm: number;
  docWidthMm: number;
  docHeightMm: number;
  templateVariables?: Record<string, string>;
};

async function convertElement(
  el: LabelElement,
  ctx: ConvertContext,
): Promise<PrintElement | null> {
  const size = elementSizeMm(el);
  const base: Omit<PrintElement, 'type' | 'data'> = {
    id: el.id,
    xMm: el.left,
    yMm: el.top,
    widthMm: size.width,
    heightMm: size.height,
    rotation: el.rotation,
    opacity: el.opacity,
    visible: true,
  };

  switch (el.type) {
    case 'text':
      return convertText(el, base, ctx);
    case 'degrees':
      return convertDegrees(el, base, ctx);
    case 'time':
      return convertTime(el, base);
    case 'image':
      return convertImage(el, base, ctx);
    case 'barcode':
      return convertBarcode(el, base, ctx);
    case 'qrcode':
      return convertQrCode(el, base, ctx);
    case 'line':
      return { ...base, type: 'line', data: null };
    case 'shape':
      return convertShape(el, base);
    case 'clipart':
    case 'border':
    case 'signature':
    case 'table':
    case 'arctext':
      return convertViaFallback(el, base, ctx);
    default:
      return null;
  }
}

function convertText(
  el: LabelElement & { type: 'text' },
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): PrintElement {
  const rawText =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.text;
  const text = replacePlaceholders(rawText, ctx.templateVariables);
  const displayText = el.verticalDisplay ? text.split('').join('\n') : text;

  // For non-Latin text, mark it so the renderer can use the fallback
  const fontSizeMm = ptToMm(el.fontSize);
  const data: TextElementData = {
    text: displayText,
    fontSizeMm,
    bold: el.bold,
    align: el.align === 'spacing' ? 'left' : el.align === 'justify' ? 'left' : el.align,
    inverted: el.antiColor,
  };

  return { ...base, type: 'text', data };
}

function convertDegrees(
  el: LabelElement & { type: 'degrees' },
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): PrintElement {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content;
  const resolved =
    el.contentType === 'Degrees'
      ? applySerialOffset(content, el.degreesOffset, 1)
      : content;
  const textAfterVars = replacePlaceholders(resolved, ctx.templateVariables);
  const text = el.verticalDisplay ? textAfterVars.split('').join('\n') : textAfterVars;

  const data: TextElementData = {
    text,
    fontSizeMm: ptToMm(el.fontSize),
    bold: el.bold,
    align: el.align === 'spacing' ? 'left' : el.align === 'justify' ? 'left' : el.align,
    inverted: el.antiColor,
  };

  return { ...base, type: 'text', data };
}

function convertTime(
  el: LabelElement & { type: 'time' },
  base: Omit<PrintElement, 'type' | 'data'>,
): PrintElement {
  const now = new Date();
  const adjusted = new Date(now);
  adjusted.setDate(adjusted.getDate() + el.offsetDay);
  adjusted.setHours(adjusted.getHours() + el.offsetHour);
  adjusted.setMinutes(adjusted.getMinutes() + el.offsetMinute);
  adjusted.setSeconds(adjusted.getSeconds() + el.offsetSecond);

  const year = adjusted.getFullYear();
  const month = `${adjusted.getMonth() + 1}`.padStart(2, '0');
  const day = `${adjusted.getDate()}`.padStart(2, '0');
  const hours = `${adjusted.getHours()}`.padStart(2, '0');
  const minutes = `${adjusted.getMinutes()}`.padStart(2, '0');
  const seconds = `${adjusted.getSeconds()}`.padStart(2, '0');
  const text = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const data: TextElementData = {
    text,
    fontSizeMm: ptToMm(el.fontSize),
    bold: el.bold,
    align: el.align === 'spacing' ? 'left' : el.align === 'justify' ? 'left' : el.align,
    inverted: el.antiColor,
  };

  return { ...base, type: 'text', data };
}

async function convertImage(
  el: LabelElement & { type: 'image' },
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): Promise<PrintElement | null> {
  if (!ctx.decodeImageUri) {
    logPrintTrace('CONVERT_SKIP', { id: el.id, type: 'image', reason: 'no decodeImageUri callback' });
    return null;
  }

  const gray = await ctx.decodeImageUri(el.printUri || el.uri);
  if (!gray) {
    logPrintTrace('CONVERT_SKIP', { id: el.id, type: 'image', reason: 'decode returned null' });
    return null;
  }

  const fit: ImageFitMode = el.contentFit === 'contain' ? 'fit' : el.contentFit === 'cover' ? 'fill' : 'stretch';
  const dither = el.colorMode === 'Halftone';

  const data: ImageElementData = { gray, fit, dither };
  return { ...base, type: 'image', data };
}

function convertBarcode(
  el: LabelElement & { type: 'barcode' },
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): PrintElement {
  const rawPayload =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content;
  const payload = replacePlaceholders(rawPayload, ctx.templateVariables);

  const data: BarcodeElementData = {
    payload,
    symbology: 'code128',
  };

  return { ...base, type: 'barcode', data };
}

function convertQrCode(
  el: LabelElement & { type: 'qrcode' },
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): PrintElement {
  const rawPayload =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content;
  const payload = replacePlaceholders(rawPayload, ctx.templateVariables);

  const data: QrCodeElementData = { payload };
  return { ...base, type: 'qrcode', data };
}

function convertShape(
  el: LabelElement & { type: 'shape' },
  base: Omit<PrintElement, 'type' | 'data'>,
): PrintElement {
  const isEllipse = el.figureShape === 'oval' || el.figureShape === 'circle';

  const data: ShapeElementData = {
    fill: el.fill,
    strokeMm: el.lineWidth,
  };

  return {
    ...base,
    type: isEllipse ? 'ellipse' : 'rectangle',
    data,
  };
}

/**
 * Fallback: render complex elements (arctext, signature, table, clipart, border)
 * via the provided ViewShot callback, then inject as image elements.
 */
async function convertViaFallback(
  el: LabelElement,
  base: Omit<PrintElement, 'type' | 'data'>,
  ctx: ConvertContext,
): Promise<PrintElement | null> {
  if (!ctx.renderElementFallback) {
    logPrintTrace('CONVERT_SKIP', {
      id: el.id,
      type: el.type,
      reason: 'no renderElementFallback callback',
    });
    return null;
  }

  const size = elementSizeMm(el);
  const widthDots = Math.round(size.width * ctx.dotsPerMm);
  const heightDots = Math.round(size.height * ctx.dotsPerMm);

  try {
    const gray = await ctx.renderElementFallback(el, widthDots, heightDots, ctx.dotsPerMm);
    if (!gray) return null;

    const data: ImageElementData = { gray, fit: 'stretch' };
    return { ...base, type: 'image', data };
  } catch (error) {
    logPrintTrace('CONVERT_FALLBACK_ERROR', {
      id: el.id,
      type: el.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function mapMediaShape(shape: MediaShape | undefined): MediaShapeKind {
  if (!shape) return 'rectangle';
  switch (shape) {
    case 'rectangle': return 'rectangle';
    case 'roundedRectangle': return 'roundedRectangle';
    case 'circle': return 'circle';
    case 'ellipse': return 'ellipse';
    case 'diecut': return 'diecut';
    default: return 'rectangle';
  }
}
