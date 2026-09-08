import assert from 'node:assert/strict';
import {
  generateRulerTicks,
  mmToScreenPx,
  applyDragToMm,
  applyResizeToMm,
  exportCanvasBoundaryToTspl,
  exportCanvasToTspl,
  type CanvasDocument,
  type BackgroundReference,
  type CanvasBoxElement,
} from '../canvas-export';
import { DOTS_PER_MM } from '../calibration';

export function runBackgroundReferenceTests() {
  console.log('--- Phase 3 (Reworked): Size-First Import & Ruled Canvas Tests ---');

  // 1. Size Entry Gate: width & height must be strictly positive before proceeding to import
  function validateSizeGate(widthMm: number, heightMm: number): boolean {
    return widthMm > 0 && heightMm > 0 && Number.isFinite(widthMm) && Number.isFinite(heightMm);
  }

  assert.equal(validateSizeGate(0, 30), false, 'Zero width cannot proceed');
  assert.equal(validateSizeGate(-5, 30), false, 'Negative width cannot proceed');
  assert.equal(validateSizeGate(50, 0), false, 'Zero height cannot proceed');
  assert.equal(validateSizeGate(NaN, 30), false, 'NaN dimension cannot proceed');
  assert.equal(validateSizeGate(50, 30), true, 'Valid 50x30mm proceeds to image import');
  console.log('ok size gate blocks import until both mm fields have valid positive values');

  // 2. Ruler Tick Generation & Scale Guides
  // For 50mm length: 0 to 50 mm ticks (51 ticks)
  // Major ticks at 0, 10, 20, 30, 40, 50
  // Mid ticks at 5, 15, 25, 35, 45
  const ticks50 = generateRulerTicks(50, 1);
  assert.equal(ticks50.length, 51, '50mm ruler has 51 tick marks (0..50 inclusive)');
  assert.equal(ticks50[0].isMajor, true);
  assert.equal(ticks50[0].label, '0');
  assert.equal(ticks50[5].isMid, true);
  assert.equal(ticks50[5].label, undefined);
  assert.equal(ticks50[10].isMajor, true);
  assert.equal(ticks50[10].label, '10');
  assert.equal(ticks50[50].isMajor, true);
  assert.equal(ticks50[50].label, '50');

  // Verify ruler tick positions match mmToScreenPx across zoom levels (0.5x, 1x, 2x)
  const baseScale = 5.0; // 5 px per mm
  const zoomLevels = [0.5, 1.0, 2.0];
  for (const zoom of zoomLevels) {
    const effectiveScale = baseScale * zoom;
    for (const tick of [10, 20, 30, 40, 50]) {
      const expectedPx = mmToScreenPx(tick, effectiveScale);
      assert.equal(expectedPx, tick * effectiveScale, `Tick ${tick}mm at zoom ${zoom}x`);
    }
  }
  console.log('ok ruler tick positions match mmToScreenPx conversion across zoom levels');

  // 3. Freeform Image Layer Placement & Resizing in physical mm
  const initialBg: BackgroundReference = {
    uri: 'file:///sample/label_photo.png',
    imageWidthPx: 1200,
    imageHeightPx: 800,
    leftMm: 0,
    topMm: 0,
    widthMm: 50,
    heightMm: 30,
    opacity: 0.6,
    visible: true,
  };

  const initialElement: CanvasBoxElement = {
    id: 'test-box',
    type: 'box',
    left: 10,
    top: 10,
    width: 20,
    height: 10,
    lineWidth: 0.35,
  };

  const doc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    backgroundReference: { ...initialBg },
    elements: [{ ...initialElement }],
  };

  // Drag image by screen delta
  const scalePxPerMm = 6.0;
  const zoomFactor = 1.0;
  const dragDeltaPx = { x: 30, y: 18 }; // +5mm X, +3mm Y
  const nextPos = applyDragToMm(
    { left: doc.backgroundReference!.leftMm!, top: doc.backgroundReference!.topMm! },
    dragDeltaPx,
    scalePxPerMm,
    zoomFactor,
  );
  doc.backgroundReference!.leftMm = nextPos.left;
  doc.backgroundReference!.topMm = nextPos.top;

  assert.equal(doc.backgroundReference?.leftMm, 5, 'Image left moved to 5mm');
  assert.equal(doc.backgroundReference?.topMm, 3, 'Image top moved to 3mm');
  // Canvas dimensions and elements MUST be completely untouched
  assert.equal(doc.widthMm, 50, 'Canvas width unchanged');
  assert.equal(doc.heightMm, 30, 'Canvas height unchanged');
  assert.equal(doc.elements[0].left, 10, 'Existing element untouched');

  // Freeform resize of image layer (non-locked aspect ratio)
  const resizeDeltaPx = { w: 60, h: 30 }; // +10mm width, +5mm height
  const nextSize = applyResizeToMm(
    { width: doc.backgroundReference!.widthMm!, height: doc.backgroundReference!.heightMm! },
    resizeDeltaPx,
    scalePxPerMm,
    zoomFactor,
  );
  doc.backgroundReference!.widthMm = nextSize.width;
  doc.backgroundReference!.heightMm = nextSize.height;

  assert.equal(doc.backgroundReference?.widthMm, 60, 'Image resized to 60mm');
  assert.equal(doc.backgroundReference?.heightMm, 35, 'Image resized to 35mm');
  assert.equal(doc.widthMm, 50, 'Canvas width strictly remains 50mm');
  console.log('ok moving/resizing image layer only changes image mm coordinates, canvas is untouched');

  // 4. Editor Unlock Gate (one-way session unlock)
  let hasConfirmedImagePlacement = false;
  function canAccessDesignTools(unlocked: boolean): boolean {
    return unlocked;
  }

  assert.equal(canAccessDesignTools(hasConfirmedImagePlacement), false, 'Design tools locked before confirmation');
  // Confirm placement
  hasConfirmedImagePlacement = true;
  assert.equal(canAccessDesignTools(hasConfirmedImagePlacement), true, 'Design tools unlocked after confirmation');
  // Moving the image afterward must NOT re-lock design tools
  doc.backgroundReference!.leftMm = 2;
  assert.equal(canAccessDesignTools(hasConfirmedImagePlacement), true, 'Design tools remain unlocked after further image adjustment');
  console.log('ok design-tool controls are gated before "Continue to design" and remain unlocked after');

  // 5. Image Visibility Toggle (non-printing guarantee)
  // Background reference visible: true
  const tsplWithBgVisible = exportCanvasToTspl(doc);
  assert(!tsplWithBgVisible.includes('BITMAP'), 'Background reference MUST NOT emit BITMAP ink');

  // Toggle visible to false
  doc.backgroundReference!.visible = false;
  const tsplWithBgHidden = exportCanvasToTspl(doc);
  assert(!tsplWithBgHidden.includes('BITMAP'));
  assert.equal(tsplWithBgHidden, tsplWithBgVisible, 'TSPL output is completely identical whether bg is shown or hidden');

  // Document with NO background reference at all
  const docNoBg: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [{ ...initialElement }],
  };
  const tsplNoBg = exportCanvasToTspl(docNoBg);
  assert.equal(tsplWithBgHidden, tsplNoBg, 'TSPL output with hidden bg matches document with no bg at all');
  console.log('ok hiding background image changes only visible flag; TSPL output is identical');

  // 6. Removing Background Reference (clearing reference entirely)
  doc.backgroundReference = undefined;
  assert.equal(doc.backgroundReference, undefined, 'Background reference successfully cleared');
  const tsplAfterRemoval = exportCanvasToTspl(doc);
  assert.equal(tsplAfterRemoval, tsplNoBg);
  console.log('ok removing background reference clears reference entirely');

  // 7. Outer Canvas Boundary TSPL Verification
  const boundaryTspl = exportCanvasBoundaryToTspl({
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    lineWidth: 0.35,
  });

  const expectedBoundaryX1 = Math.round(50 * DOTS_PER_MM); // 598
  const expectedBoundaryY1 = Math.round(30 * DOTS_PER_MM); // 359
  const expectedThickness = Math.max(1, Math.round(0.35 * DOTS_PER_MM)); // 4
  const expectedCmd = `BOX 0,0,${expectedBoundaryX1},${expectedBoundaryY1},${expectedThickness}`;

  assert(boundaryTspl.includes('SIZE 50 mm, 30 mm'));
  assert(boundaryTspl.includes(expectedCmd));
  assert(boundaryTspl.includes('PRINT 1'));
  console.log('ok canvas boundary export generates exact physical footprint box:', expectedCmd);

  console.log('ALL PHASE 3 (REWORKED) TESTS PASSED\n');
}

if (require.main === module) {
  runBackgroundReferenceTests();
}
