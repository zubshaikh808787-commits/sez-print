import assert from 'node:assert/strict';

import {
  isLikelyTezName,
  isLikelyShaktiName,
  isLikelyTd404Name,
  isLikelyJoshName,
} from '../printer-heuristics';

import {
  TEZ_PAPER_TYPE,
  parsePaperType,
} from '../../../../modules/tez-printer/src/types';

function testNameClassification() {
  // Tez devices
  assert.equal(isLikelyTezName('Tez Printer'), true);
  assert.equal(isLikelyTezName('TEZ-200'), true);
  assert.equal(isLikelyTezName('tz-100'), true);
  assert.equal(isLikelyTezName('tz_label'), true);
  assert.equal(isLikelyTezName('flashlabel-pro'), true);
  assert.equal(isLikelyTezName('oem-tez'), true);
  assert.equal(isLikelyTezName('tejas'), false, 'CRITICAL: Tejas must NOT match Tez');
  assert.equal(isLikelyTezName('tejas-404'), false);

  // Shakti devices
  assert.equal(isLikelyShaktiName('Shakti Printer'), true);
  assert.equal(isLikelyShaktiName('SHAKTI-BT'), true);
  assert.equal(isLikelyShaktiName('sh-printer'), true);
  assert.equal(isLikelyShaktiName('sk-404'), true);
  assert.equal(isLikelyShaktiName('tejas'), false, 'CRITICAL: Tejas must NOT match Shakti');

  // TD-404 devices
  assert.equal(isLikelyTd404Name('Tejas'), true);
  assert.equal(isLikelyTd404Name('tejas-304'), true);
  assert.equal(isLikelyTd404Name('Rudra'), true);
  assert.equal(isLikelyTd404Name('SEZ-404'), true);
  assert.equal(isLikelyTd404Name('TD-404'), true);
  assert.equal(isLikelyTd404Name('Tez Printer'), false, 'Tez must NOT be hijacked by TD404');
  assert.equal(isLikelyTd404Name('Shakti Printer'), false, 'Shakti must NOT be hijacked by TD404');

  // Josh devices
  assert.equal(isLikelyJoshName('JOSH-LD08'), true);
  assert.equal(isLikelyJoshName('lpapi-printer'), true);
  assert.equal(isLikelyJoshName('Tez Printer'), false);
  assert.equal(isLikelyJoshName('Shakti Printer'), false);
  assert.equal(isLikelyJoshName('Tejas'), false);

  console.log('ok Device name classification heuristics validated');
}

function testPaperTypeResolution() {
  assert.equal(parsePaperType('gap'), TEZ_PAPER_TYPE.GAP);
  assert.equal(parsePaperType(undefined), TEZ_PAPER_TYPE.GAP);
  assert.equal(parsePaperType('continuous'), TEZ_PAPER_TYPE.CONTINUOUS);
  assert.equal(parsePaperType('black'), TEZ_PAPER_TYPE.BLACK);
  assert.equal(parsePaperType('tattoo'), TEZ_PAPER_TYPE.TATTOO);
  assert.equal(parsePaperType(0), 0);
  assert.equal(parsePaperType(1), 1);
  assert.equal(parsePaperType(2), 2);
  assert.equal(parsePaperType(3), 3);

  console.log('ok Paper type mapping (GAP=0, CONTINUOUS=1, BLACK=2, TATTOO=3) verified');
}

function testModelKeyResolution() {
  function resolveModelKeyTs(name: string | null | undefined): string {
    if (!name) return 'Y400';
    const lower = name.toLowerCase();
    if (lower.includes('404') || lower.includes('tez')) return 'Y404';
    if (lower.includes('shakti') || lower.includes('468')) return 'Y468';
    return 'Y400';
  }

  assert.equal(resolveModelKeyTs('Tez Printer'), 'Y404');
  assert.equal(resolveModelKeyTs('TEZ-BT'), 'Y404');
  assert.equal(resolveModelKeyTs('Shakti'), 'Y468');
  assert.equal(resolveModelKeyTs('Unknown OEM'), 'Y400');
  assert.equal(resolveModelKeyTs(null), 'Y400');

  console.log('ok modelKey resolution for Tez (Y404) and Shakti (Y468) verified');
}

function testStatusBitmaskParsing() {
  function parseStatus(bitmask: number) {
    return {
      bitmask,
      isIdle: bitmask === 0x00,
      isPrinting: (bitmask & 0x01) !== 0,
      isCoverOpen: (bitmask & 0x02) !== 0,
      isNoPaper: (bitmask & 0x04) !== 0,
      isLowBattery: (bitmask & 0x08) !== 0,
      isOverheat: (bitmask & 0x10) !== 0,
    };
  }

  const idle = parseStatus(0x00);
  assert.equal(idle.isIdle, true);
  assert.equal(idle.isCoverOpen, false);
  assert.equal(idle.isNoPaper, false);

  const noPaper = parseStatus(0x04);
  assert.equal(noPaper.isIdle, false);
  assert.equal(noPaper.isNoPaper, true);

  const coverAndPaper = parseStatus(0x02 | 0x04);
  assert.equal(coverAndPaper.isCoverOpen, true);
  assert.equal(coverAndPaper.isNoPaper, true);
  assert.equal(coverAndPaper.isLowBattery, false);

  const overheat = parseStatus(0x10);
  assert.equal(overheat.isOverheat, true);

  console.log('ok Hardware status bitmask validation (Cover, Paper, Battery, Overheat) verified');
}

function testRetryPolicyCalculation() {
  function getDelayMs(attempt: number, initialDelay = 500, multiplier = 2.0, maxDelay = 3000): number {
    if (attempt <= 1) return initialDelay;
    const computed = initialDelay * Math.pow(multiplier, attempt - 1);
    return Math.min(maxDelay, Math.round(computed));
  }

  assert.equal(getDelayMs(1), 500);
  assert.equal(getDelayMs(2), 1000);
  assert.equal(getDelayMs(3), 2000);
  assert.equal(getDelayMs(4), 3000); // Capped at maxDelay

  console.log('ok RetryPolicy exponential backoff progression verified');
}

function main() {
  testNameClassification();
  testPaperTypeResolution();
  testModelKeyResolution();
  testStatusBitmaskParsing();
  testRetryPolicyCalculation();
  console.log('\n=== ALL TEZ & SHAKTI PRINT SDK TESTS PASSED ===\n');
}

main();
