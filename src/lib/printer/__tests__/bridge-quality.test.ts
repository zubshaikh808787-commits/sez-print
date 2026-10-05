import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRIDGE_QUALITY_CAPS,
  TD404_QUALITY_CAPS,
  calibrationQualityWarning,
  clampToCap,
  formatScale,
  hasManualScale,
  isUntested,
  qualityCapsFor,
  resolveQualityBridge,
  scaleValueText,
  stepQuality,
  type BridgeId,
  type QualityScale,
} from '@/lib/printer/bridge-quality-caps';
import {
  resolvePrintQuality,
  type PrintQualityInput,
  type PrintQualityProfile,
} from '@/lib/printer/print-quality';
import { packGrayToMono1bpp } from '@/printing/raster/bit-packer';

// Capability table per bridge.
const td = qualityCapsFor('td404-spp');
assert.deepEqual(td.density, { min: 0, max: 15, step: 1, default: 10, label: 'Darkness' });
assert.deepEqual(td.speed, { min: 1, max: 7, step: 1, default: 3, testedMax: 3, label: 'Speed' });
assert.ok(hasManualScale(td));
const others: BridgeId[] = ['ble', 'wifi', 'josh-lpapi', 'tez-spp', 'dev-spp', 'labelx-spp'];
for (const bridge of others) {
  assert.deepEqual(BRIDGE_QUALITY_CAPS[bridge], { density: 'legacy', speed: 'legacy' }, bridge);
  assert.ok(!hasManualScale(qualityCapsFor(bridge)), `${bridge} keeps legacy controls`);
}
assert.ok(!hasManualScale(qualityCapsFor(null)), 'no bridge keeps legacy controls');

// Screen bridge falls back to the remembered TD-404 SPP link only.
assert.equal(resolveQualityBridge({ activeTransport: 'tez-spp', storeTransport: 'bluetooth-spp', sdkId: 'td404' }), 'tez-spp');
assert.equal(resolveQualityBridge({ activeTransport: null, storeTransport: 'bluetooth-spp', sdkId: 'td404' }), 'td404-spp');
assert.equal(resolveQualityBridge({ activeTransport: null, storeTransport: 'wifi', sdkId: 'td404' }), null);
assert.equal(resolveQualityBridge({ activeTransport: null, storeTransport: 'tez-spp', sdkId: 'tez' }), null);

// Clamping, including saved out-of-range values.
const density = TD404_QUALITY_CAPS.density as QualityScale;
const speed = TD404_QUALITY_CAPS.speed as QualityScale;
assert.deepEqual(clampToCap(null, density), { value: null, clamped: false }, 'Auto passes through');
assert.deepEqual(clampToCap(10, density), { value: 10, clamped: false });
assert.deepEqual(clampToCap(0, density), { value: 0, clamped: false });
assert.deepEqual(clampToCap(16, density), { value: 15, clamped: true });
assert.deepEqual(clampToCap(-2, density), { value: 0, clamped: true });
assert.deepEqual(clampToCap(8, speed), { value: 7, clamped: true }, 'saved Print-screen speed 8');
assert.deepEqual(clampToCap(0, speed), { value: 1, clamped: true });
assert.deepEqual(clampToCap(1.5, speed), { value: 2, clamped: true }, 'no half steps');
assert.deepEqual(clampToCap(20, 'legacy'), { value: 20, clamped: false }, 'legacy never clamps');

assert.equal(formatScale(10, density), 'Darkness 10 of 15');
assert.equal(formatScale(3, speed), 'Speed 3 of 7');
assert.equal(formatScale(null, speed), 'Speed Auto');
assert.ok(!isUntested(3, speed));
assert.ok(isUntested(4, speed));
assert.ok(!isUntested(null, speed));
assert.ok(!isUntested(15, density));

// Stepper: Auto enters Manual at the default; Manual stays inside the scale.
assert.equal(scaleValueText(null, density), 'Auto');
assert.equal(scaleValueText(10, density), '10 of 15');
assert.equal(stepQuality(null, density, 1), 10);
assert.equal(stepQuality(null, density, -1), 10);
assert.equal(stepQuality(null, speed, 1), 3);
assert.equal(stepQuality(15, density, 1), 15);
assert.equal(stepQuality(0, density, -1), 0);
assert.equal(stepQuality(1, speed, -1), 1);
assert.equal(stepQuality(7, speed, 1), 7);
assert.equal(stepQuality(3, speed, 1), 4);

// Frozen copy of resolvePrintQuality before bridge caps existed.
function resolveBefore(input: PrintQualityInput): PrintQualityProfile {
  const grayBase = Math.max(10, Math.min(250, input.grayThreshold ?? 160));
  const dither = !input.dieCut && input.colorMode === 'Halftone';
  if (input.jewelry || input.dieCut) {
    const d = input.darkness != null ? Math.max(1, Math.min(15, Math.round(input.darkness))) : 10;
    const threshold =
      input.darkness != null
        ? Math.min(205, Math.max(155, grayBase + (input.darkness - 8) * 5 + (input.jewelry ? 16 : 24)))
        : Math.min(195, Math.max(165, grayBase + (input.jewelry ? 12 : 20)));
    const s = input.speed != null ? Math.max(1, Math.min(8, input.speed)) : 2;
    return { density: d, threshold, speed: s, dither: false };
  }
  const d = input.darkness != null ? Math.max(1, Math.min(15, Math.round(input.darkness))) : 10;
  const threshold = Math.min(
    250,
    Math.max(140, grayBase + (input.darkness != null ? (input.darkness - 8) * 8 : 0)),
  );
  const s = input.speed != null ? Math.max(1, Math.min(8, input.speed)) : 3;
  return { density: d, threshold, speed: s, dither };
}

const darknessGrid: (number | null)[] = [null, ...Array.from({ length: 15 }, (_, i) => i + 1)];
const speedGrid: (number | null)[] = [null, 1, 2, 3, 4, 5, 6, 7, 8];
const jobKinds = [
  {},
  { dieCut: true },
  { dieCut: true, jewelry: true },
  { colorMode: 'Halftone' },
  { grayThreshold: 190 },
];

// Other bridges are unchanged: legacy caps (and no caps) match the old function exactly.
for (const bridge of [null, ...others] as (BridgeId | null)[]) {
  const caps = qualityCapsFor(bridge);
  for (const kind of jobKinds) {
    for (const darkness of darknessGrid) {
      for (const s of speedGrid) {
        const input = { darkness, speed: s, ...kind };
        assert.deepEqual(resolvePrintQuality({ ...input, caps }), resolveBefore(input), `${bridge} ${JSON.stringify(input)}`);
        assert.deepEqual(resolvePrintQuality(input), resolveBefore(input));
      }
    }
  }
}

// Auto is unchanged on TD-404: same density, threshold, speed (die-cut speed 2 included).
for (const kind of jobKinds) {
  const input = { darkness: null, speed: null, ...kind };
  assert.deepEqual(resolvePrintQuality({ ...input, caps: td }), resolveBefore(input), JSON.stringify(kind));
}
assert.equal(resolvePrintQuality({ darkness: null, speed: null, caps: td }).density, 10);
assert.equal(resolvePrintQuality({ darkness: null, speed: null, caps: td }).speed, 3);
assert.equal(resolvePrintQuality({ darkness: null, speed: null, dieCut: true, caps: td }).speed, 2);

// TD-404 Manual: DENSITY follows darkness 0-15 and the bitmap follows too. Darkness 10
// (the default) prints exactly like Auto; every step away moves the threshold.
for (const kind of jobKinds) {
  const autoQ = resolveBefore({ darkness: null, speed: null, ...kind });
  const at = (darkness: number) => resolvePrintQuality({ darkness, speed: null, ...kind, caps: td });
  assert.deepEqual(at(10), autoQ, `manual 10 == Auto ${JSON.stringify(kind)}`);
  let prev = -1;
  for (let darkness = 0; darkness <= 15; darkness++) {
    const q = at(darkness);
    assert.equal(q.density, darkness);
    assert.ok(q.threshold > prev, `threshold rises with darkness ${darkness} ${JSON.stringify(kind)}`);
    prev = q.threshold;
  }
  assert.ok(at(15).threshold > autoQ.threshold && at(5).threshold < autoQ.threshold);
}
assert.equal(resolvePrintQuality({ darkness: 15, speed: null, caps: td }).threshold, 200);
assert.equal(resolvePrintQuality({ darkness: 5, speed: null, caps: td }).threshold, 120);
assert.equal(resolvePrintQuality({ darkness: 0, speed: null, caps: td }).threshold, 80);

// The packed bitmap gets more ink as darkness rises (anti-aliased text edges are gray).
const ramp = Uint8Array.from({ length: 256 }, (_, i) => i);
const inkAt = (darkness: number) => {
  const { threshold } = resolvePrintQuality({ darkness, speed: null, caps: td });
  const { mono1bppBuffer } = packGrayToMono1bpp(ramp, 256, 1, threshold);
  return mono1bppBuffer.reduce((n, byte) => n + byte.toString(2).split('1').length - 1, 0);
};
assert.ok(inkAt(0) < inkAt(5) && inkAt(5) < inkAt(10) && inkAt(10) < inkAt(15), 'ink rises with darkness');
assert.equal(resolvePrintQuality({ darkness: 20, speed: 9, caps: td }).density, 15);
assert.equal(resolvePrintQuality({ darkness: 20, speed: 9, caps: td }).speed, 7);
assert.equal(resolvePrintQuality({ darkness: null, speed: 1, caps: td }).speed, 1);
assert.equal(resolvePrintQuality({ darkness: null, speed: 7, caps: td }).speed, 7);
assert.equal(resolvePrintQuality({ darkness: null, speed: 5, dieCut: true, caps: td }).speed, 5);

// Calibration warning: only when recorded density/speed differ from this print's.
assert.equal(calibrationQualityWarning(undefined, { density: 10, speed: 3 }), null);
assert.equal(calibrationQualityWarning({ hOffsetMm: 0.5 } as { density?: number }, { density: 10, speed: 3 }), null, 'old entries without values');
assert.equal(calibrationQualityWarning({ density: 10, speed: 3 }, { density: 10, speed: 3 }), null);
const warn = calibrationQualityWarning({ density: 10, speed: 3 }, { density: 15, speed: 3 });
assert.ok(warn?.includes('darkness 10, speed 3'), warn ?? '');
assert.ok(warn?.includes('darkness 15, speed 3'));
assert.ok(calibrationQualityWarning({ density: 10, speed: 3 }, { density: 10, speed: 5 }));
assert.ok(calibrationQualityWarning({ density: 0, speed: 1 }, { density: 10, speed: 3 }), 'zero is a recorded value');

// Header lines. Td404PrinterModule builds them in Kotlin; this copies its format, and the
// source check below fails if the Kotlin format changes.
const td404QualityHeader = (density: number, speed: number) =>
  `SPEED ${Math.trunc(speed)}\r\nDENSITY ${Math.trunc(density)}\r\n`;
const kt = readFileSync(
  join(process.cwd(), 'modules/td404-printer/android/src/main/java/expo/modules/td404printer/Td404PrinterModule.kt'),
  'utf8',
);
const count = (needle: string) => kt.split(needle).length - 1;
assert.equal(count('"SPEED $speed\\r\\n" +'), 2, 'PNG and mono jobs write SPEED $speed');
assert.equal(count('"DENSITY $density\\r\\n" +'), 2, 'PNG and mono jobs write DENSITY $density');
assert.equal(count('val density = (options["density"] as? Number)?.toInt() ?: 10'), 2);
assert.equal(count('val speed = (options["speed"] as? Number)?.toInt() ?: 3'), 2);

for (const [d, expected] of [[0, 'DENSITY 0\r\n'], [10, 'DENSITY 10\r\n'], [15, 'DENSITY 15\r\n']] as const) {
  const q = resolvePrintQuality({ darkness: d, speed: null, caps: td });
  assert.ok(td404QualityHeader(q.density, q.speed).endsWith(expected), `density ${d}`);
}
for (const [s, expected] of [[1, 'SPEED 1\r\n'], [3, 'SPEED 3\r\n'], [7, 'SPEED 7\r\n']] as const) {
  const q = resolvePrintQuality({ darkness: null, speed: s, caps: td });
  assert.ok(td404QualityHeader(q.density, q.speed).startsWith(expected), `speed ${s}`);
}

// Auto leaves the header byte-identical to before (normal and die-cut jobs).
for (const kind of jobKinds) {
  const before = resolveBefore({ darkness: null, speed: null, ...kind });
  const after = resolvePrintQuality({ darkness: null, speed: null, ...kind, caps: td });
  assert.equal(td404QualityHeader(after.density, after.speed), td404QualityHeader(before.density, before.speed));
}
assert.equal(td404QualityHeader(10, 3), 'SPEED 3\r\nDENSITY 10\r\n');

console.log('ok bridge-quality');
