import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type QrErrorLevel,
} from '@/components/editor/types';
import {
  createLabelDocument,
  generateId,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import {
  fitBarcodeDefaults,
  fitQrcodeDefaults,
  fitTextDefaults,
  repositionDocumentToSize,
  scaleDocumentToSize,
} from '@/lib/element-sizing';
import { useDataStore, type ExcelSheet } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import {
  generateSerialLabels,
  parseSequenceFromText,
  type BarcodeSymbology,
  type SequenceRuleConfig,
} from '@/lib/printer/SerialLabelEngine';

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
  /** Static non-slot elements (e.g., Header text, lines, clipart, logos, shapes) that appear on all bulk/serial labels */
  staticElements?: LabelElement[];
  /** Embedded sheet fallback in case data-store files are unavailable */
  embeddedSheet?: ExcelSheet;
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
  if (file && (file.sheets[bulk.sheetIndex] ?? file.sheets[0])) {
    return file.sheets[bulk.sheetIndex] ?? file.sheets[0];
  }
  if (bulk.embeddedSheet) {
    return bulk.embeddedSheet;
  }
  return null;
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
  const slotElements = projectBulkElements(doc.bulk, sheet, clamped);
  const slotIds = new Set(doc.bulk.slots.map((s) => s.id));
  const staticElements =
    doc.bulk.staticElements ?? doc.elements.filter((el) => !slotIds.has(el.id));
  return {
    ...doc,
    elements: [...staticElements, ...slotElements],
    bulk: { ...doc.bulk, activeRowIndex: clamped, staticElements },
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

  const slotIds = new Set(bulk.slots.map((s) => s.id));
  const staticElements = elements.filter((el) => !slotIds.has(el.id));

  return { ...bulk, rowContentOverrides: contentOverrides, slotTemplates, staticElements };
}

export type BulkStockSizeMode = 'scale' | 'keep';

function mapGeometryRecord(
  record: Record<string, BulkGeometry>,
  mapGeo: (geo: BulkGeometry) => BulkGeometry,
): Record<string, BulkGeometry> {
  const next: Record<string, BulkGeometry> = {};
  for (const [id, geo] of Object.entries(record)) {
    next[id] = mapGeo(geo);
  }
  return next;
}

function scaleSlotElements(
  elements: LabelElement[],
  oldWidthMm: number,
  oldHeightMm: number,
  widthMm: number,
  heightMm: number,
): LabelElement[] {
  const dummy = createLabelDocument({
    name: 'bulk-resize',
    widthMm: oldWidthMm,
    heightMm: oldHeightMm,
    elements,
  });
  return scaleDocumentToSize(dummy, widthMm, heightMm).elements;
}

/**
 * One stock size for the whole Excel set. Updates shared geometry, templates,
 * and every row override, then reprojects the active row.
 */
export function resizeBulkDocumentToSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
  mode: BulkStockSizeMode,
  files: { id: string; sheets: ExcelSheet[] }[],
): LabelDocument {
  if (!doc.bulk) {
    return mode === 'scale'
      ? scaleDocumentToSize(doc, widthMm, heightMm)
      : repositionDocumentToSize(doc, widthMm, heightMm);
  }

  const bulk = doc.bulk;
  const oldW = doc.widthMm;
  const oldH = doc.heightMm;
  const sx = widthMm / Math.max(oldW, 0.01);
  const sy = heightMm / Math.max(oldH, 0.01);

  let nextBulk: BulkLabelSet;

  if (mode === 'keep') {
    const mapGeo = (geo: BulkGeometry): BulkGeometry => ({
      left: geo.left * sx,
      top: geo.top * sy,
      width: geo.width,
      height: geo.height,
    });
    const sharedGeometry = mapGeometryRecord(bulk.sharedGeometry, mapGeo);
    const slotTemplates = { ...bulk.slotTemplates };
    for (const slot of bulk.slots) {
      const template = slotTemplates[slot.id];
      const geo = sharedGeometry[slot.id];
      if (template && geo) slotTemplates[slot.id] = applyGeometry(template, geo);
    }
    const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
    for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
      rowGeometryOverrides[rowKey] = mapGeometryRecord(rowMap, mapGeo);
    }
    const staticElements = (bulk.staticElements ?? []).map((el) => ({
      ...el,
      left: el.left * sx,
      top: el.top * sy,
    }));
    nextBulk = { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides, staticElements };
  } else {
    const sharedEls = bulk.slots
      .map((slot) => {
        const template = bulk.slotTemplates[slot.id];
        const geo = bulk.sharedGeometry[slot.id];
        if (!template || !geo) return null;
        return applyGeometry(template, geo);
      })
      .filter((el): el is LabelElement => el != null);
    const scaledShared = scaleSlotElements(sharedEls, oldW, oldH, widthMm, heightMm);
    const slotTemplates: Record<string, LabelElement> = { ...bulk.slotTemplates };
    const sharedGeometry: Record<string, BulkGeometry> = { ...bulk.sharedGeometry };
    for (const el of scaledShared) {
      slotTemplates[el.id] = el;
      sharedGeometry[el.id] = geometryOfElement(el);
    }

    const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
    for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
      const nextRow: Record<string, BulkGeometry> = {};
      for (const [slotId, geo] of Object.entries(rowMap)) {
        const template = bulk.slotTemplates[slotId];
        if (!template) continue;
        const scaled = scaleSlotElements([applyGeometry(template, geo)], oldW, oldH, widthMm, heightMm);
        const el = scaled[0];
        if (el) nextRow[slotId] = geometryOfElement(el);
      }
      if (Object.keys(nextRow).length > 0) rowGeometryOverrides[rowKey] = nextRow;
    }

    const staticElements = bulk.staticElements
      ? scaleSlotElements(bulk.staticElements, oldW, oldH, widthMm, heightMm)
      : undefined;

    nextBulk = { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides, staticElements };
  }

  return hydrateBulkDocument({ ...doc, widthMm, heightMm, bulk: nextBulk }, files);
}

export type CreateSerialLabelParams = {
  name?: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  headerText?: string;
  samplePattern: string;
  startNumber: number;
  endNumber: number;
  step?: number;
  zeroPadding?: number;
  includeBarcode?: boolean;
  barcodeSymbology?: 'CODE128' | 'CODE39' | 'EAN13' | 'UPCA' | 'QRCODE' | 'NONE';
  barcodePrefix?: string;
  barcodeSuffix?: string;
  barcodeMirrorsText?: boolean;
  barcodePadding?: number;
  qrErrorLevel?: QrErrorLevel;
};

/**
 * Creates a fully-formed serial label document with a backing virtual data sheet,
 * customizable header, barcode/QR slots, and exact physical dimensions.
 * The document can be opened directly in the Canvas Editor (/edit) and printed (/print).
 */
export function createSerialLabelDocument(params: CreateSerialLabelParams): LabelDocument {
  const {
    name,
    widthMm,
    heightMm,
    orientation = 0,
    paperType = 'Label',
    headerText,
    samplePattern,
    startNumber,
    endNumber,
    step = 1,
    zeroPadding,
    includeBarcode = true,
    barcodeSymbology = 'CODE128',
    barcodePrefix = '',
    barcodeSuffix = '',
    barcodeMirrorsText = true,
    barcodePadding,
    qrErrorLevel = 'M',
  } = params;

  // 1. Sequence Parsing & Generation
  const parsed = parseSequenceFromText(samplePattern) ?? {
    prefix: samplePattern.replace(/\d+$/, ''),
    number: startNumber,
    suffix: '',
    digitWidth: String(startNumber).length,
  };

  const isQr = barcodeSymbology === 'QRCODE';
  const hasBarcode = includeBarcode && barcodeSymbology !== 'NONE';

  const engineSymbology: BarcodeSymbology =
    barcodeSymbology === 'CODE39'
      ? 'CODE39'
      : barcodeSymbology === 'EAN13'
      ? 'EAN13'
      : barcodeSymbology === 'UPCA'
      ? 'UPCA'
      : 'CODE128';

  const config: SequenceRuleConfig = {
    startNumber,
    endNumber,
    step: step || 1,
    textPadding: zeroPadding ?? parsed.digitWidth,
    barcodeMirrorsText,
    barcodePrefix,
    barcodeSuffix,
    barcodePadding,
    barcodeSymbology: engineSymbology,
  };

  const generated = generateSerialLabels(
    { fields: {}, textFieldKey: 'text', barcodeFieldKey: 'barcode' },
    parsed,
    config,
  );

  if (generated.length === 0) {
    throw new Error('No labels could be generated from the given range.');
  }

  // 2. Generate Backing Data Sheet
  const columns = hasBarcode ? ['Serial No', isQr ? 'QR Code' : 'Barcode'] : ['Serial No'];
  const rows = generated.map((item) => (hasBarcode ? [item.text, item.barcodeValue] : [item.text]));
  const sheet: ExcelSheet = {
    name: 'Serial Sequence',
    columns,
    rows,
  };

  // 3. Persist Virtual Excel File in data-store
  const excelFile = useDataStore.getState().addExcelFile({
    name: name ?? `Serial ${generated[0].text}…${generated[generated.length - 1].text}`,
    uri: `serial://${Date.now()}-${generated[0].text}`,
    sheets: [sheet],
    activeSheetIndex: 0,
  });

  // 4. Balanced Layout Coordinates
  const hasHeader = Boolean(headerText && headerText.trim().length > 0);
  const headerHeight = hasHeader ? Math.max(4, Math.min(8, heightMm * 0.2)) : 0;
  const headerTop = 2;
  const contentTop = hasHeader ? headerTop + headerHeight + 1.5 : 2;
  const availHeight = Math.max(8, heightMm - contentTop - 2);
  const availWidth = Math.max(10, widthMm - 4);

  const staticElements: LabelElement[] = [];

  if (hasHeader) {
    const headerEl: LabelElement = {
      ...DEFAULT_ELEMENT_STATE,
      id: generateId('hdr'),
      type: 'text',
      text: headerText!.trim(),
      contentType: 'Manual',
      left: 2,
      top: headerTop,
      width: availWidth,
      height: headerHeight,
      fontSize: Math.max(7, Math.min(13, Math.round(headerHeight * 1.6))),
      bold: true,
      align: 'center',
      autoWrapping: 'Word',
      needPrinting: true,
    };
    staticElements.push(headerEl);
  }

  const slotTemplates: Record<string, LabelElement> = {};
  const sharedGeometry: Record<string, BulkGeometry> = {};
  const slots: BulkSlot[] = [];

  if (hasBarcode) {
    if (isQr) {
      const qrSize = Math.min(availWidth * 0.45, availHeight * 0.9, 35);
      const isSideBySide = widthMm >= heightMm * 1.25;

      if (isSideBySide) {
        // Side-by-side: QR left, Serial Text right
        const qrEl: LabelElement = {
          ...DEFAULT_QRCODE_STATE,
          id: 'col:1',
          type: 'qrcode',
          content: generated[0].barcodeValue,
          contentType: 'Manual',
          encodeMode: 'QRCode',
          errorLevel: qrErrorLevel,
          left: 3,
          top: contentTop + (availHeight - qrSize) / 2,
          width: qrSize,
          height: qrSize,
          visible: true,
          needPrinting: true,
        };

        const textLeft = 3 + qrSize + 3;
        const textWidth = Math.max(10, widthMm - textLeft - 3);
        const textEl: LabelElement = {
          ...DEFAULT_ELEMENT_STATE,
          id: 'col:0',
          type: 'text',
          text: generated[0].text,
          contentType: 'Manual',
          left: textLeft,
          top: contentTop + (availHeight - 8) / 2,
          width: textWidth,
          height: 8,
          fontSize: Math.max(9, Math.min(18, Math.round(heightMm * 0.28))),
          bold: true,
          align: 'left',
          autoWrapping: 'Word',
          needPrinting: true,
        };

        slotTemplates['col:0'] = textEl;
        slotTemplates['col:1'] = qrEl;
        sharedGeometry['col:0'] = geometryOfElement(textEl);
        sharedGeometry['col:1'] = geometryOfElement(qrEl);
      } else {
        // Stacked: QR top, Serial Text bottom
        const qrEl: LabelElement = {
          ...DEFAULT_QRCODE_STATE,
          id: 'col:1',
          type: 'qrcode',
          content: generated[0].barcodeValue,
          contentType: 'Manual',
          encodeMode: 'QRCode',
          errorLevel: qrErrorLevel,
          left: (widthMm - qrSize) / 2,
          top: contentTop,
          width: qrSize,
          height: qrSize,
          visible: true,
          needPrinting: true,
        };

        const textTop = contentTop + qrSize + 1;
        const textHeight = Math.max(4, heightMm - textTop - 1.5);
        const textEl: LabelElement = {
          ...DEFAULT_ELEMENT_STATE,
          id: 'col:0',
          type: 'text',
          text: generated[0].text,
          contentType: 'Manual',
          left: 2,
          top: textTop,
          width: availWidth,
          height: textHeight,
          fontSize: Math.max(8, Math.min(14, Math.round(textHeight * 1.5))),
          bold: true,
          align: 'center',
          autoWrapping: 'Word',
          needPrinting: true,
        };

        slotTemplates['col:0'] = textEl;
        slotTemplates['col:1'] = qrEl;
        sharedGeometry['col:0'] = geometryOfElement(textEl);
        sharedGeometry['col:1'] = geometryOfElement(qrEl);
      }

      slots.push({
        id: 'col:0',
        columnIndex: 0,
        columnName: 'Serial No',
        kind: 'text',
      });
      slots.push({
        id: 'col:1',
        columnIndex: 1,
        columnName: 'QR Code',
        kind: 'qrcode',
      });
    } else {
      // 1D Barcode
      const bcEncodeMode =
        barcodeSymbology === 'CODE39'
          ? 'CODE-39'
          : barcodeSymbology === 'EAN13'
          ? 'EAN-13'
          : barcodeSymbology === 'UPCA'
          ? 'UPC-A'
          : 'CODE-128';

      const bcHeight = Math.max(6, Math.min(availHeight * 0.58, 25));
      const bcWidth = Math.max(15, availWidth * 0.92);
      const bcLeft = (widthMm - bcWidth) / 2;
      const bcTop = contentTop;

      const barcodeEl: LabelElement = {
        ...DEFAULT_BARCODE_STATE,
        id: 'col:1',
        type: 'barcode',
        content: generated[0].barcodeValue,
        contentType: 'Manual',
        encodeMode: bcEncodeMode,
        textFlag: 'Hide',
        left: bcLeft,
        top: bcTop,
        width: bcWidth,
        height: bcHeight,
        visible: true,
        needPrinting: true,
      };

      const textTop = bcTop + bcHeight + 1.2;
      const textHeight = Math.max(4, heightMm - textTop - 1.5);
      const textEl: LabelElement = {
        ...DEFAULT_ELEMENT_STATE,
        id: 'col:0',
        type: 'text',
        text: generated[0].text,
        contentType: 'Manual',
        left: 2,
        top: textTop,
        width: availWidth,
        height: textHeight,
        fontSize: Math.max(8, Math.min(18, Math.round(textHeight * 1.6))),
        bold: true,
        align: 'center',
        autoWrapping: 'Word',
        needPrinting: true,
      };

      slotTemplates['col:0'] = textEl;
      slotTemplates['col:1'] = barcodeEl;
      sharedGeometry['col:0'] = geometryOfElement(textEl);
      sharedGeometry['col:1'] = geometryOfElement(barcodeEl);

      slots.push({
        id: 'col:0',
        columnIndex: 0,
        columnName: 'Serial No',
        kind: 'text',
      });
      slots.push({
        id: 'col:1',
        columnIndex: 1,
        columnName: 'Barcode',
        kind: 'barcode',
      });
    }
  } else {
    // Text only
    const textHeight = Math.min(16, availHeight * 0.65);
    const textTop = contentTop + (availHeight - textHeight) / 2;
    const textEl: LabelElement = {
      ...DEFAULT_ELEMENT_STATE,
      id: 'col:0',
      type: 'text',
      text: generated[0].text,
      contentType: 'Manual',
      left: 2,
      top: textTop,
      width: availWidth,
      height: textHeight,
      fontSize: Math.max(12, Math.min(28, Math.round(textHeight * 1.6))),
      bold: true,
      align: 'center',
      autoWrapping: 'Word',
      needPrinting: true,
    };

    slotTemplates['col:0'] = textEl;
    sharedGeometry['col:0'] = geometryOfElement(textEl);

    slots.push({
      id: 'col:0',
      columnIndex: 0,
      columnName: 'Serial No',
      kind: 'text',
    });
  }

  const bulk: BulkLabelSet = {
    excelFileId: excelFile.id,
    sheetIndex: 0,
    rowCount: generated.length,
    slots,
    slotTemplates,
    sharedGeometry,
    rowGeometryOverrides: {},
    rowContentOverrides: {},
    activeRowIndex: 0,
    barcodeEncodeMode: barcodeSymbology === 'CODE39' ? 'CODE-39' : 'CODE-128',
    qrErrorLevel,
    staticElements,
    embeddedSheet: sheet,
  };

  const initialElements = [...staticElements, ...projectBulkElements(bulk, sheet, 0)];

  const doc = createLabelDocument({
    name: name ?? `Serial: ${generated[0].text}…${generated[generated.length - 1].text}`,
    widthMm,
    heightMm,
    orientation,
    paperType,
    elements: initialElements,
  });

  doc.bulk = bulk;
  useLabelStore.getState().upsertDocument(doc);
  return doc;
}
