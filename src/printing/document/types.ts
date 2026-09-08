export type PrintOrientation = 0 | 90 | 180 | 270;

export type MediaShapeKind =
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'ellipse'
  | 'diecut'
  | 'custom';

export type MediaType = 'continuous' | 'gap' | 'blackmark' | 'diecut' | 'custom';

export type ImageFitMode = 'fit' | 'fill' | 'stretch' | 'original';

export type Margins = {
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
};

export type PrintableArea = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

/** Physical stock. Independent of artwork and of printer DPI. */
export type MediaProfile = {
  id: string;
  name: string;
  type: MediaType;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  blackMarkMm?: number;
  shape: MediaShapeKind;
  category?: string;
  shapePath?: string;
  printableArea?: PrintableArea;
  safeAreaInset?: Margins;
  cornerRadiusMm?: number;
  columns?: number;
};

export type PrintElementType =
  | 'text'
  | 'image'
  | 'barcode'
  | 'qrcode'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'path'
  | 'pdf'
  | 'group';

export type GrayBitmap = {
  width: number;
  height: number;
  gray: Uint8Array;
};

export type ImageElementData = {
  gray: GrayBitmap;
  fit: ImageFitMode;
  dither?: boolean;
};

export type BarcodeElementData = {
  payload: string;
  symbology?: 'code128' | 'code39';
};

export type ShapeElementData = {
  fill?: boolean;
  strokeMm?: number;
};

export type TextElementData = {
  text: string;
  fontSizeMm: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** White-on-black inversion. */
  inverted?: boolean;
};

export type QrCodeElementData = {
  payload: string;
};

export type PrintElement = {
  id: string;
  type: PrintElementType;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  opacity?: number;
  visible: boolean;
  data: unknown;
};

/** Resolution-independent artwork. Never stores printer dots or screen pixels. */
export type PrintDocument = {
  id: string;
  widthMm: number;
  heightMm: number;
  orientation: PrintOrientation;
  shape: MediaShapeKind;
  margins: Margins;
  elements: PrintElement[];
  metadata?: Record<string, unknown>;
  safeAreaInset?: Margins;
  cornerRadiusMm?: number;
};

export const ZERO_MARGINS: Margins = { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 };

export function createPrintDocument(params: {
  id?: string;
  widthMm: number;
  heightMm: number;
  orientation?: PrintOrientation;
  shape?: MediaShapeKind;
  margins?: Margins;
  elements?: PrintElement[];
  metadata?: Record<string, unknown>;
  safeAreaInset?: Margins;
  cornerRadiusMm?: number;
}): PrintDocument {
  return {
    id: params.id ?? `doc_${Date.now().toString(36)}`,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation ?? 0,
    shape: params.shape ?? 'rectangle',
    margins: params.margins ?? ZERO_MARGINS,
    elements: params.elements ?? [],
    metadata: params.metadata,
    safeAreaInset: params.safeAreaInset,
    cornerRadiusMm: params.cornerRadiusMm,
  };
}
