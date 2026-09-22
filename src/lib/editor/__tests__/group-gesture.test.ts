import test from 'node:test';
import assert from 'node:assert/strict';

import { gestureCommitSelectionIds } from '../group-gesture';

test('gestureCommitSelectionIds prefers frozen ids from gesture start', () => {
  assert.deepEqual(
    gestureCommitSelectionIds(['a', 'b', 'c'], ['b']),
    ['a', 'b', 'c'],
  );
});

test('gestureCommitSelectionIds falls back to current when frozen is empty', () => {
  assert.deepEqual(gestureCommitSelectionIds([], ['x', 'y']), ['x', 'y']);
});
