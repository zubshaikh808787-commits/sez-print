import type { BorderStyleId } from '@/constants/border-library';

/** Axis-aligned ink rectangle in integer units (printer dots or physical screen pixels). */
export type FrameBand = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Outline the border follows: the label's die-cut. */
export type BorderShape = 'rect' | 'circle' | 'ellipse';

export function borderShapeForMedia(mediaShape: string | null | undefined): BorderShape {
  if (mediaShape === 'circle') return 'circle';
  if (mediaShape === 'ellipse') return 'ellipse';
  return 'rect';
}

export function solidFrameBands(x: number, y: number, w: number, h: number, stroke: number): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  return [
    { left: x, top: y, width: w, height: t },
    { left: x, top: y + h - t, width: w, height: t },
    { left: x, top: y, width: t, height: h },
    { left: x + w - t, top: y, width: t, height: h },
  ];
}

export function dashedFrameBands(
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

/** Inset frames: outer line, then thin inner line(s) `gap` apart. */
function nestedFrameBands(
  x: number,
  y: number,
  w: number,
  h: number,
  lines: { offset: number; stroke: number }[],
): FrameBand[] {
  const bands: FrameBand[] = [];
  for (const line of lines) {
    const iw = w - line.offset * 2;
    const ih = h - line.offset * 2;
    if (iw <= line.stroke * 2 || ih <= line.stroke * 2) continue;
    bands.push(...solidFrameBands(x + line.offset, y + line.offset, iw, ih, line.stroke));
  }
  return bands;
}

function doubleLines(t: number) {
  return [
    { offset: 0, stroke: t },
    { offset: Math.max(t + 1, Math.round(t * 2.2)), stroke: Math.max(1, Math.round(t * 0.55)) },
  ];
}

function tripleLines(t: number) {
  const gap = Math.max(t + 1, Math.round(t * 2.4));
  return [
    { offset: 0, stroke: t },
    { offset: gap, stroke: t },
    { offset: gap * 2, stroke: t },
  ];
}

function cornerBracketBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const arm = Math.max(t * 2, Math.min(Math.round(Math.max(3 * unitsPerMm, Math.min(w, h) * 0.18)), Math.floor(Math.min(w, h) / 2) - 1));
  return [
    { left: x, top: y, width: arm, height: t },
    { left: x, top: y, width: t, height: arm },
    { left: x + w - arm, top: y, width: arm, height: t },
    { left: x + w - t, top: y, width: t, height: arm },
    { left: x, top: y + h - t, width: arm, height: t },
    { left: x, top: y + h - arm, width: t, height: arm },
    { left: x + w - arm, top: y + h - t, width: arm, height: t },
    { left: x + w - t, top: y + h - arm, width: t, height: arm },
  ];
}

/** Registration "+" marks in each corner. Each mark sits fully inside the box. */
function crosshairBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const size = Math.max(t * 3, Math.min(Math.round(Math.max(3 * unitsPerMm, Math.min(w, h) * 0.14)), Math.floor(Math.min(w, h) / 2) - 1));
  const half = Math.floor(size / 2);
  const bands: FrameBand[] = [];
  const centres: [number, number][] = [
    [x + half, y + half],
    [x + w - size + half, y + half],
    [x + half, y + h - size + half],
    [x + w - size + half, y + h - size + half],
  ];
  const offset = Math.floor(t / 2);
  for (const [cx, cy] of centres) {
    bands.push({ left: cx - half, top: cy - offset, width: size, height: t });
    bands.push({ left: cx - offset, top: cy - half, width: t, height: size });
  }
  return bands;
}

function shadowBoxBands(x: number, y: number, w: number, h: number, t: number): FrameBand[] {
  const s = Math.max(t + 1, Math.round(t * 1.8));
  const fw = Math.max(t * 2 + 1, w - s);
  const fh = Math.max(t * 2 + 1, h - s);
  return [
    ...solidFrameBands(x, y, fw, fh, t),
    { left: x + fw, top: y + s, width: s, height: fh },
    { left: x + s, top: y + fh, width: fw, height: s },
  ];
}

/** Filled disc from row spans. */
function discBands(cx: number, cy: number, r: number): FrameBand[] {
  const bands: FrameBand[] = [];
  const top = Math.floor(cy - r);
  const bottom = Math.ceil(cy + r);
  for (let j = top; j < bottom; j++) {
    const dy = j + 0.5 - cy;
    if (Math.abs(dy) >= r) continue;
    const half = Math.sqrt(r * r - dy * dy);
    const left = Math.round(cx - half);
    const right = Math.round(cx + half);
    if (right > left) bands.push({ left, top: j, width: right - left, height: 1 });
  }
  return bands;
}

function industrialBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const r = Math.max(t, Math.round(0.6 * unitsPerMm));
  const c = t + Math.round(0.6 * unitsPerMm) + r;
  const bands = solidFrameBands(x, y, w, h, t);
  if (w > c * 2 + r * 2 && h > c * 2 + r * 2) {
    bands.push(
      ...discBands(x + c, y + c, r),
      ...discBands(x + w - c, y + c, r),
      ...discBands(x + c, y + h - c, r),
      ...discBands(x + w - c, y + h - c, r),
    );
  }
  return bands;
}

/** Ink depth for one pixel: how far inside the outline it sits, and where it is around the outline (0–1). */
type Outline = {
  depth: (px: number, py: number) => number;
  around: (px: number, py: number) => number;
  perimeter: number;
  /** Per row: candidate x spans (half-open) that may hold ink no deeper than `maxDepth`. */
  rowSpans: (py: number, maxDepth: number) => [number, number][];
};

function roundedRectOutline(w: number, h: number, radius: number): Outline {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return {
    depth(px, py) {
      if (px < 0 || py < 0 || px > w || py > h) return -1;
      const qx = Math.max(r - px, px - (w - r), 0);
      const qy = Math.max(r - py, py - (h - r), 0);
      if (qx > 0 && qy > 0) return r - Math.hypot(qx, qy);
      return Math.min(px, w - px, py, h - py);
    },
    around(px, py) {
      return (Math.atan2(py - h / 2, px - w / 2) + Math.PI) / (2 * Math.PI);
    },
    perimeter: 2 * (w + h) - (8 - 2 * Math.PI) * r,
    rowSpans(py, maxDepth) {
      const band = Math.ceil(Math.max(maxDepth, r)) + 1;
      if (py < band || py > h - band) return [[0, w]];
      const edge = Math.ceil(maxDepth) + 1;
      return [
        [0, Math.min(w, edge)],
        [Math.max(0, w - edge), w],
      ];
    },
  };
}

function ellipseOutline(w: number, h: number, circle: boolean): Outline {
  const rx = circle ? Math.min(w, h) / 2 : w / 2;
  const ry = circle ? Math.min(w, h) / 2 : h / 2;
  const cx = w / 2;
  const cy = h / 2;
  const halfWidth = (py: number, radiusX: number, radiusY: number) => {
    if (radiusX <= 0 || radiusY <= 0) return 0;
    const dy = (py - cy) / radiusY;
    return Math.abs(dy) >= 1 ? 0 : radiusX * Math.sqrt(1 - dy * dy);
  };
  return {
    depth(px, py) {
      const dx = px - cx;
      const dy = py - cy;
      const rho = Math.hypot(dx / rx, dy / ry);
      if (rho > 1) return -1;
      if (rho === 0) return Math.min(rx, ry);
      return Math.hypot(dx, dy) * (1 / rho - 1);
    },
    around(px, py) {
      return (Math.atan2((py - cy) / ry, (px - cx) / rx) + Math.PI) / (2 * Math.PI);
    },
    perimeter: 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2),
    rowSpans(py, maxDepth) {
      const outer = halfWidth(py, rx, ry);
      if (outer <= 0) return [];
      const inner = halfWidth(py, rx - maxDepth - 1, ry - maxDepth - 1);
      const l0 = Math.floor(cx - outer) - 1;
      const r1 = Math.ceil(cx + outer) + 1;
      if (inner <= 0) return [[l0, r1]];
      return [
        [l0, Math.ceil(cx - inner) + 1],
        [Math.floor(cx + inner) - 1, r1],
      ];
    },
  };
}

/**
 * Rasterize `ink(depth, around, i, j)` over an outline into row runs, then merge
 * identical runs on consecutive rows into taller bands.
 */
function rasterOutline(
  x: number,
  y: number,
  w: number,
  h: number,
  outline: Outline,
  maxDepth: number,
  ink: (depth: number, around: number, i: number, j: number) => boolean,
): FrameBand[] {
  const bands: FrameBand[] = [];
  let open = new Map<string, FrameBand>();
  for (let j = 0; j < h; j++) {
    const py = j + 0.5;
    const next = new Map<string, FrameBand>();
    for (const [a, b] of outline.rowSpans(py, maxDepth)) {
      const start = Math.max(0, Math.floor(a));
      const end = Math.min(w, Math.ceil(b));
      let runStart = -1;
      for (let i = start; i <= end; i++) {
        let on = false;
        if (i < end) {
          const px = i + 0.5;
          const d = outline.depth(px, py);
          on = d >= 0 && d < maxDepth && ink(d, outline.around(px, py), i, j);
        }
        if (on && runStart < 0) runStart = i;
        if (!on && runStart >= 0) {
          const key = `${runStart}:${i - runStart}`;
          const prev = open.get(key);
          if (prev && !next.has(key)) {
            prev.height += 1;
            next.set(key, prev);
          } else if (!next.has(key)) {
            const band = { left: x + runStart, top: y + j, width: i - runStart, height: 1 };
            bands.push(band);
            next.set(key, band);
          }
          runStart = -1;
        }
      }
    }
    open = next;
  }
  return bands;
}

function dashTest(perimeter: number, t: number, dotted: boolean) {
  const dash = dotted ? t : t * 3;
  const gap = dotted ? t * 1.5 : t * 2;
  const count = Math.max(4, Math.round(perimeter / (dash + gap)));
  const ratio = dash / (dash + gap);
  return (around: number) => (around * count) % 1 < ratio;
}

function stripeParams(t: number, unitsPerMm: number) {
  const band = Math.max(t * 3, Math.round(2.4 * unitsPerMm));
  const period = Math.max(4, Math.round(1.6 * unitsPerMm));
  const edge = Math.max(1, Math.round(t * 0.5));
  return { band, period, edge };
}

/** Ink for one style on a curved outline (rounded rect, pill, circle, ellipse). */
function outlineBands(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  unitsPerMm: number,
  style: BorderStyleId,
  outline: Outline,
): FrameBand[] {
  switch (style) {
    case 'dashed':
    case 'dotted': {
      const on = dashTest(outline.perimeter, t, style === 'dotted');
      return rasterOutline(x, y, w, h, outline, t, (_d, around) => on(around));
    }
    case 'double': {
      const [outer, inner] = doubleLines(t);
      const maxDepth = inner.offset + inner.stroke;
      return rasterOutline(x, y, w, h, outline, maxDepth, (d) => d < outer.stroke || d >= inner.offset);
    }
    case 'triple-line': {
      const lines = tripleLines(t);
      const maxDepth = lines[2].offset + lines[2].stroke;
      return rasterOutline(x, y, w, h, outline, maxDepth, (d) =>
        lines.some((line) => d >= line.offset && d < line.offset + line.stroke),
      );
    }
    case 'caution-stripes': {
      const { band, period, edge } = stripeParams(t, unitsPerMm);
      return rasterOutline(
        x,
        y,
        w,
        h,
        outline,
        band,
        (d, _around, i, j) => d < edge || d >= band - edge || (i + j) % period < period / 2,
      );
    }
    default:
      return rasterOutline(x, y, w, h, outline, t, () => true);
  }
}

/**
 * Border ink inside a region (already inset). Units are integer printer dots on
 * paper or physical pixels on screen, so the editor and the printer draw the
 * same shape. `stroke` is the line width in those units.
 */
export function styledBorderBands(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  unitsPerMm: number;
  stroke: number;
  style: BorderStyleId;
  shape: BorderShape;
}): FrameBand[] {
  const { x, y, unitsPerMm, style, shape } = params;
  const w = Math.max(1, Math.round(params.w));
  const h = Math.max(1, Math.round(params.h));
  const t = Math.max(1, Math.round(params.stroke));

  if (shape === 'circle' || shape === 'ellipse') {
    return outlineBands(x, y, w, h, t, unitsPerMm, style, ellipseOutline(w, h, shape === 'circle'));
  }

  switch (style) {
    case 'dashed':
    case 'dotted':
      return dashedFrameBands(x, y, w, h, t, style === 'dotted');
    case 'double':
      return nestedFrameBands(x, y, w, h, doubleLines(t));
    case 'triple-line':
      return nestedFrameBands(x, y, w, h, tripleLines(t));
    case 'rounded':
      return outlineBands(
        x,
        y,
        w,
        h,
        t,
        unitsPerMm,
        'solid-medium',
        roundedRectOutline(w, h, Math.max(t * 2, Math.round(Math.min(w, h) * 0.08))),
      );
    case 'pill-shape':
      return outlineBands(x, y, w, h, t, unitsPerMm, 'solid-medium', roundedRectOutline(w, h, Math.min(w, h) / 2));
    case 'shadow-box':
      return shadowBoxBands(x, y, w, h, t);
    case 'corner-brackets':
      return cornerBracketBands(x, y, w, h, t, unitsPerMm);
    case 'crosshair':
      return crosshairBands(x, y, w, h, t, unitsPerMm);
    case 'industrial':
      return industrialBands(x, y, w, h, t, unitsPerMm);
    case 'caution-stripes':
      return outlineBands(x, y, w, h, t, unitsPerMm, style, roundedRectOutline(w, h, 0));
    default:
      return solidFrameBands(x, y, w, h, t);
  }
}
