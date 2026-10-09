import assert from 'node:assert/strict';
import { makeDotSurface, fillRect, strokeRect } from '@/printing/raster/dot-surface';
import { drawPrintBorder, drawPrintBorderBaseline } from '@/printing/raster/print-border';
import { PRINT_BORDER_INSET_MM } from '@/printing/raster/border-frame';
import {
  createPrintSpec,
  dotsPerMm,
  mmToDots,
  PRINTER_PROFILES,
  tsplPackedWidthDots,
  TD404_MEDIA_ORIGIN_H_MM,
  TD404_MEDIA_ORIGIN_V_MM,
} from '@/lib/printer/print-spec';
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
  labelWidthMm?: number,
  labelHeightMm?: number,
  mediaShape?: string,
  clip = false,
) {
  const dpm = dotsPerMm(dpi);
  const sizeW = Math.round((labelWidthMm ?? widthMm) * dpm);
  const sizeH = Math.round((labelHeightMm ?? heightMm) * dpm);
  const packedW = tsplPackedWidthDots(sizeW);
  const surface = makeDotSurface(packedW, sizeH);
  drawPrintBorder(
    {
      fillRect: (x, y, w, h, g) => fillRect(surface, x, y, w, h, g),
      strokeRect: (x, y, w, h, s, g) => strokeRect(surface, x, y, w, h, s, g),
    },
    element,
    dpi,
    1,
    {
      extraBottomInsetMm,
      bitmapWidthDots: clip ? packedW : undefined,
      bitmapHeightDots: clip ? sizeH : undefined,
      labelWidthDots: sizeW,
      labelHeightDots: sizeH,
      labelWidthMm: labelWidthMm ?? widthMm,
      labelHeightMm: labelHeightMm ?? heightMm,
      mediaShape,
    },
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
    R: sizeW - 1 - maxX,
    T: minY,
    B: sizeH - 1 - maxY,
    gray: surface.gray,
    packedW,
    sizeW,
    sizeH,
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
assert.equal(spec.yOffsetDots, mmToDots(TD404_MEDIA_ORIGIN_V_MM, dpi));
assert.equal(spec.gapMm, 3);
assert.equal(TD404_MEDIA_ORIGIN_V_MM, -0.5, 'TD-404 feed origin lifts a centered bitmap ~0.5mm');
assert.ok(spec.yOffsetDots < 0, 'negative V is a whole-bitmap shift, not a border inset');

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

function taggedCanvasBox(widthMm: number, heightMm: number) {
  return {
    ...fullBleedBorderElement(widthMm, heightMm),
    left: 2,
    top: 2,
    width: widthMm - 4,
    height: heightMm - 4,
    geometryVersion: 1 as const,
  };
}

for (const [w, h] of [
  [50, 30],
  [50, 25],
  [50, 40],
  [40, 30],
] as const) {
  const ink = margins(w, h, taggedCanvasBox(w, h));
  for (const side of ['L', 'R', 'T', 'B'] as const) {
    const dots = ink[side];
    assert.ok(
      Math.abs(dots - insetDots) <= 1,
      `${w}x${h} ${side} ${dots} dots, expected ${insetDots}±1`,
    );
  }
}

{
  const w = 50;
  const h = 30;
  const sizeW = mmToDots(w, dpi);
  const sizeH = mmToDots(h, dpi);
  const packedW = tsplPackedWidthDots(sizeW);
  const surface = makeDotSurface(packedW, sizeH);
  drawPrintBorderBaseline(
    {
      fillRect: (x, y, bw, bh, g) => fillRect(surface, x, y, bw, bh, g),
      strokeRect: (x, y, bw, bh, s, g) => strokeRect(surface, x, y, bw, bh, s, g),
    },
    fullBleedBorderElement(w, h),
    dpi,
    1,
    {
      labelWidthDots: sizeW,
      labelHeightDots: sizeH,
      labelWidthMm: w,
      labelHeightMm: h,
    },
  );
  let minX = packedW;
  for (let y = 0; y < sizeH; y++) {
    for (let x = 0; x < packedW; x++) {
      if (surface.gray[y * packedW + x] === 0 && x < minX) minX = x;
    }
  }
  assert.ok(Math.abs(minX - insetDots) <= 1, `baseline untagged full-bleed still insets ${insetDots} (got ${minX})`);
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
for (const side of ['L', 'R', 'T', 'B'] as const) {
  const dots = tagged[side];
  assert.ok(Math.abs(dots - insetDots) <= 1, `stored box ${side} ${dots} dots, expected ${insetDots}Â±1`);
}

const tearDots = mmToDots(1, dpi);
const torn = margins(50, 30, stored, 1);
assert.ok(Math.abs(torn.L - insetDots) <= 1, `tear left ${torn.L}`);
assert.ok(Math.abs(torn.R - insetDots) <= 1, `tear right ${torn.R}`);
assert.ok(Math.abs(torn.T - insetDots) <= 1, `tear top ${torn.T}`);
assert.ok(Math.abs(torn.B - (insetDots + tearDots)) <= 1, `tear bottom ${torn.B}, expected ${insetDots + tearDots}`);
const tornFull = margins(50, 30, fullBleedBorderElement(50, 30), 1);
assert.ok(tornFull.T <= 1, `full-bleed canvas prints at the die edge T${tornFull.T}`);
assert.ok(Math.abs(tornFull.B - tearDots) <= 1, `full-bleed extra bottom B${tornFull.B}`);

for (const [widthMm, heightMm] of [
  [50, 50],
  [40, 40],
  [30, 30],
  [50, 75],
  [50, 25],
  [40, 30],
  [75, 50],
  [80, 20],
  [100, 150],
] as const) {
  const wysiwyg = margins(
    widthMm,
    heightMm,
    taggedCanvasBox(widthMm, heightMm),
    0,
    widthMm,
    heightMm,
    undefined,
    true,
  );
  assert.ok(Math.abs(wysiwyg.L - insetDots) <= 1, `wysiwyg ${widthMm}x${heightMm} L ${wysiwyg.L}`);
  assert.ok(
    Math.abs(wysiwyg.R - insetDots) <= 1,
    `wysiwyg ${widthMm}x${heightMm} R ${wysiwyg.R}`,
  );
  assert.ok(Math.abs(wysiwyg.T - insetDots) <= 1, `wysiwyg ${widthMm}x${heightMm} T ${wysiwyg.T}`);
  assert.ok(Math.abs(wysiwyg.B - insetDots) <= 1, `wysiwyg ${widthMm}x${heightMm} B ${wysiwyg.B}`);
}

const oddWidthMm = 33;
const oddHeightMm = 48;
const oddWysiwyg = margins(
  oddWidthMm,
  oddHeightMm,
  taggedCanvasBox(oddWidthMm, oddHeightMm),
  0,
  oddWidthMm,
  oddHeightMm,
  'rectangle',
  true,
);
assert.ok(Math.abs(oddWysiwyg.L - insetDots) <= 1, `wysiwyg odd left ${oddWysiwyg.L}`);
assert.ok(Math.abs(oddWysiwyg.T - insetDots) <= 1, `wysiwyg odd top ${oddWysiwyg.T}`);
assert.ok(Math.abs(oddWysiwyg.B - insetDots) <= 1, `wysiwyg odd bottom ${oddWysiwyg.B}`);
assert.ok(
  Math.abs(oddWysiwyg.R - insetDots) <= 1,
  `wysiwyg odd right ${oddWysiwyg.R}`,
);

for (const [widthMm, heightMm, shape] of [
  [40, 40, 'circle'],
  [50, 30, 'ellipse'],
  [60, 40, 'circle'],
] as const) {
  const ring = margins(
    widthMm,
    heightMm,
    taggedCanvasBox(widthMm, heightMm),
    0,
    widthMm,
    heightMm,
    shape,
    true,
  );
  assert.ok(Math.abs(ring.L - ring.R) <= 1, `wysiwyg ${shape} ${widthMm}x${heightMm} L ${ring.L} vs R ${ring.R}`);
  assert.ok(Math.abs(ring.T - ring.B) <= 1, `wysiwyg ${shape} ${widthMm}x${heightMm} T ${ring.T} vs B ${ring.B}`);
  if (shape === 'ellipse') {
    assert.ok(Math.abs(ring.L - insetDots) <= 1, `wysiwyg ellipse left ${ring.L}`);
    assert.ok(Math.abs(ring.T - insetDots) <= 1, `wysiwyg ellipse top ${ring.T}`);
  } else {
    const dieDots = mmToDots(Math.min(widthMm, heightMm), dpi);
    const sizeDots = dieDots - insetDots * 2;
    const expectL = Math.round((mmToDots(widthMm, dpi) - sizeDots) / 2);
    const expectT = Math.round((mmToDots(heightMm, dpi) - sizeDots) / 2);
    assert.ok(Math.abs(ring.L - expectL) <= 1, `wysiwyg circle ${widthMm}x${heightMm} left ${ring.L} vs ${expectL}`);
    assert.ok(Math.abs(ring.T - expectT) <= 1, `wysiwyg circle ${widthMm}x${heightMm} top ${ring.T} vs ${expectT}`);
  }
  const corner = ring.gray[ring.T * ring.packedW + ring.L];
  assert.notEqual(corner, 0, `wysiwyg ${shape} ${widthMm}x${heightMm} corner should be outside the ring`);
  const midY = Math.round((ring.T + (ring.sizeH - 1 - ring.B)) / 2);
  assert.equal(
    ring.gray[midY * ring.packedW + ring.packedW / 2],
    255,
    `wysiwyg ${shape} centre stays clear`,
  );
}

for (const widthMm of [30, 33, 50, 54, 100]) {
  const ink = margins(widthMm, 30, taggedCanvasBox(widthMm, 30), 0, widthMm, 30, undefined, true);
  for (const side of ['L', 'R', 'T', 'B'] as const) {
    assert.ok(
      Math.abs(ink[side] - insetDots) <= 1,
      `SIZE-edge ${widthMm}x30 ${side} ${ink[side]} vs ${insetDots}`,
    );
  }
  for (let x = ink.sizeW; x < ink.packedW; x++) {
    assert.equal(ink.gray[0 * ink.packedW + x], 255, `pad col ${x} on ${widthMm}mm stays white`);
  }
}

console.log('ok border-calibration');
