import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTd404MonoBuffer,
  td404PackedPageDots,
} from '@/printing/raster/td404-mono-validate';

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
