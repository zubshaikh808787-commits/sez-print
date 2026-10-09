import assert from 'node:assert/strict';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import { createLabelDocument, generateId, mmToPt, type LabelDocument } from '@/lib/label-document';
import { mmToDots, rectMmToDots, td404OffsetClipsOuterEdge, tsplPackedWidthDots } from '@/lib/printer/print-spec';
import { centeredBorderRectMm } from '@/printing/raster/border-center';
import { packGrayToMono1bpp, unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import { borderStrokeDots } from '@/printing/raster/border-frame';
import { measureBorderInDots } from '@/printing/raster/border-measure';
import { stampPrintBordersOnGray, td404DocumentOffsetClipWarning } from '@/printing/raster/print-border';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function taggedBorderDoc(widthMm: number, heightMm: number): LabelDocument {
  return createLabelDocument({
    name: 'phase2-border',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements: [
      {
        ...DEFAULT_ELEMENT_STATE,
        id: generateId(),
        type: 'border',
        borderStyle: 'solid-medium',
        lineWidth: 0.55,
        left: 2,
        top: 2,
        width: widthMm - 4,
        height: heightMm - 4,
        geometryVersion: 1,
        lockMovement: true,
        needPrinting: true,
      },
    ],
  });
}

function contentOnlyDoc(widthMm: number, heightMm: number): LabelDocument {
  return createLabelDocument({
    name: 'phase2-content',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements: [
      {
        ...DEFAULT_ELEMENT_STATE,
        id: generateId(),
        type: 'text',
        text: 'Hello',
        fontSize: mmToPt(3),
        left: 6,
        top: 8,
        width: 20,
        height: 6,
        needPrinting: true,
      },
      {
        ...DEFAULT_QRCODE_STATE,
        id: generateId(),
        type: 'qrcode',
        content: 'phase2',
        left: Math.max(2, widthMm - 12),
        top: 6,
        width: 10,
        height: 10,
        needPrinting: true,
      },
      {
        ...DEFAULT_BARCODE_STATE,
        id: generateId(),
        type: 'barcode',
        content: '123456',
        left: 4,
        top: 18,
        width: Math.min(28, widthMm - 8),
        height: 8,
        needPrinting: true,
      },
    ],
  });
}

assert.equal(tsplPackedWidthDots(600), 600);
assert.equal(tsplPackedWidthDots(396), 400);
assert.ok(borderStrokeDots(0.1, dpi, 0.55) >= 4);

const insetMm = mmToDots(2, dpi);
for (const [wMm, hMm] of [
  [50, 30],
  [40, 40],
  [33, 48],
  [80, 20],
  [100, 150],
  [54, 96],
  [14.3, 101.6],
] as const) {
  const doc = taggedBorderDoc(wMm, hMm);
  const bmp = rasterizeDocumentToBitmap(doc, dpi, { threshold: 160, backend: 'dot-buffer' });
  const gray = unpackMono1bppToGray(bmp.mono1bppBuffer, bmp.widthDots, bmp.heightDots, bmp.bytesPerRow);
  const m = measureBorderInDots(gray, bmp.widthDots, mmToDots(wMm, dpi), mmToDots(hMm, dpi));
  const expected = rectMmToDots(2, 2, wMm - 4, hMm - 4, dpi);
  assert.ok(m.box, `${wMm}x${hMm} border ink`);
  assert.equal(m.box!.x0, expected.x0, `${wMm}x${hMm} left`);
  assert.equal(m.box!.y0, expected.y0, `${wMm}x${hMm} top`);
  assert.ok(Math.abs(m.box!.x1 - expected.x1) <= 1, `${wMm}x${hMm} right`);
  assert.ok(Math.abs(m.box!.y1 - expected.y1) <= 1, `${wMm}x${hMm} bottom`);
  assert.equal(m.box!.x0, insetMm);
}

const noClip = td404OffsetClipsOuterEdge(50, 30, dpi, 0, 0, 48, 28);
assert.equal(noClip.clipsRight, false);
assert.equal(noClip.clipsBottom, false);
const hOne = td404OffsetClipsOuterEdge(50, 30, dpi, 1, 0, 48, 28);
assert.equal(hOne.clipsRight, false);
const hTwo = td404OffsetClipsOuterEdge(50, 30, dpi, 2, 0, 48, 28);
assert.equal(hTwo.clipsRight, true);
const vOne = td404OffsetClipsOuterEdge(50, 30, dpi, 0, 1, 48, 28);
assert.equal(vOne.clipsBottom, false);
const vTwo = td404OffsetClipsOuterEdge(50, 30, dpi, 0, 2, 48, 28);
assert.equal(vTwo.clipsBottom, true);

const warnDoc = taggedBorderDoc(50, 30);
assert.equal(td404DocumentOffsetClipWarning(warnDoc, dpi, 0, 0), null);
assert.match(td404DocumentOffsetClipWarning(warnDoc, dpi, 1, 0) ?? '', /closer than 1\.5 mm.*right 1\.00 mm/);
assert.match(td404DocumentOffsetClipWarning(warnDoc, dpi, 0, -1) ?? '', /top 1\.00 mm/);
assert.match(td404DocumentOffsetClipWarning(warnDoc, dpi, 2, 0) ?? '', /right border edge .* cut off/);
const fullBleedUntagged = taggedBorderDoc(50, 30);
const fb = fullBleedUntagged.elements[0] as Extract<LabelDocument['elements'][number], { type: 'border' }>;
Object.assign(fb, { left: 0, top: 0, width: 50, height: 30, geometryVersion: undefined });
assert.match(
  td404DocumentOffsetClipWarning(fullBleedUntagged, dpi, 0, 0) ?? '',
  /border edge/,
  'full-bleed canvas W×H prints to the die edge (no extra inset)',
);
const tight = taggedBorderDoc(50, 30);
Object.assign(tight.elements[0], { left: 1, top: 1, width: 48, height: 28 });
assert.match(td404DocumentOffsetClipWarning(tight, dpi, 0, 0) ?? '', /left 1\.00 mm/);

const border50 = taggedBorderDoc(50, 30);
const headless = rasterizeDocumentToBitmap(border50, dpi, { threshold: 160, backend: 'dot-buffer' });
const sizeW = mmToDots(50, dpi);
const sizeH = mmToDots(30, dpi);
const packedW = tsplPackedWidthDots(sizeW);
assert.equal(headless.widthDots, packedW);
const white = new Uint8Array(packedW * sizeH);
white.fill(255);
stampPrintBordersOnGray(white, packedW, sizeH, border50, dpi, {
  labelWidthDots: sizeW,
  labelHeightDots: sizeH,
});
const stamped = packGrayToMono1bpp(white, packedW, sizeH, 160);
assert.deepEqual(headless.mono1bppBuffer, stamped.mono1bppBuffer);

const stale = taggedBorderDoc(50, 30);
stale.widthMm = 80;
stale.heightMm = 40;
const staleBmp = rasterizeDocumentToBitmap(stale, dpi, { threshold: 160, backend: 'dot-buffer' });
const staleSizeW = mmToDots(80, dpi);
const staleSizeH = mmToDots(40, dpi);
const stalePacked = tsplPackedWidthDots(staleSizeW);
assert.equal(staleBmp.widthDots, stalePacked);
const staleGray = unpackMono1bppToGray(
  staleBmp.mono1bppBuffer,
  stalePacked,
  staleBmp.heightDots,
  staleBmp.bytesPerRow,
);
let minX = stalePacked;
let maxX = -1;
let minY = staleSizeH;
let maxY = -1;
for (let y = 0; y < staleSizeH; y++) {
  for (let x = 0; x < stalePacked; x++) {
    if (staleGray[y * stalePacked + x] > 160) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
// Print recenters canvas W×H on the current label; stored left/top is ignored.
const staleMm = centeredBorderRectMm({
  frameWidthMm: 80,
  frameHeightMm: 40,
  borderWidthMm: 46,
  borderHeightMm: 26,
});
const staleRect = rectMmToDots(staleMm.left, staleMm.top, staleMm.width, staleMm.height, dpi);
assert.ok(Math.abs(minX - staleRect.x0) <= 1, `stale L ${minX} expected ${staleRect.x0}`);
assert.ok(Math.abs(maxX + 1 - staleRect.x1) <= 1, `stale R ${maxX + 1} expected ${staleRect.x1}`);
assert.ok(Math.abs(minY - staleRect.y0) <= 1, `stale T ${minY} expected ${staleRect.y0}`);
assert.ok(Math.abs(maxY + 1 - staleRect.y1) <= 1, `stale B ${maxY + 1} expected ${staleRect.y1}`);

const content50 = contentOnlyDoc(50, 30);
const a = rasterizeDocumentToBitmap(content50, dpi, { threshold: 160, backend: 'dot-buffer' });
const b = rasterizeDocumentToBitmap(content50, dpi, { threshold: 160, backend: 'dot-buffer' });
assert.deepEqual(a.mono1bppBuffer, b.mono1bppBuffer);

const content33 = contentOnlyDoc(33, 30);
const odd = rasterizeDocumentToBitmap(content33, dpi, { threshold: 160, backend: 'dot-buffer' });
const oddSizeW = mmToDots(33, dpi);
const oddPackedW = tsplPackedWidthDots(oddSizeW);
assert.equal(odd.widthDots, oddPackedW);
assert.ok(oddPackedW > oddSizeW);
const unpacked = unpackMono1bppToGray(odd.mono1bppBuffer, oddPackedW, odd.heightDots, odd.bytesPerRow);
for (let y = 0; y < odd.heightDots; y++) {
  for (let x = oddSizeW; x < oddPackedW; x++) {
    assert.equal(unpacked[y * oddPackedW + x], 255, `pad pixel ${x},${y}`);
  }
}

console.log('ok phase2-border');
