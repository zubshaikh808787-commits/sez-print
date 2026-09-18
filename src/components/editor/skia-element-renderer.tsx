import React, { memo, useMemo } from 'react';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';
import {
  Circle,
  DashPathEffect,
  Group,
  Image,
  Line,
  Paint,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text,
  matchFont,
  rect,
  rrect,
  useImage,
  vec,
} from '@shopify/react-native-skia';

import type {
  ArcTextElementState,
  BarcodeElementState,
  DegreesElementState,
  EditorElementState,
  LineElementState,
  QrcodeElementState,
  ShapeElementState,
  TableElementState,
  TimeElementState,
} from '@/components/editor/types';
import {
  DRAWING_COLORS,
  applyTimeOffsets,
  formatLiveDate,
  formatLiveTime,
} from '@/components/editor/types';
import { barcodeBarsForMode } from '@/lib/barcode-code128';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { applySerialOffset, lineSpacingMultiplier } from '@/lib/serial-content';
import { FONT_LIBRARY } from '@/constants/font-library';
import { getClipartById } from '@/constants/clipart-library';
import {
  ptToMm,
  type BorderElementState,
  type ClipartElementState,
  type ImageElementState,
  type LabelElement,
  type SignatureElementState,
} from '@/lib/label-document';

export const DESIGN_INK = '#111111';

export function inkColor(drawingColorIndex: number): string {
  const color = DRAWING_COLORS[drawingColorIndex] ?? DESIGN_INK;
  return drawingColorIndex === 0 || color === '#FFFFFF' ? DESIGN_INK : color;
}

export function resolveFontFamily(name?: string): string | undefined {
  if (!name || name === 'Default' || name === 'Barcode') return undefined;
  const byName = FONT_LIBRARY.find((f) => f.name === name || f.id === name);
  return byName?.family ?? undefined;
}

export function fontSizePx(fontSizePt: number, scale: number): number {
  return Math.max(1, ptToMm(fontSizePt) * scale);
}

function formatBarcodeHri(mode: string, content: string): string {
  if (mode !== 'UPC-A') return content;
  const digits = content.replace(/\D/g, '');
  if (digits.length === 12) {
    return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
  }
  return content;
}

/**
 * Text rendered via Skia with matchFont.
 */
export const SkiaText = memo(function SkiaText({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: EditorElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const size = fontSizePx(element.fontSize, scale);
  const color = element.antiColor ? '#FFFFFF' : inkColor(element.drawingColorIndex);
  const family = resolveFontFamily(element.fontFamily) || 'sans-serif';

  const font = useMemo(() => {
    try {
      return matchFont({
        fontFamily: family,
        fontSize: size,
        fontStyle: element.italic ? 'italic' : 'normal',
        fontWeight: element.bold ? 'bold' : 'normal',
      });
    } catch {
      return null;
    }
  }, [family, size, element.italic, element.bold]);

  const rawText =
    element.contentType === 'Data Source' && element.columnNameContent
      ? `{${element.columnNameContent}}`
      : element.contentType === 'Degrees'
      ? applySerialOffset(element.text || 'TEXT', (element as any).degreesOffset ?? 1, 1)
      : element.text || 'TEXT';

  const lines = useMemo(() => (rawText || '').split('\n'), [rawText]);
  const lineMult = lineSpacingMultiplier(element.lineSpacing ?? '1.0');
  const lineH = size * lineMult;

  return (
    <Group>
      {element.antiColor && (
        <Rect x={0} y={0} width={widthPx} height={heightPx} color="#111827" />
      )}
      {font &&
        lines.map((lineStr, idx) => {
          const textW = font.measureText(lineStr).width;
          let startX = 0;
          if (element.align === 'center') {
            startX = Math.max(0, (widthPx - textW) / 2);
          } else if (element.align === 'right') {
            startX = Math.max(0, widthPx - textW);
          }
          const y = (idx + 1) * lineH;
          return (
            <Group key={`txt-${idx}`}>
              <Text x={startX} y={y} text={lineStr} font={font} color={color} />
              {element.underline && (
                <Line
                  p1={vec(startX, y + 2)}
                  p2={vec(startX + textW, y + 2)}
                  color={color}
                  strokeWidth={Math.max(1, size * 0.08)}
                />
              )}
              {element.strikethrough && (
                <Line
                  p1={vec(startX, y - size * 0.35)}
                  p2={vec(startX + textW, y - size * 0.35)}
                  color={color}
                  strokeWidth={Math.max(1, size * 0.08)}
                />
              )}
            </Group>
          );
        })}
    </Group>
  );
});

/**
 * Barcode drawn directly as native Skia vector Rects per canvas.md §2.3.
 */
export const SkiaBarcode = memo(function SkiaBarcode({
  encodeMode,
  content,
  widthPx,
  heightPx,
  drawingColorIndex = 0,
  antiColor = false,
  textFlag = 'Bottom',
  fontSizePt = 10,
  fontFamily,
  bold = false,
  scale,
}: {
  encodeMode: string;
  content: string;
  widthPx: number;
  heightPx: number;
  drawingColorIndex?: number;
  antiColor?: boolean;
  textFlag?: string;
  fontSizePt?: number;
  fontFamily?: string;
  bold?: boolean;
  scale: number;
}) {
  const bars = useMemo(() => {
    return barcodeBarsForMode(encodeMode, content || '0123456789');
  }, [encodeMode, content]);

  const color = antiColor ? '#FFFFFF' : inkColor(drawingColorIndex);
  const bgColor = antiColor ? inkColor(drawingColorIndex) : '#00000000';

  const showLabel = textFlag !== 'Hide';
  const labelSize = fontSizePx(fontSizePt, scale);
  const labelH = showLabel ? Math.max(10, labelSize * 1.3) : 0;
  const barsH = Math.max(2, heightPx - labelH - (showLabel ? 2 : 0));
  const barsY = textFlag === 'Top' ? labelH + 2 : 0;
  const labelY = textFlag === 'Top' ? labelSize : heightPx - 3;

  const font = useMemo(() => {
    if (!showLabel) return null;
    try {
      return matchFont({
        fontFamily: resolveFontFamily(fontFamily) || 'sans-serif',
        fontSize: labelSize,
        fontStyle: 'normal',
        fontWeight: bold ? 'bold' : 'normal',
      });
    } catch {
      return null;
    }
  }, [showLabel, fontFamily, labelSize, bold]);

  const rects = useMemo(() => {
    if (!bars) return [];
    return bars.map((bar) => ({
      x: bar.x * widthPx,
      width: Math.max(0.6, bar.width * widthPx),
    }));
  }, [bars, widthPx]);

  const hri = formatBarcodeHri(encodeMode, content || '0123456789');
  const hriWidth = font ? font.measureText(hri).width : 0;
  const hriX = Math.max(0, (widthPx - hriWidth) / 2);

  return (
    <Group>
      {antiColor && <Rect x={0} y={0} width={widthPx} height={heightPx} color={bgColor} />}
      <Group transform={[{ translateY: barsY }]}>
        {rects.map((r, i) => (
          <Rect key={`bar-${i}`} x={r.x} y={0} width={r.width} height={barsH} color={color} />
        ))}
      </Group>
      {showLabel && font && (
        <Text x={hriX} y={labelY} text={hri} font={font} color={color} />
      )}
    </Group>
  );
});

/**
 * QR Code / 2D Code rendered directly as native Skia vector modules.
 */
export const SkiaQRCode = memo(function SkiaQRCode({
  encodeMode,
  content,
  widthPx,
  heightPx,
  drawingColorIndex = 0,
  antiColor = false,
  zoneSize = '1',
}: {
  encodeMode: string;
  content: string;
  widthPx: number;
  heightPx: number;
  drawingColorIndex?: number;
  antiColor?: boolean;
  zoneSize?: string;
}) {
  const color = antiColor ? '#FFFFFF' : inkColor(drawingColorIndex);
  const bgColor = antiColor ? inkColor(drawingColorIndex) : '#00000000';
  const quietZone = parseInt(zoneSize, 10) * 2;

  const qrMatrix = useMemo(() => {
    if (encodeMode === 'QRCode') {
      return generateQrMatrix(content || 'https://example.com');
    }
    return null;
  }, [encodeMode, content]);

  if (encodeMode === 'QRCode' && qrMatrix) {
    const size = Math.max(1, Math.min(widthPx, heightPx) - quietZone * 2);
    const modSize = size / qrMatrix.size;
    const ox = (widthPx - size) / 2;
    const oy = (heightPx - size) / 2;

    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (let r = 0; r < qrMatrix.size; r++) {
      for (let c = 0; c < qrMatrix.size; c++) {
        if (qrMatrix.data[r * qrMatrix.size + c]) {
          rects.push({
            x: ox + c * modSize,
            y: oy + r * modSize,
            w: modSize,
            h: modSize,
          });
        }
      }
    }

    return (
      <Group>
        {antiColor && <Rect x={0} y={0} width={widthPx} height={heightPx} color={bgColor} />}
        {rects.map((rc, i) => (
          <Rect key={`qr-${i}`} x={rc.x} y={rc.y} width={rc.w} height={rc.h} color={color} />
        ))}
      </Group>
    );
  }

  // Fallback 2D matrix (PDF417 / DataMatrix)
  const cols = encodeMode === 'PDF417' ? 24 : 16;
  const rows = encodeMode === 'PDF417' ? 10 : 16;
  const cellW = widthPx / cols;
  const cellH = heightPx / rows;

  return (
    <Group>
      {antiColor && <Rect x={0} y={0} width={widthPx} height={heightPx} color={bgColor} />}
      <Rect x={0} y={0} width={cellW} height={heightPx} color={color} />
      <Rect x={widthPx - cellW} y={0} width={cellW} height={heightPx} color={color} />
    </Group>
  );
});

/**
 * Shape rendered via native Skia primitives.
 */
export const SkiaShape = memo(function SkiaShape({
  figureShape = 'rectangle',
  widthPx,
  heightPx,
  lineWidth = 1,
  roundRadius = 0,
  fill = false,
  fillColor,
  drawingColorIndex = 0,
  scale,
}: {
  figureShape?: string;
  widthPx: number;
  heightPx: number;
  lineWidth?: number;
  roundRadius?: number;
  fill?: boolean;
  fillColor?: string;
  drawingColorIndex?: number;
  scale: number;
}) {
  const strokeW = Math.max(1, lineWidth * scale);
  const strokeCol = inkColor(drawingColorIndex);
  const resolvedFill = fill ? fillColor || strokeCol : 'transparent';
  const inset = strokeW / 2;
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);

  if (figureShape === 'circle' || figureShape === 'oval') {
    const rx = figureShape === 'circle' ? Math.min(w, h) / 2 - inset : w / 2 - inset;
    const ry = figureShape === 'circle' ? Math.min(w, h) / 2 - inset : h / 2 - inset;
    return (
      <Group>
        {resolvedFill !== 'transparent' && (
          <Circle cx={w / 2} cy={h / 2} r={Math.max(1, Math.min(rx, ry))} color={resolvedFill} />
        )}
        <Circle
          cx={w / 2}
          cy={h / 2}
          r={Math.max(1, Math.min(rx, ry))}
          color={strokeCol}
          style="stroke"
          strokeWidth={strokeW}
        />
      </Group>
    );
  }

  const rad = figureShape === 'roundedRectangle' ? Math.max(0, roundRadius * scale) : 0;
  if (rad > 0) {
    const innerRect = rect(inset, inset, Math.max(1, w - strokeW), Math.max(1, h - strokeW));
    const rr = rrect(innerRect, rad, rad);
    return (
      <Group>
        {resolvedFill !== 'transparent' && <RoundedRect rect={rr} color={resolvedFill} />}
        <RoundedRect rect={rr} color={strokeCol} style="stroke" strokeWidth={strokeW} />
      </Group>
    );
  }

  return (
    <Group>
      {resolvedFill !== 'transparent' && (
        <Rect
          x={inset}
          y={inset}
          width={Math.max(1, w - strokeW)}
          height={Math.max(1, h - strokeW)}
          color={resolvedFill}
        />
      )}
      <Rect
        x={inset}
        y={inset}
        width={Math.max(1, w - strokeW)}
        height={Math.max(1, h - strokeW)}
        color={strokeCol}
        style="stroke"
        strokeWidth={strokeW}
      />
    </Group>
  );
});

/**
 * Line rendered via Skia Line / Path.
 */
export const SkiaLine = memo(function SkiaLine({
  widthPx,
  heightPx,
  drawingColorIndex = 0,
  lineStyle = 'solid',
  lineWidth = 1,
  virtualInterval = 3,
  scale,
}: {
  widthPx: number;
  heightPx: number;
  drawingColorIndex?: number;
  lineStyle?: string;
  lineWidth?: number;
  virtualInterval?: number;
  scale: number;
}) {
  const color = inkColor(drawingColorIndex);
  const vertical = heightPx >= widthPx * 2;
  const strokeW = Math.max(1, lineWidth * scale);
  const dashInterval = Math.max(3, virtualInterval * scale);

  if (vertical) {
    const midX = widthPx / 2;
    return (
      <Line
        p1={vec(midX, 0)}
        p2={vec(midX, heightPx)}
        color={color}
        strokeWidth={strokeW}
        style="stroke"
      >
        {lineStyle === 'dashed' && <DashPathEffect intervals={[dashInterval, dashInterval]} />}
      </Line>
    );
  }

  const midY = heightPx / 2;
  return (
    <Line
      p1={vec(0, midY)}
      p2={vec(widthPx, midY)}
      color={color}
      strokeWidth={strokeW}
      style="stroke"
    >
      {lineStyle === 'dashed' && <DashPathEffect intervals={[dashInterval, dashInterval]} />}
    </Line>
  );
});

/**
 * Table rendered via Skia grid rects & cell lines.
 */
export const SkiaTable = memo(function SkiaTable({
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
  const color = inkColor(element.drawingColorIndex);
  const strokeW = Math.max(1, element.lineWidth * scale);
  const totalRowMm = element.rowHeights.reduce((sum, h) => sum + h, 0) || 1;
  const totalColMm = element.columnWidths.reduce((sum, w) => sum + w, 0) || 1;

  const rowLines: number[] = [0];
  let accR = 0;
  for (const h of element.rowHeights) {
    accR += h;
    rowLines.push((accR / totalRowMm) * heightPx);
  }

  const colLines: number[] = [0];
  let accC = 0;
  for (const w of element.columnWidths) {
    accC += w;
    colLines.push((accC / totalColMm) * widthPx);
  }

  return (
    <Group>
      {rowLines.map((y, i) => (
        <Line
          key={`tr-${i}`}
          p1={vec(0, Math.min(heightPx - strokeW / 2, Math.max(strokeW / 2, y)))}
          p2={vec(widthPx, Math.min(heightPx - strokeW / 2, Math.max(strokeW / 2, y)))}
          color={color}
          strokeWidth={strokeW}
          style="stroke"
        />
      ))}
      {colLines.map((x, i) => (
        <Line
          key={`tc-${i}`}
          p1={vec(Math.min(widthPx - strokeW / 2, Math.max(strokeW / 2, x)), 0)}
          p2={vec(Math.min(widthPx - strokeW / 2, Math.max(strokeW / 2, x)), heightPx)}
          color={color}
          strokeWidth={strokeW}
          style="stroke"
        />
      ))}
    </Group>
  );
});

/**
 * Image element rendered via Skia Image.
 */
export const SkiaImageElement = memo(function SkiaImageElement({
  uri,
  widthPx,
  heightPx,
  flipH = false,
  flipV = false,
  antiColor = false,
}: {
  uri: string;
  widthPx: number;
  heightPx: number;
  flipH?: boolean;
  flipV?: boolean;
  antiColor?: boolean;
}) {
  const skiaImg = useImage(uri);
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);

  const transforms = useMemo(() => {
    const list: any[] = [];
    if (flipH) list.push({ scaleX: -1 }, { translateX: -w });
    if (flipV) list.push({ scaleY: -1 }, { translateY: -h });
    return list;
  }, [flipH, flipV, w, h]);

  return (
    <Group transform={transforms.length > 0 ? transforms : undefined}>
      {antiColor && <Rect x={0} y={0} width={w} height={h} color="#111827" />}
      {skiaImg && (
        <Image
          image={skiaImg}
          x={0}
          y={0}
          width={w}
          height={h}
          fit="contain"
        />
      )}
    </Group>
  );
});

/**
 * Clipart / Icon element rendered via Skia.
 */
export const SkiaClipart = memo(function SkiaClipart({
  element,
  widthPx,
  heightPx,
}: {
  element: ClipartElementState;
  widthPx: number;
  heightPx: number;
}) {
  const color = inkColor(element.drawingColorIndex);
  const size = Math.min(widthPx, heightPx);
  const sticker = getClipartById(element.clipartId);

  const font = useMemo(() => {
    try {
      return matchFont({
        fontFamily: 'sans-serif',
        fontSize: size * 0.7,
        fontWeight: 'bold',
      });
    } catch {
      return null;
    }
  }, [size]);

  if (!sticker && font) {
    const glyph = element.glyph ?? '★';
    return <Text x={(widthPx - size * 0.7) / 2} y={size * 0.75} text={glyph} font={font} color={color} />;
  }

  // Draw sticker shapes
  const stickerScale = size / 24;
  const ox = (widthPx - size) / 2;
  const oy = (heightPx - size) / 2;

  return (
    <Group transform={[{ translateX: ox }, { translateY: oy }, { scale: stickerScale }]}>
      {sticker?.shapes.map((s, idx) => {
        const stroke = 'f' in s && s.f === 0;
        const sw = ('sw' in s && s.sw !== undefined) ? s.sw : 1.6;
        if (s.t === 'c') {
          return (
            <Circle
              key={`clip-${idx}`}
              cx={s.x}
              cy={s.y}
              r={s.r}
              color={color}
              style={stroke ? 'stroke' : 'fill'}
              strokeWidth={stroke ? sw : undefined}
            />
          );
        }
        if (s.t === 'r') {
          return (
            <Rect
              key={`clip-${idx}`}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              color={color}
              style={stroke ? 'stroke' : 'fill'}
              strokeWidth={stroke ? sw : undefined}
            />
          );
        }
        if (s.t === 'p') {
          const path = Skia.Path.MakeFromSVGString(s.d);
          if (!path) return null;
          return (
            <Path
              key={`clip-${idx}`}
              path={path}
              color={color}
              style={stroke ? 'stroke' : 'fill'}
              strokeWidth={stroke ? sw : undefined}
            />
          );
        }
        return null;
      })}
    </Group>
  );
});

/**
 * Signature element rendered via Skia Path.
 */
export const SkiaSignature = memo(function SkiaSignature({
  element,
  widthPx,
  heightPx,
}: {
  element: SignatureElementState;
  widthPx: number;
  heightPx: number;
}) {
  const color = inkColor(element.drawingColorIndex);
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    if (!element.strokes || element.strokes.length === 0) return p;
    for (const stroke of element.strokes) {
      if (stroke.points.length < 2) continue;
      p.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        p.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
    }
    return p;
  }, [element.strokes]);

  return <Path path={path} color={color} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" />;
});

/**
 * Main Skia element router rendering any LabelElement type.
 */
export const SkiaElementView = memo(function SkiaElementView({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: LabelElement;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  switch (element.type) {
    case 'text':
      return <SkiaText element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />;
    case 'barcode':
      return (
        <SkiaBarcode
          encodeMode={element.encodeMode}
          content={element.content}
          widthPx={widthPx}
          heightPx={heightPx}
          drawingColorIndex={element.drawingColorIndex}
          antiColor={element.antiColor}
          textFlag={element.textFlag}
          fontSizePt={element.fontSize}
          fontFamily={element.fontFamily}
          bold={element.bold}
          scale={scale}
        />
      );
    case 'qrcode':
      return (
        <SkiaQRCode
          encodeMode={element.encodeMode}
          content={element.content}
          widthPx={widthPx}
          heightPx={heightPx}
          drawingColorIndex={element.drawingColorIndex}
          antiColor={element.antiColor}
          zoneSize={element.zoneSize}
        />
      );
    case 'shape':
      return (
        <SkiaShape
          figureShape={element.figureShape}
          widthPx={widthPx}
          heightPx={heightPx}
          lineWidth={element.lineWidth}
          roundRadius={element.roundRadius}
          fill={element.fill}
          fillColor={element.fillColor}
          drawingColorIndex={element.drawingColorIndex}
          scale={scale}
        />
      );
    case 'line':
      return (
        <SkiaLine
          widthPx={widthPx}
          heightPx={heightPx}
          drawingColorIndex={element.drawingColorIndex}
          lineStyle={element.lineStyle}
          lineWidth={element.height || 1}
          virtualInterval={element.virtualInterval}
          scale={scale}
        />
      );
    case 'table':
      return <SkiaTable element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />;
    case 'image':
      return (
        <SkiaImageElement
          uri={element.uri}
          widthPx={widthPx}
          heightPx={heightPx}
          flipH={element.flipH}
          flipV={element.flipV}
          antiColor={element.antiColor}
        />
      );
    case 'clipart':
      return <SkiaClipart element={element} widthPx={widthPx} heightPx={heightPx} />;
    case 'signature':
      return <SkiaSignature element={element} widthPx={widthPx} heightPx={heightPx} />;
    default:
      return null;
  }
});

/**
 * Native Skia vector Resize Handle per canvas.md §4.2 & Master Plan §1.2.
 * Teal circle (#54C8C8, 28px diameter) with native Skia vector Path arrows (↔ or ↕).
 * Supports both static numbers and Reanimated shared values without React re-renders.
 */
export const SkiaResizeHandle = memo(function SkiaResizeHandle({
  cx,
  cy,
  direction,
}: {
  cx: SharedValue<number> | number;
  cy: SharedValue<number> | number;
  direction: 'horizontal' | 'vertical';
}) {
  const RADIUS = 14; // 28px diameter
  const arrowPath =
    direction === 'horizontal'
      ? 'M -2 -4 L -6.5 0 L -2 4 Z M 2 -4 L 6.5 0 L 2 4 Z M -3 0 L 3 0'
      : 'M -4 -2 L 0 -6.5 L 4 -2 Z M -4 2 L 0 6.5 L 4 2 Z M 0 -3 L 0 3';

  const skPath = useMemo(() => Skia.Path.MakeFromSVGString(arrowPath), [arrowPath]);

  const transform = useDerivedValue(() => {
    const x = typeof cx === 'number' ? cx : cx.value;
    const y = typeof cy === 'number' ? cy : cy.value;
    return [{ translateX: x }, { translateY: y }];
  });

  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={RADIUS} color="#54C8C8" />
      {skPath && (
        <Path
          path={skPath}
          color="#FFFFFF"
          strokeWidth={2}
          strokeCap="round"
          strokeJoin="round"
        />
      )}
    </Group>
  );
});

/**
 * Native Skia Selection Overlay:
 * Dashed red/orange outline (#E8543C, intervals [6, 4], strokeWidth 1.5) +
 * middle-right width handle (↔) & bottom-middle height handle (↕).
 * Bound to Reanimated shared values to update on the GPU at 60/120 fps.
 */
export const SkiaSelectionOverlay = memo(function SkiaSelectionOverlay({
  widthPx,
  heightPx,
  curWidth,
  curHeight,
}: {
  widthPx: number;
  heightPx: number;
  curWidth?: SharedValue<number>;
  curHeight?: SharedValue<number>;
}) {
  const boxPath = useDerivedValue(() => {
    const w = curWidth ? curWidth.value : widthPx;
    const h = curHeight ? curHeight.value : heightPx;
    const p = Skia.Path.Make();
    p.addRect(Skia.XYWHRect(0, 0, Math.max(1, w), Math.max(1, h)));
    return p;
  });

  const rightHandleX = useDerivedValue(() => (curWidth ? curWidth.value : widthPx));
  const rightHandleY = useDerivedValue(() => (curHeight ? curHeight.value / 2 : heightPx / 2));

  const bottomHandleX = useDerivedValue(() => (curWidth ? curWidth.value / 2 : widthPx / 2));
  const bottomHandleY = useDerivedValue(() => (curHeight ? curHeight.value : heightPx));

  return (
    <Group>
      {/* Dashed red/orange bounding box outline per Master Plan §1.2 */}
      <Path
        path={boxPath}
        color="#E8543C"
        style="stroke"
        strokeWidth={1.5}
      >
        <DashPathEffect intervals={[6, 4]} />
      </Path>

      {/* Middle-right width handle (↔) */}
      <SkiaResizeHandle cx={rightHandleX} cy={rightHandleY} direction="horizontal" />

      {/* Bottom-middle height handle (↕) */}
      <SkiaResizeHandle cx={bottomHandleX} cy={bottomHandleY} direction="vertical" />
    </Group>
  );
});
