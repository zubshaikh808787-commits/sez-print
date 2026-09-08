import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';

import {
  CABLE_FLAG_DIECUT,
  cableFlagColumnCount,
  cableFlagColumnX,
  cableFlagOutlineMm,
  cableFlagPathD,
  isCableFlagDieCutDocument,
} from '@/constants/cable-flag-diecut';
import type { LabelDocument } from '@/lib/label-document';
import { dotsPerMm } from '@/lib/printer/print-spec';

type CableFlagDieCutOverlayProps = {
  document: LabelDocument;
  /** Uniform px/mm when printDpi is omitted. */
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  /** When set, vertices snap to the same printer-dot grid as TSPL. */
  printDpi?: number;
  widthPx: number;
  heightPx: number;
};

export function CableFlagDieCutOverlay({
  document,
  scale = 1,
  scaleX,
  scaleY,
  printDpi,
  widthPx,
  heightPx,
}: CableFlagDieCutOverlayProps) {
  if (!isCableFlagDieCutDocument(document)) return null;

  const sx = scaleX ?? scale;
  const sy = scaleY ?? scale;
  const dpm = printDpi != null ? dotsPerMm(printDpi) : null;
  const toX = (mm: number) => (dpm != null ? Math.round(mm * dpm) : mm * sx);
  const toY = (mm: number) => (dpm != null ? Math.round(mm * dpm) : mm * sy);
  const strokeMm = CABLE_FLAG_DIECUT.strokeMm;
  const stroke = Math.max(1, dpm != null ? strokeMm * dpm : strokeMm * sx);
  const insetMm = strokeMm / 2;
  const columns = cableFlagColumnCount(document.widthMm);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg width={widthPx} height={heightPx}>
        {Array.from({ length: columns }, (_, i) => {
          const originX = cableFlagColumnX(i);
          const fold = cableFlagOutlineMm(originX).fold;
          return (
            <G key={`flag-${i}`}>
              <Path
                d={cableFlagPathD(originX, toX, toY, insetMm)}
                fill="none"
                stroke="#94A3B8"
                strokeWidth={stroke}
                strokeLinejoin="round"
              />
              <Line
                x1={toX(fold.x)}
                y1={toY(fold.y0)}
                x2={toX(fold.x)}
                y2={toY(fold.y1)}
                stroke="#94A3B8"
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${stroke * 3},${stroke * 2}`}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
