import assert from 'node:assert/strict';

import {
  TEJ_HARDWARE_DPI,
  TEJ_DOTS_PER_MM,
  tejEffectiveDpi,
  tejDotsPerMm,
  tejPaperTypeFromMedia,
  isLikelyTejName,
} from '../tej-print';


// ─── 1. DPI and Geometry ───────────────────────────────────────────────

assert.equal(TEJ_HARDWARE_DPI, 203, 'Tej hardware default DPI should be 203');
assert.equal(TEJ_DOTS_PER_MM, 8, 'Tej hardware dots/mm should be 8');

assert.equal(tejEffectiveDpi(undefined), 203, 'Default effective DPI should be 203');
assert.equal(tejEffectiveDpi(203), 203);
assert.equal(tejEffectiveDpi(300), 304);
assert.equal(tejEffectiveDpi(304), 304);

assert.equal(tejDotsPerMm(203), 8);
assert.equal(tejDotsPerMm(304), 12);

// ─── 2. Paper Types ────────────────────────────────────────────────────

assert.equal(tejPaperTypeFromMedia('gap'), 'gap');
assert.equal(tejPaperTypeFromMedia('bline'), 'black');
assert.equal(tejPaperTypeFromMedia('continuous'), 'continuous');
assert.equal(tejPaperTypeFromMedia(undefined), 'gap');

// ─── 3. Device Name Disambiguation & Hard Constraint ──────────────────

// CRITICAL HARD CONSTRAINT: Tejas is TD-404, NEVER Tej!
assert.equal(isLikelyTejName('Tejas'), false, '"Tejas" must NEVER be classified as Tej');
assert.equal(isLikelyTejName('TEJAS'), false, '"TEJAS" must NEVER be classified as Tej');
assert.equal(isLikelyTejName('Tejas Printer'), false, '"Tejas Printer" must NEVER be classified as Tej');
assert.equal(isLikelyTejName('tejas_bt'), false, '"tejas_bt" must NEVER be classified as Tej');
assert.equal(isLikelyTejName('Rudra'), false, '"Rudra" is not Tej');

// Josh disambiguation
assert.equal(isLikelyTejName('Josh-LPAPI'), false, 'Josh must not be Tej');
assert.equal(isLikelyTejName('DothanTech'), false);

// Tej valid names
assert.equal(isLikelyTejName('Tej'), true, '"Tej" is Tej');
assert.equal(isLikelyTejName('Tej Printer'), true, '"Tej Printer" is Tej');
assert.equal(isLikelyTejName('Tej-Y50'), true, '"Tej-Y50" is Tej');
assert.equal(isLikelyTejName('TEJ_BT_01'), true, '"TEJ_BT_01" is Tej');
assert.equal(isLikelyTejName('Y50'), true, '"Y50" is Tej');
assert.equal(isLikelyTejName('Z212'), true, '"Z212" is Tej');
assert.equal(isLikelyTejName('TP3Z431'), true, '"TP3Z431" is Tej');
assert.equal(isLikelyTejName('GE920'), true, '"GE920" is Tej');
assert.equal(isLikelyTejName('YX-Printer'), true, '"YX-Printer" is Tej');

console.log('ALL TEJ PRINT & DISAMBIGUATION TESTS PASSED');
