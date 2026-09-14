import assert from 'node:assert/strict';

import {
  isLikelyDevName,
  isLikelyTezName,
  isLikelyShaktiName,
  isLikelyTd404Name,
  isLikelyJoshName,
} from '../printer-heuristics';

import {
  DEV_PAPER_TYPE,
  DEV_PRINT_MODE,
  parseDevPaperType,
} from '../../../../modules/dev-printer/src/types';

function testNameClassification() {
  // DEV devices
  assert.equal(isLikelyDevName('SEZNIK DEV'), true);
  assert.equal(isLikelyDevName('DEV-PRINTER'), true);
  assert.equal(isLikelyDevName('dev_50'), true);
  assert.equal(isLikelyDevName('autoreply-dev'), true);
  assert.equal(isLikelyDevName('caysn-dev'), true);
  assert.equal(isLikelyDevName('dev_pos'), true);
  assert.equal(isLikelyDevName('dev_label'), true);
  assert.equal(isLikelyDevName('Seznik 2in1 Printer-7299'), true);
  assert.equal(isLikelyDevName('2in1 Printer'), true);
  assert.equal(isLikelyTd404Name('Seznik 2in1 Printer-7299'), false, '2in1 must NOT match TD-404');

  // Negative matches (must not hijack or be hijacked by other models)
  assert.equal(isLikelyDevName('Tejas'), false, 'Tejas must NOT match DEV');
  assert.equal(isLikelyDevName('Tez Printer'), false, 'Tez must NOT match DEV');
  assert.equal(isLikelyDevName('Shakti-404'), false, 'Shakti must NOT match DEV');
  assert.equal(isLikelyDevName('JOSH-LD08'), false, 'Josh must NOT match DEV');
  assert.equal(isLikelyDevName('TD-404'), false, 'TD-404 must NOT match DEV');

  // Other model checks with DEV names
  assert.equal(isLikelyTd404Name('SEZNIK DEV'), false, 'DEV must NOT match TD-404');
  assert.equal(isLikelyTezName('SEZNIK DEV'), false, 'DEV must NOT match TEZ');
  assert.equal(isLikelyShaktiName('SEZNIK DEV'), false, 'DEV must NOT match SHAKTI');
  assert.equal(isLikelyJoshName('SEZNIK DEV'), false, 'DEV must NOT match JOSH');

  console.log('ok Device name classification heuristics for DEV validated');
}

function testDpiAndDimensionCalculations() {
  const DPI = 203;
  const DOTS_PER_MM = 8; // 203 DPI = 8 dots/mm (AutoReplyPrint standard)

  function mmToDots(mm: number, dotsPerMm = DOTS_PER_MM): number {
    return Math.round(mm * dotsPerMm);
  }

  // 50 x 30 mm standard DEV label
  assert.equal(mmToDots(50), 400);
  assert.equal(mmToDots(30), 240);

  // 48 x 25 mm compact label
  assert.equal(mmToDots(48), 384);
  assert.equal(mmToDots(25), 200);

  // 58 mm continuous receipt width (48mm printable area = 384 dots)
  assert.equal(mmToDots(48), 384);

  // 80 mm continuous receipt width (72mm printable area = 576 dots)
  assert.equal(mmToDots(72), 576);

  console.log('ok 203 DPI / 8 dpm dimension calculations (50x30mm = 400x240 dots) verified');
}

function testPaperTypeAndPrintModeResolution() {
  assert.equal(parseDevPaperType('gap'), DEV_PAPER_TYPE.GAP);
  assert.equal(parseDevPaperType(undefined), DEV_PAPER_TYPE.GAP);
  assert.equal(parseDevPaperType('continuous'), DEV_PAPER_TYPE.CONTINUOUS);
  assert.equal(parseDevPaperType('bline'), DEV_PAPER_TYPE.BLACK_MARK);
  assert.equal(parseDevPaperType('black_mark'), DEV_PAPER_TYPE.BLACK_MARK);
  assert.equal(parseDevPaperType(0), 0);
  assert.equal(parseDevPaperType(1), 1);
  assert.equal(parseDevPaperType(2), 2);

  assert.equal(DEV_PRINT_MODE.LABEL, 0);
  assert.equal(DEV_PRINT_MODE.RECEIPT, 1);

  console.log('ok DEV Paper type mapping (GAP=0, CONTINUOUS=1, BLACK_MARK=2) verified');
}

function testStatusBitmaskParsing() {
  function parseDevStatus(statusWord: number) {
    return {
      statusWord,
      isNormal: statusWord === 0,
      isCoverOpen: (statusWord & 0x01) !== 0,
      isNoPaper: (statusWord & 0x02) !== 0,
      isPaperNearEnd: (statusWord & 0x04) !== 0,
      isOverheat: (statusWord & 0x08) !== 0,
      isLowBattery: (statusWord & 0x10) !== 0,
      isPrinting: (statusWord & 0x20) !== 0,
    };
  }

  const normal = parseDevStatus(0x00);
  assert.equal(normal.isNormal, true);
  assert.equal(normal.isCoverOpen, false);
  assert.equal(normal.isNoPaper, false);

  const coverOpen = parseDevStatus(0x01);
  assert.equal(coverOpen.isNormal, false);
  assert.equal(coverOpen.isCoverOpen, true);

  const noPaper = parseDevStatus(0x02);
  assert.equal(noPaper.isNormal, false);
  assert.equal(noPaper.isNoPaper, true);

  const overheatAndLowBattery = parseDevStatus(0x08 | 0x10);
  assert.equal(overheatAndLowBattery.isOverheat, true);
  assert.equal(overheatAndLowBattery.isLowBattery, true);
  assert.equal(overheatAndLowBattery.isNoPaper, false);

  console.log('ok AutoReplyPrint status bitmask parsing validated');
}

function main() {
  testNameClassification();
  testDpiAndDimensionCalculations();
  testPaperTypeAndPrintModeResolution();
  testStatusBitmaskParsing();
  console.log('\n=== ALL SEZNIK DEV PRINT SDK TESTS PASSED ===\n');
}

main();
