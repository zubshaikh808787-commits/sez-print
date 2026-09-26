import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { excelCellToString, worksheetToStringGrid } from '@/lib/excel-cells';

test('12+ digit Excel numbers keep every digit instead of scientific notation', () => {
  const upc = 123456789012;
  const ean13 = 1234567890123;
  const ws = XLSX.utils.aoa_to_sheet([['Barcode'], [upc], [ean13]]);
  // Mimic a workbook Excel saved with General format (what raw:false used to return).
  (ws.A2 as XLSX.CellObject).w = '1.23457E+11';
  (ws.A3 as XLSX.CellObject).w = '1.23457E+12';

  assert.equal(excelCellToString(ws.A2 as XLSX.CellObject), '123456789012');
  assert.equal(excelCellToString(ws.A3 as XLSX.CellObject), '1234567890123');

  const grid = worksheetToStringGrid(ws);
  assert.equal(grid[1][0], '123456789012');
  assert.equal(grid[2][0], '1234567890123');

  const modules = barcodeModulesForMode('CODE-128', grid[1][0]);
  assert.ok(modules && modules.length > 0);
  assert.equal(/e[+-]?\d+/i.test(grid[1][0]), false);
  assert.match(grid[1][0], /^\d{12}$/);
  assert.match(grid[2][0], /^\d{13}$/);
});

test('numeric cells below the scientific-format threshold stay decimal text', () => {
  const ws = XLSX.utils.aoa_to_sheet([['SKU'], [89012]]);
  (ws.A2 as XLSX.CellObject).w = '89012';
  assert.equal(excelCellToString(ws.A2 as XLSX.CellObject), '89012');
});

test('true text cells are left unchanged', () => {
  const cell: XLSX.CellObject = { t: 's', v: 'SKU-100' };
  assert.equal(excelCellToString(cell), 'SKU-100');
});

test('date-formatted numbers keep the display string, not the serial', () => {
  const cell: XLSX.CellObject = { t: 'n', v: 44927, w: '1/1/2023' };
  assert.equal(excelCellToString(cell), '1/1/2023');
});
