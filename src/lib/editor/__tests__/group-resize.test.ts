import test from 'node:test';
import assert from 'node:assert/strict';

import type { LabelElement } from '@/lib/label-document';
import {
  applyGroupResize,
  applyGroupResizeMember,
  buildGroupResizeSnapshots,
  capGroupResizeScales,
  groupFixedOriginFromUnion,
  groupResizeFrameFromSnapshots,
  scaleFactorsFromAnchor,
  selectionHasBlockedRotation,
} from '../group-resize';

const canvas = { widthMm: 57, heightMm: 30 };

function qr(id: string, left: number, top: number, size: number): LabelElement {
  return {
    id,
    type: 'qrcode',
    content: 'abc',
    encodeMode: 'QRCode',
    left,
    top,
    width: size,
    height: size,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
  } as LabelElement;
}

function barcode(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
    id,
    type: 'barcode',
    content: '123456',
    encodeMode: 'CODE-128',
    left,
    top,
    width,
    height,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
  } as LabelElement;
}

function textEl(id: string, left: number, top: number, width: number): LabelElement {
  return {
    id,
    type: 'text',
    text: 'Hello world',
    left,
    top,
    width,
    fontSize: 10,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
    autoTextHeight: true,
    autoWrapping: 'Word',
  } as LabelElement;
}

function shape(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
    id,
    type: 'shape',
    figureShape: 'rectangle',
    fill: false,
    lineWidth: 1,
    roundRadius: 0,
    drawingColorIndex: 0,
    left,
    top,
    width,
    height,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
  } as unknown as LabelElement;
}

test('scaleFactorsFromAnchor uses ratio on E and links square behavior', () => {
  const factors = scaleFactorsFromAnchor({
    anchorStart: { left: 10, top: 5, width: 10, height: 10 },
    anchorProposed: { left: 10, top: 5, width: 12, height: 12 },
    handle: 'e',
    anchorBehavior: 'square',
  });
  assert.equal(factors.scaleX, 1.2);
  assert.equal(factors.scaleY, 1.2);
});

test('scaleFactorsFromAnchor width-only E leaves scaleY at 1', () => {
  const factors = scaleFactorsFromAnchor({
    anchorStart: { left: 3, top: 3, width: 20, height: 8 },
    anchorProposed: { left: 3, top: 3, width: 25, height: 8 },
    handle: 'e',
    anchorBehavior: 'width',
  });
  assert.equal(factors.scaleX, 1.25);
  assert.equal(factors.scaleY, 1);
});

test('group fixed origin is union top-left', () => {
  const origin = groupFixedOriginFromUnion({ left: 3, top: 4, width: 20, height: 12 });
  assert.deepEqual(origin, { left: 3, top: 4 });
});

test('two QRs scale square from group left on E handle', () => {
  const elements = [qr('a', 5, 5, 10), qr('b', 20, 8, 8)];
  const snapshots = buildGroupResizeSnapshots(elements, ['a', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const result = applyGroupResize({
    elements,
    selectedIds: ['a', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.2,
    scaleY: 1,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const a = result.patches.get('a')!;
  const b = result.patches.get('b')!;

  assert.equal(a.width, 12);
  assert.equal(a.height, 12);
  assert.equal(b.width, 9.6);
  assert.equal(b.height, 9.6);
  assert.equal(a.left, 5 + (5 - 5) * 1.2);
  assert.equal(b.left, 5 + (20 - 5) * 1.2);
  assert.equal(a.top, 5);
  assert.equal(b.top, 8);
});

test('QR + barcode on E: QR square, barcode width only', () => {
  const elements = [qr('q', 5, 5, 10), barcode('b', 18, 6, 20, 6)];
  const snapshots = buildGroupResizeSnapshots(elements, ['q', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const result = applyGroupResize({
    elements,
    selectedIds: ['q', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.5,
    scaleY: 1,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const q = result.patches.get('q')!;
  const b = result.patches.get('b')!;

  assert.equal(q.width, 15);
  assert.equal(q.height, 15);
  assert.equal(b.width, 30);
  assert.equal(b.height, 6);
});

test('text auto-height reflows on group E resize', () => {
  const elements = [textEl('t', 4, 4, 15), shape('s', 22, 4, 8, 8)];
  const snapshots = buildGroupResizeSnapshots(elements, ['t', 's']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const before = snapshots.get('t')!;
  const result = applyGroupResize({
    elements,
    selectedIds: ['t', 's'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.5,
    scaleY: 1,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const t = result.patches.get('t')!;
  assert.equal(t.width, before.width * 1.5);
  assert.ok(t.height > 0);
  assert.ok(t.height <= before.height);
});

test('coupled min-size stop caps shrink when QR hits 5mm floor', () => {
  const elements = [qr('a', 5, 5, 6), qr('b', 14, 5, 10)];
  const snapshots = buildGroupResizeSnapshots(elements, ['a', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const capped = capGroupResizeScales({
    elements,
    snapshots,
    selectedIds: ['a', 'b'],
    handle: 'e',
    fixedOrigin,
    proposedScaleX: 0.5,
    proposedScaleY: 1,
    canvas,
  });

  assert.ok(capped.scaleX >= 5 / 6);

  const result = applyGroupResize({
    elements,
    selectedIds: ['a', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 0.5,
    scaleY: 1,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const a = result.patches.get('a')!;
  assert.ok(a.width >= 5);
  assert.ok(a.height >= 5);
});

test('S handle scales height and top from group origin', () => {
  const elements = [barcode('b', 6, 6, 20, 8)];
  const snapshots = buildGroupResizeSnapshots(elements, ['b']);
  const start = snapshots.get('b')!;
  const fixedOrigin = { left: 6, top: 6 };

  const patch = applyGroupResizeMember({
    element: elements[0],
    start,
    fixedOrigin,
    scaleX: 1,
    scaleY: 1.5,
    handle: 's',
  });

  assert.equal(patch.height, 12);
  assert.equal(patch.width, 20);
  assert.equal(patch.top, 6);
  assert.equal(patch.left, 6);
});

test('rotation blocks group resize in v1', () => {
  const rotated = { ...qr('a', 5, 5, 10), rotation: 90 as const };
  const elements = [rotated, qr('b', 18, 5, 8)];
  const snapshots = buildGroupResizeSnapshots(elements, ['a', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  assert.equal(selectionHasBlockedRotation(elements, ['a', 'b']), true);

  const result = applyGroupResize({
    elements,
    selectedIds: ['a', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.2,
    scaleY: 1,
    canvas,
  });

  assert.deepEqual(result, { ok: false, reason: 'rotation' });
});

test('relative horizontal spacing doubles when scaleX is 2', () => {
  const elements = [shape('a', 10, 5, 5, 5), shape('b', 20, 5, 5, 5)];
  const snapshots = buildGroupResizeSnapshots(elements, ['a', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const result = applyGroupResize({
    elements,
    selectedIds: ['a', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 2,
    scaleY: 1,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const a = result.patches.get('a')!;
  const b = result.patches.get('b')!;
  const gapBefore = 20 - (10 + 5);
  const gapAfter = b.left - (a.left + a.width);
  assert.equal(gapAfter, gapBefore * 2);
});

test('E resize with linked scales keeps follower top unchanged', () => {
  const elements = [qr('q', 5, 5, 10), barcode('b', 18, 6, 20, 6)];
  const snapshots = buildGroupResizeSnapshots(elements, ['q', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const result = applyGroupResize({
    elements,
    selectedIds: ['q', 'b'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.2,
    scaleY: 1.2,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const b = result.patches.get('b')!;
  const startB = snapshots.get('b')!;

  assert.equal(b.top, startB.top);
  assert.equal(b.width, startB.width * 1.2);
  assert.equal(b.height, startB.height);
});

test('S resize with linked scales keeps follower left unchanged', () => {
  const elements = [qr('q', 5, 5, 10), barcode('b', 18, 6, 20, 6)];
  const snapshots = buildGroupResizeSnapshots(elements, ['q', 'b']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);

  const result = applyGroupResize({
    elements,
    selectedIds: ['q', 'b'],
    snapshots,
    handle: 's',
    fixedOrigin,
    scaleX: 1.2,
    scaleY: 1.2,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const b = result.patches.get('b')!;
  const startB = snapshots.get('b')!;

  assert.equal(b.left, startB.left);
  assert.ok(Math.abs(b.height - startB.height * 1.2) < 0.01);
  assert.equal(b.width, startB.width);
});

test('anchor group patch repositions on E when not at union left — commit must use boundBoxMm', () => {
  const elements = [qr('a', 5, 5, 10), qr('anchor', 20, 8, 8)];
  const snapshots = buildGroupResizeSnapshots(elements, ['a', 'anchor']);
  const { fixedOrigin } = groupResizeFrameFromSnapshots(elements, snapshots);
  const startAnchor = snapshots.get('anchor')!;

  const result = applyGroupResize({
    elements,
    selectedIds: ['a', 'anchor'],
    snapshots,
    handle: 'e',
    fixedOrigin,
    scaleX: 1.2,
    scaleY: 1.2,
    canvas,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const anchorPatch = result.patches.get('anchor')!;
  const groupFormulaLeft = fixedOrigin.left + (startAnchor.left - fixedOrigin.left) * 1.2;

  assert.equal(anchorPatch.left, groupFormulaLeft);
  assert.notEqual(anchorPatch.left, startAnchor.left);

  const boundBoxLeft = startAnchor.left;
  assert.equal(boundBoxLeft, 20);
  assert.notEqual(anchorPatch.left, boundBoxLeft);
});

test('border and lockMovement are excluded from snapshots', () => {
  const elements = [
    qr('q', 5, 5, 8),
    {
      id: 'border',
      type: 'border',
      borderStyle: 'Rectangle',
      left: 0,
      top: 0,
      width: 57,
      height: 30,
      rotation: 0,
      lockMovement: true,
      needPrinting: true,
      lineWidth: 1,
      drawingColorIndex: 0,
    } as unknown as LabelElement,
    { ...qr('locked', 15, 5, 8), lockMovement: true } as LabelElement,
  ];

  const snapshots = buildGroupResizeSnapshots(elements, ['q', 'border', 'locked']);
  assert.equal(snapshots.size, 1);
  assert.ok(snapshots.has('q'));
});
