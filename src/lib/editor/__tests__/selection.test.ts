import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alignGroupBounds,
  clearSelection,
  reduceTapSelect,
  selectionFromIds,
  unionBounds,
} from '../selection';
import type { LabelElement } from '@/lib/label-document';

test('reduceTapSelect single mode replaces selection', () => {
  const next = reduceTapSelect({
    id: 'b',
    multipleMode: false,
    current: { ids: ['a'], primaryId: 'a' },
  });
  assert.deepEqual(next, { ids: ['b'], primaryId: 'b' });
});

test('reduceTapSelect multiple mode adds unselected element', () => {
  const next = reduceTapSelect({
    id: 'b',
    multipleMode: true,
    current: { ids: ['a'], primaryId: 'a' },
  });
  assert.deepEqual(next, { ids: ['a', 'b'], primaryId: 'b' });
});

test('reduceTapSelect multiple mode promotes already-selected without removing', () => {
  const next = reduceTapSelect({
    id: 'a',
    multipleMode: true,
    current: { ids: ['a', 'b'], primaryId: 'b' },
  });
  assert.deepEqual(next, { ids: ['a', 'b'], primaryId: 'a' });
});

test('clearSelection resets ids and primary', () => {
  assert.deepEqual(clearSelection(), { ids: [], primaryId: null });
});

test('selectionFromIds picks last id as primary when omitted', () => {
  assert.deepEqual(selectionFromIds(['a', 'b']), { ids: ['a', 'b'], primaryId: 'b' });
});

test('unionBounds spans all selected element boxes', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5 } as LabelElement,
    { id: 'b', type: 'qrcode', left: 5, top: 12, width: 8, height: 8 } as LabelElement,
  ];
  const bounds = unionBounds(elements);
  assert.equal(bounds.left, 3);
  assert.equal(bounds.top, 3);
  assert.equal(bounds.width, 12);
  assert.equal(bounds.height, 17);
});

test('alignGroupBounds moves all members by the same delta', () => {
  const elements = [
    { id: 'a', type: 'barcode', left: 3, top: 3, width: 12, height: 5 } as LabelElement,
    { id: 'b', type: 'qrcode', left: 5, top: 12, width: 8, height: 8 } as LabelElement,
  ];
  const patches = alignGroupBounds(elements, ['a', 'b'], { widthMm: 40, heightMm: 30 }, 'left');
  assert.deepEqual(patches.get('a'), { left: 0, top: 3 });
  assert.deepEqual(patches.get('b'), { left: 2, top: 12 });
});
