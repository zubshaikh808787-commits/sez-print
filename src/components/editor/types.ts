export type PropertyTab = 'Regular' | 'Position' | 'Content' | 'Paragraph' | 'Font';
export type BarcodePropertyTab = 'Regular' | 'Position' | 'Content' | 'Encoding' | 'Font';
export type QrcodePropertyTab = 'Regular' | 'Position' | 'Content' | 'Encoding';

export type ContentType = 'Manual' | 'Degrees' | 'Data Source';
export type TextFlag = 'Hide' | 'Top' | 'Bottom';
export type QrEncodeMode = 'QRCode' | 'PDF417' | 'DataMatrix';
export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';
export type QrZoneSize = '0' | '2' | '4';
export type QrCodeShape = 'Auto' | 'Square' | 'Rectangle';
export type LineSpacing = '1.0' | '1.5' | '2.0' | 'Custom';
export type AutoWrapping = 'Close' | 'Char' | 'Word';
export type TextAlign = 'left' | 'center' | 'right' | 'justify' | 'spacing';
export type Rotation = 0 | 90 | 180 | 270;

export type EditorElementState = {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
  contentType: ContentType;
  columnNameContent: string;
  charSpacing: number;
  lineSpacing: LineSpacing;
  autoWrapping: AutoWrapping;
  verticalDisplay: boolean;
  autoTextHeight: boolean;
};

export const DRAWING_COLORS = ['#FFFFFF', '#000000', '#FFFFFF', '#E53935', '#43A047', '#48C3C7'] as const;

export const DEFAULT_ELEMENT_STATE: EditorElementState = {
  text: 'Text',
  fontSize: 12,
  fontFamily: 'Default',
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 59.27,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
  contentType: 'Manual',
  columnNameContent: '',
  charSpacing: 0,
  lineSpacing: '1.0',
  autoWrapping: 'Word',
  verticalDisplay: false,
  autoTextHeight: true,
};

export function formatMm(value: number) {
  return `${value.toFixed(2)} mm`;
}

export function formatPt(value: number) {
  return `${value.toFixed(1)} pt`;
}

export function formatInt(value: number) {
  return `${Math.round(value)}`;
}

export type BarcodeElementState = {
  contentType: ContentType;
  content: string;
  columnNameContent: string;
  encodeMode: string;
  textFlag: TextFlag;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_BARCODE_STATE: BarcodeElementState = {
  contentType: 'Manual',
  content: '',
  columnNameContent: '',
  encodeMode: 'CODE-128',
  textFlag: 'Bottom',
  fontFamily: 'Barcode',
  fontSize: 8.5,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'center',
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 30,
  height: 12,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
};

export type QrcodeElementState = {
  contentType: ContentType;
  content: string;
  encodeMode: QrEncodeMode;
  errorLevel: QrErrorLevel;
  zoneSize: QrZoneSize;
  codeShape: QrCodeShape;
  degreesOffset: number;
  columnNameContent: string;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_QRCODE_STATE: QrcodeElementState = {
  contentType: 'Manual',
  content: '',
  encodeMode: 'QRCode',
  errorLevel: 'L',
  zoneSize: '0',
  codeShape: 'Auto',
  degreesOffset: 1,
  columnNameContent: '',
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 12,
  height: 12,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
};

export type LinePropertyTab = 'Regular' | 'Position' | 'Style';
export type LineStyle = 'solid' | 'dashed' | 'slash' | 'backslash';

export type LineElementState = {
  lineStyle: LineStyle;
  virtualInterval: number;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_LINE_STATE: LineElementState = {
  lineStyle: 'solid',
  virtualInterval: 1,
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 33.6,
  height: 0.5,
  lockMovement: false,
  needPrinting: true,
  drawingColorIndex: 0,
};

export type ShapePropertyTab = 'Regular' | 'Position' | 'Style';
export type FigureShape = 'rectangle' | 'roundedRectangle' | 'oval' | 'circle';

export type ShapeElementState = {
  figureShape: FigureShape;
  fill: boolean;
  lineWidth: number;
  roundRadius: number;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_SHAPE_STATE: ShapeElementState = {
  figureShape: 'rectangle',
  fill: false,
  lineWidth: 0.75,
  roundRadius: 2.25,
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 33.6,
  height: 24,
  lockMovement: false,
  needPrinting: true,
  drawingColorIndex: 0,
};

export type TablePropertyTab = 'Regular' | 'Position' | 'Table';

export type TableElementState = {
  lineWidth: number;
  rowCount: number;
  columnCount: number;
  rowHeights: number[];
  columnWidths: number[];
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
};

export function divideTableRowHeights(height: number, rowCount: number) {
  const value = parseFloat((height / rowCount).toFixed(2));
  return Array.from({ length: rowCount }, () => value);
}

export function divideTableColumnWidths(width: number, columnCount: number) {
  const value = parseFloat((width / columnCount).toFixed(2));
  return Array.from({ length: columnCount }, () => value);
}

export function createTableState(rows: number, columns: number): TableElementState {
  const rowCount = Math.max(1, Math.min(10, rows));
  const columnCount = Math.max(1, Math.min(10, columns));
  const width = 80;
  const height = 26;
  const rowHeights =
    rowCount === 2 && columnCount === 3
      ? [11.88, 11.88]
      : divideTableRowHeights(height, rowCount);
  const columnWidths =
    rowCount === 2 && columnCount === 3
      ? [25.67, 25.67, 25.67]
      : divideTableColumnWidths(width, columnCount);

  return {
    lineWidth: 0.75,
    rowCount,
    columnCount,
    rowHeights,
    columnWidths,
    rotation: 0,
    left: 2,
    top: 2,
    width,
    height,
    lockMovement: false,
    needPrinting: true,
    drawingColorIndex: 0,
  };
}

export type TimePropertyTab = 'Regular' | 'Position' | 'Format' | 'Font';

export type TimeElementState = {
  offsetDay: number;
  offsetHour: number;
  offsetMinute: number;
  offsetSecond: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_TIME_STATE: TimeElementState = {
  offsetDay: 0,
  offsetHour: 0,
  offsetMinute: 0,
  offsetSecond: 0,
  fontFamily: 'Default',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'center',
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 59.27,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
};

export function formatOffset(value: number, unit: string) {
  return `${value} ${unit}`;
}

export function formatLiveDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatLiveTime(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function applyTimeOffsets(
  base: Date,
  offsets: Pick<TimeElementState, 'offsetDay' | 'offsetHour' | 'offsetMinute' | 'offsetSecond'>,
) {
  const next = new Date(base);
  next.setDate(next.getDate() + offsets.offsetDay);
  next.setHours(next.getHours() + offsets.offsetHour);
  next.setMinutes(next.getMinutes() + offsets.offsetMinute);
  next.setSeconds(next.getSeconds() + offsets.offsetSecond);
  return next;
}

export type ArcTextPropertyTab = 'Regular' | 'Position' | 'Content' | 'Style' | 'Font';

export type ArcTextElementState = {
  contentType: ContentType;
  degreesOffset: number;
  columnNameContent: string;
  lineWidth: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_ARCTEXT_STATE: ArcTextElementState = {
  contentType: 'Manual',
  degreesOffset: 1,
  columnNameContent: '',
  lineWidth: 0.5,
  fontFamily: 'Default',
  fontSize: 7.5,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 18,
  height: 18,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
};

export type DegreesElementState = {
  contentType: ContentType;
  degreesOffset: number;
  content: string;
  columnNameContent: string;
  charSpacing: number;
  lineSpacing: LineSpacing;
  autoWrapping: AutoWrapping;
  verticalDisplay: boolean;
  autoTextHeight: boolean;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
};

export const DEFAULT_DEGREES_STATE: DegreesElementState = {
  contentType: 'Degrees',
  degreesOffset: 1,
  content: '015',
  columnNameContent: '',
  charSpacing: 0,
  lineSpacing: '1.0',
  autoWrapping: 'Word',
  verticalDisplay: false,
  autoTextHeight: true,
  fontFamily: 'Default',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  rotation: 0,
  left: 0.5,
  top: 0.5,
  width: 59.27,
  lockMovement: false,
  needPrinting: true,
  antiColor: false,
  drawingColorIndex: 0,
};
