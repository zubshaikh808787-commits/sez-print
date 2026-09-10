import assert from 'node:assert/strict';

import {
  fitEditorLabel,
  fitEditorPadBoard,
  fitLabelSize,
  formatViewZoomLabel,
} from '../label-geometry';
import { RAT_TAIL_143, scaleMediaGeometry } from '../media-geometry';

function aspect(width: number, height: number) {
  return width / Math.max(height, 0.01);
}

function testContainFitNeverOverflows() {
  const cases: Array<[number, number, string]> = [
    [101.6, 14.3, 'wide rat-tail'],
    [50, 50, 'square'],
    [30, 35, 'tall t-style'],
    [20, 15, 'small'],
    [101.6, 152.4, '4x6 in'],
    [25.4, 25.4, '1x1 in'],
  ];
  for (const [wMm, hMm, name] of cases) {
    const box = fitEditorLabel(wMm, hMm, 320, 220);
    assert.ok(box.widthPx <= 320, `${name} width overflow ${box.widthPx}`);
    assert.ok(box.heightPx <= 220, `${name} height overflow ${box.heightPx}`);
    assert.ok(box.scale > 0, `${name} scale`);
    assert.ok(
      Math.abs(aspect(box.widthPx, box.heightPx) - aspect(wMm, hMm)) < 0.04,
      `${name} aspect ${box.widthPx}x${box.heightPx} vs ${wMm}x${hMm}`,
    );
    assert.ok(Math.abs(box.widthPx / wMm - box.scale) < 0.02, `${name} uniform width scale`);
    assert.ok(Math.abs(box.heightPx / hMm - box.scale) < 0.05, `${name} uniform height scale`);
  }
  console.log('ok editor fit never overflows and keeps aspect');
}

function testSmallerStockLooksSmaller() {
  const pad = { w: 320, h: 220 };
  const fourBySix = fitEditorLabel(101.6, 152.4, pad.w, pad.h);
  const oneByOne = fitEditorLabel(25.4, 25.4, pad.w, pad.h);
  const ratTail = fitEditorLabel(101.6, 14.3, pad.w, pad.h);
  const mini = fitEditorLabel(20, 15, pad.w, pad.h);
  assert.ok(oneByOne.widthPx < fourBySix.widthPx, '1x1 must be narrower on screen than 4x6');
  assert.ok(oneByOne.heightPx < fourBySix.heightPx, '1x1 must be shorter on screen than 4x6');
  assert.ok(mini.widthPx < ratTail.widthPx, '20 mm stock must be narrower than 101.6 mm stock');
  console.log('ok relative physical size is visible in the pad');
}

function testIndependentAxesAreNotUsed() {
  const stretched = fitLabelSize(80, 20, 400, 400);
  assert.equal(stretched.scale, stretched.widthPx / 80);
  assert.ok(Math.abs(stretched.heightPx / 20 - stretched.scale) < 0.02);
  console.log('ok fitLabelSize uses one uniform scale');
}

function testViewZoomLabel() {
  assert.equal(formatViewZoomLabel(1), 'Fit');
  assert.equal(formatViewZoomLabel(1.5), '150%');
  assert.equal(formatViewZoomLabel(0.8), '80%');
  console.log('ok view zoom label is Fit at 100%');
}

function testPadBoardStaysInsidePad() {
  const padW = 340;
  const padH = 240;
  const ruler = 20;
  for (const [wMm, hMm, name] of [
    [101.6, 14.3, 'rat-tail'],
    [80, 10, 'resized rat-tail'],
    [50, 50, 'square'],
    [101.6, 152.4, '4x6'],
  ] as const) {
    const box = fitEditorPadBoard(wMm, hMm, padW, padH, ruler);
    assert.ok(box.boardWidthPx <= padW, `${name} board width ${box.boardWidthPx} > ${padW}`);
    assert.ok(box.boardHeightPx <= padH, `${name} board height ${box.boardHeightPx} > ${padH}`);
    assert.equal(box.boardWidthPx, ruler + box.widthPx);
    assert.equal(box.boardHeightPx, ruler + box.heightPx);
  }
  console.log('ok ruler board stays inside the measured pad');
}

function testScaleRatTailGeometry() {
  const next = scaleMediaGeometry(RAT_TAIL_143, 80 / 101.6, 10 / 14.3);
  assert.ok(next && next.type === 'rat_tail');
  if (next && next.type === 'rat_tail') {
    assert.ok(Math.abs(next.bodyWidthMm + next.tailLengthMm - 80) < 0.05);
    assert.ok(Math.abs(next.bodyHeightMm - 10) < 0.05);
  }
  console.log('ok rat-tail geometry scales with bounding box');
}

function main() {
  testContainFitNeverOverflows();
  testSmallerStockLooksSmaller();
  testIndependentAxesAreNotUsed();
  testViewZoomLabel();
  testPadBoardStaysInsidePad();
  testScaleRatTailGeometry();
  console.log('ALL LABEL GEOMETRY TESTS PASSED');
}

main();
