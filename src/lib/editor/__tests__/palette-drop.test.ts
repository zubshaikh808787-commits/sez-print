import assert from 'node:assert/strict';

import { SNAP_THRESHOLD_MM } from '../engine';
import {
  isPaletteDropOnArtboard,
  paletteDropTopLeftMm,
  paletteDropTypeForLabel,
} from '../palette-drop';
import {
  editorViewTransform,
  mmToPointer,
  snapThresholdMm,
  windowPointToMm,
} from '../view-transform';
import { fitEditorPadBoard } from '../../label-geometry';

function sampleView(overrides: Partial<ReturnType<typeof editorViewTransform>> = {}) {
  const fitted = fitEditorPadBoard(50, 30, 360, 240, 28);
  const base = editorViewTransform({
    pxPerMM: fitted.scale,
    viewZoom: 1,
    panX: 0,
    panY: 0,
    viewWidthPx: 360,
    viewHeightPx: 240,
    innerWidthPx: fitted.innerWidthPx,
    innerHeightPx: fitted.innerHeightPx,
    rulerSizePx: 28,
    boardOffsetXPx: fitted.offsetXPx,
    boardOffsetYPx: fitted.offsetYPx,
  });
  return { ...base, ...overrides };
}

function testQrCentersOnDropPoint() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const placed = paletteDropTopLeftMm({
    pointerMm: { x: 20, y: 12 },
    widthMm: 8,
    heightMm: 8,
    canvas,
    thresholdMm: 0,
  });
  assert.equal(placed.left, 16);
  assert.equal(placed.top, 8);
  console.log('ok QR drop is centered on the pointer, not top-left');
}

function testDropAtSameVisualSpotIsZoomInvariant() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const padOrigin = { x: 48, y: 120 };
  const mark = { x: 10, y: 10 };
  const size = { widthMm: 8, heightMm: 8 };
  const views = [
    sampleView({ viewZoom: 1, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 36, panY: -22 }),
  ];
  const landed = views.map((view) => {
    const padPoint = mmToPointer(mark, view);
    const pointerMm = windowPointToMm(
      { x: padPoint.x + padOrigin.x, y: padPoint.y + padOrigin.y },
      padOrigin,
      view,
    );
    return paletteDropTopLeftMm({
      pointerMm,
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      canvas,
      thresholdMm: 0,
    });
  });
  for (const box of landed) {
    assert.ok(Math.abs(box.left - 6) < 1e-6, `left ${box.left}`);
    assert.ok(Math.abs(box.top - 6) < 1e-6, `top ${box.top}`);
  }
  console.log('ok palette QR at 10mm is centered the same at 100%, 250%, and panned');
}

function testJewelryAndCableDropStayMillimetres() {
  const qr = { widthMm: 8, heightMm: 8 };
  const jewelry = paletteDropTopLeftMm({
    pointerMm: { x: 10, y: 10 },
    ...qr,
    canvas: { widthMm: 54, heightMm: 96 },
    thresholdMm: 0,
  });
  assert.equal(jewelry.left, 6);
  assert.equal(jewelry.top, 6);
  const cable = paletteDropTopLeftMm({
    pointerMm: { x: 10, y: 10 },
    ...qr,
    canvas: { widthMm: 50, heightMm: 73 },
    thresholdMm: 0,
  });
  assert.equal(cable.left, 6);
  assert.equal(cable.top, 6);
  console.log('ok jewelry 54×96 and cable 50×73 palette drops stay millimetres');
}

function testOffArtboardDropIsRejected() {
  const canvas = { widthMm: 50, heightMm: 30 };
  assert.equal(isPaletteDropOnArtboard({ x: 10, y: 10 }, canvas), true);
  assert.equal(isPaletteDropOnArtboard({ x: 0, y: 0 }, canvas), true);
  assert.equal(isPaletteDropOnArtboard({ x: 50, y: 30 }, canvas), true);
  assert.equal(isPaletteDropOnArtboard({ x: -1, y: 10 }, canvas), false);
  assert.equal(isPaletteDropOnArtboard({ x: 10, y: 40 }, canvas), false);
  console.log('ok palette drop only commits when the pointer is on the artboard');
}

function testOverflowDropClampsOntoTheLabel() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const placed = paletteDropTopLeftMm({
    pointerMm: { x: 48, y: 28 },
    widthMm: 8,
    heightMm: 8,
    canvas,
    thresholdMm: 0,
  });
  assert.equal(placed.left, 42);
  assert.equal(placed.top, 22);
  console.log('ok centered drop clamps onto the artboard');
}

function testPaletteToolLabels() {
  assert.equal(paletteDropTypeForLabel('QRCode'), 'qrcode');
  assert.equal(paletteDropTypeForLabel('Text'), 'text');
  assert.equal(paletteDropTypeForLabel('Image'), null);
  console.log('ok only immediate add tools are palette-droppable');
}

function testCenterSnapGuideNearHorizontalMidline() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const pxPerMm = 4;
  const threshold = snapThresholdMm(pxPerMm, 1, 5);
  assert.ok(Math.abs(threshold - 1.25) < 1e-9);
  const near = paletteDropTopLeftMm({
    pointerMm: { x: 24.2, y: 12 },
    widthMm: 10,
    heightMm: 6,
    canvas,
    thresholdMm: threshold,
  });
  assert.equal(near.left, 20);
  assert.ok(near.guides.some((g) => g.axis === 'v' && g.positionMm === 25));
  const far = paletteDropTopLeftMm({
    pointerMm: { x: 22, y: 12 },
    widthMm: 10,
    heightMm: 6,
    canvas,
    thresholdMm: threshold,
  });
  assert.ok(Math.abs(far.left - 17) < 1e-9);
  assert.equal(
    far.guides.some((g) => g.axis === 'v' && g.positionMm === 25),
    false,
  );
  console.log('ok 5px snap pulls a box to the artboard horizontal center');
}

function testSnapToOtherElementEdge() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const placed = paletteDropTopLeftMm({
    pointerMm: { x: 14.8, y: 8 },
    widthMm: 10,
    heightMm: 6,
    canvas,
    others: [{ left: 20, top: 0, width: 10, height: 8 }],
    thresholdMm: SNAP_THRESHOLD_MM,
  });
  assert.equal(placed.left, 10);
  assert.ok(placed.guides.some((g) => g.axis === 'v' && g.positionMm === 20));
  console.log('ok palette drop snaps to another element edge');
}

function main() {
  testQrCentersOnDropPoint();
  testDropAtSameVisualSpotIsZoomInvariant();
  testJewelryAndCableDropStayMillimetres();
  testOffArtboardDropIsRejected();
  testOverflowDropClampsOntoTheLabel();
  testPaletteToolLabels();
  testCenterSnapGuideNearHorizontalMidline();
  testSnapToOtherElementEdge();
  console.log('ALL PALETTE DROP TESTS PASSED');
}

main();
