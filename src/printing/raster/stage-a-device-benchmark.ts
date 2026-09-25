/**
 * GATE-A on-device benchmarks — Tasks 4.4, 4.4b, 4.6, plus sub-phase profile.
 * No printer. Run from /stage-a-gates on a dev build.
 */

import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { packGrayToMono1bpp } from './bit-packer';
import { decodeStageAFrozenBuffer, type StageADecodeResult } from './stage-a-decode';
import {
  createPhase4FrozenDocument,
  packedPageDots,
  rasterizeDocumentToBitmapTimed,
  type RasterBitmap,
  type RasterizeTiming,
} from './skia-rasterizer';
import {
  activeRasterizerBackend,
  probeSkiaOffscreenDetailed,
  type RasterSurfaceBackend,
  type SkiaOffscreenProbe,
} from './skia-surface';

const DPI = 304;
const FIXTURE = createPhase4FrozenDocument();
const GATE_MS = 15;
const SPEED_RUNS = 50;
const HEAP_RUNS = 100;
const PACK_MICRO_RUNS = 50;

export type SpeedRunRow = {
  run: number;
  allocMs: number;
  encodeMs: number;
  drawMs: number;
  readbackMs: number;
  packMs: number;
  rasterizeMs: number;
  bitpackMs: number;
  totalMs: number;
};

export type HeapRunRow = {
  run: number;
  jsHeapBytes: number;
};

export type PhaseSummary = {
  backend: RasterSurfaceBackend;
  warmupDiscarded: boolean;
  runs: SpeedRunRow[];
  allocMedianMs: number;
  allocP95Ms: number;
  encodeMedianMs: number;
  encodeP95Ms: number;
  drawMedianMs: number;
  drawP95Ms: number;
  readbackMedianMs: number;
  readbackP95Ms: number;
  packMedianMs: number;
  packP95Ms: number;
  totalMedianMs: number;
  totalP95Ms: number;
  gate15ms: 'pass' | 'fail';
};

export type PackMicrobench = {
  n: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  grayBytes: number;
};

export type StageADeviceReport = {
  probe: SkiaOffscreenProbe;
  device: {
    model: string | null;
    os: string;
    platform: string;
  };
  task44b:
    | (StageADecodeResult & { backend: RasterSurfaceBackend; inkBits: number })
    | { aborted: true; reason: string };
  task44: PhaseSummary | { aborted: true; reason: string };
  task44Dot: PhaseSummary | { aborted: true; reason: string };
  packOnly: PackMicrobench | { aborted: true; reason: string };
  task46: {
    gcAttempted: boolean;
    gcAvailable: boolean;
    warmupRasterize: boolean;
    runs: HeapRunRow[];
    firstHeapBytes: number;
    lastHeapBytes: number;
    peakHeapBytes: number;
    minHeapBytes: number;
    deltaBytes: number;
    sustainedGrowth: boolean;
    gateZeroGrowth: 'pass' | 'fail' | 'unavailable';
  } | { aborted: true; reason: string };
};

type HermesStats = { js_heapSize: number };

function readHermesHeap(): number | null {
  const hi = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } })
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

function median(sorted: number[]): number {
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function p95(sorted: number[]): number {
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx] ?? 0;
}

function rowFromTiming(run: number, t: RasterizeTiming): SpeedRunRow {
  return {
    run,
    allocMs: t.allocMs,
    encodeMs: t.encodeMs,
    drawMs: t.drawMs,
    readbackMs: t.readbackMs,
    packMs: t.packMs,
    rasterizeMs: t.rasterizeMs,
    bitpackMs: t.bitpackMs,
    totalMs: t.rasterizeMs + t.bitpackMs,
  };
}

function summarizeRuns(backend: RasterSurfaceBackend, runs: SpeedRunRow[]): PhaseSummary {
  const pick = (key: keyof SpeedRunRow) => runs.map((r) => r[key] as number).sort((a, b) => a - b);
  const totalSorted = pick('totalMs');
  const totalP95Ms = p95(totalSorted);
  return {
    backend,
    warmupDiscarded: true,
    runs,
    allocMedianMs: median(pick('allocMs')),
    allocP95Ms: p95(pick('allocMs')),
    encodeMedianMs: median(pick('encodeMs')),
    encodeP95Ms: p95(pick('encodeMs')),
    drawMedianMs: median(pick('drawMs')),
    drawP95Ms: p95(pick('drawMs')),
    readbackMedianMs: median(pick('readbackMs')),
    readbackP95Ms: p95(pick('readbackMs')),
    packMedianMs: median(pick('packMs')),
    packP95Ms: p95(pick('packMs')),
    totalMedianMs: median(totalSorted),
    totalP95Ms,
    gate15ms: totalP95Ms < GATE_MS ? 'pass' : 'fail',
  };
}

function runSpeedBenchmark(backend: RasterSurfaceBackend): PhaseSummary {
  const runs: SpeedRunRow[] = [];
  rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend });
  for (let i = 0; i < SPEED_RUNS; i++) {
    const t = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend });
    runs.push(rowFromTiming(i + 1, t));
  }
  return summarizeRuns(backend, runs);
}

function runPackMicrobench(gray: Uint8Array, packedW: number, packedH: number): PackMicrobench {
  const needed = (packedW / 8) * packedH;
  const out = new Uint8Array(needed);
  packGrayToMono1bpp(gray, packedW, packedH, 160, out);
  const times: number[] = [];
  for (let i = 0; i < PACK_MICRO_RUNS; i++) {
    const t0 = performance.now();
    packGrayToMono1bpp(gray, packedW, packedH, 160, out);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    n: PACK_MICRO_RUNS,
    medianMs: median(times),
    p95Ms: p95(times),
    minMs: times[0] ?? 0,
    maxMs: times[times.length - 1] ?? 0,
    grayBytes: gray.length,
  };
}

function runHeapBenchmark(): StageADeviceReport['task46'] {
  const heap0 = readHermesHeap();
  if (heap0 === null) {
    return {
      gcAttempted: false,
      gcAvailable: false,
      warmupRasterize: false,
      runs: [],
      firstHeapBytes: 0,
      lastHeapBytes: 0,
      peakHeapBytes: 0,
      minHeapBytes: 0,
      deltaBytes: 0,
      sustainedGrowth: false,
      gateZeroGrowth: 'unavailable',
    };
  }

  const gcAvailable = tryGc();
  rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend: 'skia' });
  const gcAttempted = gcAvailable && tryGc();

  const reused: RasterBitmap = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, {
    threshold: 160,
    backend: 'skia',
  }).result;

  const runs: HeapRunRow[] = [];
  for (let i = 0; i < HEAP_RUNS; i++) {
    rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, target: reused, backend: 'skia' });
    const heap = readHermesHeap();
    runs.push({ run: i + 1, jsHeapBytes: heap ?? -1 });
  }

  const valid = runs.map((r) => r.jsHeapBytes).filter((b) => b >= 0);
  const firstHeapBytes = valid[0] ?? 0;
  const lastHeapBytes = valid[valid.length - 1] ?? 0;
  const peakHeapBytes = valid.length ? Math.max(...valid) : 0;
  const minHeapBytes = valid.length ? Math.min(...valid) : 0;
  const deltaBytes = lastHeapBytes - firstHeapBytes;

  const secondHalf = valid.slice(Math.floor(valid.length / 2));
  let climbs = 0;
  for (let i = 1; i < secondHalf.length; i++) {
    if (secondHalf[i] > secondHalf[i - 1]) climbs++;
  }
  const sustainedGrowth = deltaBytes > 0 && climbs >= Math.floor(secondHalf.length * 0.6);

  return {
    gcAttempted,
    gcAvailable,
    warmupRasterize: true,
    runs,
    firstHeapBytes,
    lastHeapBytes,
    peakHeapBytes,
    minHeapBytes,
    deltaBytes,
    sustainedGrowth,
    gateZeroGrowth: lastHeapBytes <= firstHeapBytes ? 'pass' : 'fail',
  };
}

function formatPhase(tag: string, phase: PhaseSummary): string[] {
  return [
    `${tag} backend=${phase.backend} n=${phase.runs.length} total median=${phase.totalMedianMs.toFixed(3)} p95=${phase.totalP95Ms.toFixed(3)} gate_15ms=${phase.gate15ms}`,
    `${tag} alloc median=${phase.allocMedianMs.toFixed(3)} p95=${phase.allocP95Ms.toFixed(3)}`,
    `${tag} encode median=${phase.encodeMedianMs.toFixed(3)} p95=${phase.encodeP95Ms.toFixed(3)}`,
    `${tag} draw median=${phase.drawMedianMs.toFixed(3)} p95=${phase.drawP95Ms.toFixed(3)}`,
    `${tag} readback median=${phase.readbackMedianMs.toFixed(3)} p95=${phase.readbackP95Ms.toFixed(3)}`,
    `${tag} pack median=${phase.packMedianMs.toFixed(3)} p95=${phase.packP95Ms.toFixed(3)}`,
  ];
}

export function runStageADeviceBenchmark(): StageADeviceReport {
  const probe = { ...probeSkiaOffscreenDetailed(), rasterizerBackend: activeRasterizerBackend() };

  const device = {
    model: Device.modelName,
    os: `${Platform.OS} ${String(Platform.Version)}`,
    platform: Platform.OS,
  };

  const aborted = (reason: string) =>
    ({
      probe,
      device,
      task44b: { aborted: true as const, reason },
      task44: { aborted: true as const, reason },
      task44Dot: { aborted: true as const, reason },
      packOnly: { aborted: true as const, reason },
      task46: { aborted: true as const, reason },
    }) satisfies StageADeviceReport;

  if (probe.apiAvailable && !probe.create600x360) {
    return aborted(probe.error ?? 'Skia.Surface.MakeOffscreen failed for 600×360 fixture');
  }

  const warmup = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, { threshold: 160, backend: 'skia' });
  if (warmup.backend !== 'skia') {
    return aborted(`4.4b requires live Skia backend, got ${warmup.backend}`);
  }

  let inkBits = 0;
  for (const b of warmup.result.mono1bppBuffer) {
    let v = b;
    while (v) {
      inkBits += v & 1;
      v >>= 1;
    }
  }

  const decoded = decodeStageAFrozenBuffer(warmup.result);
  const task44b = { ...decoded, backend: warmup.backend, inkBits };
  if (!decoded.pass) {
    const reason = `4.4b failed on Skia buffer: Code128=${decoded.code128 ?? 'null'} QR=${decoded.qr ?? 'null'}${decoded.error ? ` error=${decoded.error}` : ''}`;
    return {
      probe,
      device,
      task44b,
      task44: { aborted: true, reason },
      task44Dot: { aborted: true, reason },
      packOnly: { aborted: true, reason },
      task46: { aborted: true, reason },
    };
  }

  const task44 = runSpeedBenchmark('skia');
  const task44Dot = runSpeedBenchmark('dot-buffer');

  const { packedW, packedH } = packedPageDots(FIXTURE.widthMm, FIXTURE.heightMm, DPI);
  const packSource = rasterizeDocumentToBitmapTimed(FIXTURE, DPI, {
    threshold: 160,
    backend: 'dot-buffer',
  });
  const packOnly = runPackMicrobench(packSource.gray, packedW, packedH);

  const task46 = runHeapBenchmark();

  return { probe, device, task44b, task44, task44Dot, packOnly, task46 };
}

export function formatStageAReport(report: StageADeviceReport): string {
  const lines: string[] = [];
  lines.push('=== GATE-A on-device report ===');
  lines.push(`device=${report.device.model ?? 'unknown'} | ${report.device.os}`);
  lines.push(
    `probe api=${report.probe.apiAvailable} create600x360=${report.probe.create600x360} rasterizerBackend=${report.probe.rasterizerBackend}${report.probe.error ? ` error=${report.probe.error}` : ''}`,
  );

  if ('aborted' in report.task44b) {
    lines.push(`task44b ABORTED: ${report.task44b.reason}`);
  } else {
    lines.push(
      `task44b backend=${report.task44b.backend} ink_bits=${report.task44b.inkBits} Code128=${report.task44b.code128 ?? 'null'} QR=${report.task44b.qr ?? 'null'} pass=${report.task44b.pass}${report.task44b.error ? ` error=${report.task44b.error}` : ''}`,
    );
  }

  if ('aborted' in report.task44) {
    lines.push(`task44 skia ABORTED: ${report.task44.reason}`);
  } else {
    lines.push(...formatPhase('task44 skia', report.task44));
  }

  if ('aborted' in report.task44Dot) {
    lines.push(`task44 dot-buffer ABORTED: ${report.task44Dot.reason}`);
  } else {
    lines.push(...formatPhase('task44 dot-buffer', report.task44Dot));
  }

  if ('aborted' in report.packOnly) {
    lines.push(`pack-only ABORTED: ${report.packOnly.reason}`);
  } else {
    lines.push(
      `pack-only n=${report.packOnly.n} gray_bytes=${report.packOnly.grayBytes} median=${report.packOnly.medianMs.toFixed(3)} p95=${report.packOnly.p95Ms.toFixed(3)} min=${report.packOnly.minMs.toFixed(3)} max=${report.packOnly.maxMs.toFixed(3)}`,
    );
  }

  if ('aborted' in report.task46) {
    lines.push(`task46 ABORTED: ${report.task46.reason}`);
  } else {
    lines.push(
      `task46 gc=${report.task46.gcAvailable} gcAttempted=${report.task46.gcAttempted} first=${report.task46.firstHeapBytes} last=${report.task46.lastHeapBytes} delta=${report.task46.deltaBytes} sustainedGrowth=${report.task46.sustainedGrowth} gate=${report.task46.gateZeroGrowth}`,
    );
  }

  return lines.join('\n');
}

export function logStageAReport(report: StageADeviceReport): void {
  const body = formatStageAReport(report);
  for (const line of body.split('\n')) {
    console.warn(`[GATE-A] ${line}`);
  }
}
