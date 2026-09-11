import assert from 'node:assert/strict';

import {
  EditorHistory,
  alignBox,
  boxOf,
  clampBoxOnCanvas,
  duplicateElements,
  finiteMm,
  MIN_ELEMENT_MM,
  nudgeBox,
  pasteElementsFromClipboard,
  copyElementsToClipboard,
  reorderElements,
  roundMm,
  sanitizeTransform,
  snapBoxToGuides,
} from '../engine';
import { DEFAULT_ELEMENT_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';
import { clampElementToLabel } from '../../element-sizing';

function textEl(id: string, left: number, top: number, width = 10, height = 6): LabelElement {
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

function testFiniteMm() {
  assert.equal(finiteMm(12.5), 12.5);
  assert.equal(finiteMm(NaN, 3), 3);
  assert.equal(finiteMm(Infinity, 0), 0);
  assert.equal(finiteMm(-Infinity, 1), 1);
  assert.equal(finiteMm('nope', 4), 4);
  console.log('ok finiteMm rejects NaN/Infinity');
}

function testHistoryTransactions() {
  const history = new EditorHistory(8);
  const a = [textEl('a', 0, 0)];
  const b = [textEl('a', 5, 0)];
  const c = [textEl('a', 9, 0)];

  history.begin(a);
  history.begin(b);
  history.commit();
  assert.equal(history.canUndo, true);
  const undone = history.undo(c);
  assert.ok(undone);
  assert.equal(undone![0].left, 0);
  const redone = history.redo(undone!);
  assert.ok(redone);
  assert.equal(redone![0].left, 9);
  history.pushUndo(redone!);
  const d = [textEl('a', 1, 1)];
  assert.equal(history.canRedo, false);
  console.log('ok EditorHistory one commit per gesture, undo/redo, branch clears redo');
}

function testSnapGuides() {
  const snapped = snapBoxToGuides(0.3, 4.8, 10, 6, [], { widthMm: 50, heightMm: 30 }, 0.45);
  assert.equal(snapped.left, 0);
  assert.equal(snapped.top, 4.8);
  assert.ok(snapped.guides.some((g) => g.axis === 'v' && g.positionMm === 0));

  const toCenter = snapBoxToGuides(19.8, 12, 10, 6, [], { widthMm: 50, heightMm: 30 }, 0.45);
  assert.equal(toCenter.left, 20);
  assert.ok(toCenter.guides.some((g) => g.axis === 'v' && g.positionMm === 25));

  const other = { left: 20, top: 0, width: 10, height: 8 };
  const toObject = snapBoxToGuides(9.7, 0, 10, 6, [other], { widthMm: 50, heightMm: 30 }, 0.45);
  assert.equal(toObject.left, 10);
  assert.ok(toObject.guides.some((g) => g.axis === 'v' && g.positionMm === 20));
  console.log('ok snap to canvas edge, center, and object edge');
}

function testFivePixelCenterSnap() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const near = snapBoxToGuides(19.2, 4, 10, 6, [], canvas, 1.25);
  assert.equal(near.left, 20);
  assert.ok(near.guides.some((g) => g.axis === 'v' && g.positionMm === 25));
  const far = snapBoxToGuides(17, 4, 10, 6, [], canvas, 1.25);
  assert.equal(far.left, 17);
  assert.equal(
    far.guides.some((g) => g.axis === 'v' && g.positionMm === 25),
    false,
  );
  console.log('ok ~5px threshold snaps to horizontal center and ignores farther boxes');
}

function testNudgeAndAlign() {
  const nudged = nudgeBox(1, 1, 10, 6, 0.2, 0, { widthMm: 50, heightMm: 30 });
  assert.equal(nudged.left, 1.2);
  const aligned = alignBox(10, 6, { widthMm: 50, heightMm: 30 }, 'center');
  assert.equal(aligned.left, 20);
  assert.equal(aligned.top, 12);
  console.log('ok nudge 0.2 mm and center align stay in millimetres');
}

function testDuplicateAndZOrder() {
  const els = [textEl('a', 0, 0), textEl('b', 12, 0)];
  els[0].zIndex = 1;
  els[1].zIndex = 2;
  const dup = duplicateElements(els, ['a'], { widthMm: 50, heightMm: 30 });
  assert.equal(dup.newIds.length, 1);
  assert.equal(dup.elements.length, 3);
  assert.notEqual(dup.newIds[0], 'a');
  assert.equal(dup.elements[2].left, 2);

  const front = reorderElements(els, ['a'], 'front');
  const aZ = front.find((e) => e.id === 'a')!.zIndex ?? 0;
  const bZ = front.find((e) => e.id === 'b')!.zIndex ?? 0;
  assert.ok(aZ > bZ);
  console.log('ok duplicate offsets in mm and bring-to-front uses zIndex');
}

function testSanitizeTransform() {
  const bad = sanitizeTransform({
    leftMm: NaN,
    topMm: Infinity,
    widthMm: -8,
    heightMm: 0,
    rotation: 370,
    fontSize: 200,
  });
  assert.equal(bad.leftMm, 0);
  assert.equal(bad.topMm, 0);
  assert.ok(bad.widthMm >= 0.5);
  assert.equal(bad.rotation, 10);
  assert.equal(bad.fontSize, 72);
  assert.equal(roundMm(1.234), 1.23);
  const size = boxOf(textEl('t', 3, 4, 8, 5));
  assert.equal(size.left, 3);
  const tiny = sanitizeTransform({
    leftMm: 48.77,
    topMm: 1.23,
    widthMm: 0.5,
    heightMm: 0.5,
    rotation: 0,
  });
  assert.equal(tiny.widthMm, MIN_ELEMENT_MM);
  assert.equal(tiny.heightMm, MIN_ELEMENT_MM);
  assert.equal(tiny.leftMm, 48.77);
  assert.equal(tiny.topMm, 1.23);
  console.log('ok sanitizeTransform strips NaN and clamps size/rotation/font');
}

function testSmallContentCanSitAnywhere() {
  const canvas = { widthMm: 50, heightMm: 73 };
  const w = 0.5;
  const h = 0.5;
  for (const left of [0, 0.01, 12.34, 24.99, 49.5]) {
    const parked = nudgeBox(left, 10, w, h, 0, 0, canvas);
    assert.equal(parked.left, roundMm(Math.min(canvas.widthMm - w, Math.max(0, left))));
  }
  const corner = nudgeBox(49.5, 72.5, w, h, 0, 0, canvas);
  assert.equal(corner.left, 49.5);
  assert.equal(corner.top, 72.5);

  const clamped = clampBoxOnCanvas(80, -4, 0.5, 0.5, canvas);
  assert.equal(clamped.left, 49.5);
  assert.equal(clamped.top, 0);

  const el = textEl('tiny', 40.25, 60.1, 0.5, 0.5);
  const kept = clampElementToLabel(el, { widthMm: 50, heightMm: 73 });
  assert.equal(kept.width, 0.5);
  assert.ok('height' in kept && kept.height === 0.5);
  assert.equal(kept.left, 40.25);
  assert.equal(kept.top, 60.1);

  const inflated = clampElementToLabel(textEl('edge', 49.5, 72.5, 0.5, 0.5), {
    widthMm: 50,
    heightMm: 73,
  });
  assert.equal(inflated.width, 0.5);
  assert.equal(inflated.left, 49.5);
  assert.equal(inflated.top, 72.5);
  console.log('ok 0.5 mm content can sit anywhere on the artboard');
}

function testPasteTinyStaysOnCanvas() {
  const canvas = { widthMm: 50, heightMm: 73 };
  const source = [textEl('a', 48, 70, 0.5, 0.5)];
  copyElementsToClipboard(source, ['a']);
  const pasted = pasteElementsFromClipboard(source, canvas);
  assert.equal(pasted.newIds.length, 1);
  const clone = pasted.elements[1];
  assert.ok(clone.left + 0.5 <= 50 + 1e-9);
  assert.ok(clone.top + 0.5 <= 73 + 1e-9);
  assert.ok(clone.left >= 0);
  assert.ok(clone.top >= 0);
  console.log('ok paste of 0.5 mm content stays inside the label');
}

function main() {
  testFiniteMm();
  testHistoryTransactions();
  testSnapGuides();
  testFivePixelCenterSnap();
  testNudgeAndAlign();
  testDuplicateAndZOrder();
  testSanitizeTransform();
  testSmallContentCanSitAnywhere();
  testPasteTinyStaysOnCanvas();
  console.log('ALL EDITOR ENGINE TESTS PASSED');
}

main();
