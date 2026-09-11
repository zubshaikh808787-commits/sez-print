import assert from 'node:assert/strict';

import {
  fitCatalogLabel,
  fitEditorLabel,
  fitEditorPadBoard,
  fitLabelSize,
  formatViewZoomLabel,
} from '../label-geometry';
import {
  computeScale,
  containFitLabel,
  containFitImageOnLabel,
  mmToPx,
  pxToMm,
  printDotsPerMm,
  rectMmToPx,
  rectPxToMm,
} from '../label-coordinate-system';
import { RAT_TAIL_143, scaleMediaGeometry } from '../media-geometry';

const EDITOR_SIZES: Array<[number, number, string]> = [
  [50, 25, '50x25'],
  [50, 70, '50x70'],
  [60, 14, '60x14'],
  [50, 50, 'square'],
  [101.6, 14.3, 'rat-tail'],
  [101.6, 152.4, '4x6'],
  [80, 10, 'custom 80x10'],
  [30, 35, 'tall t-style'],
  [20, 15, 'small'],
];

const CONTAINERS: Array<[number, number, string]> = [
  [320, 220, 'small phone portrait'],
  [400, 280, 'large phone portrait'],
  [220, 320, 'small phone landscape'],
  [280, 400, 'large phone landscape'],
];

function testComputeScaleIsUniformMin() {
  const s = computeScale({ widthPx: 400, heightPx: 200 }, { widthMm: 50, heightMm: 70 });
  assert.equal(s, Math.min(400 / 50, 200 / 70));
  assert.equal(computeScale({ widthPx: 0, heightPx: 100 }, { widthMm: 50, heightMm: 25 }), 0);
  console.log('ok computeScale is min of both axes');
}

function testContainFitNeverOverflows() {
  for (const [wMm, hMm, name] of EDITOR_SIZES) {
    for (const [cw, ch, phone] of CONTAINERS) {
      const box = containFitLabel({ widthPx: cw, heightPx: ch }, { widthMm: wMm, heightMm: hMm });
      assert.ok(box.canvasWidthPx <= cw, `${name} ${phone} width overflow ${box.canvasWidthPx}`);
      assert.ok(box.canvasHeightPx <= ch, `${name} ${phone} height overflow ${box.canvasHeightPx}`);
      assert.ok(box.pxPerMM > 0, `${name} ${phone} scale`);
      assert.ok(Math.abs(box.canvasWidthPx - wMm * box.pxPerMM) < 1.01, `${name} ${phone} width from pxPerMM`);
      assert.ok(Math.abs(box.canvasHeightPx - hMm * box.pxPerMM) < 1.01, `${name} ${phone} height from pxPerMM`);
    }
  }
  console.log('ok contain-fit never overflows and keeps aspect');
}

function testEditorPadBoardStaysInsidePad() {
  const ruler = 20;
  for (const [wMm, hMm, name] of EDITOR_SIZES) {
    for (const [padW, padH, phone] of [
      [340, 240, 'small'],
      [420, 300, 'large'],
      [240, 340, 'landscape'],
    ] as const) {
      const box = fitEditorPadBoard(wMm, hMm, padW, padH, ruler);
      assert.ok(box.boardWidthPx <= padW, `${name} ${phone} board width ${box.boardWidthPx} > ${padW}`);
      assert.ok(box.boardHeightPx <= padH, `${name} ${phone} board height ${box.boardHeightPx} > ${padH}`);
      assert.equal(box.boardWidthPx, ruler + box.innerWidthPx);
      assert.equal(box.boardHeightPx, ruler + box.innerHeightPx);
      assert.ok(box.offsetXPx >= 0, `${name} ${phone} offsetX`);
      assert.ok(box.offsetYPx >= 0, `${name} ${phone} offsetY`);
      assert.ok(box.offsetXPx + box.widthPx <= box.innerWidthPx + 0.01, `${name} ${phone} artboard overflow x`);
      assert.ok(box.offsetYPx + box.heightPx <= box.innerHeightPx + 0.01, `${name} ${phone} artboard overflow y`);
      assert.ok(Math.abs(box.widthPx - wMm * box.scale) < 1.01, `${name} uniform width scale`);
      assert.ok(Math.abs(box.heightPx - hMm * box.scale) < 1.01, `${name} uniform height scale`);
    }
  }
  console.log('ok editor pad board stays inside container with one pxPerMM');
}

function testMmPxRoundTrip() {
  const pxPerMM = 3.75;
  for (const mm of [0, 1, 14.3, 50, 63.5, 101.6]) {
    const back = pxToMm(mmToPx(mm, pxPerMM), pxPerMM);
    assert.ok(Math.abs(back - mm) < 1e-9, `round-trip ${mm}`);
  }
  const rect = rectPxToMm(rectMmToPx({ left: 10, top: 5, width: 20, height: 8 }, pxPerMM), pxPerMM);
  assert.ok(Math.abs(rect.left - 10) < 1e-9);
  assert.ok(Math.abs(rect.top - 5) < 1e-9);
  assert.ok(Math.abs(rect.width - 20) < 1e-9);
  assert.ok(Math.abs(rect.height - 8) < 1e-9);
  console.log('ok mm/px round-trip');
}

function testIndependentAxesAreNotUsed() {
  const stretched = fitLabelSize(80, 20, 400, 400);
  assert.ok(Math.abs(stretched.scale - Math.min(400 / 80, 400 / 20)) < 1e-9);
  assert.ok(stretched.widthPx <= 400);
  assert.ok(stretched.heightPx <= 400);
  assert.ok(Math.abs(stretched.widthPx / 80 - stretched.heightPx / 20) < 0.05);
  console.log('ok fitLabelSize uses one uniform scale');
}

function testCatalogKeepsRelativeSize() {
  const pad = { w: 320, h: 220 };
  const fourBySix = fitCatalogLabel(101.6, 152.4, pad.w, pad.h);
  const oneByOne = fitCatalogLabel(25.4, 25.4, pad.w, pad.h);
  const ratTail = fitCatalogLabel(101.6, 14.3, pad.w, pad.h);
  const mini = fitCatalogLabel(20, 15, pad.w, pad.h);
  assert.ok(oneByOne.widthPx < fourBySix.widthPx, '1x1 must be narrower on screen than 4x6');
  assert.ok(oneByOne.heightPx < fourBySix.heightPx, '1x1 must be shorter on screen than 4x6');
  assert.ok(mini.widthPx < ratTail.widthPx, '20 mm stock must be narrower than 101.6 mm stock');
  console.log('ok catalog thumbnails keep relative physical size');
}

function testEditorPadFillsContainer() {
  const pad = { w: 320, h: 220 };
  const mini = fitEditorLabel(20, 15, pad.w, pad.h);
  const mid = fitEditorLabel(50, 25, pad.w, pad.h);
  assert.ok(mini.widthPx === pad.w || mini.heightPx === pad.h || Math.abs(mini.heightPx - pad.h) <= 1);
  assert.ok(mid.widthPx === pad.w || mid.heightPx === pad.h || Math.abs(mid.widthPx - pad.w) <= 1);
  console.log('ok editor contain-fit fills the Canva pad');
}

function testWorkspaceIndependentOfLabelSize() {
  const pad = { w: 360, h: 240, ruler: 20 };
  const thin = fitEditorPadBoard(80, 10, pad.w, pad.h, pad.ruler);
  const tall = fitEditorPadBoard(50, 70, pad.w, pad.h, pad.ruler);
  const sheet = fitEditorPadBoard(101.6, 152.4, pad.w, pad.h, pad.ruler);
  assert.equal(thin.innerWidthPx, tall.innerWidthPx);
  assert.equal(thin.innerHeightPx, sheet.innerHeightPx);
  assert.equal(thin.boardWidthPx, sheet.boardWidthPx);
  assert.equal(thin.boardHeightPx, sheet.boardHeightPx);
  assert.ok(thin.heightPx < sheet.heightPx, '80x10 artboard is shorter than 4x6 on the same pad');
  assert.ok(Math.abs(thin.widthPx / 80 - thin.heightPx / 10) < 0.08);
  console.log('ok phone pad is constant; only the inner label canvas changes');
}

function testImportedImageNestsOnLabel() {
  const label = { widthMm: 80, heightMm: 10 };
  const square = containFitImageOnLabel(label, { widthPx: 1000, heightPx: 1000 });
  assert.ok(Math.abs(square.height - 10) < 1e-9);
  assert.ok(Math.abs(square.width - 10) < 1e-9);
  assert.ok(Math.abs(square.left - 35) < 1e-9);
  assert.equal(square.top, 0);

  const wide = containFitImageOnLabel(label, { widthPx: 800, heightPx: 100 });
  assert.ok(Math.abs(wide.width - 80) < 1e-9);
  assert.ok(Math.abs(wide.height - 10) < 1e-9);

  const body = containFitImageOnLabel(
    { widthMm: 14, heightMm: 96 },
    { widthPx: 400, heightPx: 800 },
    { left: 0, top: 0, width: 14, height: 64 },
  );
  assert.ok(body.top >= 0);
  assert.ok(body.top + body.height <= 64 + 1e-9);
  assert.ok(body.left + body.width <= 14 + 1e-9);
  console.log('ok imported image contain-fits as a nested canvas on the label');
}

function testViewZoomLabel() {
  assert.equal(formatViewZoomLabel(1), 'Fit');
  assert.equal(formatViewZoomLabel(1.5), '150%');
  assert.equal(formatViewZoomLabel(0.8), '80%');
  assert.equal(formatViewZoomLabel(0.25), '25%');
  assert.equal(formatViewZoomLabel(8), '800%');
  console.log('ok view zoom label is Fit at 100%');
}

function testPrintDotsPerMmIsHardware() {
  assert.equal(printDotsPerMm(304), 12);
  assert.equal(printDotsPerMm(203), 8);
  console.log('ok print dots/mm delegates to hardware 12 dpm at 304');
}

function testRatTailGeometryScale() {
  const next = scaleMediaGeometry(RAT_TAIL_143, 80 / 101.6, 10 / 14.3);
  assert.ok(next && next.type === 'rat_tail');
  if (next && next.type === 'rat_tail') {
    assert.ok(Math.abs(next.bodyWidthMm + next.tailLengthMm - 80) < 0.05);
  }
  console.log('ok rat-tail geometry scales with bounding box');
}

function main() {
  testComputeScaleIsUniformMin();
  testContainFitNeverOverflows();
  testEditorPadBoardStaysInsidePad();
  testMmPxRoundTrip();
  testIndependentAxesAreNotUsed();
  testCatalogKeepsRelativeSize();
  testEditorPadFillsContainer();
  testWorkspaceIndependentOfLabelSize();
  testImportedImageNestsOnLabel();
  testViewZoomLabel();
  testPrintDotsPerMmIsHardware();
  testRatTailGeometryScale();
  console.log('ALL LABEL GEOMETRY TESTS PASSED');
}

main();
