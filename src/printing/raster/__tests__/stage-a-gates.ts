/**
 * Stage A gates for the frozen 50×30 mm fixture (PHASE_4_PLAN.md Parts 1, 4, 5).
 * Host/CI only — 15 ms and Hermes heap on-device numbers are not claimed here.
 */

import assert from 'node:assert';
import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import type { LabelElement } from '@/lib/label-document';
import { probeSkiaOffscreen } from '@/printing/raster/skia-surface';
import { decodeStageAFrozenBuffer } from '@/printing/raster/stage-a-decode';
import { barcodeRunWidthRatio } from '@/printing/raster/barcode-stretch';
import { rasterizeEditorParityReference, frozenFixtureRegions } from '@/printing/raster/editor-parity-reference';
import { diffHeadlessVsReference, unpackedHeadlessGray } from '@/printing/raster/parity-diff';
import {
  createPhase4FrozenDocument,
  rasterizeDocumentToBitmap,
  rasterizeDocumentToBitmapTimed,
  wrapPrintText,
} from '@/printing/raster/skia-rasterizer';

const DPI = 304;
const FIXTURE = createPhase4FrozenDocument();

function rasterize() {
  return rasterizeDocumentToBitmap(FIXTURE, DPI, { threshold: 160, backend: 'dot-buffer' });
}

function bitCount(byte: number): number {
  let n = 0;
  let v = byte;
  while (v) {
    n += v & 1;
    v >>= 1;
  }
  return n;
}

console.log('--- Phase 4 Stage A host gates ---');
console.log('skia MakeOffscreen probe:', probeSkiaOffscreen());

const wrapLines = wrapPrintText({
  text: 'Phase 4 baseline label 50x30 text wrap check',
  fontSize: 12,
  width: 44,
  autoWrapping: 'Word',
});
assert.ok(wrapLines.length >= 2, `expected wrap ≥2 lines, got ${wrapLines.length}: ${JSON.stringify(wrapLines)}`);
console.log('4.1 wrap lines:', wrapLines.length, wrapLines);

const t0 = process.hrtime.bigint();
const bits = rasterize();
const firstNs = Number(process.hrtime.bigint() - t0);
console.log('4.1/4.2 first rasterize ns:', firstNs, 'buffer', bits.mono1bppBuffer.length);

assert.strictEqual(bits.widthDots, 600, 'packed width 50mm × 12 dpm');
assert.strictEqual(bits.heightDots, 360, 'packed height 30mm × 12 dpm');
assert.strictEqual(bits.bytesPerRow, 75);
assert.strictEqual(bits.mono1bppBuffer.length, 75 * 360);

const inkBits = bits.mono1bppBuffer.reduce((n, b) => n + bitCount(b), 0);
assert.ok(inkBits > 1000, `expected ink in packed buffer, got ${inkBits} set bits`);
console.log('4.2 set bits (black):', inkBits);

const decoded = decodeStageAFrozenBuffer(bits);
assert.ok(decoded.pass, `4.4b failed: ${JSON.stringify(decoded)}`);
console.log('4.4b Code128:', decoded.code128);
console.log('4.4b QR:', decoded.qr);

const headlessGray = unpackedHeadlessGray(bits);
const reference = rasterizeEditorParityReference(FIXTURE, DPI);
const parity = diffHeadlessVsReference(headlessGray, reference.gray, bits.widthDots, bits.heightDots, DPI, 160);
console.log('parity full %', parity.full.percent.toFixed(3), 'confirmed', parity.confirmed);
assert.ok(parity.full.percent < 0.5, `editor parity failed: ${parity.full.percent}% differing`);
assert.equal(parity.confirmed.barGeometry, false);
assert.equal(parity.confirmed.missingDigits, false);
assert.equal(parity.confirmed.borderStyle, false);
assert.equal(parity.confirmed.textPlacement, false);

const bars = frozenFixtureRegions(DPI).bars;
const jitter = barcodeRunWidthRatio(
  headlessGray,
  bits.widthDots,
  bars.y + Math.floor(bars.h / 2),
  bars.x,
  bars.x + bars.w,
);
console.log('barcode run-width ratio', jitter);
assert.ok(jitter.runCount > 10, 'expected barcode runs');
assert.ok(jitter.ratio <= 6, `stretch-then-round module jitter too high: ${jitter.ratio}`);

const times: number[] = [];
for (let i = 0; i < 50; i++) {
  const start = process.hrtime.bigint();
  rasterize();
  times.push(Number(process.hrtime.bigint() - start) / 1e6);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const p95 = times[Math.floor(times.length * 0.95)];
console.log(`4.4 host rasterize+pack ms n=50 median=${median.toFixed(3)} p95=${p95.toFixed(3)} min=${times[0].toFixed(3)} max=${times[times.length - 1].toFixed(3)}`);
console.log('4.4 GATE 15ms on-device: NOT MEASURED (no phone in this session)');

const reused = rasterize();
if (global.gc) global.gc();
const before = process.memoryUsage().heapUsed;
for (let i = 0; i < 100; i++) {
  rasterizeDocumentToBitmap(FIXTURE, DPI, { threshold: 160, target: reused, backend: 'dot-buffer' });
}
if (global.gc) global.gc();
const after = process.memoryUsage().heapUsed;
const delta = after - before;
console.log(`4.6 Node heapUsed before=${before} after=${after} delta=${delta}`);
console.log('4.6 GATE Hermes zero-growth: NOT MEASURED (no Hermes in this session)');

const backendSamples = { skia: [] as number[], dot: [] as number[] };
for (let i = 0; i < 20; i++) {
  const dotT = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend: 'dot-buffer' });
  backendSamples.dot.push(dotT.rasterizeMs + dotT.bitpackMs);
  try {
    const skiaT = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend: 'skia' });
    backendSamples.skia.push(skiaT.rasterizeMs + skiaT.bitpackMs);
  } catch {
    // Host has no MakeOffscreen.
  }
}
backendSamples.dot.sort((a, b) => a - b);
console.log(
  `backend real-text host n=20 dot-buffer median=${backendSamples.dot[10].toFixed(3)}ms skia samples=${backendSamples.skia.length} (MakeOffscreen unavailable on host; default backend unchanged)`,
);
console.log(
  'glyph-cache proposal: only if on-device Skia drawMs is the majority of rasterizeMs. Host dot-buffer draw is not the bottleneck.',
);

const bad = createPhase4FrozenDocument();
bad.elements.push({
  id: 'bad-table',
  type: 'table',
  ...DEFAULT_ELEMENT_STATE,
  rowHeights: [5],
  columnWidths: [10],
  cells: [[{ text: 'x' }]],
  lineWidth: 0.3,
  left: 0,
  top: 0,
  width: 10,
  height: 5,
  lockMovement: false,
  needPrinting: true,
  drawingColorIndex: 1,
  rotation: 0,
} as unknown as LabelElement);
assert.throws(() => rasterizeDocumentToBitmap(bad, DPI, { backend: 'dot-buffer' }), /Unsupported print element type: table/);
console.log('4.1 unsupported table throws');

console.log('\nStage A host checks finished. GATE-A remains unsigned.');
