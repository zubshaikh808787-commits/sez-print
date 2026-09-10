import assert from 'node:assert/strict';

import {
  EditorHistory,
  alignBox,
  boxOf,
  duplicateElements,
  finiteMm,
  nudgeBox,
  reorderElements,
  roundMm,
  sanitizeTransform,
  snapBoxToGuides,
} from '../engine';
import { DEFAULT_ELEMENT_STATE } from '../../../components/editor/types';
import type { LabelElement } from '../../label-document';

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

  const toCenter = snapBoxToGuides(19.8, 12, 10, 6, [], { widthMm: 50, heightMm: 30 }, 0.45);
  assert.equal(toCenter.left, 20);

  const other = { left: 20, top: 0, width: 10, height: 8 };
  const toObject = snapBoxToGuides(9.7, 0, 10, 6, [other], { widthMm: 50, heightMm: 30 }, 0.45);
  assert.equal(toObject.left, 10);
  console.log('ok snap to canvas edge, center, and object edge');
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
  console.log('ok sanitizeTransform strips NaN and clamps size/rotation/font');
}

function main() {
  testFiniteMm();
  testHistoryTransactions();
  testSnapGuides();
  testNudgeAndAlign();
  testDuplicateAndZOrder();
  testSanitizeTransform();
  console.log('ALL EDITOR ENGINE TESTS PASSED');
}

main();
