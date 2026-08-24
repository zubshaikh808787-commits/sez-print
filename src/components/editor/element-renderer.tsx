import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';

import { ClipartIcon } from '@/components/clipart-icon';
import { SignaturePreview } from '@/components/editor/signature-drawing-board';
import { BorderPreview } from '@/components/border-preview';
import { getClipartById } from '@/constants/clipart-library';
import {
  DRAWING_COLORS,
  applyTimeOffsets,
  formatLiveDate,
  formatLiveTime,
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
import { barcodeBarsForMode } from '@/lib/barcode-code128';
import { applySerialOffset, lineSpacingMultiplier } from '@/lib/serial-content';
import { useSettingsStore } from '@/stores/settings-store';
import { ptToMm, type LabelElement } from '@/lib/label-document';

export function inkColor(drawingColorIndex: number) {
  const color = DRAWING_COLORS[drawingColorIndex] ?? '#111827';
  return drawingColorIndex === 0 || color === '#FFFFFF' ? '#111827' : color;
}

export function resolveFontFamily(name: string): string | undefined {
  if (!name || name === 'Default' || name === 'Barcode') return undefined;
  const byName = FONT_LIBRARY.find((f) => f.name === name || f.id === name);
  return byName?.family ?? undefined;
}

function fontSizePx(fontSizePt: number, scale: number) {
  return Math.max(4, ptToMm(fontSizePt) * scale);
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
    | 'lineSpacing'
  >,
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
    fontFamily: resolveFontFamily(state.fontFamily),
    fontWeight: state.bold ? ('700' as const) : ('400' as const),
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

function TextContent({
  element,
  scale,
}: {
  element: EditorElementState & { verticalDisplay?: boolean; charSpacing?: number };
  scale: number;
}) {
  const style = textStyleFor(element, scale);
  const raw =
    element.contentType === 'Data Source' && element.columnNameContent
      ? `{${element.columnNameContent}}`
      : element.text;
  const text = element.verticalDisplay ? raw.split('').join('\n') : raw;
  return (
    <View style={[styles.fill, element.antiColor && styles.antiBg]}>
      <Text
        style={[style, styles.textFill, element.charSpacing ? { letterSpacing: element.charSpacing } : null]}
        numberOfLines={element.verticalDisplay ? undefined : element.autoWrapping === 'Close' ? 1 : 6}>
        {text}
      </Text>
    </View>
  );
}

function DegreesContent({ element, scale }: { element: DegreesElementState; scale: number }) {
  const style = textStyleFor(element, scale);
  const base =
    element.contentType === 'Data Source' && element.columnNameContent
      ? `{${element.columnNameContent}}`
      : element.content;
  const resolved =
    element.contentType === 'Degrees'
      ? applySerialOffset(base, element.degreesOffset, 1)
      : base;
  const text = element.verticalDisplay ? resolved.split('').join('\n') : resolved;
  return (
    <View style={[styles.fill, element.antiColor && styles.antiBg]}>
      <Text style={style}>{text}</Text>
    </View>
  );
}

function TimeContent({ element, scale }: { element: TimeElementState; scale: number }) {
  const now = useClock(true);
  const adjusted = applyTimeOffsets(now, element);
  const style = textStyleFor(element, scale);
  return (
    <View style={[styles.fill, element.antiColor && styles.antiBg]}>
      <Text style={style}>{`${formatLiveDate(adjusted)} ${formatLiveTime(adjusted)}`}</Text>
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
  const content =
    element.contentType === 'Data Source' && element.columnNameContent
      ? `{${element.columnNameContent}}`
      : element.contentType === 'Degrees'
      ? applySerialOffset(element.content || '0123456789', element.degreesOffset, 1)
      : element.content || '0123456789';
  const bars = useMemo(
    () => barcodeBarsForMode(element.encodeMode, content),
    [content, element.encodeMode],
  );
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor ? inkColor(element.drawingColorIndex) : 'transparent';
  const labelSize = fontSizePx(element.fontSize, scale);
  const showLabel = element.textFlag !== 'Hide' && heightPx > labelSize * 1.6;
  const barsHeight = showLabel ? heightPx - labelSize * 1.3 : heightPx;
  const label = showLabel ? (
    <Text
      numberOfLines={1}
      style={{
        fontSize: labelSize,
        lineHeight: labelSize * 1.2,
        color,
        textAlign: 'center',
        fontFamily: resolveFontFamily(element.fontFamily),
        fontWeight: element.bold ? '700' : '400',
      }}>
      {content}
    </Text>
  ) : null;

  return (
    <View style={[styles.fill, { backgroundColor: bgColor }]}>
      {element.textFlag === 'Top' ? label : null}
      {bars ? (
        <Svg width={widthPx} height={Math.max(2, barsHeight)}>
          {bars.map((bar, i) => (
            <Rect
              key={i}
              x={bar.x * widthPx}
              y={0}
              width={bar.width * widthPx}
              height={Math.max(2, barsHeight)}
              fill={color}
            />
          ))}
        </Svg>
      ) : (
        <View style={styles.invalidBox}>
          <Text style={styles.invalidText}>Invalid barcode content</Text>
        </View>
      )}
      {element.textFlag === 'Bottom' ? label : null}
    </View>
  );
}

/** Deterministic pseudo-random matrix used to approximate PDF417 / DataMatrix. */
function pseudoMatrix(content: string, cols: number, rows: number) {
  let seed = 0;
  for (const ch of content) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const cells: boolean[] = [];
  let value = seed || 1;
  for (let i = 0; i < cols * rows; i += 1) {
    value = (value * 1103515245 + 12345) >>> 0;
    cells.push((value & 0x40000000) !== 0);
  }
  return cells;
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
  const content =
    element.contentType === 'Data Source' && element.columnNameContent
      ? `{${element.columnNameContent}}`
      : element.contentType === 'Degrees'
      ? applySerialOffset(element.content || 'https://example.com', element.degreesOffset, 1)
      : element.content || 'https://example.com';
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor ? inkColor(element.drawingColorIndex) : '#FFFFFF00';
  const quietZone = parseInt(element.zoneSize, 10) * 2;
  const cols = element.encodeMode === 'PDF417' ? 24 : 16;
  const rows = element.encodeMode === 'PDF417' ? 10 : 16;
  const cells = useMemo(() => pseudoMatrix(content, cols, rows), [content, cols, rows]);

  if (element.encodeMode === 'QRCode') {
    const size = Math.min(widthPx, heightPx) - quietZone * 2;
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <QRCode
          value={content}
          size={Math.max(16, size)}
          color={color}
          backgroundColor="transparent"
          ecl={element.errorLevel}
        />
      </View>
    );
  }

  const cellW = widthPx / cols;
  const cellH = heightPx / rows;
  return (
    <Svg width={widthPx} height={heightPx}>
      {cells.map((on, i) =>
        on ? (
          <Rect
            key={i}
            x={(i % cols) * cellW}
            y={Math.floor(i / cols) * cellH}
            width={cellW}
            height={cellH}
            fill={color}
          />
        ) : null,
      )}
      <Rect x={0} y={0} width={cellW} height={heightPx} fill={color} />
      <Rect x={widthPx - cellW} y={0} width={cellW} height={heightPx} fill={color} />
    </Svg>
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
  const strokeWidth = Math.max(1, element.height * scale);
  const midY = heightPx / 2;

  if (element.lineStyle === 'slash' || element.lineStyle === 'backslash') {
    const gap = Math.max(4, element.virtualInterval * scale * 2);
    const count = Math.ceil(widthPx / gap) + 2;
    const slashHeight = Math.min(heightPx, Math.max(6, strokeWidth * 4));
    return (
      <Svg width={widthPx} height={heightPx}>
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

  return (
    <Svg width={widthPx} height={heightPx}>
      <Line
        x1={0}
        y1={midY}
        x2={widthPx}
        y2={midY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={
          element.lineStyle === 'dashed'
            ? [Math.max(3, element.virtualInterval * scale), Math.max(3, element.virtualInterval * scale)]
            : undefined
        }
      />
    </Svg>
  );
}

function ShapeContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: ShapeElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const color = inkColor(element.drawingColorIndex);
  const strokeWidth = Math.max(1, element.lineWidth * scale);
  const inset = strokeWidth / 2;
  const fill = element.fill ? color : 'transparent';

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
      <Svg width={widthPx} height={heightPx}>
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
    <Svg width={widthPx} height={heightPx}>
      <Rect
        x={inset}
        y={inset}
        width={Math.max(1, widthPx - strokeWidth)}
        height={Math.max(1, heightPx - strokeWidth)}
        rx={radius}
        ry={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    </Svg>
  );
}

function TableContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: TableElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const tableColorIndex = useSettingsStore((s) => s.editor.tableColorIndex);
  const color = inkColor(
    element.drawingColorIndex > 0 ? element.drawingColorIndex : tableColorIndex,
  );
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

  return (
    <Svg width={widthPx} height={heightPx}>
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
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const text =
    element.contentType === 'Data Source' && element.columnNameContent
      ? element.columnNameContent
      : 'ARC TEXT';
  const size = fontSizePx(element.fontSize, scale);
  const rx = widthPx / 2 - size / 2;
  const ry = heightPx / 2 - size / 2;
  const pathId = 'arc-path';
  const d = `M ${widthPx / 2 - rx} ${heightPx / 2} A ${rx} ${ry} 0 0 1 ${widthPx / 2 + rx} ${
    heightPx / 2
  }`;

  return (
    <View style={[styles.fill, element.antiColor && styles.antiBg]}>
      <Svg width={widthPx} height={heightPx}>
        <Defs>
          <Path id={pathId} d={d} />
        </Defs>
        <SvgText
          fill={color}
          fontSize={size}
          fontWeight={element.bold ? '700' : '400'}
          fontStyle={element.italic ? 'italic' : 'normal'}>
          <TextPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
            {text}
          </TextPath>
        </SvgText>
      </Svg>
    </View>
  );
}

export function ElementContentView({ element, widthPx, heightPx, scale }: ContentProps) {
  switch (element.type) {
    case 'text':
      return <TextContent element={element} scale={scale} />;
    case 'degrees':
      return <DegreesContent element={element} scale={scale} />;
    case 'time':
      return <TimeContent element={element} scale={scale} />;
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
        <ShapeContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      );
    case 'table':
      return (
        <TableContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      );
    case 'arctext':
      return (
        <ArcTextContent element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      );
    case 'image':
      return (
        <Image
          source={{ uri: element.uri }}
          style={styles.fill}
          contentFit="fill"
        />
      );
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
    case 'border':
      return (
        <View style={styles.fill}>
          <BorderPreview styleId={element.borderStyle} />
        </View>
      );
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
    overflow: 'hidden',
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
