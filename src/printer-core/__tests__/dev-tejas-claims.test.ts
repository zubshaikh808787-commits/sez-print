import assert from 'node:assert/strict';

// Deliberately NOT importing the driver classes from `@/printer-dev` /
// `@/printer-tejas`: those pull in the `dev-printer` / `td404-printer` native
// wrappers, which import `react-native` at module scope. `react-native`'s Flow
// syntax cannot be transformed by tsx/esbuild outside a Metro bundle, so — same
// as the existing `test:labelx` suite — this test exercises the RN-free
// heuristics directly. `claims()` on both drivers is a one-line wrapper over
// these functions, so the collision property tested here is exactly what
// discovery relies on.
import { isLikelyDevName, isLikelyTd404Name } from '@/lib/printer/printer-heuristics';
import { resolveProfile } from '../profiles';

console.log('--- DEV / TEJAS claim isolation ---');

const names = [
  'Seznik Dev 001',
  'Seznik_Dev-14',
  'Tejas TD-404',
  'Rudra Label Printer',
  'SEZNIK MiniX GD985', // neither DEV nor TEJAS
  'JOSH LP08',
];

// The whole point of claims() + specificity is that a real device name is never
// claimed by two brand drivers at once when the heuristics agree — if it were,
// discovery's tie-break would be silently papering over a naming collision.
for (const name of names) {
  const claimedByDev = isLikelyDevName(name);
  const claimedByTejas = isLikelyTd404Name(name);
  assert.ok(
    !(claimedByDev && claimedByTejas),
    `"${name}" must not be claimed by both DEV and TEJAS (dev=${claimedByDev}, tejas=${claimedByTejas})`,
  );
}
console.log('✓ No device name is double-claimed by DEV and TEJAS');

assert.equal(isLikelyDevName('Seznik Dev 001'), true);
assert.equal(isLikelyTd404Name('Tejas TD-404'), true);
assert.equal(isLikelyTd404Name('Rudra Label Printer'), true);
assert.equal(isLikelyDevName('Tejas TD-404'), false);
assert.equal(isLikelyTd404Name('Seznik Dev 001'), false);
console.log("✓ Each brand's heuristic claims its own name and stays out of the other's");

const devProfile = resolveProfile('dev', 'Seznik Dev 001');
const tejasProfile = resolveProfile('tejas', 'Tejas TD-404');
assert.equal(devProfile?.model, 'DEV-7299');
assert.equal(devProfile?.dpi, 203);
assert.equal(tejasProfile?.model, 'TD-404');
assert.equal(tejasProfile?.dpi, 304, "TD-404 head is 304 dpi, matching printPngLabelNative's 12 dots/mm table");
console.log('✓ Geometry resolves to the correct profile per brand, including the real 304 dpi head');

console.log('--- all DEV / TEJAS claim tests passed ---');
