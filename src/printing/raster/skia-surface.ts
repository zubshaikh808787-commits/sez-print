/**
 * Task 4.1 offscreen surface.
 *
 * Device: Skia.Surface.MakeOffscreen + canvas draw + readPixels.
 * Host/CI: software dot-buffer fallback when Skia is unavailable in Node.
 */

import { fillEllipse, fillRect, makeDotSurface, strokeRect, type DotSurface } from './dot-surface';

export type RasterSurfaceBackend = 'skia' | 'dot-buffer';

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
        fontFamily: style.family ?? 'sans-serif',
        fontSize: style.fontSizeDots,
        fontWeight: style.bold ? 'bold' : 'normal',
        fontStyle: style.italic ? 'italic' : 'normal',
      });
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
      canvas.drawRect(Skia.XYWHRect(x, y, w, h), fillPaint);
    },
    strokeRect(x, y, w, h, stroke, gray) {
      const t = Math.max(1, Math.round(stroke));
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.round(w);
      const rh = Math.round(h);
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
      const font = fontFor(style);
      fillPaint.setColor(grayToColor(skiaMod, style.ink));
      fillPaint.setStyle(PaintStyle.Fill);
      canvas.drawText(text, x, y + style.fontSizeDots, fillPaint, font);
    },
    measureTextWidth(text, style) {
      return fontFor(style).measureText(text).width;
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
  return {
    backend: 'dot-buffer',
    width: dot.width,
    height: dot.height,
    fillRect(x, y, w, h, gray) {
      fillRect(dot, x, y, w, h, gray);
    },
    strokeRect(x, y, w, h, stroke, gray) {
      strokeRect(dot, x, y, w, h, stroke, gray);
    },
    fillEllipse(cx, cy, rx, ry, gray) {
      fillEllipse(dot, cx, cy, rx, ry, gray);
    },
    drawTextLine(text, x, y, style) {
      const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
      const cellH = Math.max(1, style.fontSizeDots);
      let cx = x;
      for (const ch of text) {
        if (ch !== ' ') {
          fillRect(dot, cx, y, Math.max(1, cellW - 1), Math.max(1, cellH - 1), style.ink);
        }
        cx += cellW;
      }
    },
    measureTextWidth(text, style) {
      const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
      return text.length * cellW;
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
