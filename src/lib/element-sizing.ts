import { mmToPt, ptToMm, type LabelDocument, type LabelElement } from '@/lib/label-document';

const PAD_RATIO = 0.05;
const MIN_PAD_MM = 0.6;

function padMm(widthMm: number, heightMm: number) {
  return Math.max(MIN_PAD_MM, Math.min(widthMm, heightMm) * PAD_RATIO);
}

function bboxOf(element: LabelElement) {
  if (element.type === 'text' || element.type === 'degrees') {
    const source = 'text' in element ? element.text : element.content;
    const lines = Math.max(1, source.split('\n').length);
    return {
      left: element.left,
      top: element.top,
      width: element.width,
      height: textBlockHeightMm(element.fontSize, lines),
    };
  }
  if (element.type === 'time') {
    return {
      left: element.left,
      top: element.top,
      width: element.width,
      height: textBlockHeightMm(element.fontSize, 1),
    };
  }
  return {
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
  };
}

/** Typical body-line font (pt) for this label — not a title that fills the pad. */
export function fitFontSizePt(widthMm: number, heightMm: number, lines = 1) {
  const perLineMm = Math.max(2.2, (heightMm * 0.26) / Math.max(1, lines));
  const fromHeight = mmToPt(perLineMm / 1.25);
  const fromWidth = mmToPt(widthMm * 0.12);
  const pt = Math.min(fromHeight, fromWidth);
  return Math.max(6, Math.min(Math.round(pt * 2) / 2, 28));
}

export function fitTextWidth(widthMm: number) {
  const pad = padMm(widthMm, widthMm);
  return Math.max(8, widthMm - pad * 2);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function existingTextFonts(existing: LabelElement[]) {
  return existing.flatMap((el) =>
    el.type === 'text' || el.type === 'time' || el.type === 'degrees' || el.type === 'arctext'
      ? [el.fontSize]
      : [],
  );
}

/** Drop a new block into free space instead of covering template content. */
function placeInLabel(
  widthMm: number,
  heightMm: number,
  boxW: number,
  boxH: number,
  existing: LabelElement[],
) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.min(boxW, Math.max(4, widthMm - pad * 2));
  const height = Math.min(boxH, Math.max(2, heightMm - pad * 2));

  if (existing.length === 0) {
    return { left: pad, top: pad, width, height };
  }

  let lowest = 0;
  for (const el of existing) {
    const box = bboxOf(el);
    lowest = Math.max(lowest, box.top + box.height);
  }

  const topBelow = lowest + pad;
  if (topBelow + height <= heightMm - pad * 0.5) {
    return { left: pad, top: topBelow, width, height };
  }

  // No vertical room — tuck into the top-left with a small offset so it stays selectable.
  const offset = Math.min(3, Math.max(1.2, Math.min(widthMm, heightMm) * 0.06));
  return {
    left: Math.min(pad + offset, Math.max(0, widthMm - width)),
    top: Math.min(pad + offset, Math.max(0, heightMm - height)),
    width,
    height,
  };
}

export function fitTextDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const fonts = existingTextFonts(existing);
  const fromExisting = median(fonts);
  const fontSize = fromExisting
    ? Math.max(6, Math.min(28, Math.round(fromExisting * 2) / 2))
    : fitFontSizePt(widthMm, heightMm, 1);
  const boxH = textBlockHeightMm(fontSize, 1);
  const boxW = Math.max(10, Math.min(fitTextWidth(widthMm), widthMm * 0.78));
  const placed = placeInLabel(widthMm, heightMm, boxW, boxH, existing);
  return { left: placed.left, top: placed.top, width: placed.width, fontSize };
}

export function fitBarcodeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(10, widthMm - pad * 2);
  const height = Math.max(4, Math.min(heightMm * 0.36, 12));
  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    fontSize: Math.max(6, Math.min(mmToPt(heightMm * 0.1), 9)),
  };
}

export function fitQrcodeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const size = Math.max(6, Math.min(widthMm - pad * 2, heightMm - pad * 2, widthMm * 0.4, heightMm * 0.48));
  const placed = placeInLabel(widthMm, heightMm, size, size, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}

export function fitLineDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(8, widthMm - pad * 2);
  const placed = placeInLabel(widthMm, heightMm, width, 0.4, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: 0.4,
  };
}

export function fitShapeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(8, Math.min(widthMm - pad * 2, widthMm * 0.7));
  const height = Math.max(6, Math.min(heightMm - pad * 2, heightMm * 0.45));
  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}

export function fitTimeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  return fitTextDefaults(widthMm, heightMm, existing);
}

export function fitTableDefaults(
  widthMm: number,
  heightMm: number,
  rows: number,
  columns: number,
  existing: LabelElement[] = [],
) {
  const pad = padMm(widthMm, heightMm);
  const w = Math.max(12, Math.min(widthMm - pad * 2, widthMm * 0.9));
  const h = Math.max(8, Math.min(heightMm - pad * 2, heightMm * 0.55));
  const placed = placeInLabel(widthMm, heightMm, w, h, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    rowHeights: Array.from({ length: rows }, () => placed.height / rows),
    columnWidths: Array.from({ length: columns }, () => placed.width / columns),
  };
}

export function fitClipartDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const size = Math.max(5, Math.min(widthMm * 0.28, heightMm * 0.38));
  const placed = placeInLabel(widthMm, heightMm, size, size, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}

/** Height in mm for a text-like element (matches renderer line metrics). */
export function textBlockHeightMm(fontSizePt: number, lines: number) {
  return Math.max(2.4, ptToMm(fontSizePt) * 1.25 * Math.max(1, lines));
}

/** Clamp element position/size so it stays inside the label. */
export function clampElementToLabel(element: LabelElement, doc: Pick<LabelDocument, 'widthMm' | 'heightMm'>) {
  const size = bboxOf(element);
  const maxW = doc.widthMm;
  const maxH = doc.heightMm;
  let width = Math.min(Math.max(3, size.width), maxW);
  let height = Math.min(Math.max(2, size.height), maxH);
  let left = element.left;
  let top = element.top;

  if (width > maxW - 0.4) width = Math.max(3, maxW - 0.8);
  if (height > maxH - 0.4) height = Math.max(2, maxH - 0.8);
  left = Math.min(Math.max(0, left), Math.max(0, maxW - width));
  top = Math.min(Math.max(0, top), Math.max(0, maxH - height));

  const patch: Record<string, unknown> = { left, top, width };

  if ('height' in element && typeof element.height === 'number' && element.type !== 'line') {
    patch.height = height;
  }

  if (element.type === 'text' || element.type === 'degrees' || element.type === 'time') {
    const lines =
      element.type === 'time'
        ? 1
        : ('text' in element ? element.text : element.content).split('\n').length;
    const maxFont = mmToPt(Math.max(2.4, maxH - top) / (1.25 * Math.max(1, lines)));
    const fitted = Math.max(6, Math.min(element.fontSize, Math.round(maxFont * 2) / 2, 36));
    if (fitted !== element.fontSize) patch.fontSize = fitted;
  }

  return { ...element, ...patch } as LabelElement;
}

export function normalizeDocumentElements(doc: LabelDocument): LabelElement[] {
  return doc.elements.map((el) => clampElementToLabel(el, doc));
}

/** Template title/body font sizes derived from label mm (not raw mm as pt). */
export function templateFontSizes(widthMm: number, heightMm: number) {
  const titlePt = Math.min(28, Math.max(fitFontSizePt(widthMm, heightMm, 1) * 1.15, 8));
  const bodyPt = Math.max(6, Math.min(titlePt * 0.7, fitFontSizePt(widthMm, heightMm, 2)));
  const smallPt = Math.max(6, bodyPt * 0.85);
  return { titlePt, bodyPt, smallPt };
}
