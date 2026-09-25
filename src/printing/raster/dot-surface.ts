/**
 * Integer-dot page buffer. 8-bit gray, 255 = white, 0 = black ink.
 * Used as the Stage A offscreen surface when Skia MakeOffscreen is unavailable.
 */

export type DotSurface = {
  width: number;
  height: number;
  gray: Uint8Array;
};

export function makeDotSurface(width: number, height: number): DotSurface {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const gray = new Uint8Array(w * h);
  gray.fill(255);
  return { width: w, height: h, gray };
}

export function fillRect(
  surface: DotSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(surface.width, Math.round(x + w));
  const y1 = Math.min(surface.height, Math.round(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  const ink = value < 0 ? 0 : value > 255 ? 255 : value;
  const { width, gray } = surface;
  for (let py = y0; py < y1; py++) {
    const row = py * width;
    gray.fill(ink, row + x0, row + x1);
  }
}

/** Axis-aligned stroke, integer thickness, ink inside the box. */
export function strokeRect(
  surface: DotSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  value: number,
): void {
  const t = Math.max(1, Math.round(stroke));
  const rw = Math.round(w);
  const rh = Math.round(h);
  const rx = Math.round(x);
  const ry = Math.round(y);
  fillRect(surface, rx, ry, rw, t, value);
  fillRect(surface, rx, ry + rh - t, rw, t, value);
  fillRect(surface, rx, ry, t, rh, value);
  fillRect(surface, rx + rw - t, ry, t, rh, value);
}

export function fillEllipse(
  surface: DotSurface,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  value: number,
): void {
  const ink = value < 0 ? 0 : value > 255 ? 255 : value;
  const { width, height, gray } = surface;
  const rxf = Math.max(1, rx);
  const ryf = Math.max(1, ry);
  const x0 = Math.max(0, Math.floor(cx - rxf));
  const x1 = Math.min(width - 1, Math.ceil(cx + rxf));
  const y0 = Math.max(0, Math.floor(cy - ryf));
  const y1 = Math.min(height - 1, Math.ceil(cy + ryf));
  const rx2 = rxf * rxf;
  const ry2 = ryf * ryf;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - cy;
    const row = py * width;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - cx;
      if (dx * dx / rx2 + dy * dy / ry2 <= 1) {
        gray[row + px] = ink;
      }
    }
  }
}
