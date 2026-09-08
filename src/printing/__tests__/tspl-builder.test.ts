import assert from 'node:assert/strict';
import {
  TsplBuilder,
  setSize,
  setGap,
  clear,
  drawBox,
  drawText,
  drawBarcode,
  drawQrCode,
  printCommand,
  PRINTER_DPI,
  DOTS_PER_MM,
} from '../tspl-builder';

function testBasicFluentBuilder() {
  const tspl = new TsplBuilder()
    .setSize(50, 30)
    .setGap(2)
    .clear()
    .drawBox(5, 5, 40, 20, 0.35)
    .drawText(8, 7, 'TEST LABEL', 12)
    .drawBarcode(8, 14, 'BAR-12345', '128', { heightMm: 8, readable: 1 })
    .drawQrCode(35, 14, 'QR-DATA', { cellWidthDots: 4 })
    .print(1)
    .build();

  assert(tspl.includes('SIZE 50 mm, 30 mm'), 'Must set SIZE');
  assert(tspl.includes('GAP 2 mm, 0 mm'), 'Must set GAP');
  assert(tspl.includes('CLS'), 'Must clear buffer');
  // 5mm = 60 dots, 45mm = 539 dots, 5mm = 60 dots, 25mm = 299 dots
  assert(tspl.includes('BOX 60,60,539,299,4'), 'Box must have exact dots 60,60,539,299,4');
  // 8mm = 96 dots, 7mm = 84 dots
  assert(tspl.includes('TEXT 96,84,"3",0,1,1,"TEST LABEL"'), 'Text must have font and exact dots');
  // 8mm = 96 dots, 14mm = 168 dots, height 8mm = 96 dots
  assert(tspl.includes('BARCODE 96,168,"128",96,1,0,2,2,"BAR-12345"'), 'Barcode must match TSPL syntax');
  // 35mm = 419 dots, 14mm = 168 dots
  assert(tspl.includes('QRCODE 419,168,M,4,A,0,M2,S7,"QR-DATA"'), 'QR code must match TSPL syntax');
  assert(tspl.includes('PRINT 1'), 'Must include PRINT command');

  console.log('ok testBasicFluentBuilder');
}

function testStandaloneFunctions() {
  assert.equal(setSize(60, 40), 'SIZE 60 mm, 40 mm');
  assert.equal(setGap(3), 'GAP 3 mm, 0 mm');
  assert.equal(clear(), 'CLS');
  assert.equal(printCommand(2), 'PRINT 2');

  const box = drawBox(10, 5, 30, 15, 0.5);
  // x0 = 120, y0 = 60, x1 = 479, y1 = 239, thick = 6
  assert.equal(box, 'BOX 120,60,479,239,6');

  const text = drawText(10, 5, 'Hello "World"', 16);
  assert.equal(text, 'TEXT 120,60,"4",0,1,1,"Hello \\"World\\""');

  const barcode = drawBarcode(10, 12, 'SKU-99', '128', { heightMm: 10 });
  assert.equal(barcode, 'BARCODE 120,144,"128",120,1,0,2,2,"SKU-99"');

  const qr = drawQrCode(20, 20, 'ABC', { eccLevel: 'H', cellWidthDots: 5 });
  assert.equal(qr, 'QRCODE 239,239,H,5,A,0,M2,S7,"ABC"');

  console.log('ok testStandaloneFunctions');
}

function testEdgeCases() {
  const builder = new TsplBuilder();

  // Very small 5mm element
  builder.drawBox(1, 1, 5, 5, 0.2);
  const cmdSmall = builder.getCommands()[0];
  // 1mm = 12 dots, 6mm = 72 dots, thick = Math.max(1, Math.round(0.2*11.9685)) = 2 dots
  assert.equal(cmdSmall, 'BOX 12,12,72,72,2');

  // Near full-label element on 100x150 mm label
  const fullBuilder = new TsplBuilder().setSize(100, 150);
  fullBuilder.drawBox(1, 1, 98, 148, 0.35);
  const cmdFull = fullBuilder.getCommands()[1];
  // 1mm = 12 dots, 99mm = 1185 dots, 149mm = 1783 dots (full label is 1197 x 1795 dots)
  assert.equal(cmdFull, 'BOX 12,12,1185,1783,4');
  assert(1185 < Math.round(100 * DOTS_PER_MM), 'Box X1 must remain within label print head');
  assert(1783 < Math.round(150 * DOTS_PER_MM), 'Box Y1 must remain within label height');

  console.log('ok testEdgeCases (5mm small and near-full-label boundaries)');
}

function testByteOutput() {
  const builder = new TsplBuilder()
    .setSize(50, 25)
    .clear()
    .print(1);
  const bytes = builder.toBytes();
  assert(bytes instanceof Uint8Array, 'toBytes must return Uint8Array');
  assert(bytes.length > 0, 'Byte buffer must not be empty');

  const decoded = new TextDecoder().decode(bytes);
  assert(decoded.includes('SIZE 50 mm, 25 mm\r\n'));
  assert(decoded.includes('PRINT 1\r\n'));

  console.log('ok testByteOutput');
}

function main() {
  console.log('--- Running Phase 1 TSPL Builder Tests ---');
  testBasicFluentBuilder();
  testStandaloneFunctions();
  testEdgeCases();
  testByteOutput();
  console.log('ALL PHASE 1 TESTS PASSED');
}

main();
