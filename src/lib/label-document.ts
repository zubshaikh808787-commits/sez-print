import type {
  ArcTextElementState,
  BarcodeElementState,
  DegreesElementState,
  EditorElementState,
  LineElementState,
  QrcodeElementState,
  Rotation,
  ShapeElementState,
  TableElementState,
  TimeElementState,
} from '@/components/editor/types';
import type { SignatureStroke } from '@/components/editor/signature-drawing-board';
import type { BorderStyleId } from '@/constants/border-library';

export type TemplateBackground =
  | { type: 'none' }
  | { type: 'color'; color: string }
  | { type: 'image'; uri: string };

export type LabelOrientation = 0 | 90 | 180 | 270;
export type PaperType = 'Receipt' | 'Label' | 'Cardstock' | 'Transparent' | 'Black mark';

export type ImageElementState = {
  uri: string;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
};

export type ClipartElementState = {
  clipartId: string;
  symbol?: string;
  glyph?: string;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export type BorderElementState = {
  borderStyle: BorderStyleId;
  lineWidth: number;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export type SignatureElementState = {
  strokes: SignatureStroke[];
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export type ElementType =
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'line'
  | 'shape'
  | 'table'
  | 'time'
  | 'arctext'
  | 'degrees'
  | 'image'
  | 'clipart'
  | 'border'
  | 'signature';

type LayerMeta = {
  opacity?: number;
  zIndex?: number;
};

export type LabelElement = (
  | ({ id: string; type: 'text' } & EditorElementState)
  | ({ id: string; type: 'barcode' } & BarcodeElementState)
  | ({ id: string; type: 'qrcode' } & QrcodeElementState)
  | ({ id: string; type: 'line' } & LineElementState)
  | ({ id: string; type: 'shape' } & ShapeElementState)
  | ({ id: string; type: 'table' } & TableElementState)
  | ({ id: string; type: 'time' } & TimeElementState)
  | ({ id: string; type: 'arctext' } & ArcTextElementState)
  | ({ id: string; type: 'degrees' } & DegreesElementState)
  | ({ id: string; type: 'image' } & ImageElementState)
  | ({ id: string; type: 'clipart' } & ClipartElementState)
  | ({ id: string; type: 'border' } & BorderElementState)
  | ({ id: string; type: 'signature' } & SignatureElementState)
) & LayerMeta;

export type LabelElementOfType<T extends ElementType> = Extract<LabelElement, { type: T }>;

/** Multi-up (2ups / 3ups / 4ups): edit one panel at a time; print tiles them in a row. */
export type LabelUpsConfig = {
  columns: number;
  columnSpacingMm: number;
  batchEdit: boolean;
  /** Panel currently mirrored in `elements` (0-based). */
  activeIndex: number;
  /** Per-column element lists. Length === columns. */
  panels: LabelElement[][];
};

export type LabelDocument = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  orientation: LabelOrientation;
  paperType: PaperType;
  elements: LabelElement[];
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Bottom-most artboard fill. Absent / `none` means a transparent canvas. */
  background?: TemplateBackground;
  /** Industry template id used to create this label (for re-open consistency). */
  templatePreviewType?: string;
  templateCategory?: string;
  /** Present when this label is an N-up series edited panel-by-panel. */
  ups?: LabelUpsConfig;
};

let idCounter = 0;

export function generateId(prefix = 'el') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function parseOrientation(value: string | undefined): LabelOrientation {
  if (!value) return 0;
  const numeric = parseInt(value.replace('°', ''), 10);
  return numeric === 90 || numeric === 180 || numeric === 270 ? numeric : 0;
}

export function parsePaperType(value: string | undefined): PaperType {
  if (
    value === 'Receipt' ||
    value === 'Label' ||
    value === 'Transparent' ||
    value === 'Black mark'
  ) {
    return value;
  }
  return 'Cardstock';
}

export function createLabelDocument(params: {
  name: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  elements?: LabelElement[];
  groupId?: string | null;
  background?: TemplateBackground;
}): LabelDocument {
  const now = Date.now();
  const paperType = params.paperType ?? 'Cardstock';
  return {
    id: generateId('label'),
    name: params.name,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation ?? 0,
    paperType,
    elements: params.elements ?? [],
    background:
      params.background ??
      (paperType === 'Transparent' ? { type: 'none' } : { type: 'color', color: '#FFFFFF' }),
    groupId: params.groupId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDocument(doc: LabelDocument): LabelDocument {
  return JSON.parse(JSON.stringify(doc)) as LabelDocument;
}

/** Deep-copy elements with fresh ids (for seeding sibling ups panels). */
export function cloneElementsFreshIds(elements: LabelElement[]): LabelElement[] {
  return (JSON.parse(JSON.stringify(elements)) as LabelElement[]).map((el) => ({
    ...el,
    id: generateId(),
  }));
}

export function createUpsConfig(params: {
  columns: number;
  columnSpacingMm?: number;
  batchEdit?: boolean;
  seedElements?: LabelElement[];
}): LabelUpsConfig {
  const columns = Math.max(2, Math.min(4, Math.round(params.columns)));
  const seed = params.seedElements ?? [];
  const panels = Array.from({ length: columns }, (_, i) =>
    i === 0 ? cloneElementsFreshIds(seed) : params.batchEdit ? cloneElementsFreshIds(seed) : [],
  );
  return {
    columns,
    // Stick 2-up stock is usually kiss-cut (0 mm gutter). Negative allowed at print compose.
    columnSpacingMm: params.columnSpacingMm ?? 0,
    batchEdit: params.batchEdit ?? false,
    activeIndex: 0,
    panels,
  };
}

/** Persist the live `elements` buffer into `ups.panels[activeIndex]`. */
export function syncUpsActivePanel(doc: LabelDocument): LabelDocument {
  if (!doc.ups) return doc;
  const panels = doc.ups.panels.map((panel, i) =>
    i === doc.ups!.activeIndex
      ? (JSON.parse(JSON.stringify(doc.elements)) as LabelElement[])
      : panel,
  );
  return { ...doc, ups: { ...doc.ups, panels } };
}

/** Switch the active ups panel; keeps single-template editing stable. */
export function switchUpsPanel(doc: LabelDocument, nextIndex: number): LabelDocument {
  if (!doc.ups) return doc;
  const clamped = Math.max(0, Math.min(doc.ups.columns - 1, nextIndex));
  if (clamped === doc.ups.activeIndex) return doc;
  const synced = syncUpsActivePanel(doc);
  const panels = synced.ups!.panels;
  const elements = JSON.parse(JSON.stringify(panels[clamped] ?? [])) as LabelElement[];
  return {
    ...synced,
    elements,
    ups: { ...synced.ups!, activeIndex: clamped },
  };
}

/**
 * When batch edit is on, mirror the active panel onto every column
 * (fresh ids per panel so selections stay isolated).
 */
export function applyUpsBatchMirror(doc: LabelDocument): LabelDocument {
  if (!doc.ups?.batchEdit) return doc;
  const synced = syncUpsActivePanel(doc);
  const source = synced.ups!.panels[synced.ups!.activeIndex] ?? [];
  const panels = synced.ups!.panels.map((_, i) =>
    i === synced.ups!.activeIndex
      ? (JSON.parse(JSON.stringify(source)) as LabelElement[])
      : cloneElementsFreshIds(source),
  );
  return { ...synced, ups: { ...synced.ups!, panels } };
}

/** Flatten N-up panels into one print-ready document (horizontal tile). */
export function composeUpsDocument(doc: LabelDocument): LabelDocument {
  if (!doc.ups || doc.ups.columns < 2) return doc;
  const synced = syncUpsActivePanel(doc);
  const { columns, columnSpacingMm, panels } = synced.ups!;
  // Allow negative gutter (stick calibration); keep total width at least one cell.
  const gap = columnSpacingMm;
  const cellW = synced.widthMm;
  const cellH = synced.heightMm;
  const totalW = Math.max(
    cellW,
    Math.round((cellW * columns + gap * (columns - 1)) * 100) / 100,
  );
  const elements: LabelElement[] = [];

  for (let i = 0; i < columns; i += 1) {
    const ox = i * (cellW + gap);
    const panelDoc = { widthMm: cellW, heightMm: cellH };
    for (const raw of panels[i] ?? []) {
      // Clamp inside the single-panel bounds before tiling so print never spills.
      const el = clampPanelElement(raw, panelDoc);
      elements.push({
        ...JSON.parse(JSON.stringify(el)),
        id: generateId(),
        left: el.left + ox,
      } as LabelElement);
    }
  }

  return {
    ...synced,
    id: synced.id,
    name: synced.name,
    widthMm: Math.round(totalW * 100) / 100,
    heightMm: cellH,
    elements,
    background:
      synced.background?.type === 'color'
        ? synced.background
        : synced.paperType === 'Transparent'
          ? { type: 'none' }
          : { type: 'color', color: '#FFFFFF' },
    ups: undefined,
    updatedAt: Date.now(),
  };
}

/** Keep one panel's elements inside its exact mm box (used before compose). */
function clampPanelElement(
  element: LabelElement,
  doc: { widthMm: number; heightMm: number },
): LabelElement {
  if (element.type === 'border') {
    return {
      ...element,
      left: 0,
      top: 0,
      width: doc.widthMm,
      height: doc.heightMm,
      rotation: 0 as const,
    };
  }
  const maxW = doc.widthMm;
  const maxH = doc.heightMm;
  const minW = element.type === 'line' ? 0.1 : 0.5;
  const minH = element.type === 'line' ? 0.1 : 0.5;
  const width = Math.min(Math.max(minW, element.width), maxW);
  const height =
    'height' in element && typeof element.height === 'number'
      ? Math.min(Math.max(minH, element.height), maxH)
      : 0;
  const left = Math.min(Math.max(0, element.left), Math.max(0, maxW - width));
  const top = Math.min(Math.max(0, element.top), Math.max(0, maxH - (height || minH)));
  if (element.type === 'line') {
    return { ...element, left, top, width };
  }
  if ('height' in element) {
    return { ...element, left, top, width, height } as LabelElement;
  }
  return { ...element, left, top, width };
}

/** Bounding box of an element in mm. Prefer the JSON height when the template stored one. */
export function elementSizeMm(element: LabelElement): { width: number; height: number } {
  switch (element.type) {
    case 'text':
    case 'degrees': {
      if (typeof element.height === 'number' && element.height > 0) {
        return { width: element.width, height: element.height };
      }
      const lines = ('text' in element ? element.text : element.content).split('\n').length;
      return {
        width: element.width,
        height: Math.max(3, ptToMm(element.fontSize) * 1.25 * lines),
      };
    }
    case 'time':
      if (typeof element.height === 'number' && element.height > 0) {
        return { width: element.width, height: element.height };
      }
      return {
        width: element.width,
        height: Math.max(3, ptToMm(element.fontSize) * 1.25),
      };
    default:
      return { width: element.width, height: element.height };
  }
}

export function ptToMm(pt: number) {
  return (pt * 25.4) / 72;
}

export function mmToPt(mm: number) {
  return (mm * 72) / 25.4;
}
