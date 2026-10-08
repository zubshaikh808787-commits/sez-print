import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { dotsPerMm, mmToDots, rectMmToDots, tsplPackedWidthDots } from '@/lib/printer/print-spec';
import {
  borderFrameInsetsForElement,
  borderStrokeDots,
  borderStrokeFallbackMm,
} from '@/printing/raster/border-frame';
import type { BorderStyleId } from '@/constants/border-library';

type BorderElement = Extract<LabelElement, { type: 'border' }>;

/** Outer ink box, exclusive right/bottom edge, in printer dots from the SIZE origin. */
export type DotBox = { x0: number; y0: number; x1: number; y1: number };

export type BorderInkMeasure = {
  box: DotBox | null;
  /** Distance from each SIZE edge to the outer ink, in dots. */
  marginsDots: { left: number; right: number; top: number; bottom: number } | null;
  /** Ink run length at the middle of each side, in dots. */
  strokeDots: { left: number; right: number; top: number; bottom: number } | null;
  /** Any ink touching the SIZE edge (stroke clipped by the bitmap). */
  touchesEdge: boolean;
};

export function borderElementsOf(doc: Pick<LabelDocument, 'elements'>): BorderElement[] {
  return doc.elements.filter(
    (el): el is BorderElement =>
      el.type === 'border' && el.needPrinting !== false && el.visible !== false,
  );
}

/**
 * Canvas geometry of one border in printer dots: the element rectangle through
 * rectMmToDots, then the same draw-time inset the canvas applies to untagged
 * borders, clipped to SIZE. No printer constants.
 */
export function expectedBorderDots(
  el: BorderElement,
  dpi: number,
  labelWidthMm: number,
  labelHeightMm: number,
): DotBox {
  const rect = rectMmToDots(el.left, el.top, el.width, el.height, dpi);
  const inset = borderFrameInsetsForElement(el, dpi);
  const sizeW = mmToDots(labelWidthMm, dpi);
  const sizeH = mmToDots(labelHeightMm, dpi);
  return {
    x0: Math.max(0, rect.x0 + inset.left),
    y0: Math.max(0, rect.y0 + inset.top),
    x1: Math.min(sizeW, rect.x1 - inset.right),
    y1: Math.min(sizeH, rect.y1 - inset.bottom),
  };
}

export function expectedStrokeDots(el: BorderElement, dpi: number): number {
  const style = (el.borderStyle ?? 'solid-medium') as BorderStyleId;
  return borderStrokeDots(el.lineWidth, dpi, borderStrokeFallbackMm(style));
}

/**
 * Scan a gray buffer (0 = ink) of row stride `strideDots`. Only the first
 * `sizeW` × `sizeH` dots are SIZE; pack-up columns are ignored for the box but
 * reported through `touchesEdge` if they carry ink.
 */
export function measureBorderInDots(
  gray: Uint8Array,
  strideDots: number,
  sizeW: number,
  sizeH: number,
  threshold = 160,
): BorderInkMeasure {
  const ink = (x: number, y: number) => gray[y * strideDots + x] < threshold;
  let minX = sizeW;
  let maxX = -1;
  let minY = sizeH;
  let maxY = -1;
  let touchesEdge = false;
  for (let y = 0; y < sizeH; y++) {
    for (let x = 0; x < strideDots; x++) {
      if (!ink(x, y)) continue;
      if (x >= sizeW) {
        touchesEdge = true;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    return { box: null, marginsDots: null, strokeDots: null, touchesEdge };
  }
  if (minX === 0 || minY === 0 || maxX === sizeW - 1 || maxY === sizeH - 1) touchesEdge = true;
  const midY = Math.round((minY + maxY) / 2);
  const midX = Math.round((minX + maxX) / 2);
  const run = (x: number, y: number, dx: number, dy: number) => {
    let n = 0;
    while (x >= 0 && y >= 0 && x < sizeW && y < sizeH && ink(x, y)) {
      n += 1;
      x += dx;
      y += dy;
    }
    return n;
  };
  return {
    box: { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 },
    marginsDots: { left: minX, right: sizeW - 1 - maxX, top: minY, bottom: sizeH - 1 - maxY },
    strokeDots: {
      left: run(minX, midY, 1, 0),
      right: run(maxX, midY, -1, 0),
      top: run(midX, minY, 0, 1),
      bottom: run(midX, maxY, 0, -1),
    },
    touchesEdge,
  };
}

export type BorderPrintDiagnostics = {
  widthMm: number;
  heightMm: number;
  dpi: number;
  dotsPerMm: number;
  sizeDotsW: number;
  sizeDotsH: number;
  bitmapWidthDots: number;
  bitmapBytesPerRow: number;
  bitmapHeightDots: number;
  gapMm: number;
  hOffsetMm: number;
  vOffsetMm: number;
  referenceDots: { x: number; y: number };
  printerName: string;
  /** Always false: the border is drawn from its document rectangle only. */
  td404BorderCorrection: false;
  borders: Array<{
    id: string;
    expected: DotBox;
    measured: DotBox | null;
    deltaDots: { x0: number; y0: number; x1: number; y1: number } | null;
    marginsMm: { left: number; right: number; top: number; bottom: number } | null;
    expectedStrokeDots: number;
    measuredStrokeDots: BorderInkMeasure['strokeDots'];
    clipped: boolean;
    withinOneDot: boolean;
  }>;
};

/**
 * Measure each printable border in a border-only gray raster produced by
 * `rasterizeBorders` (so text/QR ink never enters the box).
 */
export function diagnoseBorders(
  doc: Pick<LabelDocument, 'elements' | 'widthMm' | 'heightMm'>,
  dpi: number,
  rasterizeBorders: (border: BorderElement) => { gray: Uint8Array; strideDots: number },
): BorderPrintDiagnostics['borders'] {
  const sizeW = mmToDots(doc.widthMm, dpi);
  const sizeH = mmToDots(doc.heightMm, dpi);
  const dpm = dotsPerMm(dpi);
  return borderElementsOf(doc).map((el) => {
    const expected = expectedBorderDots(el, dpi, doc.widthMm, doc.heightMm);
    const { gray, strideDots } = rasterizeBorders(el);
    const m = measureBorderInDots(gray, strideDots, sizeW, sizeH);
    const deltaDots = m.box
      ? {
          x0: m.box.x0 - expected.x0,
          y0: m.box.y0 - expected.y0,
          x1: m.box.x1 - expected.x1,
          y1: m.box.y1 - expected.y1,
        }
      : null;
    const withinOneDot = deltaDots
      ? Math.max(
          Math.abs(deltaDots.x0),
          Math.abs(deltaDots.y0),
          Math.abs(deltaDots.x1),
          Math.abs(deltaDots.y1),
        ) <= 1
      : false;
    return {
      id: el.id,
      expected,
      measured: m.box,
      deltaDots,
      marginsMm: m.marginsDots
        ? {
            left: m.marginsDots.left / dpm,
            right: m.marginsDots.right / dpm,
            top: m.marginsDots.top / dpm,
            bottom: m.marginsDots.bottom / dpm,
          }
        : null,
      expectedStrokeDots: expectedStrokeDots(el, dpi),
      measuredStrokeDots: m.strokeDots,
      clipped: m.touchesEdge,
      withinOneDot,
    };
  });
}

export function packedWidthForMm(widthMm: number, dpi: number): number {
  return tsplPackedWidthDots(mmToDots(widthMm, dpi));
}

export function formatBorderPrintDiagnostics(d: BorderPrintDiagnostics): string {
  const lines = [
    `[BORDER-DIAG] label=${d.widthMm}x${d.heightMm}mm dpi=${d.dpi} dpm=${d.dotsPerMm} ` +
      `SIZE=${d.sizeDotsW}x${d.sizeDotsH} BITMAP=${d.bitmapBytesPerRow}B(${d.bitmapWidthDots})x${d.bitmapHeightDots} ` +
      `GAP=${d.gapMm}mm H=${d.hOffsetMm}mm V=${d.vOffsetMm}mm REFERENCE=${d.referenceDots.x},${d.referenceDots.y} ` +
      `printer=${d.printerName} td404BorderOuterDots=NOT USED bakeTd404Feed=false`,
  ];
  for (const b of d.borders) {
    const e = b.expected;
    const m = b.measured;
    lines.push(
      `[BORDER-DIAG] ${b.id} expected=${e.x0},${e.y0}-${e.x1},${e.y1} ` +
        `measured=${m ? `${m.x0},${m.y0}-${m.x1},${m.y1}` : 'none'} ` +
        `delta=${b.deltaDots ? `${b.deltaDots.x0},${b.deltaDots.y0},${b.deltaDots.x1},${b.deltaDots.y1}` : 'n/a'} ` +
        `marginsMm=${b.marginsMm ? `L${b.marginsMm.left.toFixed(2)} R${b.marginsMm.right.toFixed(2)} T${b.marginsMm.top.toFixed(2)} B${b.marginsMm.bottom.toFixed(2)}` : 'n/a'} ` +
        `stroke=${b.expectedStrokeDots} measured=${b.measuredStrokeDots ? `${b.measuredStrokeDots.left}/${b.measuredStrokeDots.right}/${b.measuredStrokeDots.top}/${b.measuredStrokeDots.bottom}` : 'n/a'} ` +
        `clipped=${b.clipped} match=${b.withinOneDot ? 'yes' : 'NO'}`,
    );
  }
  return lines.join('\n');
}
