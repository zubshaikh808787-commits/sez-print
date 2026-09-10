/**
 * Shared 14.3 × 63.5 + 38.1 rat-tail content.
 * Design coordinates are millimetres on the 101.6 × 14.3 bounding canvas
 * (paddle left, empty tail right). Physical wrap stock is portrait:
 * 14.3 mm across the head × 101.6 mm along the feed — print rotates 90° CW
 * so the paddle exits first and the strap stays blank.
 */

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
} from '@/components/editor/types';
import { textBlockHeightMm } from '@/lib/element-sizing';
import {
  canvasMmFromGeometry,
  RAT_TAIL_143,
} from '@/lib/media-geometry';
import { generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';

export const RAT_TAIL_143_PREVIEW_CABLE = 'cable-rattail-143x635';
export const RAT_TAIL_143_PREVIEW_JEWELRY = 'jew-rattail-143x635';

export const RAT_TAIL_143_PRINT = {
  /** TSPL / JOSH SIZE — 14.3 mm web, 101.6 mm pitch. */
  widthMm: 14.3,
  heightMm: 101.6,
  printDpi: 304,
  /** Rotate the 101.6 × 14.3 capture so the paddle prints first. */
  captureOrientation: 90 as const,
} as const;

type Frame = { left: number; top: number; width: number; height?: number };

function lockLayer<T extends LabelElement>(el: T): T {
  return { ...el, lockMovement: true };
}

function textEl(
  frame: Frame,
  content: string,
  fontSize: number,
  extra: Partial<typeof DEFAULT_ELEMENT_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: generateId(),
    type: 'text',
    text: content,
    fontSize,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: extra.height ?? textBlockHeightMm(fontSize, content.split('\n').length),
    autoWrapping: 'Word',
    drawingColorIndex: 1,
    ...extra,
    lockMovement: true,
  };
}

function barcodeEl(
  frame: Frame,
  content: string,
  extra: Partial<typeof DEFAULT_BARCODE_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? 8,
    textFlag: extra.textFlag ?? 'Bottom',
    drawingColorIndex: 1,
    ...extra,
    lockMovement: true,
  };
}

/** Printed fold / partition in the body — not the die-cut outline. */
function dividerEl(left: number, top: number, height: number): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left,
    top,
    width: 0.22,
    height,
    lineStyle: 'dashed',
    virtualInterval: 1.15,
    drawingColorIndex: 1,
    lockMovement: true,
    needPrinting: true,
  };
}

export function isRatTail143PreviewType(previewType?: string | null): boolean {
  return previewType === RAT_TAIL_143_PREVIEW_CABLE || previewType === RAT_TAIL_143_PREVIEW_JEWELRY;
}

export function isRatTail143Document(doc?: {
  templatePreviewType?: string | null;
  mediaGeometry?: LabelDocument['mediaGeometry'];
} | null): boolean {
  if (!doc) return false;
  if (isRatTail143PreviewType(doc.templatePreviewType)) return true;
  const g = doc.mediaGeometry;
  return (
    g?.type === 'rat_tail' &&
    Math.abs(g.bodyWidthMm - RAT_TAIL_143.bodyWidthMm) < 0.4 &&
    Math.abs(g.bodyHeightMm - RAT_TAIL_143.bodyHeightMm) < 0.4 &&
    Math.abs(g.tailLengthMm - RAT_TAIL_143.tailLengthMm) < 0.4
  );
}

/**
 * Reference layout: horizontal barcode (~40% of the 63.5 mm body) | dashed
 * divider | three left-aligned product lines. Tail on the right is empty.
 * Frames are locked; only text / barcode values are editable.
 */
export function buildRatTail143Elements(): LabelElement[] {
  const bodyW = RAT_TAIL_143.bodyWidthMm;
  const h = RAT_TAIL_143.bodyHeightMm;
  const inset = 1.15;
  const dividerX = bodyW * 0.39;
  const barW = dividerX - inset * 2;
  const textLeft = dividerX + 1.15;
  const textW = bodyW - textLeft - inset;
  const typePt = 6.25;
  const lineH = textBlockHeightMm(typePt, 1);
  const textBlockH = lineH * 3 + 0.35;
  const textTop = Math.max(inset, (h - textBlockH) / 2);

  return [
    barcodeEl(
      { left: inset, top: inset, width: barW, height: h - inset * 2 },
      '837654163481',
      { encodeMode: 'UPC-A', textFlag: 'Bottom', fontSize: 5.5 },
    ),
    dividerEl(dividerX, inset, h - inset * 2),
    textEl({ left: textLeft, top: textTop, width: textW }, "Men's Comfort Band", typePt, {
      bold: true,
    }),
    textEl(
      { left: textLeft, top: textTop + lineH + 0.18, width: textW },
      '14K Gold, 10.5 Size, 22',
      typePt,
    ),
    textEl({ left: textLeft, top: textTop + lineH * 2 + 0.36, width: textW }, 'grams', typePt),
  ];
}

/**
 * Snap this SKU back to factory millimetres and locked frames.
 * Text and barcode values from the saved document are kept.
 */
export function refitRatTail143Document(doc: LabelDocument): LabelDocument {
  const box = canvasMmFromGeometry(RAT_TAIL_143);
  const previewType = isRatTail143PreviewType(doc.templatePreviewType)
    ? doc.templatePreviewType!
    : RAT_TAIL_143_PREVIEW_CABLE;
  const slots = buildRatTail143Elements();
  const existingBarcode = doc.elements.find((el) => el.type === 'barcode');
  const existingTexts = doc.elements.filter((el) => el.type === 'text');

  const elements = slots.map((slot, index) => {
    const stableId = `${previewType}__${index}`;
    if (slot.type === 'barcode' && existingBarcode?.type === 'barcode') {
      return lockLayer({
        ...slot,
        id: existingBarcode.id || stableId,
        content: existingBarcode.content || slot.content,
        encodeMode: existingBarcode.encodeMode || slot.encodeMode,
        textFlag: existingBarcode.textFlag ?? slot.textFlag,
      });
    }
    if (slot.type === 'text') {
      const textIndex = slots.slice(0, index).filter((el) => el.type === 'text').length;
      const existing = existingTexts[textIndex];
      if (existing?.type === 'text') {
        return lockLayer({
          ...slot,
          id: existing.id || stableId,
          text: existing.text,
          bold: existing.bold,
        });
      }
    }
    return lockLayer({ ...slot, id: slot.id || stableId });
  });

  return {
    ...doc,
    widthMm: box.widthMm,
    heightMm: box.heightMm,
    mediaShape: 'diecut',
    mediaGeometry: { ...RAT_TAIL_143 },
    background: { type: 'none' },
    elements,
  };
}

export function ratTail143PrintPaper(): { widthMm: number; heightMm: number } {
  return { widthMm: RAT_TAIL_143_PRINT.widthMm, heightMm: RAT_TAIL_143_PRINT.heightMm };
}
