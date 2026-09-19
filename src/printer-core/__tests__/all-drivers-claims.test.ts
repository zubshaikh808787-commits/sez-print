import assert from 'node:assert/strict';

import {
  isLikelyDevName,
  isLikelyJoshName,
  isLikelyLabelXName,
  isLikelyShaktiName,
  isLikelyTd404Name,
  isLikelyTezName,
} from '@/lib/printer/printer-heuristics';
import { resolveProfile } from '../profiles';

console.log('--- Multi-Brand Claims & Profile Resolution Tests ---');

// Test data representing typical broadcast names for each brand
const testCases = [
  // DEV 2-in-1
  { name: 'DEV-7299', brand: 'dev', expectedModel: 'DEV-7299', expectedDpi: 203 },
  { name: 'Seznik_Dev-14', brand: 'dev', expectedModel: 'DEV-7299', expectedDpi: 203 },
  { name: 'Veer-001', brand: 'dev', expectedModel: 'DEV-7299', expectedDpi: 203 },
  { name: 'POS-58 Printer', brand: 'dev', expectedModel: 'DEV-7299', expectedDpi: 203 },

  // TEJAS / RUDRA (TD-404)
  { name: 'Tejas TD-404', brand: 'tejas', expectedModel: 'TD-404', expectedDpi: 304 },
  { name: 'Rudra Label Printer', brand: 'tejas', expectedModel: 'TD-404', expectedDpi: 304 },
  { name: 'TD404-BT', brand: 'tejas', expectedModel: 'TD-404', expectedDpi: 304 },

  // JOSH (LPAPI)
  { name: 'JOSH LP08', brand: 'josh', expectedModel: 'JOSH-LP50', expectedDpi: 203 },
  { name: 'LPAPI-Printer-33', brand: 'josh', expectedModel: 'JOSH-LP50', expectedDpi: 203 },
  { name: 'DothanTech LP12', brand: 'josh', expectedModel: 'JOSH-LP50', expectedDpi: 203 },

  // LABELX / GD985 (LuckPrinter)
  { name: 'SEZNIK MiniX GD985', brand: 'labelx', expectedModel: 'GD985', expectedDpi: 203 },
  { name: 'LabelX-Pro', brand: 'labelx', expectedModel: 'GD985', expectedDpi: 203 },
  { name: 'LuckPrinter_GD985', brand: 'labelx', expectedModel: 'GD985', expectedDpi: 203 },

  // TEZ / SHAKTI (Flashlabel Y50)
  { name: 'Tez-108 Label', brand: 'tez', expectedModel: 'TEZ-108', expectedDpi: 203 },
  { name: 'Shakti-BT', brand: 'tez', expectedModel: 'TEZ-108', expectedDpi: 203 },
  { name: 'Flashlabel Y50', brand: 'tez', expectedModel: 'TEZ-108', expectedDpi: 203 },
  { name: 'TZ-100BT', brand: 'tez', expectedModel: 'TEZ-108', expectedDpi: 203 },
];

function getClaimingBrands(name: string): string[] {
  const claims: string[] = [];
  if (isLikelyLabelXName(name)) claims.push('labelx');
  if (isLikelyTd404Name(name)) claims.push('tejas');
  if (isLikelyJoshName(name)) claims.push('josh');
  if (isLikelyTezName(name) || isLikelyShaktiName(name)) claims.push('tez');
  if (isLikelyDevName(name)) claims.push('dev');
  return claims;
}

// 1. Test claim accuracy & isolation
for (const tc of testCases) {
  const claimed = getClaimingBrands(tc.name);
  assert.ok(
    claimed.includes(tc.brand),
    `"${tc.name}" must be claimed by "${tc.brand}", but was claimed by: [${claimed.join(', ')}]`,
  );
  assert.equal(
    claimed.length,
    1,
    `"${tc.name}" must be claimed by EXACTLY ONE brand, but was claimed by: [${claimed.join(', ')}]`,
  );
}
console.log('✓ All 5 brand heuristics uniquely claim their respective devices without conflict');

// 2. Test profile resolution and geometry
for (const tc of testCases) {
  const profile = resolveProfile(tc.brand, tc.name);
  assert.ok(profile, `Profile must be resolved for ${tc.brand} / "${tc.name}"`);
  assert.equal(profile.dpi, tc.expectedDpi, `DPI mismatch for ${tc.name}`);
  assert.ok(profile.headWidthDots > 0, `headWidthDots must be > 0 for ${tc.name}`);
  assert.ok(profile.maxWidthMm > 0, `maxWidthMm must be > 0 for ${tc.name}`);
}
console.log('✓ Geometry & profiles resolved accurately for all models across all 5 brands');

// 3. Test generic SPP fallback resolution
const genericProfile = resolveProfile('generic-spp', 'Unknown 58mm Thermal Printer');
assert.ok(genericProfile, 'Generic SPP profile should resolve fallback');
assert.equal(genericProfile.dpi, 203);
assert.equal(genericProfile.headWidthDots, 384);
console.log('✓ Generic SPP fallback profile resolved correctly');

console.log('--- All multi-brand claim and profile tests passed successfully! ---');
