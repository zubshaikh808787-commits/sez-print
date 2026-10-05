import assert from 'node:assert/strict';
import {
  BRIDGE_QUALITY_CAPS,
  TD404_QUALITY_CAPS,
  clampToCap,
  formatScale,
  hasManualScale,
  isUntested,
  qualityCapsFor,
  resolveQualityBridge,
  type BridgeId,
  type QualityScale,
} from '@/lib/printer/bridge-quality-caps';

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

console.log('ok bridge-quality');
