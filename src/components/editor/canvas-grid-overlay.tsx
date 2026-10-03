import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  DEFAULT_GRID_COLOR,
  buildCanvasGridLines,
  gridSegmentsToPathD,
  shouldRenderCanvasGrid,
} from '@/lib/editor/canvas-grid';

type CanvasGridOverlayProps = {
  widthPx: number;
  heightPx: number;
  pxPerMM: number;
  spacingMm: number;
  visible: boolean;
};

export const CanvasGridOverlay = memo(function CanvasGridOverlay({
  widthPx,
  heightPx,
  pxPerMM,
  spacingMm,
  visible,
}: CanvasGridOverlayProps) {
  const stroke = DEFAULT_GRID_COLOR;
  const paths = useMemo(() => {
    const lines = buildCanvasGridLines({ widthPx, heightPx, pxPerMM, spacingMm });
    if (!lines) return null;
    const vertical = lines.vertical.map((x) => ({ x1: x, y1: 0, x2: x, y2: heightPx }));
    const horizontal = lines.horizontal.map((y) => ({ x1: 0, y1: y, x2: widthPx, y2: y }));
    return {
      vertical: gridSegmentsToPathD(vertical),
      horizontal: gridSegmentsToPathD(horizontal),
    };
  }, [widthPx, heightPx, pxPerMM, spacingMm]);

  const canRender = shouldRenderCanvasGrid(spacingMm, pxPerMM) && paths;
  if (!canRender) return null;

  const strokeWidth = StyleSheet.hairlineWidth;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { opacity: visible ? 1 : 0 }]}
      collapsable={false}>
      <Svg pointerEvents="none" width={widthPx} height={heightPx}>
        {paths.vertical ? (
          <Path d={paths.vertical} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        ) : null}
        {paths.horizontal ? (
          <Path d={paths.horizontal} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        ) : null}
      </Svg>
    </View>
  );
});
