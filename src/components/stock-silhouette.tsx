import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';

import type { LabelDocument } from '@/lib/label-document';
import { STOCK_YELLOW, stockSilhouetteSpec } from '@/lib/stock-silhouette';

type StockSilhouetteOverlayProps = {
  document: LabelDocument;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  printDpi?: number;
  widthPx: number;
  heightPx: number;
};

/** Keep the cut stroke inside the artboard so gallery and editor don't clip it. */
const PATH_INSET_MM = 0.42;

export function StockSilhouetteOverlay({
  document,
  scale = 1,
  scaleX,
  scaleY,
  widthPx,
  heightPx,
}: StockSilhouetteOverlayProps) {
  const spec = stockSilhouetteSpec(
    document.templatePreviewType,
    document.widthMm,
    document.heightMm,
    document.mediaGeometry,
  );
  if (!spec) return null;

  const sx = scaleX ?? scale;
  const sy = scaleY ?? scale;
  if (sx <= 0 || sy <= 0) return null;

  const w = Math.max(document.widthMm, 0.01);
  const h = Math.max(document.heightMm, 0.01);
  const innerW = Math.max(0.01, w - PATH_INSET_MM * 2);
  const innerH = Math.max(0.01, h - PATH_INSET_MM * 2);

  const holeD = spec.holes
    .map((hole) => {
      const r = hole.r;
      return `M ${hole.cx - r} ${hole.cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
    })
    .join(' ');
  const combined = `${spec.paths.join(' ')} ${holeD}`.trim();
  const strokePx = Math.max(1.2, spec.strokeMm * Math.min(sx, sy));
  const strokeMm = strokePx / sx;
  const isYellow = spec.fill === STOCK_YELLOW || spec.fill === '#F5DE14' || spec.fill === '#F4DE12';
  const foldStroke = spec.fill === '#E31B23' ? '#FFFFFF' : isYellow ? '#1A1A1A' : '#94A3B0';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg width={widthPx} height={heightPx}>
        <G
          transform={`translate(${PATH_INSET_MM * sx}, ${PATH_INSET_MM * sy}) scale(${(sx * innerW) / w}, ${(sy * innerH) / h})`}>
          <Path
            d={combined}
            fill={spec.fill}
            fillRule="evenodd"
            stroke={spec.stroke}
            strokeWidth={strokeMm}
            strokeLinejoin="round"
          />
          {spec.folds.map((fold, i) => (
            <Line
              key={`fold-${i}`}
              x1={fold.x1}
              y1={fold.y1}
              x2={fold.x2}
              y2={fold.y2}
              stroke={foldStroke}
              strokeWidth={strokeMm}
              strokeLinecap="butt"
              strokeDasharray={
                fold.dashed === false ? undefined : `${strokeMm * 3.6},${strokeMm * 2.4}`
              }
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}
