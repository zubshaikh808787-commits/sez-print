import assert from 'node:assert/strict';

import { DEFAULT_ELEMENT_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';
import { fitEditorPadBoard } from '../../label-geometry';
import {
  CHROME_HAS_SHADOW,
  CHROME_STROKE_PX,
  DRAG_LIFT_OPACITY,
} from '../canvas-chrome';
import {
  POINTER_COORD_SPACE,
  QA_BUSY_ELEMENT_COUNT,
  QA_DENSITY_SAMPLES,
  QA_TARGET_FPS,
  pointerLogicalPx,
} from '../canvas-qa';
import { DIVIDER_HIT_SIZE_PX, SPLIT_ANIMATION_MS } from '../canvas-split';
import {
  applyLiveDragPosition,
  createFrameThrottled,
  idleElementRefsUnchanged,
  splitCanvasLayers,
} from '../drag-layer';
import { EDITOR_IMAGE_MAX_EDGE_PX, workingSizePx } from '../image-ingest';
import { boundBoxMm, RESIZE_MIN_PROPORTIONAL_MM } from '../resize-policy';
import {
  editorViewTransform,
  mmToPointer,
  SNAP_GUIDE_PX,
  snapThresholdMm,
  windowPointToMm,
} from '../view-transform';

function textEl(id: string, left: number, top: number): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id,
    type: 'text',
    text: id,
    left,
    top,
    width: 8,
    height: 5,
    zIndex: 0,
  };
}

function imageEl(): LabelElement {
  return {
    id: 'photo',
    type: 'image',
    uri: 'file://busy.jpg',
    rotation: 0,
    left: 2,
    top: 2,
    width: 20,
    height: 10,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    aspectRatioLocked: true,
    originalAspect: 2,
  };
}

function viewForLabel(widthMm: number, heightMm: number, viewZoom = 1, panX = 0, panY = 0) {
  const fitted = fitEditorPadBoard(widthMm, heightMm, 360, 240, 28);
  return editorViewTransform({
    pxPerMM: fitted.scale,
    viewZoom,
    panX,
    panY,
    viewWidthPx: 360,
    viewHeightPx: 240,
    innerWidthPx: fitted.innerWidthPx,
    innerHeightPx: fitted.innerHeightPx,
    rulerSizePx: 28,
    boardOffsetXPx: fitted.offsetXPx,
    boardOffsetYPx: fitted.offsetYPx,
  });
}

function testPointerSpaceIsLogicalPixels() {
  assert.equal(POINTER_COORD_SPACE, 'logical-px');
  assert.equal('pixelRatio' in viewForLabel(50, 30), false);
  for (const dpr of QA_DENSITY_SAMPLES) {
    assert.equal(pointerLogicalPx(120, dpr), 120, `dpr ${dpr} must not scale the pointer`);
  }
  console.log('ok pointer math is logical px; PixelRatio is not an input');
}

function testSameLogicalDropIsDensityInvariant() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const padOrigin = { x: 48, y: 120 };
  const view = viewForLabel(canvas.widthMm, canvas.heightMm);
  const mark = { x: 10, y: 10 };
  const padPoint = mmToPointer(mark, view);
  const windowPoint = { x: padPoint.x + padOrigin.x, y: padPoint.y + padOrigin.y };
  const landed = QA_DENSITY_SAMPLES.map((dpr) => {
    const logical = {
      x: pointerLogicalPx(windowPoint.x, dpr),
      y: pointerLogicalPx(windowPoint.y, dpr),
    };
    return windowPointToMm(logical, padOrigin, view);
  });
  for (const mm of landed) {
    assert.ok(Math.abs(mm.x - 10) < 1e-6, `x ${mm.x}`);
    assert.ok(Math.abs(mm.y - 10) < 1e-6, `y ${mm.y}`);
  }
  console.log('ok mdpi / xhdpi / xxhdpi logical drops land on the same millimetre');
}

function testJewelryAndCableSurviveDensity() {
  for (const stock of [
    { widthMm: 54, heightMm: 96, name: 'jewelry' },
    { widthMm: 50, heightMm: 73, name: 'cable' },
  ]) {
    const view = viewForLabel(stock.widthMm, stock.heightMm, 2.5, 20, -12);
    const padOrigin = { x: 40, y: 90 };
    const padPoint = mmToPointer({ x: 10, y: 10 }, view);
    const windowPoint = { x: padPoint.x + padOrigin.x, y: padPoint.y + padOrigin.y };
    for (const dpr of QA_DENSITY_SAMPLES) {
      const mm = windowPointToMm(
        { x: pointerLogicalPx(windowPoint.x, dpr), y: pointerLogicalPx(windowPoint.y, dpr) },
        padOrigin,
        view,
      );
      assert.ok(Math.abs(mm.x - 10) < 1e-6, `${stock.name} dpr ${dpr} x`);
      assert.ok(Math.abs(mm.y - 10) < 1e-6, `${stock.name} dpr ${dpr} y`);
    }
  }
  console.log('ok jewelry 54×96 and cable 50×73 millimetres hold at 1x/2x/3x logical density');
}

function testBusyLabelLiftsOneNode() {
  const els = [
    ...Array.from({ length: QA_BUSY_ELEMENT_COUNT - 1 }, (_, i) => textEl(`t${i}`, i, 1)),
    imageEl(),
  ];
  assert.ok(els.length >= 10);
  const moving = splitCanvasLayers(els, 'photo');
  assert.equal(moving.active?.id, 'photo');
  assert.equal(moving.content.length, els.length - 1);
  const next = applyLiveDragPosition(els, 'photo', 6, 4, { widthMm: 50, heightMm: 30 });
  const after = splitCanvasLayers(next, 'photo');
  assert.equal(idleElementRefsUnchanged(moving.content, after.content), true);
  console.log('ok busy label (11 text + photo) keeps idle refs frozen during drag');
}

function testFrameThrottleMatchesFpsBudget() {
  assert.equal(QA_TARGET_FPS, 60);
  const emitted: number[] = [];
  const queue: Array<() => void> = [];
  const pump = createFrameThrottled<number>(
    (value) => emitted.push(value),
    {
      schedule: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancel: () => {
        queue.pop();
      },
    },
  );
  pump.push(1);
  pump.push(2);
  pump.push(3);
  assert.equal(queue.length, 1);
  queue[0]();
  assert.deepEqual(emitted, [3]);
  console.log('ok drag writes coalesce to one animation-frame callback');
}

function testWorkingCopyAndChromeContracts() {
  const working = workingSizePx(4000, 3000);
  assert.equal(working.widthPx, EDITOR_IMAGE_MAX_EDGE_PX);
  assert.equal(CHROME_STROKE_PX, 1);
  assert.equal(CHROME_HAS_SHADOW, false);
  assert.equal(DRAG_LIFT_OPACITY, 0.85);
  assert.equal(DIVIDER_HIT_SIZE_PX, 44);
  assert.ok(SPLIT_ANIMATION_MS >= 150 && SPLIT_ANIMATION_MS <= 250);
  assert.equal(SNAP_GUIDE_PX, 5);
  assert.ok(Math.abs(snapThresholdMm(4, 1) - 1.25) < 1e-9);
  console.log('ok image cap, 1px chrome, 44px hit, 200ms split, 5px snap');
}

function testImageResizeStaysProportional() {
  const next = boundBoxMm({
    anchor: 'e',
    behavior: 'aspect',
    start: { left: 4, top: 6, width: 20, height: 10 },
    proposed: { width: 24, height: 10 },
    aspect: 2,
    minMm: RESIZE_MIN_PROPORTIONAL_MM,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(next.width, 24);
  assert.equal(next.height, 12);
  console.log('ok image right-handle resize keeps aspect for the QA pack');
}

function main() {
  testPointerSpaceIsLogicalPixels();
  testSameLogicalDropIsDensityInvariant();
  testJewelryAndCableSurviveDensity();
  testBusyLabelLiftsOneNode();
  testFrameThrottleMatchesFpsBudget();
  testWorkingCopyAndChromeContracts();
  testImageResizeStaysProportional();
  console.log('ALL CANVAS QA REGRESSION TESTS PASSED');
}

main();
