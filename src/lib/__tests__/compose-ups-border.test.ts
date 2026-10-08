import assert from 'node:assert/strict';

import { defaultBorderPlacement } from '@/lib/border-geometry';
import {
  composeUpsDocument,
  createLabelDocument,
  createUpsConfig,
  type LabelElement,
} from '@/lib/label-document';
import { canHeadlessRasterPrint } from '@/printing/raster/skia-rasterizer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const DPI = 304;

function borderEl(w = 50, h = 15, borderStyle: 'solid-medium' | 'circle-medium' = 'solid-medium'): LabelElement {
  const placement = defaultBorderPlacement(w, h);
  return {
    id: 'b1',
    type: 'border',
    borderStyle,
    lineWidth: 0.55,
    needPrinting: true,
    drawingColorIndex: 0,
    ...placement,
  };
}

const single = createLabelDocument({
  name: '2ups panel',
  widthMm: 50,
  heightMm: 15,
  elements: [borderEl()],
});

single.ups = createUpsConfig({ columns: 2, columnSpacingMm: 0, seedElements: single.elements, batchEdit: false });

const composed = composeUpsDocument(single);
assert.equal(composed.printComposedUps, true);
assert.equal(composed.upsPrintCell?.widthMm, 50);
assert.equal(composed.upsPrintCell?.mediaShape, undefined);

const borders = composed.elements
  .filter((el) => el.type === 'border')
  .sort((a, b) => a.left - b.left);
assert.equal(borders.length, 2, 'one border per ups column');
assert.ok(Math.abs(borders[0]!.left - 2) < 0.05, 'left panel border keeps 2 mm inset');
assert.ok(Math.abs(borders[1]!.left - 52) < 0.05, 'right panel border offset by one cell');

assert.equal(canHeadlessRasterPrint(composed), true);
const timed = rasterizeDocumentToBitmapTimed(composed, DPI, { threshold: 160 });
assert.ok(timed.result.mono1bppBuffer.length > 0);

const circlePanel = createLabelDocument({
  name: 'round 2-up panel',
  widthMm: 30,
  heightMm: 30,
  mediaShape: 'circle',
  elements: [borderEl(30, 30, 'circle-medium')],
});
circlePanel.ups = createUpsConfig({
  columns: 2,
  columnSpacingMm: 2,
  seedElements: circlePanel.elements,
  batchEdit: false,
});

const circleComposed = composeUpsDocument(circlePanel);
assert.equal(circleComposed.upsPrintCell?.mediaShape, 'circle');
assert.equal(circleComposed.upsPrintCell?.columnSpacingMm, 2);
const circleBorders = circleComposed.elements
  .filter((el) => el.type === 'border')
  .sort((a, b) => a.left - b.left);
assert.equal(circleBorders.length, 2);
assert.ok(Math.abs(circleBorders[0]!.left - 2) < 0.05);
assert.ok(Math.abs(circleBorders[0]!.width - 26) < 0.05);
assert.ok(Math.abs(circleBorders[1]!.left - 34) < 0.05, 'second ring centered in right cell (30+2+2 inset)');
assert.ok(Math.abs(circleBorders[1]!.width - 26) < 0.05);

console.log('ok compose-ups-border');
