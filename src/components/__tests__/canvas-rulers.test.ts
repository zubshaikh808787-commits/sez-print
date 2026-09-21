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

test('34.0mm circle label dimension: uniform tick cadence without forcing 34mm as major', () => {
  const lengthMm = 34;
  const contentPx = 272; // 8 px/mm
  const ticks = rulerTicksFor(lengthMm, contentPx);

  // Starts at 0, ends at 34
  assert.equal(ticks[0].mm, 0);
  assert.equal(ticks[ticks.length - 1].mm, 34);

  // 34mm is NOT a multiple of 10 or 5, so it must be minor
  assert.equal(ticks[ticks.length - 1].kind, 'minor');

  // Major ticks must strictly be 0, 10, 20, 30
  const majors = ticks.filter((t) => t.kind === 'major');
  assert.deepEqual(
    majors.map((m) => m.mm),
    [0, 10, 20, 30]
  );

  // Spaced major labels must only be [0, 10, 20, 30]
  const labels = spacedMajor(ticks, 22, lengthMm);
  assert.deepEqual(
    labels.map((l) => l.mm),
    [0, 10, 20, 30]
  );

  // Tick step spacing is strictly uniform (1mm step = 8px between adjacent ticks at 8 px/mm)
  for (let i = 1; i < ticks.length; i++) {
    const mmStep = Math.round((ticks[i].mm - ticks[i - 1].mm) * 100) / 100;
    assert.equal(mmStep, 1.0);
    const pxGap = ticks[i].px - ticks[i - 1].px;
    assert.ok(Math.abs(pxGap - 8) < 0.001);
  }

  // After the '30' major tick mark, there must be EXACTLY 4 tick lines: 31, 32, 33, 34mm
  const ticksAfter30 = ticks.filter((t) => t.mm > 30);
  assert.equal(ticksAfter30.length, 4);
  assert.deepEqual(
    ticksAfter30.map((t) => t.mm),
    [31, 32, 33, 34]
  );
  // All 4 are whole-millimeter minor ticks
  for (const t of ticksAfter30) {
    assert.equal(t.kind, 'minor');
  }
});

test('34.2mm decimal dimension: ruler terminates with uniform step cadence without forced squashed tick', () => {
  const lengthMm = 34.2;
  const contentPx = 273.6; // 8 px/mm
  const ticks = rulerTicksFor(lengthMm, contentPx);

  // Last tick is at clean 34.0mm step, not an irregular fractional 34.2mm
  const lastTick = ticks[ticks.length - 1];
  assert.equal(lastTick.mm, 34.0);

  // All tick steps are uniformly 1mm
  for (let i = 1; i < ticks.length; i++) {
    const mmStep = Math.round((ticks[i].mm - ticks[i - 1].mm) * 100) / 100;
    assert.equal(mmStep, 1.0);
    const pxGap = ticks[i].px - ticks[i - 1].px;
    assert.ok(Math.abs(pxGap - 8) < 0.001);
  }

  // After 30mm major mark, exactly 4 ticks: 31, 32, 33, 34mm
  const ticksAfter30 = ticks.filter((t) => t.mm > 30);
  assert.equal(ticksAfter30.length, 4);
  assert.deepEqual(
    ticksAfter30.map((t) => t.mm),
    [31, 32, 33, 34]
  );

  // Major labels remain strictly 0, 10, 20, 30
  const labels = spacedMajor(ticks, 22, lengthMm);
  assert.deepEqual(
    labels.map((l) => l.mm),
    [0, 10, 20, 30]
  );

  // Small clean trailing gap to true artboard boundary is 0.2mm (1.6px)
  const trailingGapPx = contentPx - lastTick.px;
  assert.ok(Math.abs(trailingGapPx - 1.6) < 0.001);
});

test('tick step selection across various label sizes and zoom densities', () => {
  // 34mm at typical canvas width (272px -> 8 px/mm): 1mm step
  const ticks34 = rulerTicksFor(34, 272);
  const step34 = Math.round((ticks34[1].mm - ticks34[0].mm) * 100) / 100;
  assert.equal(step34, 1.0);
  const after30 = ticks34.filter((t) => t.mm > 30);
  assert.equal(after30.length, 4);
  assert.deepEqual(after30.map((t) => t.mm), [31, 32, 33, 34]);

  // 20mm label at standard canvas (300px -> 15 px/mm): 1mm step
  const ticks20 = rulerTicksFor(20, 300);
  const step20 = Math.round((ticks20[1].mm - ticks20[0].mm) * 100) / 100;
  assert.equal(step20, 1.0);
  // Between 10mm and 20mm: 9 ticks (11 through 19)
  const between10And20 = ticks20.filter((t) => t.mm > 10 && t.mm < 20);
  assert.equal(between10And20.length, 9);

  // 80mm label at standard canvas (352px -> 4.4 px/mm): 1mm step
  const ticks80 = rulerTicksFor(80, 352);
  const step80 = Math.round((ticks80[1].mm - ticks80[0].mm) * 100) / 100;
  assert.equal(step80, 1.0);

  // 150mm large dimension (300px -> 2.0 px/mm): 2mm step
  const ticks150 = rulerTicksFor(150, 300);
  const step150 = Math.round((ticks150[1].mm - ticks150[0].mm) * 100) / 100;
  assert.equal(step150, 2.0);

  // 250mm extra-large dimension (250px -> 1.0 px/mm): 5mm step
  const ticks250 = rulerTicksFor(250, 250);
  const step250 = Math.round((ticks250[1].mm - ticks250[0].mm) * 100) / 100;
  assert.equal(step250, 5.0);

  // 400mm banner (200px -> 0.5 px/mm): 10mm step
  const ticks400 = rulerTicksFor(400, 200);
  const step400 = Math.round((ticks400[1].mm - ticks400[0].mm) * 100) / 100;
  assert.equal(step400, 10.0);

  // Extreme zoom level (pxPerMm = 32 -> 0.5mm step)
  const ticksZoomed = rulerTicksFor(10, 320);
  const stepZoomed = Math.round((ticksZoomed[1].mm - ticksZoomed[0].mm) * 100) / 100;
  assert.equal(stepZoomed, 0.5);
});

