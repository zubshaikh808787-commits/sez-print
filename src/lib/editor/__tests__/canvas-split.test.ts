import assert from 'node:assert/strict';

import {
  CANVAS_SPLIT_MIN_RATIO,
  DEFAULT_CANVAS_SPLIT_RATIO,
  DIVIDER_HIT_SIZE_PX,
  FULLSCREEN_SNAP_RATIO,
  NUDGE_PAD_SPLIT_EXTRA_PX,
  PANEL_MIN_HEIGHT_PX,
  STAGE_PADDING_Y_PX,
  canvasHeightAfterDrag,
  clampCanvasSplitHeight,
  clampStoredSplitRatio,
  defaultCanvasSplitHeight,
  persistableSplitRatio,
  resolveSplitRelease,
  restoreCanvasSplitHeight,
  usableSplitViewportPx,
  workspaceHeightFromSplit,
} from '../canvas-split';
import { fitEditorPadBoard } from '../../label-geometry';

function testUsableViewportSubtractsHitTarget() {
  assert.equal(usableSplitViewportPx(500), 500 - DIVIDER_HIT_SIZE_PX);
  assert.equal(usableSplitViewportPx(40), 0);
  assert.equal(usableSplitViewportPx(NaN), 0);
  console.log('ok usable split viewport subtracts the 44px hit target');
}

function testDefaultGivesCanvasMajority() {
  const viewport = 700;
  const height = defaultCanvasSplitHeight(viewport);
  const usable = usableSplitViewportPx(viewport);
  assert.equal(height, Math.round(usable * DEFAULT_CANVAS_SPLIT_RATIO));
  assert.ok(height / usable > 0.5);
  assert.ok(height / usable >= CANVAS_SPLIT_MIN_RATIO);
  console.log('ok default split gives the canvas more than half the column');
}

function testCanvasCannotShrinkBelowThirtyFivePercent() {
  const viewport = 800;
  const usable = usableSplitViewportPx(viewport);
  const minCanvas = usable * CANVAS_SPLIT_MIN_RATIO;
  const clamped = clampCanvasSplitHeight({
    viewportPx: viewport,
    requestedCanvasPx: 10,
  });
  assert.equal(clamped, Math.round(minCanvas));
  assert.ok(clamped >= minCanvas - 0.5);
  console.log('ok canvas height clamps to 35% of usable column');
}

function testPanelCannotShrinkBelowMin() {
  const viewport = 800;
  const usable = usableSplitViewportPx(viewport);
  const maxCanvas = usable - PANEL_MIN_HEIGHT_PX;
  const clamped = clampCanvasSplitHeight({
    viewportPx: viewport,
    requestedCanvasPx: 10_000,
  });
  assert.equal(clamped, Math.round(maxCanvas));
  assert.equal(usable - clamped, PANEL_MIN_HEIGHT_PX);
  console.log('ok panel keeps toolbar + one tool-icon row');
}

function testInRangeRequestDoesNotJump() {
  const viewport = 720;
  const requested = 360;
  const a = clampCanvasSplitHeight({ viewportPx: viewport, requestedCanvasPx: requested });
  const b = clampCanvasSplitHeight({ viewportPx: viewport, requestedCanvasPx: requested });
  assert.equal(a, requested);
  assert.equal(b, requested);
  console.log('ok in-range drag frames do not jump');
}

function testPointerDeltaGrowsCanvasDownward() {
  const viewport = 800;
  const start = defaultCanvasSplitHeight(viewport);
  const down = canvasHeightAfterDrag({
    startCanvasPx: start,
    deltaY: 80,
    viewportPx: viewport,
  });
  const up = canvasHeightAfterDrag({
    startCanvasPx: start,
    deltaY: -80,
    viewportPx: viewport,
  });
  assert.equal(down, start + 80);
  assert.equal(up, start - 80);
  console.log('ok pointer dy maps 1:1 onto canvas height inside the clamps');
}

function testPointerDeltaStopsAtClamps() {
  const viewport = 640;
  const floor = canvasHeightAfterDrag({
    startCanvasPx: 40,
    deltaY: -400,
    viewportPx: viewport,
  });
  const ceiling = canvasHeightAfterDrag({
    startCanvasPx: 900,
    deltaY: 400,
    viewportPx: viewport,
  });
  const minCanvas = usableSplitViewportPx(viewport) * CANVAS_SPLIT_MIN_RATIO;
  const maxCanvas = usableSplitViewportPx(viewport) - PANEL_MIN_HEIGHT_PX;
  assert.equal(floor, Math.round(minCanvas));
  assert.equal(ceiling, Math.round(maxCanvas));
  console.log('ok drag cannot pass canvas or panel min-height clamps');
}

function testTinyViewportKeepsCanvasShare() {
  const viewport = 120;
  const usable = usableSplitViewportPx(viewport);
  const height = clampCanvasSplitHeight({
    viewportPx: viewport,
    requestedCanvasPx: 80,
  });
  assert.equal(height, Math.round(usable * CANVAS_SPLIT_MIN_RATIO));
  assert.ok(height < viewport);
  console.log('ok undersized viewport still reserves the canvas 35% share');
}

function testCustomPanelMinWhenNudgePadVisible() {
  const viewport = 800;
  const panelMin = PANEL_MIN_HEIGHT_PX + NUDGE_PAD_SPLIT_EXTRA_PX;
  const clamped = clampCanvasSplitHeight({
    viewportPx: viewport,
    requestedCanvasPx: 10_000,
    panelMinPx: panelMin,
  });
  assert.equal(usableSplitViewportPx(viewport) - clamped, panelMin);
  console.log('ok extra panel min (nudge pad) is honored');
}

function testNonFiniteInputsDoNotThrow() {
  assert.equal(clampCanvasSplitHeight({ viewportPx: NaN, requestedCanvasPx: 200 }), 0);
  const recovered = canvasHeightAfterDrag({
    startCanvasPx: Number.POSITIVE_INFINITY,
    deltaY: Number.NaN,
    viewportPx: 600,
  });
  assert.ok(Number.isFinite(recovered));
  assert.ok(recovered > 0);
  console.log('ok non-finite pointer math fails closed');
}

function testHitTargetIsAtLeastFortyFour() {
  assert.ok(DIVIDER_HIT_SIZE_PX >= 44);
  console.log('ok divider hit target is at least 44px');
}

function testStoredRatioIsClamped() {
  assert.equal(clampStoredSplitRatio(0.1), CANVAS_SPLIT_MIN_RATIO);
  assert.ok(clampStoredSplitRatio(1) < FULLSCREEN_SNAP_RATIO);
  assert.equal(clampStoredSplitRatio(NaN), DEFAULT_CANVAS_SPLIT_RATIO);
  console.log('ok persisted split ratio stays between 35% and just under snap');
}

function testRestoreUsesRatioAndFullscreen() {
  const viewport = 800;
  const restored = restoreCanvasSplitHeight({
    ratio: 0.7,
    fullscreen: false,
    viewportPx: viewport,
  });
  const usable = usableSplitViewportPx(viewport);
  assert.equal(restored, clampCanvasSplitHeight({
    viewportPx: viewport,
    requestedCanvasPx: usable * 0.7,
  }));

  const maxed = restoreCanvasSplitHeight({
    ratio: 0.55,
    fullscreen: true,
    viewportPx: viewport,
  });
  assert.equal(maxed, usable);
  console.log('ok restore applies stored ratio or full-screen usable height');
}

function testPersistableRatioKeepsLastWhenFullscreen() {
  const viewport = 800;
  const live = persistableSplitRatio({
    canvasPx: defaultCanvasSplitHeight(viewport),
    viewportPx: viewport,
    fullscreen: false,
  });
  assert.ok(Math.abs(live - DEFAULT_CANVAS_SPLIT_RATIO) < 0.02);

  const kept = persistableSplitRatio({
    canvasPx: 900,
    viewportPx: viewport,
    fullscreen: true,
    lastRatio: 0.62,
  });
  assert.equal(kept, 0.62);
  console.log('ok full-screen persist keeps the last restored ratio');
}

function testReleaseSnapsNearNinetyPercent() {
  const viewport = 800;
  const usable = usableSplitViewportPx(viewport);
  const near = resolveSplitRelease({
    canvasPx: usable * 0.91,
    viewportPx: viewport,
  });
  assert.equal(near.fullscreen, true);
  assert.equal(near.snapped, true);
  assert.equal(near.canvasPx, usable);

  const mid = resolveSplitRelease({
    canvasPx: usable * 0.6,
    viewportPx: viewport,
  });
  assert.equal(mid.fullscreen, false);
  assert.equal(mid.snapped, false);
  console.log('ok release near 90% snaps to full-screen; mid split does not');
}

function testWorkspaceHeightTracksSplitImmediately() {
  assert.equal(workspaceHeightFromSplit(400), 400 - STAGE_PADDING_Y_PX);
  assert.equal(workspaceHeightFromSplit(10), 1);
  console.log('ok workspace height follows the split without waiting for onLayout');
}

function testArtboardRefitsWhenSplitGrows() {
  const padW = 320;
  const smallH = workspaceHeightFromSplit(220);
  const largeH = workspaceHeightFromSplit(480);
  const small = fitEditorPadBoard(50, 30, padW, smallH, 28);
  const large = fitEditorPadBoard(50, 30, padW, largeH, 28);
  assert.ok(large.scale > small.scale);
  assert.ok(large.heightPx > small.heightPx);
  assert.ok(large.heightPx <= largeH);
  assert.ok(large.widthPx <= padW);
  const jewelrySmall = fitEditorPadBoard(54, 96, padW, smallH, 28);
  const jewelryLarge = fitEditorPadBoard(54, 96, padW, largeH, 28);
  assert.ok(jewelrySmall.widthPx <= padW);
  assert.ok(jewelryLarge.scale >= jewelrySmall.scale);
  console.log('ok pxPerMm refits and recenters when the split column grows');
}

function main() {
  testUsableViewportSubtractsHitTarget();
  testDefaultGivesCanvasMajority();
  testCanvasCannotShrinkBelowThirtyFivePercent();
  testPanelCannotShrinkBelowMin();
  testInRangeRequestDoesNotJump();
  testPointerDeltaGrowsCanvasDownward();
  testPointerDeltaStopsAtClamps();
  testTinyViewportKeepsCanvasShare();
  testCustomPanelMinWhenNudgePadVisible();
  testNonFiniteInputsDoNotThrow();
  testHitTargetIsAtLeastFortyFour();
  testStoredRatioIsClamped();
  testRestoreUsesRatioAndFullscreen();
  testPersistableRatioKeepsLastWhenFullscreen();
  testReleaseSnapsNearNinetyPercent();
  testWorkspaceHeightTracksSplitImmediately();
  testArtboardRefitsWhenSplitGrows();
  console.log('ALL CANVAS SPLIT TESTS PASSED');
}

main();
