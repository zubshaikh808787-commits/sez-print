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
export function inwardFrameBandsInBox(
  boxWidthDots: number,
  boxHeightDots: number,
  dpi: number,
  lineWidthMm: number | undefined,
  styleId: BorderStyleId,
  insets?: { left: number; right: number; top: number; bottom: number },
): FrameBand[] {
  const inset = borderInsetDots(dpi);
  const left = insets?.left ?? inset;
  const right = insets?.right ?? inset;
  const top = insets?.top ?? inset;
  const bottom = insets?.bottom ?? inset;
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

function insideRounded(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): boolean {
  if (w <= 0 || h <= 0 || px < x || py < y || px >= x + w || py >= y + h) return false;
  const r = Math.max(0, Math.min(rad, w / 2, h / 2));
  if (r < 0.5) return true;
  const lx = px - x;
  const ly = py - y;
  if (lx >= r && lx < w - r) return true;
  if (ly >= r && ly < h - r) return true;
  const cx = lx < r ? r : w - r;
  const cy = ly < r ? r : h - r;
  const dx = lx - cx;
  const dy = ly - cy;
  return dx * dx + dy * dy <= r * r;
}

function paintMask(
  target: { fillRect: (x: number, y: number, w: number, h: number, gray: number) => void },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  on: (px: number, py: number) => boolean,
): void {
  for (let py = y0; py < y1; py++) {
    let run = -1;
    for (let px = x0; px <= x1; px++) {
      const ink = px < x1 && on(px + 0.5, py + 0.5);
      if (ink && run < 0) run = px;
      if (!ink && run >= 0) {
        target.fillRect(run, py, px - run, 1, 0);
        run = -1;
      }
    }
  }
}

/** Stroke kept inside the rounded box. Outer edge is the box. */
export function fillRoundStroke(
  target: { fillRect: (x: number, y: number, w: number, h: number, gray: number) => void },
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  stroke: number,
): void {
  const t = Math.max(1, Math.round(stroke));
  const ox = Math.round(x);
  const oy = Math.round(y);
  const ow = Math.max(1, Math.round(w));
  const oh = Math.max(1, Math.round(h));
  const innerX = ox + t;
  const innerY = oy + t;
  const innerW = ow - t * 2;
  const innerH = oh - t * 2;
  const innerR = Math.max(0, radius - t);
  paintMask(target, ox, oy, ox + ow, oy + oh, (px, py) => {
    return (
      insideRounded(px, py, ox, oy, ow, oh, radius) &&
      !insideRounded(px, py, innerX, innerY, innerW, innerH, innerR)
    );
  });
}

/** Ring inside an ellipse. Radii are the outer edge. */
export function fillEllipseStroke(
  target: { fillRect: (x: number, y: number, w: number, h: number, gray: number) => void },
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stroke: number,
): void {
  const t = Math.max(1, Math.round(stroke));
  const outerRx = Math.max(1, rx);
  const outerRy = Math.max(1, ry);
  const innerRx = Math.max(0, outerRx - t);
  const innerRy = Math.max(0, outerRy - t);
  const inside = (px: number, py: number, erx: number, ery: number) => {
    if (erx <= 0 || ery <= 0) return false;
    const nx = (px - cx) / erx;
    const ny = (py - cy) / ery;
    return nx * nx + ny * ny <= 1;
  };
  paintMask(
    target,
    Math.floor(cx - outerRx),
    Math.floor(cy - outerRy),
    Math.ceil(cx + outerRx),
    Math.ceil(cy + outerRy),
    (px, py) => inside(px, py, outerRx, outerRy) && !inside(px, py, innerRx, innerRy),
  );
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
  insets?: { left: number; right: number; top: number; bottom: number },
  circular = false,
): void {
  const inset = borderInsetDots(dpi);
  const left = insets?.left ?? inset;
  const right = insets?.right ?? inset;
  const top = insets?.top ?? inset;
  const bottom = insets?.bottom ?? inset;
  const fallback = borderStrokeFallbackMm(styleId);
  const stroke = borderStrokeDots(lineWidthMm, dpi, fallback);
  const ix = originX + left;
  const iy = originY + top;
  const iw = Math.max(1, boxWidthDots - left - right);
  const ih = Math.max(1, boxHeightDots - top - bottom);

  if (circular) {
    fillEllipseStroke(target, ix + iw / 2, iy + ih / 2, iw / 2, ih / 2, stroke);
    return;
  }
  if (styleId === 'rounded' || styleId === 'pill-shape') {
    const radius =
      styleId === 'pill-shape' ? Math.min(iw, ih) / 2 : Math.max(stroke * 2, Math.min(iw, ih) * 0.08);
    fillRoundStroke(target, ix, iy, iw, ih, radius, stroke);
    return;
  }

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
