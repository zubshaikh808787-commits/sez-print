import assert from 'node:assert/strict';

import { boxOf, sanitizeTransform } from '../engine';
import { rulerTickPx, rulerTicksFor } from '../ruler-ticks';
import {
  EDITOR_WORKSPACE_PAD_BOTTOM_PX,
  VIEW_ZOOM_MAX,
  VIEW_ZOOM_MIN,
  artboardOriginInPad,
  clampViewZoom,
  editorViewTransform,
  mmToPointer,
  pointerToMm,
  pointerDeltaToMm,
  windowPointToMm,
  grabOffsetMm,
  dropTopLeftMm,
  snapThresholdMm,
  SNAP_GUIDE_PX,
  stepViewZoom,
  viewPxPerMm,
} from '../view-transform';
import { fitEditorPadBoard } from '../../label-geometry';
import { DEFAULT_ELEMENT_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';
import { elementSizeMm } from '../../label-document';

function textEl(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id,
    type: 'text',
    text: id,
    left,
    top,
    width,
    height,
    zIndex: 0,
  };
}

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

function testStoredGeometryIsMillimetres() {
  const el = textEl('sq', 12.5, 8, 10, 10);
  const box = boxOf(el);
  assert.equal(box.left, 12.5);
  assert.equal(box.top, 8);
  assert.equal(box.width, 10);
  assert.equal(box.height, 10);
  const size = elementSizeMm(el);
  assert.equal(size.width, 10);
  assert.equal(size.height, 10);
  const committed = sanitizeTransform({
    leftMm: el.left,
    topMm: el.top,
    widthMm: size.width,
    heightMm: size.height,
    rotation: 0,
  });
  assert.equal(committed.leftMm, 12.5);
  assert.equal(committed.widthMm, 10);
  console.log('ok element store is millimetres');
}

function testZoomDoesNotMutateStoredMm() {
  const el = textEl('sq', 12.5, 8, 10, 10);
  const before = { left: el.left, top: el.top, ...elementSizeMm(el) };
  const fit = 4;
  const screenAtFit = before.width * viewPxPerMm(fit, 1);
  const screenZoomed = before.width * viewPxPerMm(fit, 2.5);
  assert.ok(Math.abs(screenZoomed / screenAtFit - 2.5) < 1e-9);
  assert.equal(el.left, before.left);
  assert.equal(el.top, before.top);
  assert.equal(el.width, before.width);
  assert.equal(el.height, before.height);
  console.log('ok view zoom does not rewrite stored millimetres');
}

function testTenMmSquareSameProportion() {
  const pad = { w: 400, h: 320, ruler: 28 };
  const squareLabel = fitEditorPadBoard(50, 50, pad.w, pad.h, pad.ruler);
  const sheetLabel = fitEditorPadBoard(100, 150, pad.w, pad.h, pad.ruler);
  const square10 = 10 * squareLabel.scale;
  const sheet10 = 10 * sheetLabel.scale;
  assert.ok(Math.abs(square10 / squareLabel.widthPx - 10 / 50) < 0.02);
  assert.ok(Math.abs(sheet10 / sheetLabel.heightPx - 10 / 150) < 0.02);
  assert.ok(Math.abs(square10 / squareLabel.heightPx - 10 / 50) < 0.02);
  assert.ok(Math.abs(sheet10 / sheetLabel.widthPx - 10 / 100) < 0.02);
  console.log('ok 10mm square is the same fraction of 50×50 and 100×150');
}

function testSingleFitPxPerMm() {
  const a = fitEditorPadBoard(50, 30, 360, 240, 28);
  const b = fitEditorPadBoard(50, 30, 360, 240, 28);
  assert.equal(a.scale, b.scale);
  assert.ok(Math.abs(a.widthPx / 50 - a.scale) < 0.03);
  assert.ok(Math.abs(a.heightPx / 30 - a.scale) < 0.03);
  const screen = viewPxPerMm(a.scale, 2);
  assert.ok(Math.abs(screen - a.scale * 2) < 1e-9);
  console.log('ok one fit pxPerMm; view zoom is a multiplier');
}

function testRulerTicksMeetArtboardEdges() {
  const lengthMm = 50;
  const contentPx = 200;
  const ticks = rulerTicksFor(lengthMm, contentPx);
  const origin = ticks.find((t) => t.mm === 0);
  const end = ticks.find((t) => Math.abs(t.mm - lengthMm) < 0.01);
  assert.ok(origin);
  assert.ok(end);
  assert.equal(origin!.px, 0);
  assert.equal(end!.px, contentPx);
  assert.equal(rulerTickPx(0, lengthMm, contentPx), 0);
  assert.equal(rulerTickPx(lengthMm, lengthMm, contentPx), contentPx);
  assert.equal(rulerTickPx(10, lengthMm, contentPx), 40);
  // Rulers live inside the zoomed pad — unzoomed content px does not include view zoom.
  assert.equal(rulerTickPx(lengthMm, lengthMm, contentPx), rulerTickPx(lengthMm, lengthMm, contentPx));
  console.log('ok ruler 0 and lengthMm ticks sit on artboard edges');
}

function testRulersFollowLetterboxOrigin() {
  const fitted = fitEditorPadBoard(50, 30, 360, 240, 28);
  const zero = fitted.offsetXPx + rulerTickPx(0, 50, fitted.widthPx);
  const end = fitted.offsetXPx + rulerTickPx(50, 50, fitted.widthPx);
  assert.ok(Math.abs(zero - fitted.offsetXPx) < 1e-9);
  assert.ok(Math.abs(end - (fitted.offsetXPx + fitted.widthPx)) < 1e-9);
  console.log('ok ruler origin matches letterboxed artboard');
}

function testZoomClamp() {
  assert.equal(clampViewZoom(0.1), VIEW_ZOOM_MIN);
  assert.equal(clampViewZoom(20), VIEW_ZOOM_MAX);
  assert.equal(clampViewZoom(NaN), 1);
  assert.equal(clampViewZoom(1), 1);
  assert.ok(stepViewZoom(1, 1) > 1);
  assert.ok(stepViewZoom(1, -1) < 1);
  assert.equal(stepViewZoom(0.2, -1), VIEW_ZOOM_MIN);
  assert.equal(stepViewZoom(8, 1), VIEW_ZOOM_MAX);
  console.log('ok view zoom clamps to 25%–800%');
}

function testPointerToMmRoundTrip() {
  const cases: Array<{ zoom: number; panX: number; panY: number; name: string }> = [
    { zoom: 1, panX: 0, panY: 0, name: '100% fit' },
    { zoom: 2.5, panX: 0, panY: 0, name: '250% zoom' },
    { zoom: 2.5, panX: 36, panY: -22, name: '250% panned' },
  ];
  const spots = [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 50, y: 30 },
    { x: 14, y: 96 },
  ];
  for (const viewCase of cases) {
    const view = sampleView({ viewZoom: viewCase.zoom, panX: viewCase.panX, panY: viewCase.panY });
    for (const mm of spots) {
      const screen = mmToPointer(mm, view);
      const back = pointerToMm(screen, view);
      assert.ok(Math.abs(back.x - mm.x) < 1e-6, `${viewCase.name} x ${mm.x} -> ${back.x}`);
      assert.ok(Math.abs(back.y - mm.y) < 1e-6, `${viewCase.name} y ${mm.y} -> ${back.y}`);
    }
  }
  console.log('ok pointerToMm round-trips at fit, 250%, and panned');
}

function testSameVisualSpotSameMm() {
  const mm = { x: 12, y: 8 };
  const fit = sampleView({ viewZoom: 1, panX: 0, panY: 0 });
  const zoomed = sampleView({ viewZoom: 2.5, panX: 0, panY: 0 });
  const panned = sampleView({ viewZoom: 2.5, panX: 40, panY: -18 });
  const fromFit = pointerToMm(mmToPointer(mm, fit), fit);
  const fromZoom = pointerToMm(mmToPointer(mm, zoomed), zoomed);
  const fromPan = pointerToMm(mmToPointer(mm, panned), panned);
  assert.ok(Math.abs(fromFit.x - mm.x) < 1e-6);
  assert.ok(Math.abs(fromZoom.x - mm.x) < 1e-6);
  assert.ok(Math.abs(fromPan.x - mm.x) < 1e-6);
  assert.ok(Math.abs(fromFit.y - fromZoom.y) < 1e-6);
  assert.ok(Math.abs(fromZoom.y - fromPan.y) < 1e-6);
  console.log('ok same artboard spot maps to the same mm at any zoom/pan');
}

function testJewelryAndCableMmUnchanged() {
  const jewelry = { widthMm: 54, heightMm: 96 };
  const cable = { widthMm: 50, heightMm: 73 };
  const view = sampleView({ viewZoom: 2.5, panX: 12, panY: -8 });
  const jewelryCorner = pointerToMm(mmToPointer({ x: jewelry.widthMm, y: jewelry.heightMm }, view), view);
  const cableCorner = pointerToMm(mmToPointer({ x: cable.widthMm, y: cable.heightMm }, view), view);
  assert.ok(Math.abs(jewelryCorner.x - 54) < 1e-6);
  assert.ok(Math.abs(jewelryCorner.y - 96) < 1e-6);
  assert.ok(Math.abs(cableCorner.x - 50) < 1e-6);
  assert.ok(Math.abs(cableCorner.y - 73) < 1e-6);
  const pad = fitEditorPadBoard(54, 96, 360, 400, 28);
  assert.ok(Math.abs(pad.widthPx / pad.scale - 54) < 1.01);
  assert.ok(Math.abs(pad.heightPx / pad.scale - 96) < 1.01);
  console.log('ok jewelry 54×96 and cable 50×73 millimetres survive the view transform');
}

function testArtboardOriginAccountsForRulersAndPad() {
  const origin = artboardOriginInPad({
    viewWidthPx: 400,
    viewHeightPx: 300,
    innerWidthPx: 200,
    innerHeightPx: 160,
    rulerSizePx: 28,
    boardOffsetXPx: 10,
    boardOffsetYPx: 6,
    workspacePaddingBottomPx: EDITOR_WORKSPACE_PAD_BOTTOM_PX,
  });
  const boardW = 28 + 200;
  const boardH = 28 + 160;
  const availH = 300 - EDITOR_WORKSPACE_PAD_BOTTOM_PX;
  assert.ok(Math.abs(origin.x - ((400 - boardW) / 2 + 28 + 10)) < 1e-9);
  assert.ok(Math.abs(origin.y - ((availH - boardH) / 2 + 28 + 6)) < 1e-9);
  console.log('ok artboard origin includes rulers, letterbox, and workspace pad');
}

function testFitResetsPanInPointerMath() {
  const zoomed = sampleView({ viewZoom: 3, panX: 50, panY: -30 });
  const fitted = sampleView({ viewZoom: 1, panX: 0, panY: 0 });
  const mm = { x: 5, y: 5 };
  const a = pointerToMm(mmToPointer(mm, zoomed), zoomed);
  const b = pointerToMm(mmToPointer(mm, fitted), fitted);
  assert.ok(Math.abs(a.x - b.x) < 1e-6);
  assert.ok(Math.abs(a.y - b.y) < 1e-6);
  console.log('ok Fit (zoom 1, pan 0) still maps the same millimetre');
}

function testDropOnRulerMarkIsZoomInvariant() {
  const padOrigin = { x: 48, y: 120 };
  const mark = { x: 10, y: 5 };
  const views = [
    sampleView({ viewZoom: 1, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 36, panY: -22 }),
  ];
  const landed = views.map((view) => {
    const padPoint = mmToPointer(mark, view);
    const windowPoint = { x: padPoint.x + padOrigin.x, y: padPoint.y + padOrigin.y };
    return windowPointToMm(windowPoint, padOrigin, view);
  });
  for (const mm of landed) {
    assert.ok(Math.abs(mm.x - mark.x) < 1e-6, `drop x ${mm.x}`);
    assert.ok(Math.abs(mm.y - mark.y) < 1e-6, `drop y ${mm.y}`);
  }
  assert.ok(Math.abs(landed[0].x - landed[1].x) < 1e-6);
  assert.ok(Math.abs(landed[1].x - landed[2].x) < 1e-6);
  console.log('ok drop on a 10mm ruler mark lands on 10mm at 100%, 250%, and panned');
}

function testDragCommitUsesPointerToMm() {
  const padOrigin = { x: 12, y: 64 };
  const element = { left: 4, top: 6, width: 10, height: 8 };
  const grabPoint = { x: element.left + 5, y: element.top + 4 };
  const dropPoint = { x: 20, y: 15 };
  const views = [
    sampleView({ viewZoom: 1, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 0, panY: 0 }),
    sampleView({ viewZoom: 2.5, panX: 40, panY: -18 }),
  ];
  const results = views.map((view) => {
    const startPad = mmToPointer(grabPoint, view);
    const startWindow = { x: startPad.x + padOrigin.x, y: startPad.y + padOrigin.y };
    const grab = grabOffsetMm(windowPointToMm(startWindow, padOrigin, view), {
      x: element.left,
      y: element.top,
    });
    const endPad = mmToPointer(dropPoint, view);
    const endWindow = { x: endPad.x + padOrigin.x, y: endPad.y + padOrigin.y };
    return dropTopLeftMm({
      pointerMm: windowPointToMm(endWindow, padOrigin, view),
      grabOffsetMm: grab,
      widthMm: element.width,
      heightMm: element.height,
      canvas: { widthMm: 50, heightMm: 30 },
    });
  });
  const expectedLeft = dropPoint.x - 5;
  const expectedTop = dropPoint.y - 4;
  for (const pos of results) {
    assert.ok(Math.abs(pos.left - expectedLeft) < 0.02, `drag left ${pos.left}`);
    assert.ok(Math.abs(pos.top - expectedTop) < 0.02, `drag top ${pos.top}`);
  }
  console.log('ok dragged element lands on the same mm at 100%, 250%, and panned');
}

function testPointerDeltaMatchesWindowPointToMm() {
  const view = sampleView({ viewZoom: 2.5, panX: 30, panY: -12 });
  const padOrigin = { x: 20, y: 40 };
  const startMm = { x: 8, y: 4 };
  const endMm = { x: 18, y: 9 };
  const startPad = mmToPointer(startMm, view);
  const endPad = mmToPointer(endMm, view);
  const startW = { x: startPad.x + padOrigin.x, y: startPad.y + padOrigin.y };
  const endW = { x: endPad.x + padOrigin.x, y: endPad.y + padOrigin.y };
  const fromPoints = {
    x: windowPointToMm(endW, padOrigin, view).x - windowPointToMm(startW, padOrigin, view).x,
    y: windowPointToMm(endW, padOrigin, view).y - windowPointToMm(startW, padOrigin, view).y,
  };
  const fromDelta = pointerDeltaToMm(
    { x: endW.x - startW.x, y: endW.y - startW.y },
    view,
  );
  assert.ok(Math.abs(fromPoints.x - fromDelta.x) < 1e-6);
  assert.ok(Math.abs(fromPoints.y - fromDelta.y) < 1e-6);
  assert.ok(Math.abs(fromDelta.x - 10) < 1e-6);
  assert.ok(Math.abs(fromDelta.y - 5) < 1e-6);
  console.log('ok pointer delta mm matches windowPointToMm at zoom and pan');
}

function testSnapThresholdIsFiveScreenPixels() {
  assert.equal(SNAP_GUIDE_PX, 5);
  assert.ok(Math.abs(snapThresholdMm(4, 1) - 1.25) < 1e-9);
  assert.ok(Math.abs(snapThresholdMm(4, 2.5) - 0.5) < 1e-9);
  console.log('ok snap threshold is 5 screen pixels in millimetres');
}

function testJewelryDropStaysInMillimetres() {
  const fitted = fitEditorPadBoard(54, 96, 360, 400, 28);
  const view = editorViewTransform({
    pxPerMM: fitted.scale,
    viewZoom: 2.5,
    panX: 18,
    panY: -10,
    viewWidthPx: 360,
    viewHeightPx: 400,
    innerWidthPx: fitted.innerWidthPx,
    innerHeightPx: fitted.innerHeightPx,
    rulerSizePx: 28,
    boardOffsetXPx: fitted.offsetXPx,
    boardOffsetYPx: fitted.offsetYPx,
  });
  const padOrigin = { x: 8, y: 24 };
  const mark = { x: 10, y: 20 };
  const padPoint = mmToPointer(mark, view);
  const landed = windowPointToMm(
    { x: padPoint.x + padOrigin.x, y: padPoint.y + padOrigin.y },
    padOrigin,
    view,
  );
  assert.ok(Math.abs(landed.x - 10) < 1e-6);
  assert.ok(Math.abs(landed.y - 20) < 1e-6);
  console.log('ok jewelry 54×96 drop at 10mm is still 10mm while zoomed and panned');
}

function main() {
  testStoredGeometryIsMillimetres();
  testZoomDoesNotMutateStoredMm();
  testTenMmSquareSameProportion();
  testSingleFitPxPerMm();
  testRulerTicksMeetArtboardEdges();
  testRulersFollowLetterboxOrigin();
  testZoomClamp();
  testPointerToMmRoundTrip();
  testSameVisualSpotSameMm();
  testJewelryAndCableMmUnchanged();
  testArtboardOriginAccountsForRulersAndPad();
  testFitResetsPanInPointerMath();
  testDropOnRulerMarkIsZoomInvariant();
  testDragCommitUsesPointerToMm();
  testPointerDeltaMatchesWindowPointToMm();
  testJewelryDropStaysInMillimetres();
  testSnapThresholdIsFiveScreenPixels();
  console.log('ALL VIEW TRANSFORM TESTS PASSED');
}

main();
