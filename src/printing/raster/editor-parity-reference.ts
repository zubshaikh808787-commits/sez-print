/**
 * Flag-off (ViewShot) geometry at 1 printer dot per pixel.
 * Recreates BarcodeContent stretch, BorderPreview padding, and QR meet — not the headless visitors.
 */

import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { formatBarcodeHri } from '@/lib/barcode/hri';
import { elementSizeMm, ptToMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { contractLineAdvances, layoutPrintText } from '@/lib/text-metrics';
import { dotsPerMm, mmToDots, rectMmToDots } from '@/lib/printer/print-spec';
import { sortLayers } from '@/lib/template-schema';
import { drawQrMeet } from './qr-meet';
import { fillRect, makeDotSurface, type DotSurface } from './dot-surface';
import { packedPageDots } from './skia-rasterizer';
import { stretchThenRoundBars } from './barcode-stretch';
import { drawPrintBorder } from './print-border';

function drawBlockText(dot: DotSurface, text: string, x: number, y: number, fontH: number): void {
  const cellW = Math.max(1, Math.round(fontH * 0.55));
  const cellH = Math.max(1, fontH);
  let cx = x;
  for (const ch of text) {
    if (ch !== ' ') fillRect(dot, cx, y, Math.max(1, cellW - 1), Math.max(1, cellH - 1), 0);
    cx += cellW;
  }
}

function measureBlockWidth(text: string, fontH: number): number {
  return text.length * Math.max(1, Math.round(fontH * 0.55));
}

function drawEditorBarcode(dot: DotSurface, el: Extract<LabelElement, { type: 'barcode' }>, dpi: number): void {
  const dpm = dotsPerMm(dpi);
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || '0123456789';
  const rawModules = barcodeModulesForMode(el.encodeMode, content);
  if (!rawModules) return;
  const snapped = snap1DBarcodeModules(rawModules, el.width, 203, false);
  if (!snapped) return;
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const boxW = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const boxH = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  const fontH = Math.max(8, Math.round(ptToMm(el.fontSize) * dpm));
  const showLabel = el.textFlag !== 'Hide';
  const labelH = showLabel ? Math.max(8, Math.round(fontH * 1.2)) : 0;
  const barsH = Math.max(2, boxH - labelH);
  const barsY = el.textFlag === 'Top' ? y0 + labelH : y0;
  const rounded = stretchThenRoundBars(snapped.bars, x0, boxW);
  for (const bar of rounded) {
    fillRect(dot, bar.x0, barsY, bar.width, barsH, 0);
  }
  if (showLabel) {
    const hri = formatBarcodeHri(el.encodeMode, content);
    const labelY = el.textFlag === 'Top' ? y0 : y0 + barsH;
    const lineW = measureBlockWidth(hri, fontH);
    let tx = x0;
    if (el.align === 'center') tx = x0 + Math.max(0, Math.floor((boxW - lineW) / 2));
    else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
    drawBlockText(dot, hri, tx, labelY + Math.floor((labelH - fontH) / 2), fontH);
  }
}

function drawEditorQr(dot: DotSurface, el: Extract<LabelElement, { type: 'qrcode' }>, dpi: number): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || 'https://example.com';
  if (el.encodeMode && el.encodeMode !== 'QRCode') return;
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const boxW = Math.max(1, mmToDots(el.left + el.width, dpi) - x0);
  const boxH = Math.max(1, mmToDots(el.top + el.height, dpi) - y0);
  drawQrMeet(
    { fillRect: (x, y, w, h, gray) => fillRect(dot, x, y, w, h, gray) },
    content,
    (el.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M',
    Math.max(0, parseInt(String(el.zoneSize), 10) || 0),
    x0,
    y0,
    boxW,
    boxH,
    0,
  );
}

function drawEditorText(dot: DotSurface, el: Extract<LabelElement, { type: 'text' }>, dpi: number): void {
  const dpm = dotsPerMm(dpi);
  const size = elementSizeMm(el);
  const rect = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  const x0 = rect.x0;
  const y0 = rect.y0;
  const boxW = Math.max(1, rect.widthDots);
  const boxH = Math.max(1, rect.heightDots);
  const raw =
    el.contentType === 'Data Source' && el.columnNameContent ? `{${el.columnNameContent}}` : el.text;
  const layout = layoutPrintText({
    text: raw,
    fontSize: el.fontSize,
    widthMm: el.width,
    autoWrapping: el.autoWrapping,
    lineSpacing: el.lineSpacing,
    charSpacing: el.charSpacing,
    bold: el.bold,
    verticalDisplay: el.verticalDisplay,
  });
  const fontH = Math.max(1, Math.round(ptToMm(el.fontSize) * dpm));
  const lineH = Math.max(1, Math.round(layout.lineHeightMm * dpm));
  const blockH = Math.max(lineH, layout.lines.length * lineH);
  let ty = y0 + Math.floor((boxH - blockH) / 2);
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const next = ty + lineH;
    if (next > y0 && ty < y0 + boxH && line.length > 0) {
      const lineW = Math.max(1, Math.round(layout.widthsMm[i] * dpm));
      let tx = x0;
      if (el.align === 'center') tx = x0 + Math.floor((boxW - lineW) / 2);
      else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
      const advances = contractLineAdvances(line, el.bold ?? false, lineW);
      let cx = tx;
      for (let c = 0; c < line.length; c++) {
        const w = advances[c] ?? 0;
        if (line[c] !== ' ' && w > 0) fillRect(dot, cx, ty, w, fontH, 0);
        cx += w;
      }
    }
    ty = next;
  }
}

/** Same packed grid as printMonoLabel / printPngLabelNative (no ViewShot; editor math). */
export function rasterizeEditorParityReference(doc: LabelDocument, dpi: number): {
  widthDots: number;
  heightDots: number;
  gray: Uint8Array;
} {
  const { packedW, packedH } = packedPageDots(doc.widthMm, doc.heightMm, dpi);
  const dot = makeDotSurface(packedW, packedH);
  for (const el of sortLayers(doc.elements)) {
    if (el.needPrinting === false || el.visible === false) continue;
    switch (el.type) {
      case 'text':
        drawEditorText(dot, el, dpi);
        break;
      case 'barcode':
        drawEditorBarcode(dot, el, dpi);
        break;
      case 'qrcode':
        drawEditorQr(dot, el, dpi);
        break;
      case 'border':
        drawPrintBorder(
          {
            fillRect: (x, y, w, h, gray) => fillRect(dot, x, y, w, h, gray),
          },
          el,
          dpi,
          1,
          { bitmapWidthDots: packedW, bitmapHeightDots: packedH },
        );
        break;
      default:
        break;
    }
  }
  return { widthDots: packedW, heightDots: packedH, gray: dot.gray };
}

export type RegionId = 'bars' | 'digits' | 'border' | 'text' | 'qr';

export function frozenFixtureRegions(dpi: number): Record<RegionId, { x: number; y: number; w: number; h: number }> {
  const dpm = dotsPerMm(dpi);
  const fontH = Math.max(8, Math.round(ptToMm(8) * dpm));
  const labelH = Math.max(8, Math.round(fontH * 1.2));
  const barBoxH = Math.round(12 * dpm);
  const barsH = Math.max(2, barBoxH - labelH);
  return {
    text: {
      x: Math.round(3 * dpm),
      y: Math.round(3 * dpm),
      w: Math.round(44 * dpm),
      h: Math.round(8 * dpm),
    },
    bars: {
      x: Math.round(3 * dpm),
      y: Math.round(12 * dpm),
      w: Math.round(28 * dpm),
      h: barsH,
    },
    digits: {
      x: Math.round(3 * dpm),
      y: Math.round(12 * dpm) + barsH,
      w: Math.round(28 * dpm),
      h: labelH,
    },
    qr: {
      x: Math.round(34 * dpm),
      y: Math.round(12 * dpm),
      w: Math.round(13 * dpm),
      h: Math.round(13 * dpm),
    },
    border: {
      x: Math.round(1 * dpm),
      y: Math.round(1 * dpm),
      w: Math.round(48 * dpm),
      h: Math.round(28 * dpm),
    },
  };
}
