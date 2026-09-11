import assert from 'node:assert/strict';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';
import { MIN_ELEMENT_MM } from '../engine';
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

function testBarcodeWidthOnly() {
  const policy = resizePolicyFor(barcodeEl());
  assert.deepEqual(policy.anchors, ['e']);
  assert.equal(policy.behavior.e, 'width');
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
  console.log('ok barcode right-handle changes width only');
}

function testTextWidthAndHeightIndependent() {
  const policy = resizePolicyFor(textEl());
  assert.deepEqual(policy.anchors, ['e', 's']);
  assert.equal(policy.behavior.e, 'width');
  assert.equal(policy.behavior.s, 'height');
  assert.ok(policy.comment.includes('fontSize'));
  const wider = boundBoxMm({
    anchor: 'e',
    behavior: 'width',
    start: { left: 2, top: 2, width: 20, height: 8 },
    proposed: { width: 28, height: 8 },
    aspect: 2.5,
    minMm: MIN_ELEMENT_MM,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(wider.width, 28);
  assert.equal(wider.height, 8);
  console.log('ok text right-handle changes wrap width without stretching glyphs');
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
  assert.deepEqual(barcode.anchors, ['e']);
  assert.equal(barcode.rotateHandle, true);

  const text = resizePolicyFor(textEl());
  assert.ok(text.comment.includes('fontSize'));
  assert.equal(text.rotateHandle, true);

  const line = resizePolicyFor(stub('line'));
  assert.deepEqual(line.anchors, ['e']);
  assert.equal(line.behavior.e, 'width');

  const shape = resizePolicyFor(stub('shape'));
  assert.deepEqual(shape.anchors, ['e', 's']);
  assert.equal(shape.behavior.e, 'width');
  assert.equal(shape.behavior.s, 'height');
  assert.equal(shape.rotateHandle, true);

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

function main() {
  testImageShowsTwoAnchors();
  testRightHandleKeepsAspect();
  testBottomHandleKeepsAspect();
  testQrStaysSquare();
  testMinSizeFiveMm();
  testBarcodeWidthOnly();
  testTextWidthAndHeightIndependent();
  testJewelryAndCableStayOnTheLabel();
  testUnlockedImageIsAxisResize();
  testPolicyCatalog();
  console.log('ALL RESIZE POLICY TESTS PASSED');
}

main();
