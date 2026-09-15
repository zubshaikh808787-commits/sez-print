/**
 * Quick checks for jewelry die-cut layout (present-fields stacking + soft fit).
 */
import {
  isNearMm,
  jewelryDieCutFieldTops,
  softFitJewelryDieCutDocument,
  refitJewelryDieCutDocument,
  JEWELRY_DIECUT,
  JEWELRY_DIECUT_TYPE,
  migrateJewelrySheetToCanonicalSize,
  jewelryDieCutColumnX,
  extractJewelryFirstColumnDocument,
  type JewelryDieCutField,
} from '@/constants/jewelry-diecut';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import {
  canonicalizeJewelryDieCutDocument,
} from '@/constants/jewelry-template-elements';
import { createLabelDocument, ptToMm } from '@/lib/label-document';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function lineH(pt: number) {
  return Math.max(2.4, ptToMm(pt) * 1.25);
}

console.log('\njewelryDieCutFieldTops: full stack stays clear of tip');
{
  const t = JEWELRY_DIECUT_TYPE;
  const heights: Record<JewelryDieCutField, number> = {
    title: lineH(t.titlePt),
    karat: lineH(t.karatPt),
    gr: lineH(t.bodyPt),
    nt: lineH(t.bodyPt),
    price: lineH(t.pricePt),
    barcode: t.barcodeHeightMm,
    sku: lineH(t.skuPt),
    huid: lineH(t.huidPt),
  };
  const tops = jewelryDieCutFieldTops(heights, [
    'title',
    'karat',
    'gr',
    'nt',
    'price',
    'barcode',
    'sku',
    'huid',
  ]);
  assert(tops.title >= t.frontInsetMm - 0.05, `title below front inset (got ${tops.title})`);
  assert(tops.barcode + heights.barcode <= JEWELRY_DIECUT.foldYMm - t.foldClearanceMm + 0.05, 'barcode above fold');
  assert(tops.sku >= JEWELRY_DIECUT.foldYMm, 'sku below fold');
}

console.log('\njewelryDieCutFieldTops: missing Gr/Nt still pads head (not tip-packed)');
{
  const t = JEWELRY_DIECUT_TYPE;
  const heights: Record<JewelryDieCutField, number> = {
    title: lineH(t.titlePt),
    karat: lineH(t.karatPt),
    gr: lineH(t.bodyPt),
    nt: lineH(t.bodyPt),
    price: lineH(t.pricePt),
    barcode: t.barcodeHeightMm,
    sku: lineH(t.skuPt),
    huid: lineH(t.huidPt),
  };
  const tops = jewelryDieCutFieldTops(heights, ['title', 'karat', 'price', 'barcode', 'sku']);
  assert(tops.title > t.frontInsetMm + 1.5, `sparse layout title padded (got ${tops.title})`);
  assert(tops.karat > tops.title, 'karat below title');
  assert(tops.price > tops.karat, 'price below karat');
}

console.log('\nsoftFit preserves tops; full refit may restack');
{
  const doc = createIndustryTemplateDocument({
    name: 'Jew Test',
    category: 'Jewellery',
    widthMm: 14,
    heightMm: 96,
    previewType: 'jew-rattail-single-12x100',
  });
  const title = doc.elements.find((el) => el.type === 'text' && /GOLD/i.test(String((el as { text?: string }).text ?? '')));
  assert(Boolean(title), 'template has title');
  const beforeTop = title!.top;
  const soft = softFitJewelryDieCutDocument(doc);
  const softTitle = soft.elements.find((el) => el.id === title!.id);
  assert(softTitle?.top === beforeTop, 'softFit keeps title top');
  const refit = refitJewelryDieCutDocument(doc);
  const refitTitle = refit.elements.find((el) => el.id === title!.id);
  assert(Boolean(refitTitle), 'refit keeps title element');
  assert((refitTitle?.top ?? 0) >= JEWELRY_DIECUT_TYPE.frontInsetMm - 0.05, 'refit title clear of tip');
}

console.log('\ncanonicalize migrates legacy 46×100 spread to 54×96 sheet');
{
  const legacy = createIndustryTemplateDocument({
    name: 'Legacy',
    category: 'Jewelry',
    widthMm: 46,
    heightMm: 100,
    previewType: 'jew-label-46x100',
  });
  // Factory may already canonicalize — force legacy spread geometry for the check.
  const spread = {
    ...legacy,
    widthMm: 46,
    heightMm: 100,
    templatePreviewType: 'jew-label-46x100',
    elements: legacy.elements.map((el) =>
      el.type === 'barcode' ? { ...el, top: 50 } : el,
    ),
  };
  const canon = canonicalizeJewelryDieCutDocument(spread);
  assert(isNearMm(canon.widthMm, JEWELRY_DIECUT.sheetWidthMm), 'canonical width 54mm');
  assert(isNearMm(canon.heightMm, JEWELRY_DIECUT.sheetHeightMm), 'canonical height 96mm');
  const barcode = canon.elements.find((el) => el.type === 'barcode');
  assert(Boolean(barcode), 'barcode present');
  assert((barcode?.top ?? 99) < JEWELRY_DIECUT.foldYMm - 1, 'barcode above fold after migrate');
}

console.log('\ncolumn-aware migrate snaps 50×100 → 54×96 columns 3/20/37');
{
  const el = {
    id: 't1',
    type: 'text' as const,
    text: 'GOLD',
    fontSize: 6,
    left: 2.95,
    top: 8,
    width: 12.1,
    height: 4,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
    align: 'center' as const,
  };
  const doc50 = createLabelDocument({
    name: 'Old50',
    widthMm: 50,
    heightMm: 100,
    elements: [
      el,
      { ...el, id: 't2', left: 18.95 },
      { ...el, id: 't3', left: 34.95 },
    ] as Parameters<typeof createLabelDocument>[0]['elements'],
  });
  const migrated = migrateJewelrySheetToCanonicalSize(doc50);
  assert(isNearMm(migrated.widthMm, 54), 'migrated width 54');
  assert(isNearMm(migrated.heightMm, 96), 'migrated height 96');
  const lefts = migrated.elements.map((e) => Math.round(e.left * 100) / 100).sort((a, b) => a - b);
  assert(Math.abs(lefts[0]! - (jewelryDieCutColumnX(0) + 0.95)) < 0.05, 'col0 snapped');
  assert(Math.abs(lefts[1]! - (jewelryDieCutColumnX(1) + 0.95)) < 0.05, 'col1 snapped');
  assert(Math.abs(lefts[2]! - (jewelryDieCutColumnX(2) + 0.95)) < 0.05, 'col2 snapped');

  const single = extractJewelryFirstColumnDocument(migrated);
  assert(isNearMm(single.widthMm, 14), 'single tag width 14');
  assert(single.elements.length === 1, 'single tag keeps one column');
  assert(Math.abs(single.elements[0]!.left - 0.95) < 0.05, 'single tag local left');
}

console.log('\ncanonicalize preserves tops when sheet already canonical');
{
  const doc = createIndustryTemplateDocument({
    name: 'Stable Sheet',
    category: 'Jewelry',
    widthMm: JEWELRY_DIECUT.sheetWidthMm,
    heightMm: JEWELRY_DIECUT.sheetHeightMm,
    previewType: 'jew-rattail-3row-54x100',
  });
  const before = doc.elements
    .filter((el) => el.needPrinting !== false)
    .map((el) => ({ id: el.id, left: el.left, top: el.top, width: el.width }));
  const after = canonicalizeJewelryDieCutDocument(doc);
  assert(before.length > 0, 'canonical sheet has printable elements');
  let same = true;
  for (const b of before) {
    const a = after.elements.find((el) => el.id === b.id);
    if (!a || a.left !== b.left || a.top !== b.top || a.width !== b.width) {
      same = false;
      break;
    }
  }
  assert(same, 'canonicalize does not move element positions on good sheets');
  assert(isNearMm(after.widthMm, JEWELRY_DIECUT.sheetWidthMm), 'width stays 54mm');
}

console.log(`\n${'═'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}`);
if (failed > 0) process.exit(1);
