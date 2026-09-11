import assert from 'node:assert/strict';

import {
  JOSH_DOTS_PER_MM,
  JOSH_GAP_TYPE,
  JOSH_HARDWARE_DPI,
  joshDrawRectMm,
  joshEffectiveDpi,
  joshGapTypeFromMedia,
  joshLabelDots,
} from '../josh-print';

function testFiftyByThirtyIsExactDots() {
  const page = joshLabelDots(50, 30);
  assert.equal(JOSH_HARDWARE_DPI, 203);
  assert.equal(JOSH_DOTS_PER_MM, 8);
  assert.equal(page.widthDots, 400);
  assert.equal(page.heightDots, 240);
  assert.equal(page.widthDots / 8, 50);
  assert.equal(page.heightDots / 8, 30);
  console.log('ok JOSH 50×30 mm is 400×240 dots at 8 dpm');
}

function testTd404DpiDoesNotLeak() {
  assert.equal(joshEffectiveDpi(304), 203);
  assert.equal(joshEffectiveDpi(undefined), 203);
  assert.equal(joshEffectiveDpi(203), 203);
  assert.equal(joshEffectiveDpi(300), 300);
  console.log('ok JOSH ignores leaked 304 DPI from TD-404 settings');
}

function testGapTypeForStickLabels() {
  assert.equal(joshGapTypeFromMedia('gap'), JOSH_GAP_TYPE.label);
  assert.equal(joshGapTypeFromMedia(undefined), JOSH_GAP_TYPE.label);
  assert.equal(joshGapTypeFromMedia('continuous'), JOSH_GAP_TYPE.receipt);
  assert.equal(joshGapTypeFromMedia('bline'), JOSH_GAP_TYPE.blackMark);
  console.log('ok JOSH gap type is Label (2) for die-cut stickers');
}

function testDrawOriginIsLabelMm() {
  const flush = joshDrawRectMm({ widthMm: 50, heightMm: 30 });
  assert.equal(flush.xMm, 0);
  assert.equal(flush.yMm, 0);
  assert.equal(flush.drawWidthMm, 50);
  assert.equal(flush.drawHeightMm, 30);

  const shifted = joshDrawRectMm({
    widthMm: 50,
    heightMm: 30,
    hOffsetMm: 1.25,
    vOffsetMm: 0.5,
    alignment: 'center',
  });
  assert.equal(shifted.xMm, 1.25);
  assert.equal(shifted.yMm, 0.5);
  assert.equal(shifted.drawWidthMm, 50);
  console.log('ok JOSH draw rect is the label millimetres plus user offset');
}

function main() {
  testFiftyByThirtyIsExactDots();
  testTd404DpiDoesNotLeak();
  testGapTypeForStickLabels();
  testDrawOriginIsLabelMm();
  console.log('ALL JOSH PRINT TESTS PASSED');
}

main();
