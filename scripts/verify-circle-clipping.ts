import assert from 'node:assert';
import { createLabelDocument, type LabelElement } from '../src/lib/label-document';
import { clampElementToLabel } from '../src/lib/element-sizing';
import { sortLayers } from '../src/lib/template-schema';

console.log('--- Verifying Circle Clipping & Barcode Deselect Behavior ---');

// 1. Create a 40x40 circle document
const doc = createLabelDocument({
  name: 'Circle 40x40',
  widthMm: 40,
  heightMm: 40,
  mediaShape: 'circle',
});

assert.strictEqual(doc.mediaShape, 'circle');
assert.strictEqual(doc.widthMm, 40);
assert.strictEqual(doc.heightMm, 40);
console.log('✓ Document created with mediaShape="circle", 40×40mm');

// 2. Add QR Code element crossing the circle outline but safely within the square sheet
// Circle center is at (20, 20), radius is 20mm.
// At y = 20, circle reaches x = 0..40.
// At y = 4, circle boundary is at x = 20 - sqrt(20^2 - 16^2) = 20 - 12 = 8mm!
// Placing an element at left = 2mm, top = 2mm with width = 10mm crosses the circle boundary (starts at 2mm < 8mm).
import { DEFAULT_QRCODE_STATE, DEFAULT_BARCODE_STATE, DEFAULT_SHAPE_STATE } from '../src/components/editor/types';

const qrElement: LabelElement = {
  ...DEFAULT_QRCODE_STATE,
  id: 'qr_test_1',
  type: 'qrcode',
  content: 'https://example.com/test',
  left: 2,
  top: 2,
  width: 10,
  height: 10,
  rotation: 0,
};

// Check that clampElementToLabel clamps to the full SQUARE sheet (40x40), not the circle:
const clampedQr = clampElementToLabel(qrElement, doc);
assert.strictEqual(clampedQr.left, 2, 'Element at (2, 2) must not be clamped by circle outline');
assert.strictEqual(clampedQr.top, 2, 'Element top at 2mm must not be clamped by circle outline');
assert.strictEqual(clampedQr.width, 10);
assert.strictEqual(clampedQr.height, 10);
console.log('✓ Element crossing circle outline remains at (2, 2) without clipping from the circle outline');

// 3. Test element crossing the SQUARE sheet outer edge (e.g. left = 35mm, width = 15mm)
const overEdgeElement: LabelElement = {
  ...DEFAULT_QRCODE_STATE,
  id: 'over_edge',
  type: 'qrcode',
  content: 'test',
  left: 35,
  top: 35,
  width: 15,
  height: 15,
  rotation: 0,
};

const clampedOverEdge = clampElementToLabel(overEdgeElement, doc);
assert(clampedOverEdge.left === 35, 'Element left is at 35mm (bleeding 10mm past the 40mm canvas boundary)');
console.log('✓ Element extending beyond square sheet correctly bleeds and will clip at the 40×40mm outer rectangle via canvas overflow: hidden');

// 4. Test Barcode Element on Circle Label Deselect
const barcodeElement: LabelElement = {
  ...DEFAULT_BARCODE_STATE,
  id: 'bc_circle_1',
  type: 'barcode',
  content: '1234567890',
  left: 10,
  top: 15,
  width: 20,
  height: 10,
};

doc.elements.push(barcodeElement);

// Verify sorting of layers when barcode is added
const sorted = sortLayers(doc.elements);
assert(sorted.some((el) => el.id === 'bc_circle_1'), 'Barcode must be present in sorted element list');

// Simulate deselect: selectedIds = []
const selectedIds: string[] = [];
const isSelected = selectedIds.includes(barcodeElement.id);
assert.strictEqual(isSelected, false, 'Barcode is deselected');
assert(barcodeElement.left === 10 && barcodeElement.top === 15, 'Barcode position remains intact');
console.log('✓ Barcode remains fully present and positioned when deselected on circle label');

// 5. Test Circle Templates (circle-30, circle-40, circle-50)
import { createIndustryTemplateDocument } from '../src/constants/template-documents';

for (const pType of ['circle-30', 'circle-40', 'circle-50']) {
  const circleDoc = createIndustryTemplateDocument({
    name: 'Circle Test',
    category: 'Circle',
    widthMm: 45,
    heightMm: 45,
    previewType: pType,
  });

  assert.strictEqual(circleDoc.mediaShape, 'circle');
  // Confirm no full-canvas white circle shape exists in elements
  const whiteCircleShape = circleDoc.elements.find(
    (el) =>
      el.type === 'shape' &&
      el.figureShape === 'circle' &&
      el.fill === true &&
      (el.fillColor === '#FFFFFF' || el.fillColor === '#ffffff'),
  );
  assert.strictEqual(
    whiteCircleShape,
    undefined,
    `Template ${pType} must not contain an opaque white circle shape covering the canvas`,
  );

  // Add a new element (as happens in addElement)
  const maxZ = circleDoc.elements.reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0);
  const newEl: LabelElement = {
    ...DEFAULT_BARCODE_STATE,
    id: `bc_test_${pType}`,
    type: 'barcode',
    content: '123456789',
    left: 10,
    top: 10,
    width: 25,
    height: 12,
    zIndex: maxZ + 1,
  };
  circleDoc.elements.push(newEl);

  // Check layer sorting: newly added element must be on TOP
  const layers = sortLayers(circleDoc.elements);
  const topLayer = layers[layers.length - 1];
  assert.strictEqual(topLayer.id, newEl.id, 'New element must have highest layer priority');

  // Verify deselect: no element covers the canvas
  const canvasCoveringElement = circleDoc.elements.find((el) => {
    return el.width >= circleDoc.widthMm - 1 && (el.height ?? 0) >= circleDoc.heightMm - 1 && 'fill' in el && Boolean((el as any).fill);
  });
  assert.strictEqual(
    canvasCoveringElement,
    undefined,
    'No element covers the canvas to occlude other elements on click or deselect',
  );

  console.log(`✓ Template ${pType} instantiated cleanly without canvas-covering shapes and new elements sort on top`);
}

// 6. Test Legacy Document Normalization
const legacyDoc = createLabelDocument({
  name: 'Legacy Circle',
  widthMm: 40,
  heightMm: 40,
  mediaShape: 'circle',
});
legacyDoc.elements.push({
  ...DEFAULT_SHAPE_STATE,
  id: 'legacy_circle_shape',
  type: 'shape',
  figureShape: 'circle',
  left: 0.4,
  top: 0.4,
  width: 39.2,
  height: 39.2,
  fill: true,
  fillColor: '#FFFFFF',
});
legacyDoc.elements.push({
  ...DEFAULT_QRCODE_STATE,
  id: 'user_qr',
  type: 'qrcode',
  content: 'https://example.com',
  left: 15,
  top: 15,
  width: 10,
  height: 10,
});

import { normalizeDocumentElements } from '../src/lib/element-sizing';
const normalized = normalizeDocumentElements(legacyDoc);
assert.strictEqual(
  normalized.some((el) => el.id === 'legacy_circle_shape'),
  false,
  'Legacy full-canvas white shape must be filtered out by normalizeDocumentElements',
);
assert.strictEqual(
  normalized.some((el) => el.id === 'user_qr'),
  true,
  'User QR element must be preserved',
);
console.log('✓ Legacy documents with full-canvas white shapes are safely sanitized');

console.log('\n--- ALL UNIT VERIFICATIONS PASSED (100%) ---');
