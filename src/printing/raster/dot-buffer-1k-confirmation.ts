/**
 * 1000-run on-device confirmation of the forced dot-buffer rasterizer.
 * Does not change rasterizer internals.
 */

import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { unpackMono1bppToGray } from './bit-packer';
import {
  CONFIRMATION_FIXTURES,
  type ConfirmationFixture,
  type ConfirmationFixtureId,
  type SymbolCrop,
} from './confirmation-fixtures';
import { rasterizeDocumentToBitmapTimed, type RasterBitmap } from './skia-rasterizer';
import * as zxing from '@zxing/library';

const DPI = 304;
const DPM = 12;
const COUNTED_RUNS = 1000;
const BACKEND = 'dot-buffer' as const;

export type DominantPhase = 'alloc' | 'encode' | 'draw' | 'pack';

export type ConfirmationRunRow = {
  runIndex: number;
  fixtureId: ConfirmationFixtureId;
  backend: typeof BACKEND;
  totalMs: number;
  allocMs: number;
  encodeMs: number;
  drawMs: number;
  readbackMs: number;
  packMs: number;
  dominantPhase: DominantPhase;
  heapBytes: number | null;
  decodeChecked: boolean;
  decodePass: boolean | null;
  code128: string | null;
  qr: string | null;
  inkBits: number | null;
};

function readHermesHeap(): number | null {
  const hi = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => { js_heapSize: number } } })
    .HermesInternal;
  if (!hi?.getInstrumentedStats) return null;
  try {
    return hi.getInstrumentedStats().js_heapSize;
  } catch {
    return null;
  }
}

function tryGc(): boolean {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== 'function') return false;
  try {
    gc();
    return true;
  } catch {
    return false;
  }
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function dominantPhase(row: {
  allocMs: number;
  encodeMs: number;
  drawMs: number;
  packMs: number;
}): DominantPhase {
  const pairs: [DominantPhase, number][] = [
    ['alloc', row.allocMs],
    ['encode', row.encodeMs],
    ['draw', row.drawMs],
    ['pack', row.packMs],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0][0];
}

function cropGray(
  gray: Uint8Array,
  pageW: number,
  crop: SymbolCrop,
): { lum: Uint8ClampedArray; width: number; height: number } {
  const x = Math.round(crop.xMm * DPM);
  const y = Math.round(crop.yMm * DPM);
  const w = Math.round(crop.wMm * DPM);
  const h = Math.round(crop.hMm * DPM);
  const lum = new Uint8ClampedArray(w * h);
  for (let row = 0; row < h; row++) {
    const src = (y + row) * pageW + x;
    lum.set(gray.subarray(src, src + w), row * w);
  }
  return { lum, width: w, height: h };
}

function decodeLum(lum: Uint8ClampedArray, width: number, height: number, qr: boolean): string {
  const source = new zxing.RGBLuminanceSource(lum, width, height);
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(source));
  const reader = new zxing.MultiFormatReader();
  const hints = new Map<zxing.DecodeHintType, unknown>();
  hints.set(
    zxing.DecodeHintType.POSSIBLE_FORMATS,
    qr ? [zxing.BarcodeFormat.QR_CODE] : [zxing.BarcodeFormat.CODE_128],
  );
  hints.set(zxing.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader.decode(bitmap).getText();
}

function countInkBits(bits: RasterBitmap): number {
  let n = 0;
  for (const b of bits.mono1bppBuffer) {
    let v = b;
    while (v) {
      n += v & 1;
      v >>= 1;
    }
  }
  return n;
}

function decodeFixture(fixture: ConfirmationFixture, bits: RasterBitmap): {
  pass: boolean;
  code128: string | null;
  qr: string | null;
  inkBits: number;
} {
  const inkBits = countInkBits(bits);
  if (!fixture.code128 && !fixture.qr) {
    return { pass: inkBits > 0, code128: null, qr: null, inkBits };
  }
  try {
    const gray = unpackMono1bppToGray(
      bits.mono1bppBuffer,
      bits.widthDots,
      bits.heightDots,
      bits.bytesPerRow,
    );
    let code128: string | null = null;
    let qr: string | null = null;
    let pass = true;
    if (fixture.code128) {
      const crop = cropGray(gray, bits.widthDots, fixture.code128);
      code128 = decodeLum(crop.lum, crop.width, crop.height, false);
      pass = pass && code128 === fixture.code128.payload;
    }
    if (fixture.qr) {
      const crop = cropGray(gray, bits.widthDots, fixture.qr);
      qr = decodeLum(crop.lum, crop.width, crop.height, true);
      pass = pass && qr === fixture.qr.payload;
    }
    return { pass, code128, qr, inkBits };
  } catch {
    return {
      pass: false,
      code128: null,
      qr: null,
      inkBits,
    };
  }
}

function shouldSpotCheck(runIndex: number): boolean {
  return runIndex % 100 === 0 || (runIndex - 1) % 100 < 5;
}

export function formatConfirmationCsv(rows: ConfirmationRunRow[]): string {
  const header = [
    'run_index',
    'fixture_id',
    'backend',
    'total_ms',
    'alloc_ms',
    'encode_ms',
    'draw_ms',
    'readback_ms',
    'pack_ms',
    'dominant_phase',
    'heap_bytes',
    'decode_checked',
    'decode_pass',
    'code128',
    'qr',
    'ink_bits',
  ].join(',');
  const body = rows.map((r) =>
    [
      r.runIndex,
      r.fixtureId,
      r.backend,
      r.totalMs.toFixed(3),
      r.allocMs.toFixed(3),
      r.encodeMs.toFixed(3),
      r.drawMs.toFixed(3),
      r.readbackMs.toFixed(3),
      r.packMs.toFixed(3),
      r.dominantPhase,
      r.heapBytes ?? '',
      r.decodeChecked ? '1' : '0',
      r.decodePass === null ? '' : r.decodePass ? '1' : '0',
      r.code128 ?? '',
      r.qr ?? '',
      r.inkBits ?? '',
    ].join(','),
  );
  return [header, ...body].join('\n') + '\n';
}

export async function runDotBuffer1kConfirmation(): Promise<{
  device: { model: string | null; os: string };
  backend: typeof BACKEND;
  gcAvailable: boolean;
  warmupDiscarded: boolean;
  rows: ConfirmationRunRow[];
  csv: string;
}> {
  const gcAvailable = tryGc();
  const warmupFixture = CONFIRMATION_FIXTURES[0];
  const warmup = rasterizeDocumentToBitmapTimed(warmupFixture.document, DPI, {
    threshold: 160,
    backend: BACKEND,
  });
  if (warmup.backend !== BACKEND) {
    throw new Error(`expected backend ${BACKEND}, got ${warmup.backend}`);
  }
  tryGc();

  const rows: ConfirmationRunRow[] = [];
  for (let i = 0; i < COUNTED_RUNS; i++) {
    const runIndex = i + 1;
    const fixture = CONFIRMATION_FIXTURES[i % CONFIRMATION_FIXTURES.length];
    const t = rasterizeDocumentToBitmapTimed(fixture.document, DPI, {
      threshold: 160,
      backend: BACKEND,
    });
    const totalMs = t.rasterizeMs + t.bitpackMs;
    const phases = {
      allocMs: t.allocMs,
      encodeMs: t.encodeMs,
      drawMs: t.drawMs,
      packMs: t.packMs,
    };
    const check = shouldSpotCheck(runIndex);
    let decodePass: boolean | null = null;
    let code128: string | null = null;
    let qr: string | null = null;
    let inkBits: number | null = null;
    if (check) {
      const decoded = decodeFixture(fixture, t.result);
      decodePass = decoded.pass;
      code128 = decoded.code128;
      qr = decoded.qr;
      inkBits = decoded.inkBits;
    }
    rows.push({
      runIndex,
      fixtureId: fixture.id,
      backend: BACKEND,
      totalMs,
      allocMs: t.allocMs,
      encodeMs: t.encodeMs,
      drawMs: t.drawMs,
      readbackMs: t.readbackMs,
      packMs: t.packMs,
      dominantPhase: dominantPhase(phases),
      heapBytes: readHermesHeap(),
      decodeChecked: check,
      decodePass,
      code128,
      qr,
      inkBits,
    });
    if (runIndex % 10 === 0) {
      console.warn(`[DOT-1K] progress ${runIndex}/${COUNTED_RUNS}`);
      await yieldTick();
    }
  }

  return {
    device: {
      model: Device.modelName,
      os: `${Platform.OS} ${String(Platform.Version)}`,
    },
    backend: BACKEND,
    gcAvailable,
    warmupDiscarded: true,
    rows,
    csv: formatConfirmationCsv(rows),
  };
}
