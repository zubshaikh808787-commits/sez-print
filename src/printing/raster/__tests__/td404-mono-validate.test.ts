import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTd404MonoBuffer,
  normalizeTd404MonoBuffer,
  td404PackedPageDots,
} from '@/printing/raster/td404-mono-validate';
import { createLabelDocument } from '@/lib/label-document';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';

const WIDTH_MM = 50;
const HEIGHT_MM = 30;
const DPI = 304;

test('matching packed buffer is accepted', () => {
  const { packedW, packedH } = td404PackedPageDots(WIDTH_MM, HEIGHT_MM, DPI);
  const bytesPerRow = packedW / 8;
  const monoBytes = new Uint8Array(bytesPerRow * packedH);
  assert.doesNotThrow(() =>
    assertTd404MonoBuffer({
      monoBytes,
      widthDots: packedW,
      heightDots: packedH,
      bytesPerRow,
      widthMm: WIDTH_MM,
      heightMm: HEIGHT_MM,
      dpi: DPI,
    }),
  );
});

test('rejects length that is not bytesPerRow * heightDots', () => {
  const { packedW, packedH } = td404PackedPageDots(WIDTH_MM, HEIGHT_MM, DPI);
  const bytesPerRow = packedW / 8;
  const monoBytes = new Uint8Array(bytesPerRow * packedH - 1);
  assert.throws(
    () =>
      assertTd404MonoBuffer({
        monoBytes,
        widthDots: packedW,
        heightDots: packedH,
        bytesPerRow,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
        dpi: DPI,
      }),
    /buffer length .* != bytesPerRow\*heightDots/,
  );
});

test('33 mm packs UP to a multiple of 8', () => {
  const { sizeDotsW, packedW } = td404PackedPageDots(33, 30, DPI);
  assert.equal(sizeDotsW, 396);
  assert.equal(packedW, 400);
});

test('99.0 x 149.5 mm packs UP 1188 → 1192', () => {
  const { sizeDotsW, sizeDotsH, packedW, packedH } = td404PackedPageDots(99, 149.5, DPI);
  assert.equal(sizeDotsW, 1188);
  assert.equal(sizeDotsH, 1794);
  assert.equal(packedW, 1192);
  assert.equal(packedH, 1794);
});

test('pack-down 99 mm buffer is padded to packedW and prints', () => {
  const { packedW, packedH } = td404PackedPageDots(99, 149.5, DPI);
  const srcBpr = 148;
  const src = new Uint8Array(srcBpr * packedH);
  src[0] = 0x80;
  const normalized = normalizeTd404MonoBuffer({
    monoBytes: src,
    widthDots: srcBpr * 8,
    heightDots: packedH,
    bytesPerRow: srcBpr,
    widthMm: 99,
    heightMm: 149.5,
    dpi: DPI,
  });
  assert.equal(normalized.widthDots, packedW);
  assert.equal(normalized.bytesPerRow, packedW / 8);
  assert.equal(normalized.monoBytes.length, (packedW / 8) * packedH);
  assert.equal(normalized.monoBytes[0], 0x80);
  assert.doesNotThrow(() => assertTd404MonoBuffer(normalized));
});

test('awkward millimetre sizes pack to a multiple of 8', () => {
  for (const [w, h] of [
    [99, 149.5],
    [33, 30],
    [37, 96],
    [14.3, 101.6],
    [54, 96],
    [50, 75],
    [80.5, 50],
  ] as const) {
    const { packedW, packedH } = td404PackedPageDots(w, h, DPI);
    assert.equal(packedW % 8, 0, `${w}x${h} packedW ${packedW}`);
    assert.ok(packedW >= 8);
    assert.ok(packedH >= 1);
    const doc = createLabelDocument({
      name: `${w}x${h}`,
      widthMm: w,
      heightMm: h,
      paperType: 'Label',
      elements: [],
    });
    const bmp = rasterizeDocumentToBitmap(doc, DPI, { threshold: 160, backend: 'dot-buffer' });
    assert.equal(bmp.widthDots, packedW, `${w}x${h} raster width`);
    assert.equal(bmp.bytesPerRow * 8, packedW, `${w}x${h} bytesPerRow`);
    assert.doesNotThrow(() =>
      assertTd404MonoBuffer({
        monoBytes: bmp.mono1bppBuffer,
        widthDots: bmp.widthDots,
        heightDots: bmp.heightDots,
        bytesPerRow: bmp.bytesPerRow,
        widthMm: w,
        heightMm: h,
        dpi: DPI,
      }),
    );
  }
});


test('rejects bytesPerRow*8 != packedW', () => {
  const { packedW, packedH } = td404PackedPageDots(WIDTH_MM, HEIGHT_MM, DPI);
  const bytesPerRow = packedW / 8 + 1;
  const monoBytes = new Uint8Array(bytesPerRow * packedH);
  assert.throws(
    () =>
      assertTd404MonoBuffer({
        monoBytes,
        widthDots: packedW,
        heightDots: packedH,
        bytesPerRow,
        widthMm: WIDTH_MM,
        heightMm: HEIGHT_MM,
        dpi: DPI,
      }),
    /bytesPerRow\*8 .* != packedW/,
  );
});
