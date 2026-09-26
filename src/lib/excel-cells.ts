import * as XLSX from 'xlsx';

const SCIENTIFIC = /e[+-]?\d+/i;

/**
 * Convert one SheetJS cell to a label-safe string.
 *
 * `sheet_to_json(..., { raw: false })` uses Excel's display format (`cell.w`).
 * General-format integers of 12+ digits become `"1.23457E+11"`, which is what
 * we must not feed to barcode/QR encoders. The numeric `cell.v` for those
 * values is still an exact IEEE integer when it is ≤ Number.MAX_SAFE_INTEGER.
 */
export function excelCellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.t === 'z' || cell.v == null) return '';
  if (cell.t === 's' || cell.t === 'str') return String(cell.v);
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  if (cell.t === 'd') {
    if (cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) return cell.v.toISOString();
    if (typeof cell.w === 'string' && cell.w) return cell.w;
    return String(cell.v ?? '');
  }
  if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    const formatted = typeof cell.w === 'string' ? cell.w.trim() : '';
    const scientific = formatted.length > 0 && SCIENTIFIC.test(formatted);
    const safeInt = Number.isInteger(cell.v) && Number.isSafeInteger(cell.v);
    if (safeInt && (scientific || !formatted)) {
      return String(cell.v);
    }
    if (formatted && !scientific) return formatted;
    if (safeInt) return String(cell.v);
    return formatted || String(cell.v);
  }
  if (typeof cell.w === 'string' && cell.w) return cell.w;
  return String(cell.v ?? '');
}

export function worksheetToStringGrid(worksheet: XLSX.WorkSheet): string[][] {
  const ref = worksheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(excelCellToString(worksheet[addr] as XLSX.CellObject | undefined));
    }
    rows.push(row);
  }
  return rows;
}
