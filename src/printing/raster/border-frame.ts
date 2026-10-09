import { borderStyleStrokeMm, type BorderStyleId } from '@/constants/border-library';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';

/** Inward frame inset from the label edge — matches headless `drawPrintBorder`. */
export const PRINT_BORDER_INSET_MM = 2;

export function borderInsetDots(dpi: number): number {
  const dpm = dotsPerMm(dpi);
  return Math.max(2, Math.round(dpm * PRINT_BORDER_INSET_MM));
}

export function borderStrokeFallbackMm(styleId: BorderStyleId): number {
  return borderStyleStrokeMm(styleId);
}

export function borderStrokeDots(
  lineWidthMm: number | undefined,
  dpi: number,
  fallbackMm: number,
): number {
  const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : fallbackMm;
  return Math.max(4, mmToDots(mm, dpi));
}

export type FrameBand = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function solidFrameBands(x: number, y: number, w: number, h: number, stroke: number): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  return [
    { left: x, top: y, width: w, height: t },
    { left: x, top: y + h - t, width: w, height: t },
    { left: x, top: y, width: t, height: h },
    { left: x + w - t, top: y, width: t, height: h },
  ];
}

function dashedFrameBands(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  dotted: boolean,
): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  const dash = dotted ? t : t * 3;
  const gap = dotted ? t + Math.ceil(t / 2) : t * 2;
  const bands: FrameBand[] = [];

  const paintDash = (x0: number, y0: number, len: number, vertical: boolean) => {
    let pos = 0;
    while (pos < len) {
      const seg = Math.min(dash, len - pos);
      if (vertical) {
        bands.push({ left: x0, top: y0 + pos, width: t, height: seg });
      } else {
        bands.push({ left: x0 + pos, top: y0, width: seg, height: t });
      }
      pos += dash + gap;
    }
  };

  paintDash(x, y, w, false);
  paintDash(x, y + h - t, w, false);
  paintDash(x, y, h, true);
  paintDash(x + w - t, y, h, true);
  return bands;
}

function cornerBracketBands(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  styleId: 'corner-brackets' | 'crosshair',
  dpi: number,
): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  const dpm = dotsPerMm(dpi);
  const arm = Math.max(8, Math.round(dpm * (styleId === 'crosshair' ? 2 : 2.2)));
  const inset = styleId === 'crosshair' ? 4 : 2;
  const bands: FrameBand[] = [];
  const corner = (cx: number, cy: number, hFirst: boolean) => {
    if (hFirst) {
      bands.push({ left: cx, top: cy, width: arm, height: t });
      bands.push({ left: cx, top: cy, width: t, height: arm });
    } else {
      bands.push({ left: cx, top: cy, width: t, height: arm });
      bands.push({ left: cx, top: cy, width: arm, height: t });
    }
  };
  corner(x + inset, y + inset, true);
  corner(x + w - inset - arm, y + inset, false);
  corner(x + inset, y + h - inset - t, true);
  corner(x + w - inset - t, y + h - inset - arm, false);
  return bands;
}

/**
 * Frame ink in printer dots inside a full-bleed box (0,0 = label top-left).
 * Outer edge of the stroke sits `borderInsetDots` from each label edge.
 */
export type FrameInsets = { left: number; right: number; top: number; bottom: number };

/**
 * True when an untagged border box is already inset from the label edge
 * (typical persisted 2 mm frame missing geometryVersion). A second draw-time
 * inset would double the margin. Full-bleed untagged (0,0,w,h) still needs
 * one design inset.
 */
export function untaggedBorderNeedsDrawInset(
  el: { geometryVersion?: 1; left?: number; top?: number; width?: number; height?: number },
  labelWidthMm?: number,
  labelHeightMm?: number,
): boolean {
  if (el.geometryVersion === 1) return false;
  if (labelWidthMm == null || labelHeightMm == null || !(labelWidthMm > 0) || !(labelHeightMm > 0)) {
    return true;
  }
  const left = el.left ?? 0;
  const top = el.top ?? 0;
  const width = el.width ?? labelWidthMm;
  const height = el.height ?? labelHeightMm;
  const right = labelWidthMm - (left + width);
  const bottom = labelHeightMm - (top + height);
  const eps = 0.05;
  const alreadyInset =
    left >= PRINT_BORDER_INSET_MM - eps &&
    top >= PRINT_BORDER_INSET_MM - eps &&
    right >= PRINT_BORDER_INSET_MM - eps &&
    bottom >= PRINT_BORDER_INSET_MM - eps;
  return !alreadyInset;
}

/**
 * Insets for one border element. geometryVersion 1 already stores the 2 mm
 * margin in the rectangle, so the stroke inset is 0. Untagged full-bleed
 * borders inset 2 mm at draw time. extraBottomInsetMm is off in production (0).
 */
export function borderFrameInsetsForElement(
  el: { geometryVersion?: 1; left?: number; top?: number; width?: number; height?: number },
  dpi: number,
  extraBottomInsetMm = 0,
  labelWidthMm?: number,
  labelHeightMm?: number,
): FrameInsets {
  const base = untaggedBorderNeedsDrawInset(el, labelWidthMm, labelHeightMm)
    ? borderInsetDots(dpi)
    : 0;
  const extra = Math.max(0, mmToDots(extraBottomInsetMm, dpi));
  return { left: base, right: base, top: base, bottom: base + extra };
}

export function inwardFrameBandsInBox(
  boxWidthDots: number,
  boxHeightDots: number,
  dpi: number,
  lineWidthMm: number | undefined,
  styleId: BorderStyleId,
  insets?: FrameInsets,
): FrameBand[] {
  const fallbackInset = borderInsetDots(dpi);
  const left = insets?.left ?? fallbackInset;
  const right = insets?.right ?? fallbackInset;
  const top = insets?.top ?? fallbackInset;
  const bottom = insets?.bottom ?? fallbackInset;
  const fallback = borderStrokeFallbackMm(styleId);
  const stroke = borderStrokeDots(lineWidthMm, dpi, fallback);
  const ix = left;
  const iy = top;
  const iw = Math.max(1, boxWidthDots - left - right);
  const ih = Math.max(1, boxHeightDots - top - bottom);

  if (styleId === 'dashed' || styleId === 'dotted') {
    return dashedFrameBands(ix, iy, iw, ih, stroke, styleId === 'dotted');
  }
  if (styleId === 'double' || styleId === 'label-frame') {
    const inner = Math.max(0, Math.round(stroke * 2.2));
    const innerStroke = Math.max(1, Math.round(stroke * 0.55));
    return [
      ...solidFrameBands(ix, iy, iw, ih, stroke),
      ...solidFrameBands(
        ix + inner,
        iy + inner,
        Math.max(1, iw - inner * 2),
        Math.max(1, ih - inner * 2),
        innerStroke,
      ),
    ];
  }
  if (styleId === 'corner-brackets' || styleId === 'crosshair') {
    return cornerBracketBands(ix, iy, iw, ih, stroke, styleId, dpi);
  }
  return solidFrameBands(ix, iy, iw, ih, stroke);
}

/**
 * Inward ring whose outer edge is the ellipse of [x0,x1) × [y0,y1).
 * Circle labels use that same box, so the stroke meets the measured inset on
 * every side (a true inscribed circle would miss the longer sides).
 * Interior pixels are left untouched, same as a rectangular stroke.
 */
export function drawInwardEllipseRing(
  target: FrameFillTarget,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stroke: number,
): void {
  const t = Math.max(1, Math.round(stroke));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  paintEllipseRing(target, x0 + w / 2, y0 + h / 2, w / 2, h / 2, t);
}

function paintEllipseRing(
  target: FrameFillTarget,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stroke: number,
): void {
  if (rx <= 0 || ry <= 0 || stroke <= 0) return;
  const t = Math.max(1, Math.round(stroke));
  const yStart = Math.floor(cy - ry);
  const yEnd = Math.ceil(cy + ry);
  const innerRx = Math.max(0, rx - t);
  const innerRy = Math.max(0, ry - t);
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const innerRy2 = innerRy * innerRy;
  for (let y = yStart; y < yEnd; y++) {
    const dy = y + 0.5 - cy;
    if (dy * dy >= ry2) continue;
    const outer = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ry2));
    const left = Math.ceil(cx - outer - 0.5);
    const right = Math.floor(cx + outer - 0.5);
    if (right < left) continue;
    let holeLeft = left;
    let holeRight = left - 1;
    if (innerRx > 0 && innerRy > 0 && dy * dy < innerRy2) {
      const inner = innerRx * Math.sqrt(Math.max(0, 1 - (dy * dy) / innerRy2));
      holeLeft = Math.ceil(cx - inner - 0.5);
      holeRight = Math.floor(cx + inner - 0.5);
    }
    if (holeRight < holeLeft) {
      target.fillRect(left, y, right - left + 1, 1, 0);
      continue;
    }
    if (holeLeft > left) target.fillRect(left, y, holeLeft - left, 1, 0);
    if (right > holeRight) target.fillRect(holeRight + 1, y, right - holeRight, 1, 0);
  }
}

export function bandsToLayoutPx(bands: FrameBand[], density: number): FrameBand[] {
  const d = density > 0 ? density : 1;
  return bands.map((band) => {
    const x1 = band.left + band.width;
    const y1 = band.top + band.height;
    return {
      left: band.left / d,
      top: band.top / d,
      width: Math.max(1 / d, (x1 - band.left) / d),
      height: Math.max(1 / d, (y1 - band.top) / d),
    };
  });
}

export type FrameFillTarget = {
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
  strokeRect?: (x: number, y: number, w: number, h: number, stroke: number, gray: number) => void;
};

/** Draw inward frame ink as integer fillRect bars (1-bit, no stroke AA). */
export function drawInwardFrameInBox(
  target: FrameFillTarget,
  boxWidthDots: number,
  boxHeightDots: number,
  dpi: number,
  lineWidthMm: number | undefined,
  styleId: BorderStyleId,
  originX = 0,
  originY = 0,
  insets?: FrameInsets,
): void {
  const bands = inwardFrameBandsInBox(boxWidthDots, boxHeightDots, dpi, lineWidthMm, styleId, insets);
  for (const band of bands) {
    target.fillRect(originX + band.left, originY + band.top, band.width, band.height, 0);
  }
}
