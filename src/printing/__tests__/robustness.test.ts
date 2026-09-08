import assert from 'node:assert/strict';
import {
  TsplBuilder,
  SupportedDpi,
  computeDotsPerMm,
  calculateCalibrationAdjustment,
  generateCalibrationTspl,
  substituteSequencePlaceholders,
  exportBatchCanvasJob,
  validateCanvasPrintJob,
  exportCanvasToTspl,
  exportUnifiedCanvasJob,
  type CanvasDocument,
  type CanvasTextElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasBoxElement,
} from '../index';

export function runRobustnessTests(): void {
  console.log('--- Phase 9 Robustness & Edge Cases Unit Tests ---');

  // 1. Multi-DPI Dots-Per-Mm & Coordinate Scaling
  testMultiDpiCalculations();

  // 2. Media Sensor TSPL Commands (Gap, Black Mark, Continuous)
  testMediaSensorCommands();

  // 3. Variable Data Placeholder Substitution
  testPlaceholderSubstitution();

  // 4. Batch Printing Engine
  testBatchPrintingJob();

  // 5. Pre-Flight Validation Engine
  testPreFlightValidation();

  // 6. Caliper Micro-Recalibration Flow
  testCaliperAdjustmentCalculations();

  console.log('--- Phase 9 Robustness Tests All Passed ---\n');
}

function testMultiDpiCalculations(): void {
  const supportedDpis: SupportedDpi[] = [203, 300, 304, 600];

  for (const dpi of supportedDpis) {
    const dpm = computeDotsPerMm(dpi);
    const expectedDpm = dpi / 25.4;
    assert.equal(dpm, expectedDpm, `Unrounded DPM for ${dpi} DPI`);

    // Verify 50mm box coordinates at each DPI
    const builder = new TsplBuilder({ dpi });
    builder.drawBox(10, 10, 50, 30, 0.35);
    const cmd = builder.getCommands()[0];

    const x0 = Math.round(10 * expectedDpm);
    const y0 = Math.round(10 * expectedDpm);
    const x1 = Math.round(60 * expectedDpm);
    const y1 = Math.round(40 * expectedDpm);
    const thick = Math.max(1, Math.round(0.35 * expectedDpm));

    assert.equal(cmd, `BOX ${x0},${y0},${x1},${y1},${thick}`, `TSPL BOX command at ${dpi} DPI`);
  }

  // Verify that 203 DPI produces fewer dots than 600 DPI for the same 50mm dimension
  const b203 = new TsplBuilder({ dpi: 203 });
  b203.drawBox(0, 0, 50, 50);
  const b600 = new TsplBuilder({ dpi: 600 });
  b600.drawBox(0, 0, 50, 50);

  const dots203 = Math.round(50 * (203 / 25.4));
  const dots600 = Math.round(50 * (600 / 25.4));
  assert.equal(b203.getCommands()[0], `BOX 0,0,${dots203},${dots203},3`);
  assert.equal(b600.getCommands()[0], `BOX 0,0,${dots600},${dots600},8`);
  assert(dots600 > dots203 * 2.8, '600 DPI should have ~2.95x dots of 203 DPI');

  console.log('✓ Multi-DPI dot scaling verified across 203, 300, 304, 600 DPI');
}

function testMediaSensorCommands(): void {
  // Gap sensor
  const bGap = new TsplBuilder();
  bGap.setSensor('gap', 3, 0);
  assert.equal(bGap.getCommands()[0], 'GAP 3 mm, 0 mm');

  // Black mark sensor
  const bBline = new TsplBuilder();
  bBline.setSensor('blackmark', 4, 0);
  assert.equal(bBline.getCommands()[0], 'BLINE 4 mm, 0 mm');

  // Continuous stock
  const bCont = new TsplBuilder();
  bCont.setSensor('continuous');
  assert.equal(bCont.getCommands()[0], 'GAP 0 mm, 0 mm');

  // In exportCanvasToTspl
  const doc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [],
  };

  const tsplBline = exportCanvasToTspl(doc, {
    sensorType: 'blackmark',
    blackMarkHeightMm: 3.5,
  });
  assert(tsplBline.includes('BLINE 3.5 mm, 0 mm'), 'exportCanvasToTspl should output BLINE');

  const tsplCont = exportCanvasToTspl(doc, {
    sensorType: 'continuous',
  });
  assert(tsplCont.includes('GAP 0 mm, 0 mm'), 'exportCanvasToTspl should output continuous GAP 0');

  // In exportUnifiedCanvasJob
  const jobBline = exportUnifiedCanvasJob(doc, {
    sensorType: 'blackmark',
    blackMarkHeightMm: 5,
  });
  assert(jobBline.tsplAscii.includes('BLINE 5 mm, 0 mm'));

  console.log('✓ Media sensor commands (gap, black mark, continuous) verified');
}

function testPlaceholderSubstitution(): void {
  // Basic {seq}
  assert.equal(substituteSequencePlaceholders('LOT-{seq}', 1), 'LOT-1');
  assert.equal(substituteSequencePlaceholders('LOT-{seq}', 42), 'LOT-42');

  // Padded with {seq:001} (3 digits)
  assert.equal(substituteSequencePlaceholders('BOX-{seq:001}', 5), 'BOX-005');
  assert.equal(substituteSequencePlaceholders('BOX-{seq:001}', 123), 'BOX-123');

  // Padded with {seq:4}
  assert.equal(substituteSequencePlaceholders('PART-{seq:4}', 9), 'PART-0009');

  // Alternative {{seq}} and {serial}
  assert.equal(substituteSequencePlaceholders('{{seq}}-ITEM', 7), '7-ITEM');
  assert.equal(substituteSequencePlaceholders('SN:{serial}', 88), 'SN:88');

  // Multiple placeholders in single string
  assert.equal(
    substituteSequencePlaceholders('ID:{seq}-LOT:{{seq}}', 3),
    'ID:3-LOT:3',
  );

  console.log('✓ Sequential variable data placeholder substitution verified');
}

function testBatchPrintingJob(): void {
  const doc: CanvasDocument = {
    widthMm: 60,
    heightMm: 40,
    gapMm: 2,
    elements: [
      {
        id: 'txt-seq',
        type: 'text',
        text: 'SERIAL: {seq:001}',
        left: 5,
        top: 5,
        fontSize: 12,
      } as CanvasTextElement,
      {
        id: 'bc-seq',
        type: 'barcode',
        data: 'SN{seq:001}',
        left: 5,
        top: 15,
        height: 12,
        narrowDots: 2,
      } as CanvasBarcodeElement,
      {
        id: 'qr-seq',
        type: 'qr',
        data: 'https://track.io/item/{seq:001}',
        left: 40,
        top: 15,
        sizeMm: 14,
      } as CanvasQrElement,
    ],
  };

  const batchCount = 3;
  const result = exportBatchCanvasJob(doc, batchCount, {
    startSequence: 10,
    stepSequence: 2,
    padDigits: 3,
  });

  assert.equal(result.labelCount, 3);
  assert(result.totalBytes > 0);
  assert.equal(result.binaryPayload.length, result.totalBytes);

  // Setup commands should appear once at the top
  const sizeMatches = result.tsplAscii.match(/SIZE 60 mm, 40 mm/g);
  assert.equal(sizeMatches?.length, 1, 'SIZE header emitted only once');

  // Each label must have CLS and PRINT 1
  const clsMatches = result.tsplAscii.match(/CLS/g);
  assert.equal(clsMatches?.length, 3, 'CLS emitted exactly 3 times');

  const printMatches = result.tsplAscii.match(/PRINT 1/g);
  assert.equal(printMatches?.length, 3, 'PRINT 1 emitted exactly 3 times');

  // Check sequence progression (10, 12, 14 with 3-digit padding)
  assert(result.tsplAscii.includes('"SERIAL: 010"'));
  assert(result.tsplAscii.includes('"SERIAL: 012"'));
  assert(result.tsplAscii.includes('"SERIAL: 014"'));

  assert(result.tsplAscii.includes('"SN010"'));
  assert(result.tsplAscii.includes('"SN012"'));
  assert(result.tsplAscii.includes('"SN014"'));

  assert(result.tsplAscii.includes('"https://track.io/item/010"'));
  assert(result.tsplAscii.includes('"https://track.io/item/012"'));
  assert(result.tsplAscii.includes('"https://track.io/item/014"'));

  console.log('✓ Batch printing TSPL stream generation & data merge verified');
}

function testPreFlightValidation(): void {
  // 1. Valid document passes cleanly
  const validDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [
      {
        id: 'valid-box',
        type: 'box',
        left: 2,
        top: 2,
        width: 46,
        height: 26,
      } as CanvasBoxElement,
      {
        id: 'valid-txt',
        type: 'text',
        text: 'Clean Label',
        left: 5,
        top: 5,
        fontSize: 10,
      } as CanvasTextElement,
      {
        id: 'valid-bc',
        type: 'barcode',
        data: '123456',
        left: 5,
        top: 12,
        height: 10,
        narrowDots: 2,
      } as CanvasBarcodeElement,
    ],
  };

  const cleanReport = validateCanvasPrintJob(validDoc);
  assert.equal(cleanReport.isValid, true);
  assert.equal(cleanReport.errors.length, 0);

  // 2. Oversized label width (> 108mm) triggers error
  const oversizedDoc: CanvasDocument = {
    widthMm: 115,
    heightMm: 50,
    elements: [],
  };
  const overReport = validateCanvasPrintJob(oversizedDoc);
  assert.equal(overReport.isValid, false);
  assert(overReport.errors.some((e) => e.code === 'OVERSIZED_LABEL_WIDTH'));

  // 3. Negative offset triggers error
  const negativeDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [
      {
        id: 'bad-pos',
        type: 'text',
        text: 'Out of bounds',
        left: -5,
        top: 10,
        fontSize: 12,
      } as CanvasTextElement,
    ],
  };
  const negReport = validateCanvasPrintJob(negativeDoc);
  assert.equal(negReport.isValid, false);
  assert(negReport.errors.some((e) => e.code === 'ELEMENT_NEGATIVE_OFFSET'));

  // 4. Clipped barcode triggers error/warning
  const clippedBcDoc: CanvasDocument = {
    widthMm: 40,
    heightMm: 30,
    elements: [
      {
        id: 'clipped-bc',
        type: 'barcode',
        data: 'VERY-LONG-BARCODE-DATA-THAT-EXCEEDS-LABEL-WIDTH-1234567890',
        left: 10,
        top: 5,
        height: 10,
      } as CanvasBarcodeElement,
    ],
  };
  const clippedReport = validateCanvasPrintJob(clippedBcDoc);
  assert(
    clippedReport.errors.some((e) => e.code === 'BARCODE_CLIPPED') ||
      clippedReport.warnings.some((w) => w.code === 'BARCODE_CLIPPED'),
  );

  // 5. Empty text triggers warning
  const emptyTxtDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [
      {
        id: 'empty-text-el',
        type: 'text',
        text: '   ',
        left: 5,
        top: 5,
        fontSize: 12,
      } as CanvasTextElement,
    ],
  };
  const emptyReport = validateCanvasPrintJob(emptyTxtDoc);
  assert(emptyReport.warnings.some((w) => w.code === 'EMPTY_TEXT'));

  // 6. Circular shape on non-square label triggers warning
  const nonSquareCircleDoc: CanvasDocument = {
    widthMm: 60,
    heightMm: 40,
    shape: {
      type: 'circle',
      widthMm: 60,
      heightMm: 40,
    },
    elements: [],
  };
  const circleReport = validateCanvasPrintJob(nonSquareCircleDoc);
  assert(circleReport.warnings.some((w) => w.code === 'CIRCULAR_NON_SQUARE'));

  console.log('✓ Pre-flight validation diagnostics verified');
}

function testCaliperAdjustmentCalculations(): void {
  // Expected 50mm, printed 49.0mm (printed too narrow by 1.0mm)
  // Scale factor X should be 50 / 49 = 1.0204 (+2.04% dot expansion)
  // Expected 30mm, printed 30.5mm (printed too tall by 0.5mm)
  // Scale factor Y should be 30 / 30.5 = 0.9836 (-1.64% dot contraction)
  const adj = calculateCalibrationAdjustment(50, 49.0, 30, 30.5, 304);

  assert.equal(adj.expectedWidthMm, 50);
  assert.equal(adj.measuredWidthMm, 49.0);
  assert.equal(adj.expectedHeightMm, 30);
  assert.equal(adj.measuredHeightMm, 30.5);
  assert.equal(adj.scaleFactorX, 1.0204);
  assert.equal(adj.scaleFactorY, 0.9836);

  // When applied to generateCalibrationTspl:
  const baseBox = generateCalibrationTspl({
    labelWidthMm: 60,
    labelHeightMm: 40,
    boxWidthMm: 50,
    boxHeightMm: 30,
  });

  const tunedBox = generateCalibrationTspl({
    labelWidthMm: 60,
    labelHeightMm: 40,
    boxWidthMm: 50,
    boxHeightMm: 30,
    calibrationScale: { scaleX: adj.scaleFactorX, scaleY: adj.scaleFactorY },
  });

  // Base 50mm at 304 DPI = Math.round(50 * 11.9685039) = 598 dots
  // Tuned 50mm with 1.0204 scale = Math.round(50 * 11.9685039 * 1.0204) = 611 dots
  assert(tunedBox.dots.boxWidthDots > baseBox.dots.boxWidthDots);
  assert(tunedBox.dots.boxHeightDots < baseBox.dots.boxHeightDots);

  console.log('✓ Caliper micro-recalibration adjustment factor calculations verified');
}
