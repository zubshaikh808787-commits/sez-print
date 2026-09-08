import { cloneDocument, type LabelDocument } from '@/lib/label-document';
import { applySerialOffset } from '@/lib/serial-content';
import type { ExcelSheet } from '@/stores/data-store';

function bindElementContent(
  element: LabelDocument['elements'][number],
  sheet: ExcelSheet,
  rowIndex: number,
) {
  const row = sheet.rows[rowIndex];
  if (!row) return;

  const columnName = 'columnNameContent' in element ? element.columnNameContent : '';
  if (columnName) {
    const columnIndex = sheet.columns.indexOf(columnName);
    if (columnIndex >= 0) {
      const value = row[columnIndex] ?? '';
      if (element.type === 'text') {
        element.text = value;
      } else if ('content' in element) {
        element.content = value;
      }
    }
  }

  // Replace {{columnName}} tokens with corresponding row values
  const replaceSheetTokens = (val: string) => {
    if (!val || !val.includes('{{')) return val;
    return val.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
      const idx = sheet.columns.indexOf(key);
      return idx >= 0 && row[idx] !== undefined ? row[idx] : match;
    });
  };

  if (element.type === 'text') {
    element.text = replaceSheetTokens(element.text);
  } else if ('content' in element && typeof element.content === 'string') {
    element.content = replaceSheetTokens(element.content);
  }
}

function applyDegreesSerial(
  element: LabelDocument['elements'][number],
  pageIndex: number,
) {
  if (!('contentType' in element) || element.contentType !== 'Degrees') return;
  const step = 'degreesOffset' in element ? element.degreesOffset : 0;
  if (step === 0) return;
  if (element.type === 'text') {
    element.text = applySerialOffset(element.text, step, pageIndex);
  } else if ('content' in element && typeof element.content === 'string') {
    element.content = applySerialOffset(element.content, step, pageIndex);
  }
}

/**
 * Resolve data-bound elements and serial/degrees offsets for one print/preview page.
 */
export function resolveDocumentForPage(
  doc: LabelDocument,
  sheet: ExcelSheet | null,
  pageIndex: number,
): LabelDocument {
  const resolved = cloneDocument(doc);
  if (sheet?.rows[pageIndex]) {
    for (const element of resolved.elements) {
      const isDataSource = 'contentType' in element && element.contentType === 'Data Source';
      const hasToken =
        (element.type === 'text' && element.text.includes('{{')) ||
        ('content' in element && typeof element.content === 'string' && element.content.includes('{{'));
      if (isDataSource || hasToken) {
        bindElementContent(element, sheet, pageIndex);
      }
    }
  }
  for (const element of resolved.elements) {
    applyDegreesSerial(element, pageIndex);
  }
  return resolved;
}

/** @deprecated Use resolveDocumentForPage */
export function resolveDocumentData(
  doc: LabelDocument,
  sheet: ExcelSheet | null,
  rowIndex: number,
): LabelDocument {
  return resolveDocumentForPage(doc, sheet, rowIndex);
}

/** Number of printable pages for a data-bound document (1 when unbound). */
export function dataPageCount(doc: LabelDocument, sheet: ExcelSheet | null): number {
  if (!sheet || sheet.rows.length === 0) return 1;
  const hasBinding = doc.elements.some(
    (el) =>
      ('contentType' in el &&
        el.contentType === 'Data Source' &&
        'columnNameContent' in el &&
        Boolean(el.columnNameContent)) ||
      (el.type === 'text' && el.text.includes('{{')) ||
      ('content' in el && typeof el.content === 'string' && el.content.includes('{{')),
  );
  const hasSerial = doc.elements.some(
    (el) => 'contentType' in el && el.contentType === 'Degrees' && 'degreesOffset' in el && el.degreesOffset > 0,
  );
  if (hasBinding) return sheet.rows.length;
  if (hasSerial) return Math.max(1, sheet.rows.length);
  return 1;
}
