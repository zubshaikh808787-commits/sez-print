import { borderStyleStrokeMm, resolveBorderStyle } from '@/constants/border-library';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import { styledBorderBands, type BorderShape, type FrameBand } from '@/printing/raster/border-shapes';

export type { BorderShape, FrameBand } from '@/printing/raster/border-shapes';

/** Inward frame inset from the label edge — matches headless `drawPrintBorder`. */
export const PRINT_BORDER_INSET_MM = 2;

export function borderInsetDots(dpi: number): number {
  const dpm = dotsPerMm(dpi);
  return Math.max(2, Math.round(dpm * PRINT_BORDER_INSET_MM));
}

export function borderStrokeFallbackMm(styleId: string | null | undefined): number {
  return borderStyleStrokeMm(styleId);
}

export function borderStrokeDots(
  lineWidthMm: number | undefined,
  dpi: number,
  fallbackMm: number,
): number {
  const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : fallbackMm;
  return Math.max(1, mmToDots(mm, dpi));
}

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

/**
 * Frame ink in printer dots inside a full-bleed box (0,0 = label top-left).
 * `unitScale` is the supersample factor: the box and insets are already in
 * scaled dots, and the stroke is scaled to match.
 */
export function inwardFrameBandsInBox(
  boxWidthDots: number,
  boxHeightDots: number,
  dpi: number,
  lineWidthMm: number | undefined,
  styleId: string | null | undefined,
  insets?: FrameInsets,
  shape: BorderShape = 'rect',
  unitScale = 1,
): FrameBand[] {
  const fallbackInset = borderInsetDots(dpi) * unitScale;
  const left = insets?.left ?? fallbackInset;
  const right = insets?.right ?? fallbackInset;
  const top = insets?.top ?? fallbackInset;
  const bottom = insets?.bottom ?? fallbackInset;
  const style = resolveBorderStyle(styleId);
  const stroke = borderStrokeDots(lineWidthMm, dpi, borderStrokeFallbackMm(style)) * unitScale;
  return styledBorderBands({
    x: left,
    y: top,
    w: Math.max(1, boxWidthDots - left - right),
    h: Math.max(1, boxHeightDots - top - bottom),
    unitsPerMm: dotsPerMm(dpi) * unitScale,
    stroke,
    style,
    shape,
  });
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

/** Draw inward frame ink inside a dot box. Plain rectangular frames use integer strokeRect when available. */
export function drawInwardFrameInBox(
  target: FrameFillTarget,
  boxWidthDots: number,
  boxHeightDots: number,
  dpi: number,
  lineWidthMm: number | undefined,
  styleId: string | null | undefined,
  originX = 0,
  originY = 0,
  insets?: FrameInsets,
  shape: BorderShape = 'rect',
  unitScale = 1,
): void {
  const style = resolveBorderStyle(styleId);
  const plainRect =
    shape === 'rect' && (style === 'solid-thin' || style === 'solid-medium' || style === 'solid-thick');
  if (plainRect && target.strokeRect) {
    const fallbackInset = borderInsetDots(dpi) * unitScale;
    const left = insets?.left ?? fallbackInset;
    const right = insets?.right ?? fallbackInset;
    const top = insets?.top ?? fallbackInset;
    const bottom = insets?.bottom ?? fallbackInset;
    const stroke = borderStrokeDots(lineWidthMm, dpi, borderStrokeFallbackMm(style)) * unitScale;
    target.strokeRect(
      originX + left,
      originY + top,
      Math.max(1, boxWidthDots - left - right),
      Math.max(1, boxHeightDots - top - bottom),
      stroke,
      0,
    );
    return;
  }

  const bands = inwardFrameBandsInBox(boxWidthDots, boxHeightDots, dpi, lineWidthMm, style, insets, shape, unitScale);
  for (const band of bands) {
    target.fillRect(originX + band.left, originY + band.top, band.width, band.height, 0);
  }
}
