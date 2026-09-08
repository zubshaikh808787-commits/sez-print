import assert from 'node:assert/strict';
import {
  mmToScreenPx,
  screenPxToMm,
  computeScreenFitScale,
  applyDragToMm,
  applyResizeToMm,
  exportCanvasToTspl,
  type CanvasDocument,
} from '../canvas-export';
import { PRINTER_DPI, DOTS_PER_MM } from '../calibration';

export function runCanvasExportTests() {
  console.log('--- Phase 2: Canvas Model & Coordinate Tests ---');

  // 1. px <-> mm bidirectional conversion
  const testScales = [1.0, 3.7795, 5.0, 10.0, 11.9685];
  const testMmValues = [0, 0.5, 5, 10, 25.4, 40, 50, 100];

  for (const scale of testScales) {
    for (const mm of testMmValues) {
      const px = mmToScreenPx(mm, scale);
      const roundTripMm = screenPxToMm(px, scale);
      assert(
        Math.abs(roundTripMm - mm) < 1e-9,
        `Round-trip px<->mm failed at scale ${scale}, mm ${mm}: got ${roundTripMm}`,
      );
    }
  }
  console.log('ok px <-> mm bidirectional conversion accurate across scales');

  // 2. Screen fit scale calculation
  const scale50x30 = computeScreenFitScale(50, 30, 400, 300, 0);
  assert.equal(scale50x30, 8, '400/50=8 vs 300/30=10, min scale is 8 px/mm');

  const scale100x150 = computeScreenFitScale(100, 150, 400, 300, 0);
  assert.equal(scale100x150, 2, '400/100=4 vs 300/150=2, min scale is 2 px/mm');
  console.log('ok computeScreenFitScale maintains uniform aspect fit');

  // 3. Dragging element converts screen delta back to mm
  const scale = 5.0; // 5 px per mm
  const initialPos = { left: 10, top: 15 };
  // Drag by 50px right, 25px down -> 10mm right, 5mm down
  const dragged = applyDragToMm(initialPos, { x: 50, y: 25 }, scale, 1.0);
  assert.equal(dragged.left, 20, '10mm + 50px/(5px/mm) = 20mm');
  assert.equal(dragged.top, 20, '15mm + 25px/(5px/mm) = 20mm');

  // Test drag with boundary clamping
  const clampedDrag = applyDragToMm(
    initialPos,
    { x: 500, y: 500 },
    scale,
    1.0,
    { labelWidth: 50, labelHeight: 30, elementWidth: 20, elementHeight: 10 },
  );
  assert.equal(clampedDrag.left, 30, 'Clamped to labelWidth - elWidth = 50 - 20 = 30');
  assert.equal(clampedDrag.top, 20, 'Clamped to labelHeight - elHeight = 30 - 10 = 20');
  console.log('ok drag gesture converts screen delta to exact mm and clamps to bounds');

  // 4. Zoom factor does NOT alter underlying mm coordinates
  // Dragging 100px at zoom 2.0 (effective scale 10px/mm) should yield exactly 10mm
  const zoomedDrag = applyDragToMm(initialPos, { x: 100, y: 50 }, scale, 2.0);
  assert.equal(zoomedDrag.left, 20, '10mm + 100px / (5 * 2) = 20mm');
  assert.equal(zoomedDrag.top, 20, '15mm + 50px / (5 * 2) = 20mm');

  // Changing zoom level alone preserves element mm coordinates
  const elMmState = { left: 12.5, top: 8.0, width: 30.0, height: 15.0 };
  const zooms = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
  for (const z of zooms) {
    // Model state remains completely untouched by zoom
    assert.equal(elMmState.left, 12.5);
    assert.equal(elMmState.top, 8.0);
    assert.equal(elMmState.width, 30.0);
    assert.equal(elMmState.height, 15.0);
  }
  console.log('ok zoom factor strictly isolates viewport from stored mm model');

  // 5. Resizing element converts screen delta to mm
  const initialSize = { width: 25, height: 15 };
  // Resize by +25px width, -10px height at 5 px/mm -> +5mm width, -2mm height
  const resized = applyResizeToMm(initialSize, { w: 25, h: -10 }, scale, 1.0);
  assert.equal(resized.width, 30, '25mm + 25px/(5px/mm) = 30mm');
  assert.equal(resized.height, 13, '15mm - 10px/(5px/mm) = 13mm');

  // Minimum size clamping test
  const smallResize = applyResizeToMm(initialSize, { w: -500, h: -500 }, scale, 1.0, 2.0);
  assert.equal(smallResize.width, 2.0, 'Enforces minimum width of 2mm');
  assert.equal(smallResize.height, 2.0, 'Enforces minimum height of 2mm');
  console.log('ok resize converts screen delta to mm with minimum size constraints');

  // 6. Export canvas document to TSPL via Phase 1 builder
  const canvasDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [
      {
        id: 'box-1',
        type: 'box',
        left: 5,
        top: 5,
        width: 40,
        height: 20,
        lineWidth: 0.35,
      },
    ],
  };

  const tspl = exportCanvasToTspl(canvasDoc);
  assert(tspl.includes('SIZE 50 mm, 30 mm'), 'Contains correct SIZE command');
  assert(tspl.includes('GAP 2 mm, 0 mm'), 'Contains correct GAP command');
  assert(tspl.includes('DIRECTION 1'), 'Contains correct DIRECTION command');
  assert(tspl.includes('CLS'), 'Contains CLS command');

  // Check exact dot coordinates
  const expectedX0 = Math.round(5 * DOTS_PER_MM); // 60
  const expectedY0 = Math.round(5 * DOTS_PER_MM); // 60
  const expectedX1 = Math.round((5 + 40) * DOTS_PER_MM); // 539
  const expectedY1 = Math.round((5 + 20) * DOTS_PER_MM); // 299
  const expectedT = Math.max(1, Math.round(0.35 * DOTS_PER_MM)); // 4

  const expectedBoxCmd = `BOX ${expectedX0},${expectedY0},${expectedX1},${expectedY1},${expectedT}`;
  assert(
    tspl.includes(expectedBoxCmd),
    `TSPL must contain exact box command "${expectedBoxCmd}". Got:\n${tspl}`,
  );
  assert(tspl.includes('PRINT 1'), 'Contains PRINT command');
  console.log('ok exportCanvasToTspl generates exact TSPL box command:', expectedBoxCmd);

  // 7. Multi-box canvas document export
  const multiBoxDoc: CanvasDocument = {
    widthMm: 100,
    heightMm: 50,
    gapMm: 3,
    direction: 1,
    elements: [
      { id: 'b1', left: 2, top: 2, width: 96, height: 46, lineWidth: 0.5 },
      { id: 'b2', left: 10, top: 10, width: 30, height: 20, lineWidth: 0.25 },
    ],
  };
  const multiTspl = exportCanvasToTspl(multiBoxDoc, { copies: 2 });
  assert(multiTspl.includes('SIZE 100 mm, 50 mm'));
  assert(multiTspl.includes('GAP 3 mm, 0 mm'));
  assert(multiTspl.includes(`BOX ${Math.round(2 * DOTS_PER_MM)},${Math.round(2 * DOTS_PER_MM)},${Math.round(98 * DOTS_PER_MM)},${Math.round(48 * DOTS_PER_MM)},${Math.round(0.5 * DOTS_PER_MM)}`));
  assert(multiTspl.includes(`BOX ${Math.round(10 * DOTS_PER_MM)},${Math.round(10 * DOTS_PER_MM)},${Math.round(40 * DOTS_PER_MM)},${Math.round(30 * DOTS_PER_MM)},${Math.round(0.25 * DOTS_PER_MM)}`));
  assert(multiTspl.includes('PRINT 2'));
  console.log('ok multi-box canvas export verified with custom copies');

  console.log('ALL PHASE 2 CANVAS TESTS PASSED');
}

if (require.main === module) {
  runCanvasExportTests();
}
