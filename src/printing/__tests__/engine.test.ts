import assert from 'node:assert/strict';
import { createArtworkDocument, createPhysicalProofDocument, createPrintDocument, mediaFromSize, pageSizeDots, rectMmToDots, renderPrintDocument, validatePrintRequest, MEDIA_PROFILES, convertLabelToPrintDocument } from '../index';
import { createTestPrinterAdapter } from '../adapters/test/TestPrinterAdapter';
import { encodeTscBitmapJob, inspectTsplJob } from '../../lib/printer/tsc';
import { applyExifOrientation } from '../../lib/printer/exif-orientation';
import { prepareEditorGrayForPrint, EditorRasterMismatchError } from '../../lib/printer/escpos';
import { createPrintGeometry } from '../../lib/printer/print-spec';
import {
  CABLE_FLAG_DIECUT,
  cableFlagColumnX,
  cableFlagComposedWidthMm,
  cableFlagOutlineMm,
  cableFlagPathD,
} from '../../constants/cable-flag-diecut';
import {
  JEWELRY_DIECUT,
  jewelryDieCutColumnX,
  jewelryDieCutContentIsSingleTag,
} from '../../constants/jewelry-diecut';
import { createLabelDocument, type LabelElement } from '../../lib/label-document';
import { tileDocumentThreeUpDieCut54 } from '../../lib/print-sizes';
import { resolveDocumentForPage, dataPageCount } from '../../lib/data-binding';

function axis(dpi: number) {
  return { dpiX: dpi, dpiY: dpi };
}

function testMultiDpiSamePhysicalSize() {
  const widthMm = 50;
  const heightMm = 25;
  const dpis = [203, 300, 302, 600];
  const physical: string[] = [];
  for (const dpi of dpis) {
    const a = axis(dpi);
    const page = pageSizeDots(widthMm, heightMm, a);
    const expectedW = Math.round((widthMm * dpi) / 25.4);
    const expectedH = Math.round((heightMm * dpi) / 25.4);
    assert.equal(page.widthDots, expectedW, `${dpi} DPI width dots`);
    assert.equal(page.heightDots, expectedH, `${dpi} DPI height dots`);
    physical.push(`${page.widthDots}x${page.heightDots}`);
  }
  assert.notEqual(physical[0], physical[1]);
  assert.notEqual(physical[1], physical[3]);
  console.log('ok multi-dpi', physical.join(' | '));
}

function testEdgeRounding() {
  const a = axis(203);
  const r = rectMmToDots(10, 5, 20, 8, a);
  const x1 = Math.round((30 * 203) / 25.4);
  const x0 = Math.round((10 * 203) / 25.4);
  assert.equal(r.widthDots, x1 - x0);
  console.log('ok edge rounding', r.widthDots, '×', r.heightDots);
}

function testArtworkRenderDots() {
  const gray = { width: 10, height: 6, gray: new Uint8Array(60).fill(0) };
  const doc = createArtworkDocument({
    widthMm: 50,
    heightMm: 25,
    gray,
    fit: 'stretch',
  });
  const media = mediaFromSize(50, 25);
  const job203 = renderPrintDocument(doc, media, {
    dpiX: 203,
    dpiY: 203,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  const job302 = renderPrintDocument(doc, media, {
    dpiX: 302,
    dpiY: 302,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  assert.equal(job203.widthMm, 50);
  assert.equal(job302.widthMm, 50);
  assert.equal(job203.heightMm, 25);
  assert.equal(job302.heightMm, 25);
  assert.notEqual(job203.widthDots, job302.widthDots);
  assert.equal(job203.bitmap.pixelFormat, '1bpp');
  console.log('ok artwork render', job203.widthDots, 'vs', job302.widthDots, 'dots');
}

function testValidationStopsOversized() {
  const adapter = createTestPrinterAdapter(203, 108);
  return adapter.getCapabilities().then((caps) => {
    const doc = createArtworkDocument({
      widthMm: 120,
      heightMm: 25,
      gray: { width: 2, height: 2, gray: new Uint8Array(4).fill(0) },
    });
    const media = mediaFromSize(120, 25);
    const result = validatePrintRequest(doc, media, caps);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /exceeds/i.test(e)));
    console.log('ok validation rejects 120 mm on 108 mm head');
  });
}

function testHardwareDpmDoesNotUseGlobal304() {
  const page304 = pageSizeDots(54, 96, { dpiX: 304, dpiY: 304, dotsPerMmX: 12, dotsPerMmY: 12 });
  const naive = Math.round((54 * 304) / 25.4);
  assert.equal(page304.widthDots, 648);
  assert.notEqual(page304.widthDots, naive);
  console.log('ok adapter dpm 54 mm →', page304.widthDots, 'dots (not', naive, ')');
}

function test50x25ProofAtHardwareDpi() {
  const doc = createPhysicalProofDocument(50, 25);
  assert.equal(doc.widthMm, 50);
  assert.equal(doc.heightMm, 25);
  const square = doc.elements.find((el) => el.id === 'square-10mm');
  assert.ok(square);
  assert.equal(square?.widthMm, 10);
  assert.equal(square?.heightMm, 10);

  const axis304 = { dpiX: 304, dpiY: 304, dotsPerMmX: 12, dotsPerMmY: 12 };
  const axis203 = { dpiX: 203, dpiY: 203, dotsPerMmX: 8, dotsPerMmY: 8 };
  const page304 = pageSizeDots(50, 25, axis304);
  const page203 = pageSizeDots(50, 25, axis203);
  assert.equal(page304.widthDots, 600);
  assert.equal(page304.heightDots, 300);
  assert.equal(page203.widthDots, 400);
  assert.equal(page203.heightDots, 200);

  const square304 = rectMmToDots(5, 5, 10, 10, axis304);
  assert.equal(square304.widthDots, 120);
  assert.equal(square304.heightDots, 120);
  const square203 = rectMmToDots(5, 5, 10, 10, axis203);
  assert.equal(square203.widthDots, 80);
  assert.equal(square203.heightDots, 80);

  const media = mediaFromSize(50, 25);
  const job304 = renderPrintDocument(doc, media, {
    dpiX: 304,
    dpiY: 304,
    dotsPerMmX: 12,
    dotsPerMmY: 12,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  assert.equal(job304.widthDots, 600);
  assert.equal(job304.heightDots, 300);
  assert.equal(job304.bitmap.bytesPerRow, 75);
  assert.equal(job304.bitmap.data.length, 75 * 300);

  const job203 = renderPrintDocument(doc, media, {
    dpiX: 203,
    dpiY: 203,
    dotsPerMmX: 8,
    dotsPerMmY: 8,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  assert.equal(job203.widthDots, 400);
  assert.equal(job203.heightDots, 200);
  assert.equal(job203.bitmap.bytesPerRow, 50);
  assert.equal(job203.bitmap.data.length, 50 * 200);
  console.log('ok 50x25 proof 304=600x300/75bpr | 203=400x200/50bpr');
}

function test50x25TsplBitmapWidthIsBytes() {
  const doc = createPhysicalProofDocument(50, 25);
  const media = mediaFromSize(50, 25);
  const job = renderPrintDocument(doc, media, {
    dpiX: 304,
    dpiY: 304,
    dotsPerMmX: 12,
    dotsPerMmY: 12,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  const bytes = encodeTscBitmapJob(
    {
      bytesPerRow: job.bitmap.bytesPerRow ?? 75,
      height: job.heightDots,
      data: job.bitmap.data,
    },
    { widthMm: 50, heightMm: 25, gapMm: 3 },
  );
  const tspl = inspectTsplJob(bytes);
  assert.equal(tspl.sizeCommand, 'SIZE 50.00 mm,25.00 mm');
  assert.equal(tspl.bitmapWidthBytes, 75);
  assert.equal(tspl.bitmapHeightDots, 300);
  assert.notEqual(tspl.bitmapWidthBytes, 600);
  assert.equal(tspl.payloadBytes, 75 * 300);
  assert.equal(tspl.directionCommand, 'DIRECTION 0,0');
  assert.equal(tspl.referenceCommand, 'REFERENCE 0,0');
  console.log('ok TSPL', tspl.sizeCommand, tspl.bitmapCommand, 'payload', tspl.payloadBytes);
}

function test50x70PageDotsFromPrinterProfile() {
  const page304 = pageSizeDots(50, 70, { dpiX: 304, dpiY: 304, dotsPerMmX: 12, dotsPerMmY: 12 });
  const page203 = pageSizeDots(50, 70, { dpiX: 203, dpiY: 203, dotsPerMmX: 8, dotsPerMmY: 8 });
  const pageDpiOnly = pageSizeDots(50, 70, { dpiX: 304, dpiY: 304 });
  assert.equal(page304.widthDots, 600);
  assert.equal(page304.heightDots, 840);
  assert.equal(page203.widthDots, 400);
  assert.equal(page203.heightDots, 560);
  assert.equal(pageDpiOnly.widthDots, Math.round((50 * 304) / 25.4));
  assert.equal(pageDpiOnly.heightDots, Math.round((70 * 304) / 25.4));
  console.log('ok 50x70 dots', page304.widthDots, '×', page304.heightDots, '@12dpm |', pageDpiOnly.widthDots, '×', pageDpiOnly.heightDots, '@304/25.4');
}

function testArtworkHasNoPageBorder() {
  const width = 40;
  const height = 28;
  const gray = new Uint8Array(width * height).fill(255);
  for (let y = 8; y < 20; y++) {
    for (let x = 12; x < 28; x++) gray[y * width + x] = 0;
  }
  const doc = createArtworkDocument({
    widthMm: 50,
    heightMm: 70,
    gray: { width, height, gray },
    fit: 'stretch',
  });
  const job = renderPrintDocument(doc, mediaFromSize(50, 70), {
    dpiX: 203,
    dpiY: 203,
    dotsPerMmX: 8,
    dotsPerMmY: 8,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
    flipY: false,
  });
  const bpr = job.bitmap.bytesPerRow ?? Math.ceil(job.widthDots / 8);
  const data = job.bitmap.data;
  const topLeft = data[0];
  const topRight = data[bpr - 1];
  const bottomLeft = data[(job.heightDots - 1) * bpr];
  assert.equal(job.widthMm, 50);
  assert.equal(job.heightMm, 70);
  assert.equal(job.widthDots, 400);
  assert.equal(job.heightDots, 560);
  assert.equal(topLeft, 0, 'no ink on top-left canvas edge');
  assert.equal(topRight, 0, 'no ink on top-right canvas edge');
  assert.equal(bottomLeft, 0, 'no ink on bottom-left canvas edge');
  assert.equal(job.bitmap.data.length, bpr * job.heightDots);
  const bytes = encodeTscBitmapJob(
    { bytesPerRow: bpr, height: job.heightDots, data: job.bitmap.data },
    { widthMm: 50, heightMm: 70, gapMm: 3 },
  );
  const tspl = inspectTsplJob(bytes);
  assert.equal(tspl.sizeCommand, 'SIZE 50.00 mm,70.00 mm');
  assert.equal(tspl.bitmapWidthBytes, 50);
  assert.notEqual(tspl.bitmapWidthBytes, 400);
  assert.equal(tspl.bitmapHeightDots, 560);
  assert.equal(tspl.payloadBytes, 50 * 560);
  console.log('ok 50x70 artwork no page border', job.widthDots, '×', job.heightDots, 'bpr', bpr, tspl.bitmapCommand);
}

function testExifOrientation6SwapsAxes() {
  const src = {
    width: 2,
    height: 3,
    gray: Uint8Array.from([1, 2, 3, 4, 5, 6]),
  };
  const out = applyExifOrientation(src, 6);
  assert.equal(out.width, 3);
  assert.equal(out.height, 2);
  assert.deepEqual(Array.from(out.gray), [5, 3, 1, 6, 4, 2]);
  const upright = applyExifOrientation(src, 1);
  assert.equal(upright, src);
  console.log('ok EXIF 6 → 90° CW, tag 1 unchanged');
}

function testNoFlipYKeepsTopRow() {
  const gray = new Uint8Array(8 * 4);
  gray.fill(255);
  gray[0] = 0;
  gray[1] = 0;
  const doc = createArtworkDocument({
    widthMm: 50,
    heightMm: 70,
    gray: { width: 8, height: 4, gray },
    fit: 'stretch',
  });
  const job = renderPrintDocument(doc, mediaFromSize(50, 70), {
    dpiX: 203,
    dpiY: 203,
    dotsPerMmX: 8,
    dotsPerMmY: 8,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
    flipY: false,
  });
  const bpr = job.bitmap.bytesPerRow ?? 50;
  assert.notEqual(job.bitmap.data[0], 0);
  const lastRow = job.bitmap.data.subarray((job.heightDots - 1) * bpr, job.heightDots * bpr);
  const lastInk = lastRow.some((b) => b !== 0);
  assert.equal(lastInk, false);
  console.log('ok no flipY: ink stays on first raster row');
}

function testEmptyLabelHasNoInk() {
  const doc = createPrintDocument({ widthMm: 50, heightMm: 70, elements: [] });
  const job = renderPrintDocument(doc, mediaFromSize(50, 70), {
    dpiX: 304,
    dpiY: 304,
    dotsPerMmX: 12,
    dotsPerMmY: 12,
    printableWidthMm: 108,
    printableHeightMm: 1000,
    colorMode: 'mono',
    rasterMode: '1bpp',
  });
  assert.equal(job.widthMm, 50);
  assert.equal(job.heightMm, 70);
  assert.equal(job.widthDots, 600);
  assert.equal(job.heightDots, 840);
  assert.equal(job.bitmap.bytesPerRow, 75);
  assert.ok(
    job.bitmap.data.every((b) => b === 0),
    'empty document must not draw a page rectangle',
  );
  const bytes = encodeTscBitmapJob(
    {
      bytesPerRow: job.bitmap.bytesPerRow ?? 75,
      height: job.heightDots,
      data: job.bitmap.data,
    },
    { widthMm: 50, heightMm: 70, gapMm: 3 },
  );
  const tspl = inspectTsplJob(bytes);
  assert.equal(tspl.sizeCommand, 'SIZE 50.00 mm,70.00 mm');
  assert.equal(tspl.bitmapWidthBytes, 75);
  assert.equal(tspl.bitmapHeightDots, 840);
  assert.equal(tspl.payloadBytes, 75 * 840);
  console.log('ok empty 50x70 zero ink', tspl.sizeCommand, tspl.bitmapCommand);
}

function testEditorFinalizeSizeCaptureNotStretched() {
  const sizeW = 400;
  const sizeH = 560;
  const gray = new Uint8Array(sizeW * sizeH).fill(255);
  gray[20 * sizeW + 10] = 0;
  const prepared = prepareEditorGrayForPrint(
    { width: sizeW, height: sizeH, gray },
    sizeW,
    sizeH,
    sizeW,
    sizeH,
  );
  assert.equal(prepared.width, sizeW);
  assert.equal(prepared.height, sizeH);
  assert.equal(prepared.gray[20 * sizeW + 10], 0);
  assert.equal(prepared.gray[20 * sizeW + 11], 255);
  assert.equal(prepared.gray[21 * sizeW + 10], 255);
  console.log('ok editor finalize SIZE capture is not stretched');
}

function testEditorFinalizeOffSizeDoesNotSilentCrop() {
  const sizeW = 400;
  const sizeH = 560;
  const srcW = 80;
  const srcH = 80;
  const gray = new Uint8Array(srcW * srcH).fill(0);
  assert.throws(
    () =>
      prepareEditorGrayForPrint(
        { width: srcW, height: srcH, gray },
        sizeW,
        sizeH,
        sizeW,
        sizeH,
      ),
    (err: unknown) => err instanceof EditorRasterMismatchError,
  );
  console.log('ok editor finalize mismatched aspect does not silent-crop');
}

function testEditorFinalizeFractionalDownsample() {
  const sizeW = 100;
  const sizeH = 80;
  const srcW = 275;
  const srcH = 220;
  const gray = new Uint8Array(srcW * srcH).fill(255);
  const cellW = Math.floor(srcW / sizeW);
  const cellH = Math.floor(srcH / sizeH);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) gray[y * srcW + x] = 0;
  }
  const prepared = prepareEditorGrayForPrint(
    { width: srcW, height: srcH, gray },
    sizeW,
    sizeH,
    sizeW,
    sizeH,
  );
  assert.equal(prepared.width, sizeW);
  assert.equal(prepared.height, sizeH);
  assert.ok(prepared.gray[0] < 40, 'top-left cell stays dark after 2.75× downsample');
  assert.equal(prepared.gray[sizeW - 1], 255);
  assert.equal(prepared.gray[(sizeH - 1) * sizeW + (sizeW - 1)], 255);
  console.log('ok editor finalize uniform 2.75× downsample → SIZE');
}

function testDecimalMmPrintGeometry() {
  const g = createPrintGeometry(50.8, 70, 304);
  assert.equal(g.widthMm, 50.8);
  assert.equal(g.heightMm, 70);
  assert.equal(g.sizeCommand, 'SIZE 50.80 mm,70.00 mm');
  assert.equal(g.dotsPerMm, 12);
  assert.equal(g.sizeDotsW, 610);
  assert.equal(g.sizeDotsH, 840);
  assert.equal(g.bitmapDotsW, 608);
  assert.equal(g.bytesPerRow, 76);
  const bits = new Uint8Array(76 * 840);
  const bytes = encodeTscBitmapJob(
    { bytesPerRow: 76, height: 840, data: bits },
    { widthMm: 50.8, heightMm: 70, gapMm: 3 },
  );
  const tspl = inspectTsplJob(bytes);
  assert.equal(tspl.sizeCommand, 'SIZE 50.80 mm,70.00 mm');
  assert.equal(tspl.bitmapWidthBytes, 76);
  assert.equal(tspl.bitmapHeightDots, 840);
  console.log('ok 50.80 mm geometry', g.sizeCommand, g.sizeDotsW, '→ packed', g.bitmapDotsW);

  const ship = createPrintGeometry(101.6, 152.4, 304);
  assert.equal(ship.sizeCommand, 'SIZE 101.60 mm,152.40 mm');
  assert.equal(ship.sizeDotsW, Math.round(101.6 * 12));
  assert.equal(ship.sizeDotsH, Math.round(152.4 * 12));
  assert.equal(ship.bitmapDotsW, Math.floor(ship.sizeDotsW / 8) * 8);
  assert.equal(ship.bytesPerRow, ship.bitmapDotsW / 8);
  const shipBytes = encodeTscBitmapJob(
    {
      bytesPerRow: ship.bytesPerRow,
      height: ship.sizeDotsH,
      data: new Uint8Array(ship.bytesPerRow * ship.sizeDotsH),
    },
    { widthMm: 101.6, heightMm: 152.4, gapMm: 3 },
  );
  assert.equal(inspectTsplJob(shipBytes).sizeCommand, 'SIZE 101.60 mm,152.40 mm');
  console.log('ok 101.60 mm geometry', ship.sizeCommand, ship.sizeDotsW, '×', ship.sizeDotsH);
}

function testCableFlag50x73DieCut() {
  const {
    widthMm,
    heightMm,
    columnWidthMm,
    columns,
    headHeightMm,
    tailHeightMm,
    tailWidthMm,
    foldXMm,
    printDpi,
  } = CABLE_FLAG_DIECUT;
  assert.equal(widthMm, 50);
  assert.equal(heightMm, 73);
  assert.equal(columnWidthMm, 25);
  assert.equal(columns, 2);
  assert.equal(headHeightMm + tailHeightMm, 73);
  assert.ok(tailWidthMm > 7 && tailWidthMm < columnWidthMm / 2);
  assert.equal(cableFlagComposedWidthMm(), 50);
  assert.equal(cableFlagColumnX(0), 0);
  assert.equal(cableFlagColumnX(1), 25);

  const left = cableFlagOutlineMm(0);
  assert.equal(left.head.w, 25);
  assert.equal(left.head.h, 46);
  assert.equal(left.tail.x, 0);
  assert.equal(left.fold.x, foldXMm);
  const right = cableFlagOutlineMm(25);
  assert.equal(right.head.x, 25);
  assert.equal(right.fold.x, 25 + foldXMm);
  assert.ok(right.head.x + right.head.w <= 50);

  const path = cableFlagPathD(0, (mm) => mm, (mm) => mm);
  assert.ok(path.startsWith('M '));
  assert.ok(path.trim().endsWith('Z'));

  const page = createPrintGeometry(widthMm, heightMm, printDpi);
  assert.equal(page.sizeCommand, 'SIZE 50.00 mm,73.00 mm');
  assert.equal(page.dotsPerMm, 12);
  assert.equal(page.sizeDotsW, 600);
  assert.equal(page.sizeDotsH, 876);
  assert.equal(page.bytesPerRow, 75);

  const bytes = encodeTscBitmapJob(
    {
      bytesPerRow: page.bytesPerRow,
      height: page.sizeDotsH,
      data: new Uint8Array(page.bytesPerRow * page.sizeDotsH),
    },
    { widthMm: 50, heightMm: 73, gapMm: 3 },
  );
  const tspl = inspectTsplJob(bytes);
  assert.equal(tspl.sizeCommand, 'SIZE 50.00 mm,73.00 mm');
  assert.equal(tspl.bitmapWidthBytes, 75);
  assert.equal(tspl.bitmapHeightDots, 876);
  console.log('ok cable label 50×73 pair', page.sizeCommand, page.sizeDotsW, '×', page.sizeDotsH);
}

function testJewelry3UpTilesAllThreeColumns() {
  assert.equal(jewelryDieCutColumnX(0), 3);
  assert.equal(jewelryDieCutColumnX(1), 20);
  assert.equal(jewelryDieCutColumnX(2), 37);
  assert.equal(JEWELRY_DIECUT.sheetWidthMm, 54);
  assert.equal(3 + 14 + 3 + 14 + 3 + 14 + 3, 54);

  const sheet = createPrintGeometry(54, 96, 304);
  assert.equal(sheet.sizeCommand, 'SIZE 54.00 mm,96.00 mm');
  assert.equal(sheet.sizeDotsW, 648);
  assert.equal(sheet.sizeDotsH, 1152);
  assert.equal(sheet.bytesPerRow, 81);

  const textEl = {
    id: 't1',
    type: 'text',
    text: 'GOLD RING',
    fontSize: 6.5,
    left: 0.95,
    top: 8,
    width: 12.1,
    height: 4,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
    align: 'center',
    bold: true,
  } as LabelElement;

  const single = createLabelDocument({
    name: 'Jewel',
    widthMm: 14,
    heightMm: 96,
    elements: [textEl],
  });
  assert.equal(jewelryDieCutContentIsSingleTag(single), true);
  const tiled = tileDocumentThreeUpDieCut54(single);
  assert.equal(tiled.widthMm, 54);
  assert.equal(tiled.heightMm, 96);
  const lefts = tiled.elements.map((el) => Math.round(el.left * 100) / 100).sort((a, b) => a - b);
  assert.deepEqual(lefts, [3.95, 20.95, 37.95]);

  const halfEmpty = createLabelDocument({
    name: 'Jewel UPS',
    widthMm: 48,
    heightMm: 96,
    elements: [textEl],
  });
  assert.equal(jewelryDieCutContentIsSingleTag(halfEmpty), true);
  const tiledHalf = tileDocumentThreeUpDieCut54(halfEmpty);
  assert.equal(tiledHalf.elements.length, 3);
  const halfLefts = tiledHalf.elements.map((el) => Math.round(el.left * 100) / 100).sort((a, b) => a - b);
  assert.deepEqual(halfLefts, [3.95, 20.95, 37.95]);
  console.log('ok jewellery 3-up columns 3 / 20 / 37 mm on 54×96', sheet.sizeCommand);
}

function testEditorFinalizeIntegerDownsample() {
  const sizeW = 100;
  const sizeH = 80;
  const factor = 3;
  const srcW = sizeW * factor;
  const srcH = sizeH * factor;
  const gray = new Uint8Array(srcW * srcH).fill(255);
  for (let y = 0; y < factor; y++) {
    for (let x = 0; x < factor; x++) gray[y * srcW + x] = 0;
  }
  const prepared = prepareEditorGrayForPrint(
    { width: srcW, height: srcH, gray },
    sizeW,
    sizeH,
    sizeW,
    sizeH,
  );
  assert.equal(prepared.width, sizeW);
  assert.equal(prepared.height, sizeH);
  assert.equal(prepared.gray[0], 0);
  assert.equal(prepared.gray[1], 255);
  console.log('ok editor finalize integer downsample 3× → SIZE');
}

function testExpandedMediaProfilesCatalog() {
  assert(MEDIA_PROFILES.length >= 25, `Expected >= 25 profiles, got ${MEDIA_PROFILES.length}`);
  const waybill = MEDIA_PROFILES.find((p) => p.id === 'rect-100x155-waybill');
  assert(waybill, 'Waybill profile should exist');
  assert.equal(waybill.widthMm, 100);
  assert.equal(waybill.heightMm, 155);

  const cable = MEDIA_PROFILES.find((p) => p.id === 'cable-flag-50x73');
  assert(cable, 'Cable flag profile should exist');
  assert(cable.safeAreaInset != null, 'Cable label should have safeAreaInset');

  const retail = mediaFromSize(50, 30);
  assert.equal(retail.widthMm, 50);
  assert.equal(retail.heightMm, 30);
  assert.equal(retail.cornerRadiusMm, 1.5);
  assert(retail.safeAreaInset != null);
  console.log('ok expanded media profiles catalog', MEDIA_PROFILES.length, 'presets');
}

async function testConvertWithPlaceholderSubstitution() {
  const doc = createLabelDocument({
    name: 'Template',
    widthMm: 50,
    heightMm: 25,
    elements: [
      {
        id: 't1',
        type: 'text',
        text: 'Order: {{order_id}}',
        fontSize: 12,
        fontFamily: 'Default',
        left: 2,
        top: 2,
        width: 40,
        height: 8,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: 'left',
        antiColor: false,
        verticalDisplay: false,
        autoWrapping: 'Close',
        autoTextHeight: false,
        charSpacing: 0,
        lineSpacing: '1.0',
        contentType: 'Manual',
        columnNameContent: '',
        rotation: 0,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
        opacity: 1,
      },
      {
        id: 'b1',
        type: 'barcode',
        content: '{{sku}}',
        contentType: 'Manual',
        columnNameContent: '',
        encodeMode: 'CODE128',
        textFlag: 'Bottom',
        fontFamily: 'Default',
        fontSize: 10,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: 'center',
        left: 2,
        top: 12,
        width: 40,
        height: 10,
        rotation: 0,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
        antiColor: false,
        opacity: 1,
      },
    ],
  });

  const printDoc = await convertLabelToPrintDocument(doc, {
    templateVariables: {
      order_id: 'ORD-9988',
      sku: 'SKU-ABC-123',
    },
  });

  const textEl = printDoc.elements.find((e) => e.type === 'text');
  assert(textEl, 'text element should exist');
  assert.equal((textEl.data as any).text, 'Order: ORD-9988');

  const barcodeEl = printDoc.elements.find((e) => e.type === 'barcode');
  assert(barcodeEl, 'barcode element should exist');
  assert.equal((barcodeEl.data as any).payload, 'SKU-ABC-123');

  console.log('ok convert template placeholders substituted');
}

function testDataBindingSheetPlaceholders() {
  const doc = createLabelDocument({
    name: 'Sheet Template',
    widthMm: 50,
    heightMm: 25,
    elements: [
      {
        id: 't1',
        type: 'text',
        text: 'Item: {{Product}} / Qty: {{Qty}}',
        fontSize: 12,
        fontFamily: 'Default',
        left: 2,
        top: 2,
        width: 40,
        height: 8,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        align: 'left',
        antiColor: false,
        verticalDisplay: false,
        autoWrapping: 'Close',
        autoTextHeight: false,
        charSpacing: 0,
        lineSpacing: '1.0',
        contentType: 'Manual',
        columnNameContent: '',
        rotation: 0,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
        opacity: 1,
      },
    ],
  });

  const sheet = {
    name: 'Products',
    columns: ['Product', 'Qty'],
    rows: [
      ['Widget A', '10'],
      ['Widget B', '25'],
    ],
  };

  const count = dataPageCount(doc, sheet);
  assert.equal(count, 2, 'dataPageCount should recognize {{placeholder}} and return 2');

  const page0 = resolveDocumentForPage(doc, sheet, 0);
  const text0 = page0.elements[0] as any;
  assert.equal(text0.text, 'Item: Widget A / Qty: 10');

  const page1 = resolveDocumentForPage(doc, sheet, 1);
  const text1 = page1.elements[0] as any;
  assert.equal(text1.text, 'Item: Widget B / Qty: 25');

  console.log('ok data binding sheet placeholders resolved');
}

async function main() {
  testMultiDpiSamePhysicalSize();
  testEdgeRounding();
  testArtworkRenderDots();
  testHardwareDpmDoesNotUseGlobal304();
  test50x25ProofAtHardwareDpi();
  test50x25TsplBitmapWidthIsBytes();
  test50x70PageDotsFromPrinterProfile();
  testArtworkHasNoPageBorder();
  testExifOrientation6SwapsAxes();
  testNoFlipYKeepsTopRow();
  testEmptyLabelHasNoInk();
  testEditorFinalizeSizeCaptureNotStretched();
  testEditorFinalizeOffSizeDoesNotSilentCrop();
  testEditorFinalizeIntegerDownsample();
  testEditorFinalizeFractionalDownsample();
  testDecimalMmPrintGeometry();
  testCableFlag50x73DieCut();
  testJewelry3UpTilesAllThreeColumns();
  await testValidationStopsOversized();
  testExpandedMediaProfilesCatalog();
  await testConvertWithPlaceholderSubstitution();
  testDataBindingSheetPlaceholders();
  console.log('ALL PRINT ENGINE TESTS PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
