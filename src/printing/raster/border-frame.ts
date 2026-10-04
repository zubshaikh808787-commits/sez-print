import type { BorderStyleId } from '@/constants/border-library';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';

/** Inward frame inset from the label edge — matches headless `drawPrintBorder`. */
export const PRINT_BORDER_INSET_MM = 2;

export function borderInsetDots(dpi: number): number {
  const dpm = dotsPerMm(dpi);
  return Math.max(2, Math.round(dpm * PRINT_BORDER_INSET_MM));
}

export function borderStrokeFallbackMm(styleId: BorderStyleId): number {
  switch (styleId) {
    case 'solid-thin':
      return 0.35;
    case 'solid-thick':
      return 0.9;
    case 'dashed':
    case 'dotted':
    case 'label-frame':
      return 0.5;
    default:
      return 0.55;
  }
}

export function borderStrokeDots(
  lineWidthMm: number | undefined,
  dpi: number,
  fallbackMm: number,
): number {
  const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : fallbackMm;
  return Math.max(1, mmToDots(mm, dpi));
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
  const gap = dotted ? t * 1.5 : t * 2;
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
 * Insets for one border element. geometryVersion 1 already stores the 2 mm
 * margin in the rectangle, so the stroke inset is 0. Untagged borders inset
 * 2 mm at draw time. extraBottomInsetMm is off in production (0).
 */
export function borderFrameInsetsForElement(
  el: { geometryVersion?: 1 },
  dpi: number,
  extraBottomInsetMm = 0,
): FrameInsets {
  const base = el.geometryVersion === 1 ? 0 : borderInsetDots(dpi);
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

/** Draw inward frame ink inside a dot box — prefers integer strokeRect when available. */
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
  const fallbackInset = borderInsetDots(dpi);
  const left = insets?.left ?? fallbackInset;
  const right = insets?.right ?? fallbackInset;
  const top = insets?.top ?? fallbackInset;
  const bottom = insets?.bottom ?? fallbackInset;
  const fallback = borderStrokeFallbackMm(styleId);
  const stroke = borderStrokeDots(lineWidthMm, dpi, fallback);
  const ix = originX + left;
  const iy = originY + top;
  const iw = Math.max(1, boxWidthDots - left - right);
  const ih = Math.max(1, boxHeightDots - top - bottom);

  if (styleId === 'double' || styleId === 'label-frame') {
    if (target.strokeRect) {
      target.strokeRect(ix, iy, iw, ih, stroke, 0);
      const inner = Math.max(0, Math.round(stroke * 2.2));
      const innerStroke = Math.max(1, Math.round(stroke * 0.55));
      target.strokeRect(
        ix + inner,
        iy + inner,
        Math.max(1, iw - inner * 2),
        Math.max(1, ih - inner * 2),
        innerStroke,
        0,
      );
      return;
    }
  } else if (
    styleId !== 'dashed' &&
    styleId !== 'dotted' &&
    styleId !== 'corner-brackets' &&
    styleId !== 'crosshair' &&
    target.strokeRect
  ) {
    target.strokeRect(ix, iy, iw, ih, stroke, 0);
    return;
  }

  const bands = inwardFrameBandsInBox(boxWidthDots, boxHeightDots, dpi, lineWidthMm, styleId, insets);
  for (const band of bands) {
    target.fillRect(originX + band.left, originY + band.top, band.width, band.height, 0);
  }
}
