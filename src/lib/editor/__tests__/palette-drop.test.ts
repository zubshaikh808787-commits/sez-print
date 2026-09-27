import test from 'node:test';
import assert from 'node:assert/strict';

import { PALETTE_DROP_LABELS, paletteDropTypeForLabel } from '../palette-drop';

test('palette drop mapping includes Signature', () => {
  assert.equal(PALETTE_DROP_LABELS.Signature, 'signature');
  assert.equal(paletteDropTypeForLabel('Signature'), 'signature');
  assert.equal(paletteDropTypeForLabel('Text'), 'text');
});
