import assert from 'node:assert/strict';

import { QA_TARGET_FPS } from '../canvas-qa';
import { RESIZE_MIN_PROPORTIONAL_MM } from '../resize-policy';
import {
  compareRendererFps,
  mmBoxToSkiaRect,
  PRODUCTION_RENDERER,
  skiaImageDragMm,
  skiaImageResizeMm,
  SKIA_PROTOTYPE_SCOPE,
  skiaRectToMmBox,
} from '../skia-prototype';

function testPrototypeIsArtboardPlusImageOnly() {
  assert.equal(SKIA_PROTOTYPE_SCOPE, 'artboard+image');
  assert.equal(PRODUCTION_RENDERER, 'rn-view');
  console.log('ok Skia prototype is artboard+image; production stays RN views');
}

function testMmRoundTripThroughSkiaRect() {
  const box = { left: 4, top: 6, width: 20, height: 10 };
  const rect = mmBoxToSkiaRect(box, 4);
  assert.equal(rect.x, 16);
  assert.equal(rect.y, 24);
  assert.equal(rect.width, 80);
  assert.equal(rect.height, 40);
  const back = skiaRectToMmBox(rect, 4);
  assert.equal(back.left, 4);
  assert.equal(back.top, 6);
  assert.equal(back.width, 20);
  assert.equal(back.height, 10);
  console.log('ok Skia rect is derived from millimetres, not stored as pixels');
}

function testImageResizeUsesPhase5Policy() {
  const next = skiaImageResizeMm({
    anchor: 'e',
    start: { left: 4, top: 6, width: 20, height: 10 },
    proposed: { width: 24, height: 10 },
    aspect: 2,
    canvas: { widthMm: 50, heightMm: 30 },
    minMm: RESIZE_MIN_PROPORTIONAL_MM,
  });
  assert.equal(next.width, 24);
  assert.equal(next.height, 12);
  assert.equal(next.left, 4);
  console.log('ok Skia image right-handle uses boundBoxMm aspect lock');
}

function testJewelryAndCableStayMillimetres() {
  const jewelry = skiaImageDragMm({
    leftMm: 2,
    topMm: 4,
    widthMm: 20,
    heightMm: 10,
    canvas: { widthMm: 54, heightMm: 96 },
  });
  assert.equal(jewelry.width, 20);
  assert.ok(jewelry.left + jewelry.width <= 54 + 1e-9);
  const cableCanvas = { widthMm: 50, heightMm: 73 };
  const resized = skiaImageResizeMm({
    anchor: 's',
    start: { left: 4, top: 4, width: 12, height: 6 },
    proposed: { width: 12, height: 90 },
    aspect: 2,
    canvas: cableCanvas,
    minMm: RESIZE_MIN_PROPORTIONAL_MM,
  });
  assert.ok(resized.height <= 73);
  assert.ok(Math.abs(resized.width / resized.height - 2) < 1e-6);
  console.log('ok jewelry 54×96 and cable 50×73 millimetres survive the Skia prototype');
}

function testMigrationNeedsPairedFps() {
  const pending = compareRendererFps({ rnViewFps: null, skiaFps: null });
  assert.equal(pending.migrate, false);
  assert.equal(pending.productionRenderer, 'rn-view');

  const alreadyFast = compareRendererFps({ rnViewFps: 60, skiaFps: 90, targetFps: QA_TARGET_FPS });
  assert.equal(alreadyFast.migrate, false);

  const ceiling = compareRendererFps({ rnViewFps: 42, skiaFps: 60 });
  assert.equal(ceiling.migrate, true);
  assert.equal(ceiling.productionRenderer, 'skia');
  console.log('ok Skia rewrite is gated on measured FPS, not a hunch');
}

function main() {
  testPrototypeIsArtboardPlusImageOnly();
  testMmRoundTripThroughSkiaRect();
  testImageResizeUsesPhase5Policy();
  testJewelryAndCableStayMillimetres();
  testMigrationNeedsPairedFps();
  console.log('ALL SKIA PROTOTYPE TESTS PASSED');
}

main();
