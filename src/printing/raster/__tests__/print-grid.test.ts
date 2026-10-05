import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import {
  gridRects,
  printGridKnockoutsMm,
  printGridLinesMm,
  printGridRectsDots,
  printGridSpacingMm,
} from '@/lib/print-grid';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import { mmToDots } from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(printGrid: boolean, spacing = 5): LabelDocument {
  return {
    id: 'grid',
    name: 'grid',
    widthMm: 40,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [],
    settings: { printGrid, printGridSpacingMm: spacing },
    updatedAt: 0,
  } as unknown as LabelDocument;
}

assert.equal(printGridSpacingMm(doc(false)), null);
assert.equal(printGridSpacingMm(doc(true, 5)), 5);
assert.equal(printGridSpacingMm(doc(true, 0.1)), 0.5, 'spacing is clamped like the design grid');

const lines = printGridLinesMm(40, 30, 5);
assert.deepEqual(lines.xs, [5, 10, 15, 20, 25, 30, 35]);
assert.deepEqual(lines.ys, [5, 10, 15, 20, 25]);

const rects = printGridRectsDots(40, 30, 5, dpi);
assert.equal(rects.length, 12);
assert.ok(rects.every((r) => r.width >= 1 && r.height >= 1));
assert.equal(printGridRectsDots(40, 30, 5, 203)[0].width, 1, '1 dot at 203 DPI');
assert.equal(rects[0].width, 2, '2 dots at 304 DPI');

function render(d: LabelDocument, shiftMm?: { x: number; y: number }) {
  const t = rasterizeDocumentToBitmapTimed(d, dpi, {
    backend: 'dot-buffer',
    bakeTd404Feed: true,
    shiftDots: shiftMm ? { x: mmToDots(shiftMm.x, dpi), y: mmToDots(shiftMm.y, dpi) } : undefined,
  });
  return { gray: t.gray, w: t.result.widthDots, h: t.result.heightDots };
}

const ink = (g: Uint8Array, w: number, x: number, y: number) => g[y * w + x] < 160;

const off = render(doc(false));
assert.ok(!off.gray.some((v) => v < 160), 'no grid when off');

const on = render(doc(true));
const rowMid = mmToDots(2.5, dpi);
const colMid = mmToDots(2.5, dpi);
for (const mm of [5, 10, 20, 35]) {
  assert.ok(ink(on.gray, on.w, mmToDots(mm, dpi), rowMid), `vertical line at ${mm} mm`);
}
for (const mm of [5, 15, 25]) {
  assert.ok(ink(on.gray, on.w, colMid, mmToDots(mm, dpi)), `horizontal line at ${mm} mm`);
}
assert.ok(!ink(on.gray, on.w, mmToDots(7.5, dpi), mmToDots(7.5, dpi)), 'cells stay empty');

const shifted = render(doc(true), { x: 1, y: 0 });
assert.ok(ink(shifted.gray, shifted.w, mmToDots(6, dpi), rowMid), 'grid moves with the offset');
assert.ok(!ink(shifted.gray, shifted.w, mmToDots(5, dpi) - 1, rowMid));

// The grid stays out of element boxes (like the editor's design grid) but not out of borders.
const withElements = doc(true);
withElements.elements = [
  {
    id: 'block',
    type: 'shape',
    shapeType: 'rectangle',
    left: 8,
    top: 8,
    width: 14,
    height: 9,
    lineWidth: 0.3,
    fill: false,
    needPrinting: true,
    drawingColorIndex: 0,
  },
  {
    id: 'hidden',
    type: 'shape',
    shapeType: 'rectangle',
    left: 28,
    top: 3,
    width: 8,
    height: 8,
    lineWidth: 0.3,
    fill: false,
    needPrinting: false,
    drawingColorIndex: 0,
  },
  { ...fullBleedBorderElement(40, 30), geometryVersion: 1 },
] as unknown as LabelDocument['elements'];

const knockouts = printGridKnockoutsMm(withElements);
assert.equal(knockouts.length, 1, 'only printed, non-border elements knock the grid out');

const cut = render(withElements);
const insideY = mmToDots(12.5, dpi);
assert.ok(!ink(cut.gray, cut.w, mmToDots(10, dpi), insideY), 'no vertical line inside the element');
assert.ok(!ink(cut.gray, cut.w, mmToDots(15, dpi), insideY), 'no vertical line inside the element');
assert.ok(!ink(cut.gray, cut.w, mmToDots(12, dpi), mmToDots(10, dpi)), 'no horizontal line inside the element');
assert.ok(ink(cut.gray, cut.w, mmToDots(10, dpi), mmToDots(20, dpi)), 'line continues below the element');
assert.ok(ink(cut.gray, cut.w, mmToDots(25, dpi), insideY), 'lines beside the element stay');
assert.ok(ink(cut.gray, cut.w, mmToDots(30, dpi), mmToDots(5, dpi) + 6), 'non-printing element does not cut the grid');

const segs = gridRects(20, 10, 5, 1, 1, [{ left: 4, top: 2, width: 3, height: 4 }]);
assert.deepEqual(
  segs.filter((r) => r.left === 5),
  [
    { left: 5, top: 0, width: 1, height: 2 },
    { left: 5, top: 6, width: 1, height: 4 },
  ],
);

console.log('ok print-grid');
