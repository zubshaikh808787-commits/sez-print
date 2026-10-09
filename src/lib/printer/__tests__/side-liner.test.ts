import assert from 'node:assert/strict';

import { effectiveHOffsetMm, sideLinerShiftMm } from '@/lib/printer/side-liner';
import {
  jobPrintOffsets,
  migratePrintCalibrationEntry,
  PRINT_ORIGIN_VERSION,
  resolvedPrintOffsets,
} from '@/stores/printer-store';

assert.equal(sideLinerShiftMm(0, 0), 0);
assert.equal(sideLinerShiftMm(1.5, 1.5), 0, 'even liner keeps the label centred');
assert.equal(sideLinerShiftMm(3, 1), 1);
assert.equal(sideLinerShiftMm(1, 3), -1);
assert.equal(sideLinerShiftMm(-2, Number.NaN), 0, 'bad input is treated as no liner');

assert.equal(effectiveHOffsetMm(1.5, 0, 0), 1.5);
assert.equal(effectiveHOffsetMm(1.5, 2, 1), 2);
assert.equal(effectiveHOffsetMm(1.5, 1, 2.5), 0.75);

assert.deepEqual(resolvedPrintOffsets(undefined), {
  hOffsetMm: 0,
  vOffsetMm: 0,
  sideLinerLeftMm: 0,
  sideLinerRightMm: 0,
  gapMm: null,
});
assert.equal(resolvedPrintOffsets({ hOffsetMm: 0, vOffsetMm: 0, gapMm: 2.2 }).gapMm, 2.2, 'gap is a roll value');
assert.deepEqual(
  resolvedPrintOffsets({ hOffsetMm: -1, vOffsetMm: 1, gapMm: 3 }),
  {
    hOffsetMm: 0,
    vOffsetMm: 0,
    sideLinerLeftMm: 0,
    sideLinerRightMm: 0,
    gapMm: 3,
  },
  'stale originVersion drops leftover millimetre-chase H/V',
);
assert.deepEqual(
  resolvedPrintOffsets({ hOffsetMm: -1, vOffsetMm: 1, gapMm: 3, originVersion: 1 }),
  {
    hOffsetMm: 0,
    vOffsetMm: 0,
    sideLinerLeftMm: 0,
    sideLinerRightMm: 0,
    gapMm: 3,
  },
  'origin v1 millimetre chase is not applied on v2',
);
assert.deepEqual(migratePrintCalibrationEntry({ hOffsetMm: -1, vOffsetMm: 1, gapMm: 3, originVersion: 1 }), {
  hOffsetMm: 0,
  vOffsetMm: 0,
  sideLinerLeftMm: 0,
  sideLinerRightMm: 0,
  gapMm: 3,
  originVersion: PRINT_ORIGIN_VERSION,
});
assert.deepEqual(
  resolvedPrintOffsets({ hOffsetMm: 1.25, vOffsetMm: 1.5, gapMm: 3, originVersion: PRINT_ORIGIN_VERSION }),
  {
    hOffsetMm: 1.25,
    vOffsetMm: 1.5,
    sideLinerLeftMm: 0,
    sideLinerRightMm: 0,
    gapMm: 3,
  },
  'explicit current-generation H/V is kept',
);
const saved = {
  hOffsetMm: 1.5,
  vOffsetMm: 1.5,
  sideLinerLeftMm: 2,
  sideLinerRightMm: 1,
  originVersion: PRINT_ORIGIN_VERSION,
};
assert.deepEqual(jobPrintOffsets(saved), { hOffsetMm: 2, vOffsetMm: 1.5 });
assert.deepEqual(jobPrintOffsets({ hOffsetMm: 1.5, vOffsetMm: 1.5, originVersion: PRINT_ORIGIN_VERSION }), {
  hOffsetMm: 1.5,
  vOffsetMm: 1.5,
});
assert.deepEqual(
  jobPrintOffsets({ hOffsetMm: -1, vOffsetMm: 1, originVersion: 1 }),
  { hOffsetMm: 0, vOffsetMm: 0 },
  'jobs must not send leftover millimetre-chase REFERENCE',
);

console.log('ok side-liner');
