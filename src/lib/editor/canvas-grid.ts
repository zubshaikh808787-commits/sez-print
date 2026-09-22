import type { LabelElement } from '@/lib/label-document';

/** Minimum px between grid lines before we hide the overlay (too dense at low zoom). */
export const GRID_MIN_SPACING_PX = 4;

export const GRID_SPACING_MIN_MM = 0.5;
export const GRID_SPACING_MAX_MM = 20;

export const GRID_SPACING_PRESETS_MM = [1, 2, 5, 10] as const;

export const DEFAULT_GRID_COLOR = '#000000';
export const DEFAULT_GRID_SPACING_MM = 5;

export type CanvasGridLines = {
  vertical: number[];
  horizontal: number[];
};

export type GridOccluderRectPx = {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
};

export type GridLineSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type OccludedCanvasGridLines = {
  vertical: GridLineSegment[];
  horizontal: GridLineSegment[];
};

type Segment1D = { start: number; end: number };

export function clampGridSpacingMm(spacingMm: number): number {
  if (!Number.isFinite(spacingMm)) return DEFAULT_GRID_SPACING_MM;
  return Math.min(GRID_SPACING_MAX_MM, Math.max(GRID_SPACING_MIN_MM, spacingMm));
}

export function gridSpacingPx(spacingMm: number, pxPerMM: number): number {
  if (!(pxPerMM > 0)) return 0;
  return clampGridSpacingMm(spacingMm) * pxPerMM;
}

export function shouldRenderCanvasGrid(spacingMm: number, pxPerMM: number): boolean {
  return gridSpacingPx(spacingMm, pxPerMM) >= GRID_MIN_SPACING_PX;
}

/** Uniform mm-spaced grid lines in pixel coordinates. */
export function buildCanvasGridLines(opts: {
  widthPx: number;
  heightPx: number;
  pxPerMM: number;
  spacingMm: number;
}): CanvasGridLines | null {
  const { widthPx, heightPx, pxPerMM } = opts;
  const spacingMm = clampGridSpacingMm(opts.spacingMm);
  if (!(widthPx > 0 && heightPx > 0 && pxPerMM > 0)) {
    return null;
  }
  if (!shouldRenderCanvasGrid(spacingMm, pxPerMM)) {
    return null;
  }

  const stepPx = spacingMm * pxPerMM;
  const vertical: number[] = [];
  const horizontal: number[] = [];

  for (let mm = spacingMm; mm * pxPerMM < widthPx - 0.5; mm += spacingMm) {
    vertical.push(mm * pxPerMM);
  }
  for (let mm = spacingMm; mm * pxPerMM < heightPx - 0.5; mm += spacingMm) {
    horizontal.push(mm * pxPerMM);
  }

  return { vertical, horizontal };
}

function subtractRanges(segments: Segment1D[], excludeStart: number, excludeEnd: number): Segment1D[] {
  const result: Segment1D[] = [];
  for (const seg of segments) {
    if (excludeEnd <= seg.start || excludeStart >= seg.end) {
      result.push(seg);
      continue;
    }
    if (excludeStart > seg.start) {
      result.push({ start: seg.start, end: Math.min(excludeStart, seg.end) });
    }
    if (excludeEnd < seg.end) {
      result.push({ start: Math.max(excludeEnd, seg.start), end: seg.end });
    }
  }
  return result.filter((s) => s.end - s.start > 0.001);
}

function clipVerticalLine(
  x: number,
  heightPx: number,
  occluders: GridOccluderRectPx[],
): GridLineSegment[] {
  let segments: Segment1D[] = [{ start: 0, end: heightPx }];
  for (const occ of occluders) {
    if (x >= occ.leftPx && x <= occ.leftPx + occ.widthPx) {
      segments = subtractRanges(segments, occ.topPx, occ.topPx + occ.heightPx);
    }
  }
  return segments.map((s) => ({ x1: x, y1: s.start, x2: x, y2: s.end }));
}

function clipHorizontalLine(
  y: number,
  widthPx: number,
  occluders: GridOccluderRectPx[],
): GridLineSegment[] {
  let segments: Segment1D[] = [{ start: 0, end: widthPx }];
  for (const occ of occluders) {
    if (y >= occ.topPx && y <= occ.topPx + occ.heightPx) {
      segments = subtractRanges(segments, occ.leftPx, occ.leftPx + occ.widthPx);
    }
  }
  return segments.map((s) => ({ x1: s.start, y1: y, x2: s.end, y2: y }));
}

export function rotatedAabbPx(
  leftMm: number,
  topMm: number,
  widthMm: number,
  heightMm: number,
  rotationDeg: number,
  pxPerMM: number,
): GridOccluderRectPx {
  const leftPx = leftMm * pxPerMM;
  const topPx = topMm * pxPerMM;
  const widthPx = widthMm * pxPerMM;
  const heightPx = heightMm * pxPerMM;

  const normalizedRot = ((Math.round(rotationDeg) % 360) + 360) % 360;
  if (normalizedRot === 0) {
    return { leftPx, topPx, widthPx, heightPx };
  }

  const cx = leftPx + widthPx / 2;
  const cy = topPx + heightPx / 2;
  const rad = (normalizedRot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
    { x: leftPx, y: topPx },
    { x: leftPx + widthPx, y: topPx },
    { x: leftPx + widthPx, y: topPx + heightPx },
    { x: leftPx, y: topPx + heightPx },
  ];

  const rotated = corners.map(({ x, y }) => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  });

  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);

  return {
    leftPx: Math.min(...xs),
    topPx: Math.min(...ys),
    widthPx: Math.max(...xs) - Math.min(...xs),
    heightPx: Math.max(...ys) - Math.min(...ys),
  };
}

function visibleGridElements(elements: LabelElement[], excludeIds?: readonly string[]) {
  const excluded = excludeIds && excludeIds.length > 0 ? new Set(excludeIds) : null;
  return elements.filter((el) => el.visible !== false && !excluded?.has(el.id));
}

export function elementOccluderRectsPx(
  elements: LabelElement[],
  pxPerMM: number,
  excludeIds?: readonly string[],
): GridOccluderRectPx[] {
  if (!(pxPerMM > 0)) return [];
  return visibleGridElements(elements, excludeIds).map((el) => {
    const rotation = 'rotation' in el ? (el.rotation ?? 0) : 0;
    return rotatedAabbPx(el.left, el.top, el.width, el.height, rotation, pxPerMM);
  });
}

/** Stable cache key for occluder bounds — avoids recomputing clipped grid on unrelated renders. */
export function elementOccluderSignature(
  elements: LabelElement[],
  pxPerMM: number,
  excludeIds?: readonly string[],
): string {
  if (!(pxPerMM > 0)) return '';
  const body = visibleGridElements(elements, excludeIds)
    .map((el) => {
      const rotation = 'rotation' in el ? (el.rotation ?? 0) : 0;
      return `${el.id}:${el.left.toFixed(2)},${el.top.toFixed(2)},${el.width.toFixed(2)},${el.height.toFixed(2)},${rotation}`;
    })
    .join('|');
  return excludeIds && excludeIds.length > 0 ? `${excludeIds.join(',')}|${body}` : body;
}

export function gridSegmentsToPathD(segments: GridLineSegment[]): string {
  if (segments.length === 0) return '';
  return segments.map((seg) => `M${seg.x1} ${seg.y1}L${seg.x2} ${seg.y2}`).join('');
}

/** Grid lines clipped around element bounding regions. */
export function buildOccludedCanvasGridLines(opts: {
  widthPx: number;
  heightPx: number;
  pxPerMM: number;
  spacingMm: number;
  occluders?: GridOccluderRectPx[];
}): OccludedCanvasGridLines | null {
  const base = buildCanvasGridLines(opts);
  if (!base) return null;

  const occluders = opts.occluders ?? [];
  const vertical: GridLineSegment[] = [];
  const horizontal: GridLineSegment[] = [];

  for (const x of base.vertical) {
    vertical.push(...clipVerticalLine(x, opts.heightPx, occluders));
  }
  for (const y of base.horizontal) {
    horizontal.push(...clipHorizontalLine(y, opts.widthPx, occluders));
  }

  return { vertical, horizontal };
}
