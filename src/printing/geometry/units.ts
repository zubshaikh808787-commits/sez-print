/**
 * Printer-independent millimetre ↔ dot geometry.
 * DPI / dots-per-mm come from RenderConfiguration (printer capability), never globals.
 */

export const MM_PER_INCH = 25.4;

export type AxisDpi = {
  dpiX: number;
  dpiY: number;
  /** Hardware dots/mm when the head is not dpi/25.4 (e.g. 304 DPI = 12 dpm). */
  dotsPerMmX?: number;
  dotsPerMmY?: number;
};

export type DotRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  widthDots: number;
  heightDots: number;
};

function axisDotsPerMm(dpi: number, hardware?: number): number {
  if (Number.isFinite(hardware) && (hardware as number) > 0) return hardware as number;
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new Error('Printer DPI is unknown. Set the printer profile before rasterizing.');
  }
  return dpi / MM_PER_INCH;
}

export function dotsPerMmX(axis: AxisDpi): number {
  return axisDotsPerMm(axis.dpiX, axis.dotsPerMmX);
}

export function dotsPerMmY(axis: AxisDpi): number {
  return axisDotsPerMm(axis.dpiY, axis.dotsPerMmY);
}

export function mmToDotsX(mm: number, axis: AxisDpi): number {
  if (!Number.isFinite(mm) || mm === 0) return 0;
  return Math.round(mm * dotsPerMmX(axis));
}

export function mmToDotsY(mm: number, axis: AxisDpi): number {
  if (!Number.isFinite(mm) || mm === 0) return 0;
  return Math.round(mm * dotsPerMmY(axis));
}

export function dotsToMmX(dots: number, axis: AxisDpi): number {
  const dpm = dotsPerMmX(axis);
  if (!(dpm > 0) || !Number.isFinite(dots)) return 0;
  return Math.round((dots / dpm) * 100) / 100;
}

export function dotsToMmY(dots: number, axis: AxisDpi): number {
  const dpm = dotsPerMmY(axis);
  if (!(dpm > 0) || !Number.isFinite(dots)) return 0;
  return Math.round((dots / dpm) * 100) / 100;
}

/** Edge-based rounding so stacked boxes do not accumulate drift. */
export function rectMmToDots(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  axis: AxisDpi,
): DotRect {
  const x0 = mmToDotsX(xMm, axis);
  const y0 = mmToDotsY(yMm, axis);
  const x1 = mmToDotsX(xMm + widthMm, axis);
  const y1 = mmToDotsY(yMm + heightMm, axis);
  return {
    x0,
    y0,
    x1,
    y1,
    widthDots: x1 - x0,
    heightDots: y1 - y0,
  };
}

export function pageSizeDots(widthMm: number, heightMm: number, axis: AxisDpi): {
  widthDots: number;
  heightDots: number;
} {
  const rect = rectMmToDots(0, 0, widthMm, heightMm, axis);
  return {
    widthDots: Math.max(1, rect.widthDots),
    heightDots: Math.max(1, rect.heightDots),
  };
}
