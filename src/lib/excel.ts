import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

import type { ExcelSheet } from '@/stores/data-store';

function sheetToRows(worksheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.map((row) => row.map((cell) => String(cell ?? '')));
}

/** Parse an .xlsx/.xls/.csv file from a local URI into sheets with header columns. */
export async function parseExcelFile(uri: string, fileName: string): Promise<ExcelSheet[]> {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;
  if (isCsv) {
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    workbook = XLSX.read(content, { type: 'string' });
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    workbook = XLSX.read(base64, { type: 'base64' });
  }

  return workbook.SheetNames.map((name) => {
    const allRows = sheetToRows(workbook.Sheets[name]);
    const columns = (allRows[0] ?? []).map((c, i) => (c.trim() ? c.trim() : `Column ${i + 1}`));
    return {
      name,
      columns,
      rows: allRows.slice(1).filter((row) => row.some((cell) => cell.trim() !== '')),
    };
  }).filter((sheet) => sheet.columns.length > 0);
}
