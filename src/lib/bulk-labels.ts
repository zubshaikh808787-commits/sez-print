import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type QrErrorLevel,
} from '@/components/editor/types';
import {
  createLabelDocument,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import { fitBarcodeDefaults, fitQrcodeDefaults, fitTextDefaults } from '@/lib/element-sizing';
import type { ExcelSheet } from '@/stores/data-store';

export type BulkSlotKind = 'text' | 'barcode' | 'qrcode';

export type BulkColumnMapping = {
  columnIndex: number;
  include: boolean;
  kind: BulkSlotKind;
};

export type BulkSlot = {
  id: string;
  columnIndex: number;
  columnName: string;
  kind: BulkSlotKind;
};

export type BulkGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BulkLabelSet = {
  excelFileId: string;
  sheetIndex: number;
  rowCount: number;
  slots: BulkSlot[];
  /** Shared style + type per slot. Geometry on these is the all-labels default. */
  slotTemplates: Record<string, LabelElement>;
  sharedGeometry: Record<string, BulkGeometry>;
  /** Sparse: rowIndex → slotId → geometry */
  rowGeometryOverrides: Record<string, Record<string, BulkGeometry>>;
  /** Sparse: rowIndex → slotId → edited cell string */
  rowContentOverrides: Record<string, Record<string, string>>;
  activeRowIndex: number;
  barcodeEncodeMode: string;
  qrErrorLevel: QrErrorLevel;
};

export function bulkSlotId(columnIndex: number): string {
  return `col:${columnIndex}`;
}

export function isBulkSlotId(id: string): boolean {
  return id.startsWith('col:');
}

export function resolveBulkSheet(
  files: { id: string; sheets: ExcelSheet[] }[],
  bulk: BulkLabelSet,
): ExcelSheet | null {
  const file = files.find((f) => f.id === bulk.excelFileId);
  if (!file) return null;
  return file.sheets[bulk.sheetIndex] ?? file.sheets[0] ?? null;
}

export function cellValue(sheet: ExcelSheet, rowIndex: number, columnIndex: number): string {
  return String(sheet.rows[rowIndex]?.[columnIndex] ?? '');
}

export function isEmptyCell(value: string): boolean {
  return value.trim() === '';
}

/**
 * Payload to pass to barcode/QR encoders. Empty cells return null so callers
 * never feed `barcodeModulesForMode` (`''` → placeholder `0123456789`) or
 * `generateQrMatrix` (`''` → invalid matrix).
 */
export function slotEncodePayload(kind: BulkSlotKind, value: string): string | null {
  if (kind === 'text') return value;
  if (isEmptyCell(value)) return null;
  return value;
}

export function geometryOfElement(el: Pick<LabelElement, 'left' | 'top' | 'width'> & { height?: number }): BulkGeometry {
  return {
    left: el.left,
    top: el.top,
    width: el.width,
    height: typeof el.height === 'number' ? el.height : 0,
  };
}

export function resolvedSlotGeometry(bulk: BulkLabelSet, rowIndex: number, slotId: string): BulkGeometry {
  const override = bulk.rowGeometryOverrides[String(rowIndex)]?.[slotId];
  if (override) return override;
  return bulk.sharedGeometry[slotId];
}

export function resolvedSlotContent(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  rowIndex: number,
  slot: BulkSlot,
): string {
  const override = bulk.rowContentOverrides[String(rowIndex)]?.[slot.id];
  if (override !== undefined) return override;
  return cellValue(sheet, rowIndex, slot.columnIndex);
}

function applyGeometry<T extends LabelElement>(el: T, geo: BulkGeometry): T {
  const next = { ...el, left: geo.left, top: geo.top, width: geo.width } as T;
  if (el.type !== 'text' || typeof geo.height === 'number') {
    (next as { height: number }).height = geo.height;
  }
  return next;
}

function applyRowContent(el: LabelElement, kind: BulkSlotKind, value: string): LabelElement {
  if (kind === 'text' && el.type === 'text') {
    return { ...el, text: value, contentType: 'Manual', columnNameContent: '' };
  }
  if (kind === 'barcode' && el.type === 'barcode') {
    const empty = isEmptyCell(value);
    return {
      ...el,
      content: value,
      contentType: 'Manual',
      columnNameContent: '',
      visible: empty ? false : true,
      needPrinting: !empty,
    };
  }
  if (kind === 'qrcode' && el.type === 'qrcode') {
    const empty = isEmptyCell(value);
    return {
      ...el,
      content: value,
      contentType: 'Manual',
      columnNameContent: '',
      visible: empty ? false : true,
      needPrinting: !empty,
    };
  }
  return el;
}

function layoutSlotTemplates(
  slots: BulkSlot[],
  widthMm: number,
  heightMm: number,
  barcodeEncodeMode: string,
  qrErrorLevel: QrErrorLevel,
): { templates: Record<string, LabelElement>; geometry: Record<string, BulkGeometry> } {
  const templates: Record<string, LabelElement> = {};
  const geometry: Record<string, BulkGeometry> = {};
  const placed: LabelElement[] = [];

  for (const slot of slots) {
    if (slot.kind === 'text') {
      const fit = fitTextDefaults(widthMm, heightMm, placed);
      const el: LabelElement = {
        ...DEFAULT_ELEMENT_STATE,
        id: slot.id,
        type: 'text',
        text: '',
        contentType: 'Manual',
        left: fit.left,
        top: fit.top,
        width: fit.width,
        fontSize: fit.fontSize,
      };
      templates[slot.id] = el;
      geometry[slot.id] = geometryOfElement(el);
      placed.push(el);
      continue;
    }
    if (slot.kind === 'barcode') {
      const fit = fitBarcodeDefaults(widthMm, heightMm, placed);
      const el: LabelElement = {
        ...DEFAULT_BARCODE_STATE,
        id: slot.id,
        type: 'barcode',
        content: '',
        contentType: 'Manual',
        encodeMode: barcodeEncodeMode,
        left: fit.left,
        top: fit.top,
        width: fit.width,
        height: fit.height,
        fontSize: fit.fontSize,
        visible: false,
        needPrinting: false,
      };
      templates[slot.id] = el;
      geometry[slot.id] = geometryOfElement(el);
      placed.push(el);
      continue;
    }
    const fit = fitQrcodeDefaults(widthMm, heightMm, placed);
    const el: LabelElement = {
      ...DEFAULT_QRCODE_STATE,
      id: slot.id,
      type: 'qrcode',
      content: '',
      contentType: 'Manual',
      encodeMode: 'QRCode',
      errorLevel: qrErrorLevel,
      left: fit.left,
      top: fit.top,
      width: fit.width,
      height: fit.height,
      visible: false,
      needPrinting: false,
    };
    templates[slot.id] = el;
    geometry[slot.id] = geometryOfElement(el);
    placed.push(el);
  }

  return { templates, geometry };
}

export function mappingsToSlots(sheet: ExcelSheet, mappings: BulkColumnMapping[]): BulkSlot[] {
  return mappings
    .filter((m) => m.include)
    .map((m) => ({
      id: bulkSlotId(m.columnIndex),
      columnIndex: m.columnIndex,
      columnName: sheet.columns[m.columnIndex] ?? `Column ${m.columnIndex + 1}`,
      kind: m.kind,
    }));
}

export function projectBulkElements(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  rowIndex: number,
): LabelElement[] {
  return bulk.slots.map((slot) => {
    const template = bulk.slotTemplates[slot.id];
    const geo = resolvedSlotGeometry(bulk, rowIndex, slot.id);
    const value = resolvedSlotContent(bulk, sheet, rowIndex, slot);
    const withGeo = applyGeometry(template, geo);
    return applyRowContent(withGeo, slot.kind, value);
  });
}

export function projectBulkDocument(
  doc: LabelDocument,
  sheet: ExcelSheet,
  rowIndex: number,
): LabelDocument {
  if (!doc.bulk) return doc;
  const clamped = Math.max(0, Math.min(rowIndex, Math.max(0, doc.bulk.rowCount - 1)));
  return {
    ...doc,
    elements: projectBulkElements(doc.bulk, sheet, clamped),
    bulk: { ...doc.bulk, activeRowIndex: clamped },
  };
}

export function hydrateBulkDocument(
  doc: LabelDocument,
  files: { id: string; sheets: ExcelSheet[] }[],
): LabelDocument {
  if (!doc.bulk) return doc;
  const sheet = resolveBulkSheet(files, doc.bulk);
  if (!sheet) return doc;
  return projectBulkDocument(doc, sheet, doc.bulk.activeRowIndex);
}

export function createBulkLabelDocument(params: {
  name: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  excelFileId: string;
  sheetIndex: number;
  sheet: ExcelSheet;
  mappings: BulkColumnMapping[];
  barcodeEncodeMode?: string;
  qrErrorLevel?: QrErrorLevel;
}): LabelDocument | null {
  const slots = mappingsToSlots(params.sheet, params.mappings);
  if (slots.length === 0) return null;
  const barcodeEncodeMode = params.barcodeEncodeMode ?? 'CODE-128';
  const qrErrorLevel = params.qrErrorLevel ?? 'L';
  const laid = layoutSlotTemplates(
    slots,
    params.widthMm,
    params.heightMm,
    barcodeEncodeMode,
    qrErrorLevel,
  );
  const bulk: BulkLabelSet = {
    excelFileId: params.excelFileId,
    sheetIndex: params.sheetIndex,
    rowCount: params.sheet.rows.length,
    slots,
    slotTemplates: laid.templates,
    sharedGeometry: laid.geometry,
    rowGeometryOverrides: {},
    rowContentOverrides: {},
    activeRowIndex: 0,
    barcodeEncodeMode,
    qrErrorLevel,
  };
  const doc = createLabelDocument({
    name: params.name,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation,
    paperType: params.paperType,
    elements: projectBulkElements(bulk, params.sheet, 0),
  });
  doc.bulk = bulk;
  return doc;
}

export function applyGeometryToAllLabels(
  bulk: BulkLabelSet,
  geometryBySlot: Record<string, BulkGeometry>,
): BulkLabelSet {
  const sharedGeometry = { ...bulk.sharedGeometry, ...geometryBySlot };
  const slotTemplates = { ...bulk.slotTemplates };
  for (const [slotId, geo] of Object.entries(geometryBySlot)) {
    const template = slotTemplates[slotId];
    if (template) slotTemplates[slotId] = applyGeometry(template, geo);
  }
  const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
  for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
    const nextRow: Record<string, BulkGeometry> = {};
    for (const [slotId, geo] of Object.entries(rowMap)) {
      if (!(slotId in geometryBySlot)) nextRow[slotId] = geo;
    }
    if (Object.keys(nextRow).length > 0) rowGeometryOverrides[rowKey] = nextRow;
  }
  return { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides };
}

export function applyGeometryToThisLabel(
  bulk: BulkLabelSet,
  rowIndex: number,
  geometryBySlot: Record<string, BulkGeometry>,
): BulkLabelSet {
  const key = String(rowIndex);
  const row = { ...(bulk.rowGeometryOverrides[key] ?? {}), ...geometryBySlot };
  return {
    ...bulk,
    rowGeometryOverrides: { ...bulk.rowGeometryOverrides, [key]: row },
  };
}

export function geometryFromElements(elements: LabelElement[], slotIds: string[]): Record<string, BulkGeometry> {
  const out: Record<string, BulkGeometry> = {};
  for (const el of elements) {
    if (slotIds.includes(el.id)) out[el.id] = geometryOfElement(el);
  }
  return out;
}

export function slotGeometryChanged(
  before: LabelElement[],
  after: LabelElement[],
  slotIds: string[],
): boolean {
  const a = geometryFromElements(before, slotIds);
  const b = geometryFromElements(after, slotIds);
  for (const id of slotIds) {
    const prev = a[id];
    const next = b[id];
    if (!prev || !next) continue;
    if (
      prev.left !== next.left ||
      prev.top !== next.top ||
      prev.width !== next.width ||
      prev.height !== next.height
    ) {
      return true;
    }
  }
  return false;
}

/** Persist per-row content edits and copy non-geometry style onto shared templates. */
export function syncBulkFromProjectedElements(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  elements: LabelElement[],
): BulkLabelSet {
  const rowKey = String(bulk.activeRowIndex);
  let contentOverrides = bulk.rowContentOverrides;
  const slotTemplates = { ...bulk.slotTemplates };

  for (const slot of bulk.slots) {
    const el = elements.find((item) => item.id === slot.id);
    if (!el) continue;
    const sheetValue = cellValue(sheet, bulk.activeRowIndex, slot.columnIndex);
    const live =
      el.type === 'text' ? el.text : 'content' in el && typeof el.content === 'string' ? el.content : '';
    const existingOverride = bulk.rowContentOverrides[rowKey]?.[slot.id];
    if (live !== sheetValue) {
      if (existingOverride !== live) {
        contentOverrides = {
          ...contentOverrides,
          [rowKey]: { ...(contentOverrides[rowKey] ?? {}), [slot.id]: live },
        };
      }
    } else if (existingOverride !== undefined) {
      const nextRow = { ...(contentOverrides[rowKey] ?? {}) };
      delete nextRow[slot.id];
      contentOverrides = { ...contentOverrides, [rowKey]: nextRow };
      if (Object.keys(nextRow).length === 0) {
        const { [rowKey]: _, ...rest } = contentOverrides;
        contentOverrides = rest;
      }
    }

    const template = slotTemplates[slot.id];
    if (template) {
      const geo = bulk.sharedGeometry[slot.id];
      const styled = applyGeometry({ ...el, id: slot.id } as LabelElement, geo);
      slotTemplates[slot.id] = applyRowContent(styled, slot.kind, '');
    }
  }

  return { ...bulk, rowContentOverrides: contentOverrides, slotTemplates };
}
