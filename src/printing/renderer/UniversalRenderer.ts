import type {
  BarcodeElementData,
  GrayBitmap,
  ImageElementData,
  PrintDocument,
  QrCodeElementData,
  ShapeElementData,
  TextElementData,
} from '@/printing/document/types';
import { createPrintDocument, type MediaProfile } from '@/printing/document/types';
import { mmToDotsX, pageSizeDots, rectMmToDots, type AxisDpi } from '@/printing/geometry/units';
import {
  applyShapeMask,
  blitGray,
  createWhiteGray,
  ditherGray,
  fillEllipse,
  fillRect,
  flipGrayVertical,
  strokeRect,
  thresholdGray,
  withDpi,
  type RenderedBitmap,
} from '@/printing/raster/bitmap';
import { drawCode128 } from '@/printing/renderer/barcode';
import { drawQrCode } from '@/printing/renderer/qrcode';
import { drawText } from '@/printing/renderer/text';

export type RenderConfiguration = {
  dpiX: number;
  dpiY: number;
  dotsPerMmX?: number;
  dotsPerMmY?: number;
  printableWidthMm: number;
  printableHeightMm: number;
  colorMode: 'mono' | 'grayscale';
  rasterMode: '1bpp' | '8bpp';
  threshold?: number;
  /** Photographic content only. Never used for barcode / QR / text. */
  ditherPhotos?: boolean;
  /** Preview top = toward printer; many TSPL heads print row 0 first (exit). */
  flipY?: boolean;
};

export type RenderedPrintJob = {
  documentId: string;
  widthMm: number;
  heightMm: number;
  widthDots: number;
  heightDots: number;
  dpiX: number;
  dpiY: number;
  bitmap: RenderedBitmap;
  copies: number;
};

export type CalibrationProfile = {
  scaleX: number;
  scaleY: number;
  offsetXmm: number;
  offsetYmm: number;
};

function axisOf(config: RenderConfiguration): AxisDpi {
  return {
    dpiX: config.dpiX,
    dpiY: config.dpiY,
    dotsPerMmX: config.dotsPerMmX,
    dotsPerMmY: config.dotsPerMmY,
  };
}

function isImageData(data: unknown): data is ImageElementData {
  return Boolean(data && typeof data === 'object' && 'gray' in data && 'fit' in data);
}

function isBarcodeData(data: unknown): data is BarcodeElementData {
  return Boolean(data && typeof data === 'object' && 'payload' in data && !('type' in data));
}

function isTextData(data: unknown): data is TextElementData {
  return Boolean(data && typeof data === 'object' && 'text' in data && 'fontSizeMm' in data);
}

function isQrCodeData(data: unknown): data is QrCodeElementData {
  return Boolean(data && typeof data === 'object' && 'payload' in data);
}

/**
 * SDK-independent rasterizer. PrintDocument millimetres → printer-dot bitmap.
 * Does not import any printer native module or vendor SDK.
 */
export function renderPrintDocument(
  document: PrintDocument,
  media: MediaProfile,
  config: RenderConfiguration,
  copies = 1,
): RenderedPrintJob {
  const axis = axisOf(config);
  const widthMm = media.widthMm;
  const heightMm = media.heightMm;
  const page = pageSizeDots(widthMm, heightMm, axis);
  const canvas: GrayBitmap = createWhiteGray(page.widthDots, page.heightDots);

  const ordered = [...document.elements].filter((el) => el.visible !== false);

  for (const el of ordered) {
    const box = rectMmToDots(el.xMm, el.yMm, el.widthMm, el.heightMm, axis);
    if (el.type === 'image' && isImageData(el.data)) {
      let src = el.data.gray;
      if (el.data.dither || (config.ditherPhotos && el.data.fit !== 'original')) {
        src = ditherGray(src);
      }
      blitGray(canvas, src, box.x0, box.y0, box.widthDots, box.heightDots, el.data.fit);
      continue;
    }
    if (el.type === 'barcode' && isBarcodeData(el.data)) {
      drawCode128(canvas, el.data.payload, box.x0, box.y0, box.widthDots, box.heightDots);
      continue;
    }
    if (el.type === 'rectangle') {
      const shape = (el.data ?? {}) as ShapeElementData;
      if (shape.fill === false) {
        const strokeDots = Math.max(1, mmToDotsX(shape.strokeMm ?? 0.35, axis));
        strokeRect(canvas, box.x0, box.y0, box.widthDots, box.heightDots, strokeDots, 0);
      } else {
        fillRect(canvas, box.x0, box.y0, box.widthDots, box.heightDots, 0);
      }
      continue;
    }
    if (el.type === 'ellipse') {
      fillEllipse(canvas, box.x0, box.y0, box.widthDots, box.heightDots, 0);
      continue;
    }
    if (el.type === 'line') {
      fillRect(canvas, box.x0, box.y0, Math.max(1, box.widthDots), Math.max(1, box.heightDots), 0);
      continue;
    }
    if (el.type === 'text' && isTextData(el.data)) {
      const fontSizeDots = mmToDotsX(el.data.fontSizeMm, axis);
      drawText(canvas, el.data.text, box.x0, box.y0, box.widthDots, box.heightDots, fontSizeDots, {
        bold: el.data.bold,
        align: el.data.align,
        inverted: el.data.inverted,
      });
      continue;
    }
    if (el.type === 'qrcode' && isQrCodeData(el.data)) {
      drawQrCode(canvas, el.data.payload, box.x0, box.y0, box.widthDots, box.heightDots);
      continue;
    }
  }

  const cornerRadiusMm = media.cornerRadiusMm ?? document.cornerRadiusMm;
  const cornerRadiusDots =
    cornerRadiusMm != null && cornerRadiusMm > 0 ? mmToDotsX(cornerRadiusMm, axis) : undefined;
  applyShapeMask(canvas, document.shape || media.shape, cornerRadiusDots);

  let gray = canvas;
  if (config.flipY) gray = flipGrayVertical(gray);

  let bitmap: RenderedBitmap;
  if (config.rasterMode === '8bpp') {
    bitmap = {
      widthDots: gray.width,
      heightDots: gray.height,
      dpiX: config.dpiX,
      dpiY: config.dpiY,
      pixelFormat: '8bpp',
      data: gray.gray,
    };
  } else {
    bitmap = withDpi(thresholdGray(gray, config.threshold ?? 128), axis);
  }

  return {
    documentId: document.id,
    widthMm,
    heightMm,
    widthDots: bitmap.widthDots,
    heightDots: bitmap.heightDots,
    dpiX: config.dpiX,
    dpiY: config.dpiY,
    bitmap,
    copies: Math.max(1, copies),
  };
}

export function createArtworkDocument(params: {
  widthMm: number;
  heightMm: number;
  gray: GrayBitmap;
  fit?: ImageElementData['fit'];
  shape?: PrintDocument['shape'];
  dither?: boolean;
}): PrintDocument {
  return createPrintDocument({
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    shape: params.shape ?? 'rectangle',
    elements: [
      {
        id: 'artwork',
        type: 'image',
        xMm: 0,
        yMm: 0,
        widthMm: params.widthMm,
        heightMm: params.heightMm,
        rotation: 0,
        visible: true,
        data: {
          gray: params.gray,
          fit: params.fit ?? 'stretch',
          dither: params.dither,
        } satisfies ImageElementData,
      },
    ],
  });
}
