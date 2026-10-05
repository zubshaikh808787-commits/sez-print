import { memo, useMemo } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { dotsPerMm } from '@/lib/printer/print-spec';
import {
  PRINT_GRID_LINE_MM,
  gridRects,
  gridRectsToPath,
  printGridRectsDots,
  type GridRect,
} from '@/lib/print-grid';

/**
 * The printed grid, kept out of element boxes. With `printDpi` it is drawn in whole
 * printer dots (print capture), otherwise in screen pixels at the same mm positions.
 */
export const PrintGridLayer = memo(function PrintGridLayer({
  widthMm,
  heightMm,
  spacingMm,
  widthPx,
  heightPx,
  knockoutsMm,
  printDpi,
  shiftMm,
}: {
  widthMm: number;
  heightMm: number;
  spacingMm: number;
  widthPx: number;
  heightPx: number;
  knockoutsMm: GridRect[];
  printDpi?: number;
  shiftMm?: { x: number; y: number };
}) {
  const art = useMemo(() => {
    if (printDpi != null) {
      const dpm = dotsPerMm(printDpi);
      const rects = printGridRectsDots(widthMm, heightMm, spacingMm, printDpi, knockoutsMm);
      return {
        viewW: Math.max(1, Math.round(widthMm * dpm)),
        viewH: Math.max(1, Math.round(heightMm * dpm)),
        d: gridRectsToPath(rects, Math.round((shiftMm?.x ?? 0) * dpm), Math.round((shiftMm?.y ?? 0) * dpm)),
      };
    }
    const density = PixelRatio.get() || 1;
    const viewW = Math.max(1, Math.round(widthPx * density));
    const viewH = Math.max(1, Math.round(heightPx * density));
    const upm = viewW / Math.max(widthMm, 0.01);
    const holes = knockoutsMm.map((k) => {
      const left = Math.round(k.left * upm);
      const top = Math.round(k.top * upm);
      return {
        left,
        top,
        width: Math.round((k.left + k.width) * upm) - left,
        height: Math.round((k.top + k.height) * upm) - top,
      };
    });
    const rects = gridRects(widthMm, heightMm, spacingMm, upm, Math.round(PRINT_GRID_LINE_MM * upm), holes);
    return { viewW, viewH, d: gridRectsToPath(rects) };
  }, [widthMm, heightMm, spacingMm, widthPx, heightPx, knockoutsMm, printDpi, shiftMm?.x, shiftMm?.y]);

  if (!art.d) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg
        width={widthPx}
        height={heightPx}
        viewBox={`0 0 ${art.viewW} ${art.viewH}`}
        preserveAspectRatio="none">
        <Path d={art.d} fill="#111827" />
      </Svg>
    </View>
  );
});
