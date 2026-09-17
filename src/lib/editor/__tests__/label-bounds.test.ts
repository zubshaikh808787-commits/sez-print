import assert from 'node:assert/strict';
import { clampToLabelBounds, fitFontSizeToLabel } from '@/lib/editor/label-bounds';

function testAnchorEClamping() {
  const canvas = { widthMm: 50, heightMm: 30 };

  // 1. Right resize within bounds: left unchanged
  const r1 = clampToLabelBounds(
    { left: 10, top: 5, width: 25, height: 10 },
    canvas,
    { anchor: 'e', minMm: 1 },
  );
  assert.equal(r1.left, 10);
  assert.equal(r1.width, 25);
  assert.equal(r1.overflowed, false);

  // 2. Right resize past right canvas boundary (e.g. 55mm total): width clamped to 50 - 10 = 40mm, left strictly 10mm
  const r2 = clampToLabelBounds(
    { left: 10, top: 5, width: 45, height: 10 },
    canvas,
    { anchor: 'e', minMm: 1 },
  );
  assert.equal(r2.left, 10);
  assert.equal(r2.width, 40);
  assert.equal(r2.left + r2.width, 50);
  assert.equal(r2.overflowed, false);

  // 3. Anchor 'e' with wrapping text height expansion: nudges top upward into headroom
  const r3 = clampToLabelBounds(
    { left: 5, top: 15, width: 30, height: 10 },
    canvas,
    { anchor: 'e', naturalHeight: 20 },
  );
  assert.equal(r3.left, 5);
  assert.equal(r3.width, 30);
  assert.equal(r3.height, 20);
  // Headroom: top nudged from 15 to 10 (since 30 - 20 = 10)
  assert.equal(r3.top, 10);
  assert.equal(r3.top + r3.height, 30);
  assert.equal(r3.overflowed, false);

  // 4. Anchor 'e' when natural height exceeds entire label height (35mm > 30mm)
  const r4 = clampToLabelBounds(
    { left: 5, top: 10, width: 30, height: 10 },
    canvas,
    { anchor: 'e', naturalHeight: 35 },
  );
  assert.equal(r4.left, 5);
  assert.equal(r4.top, 0);
  assert.equal(r4.height, 30); // Hard clamped to canvas height
  assert.equal(r4.overflowed, true);

  console.log('ok anchor e clamping strictly fixes left and clamps width/height');
}

function testAnchorSClamping() {
  const canvas = { widthMm: 50, heightMm: 30 };

  // 1. Bottom resize within bounds
  const r1 = clampToLabelBounds(
    { left: 10, top: 5, width: 20, height: 15 },
    canvas,
    { anchor: 's', minMm: 1 },
  );
  assert.equal(r1.top, 5);
  assert.equal(r1.height, 15);
  assert.equal(r1.overflowed, false);

  // 2. Bottom resize exceeding remaining height with headroom: nudges top up
  const r2 = clampToLabelBounds(
    { left: 10, top: 20, width: 20, height: 20 },
    canvas,
    { anchor: 's', minMm: 1 },
  );
  assert.equal(r2.top, 10);
  assert.equal(r2.height, 20);
  assert.equal(r2.top + r2.height, 30);
  assert.equal(r2.overflowed, false);

  // 3. Bottom resize exceeding entire canvas height
  const r3 = clampToLabelBounds(
    { left: 10, top: 10, width: 20, height: 40 },
    canvas,
    { anchor: 's', minMm: 1 },
  );
  assert.equal(r3.top, 0);
  assert.equal(r3.height, 30);
  assert.equal(r3.overflowed, true);

  console.log('ok anchor s clamping fixes top, nudges when needed, and marks overflow');
}

function testAnchorBodyClamping() {
  const canvas = { widthMm: 50, heightMm: 30 };

  // 1. Dragging partially outside left/top allows negative position
  const r1 = clampToLabelBounds(
    { left: -10, top: -5, width: 20, height: 10 },
    canvas,
    { anchor: 'body' },
  );
  assert.equal(r1.left, -10);
  assert.equal(r1.top, -5);
  assert.equal(r1.width, 20);
  assert.equal(r1.height, 10);
  assert.equal(r1.overflowed, false);

  // 2. Dragging partially outside right/bottom allows position past canvas - size
  const r2 = clampToLabelBounds(
    { left: 45, top: 25, width: 20, height: 10 },
    canvas,
    { anchor: 'body' },
  );
  assert.equal(r2.left, 45);
  assert.equal(r2.top, 25);
  assert.equal(r2.overflowed, false);

  console.log('ok anchor body clamping allows element to move past canvas borders');
}

function testFitFontSizeToLabel() {
  const longText = 'Amazon Basics mouse with 2000DPI';
  const widthMm = 45;
  const maxHeightMm = 20; // 20mm height limit

  const bestFs = fitFontSizeToLabel({
    text: longText,
    widthMm,
    maxHeightMm,
    initialFontSize: 24,
  });

  assert.ok(bestFs >= 4 && bestFs <= 24);
  console.log(`ok fitFontSizeToLabel calculates fitting fontSize: ${bestFs}pt`);
}

function runAll() {
  testAnchorEClamping();
  testAnchorSClamping();
  testAnchorBodyClamping();
  testFitFontSizeToLabel();
  console.log('ALL LABEL BOUNDS TESTS PASSED');
}

runAll();
