import assert from 'node:assert/strict';
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

// TD-404 Manual: DENSITY follows darkness 0-15, threshold stays at Auto, speed 1-7.
for (const kind of jobKinds) {
  const autoThreshold = resolveBefore({ darkness: null, speed: null, ...kind }).threshold;
  for (const darkness of [0, 5, 10, 15]) {
    const q = resolvePrintQuality({ darkness, speed: null, ...kind, caps: td });
    assert.equal(q.density, darkness);
    assert.equal(q.threshold, autoThreshold, 'darkness does not move the threshold');
  }
}
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

console.log('ok bridge-quality');
