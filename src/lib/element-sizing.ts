import { elementSizeMm, mmToPt, ptToMm, textBlockHeightMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { isRatTailGeometry, ratTailBodyRectMm, scaleMediaGeometry } from '@/lib/media-geometry';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
export { computeTextElementHeightMm, computeWrappedLines, measureTextWidthMm } from '@/lib/text-metrics';
export { textBlockHeightMm } from '@/lib/label-document';

const PAD_RATIO = 0.05;
const MIN_PAD_MM = 0.5;

function finiteSize(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function padMm(widthMm: number, heightMm: number) {
  // Keep a usable content inset on tiny stick labels (25×15) without eating the pad.
  const ratioPad = Math.min(widthMm, heightMm) * PAD_RATIO;
  return Math.max(MIN_PAD_MM, Math.min(ratioPad, Math.min(widthMm, heightMm) * 0.12));
}

function bboxOf(element: LabelElement) {
  const size = elementSizeMm(element);
  return {
    left: element.left,
    top: element.top,
    width: size.width,
    height: size.height,
  };
}

/** Typical body-line font (pt) for this label — not a title that fills the pad. */
export function fitFontSizePt(widthMm: number, heightMm: number, lines = 1) {
  const perLineMm = Math.max(1.6, (heightMm * 0.26) / Math.max(1, lines));
  const fromHeight = mmToPt(perLineMm / 1.25);
  const fromWidth = mmToPt(widthMm * 0.12);
  const pt = Math.min(fromHeight, fromWidth);
  // Tiny stick labels (e.g. 25×15) need smaller body type to stay inside the pad.
  const minPt = Math.min(widthMm, heightMm) < 18 ? 4 : 6;
  return Math.max(minPt, Math.min(Math.round(pt * 2) / 2, 28));
}

export function fitTextWidth(widthMm: number) {
  const pad = padMm(widthMm, widthMm);
  return Math.max(4, widthMm - pad * 2);
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
  const minPt = Math.min(widthMm, heightMm) < 18 ? 4 : 6;
  const fromExisting = median(fonts);
  const fontSize = fromExisting
    ? Math.max(minPt, Math.min(28, Math.round(fromExisting * 2) / 2))
    : fitFontSizePt(widthMm, heightMm, 1);
  const boxH = textBlockHeightMm(fontSize, 1);
  const boxW = Math.max(4, Math.min(fitTextWidth(widthMm), widthMm * 0.88));
  const placed = placeInLabel(widthMm, heightMm, boxW, boxH, existing);
  return { left: placed.left, top: placed.top, width: placed.width, fontSize };
}

export function fitBarcodeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(6, widthMm - pad * 2);
  const height = Math.max(3, Math.min(heightMm * 0.36, heightMm - pad * 2, 12));
  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    fontSize: Math.max(4, Math.min(mmToPt(heightMm * 0.1), 9)),
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
  const width = Math.max(4, Math.min(widthMm - pad * 2, widthMm * 0.7));
  const height = Math.max(3, Math.min(heightMm - pad * 2, heightMm * 0.45));
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



/** Clamp element position/size so it stays inside the label (paddle only on rat-tail). */
export function clampElementToLabel(
  element: LabelElement,
  doc: Pick<LabelDocument, 'widthMm' | 'heightMm' | 'mediaGeometry'>,
): LabelElement {
  if (element.type === 'border') {
    if (
      element.left === 0 &&
      element.top === 0 &&
      element.width === doc.widthMm &&
      element.height === doc.heightMm &&
      (element.rotation ?? 0) === 0 &&
      element.lockMovement === true
    ) {
      return element;
    }
    return {
      ...element,
      left: 0,
      top: 0,
      width: doc.widthMm,
      height: doc.heightMm,
      rotation: 0 as const,
      lockMovement: true,
    };
  }

  const maxW = finiteSize(doc.widthMm, 50);
  const maxH = finiteSize(doc.heightMm, 30);
  const bounds = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry)
    : { left: 0, top: 0, width: maxW, height: maxH };
  const minMm = element.type === 'line' ? 0.1 : 0.5;

  const currentSize = elementSizeMm(element);
  const rawLeft = finiteSize(element.left, 0);
  const rawTop = finiteSize(element.top, 0);
  const rawWidth = finiteSize(element.width, minMm);
  const hasExplicitHeight = 'height' in element && typeof element.height === 'number';
  const rawHeight = hasExplicitHeight
    ? finiteSize(element.height, minMm)
    : currentSize.height;

  const clamped = clampToLabelBounds(
    {
      left: rawLeft - bounds.left,
      top: rawTop - bounds.top,
      width: rawWidth,
      height: rawHeight,
    },
    { widthMm: bounds.width, heightMm: bounds.height },
    { anchor: 'body', minMm, naturalHeight: rawHeight },
  );

  const finalLeft = bounds.left + clamped.left;
  const finalTop = bounds.top + clamped.top;
  const finalWidth = clamped.width;
  const finalHeight = hasExplicitHeight ? Math.min(Math.max(minMm, rawHeight), bounds.height) : clamped.height;
  const heightMatches = !hasExplicitHeight || element.height === finalHeight;

  if (
    element.left === finalLeft &&
    element.top === finalTop &&
    element.width === finalWidth &&
    heightMatches
  ) {
    return element;
  }

  const patch: Record<string, unknown> = {
    left: finalLeft,
    top: finalTop,
    width: finalWidth,
  };

  if (hasExplicitHeight) {
    patch.height = finalHeight;
  }

  return { ...element, ...patch } as LabelElement;
}

export function normalizeDocumentElements(doc: LabelDocument): LabelElement[] {
  return doc.elements.map((el) => clampElementToLabel(el, doc));
}

/**
 * Scale one element's dimensional fields for a label resize.
 * `sx`/`sy` scale position/size (anisotropic — matches the new aspect ratio).
 * `fontScale` (uniform, normally min(sx, sy)) scales ink-thickness fields —
 * font size, stroke/line width, corner radius — so glyphs and strokes don't
 * distort when width and height scale by different amounts.
 */
function scaleElementFields(el: LabelElement, sx: number, sy: number, fontScale: number): LabelElement {
  const scaled: LabelElement = {
    ...el,
    left: el.left * sx,
    top: el.top * sy,
    width: el.width * sx,
  };
  if ('height' in scaled && typeof scaled.height === 'number' && scaled.type !== 'line') {
    (scaled as { height: number }).height *= sy;
  }
  if (scaled.type === 'line' && typeof scaled.height === 'number') {
    const vertical = scaled.height >= scaled.width * 2;
    (scaled as { height: number }).height *= vertical ? sy : fontScale;
  }
  if ('fontSize' in scaled && typeof scaled.fontSize === 'number') {
    (scaled as { fontSize: number }).fontSize = Math.max(4, scaled.fontSize * fontScale);
  }
  if ('lineWidth' in scaled && typeof scaled.lineWidth === 'number') {
    (scaled as { lineWidth: number }).lineWidth *= fontScale;
  }
  if ('roundRadius' in scaled && typeof scaled.roundRadius === 'number') {
    (scaled as { roundRadius: number }).roundRadius *= fontScale;
  }
  if (scaled.type === 'table') {
    scaled.columnWidths = scaled.columnWidths.map((n) => n * sx);
    scaled.rowHeights = scaled.rowHeights.map((n) => n * sy);
  }
  return scaled;
}

/**
 * Border is locked to the label bounds, not scaled by sx/sy like other
 * elements — but its stroke thickness (`lineWidth`) is still an ink-thickness
 * field and must scale by `fontScale`, or it goes stale (a 2mm border on a
 * shrunk label prints as a near-solid block; on an enlarged one, hairline-thin).
 */
function scaleBorderElement(
  el: LabelElement & { type: 'border' },
  left: number,
  top: number,
  width: number,
  height: number,
  fontScale: number,
): LabelElement {
  return {
    ...el,
    left,
    top,
    width,
    height,
    rotation: 0 as const,
    lineWidth: el.lineWidth * fontScale,
  };
}

/** Scale and reposition layers when the label size changes (no silent crop). */
export function scaleDocumentToSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const sx = widthMm / Math.max(doc.widthMm, 0.01);
  const sy = heightMm / Math.max(doc.heightMm, 0.01);
  const fontScale = Math.min(sx, sy);
  const nextDoc: LabelDocument = {
    ...doc,
    widthMm,
    heightMm,
    mediaGeometry: scaleMediaGeometry(doc.mediaGeometry, sx, sy),
  };

  const scaleElements = (source: LabelElement[]): LabelElement[] =>
    source.map((el) => {
      if (el.type === 'border') {
        return clampElementToLabel(
          scaleBorderElement(el, 0, 0, widthMm, heightMm, fontScale),
          nextDoc,
        );
      }
      return clampElementToLabel(scaleElementFields(el, sx, sy, fontScale), nextDoc);
    });

  const elements = scaleElements(doc.elements);
  if (!doc.ups) {
    return { ...nextDoc, elements };
  }

  const panels = doc.ups.panels.map((panel, i) =>
    i === doc.ups!.activeIndex ? elements : scaleElements(panel),
  );
  return {
    ...nextDoc,
    elements,
    ups: { ...doc.ups, panels },
  };
}

/**
 * Uniform contain-fit onto a print page, centered L/R and T/B.
 * Small templates keep their aspect and sit in the middle of larger stock
 * (matches “print looks like the preview, centered on the label”).
 */
export function fitDocumentCenteredOnPage(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const scale = Math.min(
    widthMm / Math.max(doc.widthMm, 0.01),
    heightMm / Math.max(doc.heightMm, 0.01),
  );
  const contentW = doc.widthMm * scale;
  const contentH = doc.heightMm * scale;
  const ox = (widthMm - contentW) / 2;
  const oy = (heightMm - contentH) / 2;
  const nextDoc = { ...doc, widthMm, heightMm };
  const elements = doc.elements.map((el) => {
    if (el.type === 'border') {
      return clampElementToLabel(
        scaleBorderElement(el, ox, oy, contentW, contentH, scale),
        nextDoc,
      );
    }
    const scaled = scaleElementFields(el, scale, scale, scale);
    scaled.left = ox + scaled.left;
    scaled.top = oy + scaled.top;
    return clampElementToLabel(scaled, nextDoc);
  });
  return { ...nextDoc, elements };
}

/**
 * Stretch design to fill the full print page (edge-to-edge).
 * Used when the user picks a target size like 4×6 so the print is not a
 * small stamp in the middle of the label.
 */
export function fitDocumentToFillPage(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const scaleX = widthMm / Math.max(doc.widthMm, 0.01);
  const scaleY = heightMm / Math.max(doc.heightMm, 0.01);
  const fontScale = Math.min(scaleX, scaleY);
  const nextDoc = { ...doc, widthMm, heightMm };
  const elements = doc.elements.map((el) => {
    if (el.type === 'border') {
      return clampElementToLabel(
        scaleBorderElement(el, 0, 0, widthMm, heightMm, fontScale),
        nextDoc,
      );
    }
    return clampElementToLabel(scaleElementFields(el, scaleX, scaleY, fontScale), nextDoc);
  });
  return { ...nextDoc, elements };
}

/** Template title/body font sizes derived from label mm (not raw mm as pt). */
export function templateFontSizes(widthMm: number, heightMm: number) {
  const isLargeLabel = widthMm >= 75 && heightMm >= 95;
  const baseTitle = isLargeLabel ? 18 : fitFontSizePt(widthMm, heightMm, 1) * 1.15;
  const titlePt = Math.min(28, Math.max(baseTitle, 8));
  const bodyPt = isLargeLabel
    ? 12
    : Math.max(6, Math.min(titlePt * 0.7, fitFontSizePt(widthMm, heightMm, 2)));
  const smallPt = isLargeLabel ? 9 : Math.max(6, bodyPt * 0.85);
  return { titlePt, bodyPt, smallPt };
}
