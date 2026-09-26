import * as DocumentPicker from 'expo-document-picker';

import { parseExcelFile } from '@/lib/excel';
import type { ExcelSheet } from '@/stores/data-store';

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'text/comma-separated-values',
  'public.spreadsheet',
  'public.composite-content',
];

const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsm', 'csv']);

export type PickedExcelWorkbook =
  | { ok: false; reason: 'cancelled' | 'invalid' | 'empty' }
  | { ok: true; name: string; uri: string; sheets: ExcelSheet[] };

/** Open the system file picker and parse one Excel or CSV workbook. */
export async function pickExcelWorkbook(): Promise<PickedExcelWorkbook> {
  const result = await DocumentPicker.getDocumentAsync({
    type: EXCEL_MIME_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return { ok: false, reason: 'cancelled' };
  }

  const file = result.assets[0];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXCEL_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'invalid' };
  }

  const sheets = await parseExcelFile(file.uri, file.name);
  if (sheets.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  return { ok: true, name: file.name, uri: file.uri, sheets };
}
