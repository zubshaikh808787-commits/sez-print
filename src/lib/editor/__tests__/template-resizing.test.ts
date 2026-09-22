/**
 * Comprehensive test suite for Task 1.3: Modernize Template Resizing Engine.
 */

import { scaleDocumentToSize } from '@/lib/element-sizing';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
import type { LabelDocument, LabelElement } from '@/lib/label-document';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok ${msg}`);
}

console.log('--- Running Template Resizing Engine Tests ---');

// 1. Aggressive Height Reduction: 50x50mm -> 50x15mm
const textEl1: LabelElement = {
  id: 't1',
  type: 'text',
  text: 'Organic Cold Pressed Extra Virgin Olive Oil Premium Batch',
  left: 5,
  top: 5,
  width: 40,
  fontSize: 14,
  autoWrapping: 'Word',
  lineSpacing: '1.0',
} as unknown as LabelElement;

const qrEl1: LabelElement = {
  id: 'q1',
  type: 'qrcode',
  content: 'https://example.com/batch-1234',
  encodeMode: 'QRCode',
  left: 5,
  top: 25,
  width: 20,
  height: 20,
} as unknown as LabelElement;

const borderEl1: LabelElement = {
  id: 'b1',
  type: 'border',
  borderStyle: 'solid-medium',
  lineWidth: 1.0,
  left: 0,
  top: 0,
  width: 50,
  height: 50,
  lockMovement: true,
  needPrinting: true,
  rotation: 0,
  drawingColorIndex: 0,
} as unknown as LabelElement;

const doc50x50: LabelDocument = {
  id: 'doc-1',
  name: 'Olive Oil',
  orientation: 0,
  paperType: 'Label',
  widthMm: 50,
  heightMm: 50,
  mediaGeometry: { type: 'rectangle' },
  elements: [textEl1, qrEl1, borderEl1],
} as unknown as LabelDocument;

const scaled50x15 = scaleDocumentToSize(doc50x50, 50, 15);
const scaledText = scaled50x15.elements.find((el) => el.id === 't1') as Extract<LabelElement, { type: 'text' }>;
const scaledQr = scaled50x15.elements.find((el) => el.id === 'q1') as Extract<LabelElement, { type: 'qrcode' }>;
const scaledBorder = scaled50x15.elements.find((el) => el.id === 'b1') as Extract<LabelElement, { type: 'border' }>;

// 1a. Text height dynamic reflow & bounds
assert(scaledText !== undefined, 'Scaled text element exists');
assert(scaledText.fontSize !== undefined && scaledText.fontSize >= 4, `Text font size scaled proportionally (${scaledText.fontSize}pt)`);
assert(scaledText.height !== undefined && scaledText.height > 0, `Text height reflowed dynamically (${scaledText.height}mm)`);

// 1b. Text overflow detection under aggressive reduction
const textBounds = clampToLabelBounds(
  { left: scaledText.left, top: scaledText.top, width: scaledText.width, height: scaledText.height! },
  { widthMm: 50, heightMm: 15 },
  { anchor: 'body', naturalHeight: scaledText.height },
);
if (scaledText.height! > 15) {
  assert(textBounds.overflowed === true, 'Aggressive height reduction correctly flagged overflowed = true for text exceeding 15mm canvas');
} else {
  assert(textBounds.overflowed === false, 'Text fits within 15mm canvas');
}

// 1c. QR 1:1 Square Invariant
assert(scaledQr !== undefined, 'Scaled QR element exists');
assert(scaledQr.width === scaledQr.height, `QR code preserves exact 1:1 square ratio (${scaledQr.width}mm x ${scaledQr.height}mm)`);
assert(scaledQr.width <= 15, `QR code dimension does not exceed label height (${scaledQr.width}mm <= 15mm)`);

// 1d. Border Perimeter Locking
assert(scaledBorder !== undefined, 'Scaled border element exists');
assert(scaledBorder.left === 0 && scaledBorder.top === 0, 'Border locked to top-left (0, 0)');
assert(scaledBorder.width === 50 && scaledBorder.height === 15, `Border perimeter matches new label dimensions exactly (50x15mm, got ${scaledBorder.width}x${scaledBorder.height})`);
assert(scaledBorder.lineWidth > 0 && scaledBorder.lineWidth < 1.0, `Border lineWidth scaled by fontScale (${scaledBorder.lineWidth}mm)`);

// 2. Width-Only Expansion: 50x30mm -> 70x30mm (Barcode Proportion Guard)
const barcodeEl: LabelElement = {
  id: 'bc1',
  type: 'barcode',
  content: '0123456789',
  encodeMode: 'CODE-128',
  left: 5,
  top: 5,
  width: 40,
  height: 10,
  fontSize: 10,
} as unknown as LabelElement;

const doc50x30: LabelDocument = {
  id: 'doc-2',
  name: 'Barcode Label',
  orientation: 0,
  paperType: 'Label',
  widthMm: 50,
  heightMm: 30,
  mediaGeometry: { type: 'rectangle' },
  elements: [barcodeEl],
} as unknown as LabelDocument;

const scaled70x30 = scaleDocumentToSize(doc50x30, 70, 30);
const scaledBc = scaled70x30.elements.find((el) => el.id === 'bc1') as Extract<LabelElement, { type: 'barcode' }>;

assert(scaledBc !== undefined, 'Scaled barcode exists');
assert(scaledBc.width === 40 * (70 / 50), `Barcode width scaled by sx (expected 56mm, got ${scaledBc.width}mm)`);
assert(scaledBc.height >= scaledBc.width / 6, `Barcode height satisfies 6:1 optical scan ratio (height ${scaledBc.height}mm >= ${scaledBc.width / 6}mm)`);
assert(scaledBc.height >= 3.5, `Barcode height satisfies >= 3.5mm absolute floor (got ${scaledBc.height}mm)`);

// 3. Floor vs. Ceiling Tension Conflict: 60mm barcode on 5mm vertical headroom
const wideBarcode: LabelElement = {
  id: 'bc-wide',
  type: 'barcode',
  content: '9876543210',
  encodeMode: 'CODE-128',
  left: 2,
  top: 2,
  width: 50,
  height: 8,
} as unknown as LabelElement;

const docShort: LabelDocument = {
  id: 'doc-3',
  name: 'Short Barcode Label',
  orientation: 0,
  paperType: 'Label',
  widthMm: 50,
  heightMm: 20,
  elements: [wideBarcode],
} as unknown as LabelDocument;

// Scale to 70x7mm where vertical headroom is 7mm - top(2*7/20 = 0.7mm) ≈ 6.3mm available
const scaled70x7 = scaleDocumentToSize(docShort, 70, 7);
const scaledWideBc = scaled70x7.elements.find((el) => el.id === 'bc-wide') as Extract<LabelElement, { type: 'barcode' }>;

assert(scaledWideBc !== undefined, 'Scaled wide barcode exists');
assert(scaledWideBc.height >= 3.5, `Tension test: Barcode height respects >= 3.5mm floor under tight headroom (got ${scaledWideBc.height}mm)`);
assert(scaledWideBc.top + scaledWideBc.height <= 7.001, `Tension test: Barcode does not overflow label height bounds (bottom at ${scaledWideBc.top + scaledWideBc.height}mm <= 7mm)`);

// 4. Proportional 2x Enlargement: 30x20mm -> 60x40mm
const doc30x20: LabelDocument = {
  id: 'doc-4',
  name: 'Small Label',
  orientation: 0,
  paperType: 'Label',
  widthMm: 30,
  heightMm: 20,
  elements: [
    { id: 't-small', type: 'text', text: 'Batch A', left: 2, top: 2, width: 26, fontSize: 8 } as unknown as LabelElement,
    { id: 'q-small', type: 'qrcode', content: '123', encodeMode: 'QRCode', left: 2, top: 8, width: 10, height: 10 } as unknown as LabelElement,
  ],
} as unknown as LabelDocument;

const scaled60x40 = scaleDocumentToSize(doc30x20, 60, 40);
const text2x = scaled60x40.elements.find((el) => el.id === 't-small') as Extract<LabelElement, { type: 'text' }>;
const qr2x = scaled60x40.elements.find((el) => el.id === 'q-small') as Extract<LabelElement, { type: 'qrcode' }>;

assert(text2x.left === 4 && text2x.top === 4, `2x Text position doubled accurately (got ${text2x.left}, ${text2x.top})`);
assert(text2x.fontSize === 16, `2x Text font size doubled accurately (got ${text2x.fontSize}pt)`);
assert(qr2x.width === 20 && qr2x.height === 20, `2x QR code dimensions doubled accurately (got ${qr2x.width}x${qr2x.height}mm)`);

console.log('All Template Resizing Engine tests passed successfully.');
