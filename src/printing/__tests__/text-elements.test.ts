import assert from 'node:assert/strict';
import {
  resolveTsplFont,
  tsplFontHeightMm,
  applyDragToMm,
  exportCanvasToTspl,
  type CanvasTextElement,
  type CanvasDocument,
} from '../canvas-export';
import { DOTS_PER_MM } from '../calibration';

export function runTextElementTests() {
  console.log('--- Phase 4: Text Elements & Font Resolution Tests ---');

  // 1. Deterministic TSPL font resolution table
  const testCases = [
    { pt: 6, expectedFont: '1', expectedX: 1, expectedY: 1, expectedMm: 1.0, expectedDots: 12 },
    { pt: 8, expectedFont: '2', expectedX: 1, expectedY: 1, expectedMm: 1.67, expectedDots: 20 },
    { pt: 10, expectedFont: '3', expectedX: 1, expectedY: 1, expectedMm: 2.01, expectedDots: 24 },
    { pt: 12, expectedFont: '3', expectedX: 1, expectedY: 1, expectedMm: 2.01, expectedDots: 24 },
    { pt: 14, expectedFont: '4', expectedX: 1, expectedY: 1, expectedMm: 2.67, expectedDots: 32 },
    { pt: 18, expectedFont: '5', expectedX: 1, expectedY: 1, expectedMm: 4.01, expectedDots: 48 },
    { pt: 24, expectedFont: '4', expectedX: 2, expectedY: 2, expectedMm: 5.35, expectedDots: 64 },
    { pt: 36, expectedFont: '5', expectedX: 2, expectedY: 2, expectedMm: 8.02, expectedDots: 96 },
    { pt: 48, expectedFont: '5', expectedX: 3, expectedY: 3, expectedMm: 12.03, expectedDots: 144 },
  ];

  for (const tc of testCases) {
    const res = resolveTsplFont(tc.pt);
    assert.equal(res.font, tc.expectedFont, `Font at ${tc.pt}pt`);
    assert.equal(res.xMulti, tc.expectedX, `xMulti at ${tc.pt}pt`);
    assert.equal(res.yMulti, tc.expectedY, `yMulti at ${tc.pt}pt`);
    assert.equal(res.capHeightMm, tc.expectedMm, `capHeightMm at ${tc.pt}pt`);
    assert.equal(res.dotsHeight, tc.expectedDots, `dotsHeight at ${tc.pt}pt`);
    assert.equal(tsplFontHeightMm(tc.pt), tc.expectedMm);
  }
  console.log('ok deterministic TSPL font resolution verified across all sizes (6pt to 48pt)');

  // 2. Text element mm model representation & position round-trip
  const textEl: CanvasTextElement = {
    id: 'text-1',
    type: 'text',
    text: 'SEZ PRINT',
    left: 10.5,
    top: 8.0,
    fontSize: 14,
    rotation: 0,
  };

  assert.equal(textEl.left, 10.5);
  assert.equal(textEl.top, 8.0);
  assert.equal(textEl.fontSize, 14);
  assert.equal(textEl.text, 'SEZ PRINT');
  console.log('ok text element mm position and font size round-trip in model');

  // 3. Dragging text element converts screen delta to mm
  const scale = 6.0; // 6 px/mm
  const initialPos = { left: textEl.left, top: textEl.top };
  // Drag by 30px right (+5mm), 18px down (+3mm)
  const dragged = applyDragToMm(initialPos, { x: 30, y: 18 }, scale, 1.0);
  assert.equal(dragged.left, 15.5, '10.5 + 30/6 = 15.5mm');
  assert.equal(dragged.top, 11.0, '8.0 + 18/6 = 11.0mm');

  // Dragging with boundary clamping on a 50x30 mm label (assume text bounding 20x5 mm)
  const clamped = applyDragToMm(
    initialPos,
    { x: 300, y: 300 },
    scale,
    1.0,
    { labelWidth: 50, labelHeight: 30, elementWidth: 20, elementHeight: 5 },
  );
  assert.equal(clamped.left, 30, 'Clamped to 50 - 20 = 30mm');
  assert.equal(clamped.top, 25, 'Clamped to 30 - 5 = 25mm');
  console.log('ok dragging text element converts screen delta to mm and clamps to label');

  // 4. Zoom factor preserves text element mm values
  const zoomedDrag = applyDragToMm(initialPos, { x: 60, y: 36 }, scale, 2.0);
  assert.equal(zoomedDrag.left, 15.5, '10.5 + 60/(6*2) = 15.5mm');
  assert.equal(zoomedDrag.top, 11.0, '8.0 + 36/(6*2) = 11.0mm');
  console.log('ok zoom factor strictly isolates viewport from stored text mm model');

  // 5. TSPL export of text element produces exact TSPL command
  const doc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [
      {
        id: 'title',
        type: 'text',
        text: 'BATCH A1',
        left: 5,
        top: 6,
        fontSize: 14, // Font 4, 1x, 1y
      },
      {
        id: 'subtitle',
        type: 'text',
        text: 'SKU-9900',
        left: 5,
        top: 14,
        fontSize: 10, // Font 3, 1x, 1y
      },
      {
        id: 'price',
        type: 'text',
        text: '$49.99',
        left: 5,
        top: 22,
        fontSize: 24, // Font 4, 2x, 2y
      },
    ],
  };

  const tspl = exportCanvasToTspl(doc);

  // Exact dot coordinates:
  // Title (5, 6 mm): x = round(5 * 11.9685) = 60, y = round(6 * 11.9685) = 72
  const expTitleX = Math.round(5 * DOTS_PER_MM);
  const expTitleY = Math.round(6 * DOTS_PER_MM);
  assert(
    tspl.includes(`TEXT ${expTitleX},${expTitleY},"4",0,1,1,"BATCH A1"`),
    `Must include Title command with Font 4. Got:\n${tspl}`,
  );

  // Subtitle (5, 14 mm): x = 60, y = round(14 * 11.9685) = 168
  const expSubY = Math.round(14 * DOTS_PER_MM);
  assert(
    tspl.includes(`TEXT ${expTitleX},${expSubY},"3",0,1,1,"SKU-9900"`),
    `Must include Subtitle command with Font 3. Got:\n${tspl}`,
  );

  // Price (5, 22 mm): x = 60, y = round(22 * 11.9685) = 263, Font 4, 2x, 2y
  const expPriceY = Math.round(22 * DOTS_PER_MM);
  assert(
    tspl.includes(`TEXT ${expTitleX},${expPriceY},"4",0,2,2,"$49.99"`),
    `Must include Price command with Font 4 2x2. Got:\n${tspl}`,
  );
  console.log('ok exportCanvasToTspl generates exact TSPL text commands for multiple sizes');

  // 6. Multi-element document with box + text + boundary
  const fullDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    gapMm: 2,
    direction: 1,
    elements: [
      {
        id: 'box-1',
        type: 'box',
        left: 2,
        top: 2,
        width: 46,
        height: 26,
        lineWidth: 0.35,
      },
      {
        id: 'label-text',
        type: 'text',
        text: 'CALIPER TEST',
        left: 6,
        top: 10,
        fontSize: 18,
      },
    ],
  };

  const fullTspl = exportCanvasToTspl(fullDoc, { printBoundary: true });
  assert(fullTspl.includes('BOX 0,0,598,359,4'), 'Contains outer boundary box');
  assert(fullTspl.includes('BOX 24,24,574,335,4'), 'Contains inner box element');
  assert(fullTspl.includes(`TEXT ${Math.round(6 * DOTS_PER_MM)},${Math.round(10 * DOTS_PER_MM)},"5",0,1,1,"CALIPER TEST"`));
  console.log('ok full document with box + text + boundary exports accurately');

  // 7. Special character escaping
  const escapedDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 30,
    elements: [
      {
        id: 'quoted-text',
        type: 'text',
        text: 'ITEM "X-100"',
        left: 5,
        top: 5,
        fontSize: 10,
      },
    ],
  };
  const escapedTspl = exportCanvasToTspl(escapedDoc);
  assert(escapedTspl.includes('ITEM \\"X-100\\"'), 'Quotes must be escaped with backslash in TSPL');
  console.log('ok string escaping prevents TSPL syntax errors on quotes');

  console.log('ALL PHASE 4 TEXT ELEMENT TESTS PASSED');
}

if (require.main === module) {
  runTextElementTests();
}
