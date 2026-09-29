/**
 * Task 4.1 offscreen surface.
 *
 * Device: Skia.Surface.MakeOffscreen + canvas draw + readPixels.
 * Host/CI: software dot-buffer fallback when Skia is unavailable in Node.
 */

import { fillEllipse, fillRect, makeDotSurface, strokeRect, type DotSurface } from './dot-surface';

export type TextDrawRecord = {
  text: string;
  x: number;
  y: number;
  fontSizeDots: number;
  family?: string;
  bold?: boolean;
  italic?: boolean;
  backend: RasterSurfaceBackend;
};

let textDrawLog: TextDrawRecord[] = [];

export function resetTextDrawLog(): void {
  textDrawLog = [];
}

export function getTextDrawLog(): TextDrawRecord[] {
  return textDrawLog.slice();
}

export type TextDrawStyle = {
  fontSizeDots: number;
  bold?: boolean;
  italic?: boolean;
  family?: string;
  ink: number;
};

export type RasterSurface = {
  backend: RasterSurfaceBackend;
  width: number;
  height: number;
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number, stroke: number, gray: number) => void;
  fillEllipse: (cx: number, cy: number, rx: number, ry: number, gray: number) => void;
  drawTextLine: (text: string, x: number, y: number, style: TextDrawStyle) => void;
  measureTextWidth: (text: string, style: TextDrawStyle) => number;
  /** Clockwise about (cx, cy), matching a React Native view rotate. No-op at multiples of 360. */
  withRotation: (cx: number, cy: number, degrees: number, draw: () => void) => void;
  readGray: () => Uint8Array;
};

export type SkiaOffscreenProbe = {
  apiAvailable: boolean;
  create600x360: boolean;
  rasterizerBackend: RasterSurfaceBackend;
  error?: string;
};

const FIXTURE_W = 600;
const FIXTURE_H = 360;

type SkiaModule = {
  Skia: {
    Surface: { MakeOffscreen: (w: number, h: number) => SkiaSurface | null };
    Paint: () => SkiaPaint;
    Color: (c: string | number) => unknown;
    XYWHRect: (x: number, y: number, w: number, h: number) => unknown;
    Font: (typeface: unknown, size?: number) => SkiaFont;
  };
  matchFont: (style: {
    fontFamily?: string;
    fontSize: number;
    fontWeight?: string;
    fontStyle?: string;
  }) => SkiaFont;
  PaintStyle: { Fill: number; Stroke: number };
  ColorType: { RGBA_8888: number };
  AlphaType: { Unpremul: number };
};

type SkiaSurface = {
  width: () => number;
  height: () => number;
  getCanvas: () => SkiaCanvas;
  flush: () => void;
  makeImageSnapshot: () => SkiaImage;
};

type SkiaCanvas = {
  clear: (color: unknown) => void;
  drawRect: (rect: unknown, paint: SkiaPaint) => void;
  drawOval: (rect: unknown, paint: SkiaPaint) => void;
  drawText: (text: string, x: number, y: number, paint: SkiaPaint, font: SkiaFont) => void;
  save?: () => void;
  restore?: () => void;
  translate?: (x: number, y: number) => void;
  rotate?: (degrees: number, px?: number, py?: number) => void;
};

type SkiaPaint = {
  setColor: (color: unknown) => void;
  setStyle: (style: number) => void;
  setStrokeWidth: (width: number) => void;
  setAntiAlias: (aa: boolean) => void;
};

type SkiaFont = {
  measureText: (text: string) => { width: number };
};

type SkiaImage = {
  readPixels: (
    x?: number,
    y?: number,
    info?: { width: number; height: number; colorType: number; alphaType: number },
  ) => Uint8Array | Float32Array | null;
};

function loadSkiaModule(): SkiaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@shopify/react-native-skia') as SkiaModule;
  } catch {
    return null;
  }
}

function grayToColor(skia: SkiaModule, gray: number): unknown {
  const v = gray < 0 ? 0 : gray > 255 ? 255 : gray | 0;
  const hex = v.toString(16).padStart(2, '0');
  return skia.Skia.Color(`#${hex}${hex}${hex}`);
}

function rgbaToGray(pixels: Uint8Array | Float32Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = (pixels[o] * 77 + pixels[o + 1] * 150 + pixels[o + 2] * 29) >> 8;
  }
  return gray;
}

function makeSkiaRasterSurface(widthDots: number, heightDots: number, skiaMod: SkiaModule): RasterSurface {
  const { Skia, matchFont, PaintStyle, ColorType, AlphaType } = skiaMod;
  const surface = Skia.Surface.MakeOffscreen(widthDots, heightDots);
  if (!surface) throw new Error('Skia.Surface.MakeOffscreen returned null');

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#FFFFFF'));

  const fillPaint = Skia.Paint();
  fillPaint.setAntiAlias(false);
  const strokePaint = Skia.Paint();
  strokePaint.setAntiAlias(false);
  strokePaint.setStyle(PaintStyle.Stroke);

  const fontCache = new Map<string, SkiaFont>();

  function fontFor(style: TextDrawStyle): SkiaFont {
    const key = `${style.family ?? 'sans-serif'}|${style.fontSizeDots}|${style.bold ? 1 : 0}|${style.italic ? 1 : 0}`;
    let font = fontCache.get(key);
    if (!font) {
      font = matchFont({
        ...(style.family ? { fontFamily: style.family } : {}),
        fontSize: style.fontSizeDots,
        fontWeight: style.bold ? 'bold' : 'normal',
        fontStyle: style.italic ? 'italic' : 'normal',
      });
      try {
        const { printTypeface } = require('./print-typeface') as {
          printTypeface: (family?: string, bold?: boolean) => { dispose?: () => void } | null;
        };
        const face = printTypeface(style.family, style.bold);
        if (face) {
          font = Skia.Font(face, style.fontSizeDots);
        }
      } catch {
        // Keep matchFont when the embedded face is not loaded yet.
      }
      fontCache.set(key, font);
    }
    return font;
  }

  return {
    backend: 'skia',
    width: widthDots,
    height: heightDots,
    fillRect(x, y, w, h, gray) {
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      fillPaint.setAntiAlias(false);
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      canvas.drawRect(Skia.XYWHRect(rx, ry, rw, rh), fillPaint);
    },
    strokeRect(x, y, w, h, stroke, gray) {
      const t = Math.max(1, Math.round(stroke));
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      fillPaint.setAntiAlias(false);
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(t, Math.round(w));
      const rh = Math.max(t, Math.round(h));
      canvas.drawRect(Skia.XYWHRect(rx, ry, rw, t), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx, ry + rh - t, rw, t), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx, ry, t, rh), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx + rw - t, ry, t, rh), fillPaint);
    },
    fillEllipse(cx, cy, rx, ry, gray) {
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      const rxf = Math.max(1, rx);
      const ryf = Math.max(1, ry);
      canvas.drawOval(
        Skia.XYWHRect(cx - rxf, cy - ryf, rxf * 2, ryf * 2),
        fillPaint,
      );
    },
    drawTextLine(text, x, y, style) {
      textDrawLog.push({
        text,
        x,
        y,
        fontSizeDots: style.fontSizeDots,
        family: style.family,
        bold: style.bold,
        italic: style.italic,
        backend: 'skia',
      });
      const font = fontFor(style);
      fillPaint.setColor(grayToColor(skiaMod, style.ink));
      fillPaint.setStyle(PaintStyle.Fill);
      fillPaint.setAntiAlias(true);
      canvas.drawText(text, x, y + style.fontSizeDots, fillPaint, font);
      fillPaint.setAntiAlias(false);
    },
    measureTextWidth(text, style) {
      return fontFor(style).measureText(text).width;
    },
    withRotation(cx, cy, degrees, draw) {
      const turns = ((degrees % 360) + 360) % 360;
      if (turns < 1e-4) {
        draw();
        return;
      }
      if (typeof canvas.save !== 'function' || typeof canvas.rotate !== 'function') {
        draw();
        return;
      }
      canvas.save();
      canvas.translate?.(cx, cy);
      canvas.rotate(degrees, 0, 0);
      canvas.translate?.(-cx, -cy);
      try {
        draw();
      } finally {
        canvas.restore?.();
      }
    },
    readGray() {
      surface.flush();
      const image = surface.makeImageSnapshot();
      const pixels = image.readPixels(0, 0, {
        width: widthDots,
        height: heightDots,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      if (!pixels) throw new Error('Skia readPixels failed');
      return rgbaToGray(pixels, widthDots, heightDots);
    },
  };
}

function makeDotRasterSurface(dot: DotSurface): RasterSurface {
  let rot: { cx: number; cy: number; cos: number; sin: number } | null = null;

  function mapPoint(x: number, y: number): { x: number; y: number } {
    if (!rot) return { x, y };
    const dx = x - rot.cx;
    const dy = y - rot.cy;
    return {
      x: rot.cx + dx * rot.cos - dy * rot.sin,
      y: rot.cy + dx * rot.sin + dy * rot.cos,
    };
  }

  function putDot(x: number, y: number, gray: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= dot.width || iy >= dot.height) return;
    dot.gray[iy * dot.width + ix] = gray < 0 ? 0 : gray > 255 ? 255 : gray;
  }

  function paintRect(x: number, y: number, w: number, h: number, gray: number): void {
    if (!rot) {
      fillRect(dot, x, y, w, h, gray);
      return;
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.ceil(x + w);
    const y1 = Math.ceil(y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const p = mapPoint(px + 0.5, py + 0.5);
        putDot(p.x, p.y, gray);
      }
    }
  }

  function paintEllipse(cx: number, cy: number, rx: number, ry: number, gray: number): void {
    if (!rot) {
      fillEllipse(dot, cx, cy, rx, ry, gray);
      return;
    }
    const x0 = Math.floor(cx - rx);
    const y0 = Math.floor(cy - ry);
    const x1 = Math.ceil(cx + rx);
    const y1 = Math.ceil(cy + ry);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const nx = (px + 0.5 - cx) / Math.max(1, rx);
        const ny = (py + 0.5 - cy) / Math.max(1, ry);
        if (nx * nx + ny * ny > 1) continue;
        const p = mapPoint(px + 0.5, py + 0.5);
        putDot(p.x, p.y, gray);
      }
    }
  }

  return {
    backend: 'dot-buffer',
    width: dot.width,
    height: dot.height,
    fillRect: paintRect,
    strokeRect(x, y, w, h, stroke, gray) {
      if (!rot) {
        strokeRect(dot, x, y, w, h, stroke, gray);
        return;
      }
      const t = Math.max(1, Math.round(stroke));
      paintRect(x, y, w, t, gray);
      paintRect(x, y + h - t, w, t, gray);
      paintRect(x, y, t, h, gray);
      paintRect(x + w - t, y, t, h, gray);
    },
    fillEllipse: paintEllipse,
    drawTextLine(text, x, y, style) {
      textDrawLog.push({
        text,
        x,
        y,
        fontSizeDots: style.fontSizeDots,
        family: style.family,
        bold: style.bold,
        italic: style.italic,
        backend: 'dot-buffer',
      });
      const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
      const cellH = Math.max(1, style.fontSizeDots);
      let cursor = x;
      for (const ch of text) {
        if (ch !== ' ') {
          paintRect(cursor, y, Math.max(1, cellW - 1), Math.max(1, cellH - 1), style.ink);
        }
        cursor += cellW;
      }
    },
    measureTextWidth(text, style) {
      const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
      return text.length * cellW;
    },
    withRotation(cx, cy, degrees, draw) {
      const turns = ((degrees % 360) + 360) % 360;
      if (turns < 1e-4) {
        draw();
        return;
      }
      const rad = (degrees * Math.PI) / 180;
      const prev = rot;
      rot = { cx, cy, cos: Math.cos(rad), sin: Math.sin(rad) };
      try {
        draw();
      } finally {
        rot = prev;
      }
    },
    readGray() {
      return dot.gray;
    },
  };
}

export function makeOffscreenSurface(
  widthDots: number,
  heightDots: number,
  backend?: RasterSurfaceBackend,
): RasterSurface {
  if (backend === 'dot-buffer') {
    return makeDotRasterSurface(makeDotSurface(widthDots, heightDots));
  }
  const skiaMod = loadSkiaModule();
  const makeOffscreen = skiaMod?.Skia?.Surface?.MakeOffscreen;
  if (typeof makeOffscreen === 'function' && backend !== 'dot-buffer') {
    try {
      return makeSkiaRasterSurface(widthDots, heightDots, skiaMod!);
    } catch {
      if (backend === 'skia') {
        throw new Error('Skia.Surface.MakeOffscreen failed');
      }
    }
  }
  if (backend === 'skia') {
    throw new Error('Skia.Surface.MakeOffscreen is not a function');
  }
  return makeDotRasterSurface(makeDotSurface(widthDots, heightDots));
}

export function activeRasterizerBackend(): RasterSurfaceBackend {
  const skiaMod = loadSkiaModule();
  if (typeof skiaMod?.Skia?.Surface?.MakeOffscreen !== 'function') return 'dot-buffer';
  try {
    const probe = skiaMod!.Skia.Surface.MakeOffscreen(8, 8);
    return probe ? 'skia' : 'dot-buffer';
  } catch {
    return 'dot-buffer';
  }
}

export function probeSkiaOffscreen(): boolean {
  const skiaMod = loadSkiaModule();
  return typeof skiaMod?.Skia?.Surface?.MakeOffscreen === 'function';
}

/** On-device GATE-A probe: API presence + 600×360 fixture surface creation. */
export function probeSkiaOffscreenDetailed(): SkiaOffscreenProbe {
  const skiaMod = loadSkiaModule();
  const makeOffscreen = skiaMod?.Skia?.Surface?.MakeOffscreen;
  const backend = activeRasterizerBackend();
  const apiAvailable = typeof makeOffscreen === 'function';
  if (!apiAvailable) {
    return {
      apiAvailable: false,
      create600x360: false,
      rasterizerBackend: backend,
      error: 'Skia.Surface.MakeOffscreen is not a function',
    };
  }
  try {
    const surface = makeOffscreen!(FIXTURE_W, FIXTURE_H);
    if (!surface) {
      return {
        apiAvailable: true,
        create600x360: false,
        rasterizerBackend: backend,
        error: 'MakeOffscreen returned null',
      };
    }
    const w = surface.width?.();
    const h = surface.height?.();
    if (w !== FIXTURE_W || h !== FIXTURE_H) {
      return {
        apiAvailable: true,
        create600x360: false,
        rasterizerBackend: backend,
        error: `MakeOffscreen size mismatch: got ${w}×${h}, expected ${FIXTURE_W}×${FIXTURE_H}`,
      };
    }
    return {
      apiAvailable: true,
      create600x360: true,
      rasterizerBackend: backend,
    };
  } catch (err) {
    return {
      apiAvailable: true,
      create600x360: false,
      rasterizerBackend: backend,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
