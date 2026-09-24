import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';
import { computeArcTextLayout } from '@/lib/editor/arctext-layout';
import QRCode from 'react-native-qrcode-svg';

import { ClipartIcon } from '@/components/clipart-icon';
import { SignaturePreview } from '@/components/editor/signature-drawing-board';
import { BorderPreview } from '@/components/border-preview';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { useSettingsStore } from '@/stores/settings-store';
import { getClipartById } from '@/constants/clipart-library';
import {
  DRAWING_COLORS,
  applyTimeOffsets,
  formatLiveDateTime,
  type ArcTextElementState,
  type BarcodeElementState,
  type DegreesElementState,
  type EditorElementState,
  type LineElementState,
  type QrcodeElementState,
  type ShapeElementState,
  type TableElementState,
  type TimeElementState,
} from '@/components/editor/types';
import { FONT_LIBRARY } from '@/constants/font-library';
import { barcodeBarsForMode, barcodeModulesForMode } from '@/lib/barcode-code128';
import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { encodeDataMatrix } from '@/lib/barcode/datamatrix';
import { encodePdf417 } from '@/lib/barcode/pdf417';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { applySerialOffset, lineSpacingMultiplier } from '@/lib/serial-content';
import {
  charSpacingToLetterSpacing,
  computeWrappedLines,
  measureTextWidthMm,
} from '@/lib/text-metrics';
import { ensureTableCells } from '@/lib/editor/table-cells';
import { ptToMm, type LabelElement } from '@/lib/label-document';

/** Design-space black (gallery/editor). Print still flattens to 1-bit in the raster pipeline. */
export const DESIGN_INK = '#111111';

export function inkColor(drawingColorIndex: number) {
  const color = DRAWING_COLORS[drawingColorIndex] ?? DESIGN_INK;
  return drawingColorIndex === 0 || color === '#FFFFFF' ? DESIGN_INK : color;
}

function paletteColor(drawingColorIndex: number) {
  return DRAWING_COLORS[drawingColorIndex] ?? DESIGN_INK;
}

function shapeFillColor(element: ShapeElementState) {
  if (!element.fill) return 'transparent';
  if (element.fillColor) return element.fillColor;
  return paletteColor(element.drawingColorIndex);
}

export function resolveFontFamily(name: string): string | undefined {
  if (!name || name === 'Default' || name === 'Barcode') return undefined;
  const byName = FONT_LIBRARY.find((f) => f.name === name || f.id === name);
  return byName?.family ?? undefined;
}

function fontSizePx(fontSizePt: number, scale: number) {
  return Math.max(1, ptToMm(fontSizePt) * scale);
}

/** Human-readable barcode text. Encoding still uses the raw digit string. */
function formatBarcodeHri(mode: string, content: string): string {
  if (mode !== 'UPC-A') return content;
  const digits = content.replace(/\D/g, '');
  if (digits.length === 12) {
    return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
  }
  return content;
}

function useClock(enabled: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

type ContentProps = {
  element: LabelElement;
  widthPx: number;
  heightPx: number;
  scale: number;
  /** Print capture: decode at printer-dot size so import photos match template sharpness. */
  forPrint?: boolean;
  /** Host label media — circular borders draw as rings. */
  mediaShape?: string | null;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
};

function textStyleFor(
  state: Pick<
    EditorElementState,
    | 'fontSize'
    | 'fontFamily'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'align'
    | 'drawingColorIndex'
    | 'antiColor'
  > & { lineSpacing?: EditorElementState['lineSpacing'] },
  scale: number,
) {
  const size = fontSizePx(state.fontSize, scale);
  const lineMult = lineSpacingMultiplier(state.lineSpacing ?? '1.0');
  const decorations: string[] = [];
  if (state.underline) decorations.push('underline');
  if (state.strikethrough) decorations.push('line-through');
  return {
    fontSize: size,
    lineHeight: size * lineMult,
    includeFontPadding: false,
    fontFamily: resolveFontFamily(state.fontFamily),
    fontWeight: state.bold ? ('600' as const) : ('400' as const),
    fontStyle: state.italic ? ('italic' as const) : ('normal' as const),
    textDecorationLine: (decorations.join(' ') || 'none') as
      | 'none'
      | 'underline'
      | 'line-through'
      | 'underline line-through',
    textAlign: (state.align === 'spacing' ? 'justify' : state.align) as
      | 'left'
      | 'center'
      | 'right'
      | 'justify',
    color: state.antiColor ? '#FFFFFF' : inkColor(state.drawingColorIndex),
  };
}

type TextLayoutFields = Pick<
  EditorElementState,
  | 'contentType'
  | 'columnNameContent'
  | 'fontSize'
  | 'width'
  | 'charSpacing'
  | 'bold'
  | 'align'
  | 'autoWrapping'
  | 'verticalDisplay'
  | 'lineSpacing'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'fontFamily'
  | 'drawingColorIndex'
  | 'antiColor'
> & { degreesOffset?: number };

function resolveTextRaw(
  element: Pick<TextLayoutFields, 'contentType' | 'columnNameContent' | 'degreesOffset'>,
  textValue: string,
  showColumnName: boolean,
): string {
  if (element.contentType === 'Data Source' && element.columnNameContent) {
    return formatDataSourceColumn(element.columnNameContent, showColumnName);
  }
  if (element.contentType === 'Degrees') {
    return applySerialOffset(textValue, element.degreesOffset ?? 1, 1);
  }
  return textValue;
}

function dataColumnHighlightStyle(
  element: Pick<TextLayoutFields, 'contentType' | 'columnNameContent'>,
  highlightColumnName: boolean,
) {
  if (
    highlightColumnName &&
    element.contentType === 'Data Source' &&
    element.columnNameContent
  ) {
    return { backgroundColor: 'rgba(255, 235, 59, 0.35)' };
  }
  return null;
}

function formatTextForRender(element: TextLayoutFields, raw: string) {
  if (element.verticalDisplay) {
    return { text: raw.split('').join('\n'), numberOfLines: undefined as number | undefined };
  }
  if (element.autoWrapping === 'Close') {
    return {
      text: raw.replace(/\r?\n/g, ' '),
      numberOfLines: 1 as number | undefined,
      ellipsizeMode: 'tail' as const,
    };
  }
  const lines = computeWrappedLines({
    text: raw,
    fontSize: element.fontSize,
    widthMm: element.width,
    autoWrapping: element.autoWrapping ?? 'Word',
    charSpacing: element.charSpacing ?? 0,
    bold: element.bold ?? false,
    verticalDisplay: false,
  });
  return { text: lines.join('\n'), numberOfLines: undefined as number | undefined };
}

function letterSpacingStyle(element: Pick<TextLayoutFields, 'charSpacing' | 'fontSize'>) {
  const spacing = element.charSpacing ?? 0;
  if (spacing <= 0) return null;
  return {
    letterSpacing: charSpacingToLetterSpacing(spacing, element.fontSize, Platform.OS),
  };
}

function TextContent({
  element,
  scale,
}: {
  element: TextLayoutFields & { text: string };
  scale: number;
  widthPx: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore((s) => s.editor.highlightColumnName);
  const style = textStyleFor(element, scale);
  const raw = resolveTextRaw(element, element.text, showColumnName);
  const formatted = formatTextForRender(element, raw);
  const align = element.align === 'spacing' ? 'justify' : element.align;
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch',
        },
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}>
      <Text
        allowFontScaling={false}
        style={[
          style,
          styles.textFill,
          { textAlign: align },
          letterSpacingStyle(element),
        ]}
        numberOfLines={formatted.numberOfLines}
        ellipsizeMode={'ellipsizeMode' in formatted ? formatted.ellipsizeMode : undefined}>
        {formatted.text}
      </Text>
    </View>
  );
}

function DegreesContent({
  element,
  scale,
}: {
  element: DegreesElementState;
  scale: number;
  widthPx: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore((s) => s.editor.highlightColumnName);
  const style = textStyleFor(element, scale);
  const raw = resolveTextRaw(element, element.content, showColumnName);
  const formatted = formatTextForRender(element, raw);
  const align = element.align === 'spacing' ? 'justify' : element.align;
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch',
        },
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}>
      <Text
        allowFontScaling={false}
        style={[
          style,
          styles.textFill,
          { textAlign: align },
          letterSpacingStyle(element),
        ]}
        numberOfLines={formatted.numberOfLines}
        ellipsizeMode={'ellipsizeMode' in formatted ? formatted.ellipsizeMode : undefined}>
        {formatted.text}
      </Text>
    </View>
  );
}

function TimeContent({
  element,
  scale,
}: {
  element: TimeElementState;
  scale: number;
  widthPx: number;
}) {
  const now = useClock(true);
  const adjusted = applyTimeOffsets(now, element);
  const style = textStyleFor(element, scale);
  const align = element.align === 'spacing' ? 'justify' : element.align;
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch',
        },
        element.antiColor && styles.antiBg,
      ]}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[style, styles.textFill, { textAlign: align }]}>
        {formatLiveDateTime(adjusted)}
      </Text>
    </View>
  );
}

function BarcodeContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: BarcodeElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const content =
    element.contentType === 'Data Source' && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : element.content || '0123456789';
  const rawModules = useMemo(
    () => barcodeModulesForMode(element.encodeMode, content),
    [content, element.encodeMode],
  );
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor ? inkColor(element.drawingColorIndex) : 'transparent';
  const labelSize = fontSizePx(element.fontSize, scale);
  const showLabel = element.textFlag !== 'Hide';
  const hri = formatBarcodeHri(element.encodeMode, content);
  const labelHeight = showLabel ? Math.max(8, Math.round(labelSize * 1.2)) : 0;
  const widthMm = element.width > 0 ? element.width : widthPx / (scale || 1);
  const align = element.align === 'spacing' ? 'justify' : element.align;
  const labelStyle = textStyleFor(element, scale);

  // Quantize barcode modules to integer hardware dots without internal quiet zone padding,
  // matching WePrint's tight fit where the selection box hugs the outermost bars and text exactly.
  const snapped = useMemo(() => {
    if (!rawModules) return null;
    return snap1DBarcodeModules(rawModules, widthMm, 203, false);
  }, [rawModules, widthMm]);

  const label = showLabel ? (
    <View
      style={{
        width: '100%',
        height: labelHeight,
        flexShrink: 0,
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch',
        justifyContent: 'center',
      }}>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[
          labelStyle,
          {
            width: '100%',
            lineHeight: labelHeight,
            textAlign: align,
          },
        ]}>
        {hri}
      </Text>
    </View>
  ) : null;

  return (
    <View style={[styles.fill, { backgroundColor: bgColor, justifyContent: 'flex-start', alignItems: 'stretch' }]}>
      {element.textFlag === 'Top' ? label : null}
      {rawModules && snapped ? (
        <View
          style={{
            flex: 1,
            width: '100%',
          }}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${widthPx} 100`}
            preserveAspectRatio="none">
            <Path
              d={snapped.bars
                .map((bar) => {
                  const barX = bar.x * widthPx;
                  const barW = Math.max(bar.width * widthPx, 0.55);
                  return `M${barX},0h${barW}v100h-${barW}Z`;
                })
                .join(' ')}
              fill={color}
            />
          </Svg>
        </View>
      ) : (
        <View style={styles.invalidBox}>
          <Text style={styles.invalidText}>Invalid barcode content</Text>
        </View>
      )}
      {element.textFlag === 'Bottom' ? label : null}
    </View>
  );
}

function QrcodeContent({
  element,
  widthPx,
  heightPx,
}: {
  element: QrcodeElementState;
  widthPx: number;
  heightPx: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const content =
    element.contentType === 'Data Source' && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : element.contentType === 'Degrees'
      ? applySerialOffset(element.content || 'https://example.com', element.degreesOffset, 1)
      : element.content || 'https://example.com';
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor ? inkColor(element.drawingColorIndex) : '#FFFFFF00';

  // 1. QR Code
  const qrMatrix = useMemo(() => {
    if (element.encodeMode === 'QRCode') {
      return generateQrMatrix(content, (element.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M');
    }
    return null;
  }, [element.encodeMode, content, element.errorLevel]);

  const qrPath = useMemo(() => {
    if (element.encodeMode !== 'QRCode' || !qrMatrix) return '';
    const qz = Math.max(0, parseInt(element.zoneSize, 10));
    let d = '';
    for (let r = 0; r < qrMatrix.size; r++) {
      for (let c = 0; c < qrMatrix.size; c++) {
        if (qrMatrix.data[r * qrMatrix.size + c]) {
          const x = c + qz;
          const y = r + qz;
          d += `M${x},${y}h1v1h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, qrMatrix, element.zoneSize]);

  // 2. DataMatrix (ISO/IEC 16022 authentic ECC 200)
  const isRectangular = widthPx > heightPx * 1.5;
  const dmMatrix = useMemo(() => {
    if (element.encodeMode === 'DataMatrix') {
      return encodeDataMatrix(content, isRectangular);
    }
    return null;
  }, [element.encodeMode, content, isRectangular]);

  const dmPath = useMemo(() => {
    if (element.encodeMode !== 'DataMatrix' || !dmMatrix) return '';
    const qz = Math.max(1, parseInt(element.zoneSize, 10) || 1);
    let d = '';
    for (let r = 0; r < dmMatrix.rows; r++) {
      for (let c = 0; c < dmMatrix.cols; c++) {
        if (dmMatrix.matrix[r][c]) {
          d += `M${c + qz},${r + qz}h1v1h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, dmMatrix, element.zoneSize]);

  // 3. PDF417 (ISO/IEC 15438 authentic multi-row)
  const pdfMatrix = useMemo(() => {
    if (element.encodeMode === 'PDF417') {
      return encodePdf417(content, 2);
    }
    return null;
  }, [element.encodeMode, content]);

  const pdfPath = useMemo(() => {
    if (element.encodeMode !== 'PDF417' || !pdfMatrix) return '';
    const qzX = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const qzY = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    let d = '';
    for (let r = 0; r < pdfMatrix.rows; r++) {
      for (let c = 0; c < pdfMatrix.cols; c++) {
        if (pdfMatrix.matrix[r][c]) {
          d += `M${c + qzX},${(r + qzY) * 3}h1v3h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, pdfMatrix, element.zoneSize]);

  if (element.encodeMode === 'QRCode' && qrMatrix) {
    const qz = Math.max(0, parseInt(element.zoneSize, 10));
    const totalSize = qrMatrix.size + qz * 2;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalSize} ${totalSize}`}
          preserveAspectRatio="xMidYMid meet">
          <Path d={qrPath} fill={color} />
        </Svg>
      </View>
    );
  }

  if (element.encodeMode === 'DataMatrix' && dmMatrix) {
    const qz = Math.max(1, parseInt(element.zoneSize, 10) || 1);
    const totalW = dmMatrix.cols + qz * 2;
    const totalH = dmMatrix.rows + qz * 2;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalW} ${totalH}`}
          preserveAspectRatio="xMidYMid meet">
          <Path d={dmPath} fill={color} />
        </Svg>
      </View>
    );
  }

  if (element.encodeMode === 'PDF417' && pdfMatrix) {
    const qzX = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const qzY = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const totalW = pdfMatrix.cols + qzX * 2;
    const totalH = (pdfMatrix.rows + qzY * 2) * 3;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalW} ${totalH}`}
          preserveAspectRatio="xMidYMid meet">
          <Path d={pdfPath} fill={color} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.invalidBox}>
      <Text style={styles.invalidText}>Invalid 2D barcode content</Text>
    </View>
  );
}

function LineContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: LineElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const color = inkColor(element.drawingColorIndex);
  const vertical = heightPx >= widthPx * 2;
  const strokeWidth = Math.max(1, (vertical ? element.width : element.height) * scale);
  const midY = heightPx / 2;
  const dash =
    element.lineStyle === 'dashed'
      ? [Math.max(3, element.virtualInterval * scale), Math.max(3, element.virtualInterval * scale)]
      : undefined;

  if (element.lineStyle === 'slash' || element.lineStyle === 'backslash') {
    const gap = Math.max(4, element.virtualInterval * scale * 2);
    const count = Math.ceil(widthPx / gap) + 2;
    const slashHeight = Math.min(heightPx, Math.max(6, strokeWidth * 4));
    return (
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
        {Array.from({ length: count }).map((_, i) => {
          const x = i * gap;
          const up = element.lineStyle === 'slash';
          return (
            <Line
              key={i}
              x1={x}
              y1={up ? midY + slashHeight / 2 : midY - slashHeight / 2}
              x2={x + gap * 0.6}
              y2={up ? midY - slashHeight / 2 : midY + slashHeight / 2}
              stroke={color}
              strokeWidth={Math.max(1, strokeWidth / 2)}
            />
          );
        })}
      </Svg>
    );
  }

  if (vertical) {
    const midX = widthPx / 2;
    return (
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
        <Line
          x1={midX}
          y1={0}
          x2={midX}
          y2={heightPx}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
      </Svg>
    );
  }

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
      <Line
        x1={0}
        y1={midY}
        x2={widthPx}
        y2={midY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    </Svg>
  );
}

function ShapeContent({
  element,
  widthPx,
  heightPx,
  scale,
  forPrint = false,
}: {
  element: ShapeElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
  forPrint?: boolean;
}) {
  const color = inkColor(element.drawingColorIndex);
  const strokeWidth = Math.max(1, element.lineWidth * scale);
  // Preview: tiny pad vs AA clip. Print: half-stroke only so rings match millimetres.
  const safePad = forPrint ? 0 : Math.max(0, Math.round(scale * 0.2));
  const inset = strokeWidth / 2 + safePad;
  const fill = shapeFillColor(element);
  const innerW = Math.max(1, widthPx - strokeWidth - safePad * 2);
  const innerH = Math.max(1, heightPx - strokeWidth - safePad * 2);

  if (element.figureShape === 'oval' || element.figureShape === 'circle') {
    const rx =
      element.figureShape === 'circle'
        ? Math.min(widthPx, heightPx) / 2 - inset
        : widthPx / 2 - inset;
    const ry =
      element.figureShape === 'circle'
        ? Math.min(widthPx, heightPx) / 2 - inset
        : heightPx / 2 - inset;
    return (
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
        <Ellipse
          cx={widthPx / 2}
          cy={heightPx / 2}
          rx={Math.max(1, rx)}
          ry={Math.max(1, ry)}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fill}
        />
      </Svg>
    );
  }

  const radius = element.figureShape === 'roundedRectangle' ? element.roundRadius * scale : 0;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
      <Rect
        x={inset}
        y={inset}
        width={innerW}
        height={innerH}
        rx={radius}
        ry={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    </Svg>
  );
}

/** Traces what the highlight renderer actually reads, only when the value changes. */
let lastHighlightRead = '\u0000';
function logHighlightRead(cell: { row: number; col: number } | null | undefined) {
  const key = cell ? `${cell.row},${cell.col}` : 'none';
  if (key === lastHighlightRead) return;
  lastHighlightRead = key;
  console.log(`[table-cell] highlight-render reads=${key}`);
}

function TableContent({
  element,
  widthPx,
  heightPx,
  scale,
  selectedTableCell,
  tableSelectionColor = '#48C3C7',
}: {
  element: TableElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore((s) => s.editor.highlightColumnName);
  const table = ensureTableCells(element);
  logHighlightRead(selectedTableCell);
  const color = inkColor(element.drawingColorIndex > 0 ? element.drawingColorIndex : 1);
  const strokeWidth = Math.max(1, element.lineWidth * scale);
  const totalRowMm = element.rowHeights.reduce((sum, h) => sum + h, 0) || 1;
  const totalColMm = element.columnWidths.reduce((sum, w) => sum + w, 0) || 1;

  const rowLines: number[] = [0];
  let acc = 0;
  for (const h of element.rowHeights) {
    acc += h;
    rowLines.push((acc / totalRowMm) * heightPx);
  }
  const colLines: number[] = [0];
  acc = 0;
  for (const w of element.columnWidths) {
    acc += w;
    colLines.push((acc / totalColMm) * widthPx);
  }

  const cellLayouts: {
    row: number;
    col: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }[] = [];
  for (let r = 0; r < element.rowCount; r++) {
    for (let c = 0; c < element.columnCount; c++) {
      cellLayouts.push({
        row: r,
        col: c,
        left: colLines[c] ?? 0,
        top: rowLines[r] ?? 0,
        width: Math.max(1, (colLines[c + 1] ?? widthPx) - (colLines[c] ?? 0)),
        height: Math.max(1, (rowLines[r + 1] ?? heightPx) - (rowLines[r] ?? 0)),
      });
    }
  }

  return (
    <View style={styles.fill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none">
        {rowLines.map((y, i) => (
          <Line
            key={`r${i}`}
            x1={0}
            y1={Math.min(heightPx - strokeWidth / 2, Math.max(strokeWidth / 2, y))}
            x2={widthPx}
            y2={Math.min(heightPx - strokeWidth / 2, Math.max(strokeWidth / 2, y))}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ))}
        {colLines.map((x, i) => (
          <Line
            key={`c${i}`}
            x1={Math.min(widthPx - strokeWidth / 2, Math.max(strokeWidth / 2, x))}
            y1={0}
            x2={Math.min(widthPx - strokeWidth / 2, Math.max(strokeWidth / 2, x))}
            y2={heightPx}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ))}
      </Svg>
      {cellLayouts.map(({ row, col, left, top, width, height }) => {
        const cell = table.cells?.[row]?.[col];
        const selected = selectedTableCell?.row === row && selectedTableCell?.col === col;
        const raw = cell ? resolveTextRaw(cell, cell.text, showColumnName) : '';
        const flat = raw.replace(/\r?\n/g, ' ');
        const padX = Math.max(1, scale * 0.4);
        const innerW = Math.max(1, width - padX * 2);
        const measuredPx = cell
          ? measureTextWidthMm(flat, cell.fontSize, 0, cell.bold) * scale * 1.12
          : 0;
        const scaleX = measuredPx > innerW ? innerW / measuredPx : 1;
        const style = cell ? textStyleFor(cell, scale) : undefined;
        const align = cell?.align === 'spacing' ? 'justify' : cell?.align ?? 'left';
        return (
          <View
            key={`cell-${row}-${col}`}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left,
                top,
                width,
                height,
                overflow: 'hidden',
                justifyContent: 'center',
                alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'stretch',
                paddingHorizontal: Math.max(1, scale * 0.4),
                paddingVertical: Math.max(0, scale * 0.2),
              },
              selected && {
                backgroundColor: `${tableSelectionColor}99`,
                borderWidth: Math.max(1, scale * 0.15),
                borderColor: tableSelectionColor,
              },
              cell && dataColumnHighlightStyle(cell, highlightColumnName),
            ]}>
            {cell && flat ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                style={[
                  style,
                  letterSpacingStyle(cell),
                  {
                    textAlign: align,
                    width: scaleX < 1 ? measuredPx : '100%',
                    ...(scaleX < 1
                      ? { transform: [{ scaleX }], transformOrigin: 'left center' as const }
                      : null),
                  },
                ]}>
                {flat}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ArcTextContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: ArcTextElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore((s) => s.editor.highlightColumnName);
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const isPlaceholder = !element.text || element.text.trim().length === 0;
  const displayText =
    element.contentType === 'Data Source' && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : isPlaceholder
      ? 'Double-tap to enter text'
      : element.text;

  const nominalFontSize = fontSizePx(element.fontSize, scale);
  const layout = useMemo(
    () =>
      computeArcTextLayout({
        text: displayText,
        widthPx,
        heightPx,
        nominalFontSizePx: nominalFontSize,
        lineWidthMm: element.lineWidth,
        scale,
        bold: element.bold,
      }),
    [displayText, widthPx, heightPx, nominalFontSize, element.lineWidth, scale, element.bold],
  );

  const fontFamily = resolveFontFamily(element.fontFamily);
  const textColor = isPlaceholder
    ? element.antiColor
      ? 'rgba(255, 255, 255, 0.65)'
      : '#334155'
    : color;

  return (
    <View
      style={[
        styles.fill,
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`}>
        {/* Circular guide line matching reference specification */}
        <Circle
          cx={layout.cx}
          cy={layout.cy}
          r={layout.radius}
          stroke={color}
          strokeWidth={layout.strokeWidth}
          fill="none"
        />

        {/* Letters curved along the circular arc */}
        {layout.characters.map((item, idx) => (
          <SvgText
            key={`${idx}-${item.char}`}
            x={item.x}
            y={item.y}
            fill={textColor}
            fontSize={layout.effectiveFontSizePx}
            fontFamily={fontFamily}
            fontWeight={element.bold ? '700' : '400'}
            fontStyle={element.italic ? 'italic' : 'normal'}
            textDecoration={
              element.underline
                ? 'underline'
                : element.strikethrough
                ? 'line-through'
                : 'none'
            }
            textAnchor="middle"
            transform={`rotate(${item.rotationDeg}, ${item.x}, ${item.y})`}>
            {item.char}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export function ElementContentView({
  element,
  widthPx,
  heightPx,
  scale,
  forPrint,
  mediaShape,
  selectedTableCell,
  tableSelectionColor,
}: ContentProps) {
  switch (element.type) {
    case 'text':
      return <TextContent element={element} scale={scale} widthPx={widthPx} />;
    case 'degrees':
      return <DegreesContent element={element} scale={scale} widthPx={widthPx} />;
    case 'time':
      return <TimeContent element={element} scale={scale} widthPx={widthPx} />;
    case 'barcode':
      return (
        <BarcodeContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      );
    case 'qrcode':
      return <QrcodeContent element={element} widthPx={widthPx} heightPx={heightPx} />;
    case 'line':
      return <LineContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />;
    case 'shape':
      return (
        <ShapeContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
          forPrint={forPrint}
        />
      );
    case 'table':
      return (
        <TableContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
          selectedTableCell={selectedTableCell}
          tableSelectionColor={tableSelectionColor}
        />
      );
    case 'arctext':
      return (
        <ArcTextContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      );
    case 'image': {
      const transforms: ({ scaleX: number } | { scaleY: number })[] = [];
      if (element.flipH) transforms.push({ scaleX: -1 });
      if (element.flipV) transforms.push({ scaleY: -1 });
      const fit = element.contentFit ?? 'fill';
      const displayUri = forPrint ? element.printUri || element.uri : element.uri;
      const decodeW = Math.max(
        1,
        Math.round(forPrint ? widthPx : element.workingWidthPx ?? widthPx),
      );
      const decodeH = Math.max(
        1,
        Math.round(forPrint ? heightPx : element.workingHeightPx ?? heightPx),
      );
      return (
        <View style={[styles.fill, element.antiColor && styles.antiBg]}>
          <Image
            source={{ uri: displayUri, width: decodeW, height: decodeH }}
            style={[
              styles.fill,
              transforms.length > 0 ? { transform: transforms } : null,
              element.colorMode === 'B & W' ? { tintColor: '#111827' } : null,
            ]}
            contentFit={fit}
            cachePolicy="memory-disk"
            recyclingKey={`${element.id}:${displayUri}`}
            priority={forPrint ? 'high' : 'normal'}
          />
        </View>
      );
    }
    case 'clipart': {
      const sticker = getClipartById(element.clipartId);
      const size = Math.min(widthPx, heightPx);
      return (
        <View style={[styles.fill, styles.center]}>
          {sticker ? (
            <ClipartIcon
              shapes={sticker.shapes}
              size={size}
              color={inkColor(element.drawingColorIndex)}
            />
          ) : (
            <Text style={{ fontSize: size * 0.7, color: inkColor(element.drawingColorIndex) }}>
              {element.glyph ?? '★'}
            </Text>
          )}
        </View>
      );
    }
    case 'border': {
      const circular = mediaShape === 'circle' || mediaShape === 'ellipse';
      const insetPx = Math.max(2, Math.round(scale * 2));
      const innerW = Math.max(1, widthPx - insetPx * 2);
      const innerH = Math.max(1, heightPx - insetPx * 2);
      return (
        <View style={[styles.fillVisible, { padding: insetPx }]}>
          <BorderPreview
            styleId={element.borderStyle}
            scale={scale}
            lineWidthMm={element.lineWidth || 0.55}
            circular={circular}
            widthPx={innerW}
            heightPx={innerH}
          />
        </View>
      );
    }
    case 'signature':
      return (
        <View style={styles.fill}>
          <SignaturePreview strokes={element.strokes} width={widthPx} height={heightPx} />
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    flexShrink: 0,
    overflow: 'visible',
  },
  fillVisible: {
    width: '100%',
    height: '100%',
    overflow: 'visible',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  antiBg: {
    backgroundColor: '#111827',
  },
  textFill: {
    width: '100%',
    flexShrink: 0,
  },
  invalidBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5484D',
  },
  invalidText: {
    fontSize: 10,
    color: '#E5484D',
  },
});
