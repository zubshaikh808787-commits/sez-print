/**
 * Centered border engine: canvas W×H on label/cell W×H.
 * Run: npx --yes tsx --tsconfig tsconfig.json src/printing/raster/__tests__/border-center.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import { defaultBorderPlacement } from '@/lib/border-geometry';
import {
  createLabelDocument,
  generateId,
  mmToPt,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { applySignedReferenceToMono } from '@/lib/printer/mono-shift';
import {
  createPrintSpec,
  mmToDots,
  PRINTER_PROFILES,
  rectMmToDots,
  tsplPackedWidthDots,
} from '@/lib/printer/print-spec';
import { USE_CENTERED_BORDER_ENGINE } from '@/printing/raster/border-baseline';
import {
  centeredBorderPrintRectMm,
  centeredBorderRectMm,
  labelCenterMm,
  rectCenterMm,
} from '@/printing/raster/border-center';
import { collectBorderPrintDiagnostics } from '@/printing/raster/border-diagnostics';
import { expectedBorderDots, measureBorderInDots } from '@/printing/raster/border-measure';
import { fillRect, makeDotSurface } from '@/printing/raster/dot-surface';
import {
  drawPrintBorder,
  drawPrintBorderBaseline,
  stampPrintBordersOnGray,
} from '@/printing/raster/print-border';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

assert.equal(USE_CENTERED_BORDER_ENGINE, true, 'production uses the centered engine');

const SIZES: Array<[number, number]> = [
  [20, 20],
  [30, 10],
  [40, 20],
  [50, 30],
  [50, 50],
  [60, 14],
  [60, 40],
  [100, 50],
  [100, 150],
];

type BorderEl = Extract<LabelElement, { type: 'border' }>;

function sha(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

function borderEl(
  w: number,
  h: number,
  extra: Partial<BorderEl> = {},
): BorderEl {
  return {
    id: extra.id ?? generateId(),
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    needPrinting: true,
    drawingColorIndex: 0,
    ...defaultBorderPlacement(w, h),
    ...extra,
  };
}

function doc(
  w: number,
  h: number,
  elements: LabelElement[],
  extra: Partial<LabelDocument> = {},
): LabelDocument {
  return {
    ...createLabelDocument({
      name: `${w}x${h}`,
      widthMm: w,
      heightMm: h,
      paperType: 'Label',
      elements,
    }),
    ...extra,
  };
}

function raster(d: LabelDocument, dpi = 304) {
  return rasterizeDocumentToBitmapTimed(d, dpi, { threshold: 160, backend: 'dot-buffer' });
}

function textEl(): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: generateId(),
    type: 'text',
    text: 'AB',
    fontSize: mmToPt(4),
    left: 8,
    top: 8,
    width: 20,
    height: 8,
    needPrinting: true,
  } as LabelElement;
}

function qrEl(): LabelElement {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: generateId(),
    type: 'qrcode',
    content: 'center',
    left: 28,
    top: 8,
    width: 10,
    height: 10,
    needPrinting: true,
  } as LabelElement;
}

function barcodeEl(): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content: '123456',
    left: 8,
    top: 18,
    width: 28,
    height: 8,
    needPrinting: true,
  } as LabelElement;
}

function paintEngine(
  drawer: typeof drawPrintBorder,
  el: BorderEl,
  wMm: number,
  hMm: number,
  dpi: number,
  extraOpts: { mediaShape?: string; upsPrintCell?: LabelDocument['upsPrintCell'] } = {},
) {
  const sizeW = mmToDots(wMm, dpi);
  const sizeH = mmToDots(hMm, dpi);
  const packedW = Math.ceil(sizeW / 8) * 8;
  const surface = makeDotSurface(packedW, sizeH);
  drawer(
    {
      fillRect: (x, y, bw, bh, g) => fillRect(surface, x, y, bw, bh, g),
    },
    el,
    dpi,
    1,
    {
      bitmapWidthDots: packedW,
      bitmapHeightDots: sizeH,
      labelWidthDots: sizeW,
      labelHeightDots: sizeH,
      labelWidthMm: wMm,
      labelHeightMm: hMm,
      mediaShape: extraOpts.mediaShape,
      upsPrintCell: extraOpts.upsPrintCell,
      upsPanelIndex: el.upsPanelIndex,
    },
  );
  return { surface, sizeW, sizeH, packedW };
}

// --- formula: any size, border sits on the label center (±1 dot after mm→dots) ---
for (const [w, h] of SIZES) {
  for (const [bw, bh] of [
    [Math.max(1, w - 4), Math.max(1, h - 4)],
    [Math.max(1, w * 0.6), Math.max(1, h * 0.5)],
  ] as const) {
    const mm = centeredBorderRectMm({
      frameWidthMm: w,
      frameHeightMm: h,
      borderWidthMm: bw,
      borderHeightMm: bh,
    });
    const lc = labelCenterMm(w, h);
    const bc = rectCenterMm(mm);
    assert.ok(Math.abs(bc.x - lc.x) < 1e-9, `${w}x${h} center X`);
    assert.ok(Math.abs(bc.y - lc.y) < 1e-9, `${w}x${h} center Y`);
    assert.equal(mm.width, bw);
    assert.equal(mm.height, bh);
    for (const dpi of [203, 304]) {
      const dots = rectMmToDots(mm.left, mm.top, mm.width, mm.height, dpi);
      const sizeW = mmToDots(w, dpi);
      const sizeH = mmToDots(h, dpi);
      const cx = (dots.x0 + dots.x1) / 2;
      const cy = (dots.y0 + dots.y1) / 2;
      assert.ok(Math.abs(cx - sizeW / 2) <= 1, `${w}x${h} @${dpi} dot center X`);
      assert.ok(Math.abs(cy - sizeH / 2) <= 1, `${w}x${h} @${dpi} dot center Y`);
    }
  }
}

// --- stored left/top is ignored ---
{
  const w = 50;
  const h = 30;
  const el = borderEl(w, h, { left: 9, top: 1, width: 40, height: 20 });
  const print = centeredBorderPrintRectMm(el, { widthMm: w, heightMm: h });
  assert.equal(print.left, 5);
  assert.equal(print.top, 5);
  assert.equal(print.width, 40);
  assert.equal(print.height, 20);
  const timed = raster(doc(w, h, [el]));
  const expected = expectedBorderDots(el, 304, w, h);
  const measured = measureBorderInDots(
    timed.gray,
    timed.result.widthDots,
    mmToDots(w, 304),
    mmToDots(h, 304),
  );
  assert.ok(measured.box);
  assert.ok(Math.abs((measured.box?.x0 ?? 99) - expected.x0) <= 1);
  assert.ok(Math.abs((measured.box?.x0 ?? 0) - mmToDots(5, 304)) <= 1, 'off-center origin recenters');
}

// --- default placement matches baseline within 1 dot (normal labels do not regress) ---
for (const [w, h] of [
  [50, 30],
  [60, 14],
  [20, 20],
] as const) {
  const el = borderEl(w, h);
  const a = paintEngine(drawPrintBorderBaseline, el, w, h, 304);
  const b = paintEngine(drawPrintBorder, el, w, h, 304);
  const ma = measureBorderInDots(a.surface.gray, a.packedW, a.sizeW, a.sizeH);
  const mb = measureBorderInDots(b.surface.gray, b.packedW, b.sizeW, b.sizeH);
  assert.ok(ma.box && mb.box, `${w}x${h} both engines ink`);
  assert.ok(Math.abs(ma.box!.x0 - mb.box!.x0) <= 1, `${w}x${h} left parity`);
  assert.ok(Math.abs(ma.box!.y0 - mb.box!.y0) <= 1, `${w}x${h} top parity`);
  assert.ok(Math.abs(ma.box!.x1 - mb.box!.x1) <= 1, `${w}x${h} right parity`);
  assert.ok(Math.abs(ma.box!.y1 - mb.box!.y1) <= 1, `${w}x${h} bottom parity`);
}

// --- shapes and strokes rasterize centered ---
for (const style of ['solid-medium', 'rounded', 'dashed'] as const) {
  for (const lineWidth of [0.35, 0.9]) {
    const el = borderEl(50, 30, { borderStyle: style, lineWidth });
    const timed = raster(doc(50, 30, [el]));
    const m = measureBorderInDots(timed.gray, timed.result.widthDots, mmToDots(50, 304), mmToDots(30, 304));
    assert.ok(m.box, `${style} ${lineWidth} has ink`);
    const cx = ((m.box!.x0 + m.box!.x1) / 2);
    const cy = ((m.box!.y0 + m.box!.y1) / 2);
    assert.ok(Math.abs(cx - mmToDots(50, 304) / 2) <= 1, `${style} center X`);
    assert.ok(Math.abs(cy - mmToDots(30, 304) / 2) <= 1, `${style} center Y`);
  }
}

{
  const el = borderEl(50, 50, { borderStyle: 'circle-medium' });
  const timed = raster(doc(50, 50, [el], { mediaShape: 'circle' }));
  const m = measureBorderInDots(timed.gray, timed.result.widthDots, mmToDots(50, 304), mmToDots(50, 304));
  assert.ok(m.box, 'circle has ink');
  const cx = (m.box!.x0 + m.box!.x1) / 2;
  const cy = (m.box!.y0 + m.box!.y1) / 2;
  assert.ok(Math.abs(cx - mmToDots(50, 304) / 2) <= 1);
  assert.ok(Math.abs(cy - mmToDots(50, 304) / 2) <= 1);
}

{
  const placed = defaultBorderPlacement(50, 30, { mediaShape: 'circle' });
  assert.equal(placed.width, placed.height, 'round-die border is square');
  assert.equal(placed.width, 26);
  assert.equal(placed.left, 12);
  assert.equal(placed.top, 2);
  const leftoverX = 50 - placed.width;
  const leftoverY = 30 - placed.height;
  assert.ok(Math.abs(placed.left - leftoverX / 2) < 1e-9);
  assert.ok(Math.abs(placed.top - leftoverY / 2) < 1e-9);

  const el = borderEl(50, 30, { left: 2, top: 2, width: 46, height: 26, borderStyle: 'solid-medium' });
  const print = centeredBorderPrintRectMm(el, { widthMm: 50, heightMm: 30, mediaShape: 'circle' });
  assert.equal(print.width, 26);
  assert.equal(print.height, 26);
  assert.equal(print.left, 12);
  assert.equal(print.top, 2);
  const timed = raster(doc(50, 30, [el], { mediaShape: 'circle' }));
  const m = measureBorderInDots(timed.gray, timed.result.widthDots, mmToDots(50, 304), mmToDots(30, 304));
  assert.ok(m.box, 'round 50x30 has ink');
  const cx = (m.box!.x0 + m.box!.x1) / 2;
  const cy = (m.box!.y0 + m.box!.y1) / 2;
  assert.ok(Math.abs(cx - mmToDots(50, 304) / 2) <= 1, 'round die centered X');
  assert.ok(Math.abs(cy - mmToDots(30, 304) / 2) <= 1, 'round die centered Y');
}

{
  const placed = defaultBorderPlacement(50, 30, { borderStyle: 'circle-thin' });
  assert.equal(placed.width, 26);
  assert.equal(placed.left, 12);
  const print = centeredBorderPrintRectMm(
    borderEl(50, 30, { borderStyle: 'circle-thin', width: 46, height: 26 }),
    { widthMm: 50, heightMm: 30 },
  );
  assert.equal(print.width, print.height);
  assert.equal(print.left, (50 - print.width) / 2);
  assert.equal(print.top, (30 - print.height) / 2);
}

// --- GAP does not change bits ---
{
  const d = doc(50, 30, [borderEl(50, 30), textEl()]);
  const a = raster(d);
  const canonical = sha(a.result.mono1bppBuffer);
  for (const gapMm of [1, 2, 3]) {
    const spec = createPrintSpec({
      widthMm: 50,
      heightMm: 30,
      dpi: 304,
      profile: PRINTER_PROFILES['td404-304'],
      gapMm,
      calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
    });
    assert.equal(spec.gapMm, gapMm);
    assert.equal(sha(raster(d).result.mono1bppBuffer), canonical, `GAP ${gapMm} identical bitmap`);
  }
}

// --- H/V: canonical gray unchanged; negative H shifts the whole wire bitmap ---
{
  const d = doc(50, 30, [borderEl(50, 30), textEl()]);
  const a = raster(d);
  const canonical = sha(a.result.mono1bppBuffer);
  for (const [h, v] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const spec = createPrintSpec({
      widthMm: 50,
      heightMm: 30,
      dpi: 304,
      profile: PRINTER_PROFILES['td404-304'],
      gapMm: 3,
      calibration: { horizontalOffsetMm: h, verticalOffsetMm: v },
    });
    assert.equal(sha(raster(d).result.mono1bppBuffer), canonical, `H=${h} V=${v} canonical`);
    const wire = applySignedReferenceToMono(
      a.result.mono1bppBuffer,
      a.result.bytesPerRow,
      a.result.heightDots,
      spec.xOffsetDots,
      spec.yOffsetDots,
    );
    if (spec.xOffsetDots >= 0 && spec.yOffsetDots >= 0) {
      assert.equal(sha(wire.monoBytes), canonical, `H=${h} V=${v} wire unchanged`);
    } else {
      assert.notEqual(sha(wire.monoBytes), canonical, `H=${h} V=${v} whole-bitmap shift`);
    }
  }
}

// --- N-up: each cell's border is centered in that cell, not the strip ---
{
  const cellW = 50;
  const cellH = 30;
  const left = borderEl(cellW, cellH, { left: 80, top: 1, width: 46, height: 26, upsPanelIndex: 0 });
  const right = borderEl(cellW, cellH, { left: 0, top: 9, width: 46, height: 26, upsPanelIndex: 1 });
  const composed = doc(100, 30, [left, right], {
    upsPrintCell: { widthMm: cellW, heightMm: cellH, columns: 2, columnSpacingMm: 0 },
  });
  const lp = centeredBorderPrintRectMm(left, composed);
  const rp = centeredBorderPrintRectMm(right, composed);
  assert.equal(lp.left, 2);
  assert.equal(rp.left, 52);
  const timed = raster(composed);
  for (const el of [left, right]) {
    const expected = expectedBorderDots(el, 304, 100, 30, { upsPrintCell: composed.upsPrintCell });
    const pad = mmToDots(2, 304);
    const m = measureBorderInDots(
      timed.gray,
      timed.result.widthDots,
      mmToDots(100, 304),
      mmToDots(30, 304),
      160,
      { x0: expected.x0 - pad, y0: expected.y0 - pad, x1: expected.x1 + pad, y1: expected.y1 + pad },
    );
    assert.ok(m.box, `n-up ${el.upsPanelIndex} ink`);
    const cellLeft = el.upsPanelIndex === 0 ? 0 : mmToDots(50, 304);
    const cellWDots = mmToDots(50, 304);
    const cx = (m.box!.x0 + m.box!.x1) / 2;
    assert.ok(Math.abs(cx - (cellLeft + cellWDots / 2)) <= 1, `cell ${el.upsPanelIndex} centered`);
  }
}

// --- non-border pixels: content-only bits remain in the combined bitmap ---
{
  const content = [textEl(), qrEl(), barcodeEl()];
  const withBorder = raster(doc(50, 30, [borderEl(50, 30), ...content]));
  const contentOnly = raster(doc(50, 30, content));
  let missing = 0;
  for (let i = 0; i < contentOnly.result.mono1bppBuffer.length; i++) {
    const c = contentOnly.result.mono1bppBuffer[i]!;
    if ((withBorder.result.mono1bppBuffer[i]! & c) !== c) missing += 1;
  }
  assert.equal(missing, 0, 'text/QR/barcode bits survive the border pass');
}

// --- stamp must not rewrite non-border gray ---
{
  const w = 50;
  const h = 30;
  const d = doc(w, h, [borderEl(w, h)]);
  const sizeW = mmToDots(w, 304);
  const sizeH = mmToDots(h, 304);
  const packedW = Math.ceil(sizeW / 8) * 8;
  const gray = new Uint8Array(packedW * sizeH).fill(180);
  stampPrintBordersOnGray(gray, packedW, sizeH, d, 304, {
    labelWidthDots: sizeW,
    labelHeightDots: sizeH,
  });
  let mutated = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    if (v !== 180 && v !== 0) mutated += 1;
  }
  assert.equal(mutated, 0, 'stamp only writes ink (0) or leaves content gray');
  const inner = mmToDots(8, 304);
  assert.equal(gray[inner * packedW + inner], 180, 'interior of the frame stays content gray');
}

// --- diagnostics: engine name + match on a default locked border ---
{
  const d = doc(50, 30, [borderEl(50, 30)]);
  const timed = raster(d);
  const diag = collectBorderPrintDiagnostics(
    d,
    304,
    timed.result,
    {
      gapMm: 3,
      hOffsetMm: 0,
      vOffsetMm: 0,
      referenceDots: { x: 0, y: 0 },
      printerName: 'test',
    },
    timed.gray,
  );
  assert.equal(diag.engine, 'centered');
  assert.equal(diag.labelCenterMm.x, 25);
  assert.equal(diag.labelCenterMm.y, 15);
  assert.equal(diag.layer, 'match');
  assert.equal(diag.borders[0]?.printRectMm.left, 2);
  assert.equal(diag.borders[0]?.borderCenterMm.x, 25);
}

console.log('ok border-center');
