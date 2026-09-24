/** 72 PDF points per inch. */
export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH;

export type PageScope =
  | { mode: 'this' }
  | { mode: 'all' }
  | { mode: 'range'; start: number; end: number };

export type OutputSizeKind = 'custom' | '3x4' | '3x5' | '4x4' | '4x6';

export type OutputSize = {
  kind: OutputSizeKind;
  widthMm: number;
  heightMm: number;
};

export const OUTPUT_SIZE_PRESETS: { kind: Exclude<OutputSizeKind, 'custom'>; label: string; widthMm: number; heightMm: number }[] =
  [
    { kind: '3x4', label: '3"×4" / 76×100mm', widthMm: 76, heightMm: 100 },
    { kind: '3x5', label: '3"×5" / 76×130mm', widthMm: 76, heightMm: 130 },
    { kind: '4x4', label: '4"×4" / 100×100mm', widthMm: 100, heightMm: 100 },
    { kind: '4x6', label: '4"×6" / 101.6×152.4mm', widthMm: 101.6, heightMm: 152.4 },
  ];

export const DEFAULT_OUTPUT_SIZE: OutputSize = {
  kind: '4x6',
  widthMm: 101.6,
  heightMm: 152.4,
};

export type NinePoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const NINE_POINTS: NinePoint[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export function ninePointToOffsetNorm(anchor: NinePoint): { x: number; y: number } {
  const col = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : 0.5;
  const row = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5;
  return { x: col, y: row };
}

export type PdfCrop = {
  scope: PageScope;
  originNorm: { x: number; y: number };
  sizeNorm?: { w: number; h: number };
};

export type PdfWatermark = {
  scope: PageScope;
  type: 'text' | 'image';
  layout: 'stamp' | 'tiled';
  opacity: number;
  rotationDeg: number;
  text?: { content: string; fontSizePt: number; color: string };
  image?: {
    sourceUri: string;
    tileUri: string;
    tilePx: { w: number; h: number };
  };
  stamp?: {
    anchor: NinePoint;
    offsetNorm: { x: number; y: number };
    sizeNorm: number;
  };
  tiled?: { spacingNorm: { x: number; y: number } };
};

export type PdfEditSession = {
  sourceUri: string;
  sourceName: string;
  pageCount: number;
  pageSizesPt: { w: number; h: number }[];
  currentPageIndex: number;
  outputSize: OutputSize;
  crop: PdfCrop | null;
  rotationByPage: number[];
  sharpnessByPage: number[];
  watermark: PdfWatermark | null;
};

export type PdfBoxPts = { x: number; y: number; w: number; h: number; fits: boolean };

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}

/**
 * Inclusive 1-based range. Out-of-range values are clamped.
 * If start > end after clamp, they are swapped and `error` is set.
 */
export function parsePageRange(
  startRaw: string,
  endRaw: string,
  pageCount: number,
): { start: number; end: number; error?: string } {
  const max = Math.max(1, pageCount);
  const parseOne = (raw: string, fallback: number) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(1, n));
  };
  let start = parseOne(startRaw, 1);
  let end = parseOne(endRaw, max);
  let error: string | undefined;
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
    error = 'Range start was after end; clamped to a valid inclusive range.';
  }
  return { start, end, error };
}

export function resolveScopeIndices(
  scope: PageScope,
  pageCount: number,
  currentPageIndex: number,
): number[] {
  if (pageCount <= 0) return [];
  if (scope.mode === 'this') {
    const i = Math.min(pageCount - 1, Math.max(0, currentPageIndex));
    return [i];
  }
  if (scope.mode === 'all') {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const { start, end } = parsePageRange(String(scope.start), String(scope.end), pageCount);
  const out: number[] = [];
  for (let i = start - 1; i <= end - 1; i++) out.push(i);
  return out;
}

export function cropWindowFitsPage(
  pageWpt: number,
  pageHpt: number,
  output: OutputSize,
): boolean {
  const w = mmToPt(output.widthMm);
  const h = mmToPt(output.heightMm);
  return w <= pageWpt + 0.01 && h <= pageHpt + 0.01;
}

/**
 * Crop window in PDF user space (origin bottom-left).
 * `originNorm` is top-left of the window, 0–1 of the original MediaBox.
 */
export function cropWindowPts(
  page: { w: number; h: number },
  output: OutputSize,
  originNorm: { x: number; y: number },
  sizeNorm?: { w: number; h: number },
): PdfBoxPts {
  let w: number;
  let h: number;
  if (sizeNorm && sizeNorm.w > 0 && sizeNorm.h > 0) {
    w = Math.min(page.w, Math.max(10, sizeNorm.w * page.w));
    h = Math.min(page.h, Math.max(10, sizeNorm.h * page.h));
  } else {
    w = mmToPt(output.widthMm);
    h = mmToPt(output.heightMm);
    if (w > page.w || h > page.h) {
      const scale = Math.min(page.w / Math.max(1, w), page.h / Math.max(1, h));
      w = Math.max(10, w * scale);
      h = Math.max(10, h * scale);
    }
  }
  const maxX = Math.max(0, page.w - w);
  const maxYTop = Math.max(0, page.h - h);
  const x = Math.min(maxX, Math.max(0, originNorm.x * page.w));
  const yTop = Math.min(maxYTop, Math.max(0, originNorm.y * page.h));
  const y = Math.max(0, page.h - yTop - h);
  return { x, y, w, h, fits: true };
}

/** Stamp size/position in PDF points of the *original* page, after crop boxes are set. */
export function stampRectInCropSpace(
  crop: PdfBoxPts,
  stamp: { offsetNorm: { x: number; y: number }; sizeNorm: number },
): { x: number; y: number; w: number; h: number } {
  const size = Math.min(1, Math.max(0.02, stamp.sizeNorm));
  const w = crop.w * size;
  const h = crop.h * size;
  const ox = Math.min(1, Math.max(0, stamp.offsetNorm.x));
  const oy = Math.min(1, Math.max(0, stamp.offsetNorm.y));
  const x = crop.x + ox * crop.w - w / 2;
  const yTop = oy * crop.h;
  const y = crop.y + (crop.h - yTop - h / 2);
  return { x, y, w, h };
}

export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

export function sharpnessAmount(slider0to100: number): number {
  const t = Math.min(100, Math.max(0, slider0to100)) / 100;
  return t * 2.5;
}

export function shouldRasterizePage(sharpness: number): boolean {
  return sharpness > 0;
}

export function sharpness0CropBoxesEqual(media: PdfBoxPts, crop: PdfBoxPts): boolean {
  return media.x === crop.x && media.y === crop.y && media.w === crop.w && media.h === crop.h;
}

/**
 * Tile repeat count from spacing vs the post-crop page, never from source image pixels.
 */
export function tiledRepeatCount(
  spacingNorm: { x: number; y: number },
): { cols: number; rows: number } {
  const sx = Math.min(0.8, Math.max(0.08, spacingNorm.x));
  const sy = Math.min(0.8, Math.max(0.08, spacingNorm.y));
  return {
    cols: Math.max(1, Math.round(1 / sx)),
    rows: Math.max(1, Math.round(1 / sy)),
  };
}

export function defaultWatermark(): PdfWatermark {
  return {
    scope: { mode: 'this' },
    type: 'text',
    layout: 'stamp',
    opacity: 0.45,
    rotationDeg: -30,
    text: { content: 'WATERMARK', fontSizePt: 22, color: '#DC2626' },
    stamp: {
      anchor: 'center',
      offsetNorm: { x: 0.5, y: 0.5 },
      sizeNorm: 0.38,
    },
    tiled: { spacingNorm: { x: 0.22, y: 0.22 } },
  };
}
