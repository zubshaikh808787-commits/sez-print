import assert from 'node:assert/strict';

import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { composeUpsDocument } from '@/lib/label-document';
import { structureTwoUpsCircleDocument } from '@/lib/multi-up-circle';
import { canHeadlessRasterPrint } from '@/printing/raster/skia-rasterizer';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const doc = createIndustryTemplateDocument({
  name: "2 UP's-Circle-30",
  category: 'Multi-UP',
  widthMm: 62,
  heightMm: 30,
  previewType: 'two-ups-circle-30',
});

assert.equal(doc.mediaShape, 'circle');
assert.ok(doc.ups?.columns === 2);
assert.equal(doc.widthMm, 30);
assert.equal(doc.heightMm, 30);

const composed = composeUpsDocument(doc);
assert.equal(composed.widthMm, 62);
assert.equal(composed.upsPrintCell?.mediaShape, 'circle');
const borders = composed.elements.filter((el) => el.type === 'border');
assert.equal(borders.length, 0);

assert.equal(canHeadlessRasterPrint(composed), true);
rasterizeDocumentToBitmapTimed(composed, 304, { threshold: 160 });

const legacy = createIndustryTemplateDocument({
  name: 'flat',
  category: 'Multi-UP',
  widthMm: 62,
  heightMm: 30,
  previewType: 'two-ups-circle-30',
});
legacy.ups = undefined;
const migrated = structureTwoUpsCircleDocument(legacy);
assert.ok(migrated.ups?.columns === 2);

console.log('ok multi-up-circle');
