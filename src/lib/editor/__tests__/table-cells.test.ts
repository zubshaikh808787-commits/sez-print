import test from 'node:test';
import assert from 'node:assert/strict';

import { createTableState } from '../../../components/editor/types';
import {
  hitTestTableCellByFraction,
  hitTestTableCellFromViewPoint,
  patchTableCellInElement,
  sameTableCellSelection,
} from '../table-cells';
import { isQuickEditableType } from '../quick-value';
import { measureTextWidthMm, singleLineSqueezeSpacingMm } from '../../text-metrics';

test('hit-test maps each 2x2 quadrant to the matching cell', () => {
  const table = createTableState(2, 2);
  const w = 200;
  const h = 100;
  const taps = [
    { x: w * 0.25, y: h * 0.25, row: 0, col: 0 },
    { x: w * 0.75, y: h * 0.25, row: 0, col: 1 },
    { x: w * 0.25, y: h * 0.75, row: 1, col: 0 },
    { x: w * 0.75, y: h * 0.75, row: 1, col: 1 },
  ];
  for (const t of taps) {
    const hit = hitTestTableCellFromViewPoint(table, t.x, t.y, w, h);
    assert.deepEqual(hit, { row: t.row, col: t.col }, JSON.stringify(t));
  }
});

test('hit-test follows visual row/col fractions after resize mismatch', () => {
  const table = {
    ...createTableState(2, 2),
    width: 40,
    height: 12,
    rowHeights: [13, 13],
    columnWidths: [25, 25],
  };
  const w = 200;
  const h = 100;
  assert.deepEqual(hitTestTableCellFromViewPoint(table, w * 0.25, h * 0.25, w, h), {
    row: 0,
    col: 0,
  });
  assert.deepEqual(hitTestTableCellFromViewPoint(table, w * 0.25, h * 0.75, w, h), {
    row: 1,
    col: 0,
  });
  assert.deepEqual(hitTestTableCellFromViewPoint(table, w * 0.75, h * 0.75, w, h), {
    row: 1,
    col: 1,
  });
  assert.deepEqual(hitTestTableCellByFraction(table, 0.55, 0.55), { row: 1, col: 1 });
});

test('patching one cell does not change another cell', () => {
  const table = createTableState(2, 2);
  const next = patchTableCellInElement(table, 0, 0, { text: 'AAA' });
  const again = patchTableCellInElement(next, 1, 1, { text: 'BBB' });
  assert.equal(again.cells![0][0].text, 'AAA');
  assert.equal(again.cells![0][1].text, '');
  assert.equal(again.cells![1][0].text, '');
  assert.equal(again.cells![1][1].text, 'BBB');
});

test('whole-table element is not a standalone quick-edit type', () => {
  assert.equal(isQuickEditableType('table'), false);
});

// The canvas rebuilds the {row,col} object every render pass, so the transformer's memo
// must compare by value. Reference equality here would freeze the highlight in place.
test('cell selection compares by value, not reference', () => {
  assert.equal(sameTableCellSelection({ row: 1, col: 2 }, { row: 1, col: 2 }), true);
  assert.equal(sameTableCellSelection({ row: 1, col: 2 }, { row: 1, col: 3 }), false);
  assert.equal(sameTableCellSelection({ row: 1, col: 2 }, { row: 0, col: 2 }), false);
  assert.equal(sameTableCellSelection(null, { row: 0, col: 0 }), false);
  assert.equal(sameTableCellSelection({ row: 0, col: 0 }, null), false);
  assert.equal(sameTableCellSelection(null, null), true);
});

test('long cell text stays one line by tightening letter spacing', () => {
  const long = 'HTTPS://SEZ.EXAMPLE/VERY/LONG/CODE/8859126000508';
  const available = 12;
  const fitted = singleLineSqueezeSpacingMm(`${long}\nextra`, 10, available, false);
  assert.equal(fitted.text.includes('\n'), false);
  assert.ok(fitted.charSpacingMm < 0);
  const width = measureTextWidthMm(fitted.text, 10, fitted.charSpacingMm, false);
  assert.ok(width <= available + 0.05, `width ${width} exceeded ${available}`);
  const short = singleLineSqueezeSpacingMm('Hi', 10, available, false);
  assert.equal(short.charSpacingMm, 0);
  assert.equal(short.text, 'Hi');
});

test('a scanned code lands in a cell as manual text, never as a graphic', () => {
  const table = createTableState(2, 2);
  const scanned = 'https://sez.example/abc';
  const next = patchTableCellInElement(table, 0, 1, {
    text: scanned,
    contentType: 'Manual',
  });
  assert.equal(next.cells![0][1].text, scanned);
  assert.equal(next.cells![0][1].contentType, 'Manual');
  // Writing a second code targets only the newly selected cell.
  const after = patchTableCellInElement(next, 1, 0, {
    text: '8859126000508',
    contentType: 'Manual',
  });
  assert.equal(after.cells![0][1].text, scanned);
  assert.equal(after.cells![1][0].text, '8859126000508');
});
