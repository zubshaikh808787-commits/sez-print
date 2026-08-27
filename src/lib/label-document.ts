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
export type PaperType = 'Receipt' | 'Label' | 'Cardstock' | 'Transparent';

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
  if (value === 'Receipt' || value === 'Label' || value === 'Transparent') return value;
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
}): LabelDocument {
  const now = Date.now();
  return {
    id: generateId('label'),
    name: params.name,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation ?? 0,
    paperType: params.paperType ?? 'Cardstock',
    elements: params.elements ?? [],
    background: { type: 'none' },
    groupId: params.groupId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDocument(doc: LabelDocument): LabelDocument {
  return JSON.parse(JSON.stringify(doc)) as LabelDocument;
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
