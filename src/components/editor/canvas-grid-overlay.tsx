import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  DEFAULT_GRID_COLOR,
  buildCanvasGridLines,
  buildOccludedCanvasGridLines,
  gridSegmentsToPathD,
  shouldRenderCanvasGrid,
  type GridOccluderRectPx,
} from '@/lib/editor/canvas-grid';

type CanvasGridOverlayProps = {
  widthPx: number;
  heightPx: number;
  pxPerMM: number;
  spacingMm: number;
  visible: boolean;
  minSpacingPx?: number;
  strokeWidth?: number;
  occluders?: GridOccluderRectPx[];
};

export const CanvasGridOverlay = memo(function CanvasGridOverlay({
  widthPx,
  heightPx,
  pxPerMM,
  spacingMm,
  visible,
  minSpacingPx,
  strokeWidth: strokeWidthProp,
  occluders,
}: CanvasGridOverlayProps) {
  const stroke = DEFAULT_GRID_COLOR;
  const paths = useMemo(() => {
    if (occluders && occluders.length > 0) {
      const clipped = buildOccludedCanvasGridLines({
        widthPx,
        heightPx,
        pxPerMM,
        spacingMm,
        minSpacingPx,
        occluders,
      });
      if (!clipped) return null;
      return {
        vertical: gridSegmentsToPathD(clipped.vertical),
        horizontal: gridSegmentsToPathD(clipped.horizontal),
      };
    }
    const lines = buildCanvasGridLines({ widthPx, heightPx, pxPerMM, spacingMm, minSpacingPx });
    if (!lines) return null;
    const vertical = lines.vertical.map((x) => ({ x1: x, y1: 0, x2: x, y2: heightPx }));
    const horizontal = lines.horizontal.map((y) => ({ x1: 0, y1: y, x2: widthPx, y2: y }));
    return {
      vertical: gridSegmentsToPathD(vertical),
      horizontal: gridSegmentsToPathD(horizontal),
    };
  }, [widthPx, heightPx, pxPerMM, spacingMm, minSpacingPx, occluders]);

  const canRender =
    visible &&
    shouldRenderCanvasGrid(spacingMm, pxPerMM, minSpacingPx) &&
    paths != null &&
    (Boolean(paths.vertical) || Boolean(paths.horizontal));
  if (!canRender) return null;

  const strokeWidth = strokeWidthProp ?? 1;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject} collapsable={false}>
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
