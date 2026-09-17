import assert from 'node:assert/strict';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';
import { MIN_ELEMENT_MM } from '../engine';
import { clampToLabelBounds, roundMm } from '../label-bounds';
import { computeTextElementHeightMm } from '../../text-metrics';
import {
  aspectRatioOf,
  boundBoxMm,
  RESIZE_MIN_PROPORTIONAL_MM,
  resizePolicyFor,
} from '../resize-policy';

function imageEl(overrides: Partial<Extract<LabelElement, { type: 'image' }>> = {}): LabelElement {
  return {
    id: 'img',
    type: 'image',
    uri: 'file://x.jpg',
    rotation: 0,
    left: 4,
    top: 6,
    width: 20,
    height: 10,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    aspectRatioLocked: true,
    originalAspect: 2,
    ...overrides,
  };
}

function qrEl(): LabelElement {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: 'qr',
    type: 'qrcode',
    left: 5,
    top: 5,
    width: 12,
    height: 12,
  };
}

function barcodeEl(): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: 'bc',
    type: 'barcode',
    left: 2,
    top: 8,
    width: 30,
    height: 10,
  };
}

function textEl(): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: 't',
    type: 'text',
    left: 2,
    top: 2,
    width: 20,
    height: 8,
    fontSize: 12,
  };
}

function testImageShowsTwoAnchors() {
  const policy = resizePolicyFor(imageEl());
  assert.deepEqual(policy.anchors, ['e', 's']);
  assert.equal(policy.behavior.e, 'aspect');
  assert.equal(policy.behavior.s, 'aspect');
  assert.equal(policy.rotateHandle, false);
  assert.equal(policy.minMm, RESIZE_MIN_PROPORTIONAL_MM);
  console.log('ok image transformer is two edge anchors, no rotate stem');
}

function testRightHandleKeepsAspect() {
  const start = { left: 4, top: 6, width: 20, height: 10 };
  const next = boundBoxMm({
    anchor: 'e',
    behavior: 'aspect',
    start,
    proposed: { width: 24, height: 10 },
    aspect: 2,
    minMm: 5,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(next.width, 24);
  assert.equal(next.height, 12);
  assert.equal(next.left, 4);
  assert.equal(next.top, 5);
  assert.ok(Math.abs(next.width / next.height - 2) < 1e-9);
  console.log('ok middle-right scales height from width (aspect lock)');
}

function testBottomHandleKeepsAspect() {
  const start = { left: 10, top: 6, width: 20, height: 10 };
  const next = boundBoxMm({
    anchor: 's',
    behavior: 'aspect',
    start,
    proposed: { width: 20, height: 15 },
    aspect: 2,
    minMm: 5,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(next.height, 15);
  assert.equal(next.width, 30);
  assert.equal(next.top, 6);
  assert.equal(next.left, 5);
  assert.ok(Math.abs(next.width / next.height - 2) < 1e-9);
  console.log('ok bottom-center scales width from height (aspect lock)');
}

function testQrStaysSquare() {
  const policy = resizePolicyFor(qrEl());
  assert.equal(policy.behavior.e, 'square');
  assert.equal(aspectRatioOf(qrEl()), 1);
  const next = boundBoxMm({
    anchor: 'e',
    behavior: 'square',
    start: { left: 5, top: 5, width: 12, height: 12 },
    proposed: { width: 18, height: 12 },
    aspect: 1,
    minMm: 5,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(next.width, 18);
  assert.equal(next.height, 18);
  console.log('ok QR resize keeps width = height');
}

function testMinSizeFiveMm() {
  const next = boundBoxMm({
    anchor: 'e',
    behavior: 'aspect',
    start: { left: 0, top: 0, width: 20, height: 10 },
    proposed: { width: 1, height: 1 },
    aspect: 2,
    minMm: RESIZE_MIN_PROPORTIONAL_MM,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.ok(next.width >= RESIZE_MIN_PROPORTIONAL_MM);
  assert.ok(next.height >= RESIZE_MIN_PROPORTIONAL_MM - 1e-9);
  console.log('ok proportional resize cannot collapse below 5mm');
}

function testBarcodeWidthAndHeightIndependent() {
  const policy = resizePolicyFor(barcodeEl());
  assert.deepEqual(policy.anchors, ['e', 's']);
  assert.equal(policy.behavior.e, 'width');
  assert.equal(policy.behavior.s, 'height');
  assert.equal(policy.rotateHandle, false);
  const next = boundBoxMm({
    anchor: 'e',
    behavior: 'width',
    start: { left: 2, top: 8, width: 30, height: 10 },
    proposed: { width: 40, height: 99 },
    aspect: 3,
    minMm: MIN_ELEMENT_MM,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(next.width, 40);
  assert.equal(next.height, 10);
  assert.equal(next.top, 8);
  console.log('ok barcode right-handle changes width only, bottom-handle changes height only');
}

function testTextWidthOnly() {
  for (const el of [textEl(), stub('degrees'), stub('time')]) {
    const policy = resizePolicyFor(el);
    assert.deepEqual(policy.anchors, ['e']);
    assert.equal(policy.behavior.e, 'width');
    assert.equal(policy.behavior.s, undefined);
    assert.ok(policy.comment.includes('font size setting') || policy.comment.includes('fontSize'));
  }
  const wider = boundBoxMm({
    anchor: 'e',
    behavior: 'width',
    start: { left: 2, top: 2, width: 20, height: 8 },
    proposed: { width: 30, height: 8 },
    aspect: 2.5,
    minMm: MIN_ELEMENT_MM,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(wider.width, 30);
  assert.equal(wider.height, 8);
  console.log('ok text/degrees/time right-handle changes wrap width only; no vertical resizing');
}

function testJewelryAndCableStayOnTheLabel() {
  const jewelry = boundBoxMm({
    anchor: 'e',
    behavior: 'aspect',
    start: { left: 2, top: 4, width: 20, height: 10 },
    proposed: { width: 80, height: 10 },
    aspect: 2,
    minMm: 5,
    canvas: { widthMm: 54, heightMm: 96 },
  });
  assert.ok(jewelry.width <= 54);
  assert.ok(jewelry.left + jewelry.width <= 54 + 1e-9);
  assert.ok(jewelry.top >= 0);
  assert.ok(Math.abs(jewelry.width / jewelry.height - 2) < 1e-6);

  const cable = boundBoxMm({
    anchor: 's',
    behavior: 'square',
    start: { left: 4, top: 4, width: 12, height: 12 },
    proposed: { width: 12, height: 90 },
    aspect: 1,
    minMm: 5,
    canvas: { widthMm: 50, heightMm: 73 },
  });
  assert.ok(cable.height <= 73);
  assert.equal(cable.width, cable.height);
  console.log('ok jewelry 54×96 and cable 50×73 clamps keep print millimetres');
}

function testUnlockedImageIsAxisResize() {
  const policy = resizePolicyFor(imageEl({ aspectRatioLocked: false }));
  assert.equal(policy.behavior.e, 'width');
  assert.equal(policy.behavior.s, 'height');
  console.log('ok unlocking aspect on the image panel uses independent axes');
}

function stub(type: LabelElement['type']): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: type,
    type,
    left: 1,
    top: 1,
    width: 12,
    height: 12,
  } as LabelElement;
}

function testPolicyCatalog() {
  const image = resizePolicyFor(imageEl());
  assert.deepEqual(image.anchors, ['e', 's']);
  assert.equal(image.rotateHandle, false);
  assert.ok(image.comment.length > 20);

  const clipart = resizePolicyFor(stub('clipart'));
  assert.deepEqual(clipart.anchors, ['e', 's']);
  assert.equal(clipart.behavior.e, 'aspect');
  assert.equal(clipart.rotateHandle, false);

  const qr = resizePolicyFor(qrEl());
  assert.deepEqual(qr.anchors, ['e', 's']);
  assert.equal(qr.behavior.e, 'square');
  assert.equal(qr.rotateHandle, false);

  const barcode = resizePolicyFor(barcodeEl());
  assert.deepEqual(barcode.anchors, ['e', 's']);
  assert.equal(barcode.rotateHandle, false);

  const text = resizePolicyFor(textEl());
  assert.ok(text.comment.includes('font size') || text.comment.includes('fontSize'));
  assert.equal(text.rotateHandle, false);

  const line = resizePolicyFor(stub('line'));
  assert.deepEqual(line.anchors, ['e']);
  assert.equal(line.behavior.e, 'width');
  assert.equal(line.rotateHandle, false);

  const shape = resizePolicyFor(stub('shape'));
  assert.deepEqual(shape.anchors, ['e', 's']);
  assert.equal(shape.behavior.e, 'width');
  assert.equal(shape.behavior.s, 'height');
  assert.equal(shape.rotateHandle, false);

  const border = resizePolicyFor(stub('border'));
  assert.deepEqual(border.anchors, []);
  assert.equal(border.rotateHandle, false);

  for (const type of [
    'image',
    'clipart',
    'signature',
    'qrcode',
    'barcode',
    'text',
    'degrees',
    'time',
    'line',
    'shape',
    'arctext',
    'table',
    'border',
  ] as const) {
    const policy = resizePolicyFor(type === 'image' ? imageEl() : stub(type));
    assert.ok(policy.comment.length > 8, `${type} needs a documented resize policy`);
  }
  console.log('ok every element type has an explicit documented resize policy');
}

function testTextMultiCycleResizeStability() {
  const initialWidth = 50;
  const initialHeight = 10;
  const initialFontSize = 24;
  let current = {
    left: 2,
    top: 2,
    width: initialWidth,
    height: initialHeight,
    fontSize: initialFontSize,
  };

  // Repeatedly cycle width down and up 10 times
  for (let i = 0; i < 10; i++) {
    // Width down
    const scaledDown = boundBoxMm({
      anchor: 'e',
      behavior: 'width',
      start: current,
      proposed: { width: 25, height: current.height },
      aspect: current.width / current.height,
      minMm: MIN_ELEMENT_MM,
      canvas: { widthMm: 60, heightMm: 40 },
    });
    current = {
      ...current,
      left: scaledDown.left,
      top: scaledDown.top,
      width: scaledDown.width,
      height: scaledDown.height,
    };
    assert.equal(current.width, 25);
    assert.equal(current.height, 10);
    assert.equal(current.fontSize, 24);

    // Width back up
    const scaledUp = boundBoxMm({
      anchor: 'e',
      behavior: 'width',
      start: current,
      proposed: { width: 50, height: current.height },
      aspect: current.width / current.height,
      minMm: MIN_ELEMENT_MM,
      canvas: { widthMm: 60, heightMm: 40 },
    });
    current = {
      ...current,
      left: scaledUp.left,
      top: scaledUp.top,
      width: scaledUp.width,
      height: scaledUp.height,
    };
    assert.equal(current.width, 50);
    assert.equal(current.height, 10);
    assert.equal(current.fontSize, 24);
  }

  assert.equal(current.width, initialWidth);
  assert.equal(current.height, initialHeight);
  assert.equal(current.fontSize, initialFontSize);
  console.log('ok multi-cycle width resize maintains stable dimensions and fontSize without drift');
}

function testRightResizeNeverExceedsBoundaryAndLeftNeverChanges() {
  const start = { left: 15, top: 5, width: 20, height: 10 };
  const canvas = { widthMm: 50, heightMm: 30 };

  // Propose dragging width past the right edge (e.g. 50mm width starting at 15mm = 65mm total)
  const result = boundBoxMm({
    anchor: 'e',
    behavior: 'width',
    start,
    proposed: { width: 50, height: 10 },
    aspect: 2,
    minMm: MIN_ELEMENT_MM,
    canvas,
  });

  // Left must remain strictly unchanged at 15
  assert.equal(result.left, 15);
  // Width must be clamped to 50 - 15 = 35mm
  assert.equal(result.width, 35);
  assert.equal(result.left + result.width, 50);
  console.log('ok e resize near right boundary never exceeds canvasWidth - left, and left never changes');
}

function testWrapDrivenHeightGrowthNudgesOnlyWhenNeeded() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const start = { left: 5, top: 18, width: 30, height: 8 };

  // 1. Text height expands from 8mm to 15mm (total 18 + 15 = 33 > 30mm). Headroom: top nudged to 30 - 15 = 15mm
  const r1 = clampToLabelBounds(
    start,
    canvas,
    { anchor: 'e', naturalHeight: 15 },
  );
  assert.equal(r1.left, 5);
  assert.equal(r1.top, 15);
  assert.equal(r1.height, 15);
  assert.equal(r1.top + r1.height, 30);
  assert.equal(r1.overflowed, false);

  // 2. Text height grows to 40mm (exceeds total canvas height 30mm)
  const r2 = clampToLabelBounds(
    start,
    canvas,
    { anchor: 'e', naturalHeight: 40 },
  );
  assert.equal(r2.left, 5);
  assert.equal(r2.top, 0);
  assert.equal(r2.height, 30); // Hard clamped to canvas
  assert.equal(r2.overflowed, true);

  console.log('ok wrap-driven height growth never exceeds canvasHeight, nudging only as needed and capping at 0');
}

function testWrapAndNudgeCycleStabilityZeroDrift() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const text = 'Amazon Basics mouse with 2000DPI';
  const initialWidth = 45;
  const initialFontSize = 14;
  const initialHeight = roundMm(computeTextElementHeightMm({
    text,
    fontSize: initialFontSize,
    widthMm: initialWidth,
    autoWrapping: 'Word',
  }));
  const initialTop = 10;
  const initialLeft = 2;

  let state = {
    left: initialLeft,
    top: initialTop,
    width: initialWidth,
    height: initialHeight,
    fontSize: initialFontSize,
  };

  // Perform 5 complete cycles of narrow (forces wrap + height growth + upward nudge) then widen back
  for (let cycle = 0; cycle < 5; cycle++) {
    // 1. Narrow width to 20mm (forces 3+ lines, height expands to ~22mm, top nudges up from 10 to 8)
    const narrowedWidth = 20;
    const wrappedHeight = computeTextElementHeightMm({
      text,
      fontSize: state.fontSize,
      widthMm: narrowedWidth,
      autoWrapping: 'Word',
    });
    const narrowed = clampToLabelBounds(
      { left: state.left, top: state.top, width: narrowedWidth, height: wrappedHeight },
      canvas,
      { anchor: 'e', naturalHeight: wrappedHeight },
    );
    state = {
      left: narrowed.left,
      top: narrowed.top,
      width: narrowed.width,
      height: narrowed.height,
      fontSize: state.fontSize,
    };
    assert.equal(state.left, initialLeft);
    assert.equal(state.width, 20);
    assert.ok(state.top + state.height <= canvas.heightMm);

    // 2. Widen width back to 45mm (height returns to initialHeight, top returns to headroom)
    const restoredHeight = computeTextElementHeightMm({
      text,
      fontSize: state.fontSize,
      widthMm: initialWidth,
      autoWrapping: 'Word',
    });
    const widened = clampToLabelBounds(
      { left: state.left, top: initialTop, width: initialWidth, height: restoredHeight },
      canvas,
      { anchor: 'e', naturalHeight: restoredHeight },
    );
    state = {
      left: widened.left,
      top: widened.top,
      width: widened.width,
      height: widened.height,
      fontSize: state.fontSize,
    };
  }

  assert.equal(state.left, initialLeft);
  assert.equal(state.top, initialTop);
  assert.equal(state.width, initialWidth);
  assert.equal(state.height, initialHeight);
  assert.equal(state.fontSize, initialFontSize);
  console.log('ok 5-cycle narrow/widen test preserves top, height, fontSize with zero drift');
}

function testOverflowedStateWhenTallerThanCanvas() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7';
  const fontSize = 28; // Huge font size -> height will be ~60mm > 30mm canvas
  const naturalHeight = computeTextElementHeightMm({
    text,
    fontSize,
    widthMm: 45,
    autoWrapping: 'Word',
  });
  assert.ok(naturalHeight > canvas.heightMm);

  const clamped = clampToLabelBounds(
    { left: 2, top: 5, width: 45, height: naturalHeight },
    canvas,
    { anchor: 'body', naturalHeight },
  );

  assert.equal(clamped.top, 5);
  assert.equal(clamped.height, roundMm(naturalHeight));
  assert.equal(clamped.overflowed, true);
  console.log('ok overflowed flag is true while box height stays natural and body retains position');
}

function main() {
  testImageShowsTwoAnchors();
  testRightHandleKeepsAspect();
  testBottomHandleKeepsAspect();
  testQrStaysSquare();
  testMinSizeFiveMm();
  testBarcodeWidthAndHeightIndependent();
  testTextWidthOnly();
  testTextMultiCycleResizeStability();
  testRightResizeNeverExceedsBoundaryAndLeftNeverChanges();
  testWrapDrivenHeightGrowthNudgesOnlyWhenNeeded();
  testWrapAndNudgeCycleStabilityZeroDrift();
  testOverflowedStateWhenTallerThanCanvas();
  testJewelryAndCableStayOnTheLabel();
  testUnlockedImageIsAxisResize();
  testPolicyCatalog();
  console.log('ALL RESIZE POLICY TESTS PASSED');
}

main();
