import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundBoxMm,
  capSharedScale,
  resizeMemberByScale,
  sharedScaleLimits,
  type ScaleCapMember,
} from '../resize-policy';
import { MIN_ELEMENT_MM } from '../engine';

const canvas = { widthMm: 50, heightMm: 30 };

test('resizeMemberByScale never moves origin on east width resize', () => {
  const start = { left: 8, top: 6, width: 10, height: 5 };
  const next = resizeMemberByScale({
    start,
    handle: 'e',
    behavior: 'width',
    scaleX: 2,
    scaleY: 1,
    aspect: 2,
    minMm: MIN_ELEMENT_MM,
    canvas,
  });
  assert.equal(next.left, 8);
  assert.equal(next.top, 6);
  assert.equal(next.width, 20);
  assert.equal(next.height, 5);
});

test('resizeMemberByScale never moves origin on south height resize', () => {
  const start = { left: 8, top: 6, width: 10, height: 5 };
  const next = resizeMemberByScale({
    start,
    handle: 's',
    behavior: 'height',
    scaleX: 1,
    scaleY: 2,
    aspect: 2,
    minMm: MIN_ELEMENT_MM,
    canvas,
  });
  assert.equal(next.left, 8);
  assert.equal(next.top, 6);
  assert.equal(next.width, 10);
  assert.equal(next.height, 10);
});

test('resizeMemberByScale square keeps 1:1 and pinned origin', () => {
  const start = { left: 10, top: 4, width: 8, height: 8 };
  const next = resizeMemberByScale({
    start,
    handle: 'e',
    behavior: 'square',
    scaleX: 1.5,
    scaleY: 1,
    aspect: 1,
    minMm: 5,
    canvas,
  });
  assert.equal(next.left, 10);
  assert.equal(next.top, 4);
  assert.equal(next.width, next.height);
  assert.equal(next.width, 12);
});

test('boundBoxMm delegates to resizeMemberByScale (same origin + size)', () => {
  const start = { left: 10, top: 12, width: 15, height: 15 };
  const viaBound = boundBoxMm({
    anchor: 'e',
    behavior: 'square',
    start,
    proposed: { width: 25, height: 15 },
    aspect: 1,
    minMm: 2,
    canvas,
  });
  const viaScale = resizeMemberByScale({
    start,
    handle: 'e',
    behavior: 'square',
    scaleX: 25 / 15,
    scaleY: 15 / 15,
    aspect: 1,
    minMm: 2,
    canvas,
  });
  assert.deepEqual(viaBound, viaScale);
});

test('capSharedScale floors the whole group when any member hits minMm', () => {
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
  // Second member min 5 / 10 = 0.5 is the coupled floor.
  assert.ok(capped.scaleX >= 0.5 - 1e-9);
  const first = resizeMemberByScale({
    start: members[0].start,
    handle: 'e',
    behavior: 'width',
    scaleX: capped.scaleX,
    scaleY: capped.scaleY,
    aspect: 2,
    minMm: 5,
    canvas,
  });
  const second = resizeMemberByScale({
    start: members[1].start,
    handle: 'e',
    behavior: 'square',
    scaleX: capped.scaleX,
    scaleY: capped.scaleY,
    aspect: 1,
    minMm: 5,
    canvas,
  });
  assert.ok(first.width >= 5 - 0.02);
  assert.ok(second.width >= 5 - 0.02);
  assert.equal(second.left, 4);
  assert.equal(second.top, 4);
});

test('group resize of one member equals solo resizeMemberByScale', () => {
  const start = { left: 6, top: 5, width: 12, height: 8 };
  const members: ScaleCapMember[] = [
    { start, minMm: MIN_ELEMENT_MM, behavior: 'width', aspect: 1.5 },
    { start: { left: 20, top: 6, width: 8, height: 8 }, minMm: 5, behavior: 'square', aspect: 1 },
  ];
  const capped = capSharedScale({
    members,
    handle: 'e',
    scaleX: 1.4,
    scaleY: 1,
    canvas,
  });
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
  assert.deepEqual(inGroup, solo);
});

test('sharedScaleLimits match capSharedScale floor/ceil', () => {
  const members: ScaleCapMember[] = [
    { start: { left: 0, top: 0, width: 10, height: 10 }, minMm: 5, behavior: 'square', aspect: 1 },
  ];
  const limits = sharedScaleLimits({ members, handle: 'e', canvas });
  assert.equal(limits.minScale, 0.5);
  const capped = capSharedScale({
    members,
    handle: 'e',
    scaleX: 0.1,
    scaleY: 0.1,
    canvas,
  });
  assert.equal(capped.scaleX, limits.minScale);
});
