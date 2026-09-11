import assert from 'node:assert/strict';

import { dragBoundMm } from '../engine';
import {
  applyLiveDragPosition,
  createFrameThrottled,
  idleElementRefsUnchanged,
  splitCanvasLayers,
} from '../drag-layer';
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

function testDragBoundKeepsElementOnArtboard() {
  const canvas = { widthMm: 50, heightMm: 30 };
  const inside = dragBoundMm(12, 8, 10, 6, canvas);
  assert.equal(inside.left, 12);
  assert.equal(inside.top, 8);
  const overflow = dragBoundMm(80, -4, 10, 6, canvas);
  assert.equal(overflow.left, 40);
  assert.equal(overflow.top, 0);
  console.log('ok dragBoundMm clamps to the artboard like dragBoundFunc');
}

function testSplitLiftsOnlyTheActiveElement() {
  const els = Array.from({ length: 12 }, (_, i) => textEl(`e${i}`, i, 0));
  const idle = splitCanvasLayers(els, null);
  assert.equal(idle.content.length, 12);
  assert.equal(idle.active, null);
  const moving = splitCanvasLayers(els, 'e3');
  assert.equal(moving.content.length, 11);
  assert.equal(moving.active?.id, 'e3');
  assert.ok(!moving.content.some((el) => el.id === 'e3'));
  assert.equal(moving.content[0], els[0]);
  console.log('ok active layer lifts one node; content keeps the other eleven');
}

function testLiveDragClonesOnlyTheMover() {
  const els = Array.from({ length: 12 }, (_, i) => textEl(`e${i}`, i, 0));
  const next = applyLiveDragPosition(els, 'e3', 20, 15, { widthMm: 50, heightMm: 30 });
  assert.equal(next[3].left, 20);
  assert.equal(next[3].top, 15);
  assert.notEqual(next[3], els[3]);
  for (let i = 0; i < 12; i += 1) {
    if (i === 3) continue;
    assert.equal(next[i], els[i], `idle ${i} must keep identity`);
  }
  const same = applyLiveDragPosition(next, 'e3', 20, 15, { widthMm: 50, heightMm: 30 });
  assert.equal(same[3], next[3]);
  console.log('ok live drag clones only the moving element');
}

function testIdleRefsUnchangedDuringLiveDrag() {
  const els = Array.from({ length: 12 }, (_, i) => textEl(`e${i}`, i, 0));
  const { content: before } = splitCanvasLayers(els, 'e3');
  const next = applyLiveDragPosition(els, 'e3', 18, 4, { widthMm: 50, heightMm: 30 });
  const { content: after } = splitCanvasLayers(next, 'e3');
  assert.equal(idleElementRefsUnchanged(before, after), true);
  console.log('ok content-layer refs stay frozen while the active node moves');
}

function testFrameThrottleEmitsLatestOnly() {
  const emitted: number[] = [];
  const queue: Array<() => void> = [];
  const pump = createFrameThrottled<number>(
    (value) => {
      emitted.push(value);
    },
    {
      schedule: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancel: () => {
        queue.pop();
      },
    },
  );
  pump.push(1);
  pump.push(2);
  pump.push(3);
  assert.equal(emitted.length, 0);
  assert.equal(queue.length, 1);
  queue[0]();
  assert.deepEqual(emitted, [3]);
  console.log('ok dragmove throttle coalesces to one animation-frame write');
}

function testClampPreservesIdleIdentity() {
  const el = textEl('a', 4, 6, 10, 8);
  const again = clampElementToLabel(el, { widthMm: 50, heightMm: 30 });
  assert.equal(again, el);
  const jewelry = textEl('j', 10, 20, 8, 8);
  const kept = clampElementToLabel(jewelry, { widthMm: 54, heightMm: 96 });
  assert.equal(kept, jewelry);
  console.log('ok clampElementToLabel keeps the same object when already in bounds');
}

function main() {
  testDragBoundKeepsElementOnArtboard();
  testSplitLiftsOnlyTheActiveElement();
  testLiveDragClonesOnlyTheMover();
  testIdleRefsUnchangedDuringLiveDrag();
  testFrameThrottleEmitsLatestOnly();
  testClampPreservesIdleIdentity();
  console.log('ALL DRAG LAYER TESTS PASSED');
}

main();
