import { resizeBulkDocumentToSize } from '@/lib/bulk-labels';
import { repositionDocumentToSize, scaleDocumentToSize } from '@/lib/element-sizing';
import type { LabelDocument } from '@/lib/label-document';
import type { ExcelSheet } from '@/stores/data-store';

export type StockSizeHandling = 'scale' | 'keep';

export function stockSizePromptCopy(isBulk: boolean): { title: string; message: string } {
  if (isBulk) {
    return {
      title: 'Change size for all labels?',
      message:
        'This Excel set shares one size. Scale proportionally or keep as-is applies to every label.',
    };
  }
  return {
    title: 'Change label size',
    message:
      'Scale proportionally resizes elements. Keep as-is only moves their positions on the new stock.',
  };
}

/** Apply a stock-size change. Bulk sets always resize every row with the same mode. */
export function applyDocumentStockSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
  mode: StockSizeHandling,
  excelFiles: { id: string; sheets: ExcelSheet[] }[] = [],
): LabelDocument {
  if (
    Math.abs(doc.widthMm - widthMm) < 0.001 &&
    Math.abs(doc.heightMm - heightMm) < 0.001
  ) {
    return doc;
  }
  const resized = doc.bulk
    ? resizeBulkDocumentToSize(doc, widthMm, heightMm, mode, excelFiles)
    : mode === 'scale'
      ? scaleDocumentToSize(doc, widthMm, heightMm)
      : repositionDocumentToSize(doc, widthMm, heightMm);
  return { ...resized, updatedAt: Date.now() };
}
