/**
 * Physical stock geometry — millimetres, independent of screen pixels.
 * The print canvas is still the axis-aligned bounding box (`widthMm` × `heightMm`).
 * Die-cut chrome (body + tail) is described here so gallery, editor, and future
 * SKUs share one model instead of flattening every label to a rectangle.
 */

export type MediaGeometryType =
  | 'rectangle'
  | 'rounded_rectangle'
  | 'circle'
  | 'rat_tail'
  | 'tag'
  | 'jewelry';

export type TailPosition = 'right' | 'left' | 'bottom' | 'top';

export type RatTailGeometry = {
  type: 'rat_tail';
  bodyWidthMm: number;
  bodyHeightMm: number;
  tailLengthMm: number;
  tailHeightMm: number;
  tailPosition: TailPosition;
  cornerRadiusMm?: number;
};

export type MediaGeometry =
  | { type: 'rectangle' }
  | { type: 'rounded_rectangle'; radiusMm?: number }
  | { type: 'circle' }
  | { type: 'tag' }
  | { type: 'jewelry' }
  | RatTailGeometry;

/** Cable / jewelry 14.3 × 63.5 + 38.1 wrap stock. Bounding box = 101.6 × 14.3 mm. */
export const RAT_TAIL_143: RatTailGeometry = {
  type: 'rat_tail',
  bodyWidthMm: 63.5,
  bodyHeightMm: 14.3,
  tailLengthMm: 38.1,
  /** Wrap strap — thinner than the 14.3 mm body, not a second full-height panel. */
  tailHeightMm: 4.0,
  tailPosition: 'right',
  cornerRadiusMm: 1.15,
};

export function isRatTailGeometry(g: MediaGeometry | null | undefined): g is RatTailGeometry {
  return g?.type === 'rat_tail';
}

/** Printable paddle — ink stays here; the strap is empty die-cut. */
export function ratTailBodyRectMm(g: RatTailGeometry): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  switch (g.tailPosition) {
    case 'left':
      return { left: g.tailLengthMm, top: 0, width: g.bodyWidthMm, height: g.bodyHeightMm };
    case 'bottom':
      return { left: 0, top: 0, width: g.bodyWidthMm, height: g.bodyHeightMm };
    case 'top':
      return { left: 0, top: g.tailLengthMm, width: g.bodyWidthMm, height: g.bodyHeightMm };
    default:
      return { left: 0, top: 0, width: g.bodyWidthMm, height: g.bodyHeightMm };
  }
}

export function canvasMmFromGeometry(g: MediaGeometry): { widthMm: number; heightMm: number } {
  if (g.type !== 'rat_tail') {
    return { widthMm: 0, heightMm: 0 };
  }
  if (g.tailPosition === 'left' || g.tailPosition === 'right') {
    return {
      widthMm: g.bodyWidthMm + g.tailLengthMm,
      heightMm: g.bodyHeightMm,
    };
  }
  return {
    widthMm: g.bodyWidthMm,
    heightMm: g.bodyHeightMm + g.tailLengthMm,
  };
}

/** Keep body+tail ratios when the user changes the bounding-box size. */
export function scaleMediaGeometry(
  geometry: MediaGeometry | undefined,
  scaleX: number,
  scaleY: number,
): MediaGeometry | undefined {
  if (!geometry || geometry.type !== 'rat_tail') return geometry;
  const alongX = geometry.tailPosition === 'left' || geometry.tailPosition === 'right';
  const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const uniform = Math.min(sx, sy);
  return {
    ...geometry,
    bodyWidthMm: geometry.bodyWidthMm * sx,
    bodyHeightMm: geometry.bodyHeightMm * sy,
    tailLengthMm: geometry.tailLengthMm * (alongX ? sx : sy),
    tailHeightMm: geometry.tailHeightMm * (alongX ? sy : sx),
    cornerRadiusMm:
      geometry.cornerRadiusMm != null ? geometry.cornerRadiusMm * uniform : undefined,
  };
}

export function geometryForPreviewType(previewType: string | undefined | null): MediaGeometry | null {
  if (!previewType) return null;
  switch (previewType) {
    case 'cable-rattail-143x635':
    case 'jew-rattail-143x635':
      return RAT_TAIL_143;
    default:
      return null;
  }
}
