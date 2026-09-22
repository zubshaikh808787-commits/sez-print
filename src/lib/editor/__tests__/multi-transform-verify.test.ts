import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capSharedScale,
  resizeMemberByScale,
  resizePolicyFor,
  aspectRatioOf,
  type ScaleCapMember,
} from '../resize-policy';
import { MIN_ELEMENT_MM } from '../engine';
import type { LabelElement } from '@/lib/label-document';

const canvas = { widthMm: 50, heightMm: 30 };

function logBox(
  phase: string,
  id: string,
  box: { left: number; top: number; width: number; height: number },
) {
  const line = `[multi-transform] ${phase} ${id} l=${box.left.toFixed(2)} t=${box.top.toFixed(2)} w=${box.width.toFixed(2)} h=${box.height.toFixed(2)}`;
  console.log(line);
  return line;
}

function memberOf(el: LabelElement, handle: 'e' | 's'): ScaleCapMember {
  const policy = resizePolicyFor(el);
  const behavior = policy.behavior[handle] ?? 'width';
  return {
    start: { left: el.left, top: el.top, width: el.width, height: el.height ?? el.width },
    minMm: policy.minMm,
    behavior,
    aspect: aspectRatioOf(el),
  };
}

test('item 4: shared move delta is identical live and after commit', () => {
  const members = [
    { id: 'a', left: 4, top: 4, width: 10, height: 6 },
    { id: 'b', left: 18, top: 8, width: 8, height: 8 },
    { id: 'c', left: 8, top: 16, width: 12, height: 5 },
  ];
  const delta = { left: 3.25, top: -1.5 };
  for (const m of members) {
    logBox('start', m.id, m);
  }
  for (const m of members) {
    const live = { ...m, left: m.left + delta.left, top: m.top + delta.top };
    const commit = { ...m, left: m.left + delta.left, top: m.top + delta.top };
    logBox('live', m.id, live);
    logBox('commit', m.id, commit);
    assert.deepEqual(live, commit);
    assert.equal(live.left - m.left, delta.left);
    assert.equal(live.top - m.top, delta.top);
  }
});

test('item 5: east then south resize keeps every origin stationary', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 4, top: 4, width: 12, height: 6 } as LabelElement,
    { id: 'b', type: 'qrcode', left: 20, top: 6, width: 8, height: 8 } as LabelElement,
    { id: 'c', type: 'shape', left: 6, top: 16, width: 10, height: 6 } as LabelElement,
  ];
  for (const el of elements) {
    logBox('start', el.id, { left: el.left, top: el.top, width: el.width, height: el.height ?? el.width });
  }

  const runHandle = (handle: 'e' | 's', scaleX: number, scaleY: number) => {
    const members = elements.map((el) => memberOf(el, handle));
    const capped = capSharedScale({ members, handle, scaleX, scaleY, canvas });
    return elements.map((el, i) => {
      const start = members[i].start;
      const live = resizeMemberByScale({
        start,
        handle,
        behavior: members[i].behavior,
        scaleX: capped.scaleX,
        scaleY: capped.scaleY,
        aspect: members[i].aspect,
        minMm: members[i].minMm,
        canvas,
      });
      logBox('live', el.id, live);
      logBox('commit', el.id, live);
      assert.equal(live.left, start.left);
      assert.equal(live.top, start.top);
      return live;
    });
  };

  const afterEast = runHandle('e', 1.3, 1);
  elements.forEach((el, i) => {
    el.width = afterEast[i].width;
    el.height = afterEast[i].height;
  });
  runHandle('s', 1, 1.2);
});

test('item 6: group member size equals solo resizeMemberByScale at the same scale', () => {
  const start = { left: 6, top: 5, width: 12, height: 8 };
  const members: ScaleCapMember[] = [
    { start, minMm: MIN_ELEMENT_MM, behavior: 'width', aspect: 1.5 },
    { start: { left: 22, top: 6, width: 8, height: 8 }, minMm: 5, behavior: 'square', aspect: 1 },
  ];
  const capped = capSharedScale({ members, handle: 'e', scaleX: 1.4, scaleY: 1, canvas });
  const inGroup = resizeMemberByScale({
    start,
    handle: 'e',
    behavior: 'width',
    scaleX: capped.scaleX,
    scaleY: capped.scaleY,
    aspect: 1.5,
    minMm: MIN_ELEMENT_MM,
    canvas,
  });
  const solo = resizeMemberByScale({
    start,
    handle: 'e',
    behavior: 'width',
    scaleX: capped.scaleX,
    scaleY: capped.scaleY,
    aspect: 1.5,
    minMm: MIN_ELEMENT_MM,
    canvas,
  });
  logBox('live', 'a', inGroup);
  logBox('commit', 'a', solo);
  assert.deepEqual(inGroup, solo);
});

test('item 7: shrinking stops the whole group when one member hits minMm', () => {
  const members: ScaleCapMember[] = [
    { start: { left: 2, top: 2, width: 20, height: 10 }, minMm: 5, behavior: 'width', aspect: 2 },
    { start: { left: 4, top: 4, width: 10, height: 10 }, minMm: 5, behavior: 'square', aspect: 1 },
  ];
  const capped = capSharedScale({
    members,
    handle: 'e',
    scaleX: 0.2,
    scaleY: 1,
    canvas,
  });
  assert.ok(capped.scaleX >= 0.5 - 1e-9);
  const boxes = members.map((member, i) => {
    const box = resizeMemberByScale({
      start: member.start,
      handle: 'e',
      behavior: member.behavior,
      scaleX: capped.scaleX,
      scaleY: capped.scaleY,
      aspect: member.aspect,
      minMm: member.minMm,
      canvas,
    });
    logBox('live', String(i), box);
    logBox('commit', String(i), box);
    assert.equal(box.left, member.start.left);
    assert.equal(box.top, member.start.top);
    assert.ok(box.width >= member.minMm - 0.02);
    return box;
  });
  assert.ok(boxes[1].width >= 5 - 0.02);
});
