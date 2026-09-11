import assert from 'node:assert/strict';

import type { LabelElement } from '../../label-document';
import {
  collectImageFileUris,
  editorImageFileName,
  EDITOR_IMAGE_MAX_EDGE_PX,
  isManagedEditorImageUri,
  placeImportedImageMm,
  printImageUri,
  unreferencedManagedFiles,
  workingSizePx,
} from '../image-ingest';

function imageEl(
  id: string,
  uri: string,
  extras: Partial<Extract<LabelElement, { type: 'image' }>> = {},
): LabelElement {
  return {
    id,
    type: 'image',
    uri,
    rotation: 0,
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    ...extras,
  };
}

function testWorkingCopyCapsLongEdgeAt2000() {
  const twelveMp = workingSizePx(4000, 3000);
  assert.equal(EDITOR_IMAGE_MAX_EDGE_PX, 2000);
  assert.equal(twelveMp.downscaled, true);
  assert.equal(twelveMp.widthPx, 2000);
  assert.equal(twelveMp.heightPx, 1500);
  const alreadySmall = workingSizePx(800, 600);
  assert.equal(alreadySmall.downscaled, false);
  assert.equal(alreadySmall.widthPx, 800);
  assert.equal(alreadySmall.heightPx, 600);
  console.log('ok 12MP working copy is 2000px on the long edge');
}

function testSmallPhotoKeepsNaturalMm() {
  const placed = placeImportedImageMm({
    widthPx: 80,
    heightPx: 60,
    pxPerMM: 4,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(placed.width, 20);
  assert.equal(placed.height, 15);
  assert.equal(placed.left, 15);
  assert.equal(placed.top, 7.5);
  assert.ok(Math.abs(placed.width / placed.height - 80 / 60) < 1e-9);
  console.log('ok small photo stays native mm and centered, not stretched to the label');
}

function testLargePhotoContainFitsWithoutStretch() {
  const placed = placeImportedImageMm({
    widthPx: 4000,
    heightPx: 3000,
    pxPerMM: 4,
    canvas: { widthMm: 50, heightMm: 30 },
  });
  assert.equal(placed.height, 30);
  assert.equal(placed.width, 40);
  assert.equal(placed.left, 5);
  assert.equal(placed.top, 0);
  assert.ok(Math.abs(placed.width / placed.height - 4000 / 3000) < 1e-9);
  console.log('ok 12MP photo contain-fits the artboard and keeps aspect');
}

function testJewelryAndCablePrintMmUnchanged() {
  const jewelryCanvas = { widthMm: 54, heightMm: 96 };
  const jewelry = placeImportedImageMm({
    widthPx: 4000,
    heightPx: 3000,
    pxPerMM: 4,
    canvas: jewelryCanvas,
    content: { left: 0, top: 0, width: 54, height: 64 },
  });
  assert.equal(jewelryCanvas.widthMm, 54);
  assert.equal(jewelryCanvas.heightMm, 96);
  assert.ok(jewelry.top >= 0);
  assert.ok(jewelry.top + jewelry.height <= 64 + 1e-9);
  assert.ok(jewelry.left + jewelry.width <= 54 + 1e-9);
  assert.ok(Math.abs(jewelry.width / jewelry.height - 4 / 3) < 1e-9);

  const cableCanvas = { widthMm: 50, heightMm: 73 };
  const cable = placeImportedImageMm({
    widthPx: 4000,
    heightPx: 3000,
    pxPerMM: 4,
    canvas: cableCanvas,
  });
  assert.equal(cableCanvas.widthMm, 50);
  assert.equal(cableCanvas.heightMm, 73);
  assert.ok(cable.width <= 50 + 1e-9);
  assert.ok(cable.height <= 73 + 1e-9);
  assert.ok(Math.abs(cable.width / cable.height - 4 / 3) < 1e-9);
  console.log('ok jewelry 54×96 and cable 50×73 print millimetres stay the label size');
}

function testPrintUsesOriginalUri() {
  const el = { uri: 'file:///preview.jpg', printUri: 'file:///original.jpg' };
  assert.equal(printImageUri(el), 'file:///original.jpg');
  assert.equal(printImageUri({ uri: 'file:///only.jpg' }), 'file:///only.jpg');
  console.log('ok print reads the original file, not the working copy');
}

function testSweepKeepsHistoryAndDropsReplacedFiles() {
  const previewA = 'file:///doc/sez-editor-images/a-preview.jpg';
  const printA = 'file:///doc/sez-editor-images/a-print.jpg';
  const previewB = 'file:///doc/sez-editor-images/b-preview.jpg';
  const printB = 'file:///doc/sez-editor-images/b-print.jpg';
  const current = [imageEl('b', previewB, { printUri: printB })];
  const history = [imageEl('a', previewA, { printUri: printA })];
  const keep = collectImageFileUris([current, history]);
  assert.equal(keep.length, 4);
  const stale = unreferencedManagedFiles(
    ['a-preview.jpg', 'a-print.jpg', 'b-preview.jpg', 'b-print.jpg', 'orphan.jpg'],
    keep,
  );
  assert.deepEqual(stale, ['orphan.jpg']);
  const afterDelete = unreferencedManagedFiles(
    ['a-preview.jpg', 'a-print.jpg', 'b-preview.jpg', 'b-print.jpg'],
    collectImageFileUris([current]),
  );
  assert.deepEqual(afterDelete.sort(), ['a-preview.jpg', 'a-print.jpg']);
  assert.equal(isManagedEditorImageUri('file:///photos/camera.jpg'), false);
  assert.equal(editorImageFileName(previewB), 'b-preview.jpg');
  console.log('ok sweep deletes replaced files and keeps undo snapshots');
}

function main() {
  testWorkingCopyCapsLongEdgeAt2000();
  testSmallPhotoKeepsNaturalMm();
  testLargePhotoContainFitsWithoutStretch();
  testJewelryAndCablePrintMmUnchanged();
  testPrintUsesOriginalUri();
  testSweepKeepsHistoryAndDropsReplacedFiles();
  console.log('ALL IMAGE INGEST TESTS PASSED');
}

main();
