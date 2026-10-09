/**
 * Canonical bitmap independence: GAP/H/V must not move border geometry
 * inside rasterizeDocumentToBitmapTimed. Negative H/V may shift the whole
 * wire bitmap after measurement (TD-404 REFERENCE firmware workaround).
 * Run: npx --yes tsx --tsconfig tsconfig.json src/printing/raster/__tests__/border-pipeline-measure.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { defaultBorderPlacement } from '@/lib/border-geometry';
import { createLabelDocument, generateId, mmToPt, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { applySignedReferenceToMono } from '@/lib/printer/mono-shift';
import { createPrintSpec, mmToDots, PRINTER_PROFILES } from '@/lib/printer/print-spec';
import {
  collectBorderPrintDiagnostics,
  canonicalBitmapDump,
} from '@/printing/raster/border-diagnostics';
import { expectedBorderDots, measureBorderInDots } from '@/printing/raster/border-measure';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const DPI = 304;

function sha(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

function border(w: number, h: number): LabelElement {
  return {
    id: generateId(),
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    needPrinting: true,
    drawingColorIndex: 0,
    ...defaultBorderPlacement(w, h),
  };
}

function text(): LabelElement {
  return {
    id: generateId(),
    type: 'text',
    text: 'AB',
    fontSize: mmToPt(4),
    left: 8,
    top: 8,
    width: 20,
    height: 8,
    rotation: 0,
    needPrinting: true,
  } as LabelElement;
}

function doc(w: number, h: number, extra: LabelElement[] = []): LabelDocument {
  return createLabelDocument({
    name: `${w}x${h}`,
    widthMm: w,
    heightMm: h,
    paperType: 'Label',
    elements: [border(w, h), ...extra],
  });
}

const d = doc(50, 30, [text()]);
const a = rasterizeDocumentToBitmapTimed(d, DPI, { threshold: 160, backend: 'dot-buffer' });
const b = rasterizeDocumentToBitmapTimed(d, DPI, { threshold: 160, backend: 'dot-buffer' });
assert.equal(sha(a.result.mono1bppBuffer), sha(b.result.mono1bppBuffer), 'rasterize is deterministic');

const dumps = new Set<string>();
for (const gapMm of [1, 2, 3]) {
  dumps.add(sha(a.result.mono1bppBuffer) + `|${gapMm}`);
  const spec = createPrintSpec({
    widthMm: 50,
    heightMm: 30,
    dpi: DPI,
    profile: PRINTER_PROFILES['td404-304'],
    gapMm,
    calibration: { horizontalOffsetMm: 0, verticalOffsetMm: 0 },
  });
  assert.equal(spec.gapMm, gapMm);
  const again = rasterizeDocumentToBitmapTimed(d, DPI, { threshold: 160, backend: 'dot-buffer' });
  assert.equal(sha(again.result.mono1bppBuffer), sha(a.result.mono1bppBuffer), `GAP ${gapMm}mm must not change raster`);
}
assert.equal(new Set([...dumps].map((s) => s.split('|')[0])).size, 1);

const canonical = sha(a.result.mono1bppBuffer);
for (const [h, v] of [
  [0, 0],
  [1, 0],
  [0, 1],
] as const) {
  const spec = createPrintSpec({
    widthMm: 50,
    heightMm: 30,
    dpi: DPI,
    profile: PRINTER_PROFILES['td404-304'],
    gapMm: 3,
    calibration: { horizontalOffsetMm: h, verticalOffsetMm: v },
  });
  const wire = applySignedReferenceToMono(
    a.result.mono1bppBuffer,
    a.result.bytesPerRow,
    a.result.heightDots,
    spec.xOffsetDots,
    spec.yOffsetDots,
  );
  if (spec.xOffsetDots >= 0 && spec.yOffsetDots >= 0) {
    assert.equal(sha(wire.monoBytes), canonical, `H=${h} V=${v} must not change canonical bits`);
  } else {
    assert.notEqual(sha(wire.monoBytes), canonical, `H=${h} V=${v} media-origin whole-bitmap shift`);
  }
}

const neg = createPrintSpec({
  widthMm: 50,
  heightMm: 30,
  dpi: DPI,
  profile: PRINTER_PROFILES['td404-304'],
  gapMm: 3,
  calibration: { horizontalOffsetMm: -1, verticalOffsetMm: 0 },
});
const shifted = applySignedReferenceToMono(
  a.result.mono1bppBuffer,
  a.result.bytesPerRow,
  a.result.heightDots,
  neg.xOffsetDots,
  neg.yOffsetDots,
);
assert.notEqual(sha(shifted.monoBytes), canonical, 'negative H shifts the whole wire bitmap');
assert.equal(shifted.xDots, 0);

const sizeW = mmToDots(50, DPI);
const sizeH = mmToDots(30, DPI);
const el = d.elements.find((e) => e.type === 'border')!;
const expected = expectedBorderDots(el as Extract<LabelElement, { type: 'border' }>, DPI, 50, 30);
const measured = measureBorderInDots(a.gray, a.result.widthDots, sizeW, sizeH);
assert.ok(measured.box, 'canonical gray has border ink');
assert.ok(
  Math.abs((measured.box?.x0 ?? 0) - expected.x0) <= 1 &&
    Math.abs((measured.box?.y0 ?? 0) - expected.y0) <= 1,
  'canvas outer edge matches canonical bitmap',
);

const diag = collectBorderPrintDiagnostics(d, DPI, a.result, {
  gapMm: 3,
  hOffsetMm: 0,
  vOffsetMm: 0,
  referenceDots: { x: 0, y: 0 },
  printerName: 'test',
}, a.gray);
assert.equal(diag.layer, 'match');
assert.ok(diag.borders[0]?.withinOneDot);
assert.equal(canonicalBitmapDump(a.result).bytesPerRow, a.result.bytesPerRow);

const untagged = createLabelDocument({
  name: 'already-inset',
  widthMm: 50,
  heightMm: 30,
  paperType: 'Label',
  elements: [
    {
      id: 'b',
      type: 'border',
      borderStyle: 'solid-medium',
      lineWidth: 0.55,
      left: 2,
      top: 2,
      width: 46,
      height: 26,
      rotation: 0,
      lockMovement: true,
      needPrinting: true,
      drawingColorIndex: 0,
    },
  ],
});
const u = rasterizeDocumentToBitmapTimed(untagged, DPI, { threshold: 160, backend: 'dot-buffer' });
const uExpected = expectedBorderDots(
  untagged.elements[0] as Extract<LabelElement, { type: 'border' }>,
  DPI,
  50,
  30,
);
const uMeas = measureBorderInDots(u.gray, u.result.widthDots, sizeW, sizeH);
assert.ok(uMeas.box);
assert.ok(
  Math.abs((uMeas.box?.x0 ?? 99) - uExpected.x0) <= 1,
  'untagged already-inset must not double-inset',
);
assert.ok(Math.abs((uMeas.box?.x0 ?? 0) - mmToDots(2, DPI)) <= 1, 'outer ink ~2 mm');

console.log('ok border-pipeline-measure');
