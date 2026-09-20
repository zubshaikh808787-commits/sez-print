import test from 'node:test';
import assert from 'node:assert/strict';

import { rulerTicksFor, type RulerTick } from '../../lib/editor/ruler-ticks';

type Tick = RulerTick;

function spacedMajor(ticks: Tick[], minGapPx: number, lengthMm?: number) {
  const majors = ticks.filter((t) => t.kind === 'major');
  const kept: Tick[] = [];
  for (const tick of majors) {
    if (lengthMm !== undefined && Math.abs(tick.mm - lengthMm) < 0.01) {
      continue;
    }
    const prev = kept[kept.length - 1];
    if (prev && Math.abs(tick.px - prev.px) < minGapPx) continue;
    kept.push(tick);
  }
  return kept;
}

test('80x50mm label: ruler tick spacing is mathematically uniform across all segments', () => {
  const lengthMm = 80;
  const contentPx = 352;
  const ticks = rulerTicksFor(lengthMm, contentPx);

  // Ticks should cover 0 to 80 mm
  assert.equal(ticks[0].mm, 0);
  assert.equal(ticks[ticks.length - 1].mm, 80);

  // Check that 10mm major ticks are spaced uniformly
  const major10s = ticks.filter((t) => Math.abs(t.mm % 10) < 0.001);
  assert.equal(major10s.length, 9); // 0, 10, 20, 30, 40, 50, 60, 70, 80

  const expectedGap = (10 / lengthMm) * contentPx; // 44.0 px
  for (let i = 1; i < major10s.length; i++) {
    const gap = major10s[i].px - major10s[i - 1].px;
    assert.ok(
      Math.abs(gap - expectedGap) < 0.001,
      `Gap between ${major10s[i - 1].mm} and ${major10s[i].mm} should be ${expectedGap} but was ${gap}`
    );
  }

  // Check spacedMajor labels
  const labels = spacedMajor(ticks, 22, lengthMm);
  // Labels should be 0, 10, 20, 30, 40, 50, 60, 70 (no squashed 80 overlapping 75mm mid tick)
  assert.deepEqual(
    labels.map((l) => l.mm),
    [0, 10, 20, 30, 40, 50, 60, 70]
  );

  // Every label offset has identical gap
  for (let i = 1; i < labels.length; i++) {
    const labelGap = labels[i].px - labels[i - 1].px;
    assert.ok(
      Math.abs(labelGap - expectedGap) < 0.001,
      `Label gap between ${labels[i - 1].mm} and ${labels[i].mm} should be ${expectedGap} but was ${labelGap}`
    );
  }

  // Ensure last label (70mm) has plenty of room to 80mm boundary (44px)
  const lastLabel = labels[labels.length - 1];
  const distanceToEnd = contentPx - lastLabel.px;
  assert.equal(distanceToEnd, 44);
});

test('50x70mm label (vertical ruler): tick and label spacing is uniform', () => {
  const lengthMm = 70;
  const contentPx = 350;
  const ticks = rulerTicksFor(lengthMm, contentPx);

  const major10s = ticks.filter((t) => Math.abs(t.mm % 10) < 0.001);
  assert.equal(major10s.length, 8); // 0, 10, 20, 30, 40, 50, 60, 70

  const expectedGap = (10 / lengthMm) * contentPx; // 50.0 px
  for (let i = 1; i < major10s.length; i++) {
    const gap = major10s[i].px - major10s[i - 1].px;
    assert.ok(Math.abs(gap - expectedGap) < 0.001);
  }

  const labels = spacedMajor(ticks, 16, lengthMm);
  // Labels should be 0, 10, 20, 30, 40, 50, 60
  assert.deepEqual(
    labels.map((l) => l.mm),
    [0, 10, 20, 30, 40, 50, 60]
  );

  for (let i = 1; i < labels.length; i++) {
    const labelGap = labels[i].px - labels[i - 1].px;
    assert.ok(Math.abs(labelGap - expectedGap) < 0.001);
  }
});

test('Non-integer label dimension (e.g. 75mm width): preserves uniformity for full segments', () => {
  const lengthMm = 75;
  const contentPx = 300;
  const ticks = rulerTicksFor(lengthMm, contentPx);

  const labels = spacedMajor(ticks, 22, lengthMm);
  // Full 10mm majors: 0, 10, 20, 30, 40, 50, 60, 70
  assert.deepEqual(
    labels.map((l) => l.mm),
    [0, 10, 20, 30, 40, 50, 60, 70]
  );

  const expectedGap = (10 / lengthMm) * contentPx; // 40.0 px
  for (let i = 1; i < labels.length; i++) {
    const labelGap = labels[i].px - labels[i - 1].px;
    assert.ok(Math.abs(labelGap - expectedGap) < 0.001);
  }

  // The final partial segment 70-75mm is exactly 5mm (20px) ending at contentPx
  const lastLabel = labels[labels.length - 1];
  assert.equal(contentPx - lastLabel.px, 20);
});
