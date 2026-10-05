import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import { darknessSteps, TD404_QUALITY_CAPS, qualityCapsFor } from '@/lib/printer/bridge-quality-caps';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import { mmToDots } from '@/lib/printer/print-spec';
import {
  applyInkDarkness,
  MAX_DARKER_STEPS,
  MAX_LIGHTER_STEPS,
  rectsToPx,
  scanCodeRectsMm,
} from '@/printing/raster/ink-darkness';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const countInk = (g: Uint8Array) => g.reduce((n, v) => n + (v < 128 ? 1 : 0), 0);

// darknessSteps: Auto and legacy bridges are 0; TD-404 is darkness − 10, clamped.
assert.equal(darknessSteps(null, TD404_QUALITY_CAPS), 0);
assert.equal(darknessSteps(10, TD404_QUALITY_CAPS), 0);
assert.equal(darknessSteps(15, TD404_QUALITY_CAPS), 5);
assert.equal(darknessSteps(0, TD404_QUALITY_CAPS), -10);
assert.equal(darknessSteps(40, TD404_QUALITY_CAPS), 5);
assert.equal(darknessSteps(12, qualityCapsFor('josh-lpapi')), 0);
assert.equal(MAX_DARKER_STEPS, 5);
assert.equal(MAX_LIGHTER_STEPS, 10);

// Synthetic page: 1-dot hairline, 4-dot stroke, solid 30×30 block. All pure 0/255, no AA.
const W = 120;
const H = 80;
const page = new Uint8Array(W * H).fill(255);
const fill = (x0: number, y0: number, w: number, h: number) => {
  for (let y = y0; y < y0 + h; y++) page.fill(0, y * W + x0, y * W + x0 + w);
};
fill(5, 10, 1, 60);
fill(15, 10, 4, 60);
fill(40, 20, 30, 30);

const base = applyInkDarkness(page, W, H, 160, 0);
assert.deepEqual(base, page, 'steps 0 is plain thresholding');
assert.notStrictEqual(base, page, 'input is not modified in place');

let prev = countInk(base);
for (let s = 1; s <= MAX_DARKER_STEPS; s++) {
  const out = applyInkDarkness(page, W, H, 160, s);
  const n = countInk(out);
  assert.ok(n > prev, `darker step ${s} adds ink (${n} > ${prev})`);
  for (let i = 0; i < page.length; i++) if (page[i] === 0) assert.equal(out[i], 0, 'growth never removes ink');
  prev = n;
}
const hairline15 = applyInkDarkness(page, W, H, 160, 5);
let hairWidth = 0;
for (let x = 0; x < 12; x++) if (hairline15[40 * W + x] === 0) hairWidth++;
assert.equal(hairWidth, 6, 'darkness 15 turns a 1-dot hairline into 6 dots');
for (let s = 1; s <= MAX_DARKER_STEPS; s++) {
  const out = applyInkDarkness(page, W, H, 160, s);
  let w = 0;
  let left = -1;
  for (let x = 0; x < 12; x++) {
    if (out[40 * W + x] !== 0) continue;
    if (left < 0) left = x;
    w++;
  }
  assert.equal(w, 1 + s, `step ${s}: hairline is ${1 + s} dots`);
  assert.equal(left, 5 - Math.floor(s / 2), `step ${s}: growth alternates sides`);
}

prev = countInk(base);
for (let s = -1; s >= -MAX_LIGHTER_STEPS; s--) {
  const out = applyInkDarkness(page, W, H, 160, s);
  const n = countInk(out);
  assert.ok(n < prev, `lighter step ${s} removes ink (${n} < ${prev})`);
  prev = n;
  for (let y = 10; y < 70; y++) {
    assert.equal(out[y * W + 5], 0, 'hairline survives');
    assert.equal(out[y * W + 15], 0, 'stroke left edge survives');
    assert.equal(out[y * W + 18], 0, 'stroke right edge survives');
  }
  for (let x = 40; x < 70; x++) {
    assert.equal(out[20 * W + x], 0, 'block top edge stays solid');
    assert.equal(out[49 * W + x], 0, 'block bottom edge stays solid');
  }
}

const stroke0 = applyInkDarkness(page, W, H, 160, -10);
let strokeDropped = 0;
for (let y = 11; y < 69; y++) for (const x of [16, 17]) if (stroke0[y * W + x] === 255) strokeDropped++;
assert.ok(strokeDropped > 0, 'darkness 0 lightens a 4-dot stroke, not only solid blocks');

// Keep rects (barcodes / QR) are untouched and do not seed growth across their edge.
const keep = [{ x0: 38, y0: 18, w: 34, h: 34 }];
for (const s of [5, -10]) {
  const out = applyInkDarkness(page, W, H, 160, s, keep);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = x >= 38 && x < 72 && y >= 18 && y < 52;
      if (inside) assert.equal(out[y * W + x], base[y * W + x], `keep rect unchanged at ${x},${y} steps ${s}`);
    }
  }
  if (s > 0) {
    for (const x of [72, 73, 74]) assert.equal(out[35 * W + x], 255, 'block inside keep rect does not grow past it');
  }
}

// Threshold still decides what counts as ink first.
const grayPage = new Uint8Array(W * H).fill(255);
grayPage.fill(150, 10 * W, 11 * W);
assert.equal(countInk(applyInkDarkness(grayPage, W, H, 140, 2)), 0, 'gray 150 is paper at threshold 140');
assert.ok(countInk(applyInkDarkness(grayPage, W, H, 160, 2)) > W, 'gray 150 is ink at threshold 160 and grows');

// End to end through the rasterizer: border + line + barcode on a 40×30 mm TD-404 page.
const dpi = 304;
const doc = {
  id: 'dark',
  name: 'dark',
  widthMm: 40,
  heightMm: 30,
  orientation: 0,
  paperType: 'Label',
  mediaShape: 'rectangle',
  background: { type: 'color', color: '#FFFFFF' },
  settings: {},
  updatedAt: 0,
  elements: [
    { ...fullBleedBorderElement(40, 30), geometryVersion: 1 },
    {
      id: 'box',
      type: 'shape',
      shapeType: 'rectangle',
      left: 4,
      top: 4,
      width: 12,
      height: 8,
      lineWidth: 0.2,
      fill: false,
      needPrinting: true,
      drawingColorIndex: 0,
    },
    {
      id: 'bc',
      type: 'barcode',
      content: '0123456789',
      encodeMode: 'CODE-128',
      left: 4,
      top: 16,
      width: 30,
      height: 8,
      fontSize: 8,
      needPrinting: true,
    },
  ],
} as unknown as LabelDocument;

function render(steps?: number) {
  const t = rasterizeDocumentToBitmapTimed(doc, dpi, {
    backend: 'dot-buffer',
    bakeTd404Feed: true,
    ...(steps === undefined ? {} : { darknessSteps: steps }),
  });
  return { mono: t.result.mono1bppBuffer, w: t.result.widthDots, h: t.result.heightDots, bpr: t.result.bytesPerRow };
}

const auto = render();
assert.deepEqual(render(0).mono, auto.mono, 'darkness 10 (0 steps) is byte-identical to Auto');

const monoInk = (m: Uint8Array) => {
  let n = 0;
  for (const b of m) for (let v = b; v; v &= v - 1) n++;
  return n;
};
const inkByDarkness: number[] = [];
for (let d = 0; d <= 15; d++) inkByDarkness.push(monoInk(render(d - 10).mono));
for (let d = 1; d <= 15; d++) {
  assert.ok(inkByDarkness[d] > inkByDarkness[d - 1], `darkness ${d} prints more ink than ${d - 1}`);
}

const [bcMm] = scanCodeRectsMm(doc);
const [bcPx] = rectsToPx([bcMm], mmToDots(1, dpi), 1);
const bit = (m: Uint8Array, x: number, y: number) => (m[y * auto.bpr + (x >> 3)] >> (7 - (x & 7))) & 1;
for (const steps of [5, -10]) {
  const out = render(steps).mono;
  for (let y = Math.ceil(bcPx.y0); y < Math.floor(bcPx.y0 + bcPx.h); y++) {
    for (let x = Math.ceil(bcPx.x0); x < Math.floor(bcPx.x0 + bcPx.w); x++) {
      if (bit(out, x, y) !== bit(auto.mono, x, y)) {
        assert.fail(`barcode dot ${x},${y} changed at steps ${steps}`);
      }
    }
  }
}

console.log(`ok ink-darkness ink by darkness 0..15: ${inkByDarkness.join(' ')}`);
