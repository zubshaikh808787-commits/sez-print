import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { rulerTicksFor, type RulerTick } from '@/lib/editor/ruler-ticks';
import { Palette } from '@/constants/ui';

export const RULER_SIZE = 28;

export type LiveRulerBounds = {
  leftMm: SharedValue<number>;
  topMm: SharedValue<number>;
  widthMm: SharedValue<number>;
  heightMm: SharedValue<number>;
  visible: SharedValue<boolean>;
};

const RULER_BG = '#F0F4F9';
const BRAND_BLUE = Palette.header; // #214668
const TICK_MINOR = '#C4CDD6';
const TICK_MID = '#A0AEC0';
const TICK_MAJOR = BRAND_BLUE;
const LABEL_COLOR = '#8A94A6';
const DIVIDER_COLOR = BRAND_BLUE;

type Tick = RulerTick;

function formatTick(mm: number) {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}

function spacedMajor(ticks: Tick[], minGapPx: number) {
  const majors = ticks.filter((t) => t.kind === 'major');
  const kept: Tick[] = [];
  for (const tick of majors) {
    const prev = kept[kept.length - 1];
    if (prev && Math.abs(tick.px - prev.px) < minGapPx) continue;
    kept.push(tick);
  }
  const last = majors[majors.length - 1];
  if (last && kept[kept.length - 1] !== last) {
    if (kept.length && Math.abs(last.px - kept[kept.length - 1].px) < minGapPx) {
      kept[kept.length - 1] = last;
    } else {
      kept.push(last);
    }
  }
  return kept;
}

function tickLen(kind: Tick['kind'], major: number, mid: number, minor: number) {
  if (kind === 'major') return major;
  if (kind === 'mid') return mid;
  return minor;
}

/** Stable millimetre scale along the main canvas. Ticks align flush to the nested artboard. */
export function HorizontalRuler({
  trackWidthPx,
  originPx,
  contentWidthPx,
  lengthMm,
  selectedRangeMm,
  liveBounds,
}: {
  trackWidthPx: number;
  originPx: number;
  contentWidthPx: number;
  lengthMm: number;
  selectedRangeMm?: { start: number; end: number } | null;
  liveBounds?: LiveRulerBounds;
}) {
  const track = Math.max(1, trackWidthPx);
  const content = Math.max(1, contentWidthPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => rulerTicksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 22), [ticks]);

  // Selected element projection on horizontal ruler (fallback for static prop)
  const selectionProjection = useMemo(() => {
    if (liveBounds || !selectedRangeMm || lengthMm <= 0) return null;
    const x1 = Math.max(0, Math.min(track, origin + (selectedRangeMm.start / lengthMm) * content));
    const x2 = Math.max(0, Math.min(track, origin + (selectedRangeMm.end / lengthMm) * content));
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    return { x1, x2, left, width };
  }, [liveBounds, selectedRangeMm, lengthMm, content, origin, track]);

  const animatedOverlayStyle = useAnimatedStyle(() => {
    if (!liveBounds || !liveBounds.visible.value || lengthMm <= 0) {
      return { opacity: 0 };
    }
    const leftVal = liveBounds.leftMm.value;
    const widthVal = liveBounds.widthMm.value;
    const x1 = Math.max(0, Math.min(track, origin + (leftVal / lengthMm) * content));
    const x2 = Math.max(0, Math.min(track, origin + ((leftVal + widthVal) / lengthMm) * content));
    const left = Math.min(x1, x2);
    const width = Math.max(1, Math.abs(x2 - x1));
    return {
      opacity: 1,
      left,
      width,
    };
  }, [liveBounds, lengthMm, content, origin, track]);

  return (
    <View style={[styles.hTrack, { width: track }]}>
      <Svg width={track} height={RULER_SIZE} style={StyleSheet.absoluteFill}>
        {/* Light blue-grey background */}
        <Rect x={0} y={0} width={track} height={RULER_SIZE} fill={RULER_BG} />

        {/* Selected element projection band & edge indicators (static fallback) */}
        {selectionProjection && (
          <>
            <Rect
              x={selectionProjection.left}
              y={0}
              width={selectionProjection.width}
              height={RULER_SIZE - 1}
              fill={BRAND_BLUE}
              opacity={0.12}
            />
            <Line
              x1={selectionProjection.x1}
              y1={0}
              x2={selectionProjection.x1}
              y2={RULER_SIZE - 1}
              stroke={BRAND_BLUE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <Line
              x1={selectionProjection.x2}
              y1={0}
              x2={selectionProjection.x2}
              y2={RULER_SIZE - 1}
              stroke={BRAND_BLUE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          </>
        )}

        {/* Ticks: touching the bottom divider line at y = RULER_SIZE - 1 */}
        {ticks.map((tick) => {
          const x = origin + tick.px;
          const h = tickLen(tick.kind, 10, 7, 4);
          const end = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
          const isMajor = tick.kind === 'major' || end;
          const stroke = isMajor
            ? TICK_MAJOR
            : tick.kind === 'mid'
              ? TICK_MID
              : TICK_MINOR;
          return (
            <Line
              key={`h-${tick.mm}`}
              x1={x}
              y1={RULER_SIZE - 1 - h}
              x2={x}
              y2={RULER_SIZE - 1}
              stroke={stroke}
              strokeWidth={isMajor ? 1.25 : 1}
              strokeLinecap="square"
            />
          );
        })}

        {/* Thin 1px divider seam line in brand blue connecting ruler flush to canvas */}
        <Line
          x1={0}
          y1={RULER_SIZE - 0.5}
          x2={track}
          y2={RULER_SIZE - 0.5}
          stroke={DIVIDER_COLOR}
          strokeWidth={1}
        />
      </Svg>

      {/* Real-time Reanimated selection projection overlay */}
      {liveBounds && (
        <Animated.View
          style={[styles.hSelectionOverlay, animatedOverlayStyle]}
          pointerEvents="none"
        />
      )}

      {labels.map((tick) => {
        const isEnd = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
        return (
          <Text
            key={`hl-${tick.mm}`}
            style={[
              styles.hLabel,
              isEnd ? styles.endLabel : null,
              { left: Math.min(origin + tick.px + 2, Math.max(0, track - 22)) },
            ]}>
            {formatTick(tick.mm)}
          </Text>
        );
      })}
    </View>
  );
}

export function VerticalRuler({
  trackHeightPx,
  originPx,
  contentHeightPx,
  lengthMm,
  selectedRangeMm,
  liveBounds,
}: {
  trackHeightPx: number;
  originPx: number;
  contentHeightPx: number;
  lengthMm: number;
  selectedRangeMm?: { start: number; end: number } | null;
  liveBounds?: LiveRulerBounds;
}) {
  const track = Math.max(1, trackHeightPx);
  const content = Math.max(1, contentHeightPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => rulerTicksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 16), [ticks]);

  // Selected element projection on vertical ruler (fallback for static prop)
  const selectionProjection = useMemo(() => {
    if (liveBounds || !selectedRangeMm || lengthMm <= 0) return null;
    const y1 = Math.max(0, Math.min(track, origin + (selectedRangeMm.start / lengthMm) * content));
    const y2 = Math.max(0, Math.min(track, origin + (selectedRangeMm.end / lengthMm) * content));
    const top = Math.min(y1, y2);
    const height = Math.max(1, Math.abs(y2 - y1));
    return { y1, y2, top, height };
  }, [liveBounds, selectedRangeMm, lengthMm, content, origin, track]);

  const animatedOverlayStyle = useAnimatedStyle(() => {
    if (!liveBounds || !liveBounds.visible.value || lengthMm <= 0) {
      return { opacity: 0 };
    }
    const topVal = liveBounds.topMm.value;
    const heightVal = liveBounds.heightMm.value;
    const y1 = Math.max(0, Math.min(track, origin + (topVal / lengthMm) * content));
    const y2 = Math.max(0, Math.min(track, origin + ((topVal + heightVal) / lengthMm) * content));
    const top = Math.min(y1, y2);
    const height = Math.max(1, Math.abs(y2 - y1));
    return {
      opacity: 1,
      top,
      height,
    };
  }, [liveBounds, lengthMm, content, origin, track]);

  return (
    <View style={[styles.vTrack, { height: track }]}>
      <Svg width={RULER_SIZE} height={track} style={StyleSheet.absoluteFill}>
        {/* Light blue-grey background */}
        <Rect x={0} y={0} width={RULER_SIZE} height={track} fill={RULER_BG} />

        {/* Selected element projection band & edge indicators (static fallback) */}
        {selectionProjection && (
          <>
            <Rect
              x={0}
              y={selectionProjection.top}
              width={RULER_SIZE - 1}
              height={selectionProjection.height}
              fill={BRAND_BLUE}
              opacity={0.12}
            />
            <Line
              x1={0}
              y1={selectionProjection.y1}
              x2={RULER_SIZE - 1}
              y2={selectionProjection.y1}
              stroke={BRAND_BLUE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <Line
              x1={0}
              y1={selectionProjection.y2}
              x2={RULER_SIZE - 1}
              y2={selectionProjection.y2}
              stroke={BRAND_BLUE}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          </>
        )}

        {/* Ticks: touching the right divider line at x = RULER_SIZE - 1 */}
        {ticks.map((tick) => {
          const y = origin + tick.px;
          const w = tickLen(tick.kind, 10, 7, 4);
          const end = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
          const isMajor = tick.kind === 'major' || end;
          const stroke = isMajor
            ? TICK_MAJOR
            : tick.kind === 'mid'
              ? TICK_MID
              : TICK_MINOR;
          return (
            <Line
              key={`v-${tick.mm}`}
              x1={RULER_SIZE - 1 - w}
              y1={y}
              x2={RULER_SIZE - 1}
              y2={y}
              stroke={stroke}
              strokeWidth={isMajor ? 1.25 : 1}
              strokeLinecap="square"
            />
          );
        })}

        {/* Thin 1px divider seam line in brand blue connecting ruler flush to canvas */}
        <Line
          x1={RULER_SIZE - 0.5}
          y1={0}
          x2={RULER_SIZE - 0.5}
          y2={track}
          stroke={DIVIDER_COLOR}
          strokeWidth={1}
        />
      </Svg>

      {/* Real-time Reanimated selection projection overlay */}
      {liveBounds && (
        <Animated.View
          style={[styles.vSelectionOverlay, animatedOverlayStyle]}
          pointerEvents="none"
        />
      )}

      {labels.map((tick) => {
        const isEnd = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
        return (
          <Text
            key={`vl-${tick.mm}`}
            style={[
              styles.vLabel,
              isEnd ? styles.endLabel : null,
              { top: Math.min(origin + tick.px + 2, Math.max(0, track - 12)) },
            ]}>
            {formatTick(tick.mm)}
          </Text>
        );
      })}
    </View>
  );
}

export function RulerCorner() {
  return (
    <View style={styles.corner}>
      <Text style={styles.cornerText}>mm</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hTrack: {
    height: RULER_SIZE,
    backgroundColor: RULER_BG,
    overflow: 'hidden',
  },
  vTrack: {
    width: RULER_SIZE,
    backgroundColor: RULER_BG,
    overflow: 'hidden',
  },
  hSelectionOverlay: {
    position: 'absolute',
    top: 0,
    height: RULER_SIZE - 1,
    backgroundColor: 'rgba(33, 70, 104, 0.12)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: BRAND_BLUE,
    borderRightColor: BRAND_BLUE,
  },
  vSelectionOverlay: {
    position: 'absolute',
    left: 0,
    width: RULER_SIZE - 1,
    backgroundColor: 'rgba(33, 70, 104, 0.12)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: BRAND_BLUE,
    borderBottomColor: BRAND_BLUE,
  },
  hLabel: {
    position: 'absolute',
    top: 3,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.1,
    color: LABEL_COLOR,
  },
  vLabel: {
    position: 'absolute',
    left: 2,
    fontSize: 7.5,
    fontWeight: '600',
    letterSpacing: 0.1,
    color: LABEL_COLOR,
  },
  endLabel: {
    color: BRAND_BLUE,
    fontWeight: '700',
  },
  corner: {
    width: RULER_SIZE,
    height: RULER_SIZE,
    backgroundColor: RULER_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: DIVIDER_COLOR,
  },
  cornerText: {
    color: BRAND_BLUE,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
});
