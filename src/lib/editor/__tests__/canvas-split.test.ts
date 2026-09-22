import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PANEL_DEFAULT_HEIGHT_PX,
  PANEL_MIN_HEIGHT_PX,
  DIVIDER_HIT_SIZE_PX,
  usableSplitViewportPx,
  clampCanvasSplitHeight,
  defaultCanvasSplitHeight,
  restoreCanvasSplitHeight,
  canvasHeightAfterDrag,
} from '../canvas-split';

test('PANEL_DEFAULT_HEIGHT_PX is 318 and PANEL_MIN_HEIGHT_PX is 48', () => {
  assert.equal(PANEL_DEFAULT_HEIGHT_PX, 318);
  assert.equal(PANEL_MIN_HEIGHT_PX, 48);
});

test('defaultCanvasSplitHeight reserves PANEL_DEFAULT_HEIGHT_PX (318px) for the palette', () => {
  const viewportPx = 700;
  const usable = usableSplitViewportPx(viewportPx, DIVIDER_HIT_SIZE_PX); // 700 - 44 = 656
  const defaultH = defaultCanvasSplitHeight(viewportPx);
  // Default canvas height should be usable - 318 = 656 - 318 = 338
  assert.equal(defaultH, usable - 318);
  // The remaining sheet height is exactly 318px
  assert.equal(usable - defaultH, 318);
});

test('restoreCanvasSplitHeight with null ratio uses PANEL_DEFAULT_HEIGHT_PX', () => {
  const viewportPx = 700;
  const usable = usableSplitViewportPx(viewportPx, DIVIDER_HIT_SIZE_PX); // 656
  const restoredH = restoreCanvasSplitHeight({
    ratio: null,
    fullscreen: false,
    viewportPx,
    panelMinPx: PANEL_MIN_HEIGHT_PX,
    panelDefaultPx: PANEL_DEFAULT_HEIGHT_PX,
  });
  assert.equal(restoredH, usable - 318);
});

test('canvasHeightAfterDrag allows dragging down to PANEL_MIN_HEIGHT_PX (48px sheet / toolbar row)', () => {
  const viewportPx = 700;
  const usable = usableSplitViewportPx(viewportPx, DIVIDER_HIT_SIZE_PX); // 656
  const startCanvasPx = usable - 318; // 338
  // User drags divider down by 500px (expanding canvas, shrinking sheet)
  const maxDragCanvasH = canvasHeightAfterDrag({
    startCanvasPx,
    deltaY: 500,
    viewportPx,
    panelMinPx: PANEL_MIN_HEIGHT_PX,
  });
  // Canvas should be allowed to grow up to usable - PANEL_MIN_HEIGHT_PX (656 - 48 = 608)
  assert.equal(maxDragCanvasH, usable - 48);
  // Sheet is now collapsed to just the toolbar row: 48px!
  assert.equal(usable - maxDragCanvasH, 48);
});

test('canvasHeightAfterDrag allows dragging up to fully cover canvas (0px canvas / full sheet)', () => {
  const viewportPx = 700;
  const usable = usableSplitViewportPx(viewportPx, DIVIDER_HIT_SIZE_PX); // 656
  const startCanvasPx = usable - 318; // 338
  // User drags divider all the way UP by 500px (expanding sheet to cover canvas completely)
  const minDragCanvasH = canvasHeightAfterDrag({
    startCanvasPx,
    deltaY: -500,
    viewportPx,
    panelMinPx: PANEL_MIN_HEIGHT_PX,
  });
  // Canvas should be allowed to shrink to 0px
  assert.equal(minDragCanvasH, 0);
  // Sheet now occupies the entire usable split viewport
  assert.equal(usable - minDragCanvasH, usable);
});

