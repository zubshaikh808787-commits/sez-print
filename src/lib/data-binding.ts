import { cloneDocument, type LabelDocument } from '@/lib/label-document';
import { applySerialOffset } from '@/lib/serial-content';
import type { ExcelSheet } from '@/stores/data-store';

function bindElementContent(
  element: LabelDocument['elements'][number],
  sheet: ExcelSheet,
  rowIndex: number,
) {
  const columnName = 'columnNameContent' in element ? element.columnNameContent : '';
  if (!columnName) return;
  const columnIndex = sheet.columns.indexOf(columnName);
  if (columnIndex < 0) return;
  const value = sheet.rows[rowIndex]?.[columnIndex] ?? '';
  if (element.type === 'text') {
    element.text = value;
  } else if ('content' in element) {
    element.content = value;
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
      if ('contentType' in element && element.contentType === 'Data Source') {
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
      'contentType' in el &&
      el.contentType === 'Data Source' &&
      'columnNameContent' in el &&
      el.columnNameContent,
  );
  const hasSerial = doc.elements.some(
    (el) => 'contentType' in el && el.contentType === 'Degrees' && 'degreesOffset' in el && el.degreesOffset > 0,
  );
  if (hasBinding) return sheet.rows.length;
  if (hasSerial) return Math.max(1, sheet.rows.length);
  return 1;
}
