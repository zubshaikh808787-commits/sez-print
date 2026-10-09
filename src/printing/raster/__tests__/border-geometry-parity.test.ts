/**
 * Canvas border geometry vs final rasterized bitmap, in printer dots.
 * Run: npx --yes tsx --tsconfig tsconfig.json src/printing/raster/__tests__/border-geometry-parity.test.ts
 * BORDER_BASELINE=1 prints the table without failing (used to record pre-change numbers).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import { defaultBorderPlacement } from '@/lib/border-geometry';
import { createLabelDocument, generateId, mmToPt, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { createPrintSpec, mmToDots, PRINTER_PROFILES, tsplPackedWidthDots } from '@/lib/printer/print-spec';
import { encodeTscBitmapJob, inspectTsplJob } from '@/lib/printer/tsc';
import { borderElementsOf, expectedBorderDots, expectedStrokeDots, measureBorderInDots } from '@/printing/raster/border-measure';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';
import { stampPrintBordersOnGray } from '@/printing/raster/print-border';
import { buildBorderCalibrationDocument } from '@/printing/raster/border-calibration-label';

const DPI = 304;
const REPORT_ONLY = process.env.BORDER_BASELINE === '1';
const SIZES: Array<[number, number]> = [
  [20, 20],
  [30, 10],
  [50, 30],
  [50, 50],
  [60, 14],
  [60, 40],
  [100, 50],
  [99, 149.5],
];

type BorderEl = Extract<LabelElement, { type: 'border' }>;

function border(rect: Partial<BorderEl>): BorderEl {
  return {
    id: rect.id ?? generateId(),
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    rotation: 0,
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    lockMovement: true,
    needPrinting: true,
    drawingColorIndex: 0,
    geometryVersion: 1,
    ...rect,
  } as BorderEl;
}

function doc(w: number, h: number, elements: LabelElement[], mediaShape?: LabelDocument['mediaShape']): LabelDocument {
  return createLabelDocument({ name: `${w}x${h}`, widthMm: w, heightMm: h, paperType: 'Label', mediaShape, elements });
}

function raster(d: LabelDocument) {
  return rasterizeDocumentToBitmapTimed(d, DPI, { threshold: 160, backend: 'dot-buffer' });
}

const failures: string[] = [];
let checks = 0;

function checkBorders(label: string, d: LabelDocument) {
  const sizeW = mmToDots(d.widthMm, DPI);
  const sizeH = mmToDots(d.heightMm, DPI);
  for (const el of borderElementsOf(d)) {
    const only = { ...d, elements: [el] };
    const t = raster(only);
    const m = measureBorderInDots(t.gray, t.result.widthDots, sizeW, sizeH);
    const e = expectedBorderDots(el, DPI, d.widthMm, d.heightMm);
    const stroke = expectedStrokeDots(el, DPI);
    checks += 1;
    const box = m.box;
    const delta = box
      ? [box.x0 - e.x0, box.y0 - e.y0, box.x1 - e.x1, box.y1 - e.y1]
      : [NaN, NaN, NaN, NaN];
    const maxDelta = Math.max(...delta.map((v) => Math.abs(v)));
    const strokeOk =
      d.mediaShape === 'circle' || d.mediaShape === 'ellipse'
        ? true
        : m.strokeDots != null &&
          [m.strokeDots.left, m.strokeDots.right, m.strokeDots.top, m.strokeDots.bottom].every(
            (s) => Math.abs(s - stroke) <= 1,
          );
    const ok = maxDelta <= 1 && strokeOk && !m.touchesEdge;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} expected ${e.x0},${e.y0}-${e.x1},${e.y1} ` +
        `measured ${box ? `${box.x0},${box.y0}-${box.x1},${box.y1}` : 'none'} delta ${delta.join(',')} ` +
        `stroke ${stroke} vs ${m.strokeDots ? Object.values(m.strokeDots).join('/') : 'n/a'} clipped=${m.touchesEdge}`,
    );
    if (!ok) failures.push(label);
  }
}

console.log('--- border geometry: canvas rect vs bitmap (dots @ 304 dpi, 12 dots/mm) ---');
for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  checkBorders(`${tag} default locked`, doc(w, h, [border(defaultBorderPlacement(w, h))]));
  checkBorders(
    `${tag} moved+resized locked`,
    doc(w, h, [border({ left: 3, top: 1.5, width: w - 8, height: h - 5 })]),
  );
  checkBorders(
    `${tag} unlocked`,
    doc(w, h, [border({ left: 2.5, top: 3, width: w - 6, height: h - 5, lockMovement: false })]),
  );
  checkBorders(
    `${tag} untagged full-bleed`,
    doc(w, h, [border({ left: 0, top: 0, width: w, height: h, geometryVersion: undefined })]),
  );
  checkBorders(
    `${tag} untagged already-inset`,
    doc(w, h, [border({ left: 2, top: 2, width: w - 4, height: h - 4, geometryVersion: undefined })]),
  );
  checkBorders(`${tag} ellipse media`, doc(w, h, [border(defaultBorderPlacement(w, h))], 'ellipse'));
  checkBorders(`${tag} circle media`, doc(w, h, [border(defaultBorderPlacement(w, h))], 'circle'));
}
checkBorders(
  '100x30 two-up panels',
  doc(100, 30, [
    border({ left: 2, top: 2, width: 46, height: 26 }),
    border({ left: 52, top: 2, width: 46, height: 26 }),
  ]),
);

function text(left: number, top: number): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: generateId(),
    type: 'text',
    text: 'Parity',
    fontSize: mmToPt(3),
    left,
    top,
    width: 20,
    height: 5,
    needPrinting: true,
  } as LabelElement;
}
function qr(left: number, top: number): LabelElement {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: generateId(),
    type: 'qrcode',
    content: 'parity',
    left,
    top,
    width: 10,
    height: 10,
    needPrinting: true,
  } as LabelElement;
}
function barcode(left: number, top: number, width: number): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content: '123456',
    left,
    top,
    width,
    height: 8,
    needPrinting: true,
  } as LabelElement;
}

function sha(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}

/** Content-only bitmaps must not change when the border path changes. */
const contentDocs: Record<string, LabelDocument> = {
  'text 50x30': doc(50, 30, [text(6, 8)]),
  'qr 50x30': doc(50, 30, [qr(30, 6)]),
  'barcode 50x30': doc(50, 30, [barcode(4, 18, 28)]),
  'mixed 60x40': doc(60, 40, [text(5, 4), qr(42, 4), barcode(5, 24, 40)]),
};
const snapshotPath = join(__dirname, 'fixtures', 'non-border-hashes.json');
const hashes: Record<string, string> = {};
for (const [name, d] of Object.entries(contentDocs)) hashes[name] = sha(raster(d).result.mono1bppBuffer);
if (!existsSync(snapshotPath)) {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(hashes, null, 2) + '\n');
  console.log(`wrote non-border snapshot ${snapshotPath}`);
} else {
  const saved = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Record<string, string>;
  for (const name of Object.keys(contentDocs)) {
    checks += 1;
    const same = saved[name] === hashes[name];
    console.log(`${same ? 'ok  ' : 'FAIL'} non-border unchanged: ${name}`);
    if (!same) failures.push(`non-border ${name}`);
  }
}

/** Border + content: the border box comes from the border alone; content ink is a subset of the combined bitmap. */
for (const [w, h] of [
  [50, 30],
  [60, 40],
  [100, 50],
] as const) {
  const b = border(defaultBorderPlacement(w, h));
  const content = [text(5, 5), qr(w - 15, 5), barcode(5, h - 13, Math.min(30, w - 25))];
  const combined = raster(doc(w, h, [b, ...content]));
  const contentOnly = raster(doc(w, h, content));
  checks += 1;
  let missing = 0;
  for (let i = 0; i < contentOnly.result.mono1bppBuffer.length; i++) {
    const c = contentOnly.result.mono1bppBuffer[i];
    if ((combined.result.mono1bppBuffer[i] & c) !== c) missing += 1;
  }
  const ok = missing === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${w}x${h} border+text/QR/barcode keeps content ink (missing bytes ${missing})`);
  if (!ok) failures.push(`${w}x${h} combined`);
  checkBorders(`${w}x${h} border+content`, doc(w, h, [b, ...content]));
}

/** Pack-up columns beyond SIZE are white for every matrix size. */
for (const [w, h] of SIZES) {
  const t = raster(doc(w, h, [border(defaultBorderPlacement(w, h))]));
  const sizeW = mmToDots(w, DPI);
  const packedW = tsplPackedWidthDots(sizeW);
  checks += 1;
  let ink = 0;
  for (let y = 0; y < t.result.heightDots; y++) {
    for (let x = sizeW; x < packedW; x++) {
      if (t.result.mono1bppBuffer[y * t.result.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))) ink += 1;
    }
  }
  const ok = t.result.widthDots === packedW && t.result.bytesPerRow * 8 === packedW && ink === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${w}x${h} packed ${sizeW}->${packedW} dots, pad ink ${ink}`);
  if (!ok) failures.push(`${w}x${h} pad`);
}

/** GAP and H/V are media / printer calibration: header-only, the BITMAP payload is identical. */
{
  const d = doc(50, 30, [border(defaultBorderPlacement(50, 30)), text(6, 8)]);
  const bmp = raster(d).result;
  const bits = { bytesPerRow: bmp.bytesPerRow, height: bmp.heightDots, data: bmp.mono1bppBuffer };
  const payloads = new Set<string>();
  const headers = new Set<string>();
  for (const gapMm of [1, 2, 3]) {
    for (const [h, v] of [
      [0, 0],
      [0.5, -0.5],
    ] as const) {
      const spec = createPrintSpec({
        widthMm: 50,
        heightMm: 30,
        dpi: DPI,
        profile: PRINTER_PROFILES['td404-304'],
        gapMm,
        calibration: { horizontalOffsetMm: h, verticalOffsetMm: v },
      });
      const job = encodeTscBitmapJob(bits, {
        widthMm: 50,
        heightMm: 30,
        gapMm,
        x: spec.xOffsetDots,
        y: spec.yOffsetDots,
      });
      const info = inspectTsplJob(job);
      const payload = job.subarray(job.length - info.payloadBytes - '\r\nPRINT 1\r\n'.length, job.length - '\r\nPRINT 1\r\n'.length);
      payloads.add(sha(payload));
      headers.add(`${info.gapCommand}|${info.referenceCommand}`);
    }
  }
  checks += 1;
  const ok = payloads.size === 1 && headers.size === 6;
  console.log(`${ok ? 'ok  ' : 'FAIL'} GAP 1/2/3 and H/V change header only (payloads ${payloads.size}, headers ${headers.size})`);
  if (!ok) failures.push('gap/hv payload');
}

/** Calibration label rasterizes with its border exactly on the document rectangle. */
for (const [w, h] of SIZES) {
  checkBorders(`${w}x${h} calibration label`, buildBorderCalibrationDocument(w, h, { dpi: DPI, gapMm: 2, hOffsetMm: 0, vOffsetMm: 0 }));
}

/**
 * Image labels print through ViewShot with borders omitted, then stamped in
 * printer dots. The stamped border must be the same dots as the headless one.
 */
for (const [w, h] of SIZES) {
  const d = doc(w, h, [border({ left: 3, top: 1.5, width: w - 8, height: h - 5 })]);
  const t = raster(d);
  const packedW = t.result.widthDots;
  const sizeH = t.result.heightDots;
  const stamped = new Uint8Array(packedW * sizeH).fill(255);
  stampPrintBordersOnGray(stamped, packedW, sizeH, d, DPI, {
    labelWidthDots: mmToDots(w, DPI),
    labelHeightDots: mmToDots(h, DPI),
  });
  let diff = 0;
  for (let i = 0; i < stamped.length; i++) {
    if (stamped[i] < 160 !== t.gray[i] < 160) diff += 1;
  }
  checks += 1;
  const ok = diff === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${`${w}x${h} image-path stamp == headless`.padEnd(34)} differing dots ${diff}`);
  if (!ok) failures.push(`${w}x${h} stamp parity`);
}

console.log(`--- ${checks} checks, ${failures.length} failed ---`);
if (failures.length > 0 && !REPORT_ONLY) {
  assert.fail(`border parity failed: ${failures.join('; ')}`);
}
