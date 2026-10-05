/**
 * Border chrome for the editor, gallery and print canvas.
 *
 * Every style is drawn from the same ink bands as headless `drawPrintBorder`
 * (`styledBorderBands`), so the shape on screen is the shape on paper.
 *
 * Print capture (`forPrint`) builds the bands in whole printer dots. The
 * editor builds them in physical screen pixels at `scale` px per mm.
 */
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';

import { resolveBorderStyle } from '@/constants/border-library';
import {
  borderFrameInsetsForElement,
  borderStrokeFallbackMm,
  inwardFrameBandsInBox,
  type BorderShape,
  type FrameBand,
} from '@/printing/raster/border-frame';
import { styledBorderBands } from '@/printing/raster/border-shapes';

export type BorderPreviewProps = {
  styleId: string;
  /** Layout pixels per millimetre (editor scale). */
  scale?: number;
  /** Stroke thickness in mm (from border element.lineWidth). */
  lineWidthMm?: number;
  /** Label die-cut. Circle and ellipse labels draw a ring. */
  shape?: BorderShape;
  widthPx?: number;
  heightPx?: number;
  /** Authoritative dot box from rectMmToDots (print capture only). */
  widthDots?: number;
  heightDots?: number;
  /** ViewShot capture at printer dpi — bands in whole printer dots. */
  forPrint?: boolean;
  printDpi?: number;
  /** The box is already the outer edge. Do not inset another 2 mm. */
  strokeFromOuterEdge?: boolean;
};

function bandsToPath(bands: FrameBand[]): string {
  let d = '';
  for (const b of bands) {
    if (b.width <= 0 || b.height <= 0) continue;
    d += `M${b.left} ${b.top}h${b.width}v${b.height}h${-b.width}z`;
  }
  return d;
}

export function BorderPreview({
  styleId,
  scale = 4,
  lineWidthMm,
  shape = 'rect',
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
  const density = PixelRatio.get() || 1;
  const printDpiResolved = forPrint && printDpi != null ? printDpi : null;
  const style = resolveBorderStyle(styleId);

  const art = useMemo(() => {
    if (w < 1 || h < 1) return null;
    if (printDpiResolved != null) {
      const bw = widthDots ?? Math.max(1, Math.round(w * density));
      const bh = heightDots ?? Math.max(1, Math.round(h * density));
      const insets = borderFrameInsetsForElement(
        { geometryVersion: strokeFromOuterEdge ? 1 : undefined },
        printDpiResolved,
      );
      const bands = inwardFrameBandsInBox(bw, bh, printDpiResolved, lineWidthMm, style, insets, shape);
      return { bw, bh, d: bandsToPath(bands) };
    }
    const bw = Math.max(1, Math.round(w * density));
    const bh = Math.max(1, Math.round(h * density));
    const unitsPerMm = Math.max(1, scale) * density;
    const mm = lineWidthMm != null && lineWidthMm > 0 ? lineWidthMm : borderStrokeFallbackMm(style);
    const bands = styledBorderBands({
      x: 0,
      y: 0,
      w: bw,
      h: bh,
      unitsPerMm,
      stroke: Math.max(1, Math.round(mm * unitsPerMm)),
      style,
      shape,
    });
    return { bw, bh, d: bandsToPath(bands) };
  }, [w, h, density, printDpiResolved, widthDots, heightDots, strokeFromOuterEdge, lineWidthMm, style, shape, scale]);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {art ? (
        <Svg width={w} height={h} viewBox={`0 0 ${art.bw} ${art.bh}`} preserveAspectRatio="none">
          <Path d={art.d} fill="#111827" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
});
