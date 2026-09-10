import assert from 'node:assert/strict';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE } from '../../components/editor/types';
import { CABLE_FLAG_DIECUT } from '../../constants/cable-flag-diecut';
import { JEWELRY_DIECUT } from '../../constants/jewelry-diecut';
import { createIndustryTemplateDocument } from '../../constants/template-documents';
import {
  RAT_TAIL_143_PRINT,
  refitRatTail143Document,
} from '../../constants/rat-tail-143';
import { createLabelDocument, elementSizeMm, type LabelElement } from '../label-document';
import { canvasMmFromGeometry, isRatTailGeometry, RAT_TAIL_143 } from '../media-geometry';
import { clampElementToLabel } from '../element-sizing';
import { instantiateTemplate, validateTemplateDocument } from '../template-schema';

type FactorySku = {
  previewType: string;
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
};

const JEWELRY_SKUS: FactorySku[] = [
  { previewType: 'jew-sample-50x19-tabs', name: 'Sample-50x19+8', category: 'Jewelry', widthMm: 50, heightMm: 27 },
  { previewType: 'jew-sample-53x14-bar', name: 'Sample-53x14', category: 'Jewelry', widthMm: 53, heightMm: 14 },
  { previewType: 'jew-rattail-143x635', name: 'Rat tail 14.3x63.5+38.1', category: 'Jewelry', widthMm: 101.6, heightMm: 14.3 },
  { previewType: 'jew-sample-30x25-stacked', name: 'Sample-30x25+45', category: 'Jewelry', widthMm: 70, heightMm: 30 },
  { previewType: 'jew-sample-50x15-holes', name: 'Sample-50x15', category: 'Jewelry', widthMm: 50, heightMm: 15 },
  { previewType: 'jew-label-50x13-yellow', name: 'Label-50x13+30-Y', category: 'Jewelry', widthMm: 80, heightMm: 13 },
  { previewType: 'jew-sample-25x30-flower', name: 'Sample-25x30+45', category: 'Jewelry', widthMm: 75, heightMm: 25 },
  { previewType: 'jew-sample-30x25-pattern', name: 'Sample-30x25-pattern', category: 'Jewelry', widthMm: 70, heightMm: 30 },
  { previewType: 'jew-label-20x20-right', name: 'Label-20x20+30', category: 'Jewelry', widthMm: 50, heightMm: 20 },
  { previewType: 'jew-label-20x20-left', name: 'Label-20x20+30-1', category: 'Jewelry', widthMm: 50, heightMm: 20 },
  { previewType: 'jew-label-50x13-horizontal', name: 'Label-50x13+30', category: 'Jewelry', widthMm: 80, heightMm: 13 },
  { previewType: 'jew-label-46x100', name: 'Label 46x100', category: 'Jewelry', widthMm: 46, heightMm: 100 },
  { previewType: 'jew-dumbell-13x85', name: 'Dumbell 13x85', category: 'Jewelry', widthMm: 85, heightMm: 13 },
  { previewType: 'jew-dumbell-15x85', name: 'Dumbell 15x85', category: 'Jewelry', widthMm: 85, heightMm: 15 },
  { previewType: 'jew-hangtag-159x413', name: 'Hangtag-15.9x41.3', category: 'Jewelry', widthMm: 41.3, heightMm: 15.9 },
  {
    previewType: 'jew-rattail-3row-54x100',
    name: '3-Up 54x96',
    category: 'Jewelry',
    widthMm: JEWELRY_DIECUT.sheetWidthMm,
    heightMm: JEWELRY_DIECUT.sheetHeightMm,
  },
  {
    previewType: 'jew-rattail-single-12x100',
    name: '14x96 die-cut',
    category: 'Jewelry',
    widthMm: JEWELRY_DIECUT.tagWidthMm,
    heightMm: JEWELRY_DIECUT.tagHeightMm,
  },
  { previewType: 'jew-rattail-vertical-15x80', name: 'Rat Tail Vertical 15x80', category: 'Jewelry', widthMm: 15, heightMm: 80 },
  { previewType: 'jew-rattail-horizontal-80x15', name: 'Rat Tail Horizontal 80x15', category: 'Jewelry', widthMm: 80, heightMm: 15 },
];

const CABLE_SKUS: FactorySku[] = [
  { previewType: 'cable-yellow-4col', name: '10x20-Yellow-4-column', category: 'Cable', widthMm: 40, heightMm: 20 },
  { previewType: 'cable-12.5x74', name: '12.5x74+35-P0', category: 'Cable', widthMm: 109, heightMm: 12.5 },
  { previewType: 'cable-rattail-143x635', name: 'Rat Tail Label', category: 'Cable', widthMm: 101.6, heightMm: 14.3 },
  { previewType: 'cable-301-pstyle', name: '301-Cable 38x25+40', category: 'Cable', widthMm: 78, heightMm: 25 },
  { previewType: 'cable-428-inspected', name: 'Label-44.5x25.4+25.5', category: 'Cable', widthMm: 70, heightMm: 25.4 },
  { previewType: 'cable-tall-dual-flag', name: 'Cable Label-46x70', category: 'Cable', widthMm: 46, heightMm: 70 },
  {
    previewType: 'cable-flag-50x73',
    name: 'Cable Label-50x73',
    category: 'Cable',
    widthMm: CABLE_FLAG_DIECUT.widthMm,
    heightMm: CABLE_FLAG_DIECUT.heightMm,
  },
  { previewType: 'cable-d38-inverted', name: 'D38x25+38', category: 'Cable', widthMm: 76, heightMm: 35 },
  { previewType: 'cable-gp60-hangtag', name: 'GP60x45', category: 'Cable', widthMm: 60, heightMm: 45 },
  { previewType: 'cable-hb38-red', name: 'HB38x25+38', category: 'Cable', widthMm: 76, heightMm: 25 },
  { previewType: 'cable-lf45-double', name: 'LF45x30+50', category: 'Cable', widthMm: 95, heightMm: 30 },
  { previewType: 'cable-lf64-dash', name: 'LF64x32+35', category: 'Cable', widthMm: 99, heightMm: 32 },
  { previewType: 'cable-lt38-tstyle', name: 'LT38x25+30', category: 'Cable', widthMm: 38, heightMm: 55 },
  { previewType: 'cable-lt45-tstyle', name: 'LT45x30+40', category: 'Cable', widthMm: 45, heightMm: 70 },
  { previewType: 'cable-pstyle-barcode', name: 'P-Style 30x25+40', category: 'Cable', widthMm: 70, heightMm: 25 },
  { previewType: 'cable-pstyle-panel23', name: 'P-Style 38.1x40.6+21.9', category: 'Cable', widthMm: 64, heightMm: 40.6 },
  { previewType: 'cable-tstyle-barcode', name: 'T-Style 30x19.8+15.2', category: 'Cable', widthMm: 30, heightMm: 35 },
];

const OTHER_SKUS: FactorySku[] = [
  { previewType: 'rect-30x22', name: '30x22', category: 'General', widthMm: 30, heightMm: 22 },
  { previewType: 'rect-40x80', name: '40x80', category: 'General', widthMm: 40, heightMm: 80 },
  { previewType: 'four-ups-20x15', name: "4 UP's-20x15", category: 'Multi-UP', widthMm: 86, heightMm: 15 },
  { previewType: 'circle-40', name: 'Circle-40', category: 'Circle', widthMm: 45, heightMm: 45 },
];

function factoryDoc(sku: FactorySku) {
  return createIndustryTemplateDocument({
    name: sku.name,
    category: sku.category,
    widthMm: sku.widthMm,
    heightMm: sku.heightMm,
    previewType: sku.previewType,
  });
}

function testValidateRejectsNaN() {
  const doc = createLabelDocument({
    name: 'bad',
    widthMm: 40,
    heightMm: 20,
    elements: [],
  });
  const result = validateTemplateDocument({
    ...doc,
    elements: [
      {
        ...DEFAULT_ELEMENT_STATE,
        id: 'nan',
        type: 'text',
        text: 'x',
        left: Number.NaN,
        top: 1,
        width: 10,
        height: 4,
        drawingColorIndex: 1,
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('NaN')));
  console.log('ok validateTemplateDocument rejects NaN geometry');
}

function testValidateRejectsEmptyBarcode() {
  const doc = createLabelDocument({
    name: 'barcode',
    widthMm: 40,
    heightMm: 20,
    elements: [],
  });
  const result = validateTemplateDocument({
    ...doc,
    elements: [
      {
        ...DEFAULT_BARCODE_STATE,
        id: 'bc',
        type: 'barcode',
        content: '',
        left: 1,
        top: 1,
        width: 20,
        height: 8,
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('barcode content')));
  console.log('ok validateTemplateDocument requires barcode content');
}

function testInstantiateThrowsOnBadCanvas() {
  assert.throws(() =>
    instantiateTemplate({
      id: 'bad',
      name: 'bad',
      category: 'x',
      designWidth: Number.NaN,
      designHeight: 20,
      background: { type: 'none' },
      layers: [],
    }),
  );
  console.log('ok instantiateTemplate throws on NaN canvas');
}

function testPrintGeometryUnchanged() {
  assert.equal(JEWELRY_DIECUT.sheetWidthMm, 54);
  assert.equal(JEWELRY_DIECUT.sheetHeightMm, 96);
  assert.equal(JEWELRY_DIECUT.tagWidthMm, 14);
  assert.equal(JEWELRY_DIECUT.tagHeightMm, 96);
  assert.equal(JEWELRY_DIECUT.bodyHeightMm, 64);
  assert.equal(JEWELRY_DIECUT.foldYMm, 32);
  assert.equal(JEWELRY_DIECUT.printDpi, 304);
  assert.equal(CABLE_FLAG_DIECUT.widthMm, 50);
  assert.equal(CABLE_FLAG_DIECUT.heightMm, 73);
  assert.equal(CABLE_FLAG_DIECUT.printDpi, 304);
  console.log('ok jewelry 54×96 / 14×96 and cable 50×73 print mm unchanged');
}

function testRatTail143Geometry() {
  const box = canvasMmFromGeometry(RAT_TAIL_143);
  assert.equal(RAT_TAIL_143.type, 'rat_tail');
  assert.equal(RAT_TAIL_143.bodyWidthMm, 63.5);
  assert.equal(RAT_TAIL_143.bodyHeightMm, 14.3);
  assert.equal(RAT_TAIL_143.tailLengthMm, 38.1);
  assert.equal(RAT_TAIL_143.tailPosition, 'right');
  assert.equal(box.widthMm, 101.6);
  assert.equal(box.heightMm, 14.3);

  for (const sku of [
    { previewType: 'cable-rattail-143x635', name: 'Rat Tail Label', category: 'Cable', widthMm: 101.6, heightMm: 14.3 },
    { previewType: 'jew-rattail-143x635', name: 'Rat tail 14.3x63.5+38.1', category: 'Jewelry', widthMm: 101.6, heightMm: 14.3 },
  ] satisfies FactorySku[]) {
    const doc = factoryDoc(sku);
    assert.equal(doc.templateCategory, sku.category);
    assert.equal(doc.mediaShape, 'diecut');
    assert.equal(doc.widthMm, 101.6);
    assert.equal(doc.heightMm, 14.3);
    assert.ok(isRatTailGeometry(doc.mediaGeometry), `${sku.previewType} must store rat_tail geometry`);
    if (isRatTailGeometry(doc.mediaGeometry)) {
      assert.equal(doc.mediaGeometry.bodyWidthMm, 63.5);
      assert.equal(doc.mediaGeometry.bodyHeightMm, 14.3);
      assert.equal(doc.mediaGeometry.tailLengthMm, 38.1);
      assert.equal(doc.mediaGeometry.tailPosition, 'right');
    }
    const barcode = doc.elements.find((el) => el.type === 'barcode');
    assert.ok(barcode && barcode.type === 'barcode');
    if (barcode && barcode.type === 'barcode') {
      assert.equal(barcode.content, '837654163481');
      assert.equal(barcode.encodeMode, 'UPC-A');
      assert.ok(barcode.left + barcode.width <= 63.5 + 0.4);
    }
    const texts = doc.elements.filter((el) => el.type === 'text').map((el) => (el.type === 'text' ? el.text : ''));
    assert.ok(texts.includes("Men's Comfort Band"));
    assert.ok(texts.includes('14K Gold, 10.5 Size, 22'));
    assert.ok(texts.includes('grams'));
    const divider = doc.elements.find((el) => el.type === 'line');
    assert.ok(divider, `${sku.previewType} must include the printed body divider`);
    if (divider) {
      assert.equal(divider.lockMovement, true);
    }
    for (const el of doc.elements) {
      const size = elementSizeMm(el);
      assert.ok(
        el.left + size.width <= 63.5 + 0.4,
        `${sku.previewType} ${el.id} must stay in the 63.5 mm body, not the tail`,
      );
      assert.equal(el.lockMovement, true, `${sku.previewType} ${el.type} must be locked on the paddle`);
    }
  }

  const drifted = factoryDoc({
    previewType: 'cable-rattail-143x635',
    name: 'Rat Tail Label',
    category: 'Cable',
    widthMm: 101.6,
    heightMm: 14.3,
  });
  drifted.widthMm = 80;
  drifted.heightMm = 10;
  const barcode = drifted.elements.find((el) => el.type === 'barcode');
  if (barcode && barcode.type === 'barcode') {
    barcode.content = '123456789012';
    barcode.left = 70;
    barcode.lockMovement = false;
  }
  const refit = refitRatTail143Document(drifted);
  assert.equal(refit.widthMm, 101.6);
  assert.equal(refit.heightMm, 14.3);
  const refitBarcode = refit.elements.find((el) => el.type === 'barcode');
  assert.ok(refitBarcode && refitBarcode.type === 'barcode');
  if (refitBarcode && refitBarcode.type === 'barcode') {
    assert.equal(refitBarcode.content, '123456789012');
    assert.equal(refitBarcode.lockMovement, true);
    assert.ok(refitBarcode.left + refitBarcode.width <= 63.5 + 0.4);
  }
  assert.equal(RAT_TAIL_143_PRINT.widthMm, 14.3);
  assert.equal(RAT_TAIL_143_PRINT.heightMm, 101.6);
  assert.equal(RAT_TAIL_143_PRINT.captureOrientation, 90);

  const pushed = clampElementToLabel(
    { ...(refitBarcode as LabelElement), left: 80 },
    refit,
  );
  assert.ok(pushed.left + pushed.width <= 63.5 + 0.05, 'clamp must keep ink on the paddle');

  console.log('ok cable/jewelry 14.3×63.5+38.1 rat-tail geometry and body content');
}

function testFactoryDocs(skus: FactorySku[]) {
  for (const sku of skus) {
    const doc = factoryDoc(sku);
    assert.equal(doc.templatePreviewType, sku.previewType);
    if (sku.previewType.startsWith('cable-flag-')) {
      assert.equal(doc.widthMm, CABLE_FLAG_DIECUT.widthMm);
      assert.equal(doc.heightMm, CABLE_FLAG_DIECUT.heightMm);
    } else {
      assert.equal(doc.widthMm, sku.widthMm);
      assert.equal(doc.heightMm, sku.heightMm);
    }
    const result = validateTemplateDocument(doc);
    assert.equal(result.ok, true, `${sku.previewType}: ${result.errors.join('; ')}`);
    for (const el of doc.elements) {
      if (el.needPrinting === false || el.type === 'border') {
        assert.equal(el.lockMovement, true, `${sku.previewType} chrome ${el.id} must be locked`);
      }
    }
  }
  console.log(`ok ${skus.length} factory documents validate inside canvas`);
}

function main() {
  testValidateRejectsNaN();
  testValidateRejectsEmptyBarcode();
  testInstantiateThrowsOnBadCanvas();
  testPrintGeometryUnchanged();
  testRatTail143Geometry();
  testFactoryDocs([...JEWELRY_SKUS, ...CABLE_SKUS, ...OTHER_SKUS]);
  console.log('ALL TEMPLATE SCHEMA TESTS PASSED');
}

main();
