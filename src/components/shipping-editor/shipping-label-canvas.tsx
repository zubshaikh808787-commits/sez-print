/**
 * Visual SVG Shipping Label Canvas.
 * Uses react-native-svg for crisp, vector-precise rendering at true mathematical scale.
 * Includes safe-zone overlay, grid/margin guides, drag handles, and font scaling safeguards.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  G,
  Line,
  Rect,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

import { generateCode128Vector } from '@/lib/shipping-editor/svg-barcode';
import {
  DEFAULT_SHIPPING_ORDER_DATA,
  LabelSizePreset,
  MM_PER_INCH,
  ShippingField,
  ShippingOrderData,
  ShippingTemplate,
  STANDARD_LABEL_SIZES,
} from '@/lib/shipping-editor/types';

type ShippingLabelCanvasProps = {
  template: ShippingTemplate;
  orderData?: ShippingOrderData;
  sizePreset?: LabelSizePreset;
  /** Width in screen DP to render the canvas */
  canvasWidthPx: number;
  /** Selected field ID for interactive editing */
  selectedFieldId?: string | null;
  onSelectField?: (fieldId: string) => void;
  showSafeZone?: boolean;
  showGrid?: boolean;
  showRulers?: boolean;
  /** When true, simulates 203 DPI thermal dot raster look */
  isDpiSimulation?: boolean;
};

export function ShippingLabelCanvas({
  template,
  orderData = DEFAULT_SHIPPING_ORDER_DATA,
  sizePreset = STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
  canvasWidthPx,
  selectedFieldId,
  onSelectField,
  showSafeZone = true,
  showGrid = false,
  showRulers = false,
  isDpiSimulation = false,
}: ShippingLabelCanvasProps) {
  const widthMm = template.customWidthMm || sizePreset.widthMm;
  const heightMm = template.customHeightMm || sizePreset.heightMm;
  const safeMarginMm = template.safeMarginMm || 2;

  // Aspect ratio scale
  const canvasHeightPx = Math.max(1, (canvasWidthPx * heightMm) / widthMm);

  // Safe margin in pixels
  const marginXPx = (safeMarginMm / widthMm) * canvasWidthPx;
  const marginYPx = (safeMarginMm / heightMm) * canvasHeightPx;

  return (
    <View
      style={[
        styles.container,
        {
          width: canvasWidthPx,
          height: canvasHeightPx,
        },
      ]}>
      <Svg
        width={canvasWidthPx}
        height={canvasHeightPx}
        viewBox={`0 0 ${canvasWidthPx} ${canvasHeightPx}`}>
        {/* Background */}
        <Rect
          x={0}
          y={0}
          width={canvasWidthPx}
          height={canvasHeightPx}
          fill="#FFFFFF"
        />

        {/* Grid overlay */}
        {showGrid && (
          <GridOverlay
            width={canvasWidthPx}
            height={canvasHeightPx}
            spacing={canvasWidthPx / 20}
          />
        )}

        {/* Safe Margin Boundary Overlay (2mm) */}
        {showSafeZone && (
          <Rect
            x={marginXPx}
            y={marginYPx}
            width={canvasWidthPx - marginXPx * 2}
            height={canvasHeightPx - marginYPx * 2}
            fill="none"
            stroke="#DC2626"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.65}
          />
        )}

        {/* Render Template Fields */}
        {template.fields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            orderData={orderData}
            canvasWidthPx={canvasWidthPx}
            canvasHeightPx={canvasHeightPx}
            isSelected={selectedFieldId === field.id}
            onSelect={() => onSelectField?.(field.id)}
          />
        ))}

        {/* Ruler guides */}
        {showRulers && (
          <RulerOverlay
            width={canvasWidthPx}
            height={canvasHeightPx}
            widthMm={widthMm}
            heightMm={heightMm}
          />
        )}
      </Svg>
    </View>
  );
}

function GridOverlay({ width, height, spacing }: { width: number; height: number; spacing: number }) {
  const lines: React.ReactNode[] = [];
  for (let x = spacing; x < width; x += spacing) {
    lines.push(
      <Line
        key={`vx-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="#E2E8F0"
        strokeWidth={0.75}
      />,
    );
  }
  for (let y = spacing; y < height; y += spacing) {
    lines.push(
      <Line
        key={`hy-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="#E2E8F0"
        strokeWidth={0.75}
      />,
    );
  }
  return <G opacity={0.7}>{lines}</G>;
}

function RulerOverlay({
  width,
  height,
  widthMm,
  heightMm,
}: {
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
}) {
  return (
    <G opacity={0.75}>
      <Rect x={0} y={0} width={width} height={14} fill="#F1F5F9" />
      <SvgText x={4} y={11} fontSize={9} fill="#64748B" fontWeight="600">
        0
      </SvgText>
      <SvgText x={width - 24} y={11} fontSize={9} fill="#64748B" fontWeight="600">
        {Math.round(widthMm)}mm
      </SvgText>
    </G>
  );
}

function FieldRenderer({
  field,
  orderData,
  canvasWidthPx,
  canvasHeightPx,
  isSelected,
  onSelect,
}: {
  field: ShippingField;
  orderData: ShippingOrderData;
  canvasWidthPx: number;
  canvasHeightPx: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const xPx = (field.x / 100) * canvasWidthPx;
  const yPx = (field.y / 100) * canvasHeightPx;
  const widthPx = (field.width / 100) * canvasWidthPx;
  const heightPx = (field.height / 100) * canvasHeightPx;

  return (
    <G onPress={onSelect}>
      {/* Field Content */}
      {renderFieldContent(field, orderData, xPx, yPx, widthPx, heightPx, canvasWidthPx, canvasHeightPx)}

      {/* Selected Field Drag & Selection Highlight */}
      {isSelected && (
        <G>
          <Rect
            x={xPx - 1}
            y={yPx - 1}
            width={widthPx + 2}
            height={heightPx + 2}
            fill="none"
            stroke="#2563EB"
            strokeWidth={1.5}
            strokeDasharray="3,2"
          />
          {/* 4 Corner handles */}
          <Rect x={xPx - 3} y={yPx - 3} width={6} height={6} fill="#2563EB" />
          <Rect x={xPx + widthPx - 3} y={yPx - 3} width={6} height={6} fill="#2563EB" />
          <Rect x={xPx - 3} y={yPx + heightPx - 3} width={6} height={6} fill="#2563EB" />
          <Rect x={xPx + widthPx - 3} y={yPx + heightPx - 3} width={6} height={6} fill="#2563EB" />
        </G>
      )}
    </G>
  );
}

function renderFieldContent(
  field: ShippingField,
  orderData: ShippingOrderData,
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
) {
  // Scale factor: normalizes 100mm canvas so 1 unit ≈ 1mm in printer dots or preview pixels
  const pxPerMm = Math.max(1, canvasWidthPx / 100);

  if (field.type === 'box') {
    const strokeWidth = Math.max(1.5, (field.lineWidth || 1.5) * pxPerMm * 0.45);
    const halfStroke = strokeWidth / 2;
    return (
      <Rect
        x={x + halfStroke}
        y={y + halfStroke}
        width={Math.max(1, width - strokeWidth)}
        height={Math.max(1, height - strokeWidth)}
        fill="none"
        stroke="#000000"
        strokeWidth={strokeWidth}
      />
    );
  }

  if (field.type === 'line') {
    const isVert = field.orientation === 'vertical';
    const strokeWidth = Math.max(1, (field.lineWidth || 1) * pxPerMm * 0.45);
    return (
      <Line
        x1={x}
        y1={y}
        x2={isVert ? x : x + width}
        y2={isVert ? y + height : y}
        stroke="#000000"
        strokeWidth={strokeWidth}
      />
    );
  }

  if (field.type === 'text-block') {
    const rawContent =
      field.customContent ||
      (field.dataKey ? (orderData as Record<string, string>)[field.dataKey] : '') ||
      field.label ||
      '';

    const lines = rawContent.split('\n');
    const hasLabelBadge = Boolean(field.label);

    // Auto-scaling font size with resolution responsiveness (no microscopic DP caps)
    const availableH = hasLabelBadge ? height * 0.78 : height;
    const lineCount = Math.max(1, lines.length);
    const maxLineLength = Math.max(...lines.map((l) => l.length), 1);

    const fromHeight = availableH / (lineCount * 1.32);
    const fromWidth = (width * 1.7) / maxLineLength;
    const maxIdealFont = Math.min(canvasHeightPx * 0.055, canvasWidthPx * 0.065);
    const minIdealFont = Math.max(8, pxPerMm * 1.8);
    const computedFontSize = Math.max(
      minIdealFont,
      Math.min(maxIdealFont, Math.min(fromHeight, fromWidth)),
    );

    const labelBadgeSize = Math.max(minIdealFont * 0.9, computedFontSize * 0.75);
    const isBold = field.bold !== false;

    let textAnchor: 'start' | 'middle' | 'end' = 'start';
    let textX = x + pxPerMm * 0.5;
    if (field.align === 'center') {
      textAnchor = 'middle';
      textX = x + width / 2;
    } else if (field.align === 'right') {
      textAnchor = 'end';
      textX = x + width - pxPerMm * 0.5;
    }

    return (
      <G>
        {/* Field badge label e.g. "FROM" or "SHIP TO" in solid black */}
        {hasLabelBadge && (
          <SvgText
            x={x + pxPerMm * 0.5}
            y={y + labelBadgeSize + pxPerMm * 0.3}
            fontSize={labelBadgeSize}
            fontWeight="700"
            fill="#000000"
            letterSpacing={0.5}>
            {field.label}
          </SvgText>
        )}

        {/* Text lines in solid black */}
        {lines.map((line, idx) => {
          const lineY =
            y +
            (hasLabelBadge ? labelBadgeSize + pxPerMm * 0.8 : pxPerMm * 0.4) +
            (idx + 1) * (computedFontSize * 1.25);

          return (
            <SvgText
              key={idx}
              x={textX}
              y={lineY}
              fontSize={computedFontSize}
              fontWeight={isBold ? '700' : '400'}
              fill="#000000"
              textAnchor={textAnchor}>
              {line}
            </SvgText>
          );
        })}
      </G>
    );
  }

  if (field.type === 'row') {
    let colLeft = x;
    const colWidths = field.columns.map((col) => (col.widthPct / 100) * width);

    const labelFontSize = Math.max(8, Math.min(height * 0.30, pxPerMm * 2.5));
    const valFontSize = Math.max(10, Math.min(height * 0.48, pxPerMm * 3.8));

    return (
      <G>
        {field.columns.map((col, idx) => {
          const colW = colWidths[idx];
          const currentLeft = colLeft;
          colLeft += colW;

          const colValue =
            col.customContent ||
            (col.dataKey ? (orderData as Record<string, string>)[col.dataKey] : '') ||
            '';

          return (
            <G key={col.id}>
              {/* Divider between columns */}
              {idx > 0 && (
                <Line
                  x1={currentLeft}
                  y1={y}
                  x2={currentLeft}
                  y2={y + height}
                  stroke="#000000"
                  strokeWidth={Math.max(1, pxPerMm * 0.35)}
                />
              )}

              {/* Column Label */}
              <SvgText
                x={currentLeft + colW / 2}
                y={y + labelFontSize + pxPerMm * 0.4}
                fontSize={labelFontSize}
                fontWeight="700"
                fill="#000000"
                textAnchor="middle">
                {col.label}
              </SvgText>

              {/* Column Value */}
              <SvgText
                x={currentLeft + colW / 2}
                y={y + height - pxPerMm * 0.5}
                fontSize={valFontSize}
                fontWeight="700"
                fill="#000000"
                textAnchor="middle">
                {colValue}
              </SvgText>
            </G>
          );
        })}
      </G>
    );
  }

  if (field.type === 'barcode') {
    const rawValue =
      field.customContent ||
      (field.dataKey ? (orderData as Record<string, string>)[field.dataKey] : '') ||
      'SAMPLE123456789';

    const vector = generateCode128Vector(
      rawValue,
      width,
      height,
      '#000000',
      field.showValueBelow !== false,
    );

    const showText = field.showValueBelow !== false;
    const textHeight = showText ? Math.max(10, Math.min(height * 0.22, pxPerMm * 3.5)) : 0;
    const barHeight = Math.max(6, height - textHeight - pxPerMm * 0.5);

    return (
      <G>
        {/* Centered Bars */}
        {vector.bars.map((bar, i) => (
          <Rect
            key={i}
            x={x + bar.x * width}
            y={y}
            width={Math.max(1, bar.width * width)}
            height={barHeight}
            fill="#000000"
          />
        ))}

        {/* Value below */}
        {showText && (
          <SvgText
            x={x + width / 2}
            y={y + height - pxPerMm * 0.2}
            fontSize={textHeight}
            fontWeight="700"
            fontFamily="monospace"
            fill="#000000"
            textAnchor="middle">
            {rawValue}
          </SvgText>
        )}
      </G>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
});
