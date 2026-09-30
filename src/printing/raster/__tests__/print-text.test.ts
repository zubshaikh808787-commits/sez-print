import assert from 'node:assert/strict';

import { normalizePrintText } from '@/printing/raster/print-text';

assert.equal(normalizePrintText('SEZNIK INDIA ❤️'), 'SEZNIK INDIA ❤');
assert.equal(normalizePrintText('a\uFE0Fb'), 'ab');
assert.equal(normalizePrintText('plain'), 'plain');
assert.equal(
  normalizePrintText('👍'),
  '👍',
  'ZWJ sequences are kept; variation selectors inside compounds are stripped per char',
);

console.log('print-text.test.ts ok');
