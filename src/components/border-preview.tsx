/**
 * Border chrome for the editor/print canvas.
 *
 * Stroke widths are in *screen/print pixels* (mm × scale), not fixed CSS px,
 * so preview and ViewShot stay aligned on circle and rectangle labels.
 *
 * Print capture (`forPrint`) draws inward frame bands in whole printer dots —
 * the same geometry as headless `drawPrintBorder` — so SVG centered strokes
 * cannot bleed to bitmap column 0.
 */
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useState } from 'react';
import Svg, { Ellipse, Rect } from 'react-native-svg';

import type { BorderStyleId } from '@/constants/border-library';
import {
  bandsToLayoutPx,
  borderFrameInsetsForElement,
  borderInsetDots,
  borderStrokeDots,
  borderStrokeFallbackMm,
  inwardFrameBandsInBox,
} from '@/printing/raster/border-frame';

export type BorderPreviewProps = {
  styleId: BorderStyleId;
  /** Pixels per millimetre (editor scale or printer dpm). */
  scale?: number;
  /** Stroke thickness in mm (from border element.lineWidth). */
  lineWidthMm?: number;
  /** Full-bleed circular / elliptical die — draw a ring, not a clipped rect. */
  circular?: boolean;
  widthPx?: number;
  heightPx?: number;
  /** Authoritative dot box from rectMmToDots (print capture only). */
  widthDots?: number;
  heightDots?: number;
  /** ViewShot capture at printer dpi — use inward bands, not centered SVG strokes. */
  forPrint?: boolean;
  printDpi?: number;
  /** The box is already the outer edge. Do not inset another 2 mm. */
  strokeFromOuterEdge?: boolean;
};

function strokePxFrom(lineWidthMm: number | undefined, scale: number, fallbackMm: number) {
  const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : fallbackMm;
  return Math.max(1, Math.round(mm * Math.max(scale, 1)));
}

function PrintFrameBands({
  widthPx,
  heightPx,
  widthDots: widthDotsProp,
  heightDots: heightDotsProp,
  printDpi,
  styleId,
  lineWidthMm,
  strokeFromOuterEdge,
}: {
  widthPx: number;
  heightPx: number;
  widthDots?: number;
  heightDots?: number;
  printDpi: number;
  styleId: BorderStyleId;
  lineWidthMm?: number;
  strokeFromOuterEdge?: boolean;
}) {
  const density = PixelRatio.get() || 1;
  const widthDots = widthDotsProp ?? Math.max(1, Math.round(widthPx * density));
  const heightDots = heightDotsProp ?? Math.max(1, Math.round(heightPx * density));
  const insets = borderFrameInsetsForElement(
    { geometryVersion: strokeFromOuterEdge ? 1 : undefined },
    printDpi,
  );
  const bands = inwardFrameBandsInBox(widthDots, heightDots, printDpi, lineWidthMm, styleId, insets);
  const layoutBands = bandsToLayoutPx(bands, density);
  return (
    <View style={styles.fill}>
      {layoutBands.map((band, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: band.left,
            top: band.top,
            width: band.width,
            height: band.height,
            backgroundColor: '#111827',
          }}
        />
      ))}
    </View>
  );
}

function PrintCircularRing({
  widthPx,
  heightPx,
  printDpi,
  styleId,
  lineWidthMm,
  dashed,
  dotted,
  double,
  strokeFromOuterEdge,
}: {
  widthPx: number;
  heightPx: number;
  printDpi: number;
  styleId: BorderStyleId;
  lineWidthMm?: number;
  dashed?: boolean;
  dotted?: boolean;
  double?: boolean;
  strokeFromOuterEdge?: boolean;
}) {
  const density = PixelRatio.get() || 1;
  const insetDots = strokeFromOuterEdge ? 0 : borderInsetDots(printDpi);
  const strokeDots = borderStrokeDots(lineWidthMm, printDpi, borderStrokeFallbackMm(styleId));
  const inset = insetDots / density;
  const stroke = strokeDots / density;
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.max(stroke / 2, w / 2 - inset - stroke / 2);
  const ry = Math.max(stroke / 2, h / 2 - inset - stroke / 2);
  return (
    <Svg width={w} height={h}>
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        stroke="#111827"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={
          dashed ? `${stroke * 3},${stroke * 2}` : dotted ? `${stroke},${stroke * 1.5}` : undefined
        }
      />
      {double ? (
        <Ellipse
          cx={cx}
          cy={cy}
          rx={Math.max(stroke / 2, rx - stroke * 2)}
          ry={Math.max(stroke / 2, ry - stroke * 2)}
          stroke="#111827"
          strokeWidth={Math.max(1 / density, Math.round(strokeDots * 0.55) / density)}
          fill="none"
        />
      ) : null}
    </Svg>
  );
}

/** Solid / dashed / dotted / double frames that must stay inside the label. */
function FrameRing({
  widthPx,
  heightPx,
  strokePx,
  circular,
  dashed,
  dotted,
  double,
}: {
  widthPx: number;
  heightPx: number;
  strokePx: number;
  circular?: boolean;
  dashed?: boolean;
  dotted?: boolean;
  double?: boolean;
}) {
  const inset = strokePx / 2;
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  if (circular) {
    const rx = Math.max(1, w / 2 - inset);
    const ry = Math.max(1, h / 2 - inset);
    return (
      <Svg width={w} height={h}>
        <Ellipse
          cx={w / 2}
          cy={h / 2}
          rx={rx}
          ry={ry}
          stroke="#111827"
          strokeWidth={strokePx}
          fill="none"
          strokeDasharray={dashed ? `${strokePx * 3},${strokePx * 2}` : dotted ? `${strokePx},${strokePx * 1.5}` : undefined}
        />
        {double ? (
          <Ellipse
            cx={w / 2}
            cy={h / 2}
            rx={Math.max(1, rx - strokePx * 2)}
            ry={Math.max(1, ry - strokePx * 2)}
            stroke="#111827"
            strokeWidth={Math.max(1, Math.round(strokePx * 0.55))}
            fill="none"
          />
        ) : null}
      </Svg>
    );
  }

  const inner = Math.max(0, strokePx * 2.2);
  return (
    <Svg width={w} height={h}>
      <Rect
        x={inset}
        y={inset}
        width={Math.max(1, w - strokePx)}
        height={Math.max(1, h - strokePx)}
        rx={Math.min(2, strokePx)}
        stroke="#111827"
        strokeWidth={strokePx}
        fill="none"
        strokeDasharray={dashed ? `${strokePx * 3},${strokePx * 2}` : dotted ? `${strokePx},${strokePx * 1.5}` : undefined}
      />
      {double ? (
        <Rect
          x={inset + inner}
          y={inset + inner}
          width={Math.max(1, w - strokePx - inner * 2)}
          height={Math.max(1, h - strokePx - inner * 2)}
          stroke="#111827"
          strokeWidth={Math.max(1, Math.round(strokePx * 0.55))}
          fill="none"
        />
      ) : null}
    </Svg>
  );
}

export function BorderPreview({
  styleId,
  scale = 4,
  lineWidthMm,
  circular = false,
  widthPx,
  heightPx,
  widthDots,
  heightDots,
  forPrint = false,
  printDpi,
  strokeFromOuterEdge = false,
}: BorderPreviewProps) {
  const [layout, setLayout] = useState({ w: widthPx ?? 0, h: heightPx ?? 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    if (widthPx != null && heightPx != null) return;
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== layout.w || height !== layout.h)) {
      setLayout({ w: width, h: height });
    }
  };
  const w = widthPx ?? layout.w;
  const h = heightPx ?? layout.h;
  const printDpiResolved = forPrint && printDpi != null ? printDpi : null;

  const printRing = (opts: {
    dashed?: boolean;
    dotted?: boolean;
    double?: boolean;
  }) => {
    if (w < 1 || h < 1 || printDpiResolved == null) {
      return <View style={styles.fill} onLayout={onLayout} />;
    }
    if (circular) {
      return (
        <View style={styles.fill} onLayout={onLayout}>
          <PrintCircularRing
            widthPx={w}
            heightPx={h}
            printDpi={printDpiResolved}
            styleId={styleId}
            lineWidthMm={lineWidthMm}
            dashed={opts.dashed}
            dotted={opts.dotted}
            double={opts.double}
            strokeFromOuterEdge={strokeFromOuterEdge}
          />
        </View>
      );
    }
    return (
      <View style={styles.fill} onLayout={onLayout}>
        <PrintFrameBands
          widthPx={w}
          heightPx={h}
          widthDots={widthDots}
          heightDots={heightDots}
          printDpi={printDpiResolved}
          styleId={styleId}
          lineWidthMm={lineWidthMm}
          strokeFromOuterEdge={strokeFromOuterEdge}
        />
      </View>
    );
  };

  const ring = (opts: {
    strokeFallbackMm: number;
    dashed?: boolean;
    dotted?: boolean;
    double?: boolean;
  }) => {
    if (w < 1 || h < 1) {
      return <View style={styles.fill} onLayout={onLayout} />;
    }
    return (
      <View style={styles.fill} onLayout={onLayout}>
        <FrameRing
          widthPx={w}
          heightPx={h}
          strokePx={strokePxFrom(lineWidthMm, scale, opts.strokeFallbackMm)}
          circular={circular}
          dashed={opts.dashed}
          dotted={opts.dotted}
          double={opts.double}
        />
      </View>
    );
  };

  switch (styleId) {
    case 'solid-thin':
      return printDpiResolved != null ? printRing({}) : ring({ strokeFallbackMm: 0.35 });
    case 'solid-medium':
      return printDpiResolved != null ? printRing({}) : ring({ strokeFallbackMm: 0.55 });
    case 'solid-thick':
      return printDpiResolved != null ? printRing({}) : ring({ strokeFallbackMm: 0.9 });
    case 'dashed':
      return printDpiResolved != null ? printRing({ dashed: true }) : ring({ strokeFallbackMm: 0.5, dashed: true });
    case 'dotted':
      return printDpiResolved != null ? printRing({ dotted: true }) : ring({ strokeFallbackMm: 0.5, dotted: true });
    case 'double':
      return printDpiResolved != null ? printRing({ double: true }) : ring({ strokeFallbackMm: 0.55, double: true });
    case 'rounded':
    case 'pill-shape': {
      if (printDpiResolved != null) return printRing({});
      if (circular || w < 1 || h < 1) return ring({ strokeFallbackMm: 0.55 });
      const strokePx = strokePxFrom(lineWidthMm, scale, 0.55);
      const inset = strokePx / 2;
      const radius =
        styleId === 'pill-shape'
          ? Math.min(w, h) / 2
          : Math.max(strokePx * 2, Math.min(w, h) * 0.08);
      return (
        <View style={styles.fill} onLayout={onLayout}>
          <Svg width={w} height={h}>
            <Rect
              x={inset}
              y={inset}
              width={Math.max(1, w - strokePx)}
              height={Math.max(1, h - strokePx)}
              rx={radius}
              stroke="#111827"
              strokeWidth={strokePx}
              fill="none"
            />
          </Svg>
        </View>
      );
    }
    case 'label-frame': {
      if (printDpiResolved != null) return printRing({ double: true });
      if (circular) return ring({ strokeFallbackMm: 0.5, double: true });
      const strokePx = strokePxFrom(lineWidthMm, scale, 0.5);
      return (
        <View
          style={[styles.box, { borderWidth: strokePx, padding: Math.max(2, strokePx) }]}
          onLayout={onLayout}>
          <View style={[styles.labelFrameInner, { borderWidth: Math.max(1, Math.round(strokePx * 0.5)) }]} />
        </View>
      );
    }
    case 'corner-brackets': {
      if (printDpiResolved != null) return printRing({});
      const arm = Math.max(8, Math.round(scale * 2.2));
      const thick = strokePxFrom(lineWidthMm, scale, 0.7);
      return (
        <View style={styles.box} onLayout={onLayout}>
          <View style={[styles.bracket, styles.bracketTL, { width: arm, height: arm, borderTopWidth: thick, borderLeftWidth: thick }]} />
          <View style={[styles.bracket, styles.bracketTR, { width: arm, height: arm, borderTopWidth: thick, borderRightWidth: thick }]} />
          <View style={[styles.bracket, styles.bracketBL, { width: arm, height: arm, borderBottomWidth: thick, borderLeftWidth: thick }]} />
          <View style={[styles.bracket, styles.bracketBR, { width: arm, height: arm, borderBottomWidth: thick, borderRightWidth: thick }]} />
        </View>
      );
    }
    case 'crosshair': {
      if (printDpiResolved != null) return printRing({});
      const arm = Math.max(8, Math.round(scale * 2));
      const thick = strokePxFrom(lineWidthMm, scale, 0.45);
      return (
        <View style={styles.box} onLayout={onLayout}>
          <View style={[styles.crosshair, styles.crosshairTL, { width: arm, height: arm, borderTopWidth: thick, borderLeftWidth: thick }]} />
          <View style={[styles.crosshair, styles.crosshairTR, { width: arm, height: arm, borderTopWidth: thick, borderRightWidth: thick }]} />
          <View style={[styles.crosshair, styles.crosshairBL, { width: arm, height: arm, borderBottomWidth: thick, borderLeftWidth: thick }]} />
          <View style={[styles.crosshair, styles.crosshairBR, { width: arm, height: arm, borderBottomWidth: thick, borderRightWidth: thick }]} />
        </View>
      );
    }
    default:
      return printDpiResolved != null ? printRing({}) : ring({ strokeFallbackMm: 0.55 });
  }
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  box: {
    width: '100%',
    height: '100%',
    borderColor: '#111827',
    backgroundColor: 'transparent',
  },
  labelFrameInner: {
    flex: 1,
    borderColor: '#111827',
  },
  bracket: {
    position: 'absolute',
    borderColor: '#111827',
  },
  bracketTL: { top: 2, left: 2 },
  bracketTR: { top: 2, right: 2 },
  bracketBL: { bottom: 2, left: 2 },
  bracketBR: { bottom: 2, right: 2 },
  crosshair: {
    position: 'absolute',
    borderColor: '#111827',
  },
  crosshairTL: { top: 4, left: 4 },
  crosshairTR: { top: 4, right: 4 },
  crosshairBL: { bottom: 4, left: 4 },
  crosshairBR: { bottom: 4, right: 4 },
});
