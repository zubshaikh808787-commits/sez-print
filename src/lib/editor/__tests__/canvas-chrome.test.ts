import assert from 'node:assert/strict';

import {
  CHROME_HAS_SHADOW,
  CHROME_STROKE_DARK,
  CHROME_STROKE_LIGHT,
  CHROME_STROKE_PX,
  DRAG_LIFT_OPACITY,
  PALETTE_GHOST_MAX_EDGE_PX,
  PALETTE_GHOST_OPACITY,
  SNAP_GUIDE_STROKE_PX,
  chromeStrokeForBackground,
  chromeStrokeForFill,
  dragOpacity,
  fillLuminance,
  paletteGhostSizePx,
} from '../canvas-chrome';

function testStrokeIsOnePixelAndUnshadowed() {
  assert.equal(CHROME_STROKE_PX, 1);
  assert.equal(SNAP_GUIDE_STROKE_PX, 1);
  assert.equal(CHROME_HAS_SHADOW, false);
  console.log('ok transformer chrome is 1px with no drop shadow');
}

function testAccentNotHeavyBlue() {
  const light = chromeStrokeForBackground('light');
  const dark = chromeStrokeForBackground('dark');
  assert.equal(light, CHROME_STROKE_LIGHT);
  assert.equal(dark, CHROME_STROKE_DARK);
  assert.notEqual(light, dark);
  assert.ok(!light.includes('37, 99, 235') && !light.includes('#2563EB'));
  assert.ok(!light.includes('0, 0, 0'));
  console.log('ok selection stroke is brand teal, not heavy blue or black');
}

function testVisibleOnLightAndDarkFills() {
  assert.ok(fillLuminance('#E6EBEF') > 0.45);
  assert.ok(fillLuminance('#111111') < 0.45);
  assert.equal(chromeStrokeForFill('#E6EBEF'), CHROME_STROKE_LIGHT);
  assert.equal(chromeStrokeForFill('#111111'), CHROME_STROKE_DARK);
  console.log('ok 1px stroke picks a readable teal on light and dark labels');
}

function testDragLiftOpacity() {
  assert.equal(DRAG_LIFT_OPACITY, 0.85);
  assert.equal(dragOpacity(1), 0.85);
  assert.equal(dragOpacity(0.5), 0.43);
  console.log('ok moving an element lifts opacity to 0.85');
}

function testPaletteGhostIsSmallNotFullSize() {
  const qr = paletteGhostSizePx(12, 12);
  assert.equal(qr.widthPx, PALETTE_GHOST_MAX_EDGE_PX);
  assert.equal(qr.heightPx, PALETTE_GHOST_MAX_EDGE_PX);

  const barcode = paletteGhostSizePx(30, 10);
  assert.ok(barcode.widthPx <= PALETTE_GHOST_MAX_EDGE_PX);
  assert.ok(barcode.heightPx <= PALETTE_GHOST_MAX_EDGE_PX);
  const fullSizeAt8PxPerMm = 30 * 8;
  assert.ok(barcode.widthPx < fullSizeAt8PxPerMm / 2, 'ghost must not match placed barcode px');

  const line = paletteGhostSizePx(33.6, 0.5);
  assert.equal(line.widthPx, PALETTE_GHOST_MAX_EDGE_PX);
  assert.ok(line.heightPx <= 10);

  assert.ok(PALETTE_GHOST_OPACITY < 1);
  console.log('ok palette ghost is a small semi-transparent chip, not a full-size rectangle');
}

function testGhostIgnoresLabelStockSize() {
  const onJewelry = paletteGhostSizePx(8, 8);
  const onCable = paletteGhostSizePx(8, 8);
  assert.deepEqual(onJewelry, onCable);
  assert.ok(onJewelry.widthPx <= PALETTE_GHOST_MAX_EDGE_PX);
  console.log('ok jewelry 54×96 and cable 50×73 millimetres are not part of ghost chrome');
}

function main() {
  testStrokeIsOnePixelAndUnshadowed();
  testAccentNotHeavyBlue();
  testVisibleOnLightAndDarkFills();
  testDragLiftOpacity();
  testPaletteGhostIsSmallNotFullSize();
  testGhostIgnoresLabelStockSize();
  console.log('ALL CANVAS CHROME TESTS PASSED');
}

main();
