import assert from 'node:assert/strict';
import { makeDotSurface, fillRect, strokeRect } from '@/printing/raster/dot-surface';
import { drawPrintBorder } from '@/printing/raster/print-border';
import { PRINT_BORDER_INSET_MM } from '@/printing/raster/border-frame';
import { createPrintSpec, dotsPerMm, mmToDots, PRINTER_PROFILES, TD404_MEDIA_ORIGIN_H_MM } from '@/lib/printer/print-spec';
import {
  borderExceedsBitmap,
  borderOuterDots,
  fullBleedBorderElement,
  IDENTITY_LAYOUT_CALIBRATION,
  migrateCalibrationEntry,
  solveBorderAxis,
  type LayoutCalibration,
} from '@/lib/printer/border-calibration';

const dpi = 304;
const insetDots = mmToDots(PRINT_BORDER_INSET_MM, dpi);

function margins(
  widthMm: number,
  heightMm: number,
  element = fullBleedBorderElement(widthMm, heightMm),
  extraBottomInsetMm = 0,
) {
  const dpm = dotsPerMm(dpi);
  const sizeW = Math.round(widthMm * dpm);
  const sizeH = Math.round(heightMm * dpm);
  const packedW = Math.max(8, Math.floor(sizeW / 8) * 8);
  const surface = makeDotSurface(packedW, sizeH);
  drawPrintBorder(
    {
      fillRect: (x, y, w, h, g) => fillRect(surface, x, y, w, h, g),
      strokeRect: (x, y, w, h, s, g) => strokeRect(surface, x, y, w, h, s, g),
    },
    element,
    dpi,
    1,
    { extraBottomInsetMm },
  );
  let minX = packedW;
  let maxX = -1;
  let minY = sizeH;
  let maxY = -1;
  for (let y = 0; y < sizeH; y++) {
    for (let x = 0; x < packedW; x++) {
      if (surface.gray[y * packedW + x] !== 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    L: minX,
    R: packedW - 1 - maxX,
    T: minY,
    B: sizeH - 1 - maxY,
  };
}

function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`);
}

const equal = solveBorderAxis({
  nearMm: 2,
  farMm: 2,
  realLabelMm: 30,
  configuredLabelMm: 30,
});
close(equal.marginImbalanceMm, 0, 'equal imbalance');
close(equal.scale, 1, 'equal scale');
close(equal.offsetMm, 0, 'equal offset');
close(equal.predictedNearMm, 2, 'equal predicted near');
close(equal.predictedFarMm, 2, 'equal predicted far');

const oneSided = solveBorderAxis({
  nearMm: 3,
  farMm: 2,
  realLabelMm: 30,
  configuredLabelMm: 30,
});
close(oneSided.marginImbalanceMm, 0.5, 'one-sided imbalance');
close(oneSided.scale, 26 / 25, 'one-sided scale');
close(oneSided.predictedNearMm, 2, 'one-sided predicted top');
close(oneSided.predictedFarMm, 2, 'one-sided predicted bottom');

const scaleOnly = solveBorderAxis({
  nearMm: 2.5,
  farMm: 2.5,
  realLabelMm: 30,
  configuredLabelMm: 30,
});
close(scaleOnly.marginImbalanceMm, 0, 'scale-only imbalance');
close(scaleOnly.scale, 26 / 25, 'scale-only scale');
close(scaleOnly.predictedNearMm, 2, 'scale-only predicted near');
close(scaleOnly.predictedFarMm, 2, 'scale-only predicted far');

const both = solveBorderAxis({
  nearMm: 3.2,
  farMm: 1.6,
  realLabelMm: 50,
  configuredLabelMm: 50,
});
close(both.marginImbalanceMm, 0.8, 'both imbalance');
close(both.predictedNearMm, 2, 'both predicted near');
close(both.predictedFarMm, 2, 'both predicted far');
assert.ok(Math.abs(both.scale - 46 / (50 - 3.2 - 1.6)) < 1e-9);

const shifted: LayoutCalibration = {
  ...IDENTITY_LAYOUT_CALIBRATION,
  vOffsetMm: -3,
};
const overflow = borderOuterDots(fullBleedBorderElement(50, 30), 50, 30, dpi, shifted);
const refused = borderExceedsBitmap(overflow, mmToDots(50, dpi), mmToDots(30, dpi));
assert.ok(refused && refused.includes('not applied'));
assert.ok(overflow.y0 < 0);

const spec = createPrintSpec({
  widthMm: 50,
  heightMm: 30,
  dpi,
  profile: PRINTER_PROFILES['td404-304'],
  gapMm: 3,
  calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
});
assert.equal(spec.xOffsetDots, mmToDots(TD404_MEDIA_ORIGIN_H_MM, dpi));
assert.equal(spec.yOffsetDots, 0);
assert.equal(spec.gapMm, 3);

const plusOne = createPrintSpec({
  widthMm: 50,
  heightMm: 30,
  dpi,
  profile: PRINTER_PROFILES['td404-304'],
  calibration: { horizontalOffsetMm: 1, verticalOffsetMm: 0 },
});
assert.equal(plusOne.xOffsetDots, mmToDots(TD404_MEDIA_ORIGIN_H_MM + 1, dpi));

const retired = migrateCalibrationEntry({ hOffsetMm: 1, vOffsetMm: 0.5 });
assert.equal(retired.entry.hOffsetMm, 0);
assert.equal(retired.entry.vOffsetMm, 0);
assert.equal(retired.entry.hScale, 1);
assert.equal(retired.entry.vScale, 1);
assert.equal(retired.entry.layoutVersion, 2);
assert.deepEqual(retired.entry.retiredBitmapOffset, { hOffsetMm: 1, vOffsetMm: 0.5 });
assert.match(retired.note, /not applied in the layout/);

const kept = migrateCalibrationEntry({
  hOffsetMm: 0.2,
  vOffsetMm: -0.1,
  hScale: 1.01,
  vScale: 0.99,
  layoutVersion: 2,
});
assert.equal(kept.entry.hOffsetMm, 0.2);
assert.equal(kept.note, '');

for (const [w, h] of [
  [50, 30],
  [50, 25],
  [50, 40],
  [40, 30],
] as const) {
  const ink = margins(w, h);
  for (const [side, dots] of Object.entries(ink)) {
    assert.ok(
      Math.abs(dots - insetDots) <= 1,
      `${w}x${h} ${side} ${dots} dots, expected ${insetDots}±1`,
    );
  }
}

const stored = {
  ...fullBleedBorderElement(50, 30),
  ...{
    left: 2,
    top: 2,
    width: 46,
    height: 26,
    geometryVersion: 1 as const,
  },
};
const tagged = margins(50, 30, stored);
for (const [side, dots] of Object.entries(tagged)) {
  assert.ok(Math.abs(dots - insetDots) <= 1, `stored box ${side} ${dots} dots, expected ${insetDots}±1`);
}

const tearDots = mmToDots(1, dpi);
const torn = margins(50, 30, stored, 1);
assert.ok(Math.abs(torn.L - insetDots) <= 1, `tear left ${torn.L}`);
assert.ok(Math.abs(torn.R - insetDots) <= 1, `tear right ${torn.R}`);
assert.ok(Math.abs(torn.T - insetDots) <= 1, `tear top ${torn.T}`);
assert.ok(Math.abs(torn.B - (insetDots + tearDots)) <= 1, `tear bottom ${torn.B}, expected ${insetDots + tearDots}`);
const tornFull = margins(50, 30, fullBleedBorderElement(50, 30), 1);
assert.ok(Math.abs(tornFull.T - insetDots) <= 1 && Math.abs(tornFull.B - (insetDots + tearDots)) <= 1, `full-bleed tear T${tornFull.T} B${tornFull.B}`);

console.log('ok border-calibration');
