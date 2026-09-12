/**
 * Unified die-cut silhouettes for jewelry + cable catalog cards and the editor.
 * Coordinates are millimetres. Overlay is preview/editor chrome — not printed.
 */

import { JEWELRY_DIECUT } from '@/constants/jewelry-diecut';
import {
  geometryForPreviewType,
  isRatTailGeometry,
  type MediaGeometry,
  type RatTailGeometry,
} from '@/lib/media-geometry';

export type StockFold = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed?: boolean;
};
export type StockHole = { cx: number; cy: number; r: number };

export type StockSilhouetteSpec = {
  fill: string;
  stroke: string;
  strokeMm: number;
  paths: string[];
  folds: StockFold[];
  holes: StockHole[];
};

const STROKE = '#7A848F';
const STROKE_DARK = '#2C3338';
const FILL = '#FFFFFF';
export const STOCK_YELLOW = '#F7E329';
export const STOCK_RED = '#E53935';
const YELLOW = STOCK_YELLOW;
const RED = '#E31B23';
const STROKE_MM = 0.18;

/** Shared millimetre frames so silhouette paths and content elements stay aligned. */
export const JEWEL_STOCK = {
  hangTab: { gap: 1.15, tabH: 8, tabW: 7.4 },
  bar53: { neckW: 3.8, neckH: 3.15 },
  holes50: { gap: 0.9, holeR: 1.2, holeInset: 2.7 },
  flag20: { headW: 20, tailH: 5.6 },
  p50: { headW: 50, tailH: 4.2, foldX: 25 },
  stacked: { headW: 25, tailH: 7, gap: 0.45 },
  flower: { headW: 30, tailH: 6.2 },
  rattail101: { headW: 63.5, tailH: 4.0 },
  hangtag: { tabW: 5.6 },
  threeUp: { cols: 3, tagW: 14, bodyRatio: 0.58, tailW: 2.8 },
} as const;

export const CABLE_STOCK = {
  yellowCols: 4,
  barbell: { headW: 74, tailH: 4.3, foldX: 37 },
  p301: { headW: 38, tailH: 7.4 },
  inspected: { headW: 44.5, tailH: 6.2 },
  tallFlag: { bodyRatio: 0.66 },
  d38: { headW: 38, headH: 25, tailH: 6.2 },
  hb38: { headW: 38, tailH: 6.2 },
  lf45: { headW: 45, tailH: 7 },
  lf64: { headW: 64, tailH: 7.2 },
  lt38: { headH: 25, tailW: 8.5 },
  lt45: { headH: 30, tailW: 10 },
  pstyle: { headW: 30, tailH: 6.4 },
  panel23: { headW: 38.1, tailH: 7 },
  tstyle: { headH: 19.8, tailW: 7.4 },
} as const;

export function jewHangTabLayout(w: number, h: number) {
  const { gap, tabH, tabW } = JEWEL_STOCK.hangTab;
  const colW = (w - gap) / 2;
  return { gap, tabH, tabW, colW, bodyH: h - tabH };
}

export function jewThreeUpLayout(w: number, h: number) {
  const { cols, tagW, bodyRatio, tailW } = JEWEL_STOCK.threeUp;
  const sideMargin = w >= 50 ? Math.max(2.0, (w - 46) / 2 + 1.0) : Math.max(1.0, (w - tagW * cols) / 4);
  const printableW = Math.max(tagW * cols, w - sideMargin * 2);
  const gap = (printableW - tagW * cols) / Math.max(1, cols - 1);
  const bodyH = h * bodyRatio;
  return { cols, tagW, gap, bodyH, tailW, tailH: h - bodyH, sideMargin };
}

function n(v: number) {
  return (Math.round(v * 1000) / 1000).toString();
}

function roundedRectD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0.05, Math.min(r, w / 2 - 0.05, h / 2 - 0.05));
  const x2 = x + w;
  const y2 = y + h;
  return [
    `M ${n(x + rr)} ${n(y)}`,
    `H ${n(x2 - rr)}`,
    `A ${n(rr)} ${n(rr)} 0 0 1 ${n(x2)} ${n(y + rr)}`,
    `V ${n(y2 - rr)}`,
    `A ${n(rr)} ${n(rr)} 0 0 1 ${n(x2 - rr)} ${n(y2)}`,
    `H ${n(x + rr)}`,
    `A ${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y2 - rr)}`,
    `V ${n(y + rr)}`,
    `A ${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}`,
    'Z',
  ].join(' ');
}

function circleD(cx: number, cy: number, r: number): string {
  return `M ${n(cx - r)} ${n(cy)} a ${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
}

/** Head + tail on the right. Tail is vertically inside the head. */
function headRightTailD(
  hx: number,
  hy: number,
  hw: number,
  hh: number,
  tailY: number,
  tailW: number,
  tailH: number,
  r: number,
): string {
  const hr = Math.max(0.05, Math.min(r, hw / 2.4, hh / 2.4));
  const tr = Math.max(0.05, Math.min(r, tailW / 2.2, tailH / 2.2));
  const hx2 = hx + hw;
  const hy2 = hy + hh;
  const ty = Math.max(hy + 0.15, tailY);
  const ty2 = Math.min(hy2 - 0.15, ty + tailH);
  const tx2 = hx2 + tailW;
  return [
    `M ${n(hx + hr)} ${n(hy)}`,
    `H ${n(hx2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2)} ${n(hy + hr)}`,
    `V ${n(ty)}`,
    `H ${n(tx2 - tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx2)} ${n(ty + tr)}`,
    `V ${n(ty2 - tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx2 - tr)} ${n(ty2)}`,
    `H ${n(hx2)}`,
    `V ${n(hy2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2 - hr)} ${n(hy2)}`,
    `H ${n(hx + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx)} ${n(hy2 - hr)}`,
    `V ${n(hy + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx + hr)} ${n(hy)}`,
    'Z',
  ].join(' ');
}

/** Head + tail on the left. */
function headLeftTailD(
  hx: number,
  hy: number,
  hw: number,
  hh: number,
  tailY: number,
  tailW: number,
  tailH: number,
  r: number,
): string {
  const hr = Math.max(0.05, Math.min(r, hw / 2.4, hh / 2.4));
  const tr = Math.max(0.05, Math.min(r, tailW / 2.2, tailH / 2.2));
  const hx2 = hx + hw;
  const hy2 = hy + hh;
  const ty = Math.max(hy + 0.15, tailY);
  const ty2 = Math.min(hy2 - 0.15, ty + tailH);
  const tx = hx - tailW;
  return [
    `M ${n(hx + hr)} ${n(hy)}`,
    `H ${n(hx2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2)} ${n(hy + hr)}`,
    `V ${n(hy2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2 - hr)} ${n(hy2)}`,
    `H ${n(hx + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx)} ${n(hy2 - hr)}`,
    `V ${n(ty2)}`,
    `H ${n(tx + tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx)} ${n(ty2 - tr)}`,
    `V ${n(ty + tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx + tr)} ${n(ty)}`,
    `H ${n(hx)}`,
    `V ${n(hy + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx + hr)} ${n(hy)}`,
    'Z',
  ].join(' ');
}

/** Head on top, tail down from center (jewelry / T-style). */
function headBottomTailD(
  hx: number,
  hy: number,
  hw: number,
  hh: number,
  tailW: number,
  tailH: number,
  r: number,
): string {
  const hr = Math.max(0.05, Math.min(r, hw / 2.4, hh / 2.4));
  const tr = Math.max(0.05, Math.min(r, tailW / 2.1, tailH / 2.1));
  const hx2 = hx + hw;
  const hy2 = hy + hh;
  const tx = hx + (hw - tailW) / 2;
  const tx2 = tx + tailW;
  const ty2 = hy2 + tailH;
  return [
    `M ${n(hx + hr)} ${n(hy)}`,
    `H ${n(hx2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2)} ${n(hy + hr)}`,
    `V ${n(hy2 - hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx2 - hr)} ${n(hy2)}`,
    `H ${n(tx2)}`,
    `V ${n(ty2 - tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx2 - tr)} ${n(ty2)}`,
    `H ${n(tx + tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx)} ${n(ty2 - tr)}`,
    `V ${n(hy2)}`,
    `H ${n(hx + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx)} ${n(hy2 - hr)}`,
    `V ${n(hy + hr)}`,
    `A ${n(hr)} ${n(hr)} 0 0 1 ${n(hx + hr)} ${n(hy)}`,
    'Z',
  ].join(' ');
}

/** Body + tab on the top center (hang-tag 50x19+8). */
function bodyTopTabD(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  tabW: number,
  tabH: number,
  r: number,
): string {
  const br = Math.max(0.05, Math.min(r, bw / 2.4, bh / 2.4));
  const tr = Math.max(0.05, Math.min(0.7, tabW / 2.4, tabH / 2.4));
  const bx2 = bx + bw;
  const by2 = by + bh;
  const tx = bx + (bw - tabW) / 2;
  const tx2 = tx + tabW;
  const ty = by - tabH;
  return [
    `M ${n(tx + tr)} ${n(ty)}`,
    `H ${n(tx2 - tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx2)} ${n(ty + tr)}`,
    `V ${n(by)}`,
    `H ${n(bx2 - br)}`,
    `A ${n(br)} ${n(br)} 0 0 1 ${n(bx2)} ${n(by + br)}`,
    `V ${n(by2 - br)}`,
    `A ${n(br)} ${n(br)} 0 0 1 ${n(bx2 - br)} ${n(by2)}`,
    `H ${n(bx + br)}`,
    `A ${n(br)} ${n(br)} 0 0 1 ${n(bx)} ${n(by2 - br)}`,
    `V ${n(by + br)}`,
    `A ${n(br)} ${n(br)} 0 0 1 ${n(bx + br)} ${n(by)}`,
    `H ${n(tx)}`,
    `V ${n(ty + tr)}`,
    `A ${n(tr)} ${n(tr)} 0 0 1 ${n(tx + tr)} ${n(ty)}`,
    'Z',
  ].join(' ');
}

function dumbbellD(w: number, h: number, neckW: number, neckH: number): string {
  const capW = (w - neckW) / 2;
  const r = Math.min(2.6, h * 0.42);
  const ny = (h - neckH) / 2;
  const nx = capW;
  const nx2 = capW + neckW;
  return [
    `M ${n(r)} ${n(0)}`,
    `H ${n(capW)}`,
    `V ${n(ny)}`,
    `H ${n(nx2)}`,
    `V ${n(0)}`,
    `H ${n(w - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}`,
    `V ${n(h - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}`,
    `H ${n(nx2)}`,
    `V ${n(ny + neckH)}`,
    `H ${n(nx)}`,
    `V ${n(h)}`,
    `H ${n(r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(0)} ${n(h - r)}`,
    `V ${n(r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(0)}`,
    'Z',
  ].join(' ');
}

/** Two stacked faces + wrap tail (30x25+45). */
function stackedRightTailPaths(
  w: number,
  h: number,
  headW: number,
  tailH: number,
  r: number,
): string[] {
  const gap = 0.45;
  const panelH = (h - gap) / 2;
  const tailW = Math.max(0.8, w - headW);
  const ty = (h - tailH) / 2;
  return [
    roundedRectD(0, 0, headW, panelH, r),
    roundedRectD(0, panelH + gap, headW, panelH, r),
    roundedRectD(headW - 0.15, ty, tailW + 0.15, tailH, Math.min(r, tailH / 2)),
  ];
}

/** Two equal blocks + neck + thin tail (12.5x74+35). */
function barbellRightTailPaths(w: number, h: number, headW: number, tailH: number): string[] {
  const neckW = Math.min(3.4, headW * 0.046);
  const neckH = Math.min(4.0, h * 0.34);
  const tailW = Math.max(0.8, w - headW);
  const ty = (h - tailH) / 2;
  return [
    dumbbellD(headW, h, neckW, neckH),
    roundedRectD(headW - 0.2, ty, tailW + 0.2, tailH, tailH / 2),
  ];
}

function spec(
  paths: string[],
  extra: Partial<StockSilhouetteSpec> = {},
): StockSilhouetteSpec {
  return {
    fill: FILL,
    stroke: STROKE,
    strokeMm: STROKE_MM,
    paths,
    folds: [],
    holes: [],
    ...extra,
  };
}

function specFromRatTail(g: RatTailGeometry): StockSilhouetteSpec {
  const r = g.cornerRadiusMm ?? 1.15;
  const bw = g.bodyWidthMm;
  const bh = g.bodyHeightMm;
  const tl = g.tailLengthMm;
  const th = g.tailHeightMm;
  if (g.tailPosition === 'right') {
    return spec([headRightTailD(0, 0, bw, bh, (bh - th) / 2, tl, th, r)], {
      stroke: STROKE_DARK,
      strokeMm: 0.22,
    });
  }
  if (g.tailPosition === 'left') {
    return spec([headLeftTailD(tl, 0, bw, bh, (bh - th) / 2, tl, th, r)], {
      stroke: STROKE_DARK,
      strokeMm: 0.22,
    });
  }
  if (g.tailPosition === 'bottom') {
    return spec([headBottomTailD(0, 0, bw, bh, th, tl, r)], {
      stroke: STROKE_DARK,
      strokeMm: 0.22,
    });
  }
  return spec([bodyTopTabD(0, tl, bw, bh, th, tl, r)], {
    stroke: STROKE_DARK,
    strokeMm: 0.22,
  });
}

export function hasStockSilhouette(previewType?: string | null): boolean {
  if (!previewType) return false;
  if (previewType.startsWith('jew-')) return true;
  if (previewType.startsWith('cable-') && !previewType.startsWith('cable-flag-')) return true;
  return false;
}

export function stockSilhouetteSpec(
  previewType: string | undefined,
  w: number,
  h: number,
  geometry?: MediaGeometry | null,
): StockSilhouetteSpec | null {
  if (!previewType || !hasStockSilhouette(previewType)) {
    if (!isRatTailGeometry(geometry)) return null;
  }

  const fromGeom = isRatTailGeometry(geometry) ? geometry : geometryForPreviewType(previewType);
  if (isRatTailGeometry(fromGeom)) return specFromRatTail(fromGeom);
  if (!previewType || !hasStockSilhouette(previewType)) return null;

  switch (previewType) {
    case 'jew-sample-50x19-tabs': {
      const { gap, colW, tabH, tabW, bodyH } = jewHangTabLayout(w, h);
      return spec(
        [
          bodyTopTabD(0, tabH, colW, bodyH, tabW, tabH, 0.08),
          bodyTopTabD(colW + gap, tabH, colW, bodyH, tabW, tabH, 0.08),
        ],
        {
          stroke: STROKE_DARK,
          strokeMm: 0.26,
          holes: [
            { cx: colW / 2, cy: tabH * 0.46, r: 1.15 },
            { cx: colW + gap + colW / 2, cy: tabH * 0.46, r: 1.15 },
          ],
        },
      );
    }
    case 'jew-sample-53x14-bar':
      return spec([dumbbellD(w, h, JEWEL_STOCK.bar53.neckW, JEWEL_STOCK.bar53.neckH)], {
        stroke: '#A8B0B8',
        strokeMm: 0.14,
      });
    case 'jew-dumbell-13x85':
    case 'jew-dumbell-15x85':
      return spec([dumbbellD(w, h, Math.min(3.6, w * 0.045), Math.min(4.2, h * 0.32))]);

    case 'jew-label-20x20-right': {
      const { headW, tailH } = JEWEL_STOCK.flag20;
      return spec([headRightTailD(0, 0, headW, h, (h - tailH) / 2, w - headW, tailH, 1.4)], {
        folds: [{ x1: 0.8, y1: h / 2, x2: headW - 0.8, y2: h / 2 }],
      });
    }
    case 'jew-label-20x20-left': {
      const { headW, tailH } = JEWEL_STOCK.flag20;
      return spec([headLeftTailD(w - headW, 0, headW, h, (h - tailH) / 2, w - headW, tailH, 1.4)], {
        folds: [{ x1: w - headW + 0.8, y1: h / 2, x2: w - 0.8, y2: h / 2 }],
      });
    }

    case 'jew-label-50x13-horizontal':
      return spec(
        [headRightTailD(0, 0, JEWEL_STOCK.p50.headW, h, (h - JEWEL_STOCK.p50.tailH) / 2, w - JEWEL_STOCK.p50.headW, JEWEL_STOCK.p50.tailH, 1.2)],
        {
          folds: [{ x1: JEWEL_STOCK.p50.foldX, y1: 0.5, x2: JEWEL_STOCK.p50.foldX, y2: h - 0.5 }],
        },
      );
    case 'jew-label-50x13-yellow':
      return spec(
        [headRightTailD(0, 0, JEWEL_STOCK.p50.headW, h, (h - JEWEL_STOCK.p50.tailH) / 2, w - JEWEL_STOCK.p50.headW, JEWEL_STOCK.p50.tailH, 1.2)],
        {
          fill: YELLOW,
          stroke: '#1F2937',
          strokeMm: 0.18,
          folds: [
            { x1: JEWEL_STOCK.p50.foldX, y1: 0.5, x2: JEWEL_STOCK.p50.foldX, y2: h - 0.5 },
            { x1: 62, y1: (h - 2.8) / 2, x2: 74, y2: (h - 2.8) / 2 },
          ],
        },
      );

    case 'jew-sample-25x30-flower':
      return spec(
        [headRightTailD(0, 0, JEWEL_STOCK.flower.headW, h, (h - JEWEL_STOCK.flower.tailH) / 2, w - JEWEL_STOCK.flower.headW, JEWEL_STOCK.flower.tailH, 1.5)],
        {
          folds: [{ x1: JEWEL_STOCK.flower.headW / 2, y1: 0.7, x2: JEWEL_STOCK.flower.headW / 2, y2: h - 0.7 }],
        },
      );
    case 'jew-sample-30x25-stacked':
    case 'jew-sample-30x25-pattern': {
      const { headW, tailH } = JEWEL_STOCK.stacked;
      return spec(stackedRightTailPaths(w, h, headW, tailH, 1.6), {
        folds: [{ x1: 0.7, y1: h / 2, x2: headW - 0.7, y2: h / 2 }],
      });
    }

    case 'jew-sample-50x15-holes': {
      const { gap, holeR, holeInset } = JEWEL_STOCK.holes50;
      const colW = (w - gap) / 2;
      return spec(
        [roundedRectD(0, 0, colW, h, 1.4), roundedRectD(colW + gap, 0, colW, h, 1.4)],
        {
          holes: [
            { cx: holeInset, cy: holeInset, r: holeR },
            { cx: w - holeInset, cy: holeInset, r: holeR },
          ],
        },
      );
    }

    case 'jew-label-46x100':
    case 'jew-rattail-3row-14x100': {
      const { cols, tagW, gap, bodyH, tailW, tailH, sideMargin } = jewThreeUpLayout(w, h);
      const paths = Array.from({ length: cols }, (_, i) =>
        headBottomTailD(sideMargin + i * (tagW + gap), 0, tagW, bodyH, tailW, tailH, 2.1),
      );
      const folds = Array.from({ length: cols }, (_, i) => {
        const x = sideMargin + i * (tagW + gap);
        return { x1: x + 0.7, y1: bodyH / 2, x2: x + tagW - 0.7, y2: bodyH / 2 };
      });
      return spec(paths, { folds });
    }

    case 'jew-rattail-3row-54x100': {
      const { tagWidthMm, bodyHeightMm, foldYMm, tailWidthMm, tailHeightMm, sideMarginMm, gapMm, columns } =
        JEWELRY_DIECUT;
      const paths = Array.from({ length: columns }, (_, i) =>
        headBottomTailD(
          sideMarginMm + i * (tagWidthMm + gapMm),
          0,
          tagWidthMm,
          bodyHeightMm,
          tailWidthMm,
          tailHeightMm,
          2,
        ),
      );
      const folds = Array.from({ length: columns }, (_, i) => {
        const x = sideMarginMm + i * (tagWidthMm + gapMm);
        return { x1: x + 0.6, y1: foldYMm, x2: x + tagWidthMm - 0.6, y2: foldYMm };
      });
      return spec(paths, { folds });
    }

    case 'jew-rattail-single-12x100':
      return spec(
        [
          headBottomTailD(
            0,
            0,
            w,
            JEWELRY_DIECUT.bodyHeightMm,
            JEWELRY_DIECUT.tailWidthMm,
            JEWELRY_DIECUT.tailHeightMm,
            2,
          ),
        ],
        {
          folds: [
            {
              x1: 0.6,
              y1: JEWELRY_DIECUT.foldYMm,
              x2: w - 0.6,
              y2: JEWELRY_DIECUT.foldYMm,
            },
          ],
        },
      );

    case 'jew-rattail-single-14x100':
    case 'jew-rattail-vertical-15x80':
      return spec([headBottomTailD(0.2, 0, w - 0.4, h * 0.58, Math.min(3.2, w * 0.22), h * 0.42, 2)], {
        folds: [{ x1: 0.8, y1: h * 0.29, x2: w - 0.8, y2: h * 0.29 }],
      });

    case 'jew-rattail-horizontal-80x15': {
      const bodyW = 44;
      const tailH = 3.6;
      return spec([headLeftTailD(w - bodyW, 0, bodyW, h, (h - tailH) / 2, w - bodyW, tailH, 1.6)], {
        folds: [{ x1: w - 22, y1: 0.6, x2: w - 22, y2: h - 0.6 }],
      });
    }

    case 'jew-hangtag-159x413': {
      const tabW = JEWEL_STOCK.hangtag.tabW;
      const tabH = h * 0.58;
      const tabY = (h - tabH) / 2;
      return spec([
        roundedRectD(tabW * 0.4, 0.15, w - tabW * 0.4, h - 0.3, 1.05),
        roundedRectD(0, tabY, tabW + 1.0, tabH, tabH * 0.48),
      ]);
    }

    case 'cable-yellow-4col': {
      const colW = w / CABLE_STOCK.yellowCols;
      return spec([roundedRectD(0, 0, w, h, 0.25)], {
        fill: YELLOW,
        stroke: '#1A1A1A',
        strokeMm: 0.18,
        folds: [1, 2, 3].map((i) => ({
          x1: i * colW,
          y1: 0.15,
          x2: i * colW,
          y2: h - 0.15,
          dashed: false,
        })),
      });
    }

    case 'cable-12.5x74':
      return spec(barbellRightTailPaths(w, h, CABLE_STOCK.barbell.headW, CABLE_STOCK.barbell.tailH), {
        folds: [{ x1: CABLE_STOCK.barbell.foldX, y1: 0.4, x2: CABLE_STOCK.barbell.foldX, y2: h - 0.4 }],
      });

    case 'cable-301-pstyle': {
      const { headW, tailH } = CABLE_STOCK.p301;
      return spec([headRightTailD(0, 0, headW, h, (h - tailH) / 2, w - headW, tailH, 1.15)], {
        folds: [{ x1: 0.7, y1: h / 2, x2: headW - 0.7, y2: h / 2 }],
      });
    }

    case 'cable-428-inspected':
      return spec(
        [
          headRightTailD(
            0,
            0,
            CABLE_STOCK.inspected.headW,
            h,
            h - CABLE_STOCK.inspected.tailH - 1.2,
            w - CABLE_STOCK.inspected.headW,
            CABLE_STOCK.inspected.tailH,
            1.6,
          ),
        ],
        {
          folds: [{ x1: 0.8, y1: h / 2, x2: CABLE_STOCK.inspected.headW - 0.8, y2: h / 2 }],
        },
      );

    case 'cable-tall-dual-flag': {
      const colW = w / 2;
      const bodyH = h * 0.66;
      const tailW = colW * 0.42;
      return spec(
        [
          headBottomTailD(0.2, 0, colW - 0.5, bodyH, tailW, h - bodyH, 2.2),
          headBottomTailD(colW + 0.2, 0, colW - 0.5, bodyH, tailW, h - bodyH, 2.2),
        ],
        {
          folds: [
            { x1: colW / 2, y1: 1.2, x2: colW / 2, y2: bodyH - 1.2 },
            { x1: colW + colW / 2, y1: 1.2, x2: colW + colW / 2, y2: bodyH - 1.2 },
          ],
        },
      );
    }

    case 'cable-d38-inverted': {
      const headW = 38;
      const headH = 25;
      const tailH = 6.2;
      return spec(
        [
          headRightTailD(0, 0, headW, headH, 9.4, w - headW, tailH, 1.4),
          headLeftTailD(w - headW, h - headH, headW, headH, h - headH + 9.4, w - headW, tailH, 1.4),
        ],
        {
          folds: [
            { x1: 0.8, y1: headH / 2, x2: headW - 0.8, y2: headH / 2 },
            { x1: w - headW + 0.8, y1: h - headH / 2, x2: w - 0.8, y2: h - headH / 2 },
          ],
        },
      );
    }

    case 'cable-gp60-hangtag':
      return spec([roundedRectD(0.3, 0.3, w - 0.6, h - 0.6, 1.4)], {
        folds: [{ x1: w / 2, y1: 1.2, x2: w / 2, y2: h - 1.2 }],
        holes: [
          { cx: w * 0.25, cy: 6.2, r: 2.4 },
          { cx: w * 0.75, cy: 6.2, r: 2.4 },
        ],
      });

    case 'cable-hb38-red':
      return spec([headLeftTailD(38, 0, 38, h, (h - 6.2) / 2, 38, 6.2, 1.4)], {
        fill: RED,
        stroke: RED,
        folds: [{ x1: 39, y1: h / 2, x2: w - 1, y2: h / 2 }],
      });

    case 'cable-lf45-double':
      return spec([headRightTailD(0, 0, 45, h, h - 8.2, w - 45, 7, 1.5)], {
        folds: [{ x1: 0.7, y1: h / 2, x2: 44.3, y2: h / 2 }],
      });

    case 'cable-lf64-dash':
      return spec([headRightTailD(0, 0, 64, h, 2.2, w - 64, 7.2, 1.5)], {
        folds: [{ x1: 0.8, y1: h * 0.68, x2: 63.2, y2: h * 0.68 }],
      });

    case 'cable-lt38-tstyle':
      return spec([headBottomTailD(0.2, 0, w - 0.4, 25, 8.5, h - 25, 2)], {
        folds: [{ x1: 0.8, y1: 12.5, x2: w - 0.8, y2: 12.5 }],
      });
    case 'cable-lt45-tstyle':
      return spec([headBottomTailD(0.2, 0, w - 0.4, 30, 10, h - 30, 2.2)], {
        folds: [{ x1: 0.8, y1: 15, x2: w - 0.8, y2: 15 }],
      });

    case 'cable-pstyle-barcode':
      return spec([headRightTailD(0, 0, 30, h, (h - 6.4) / 2, w - 30, 6.4, 1.4)], {
        folds: [{ x1: 0.7, y1: h / 2, x2: 29.3, y2: h / 2 }],
      });
    case 'cable-pstyle-panel23': {
      const topH = h * 0.5;
      return spec(
        [
          headRightTailD(0, 0, 38.1, topH, (topH - 7) / 2, w - 38.1, 7, 1.5),
          roundedRectD(0, topH + 0.35, 38.1, h - topH - 0.35, 1.4),
        ],
        { folds: [{ x1: 0.7, y1: topH, x2: 37.4, y2: topH }] },
      );
    }
    case 'cable-tstyle-barcode':
      return spec([headBottomTailD(0.15, 0, w - 0.3, 19.8, 7.4, h - 19.8, 1.8)], {
        folds: [{ x1: 0.8, y1: 9.9, x2: w - 0.8, y2: 9.9 }],
      });

    default:
      if (previewType.startsWith('jew-') || previewType.startsWith('cable-')) {
        return spec([roundedRectD(0.4, 0.4, w - 0.8, h - 0.8, 1.4)]);
      }
      return null;
  }
}
