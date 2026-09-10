import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

export const RULER_SIZE = 28;

const TRACK = '#141B24';
const BEVEL = '#2C3642';
const GROOVE = '#0B1016';
const TICK_MINOR = '#6B7C8D';
const TICK_MID = '#A8B6C4';
const TICK_MAJOR = '#E8EEF4';
const TICK_END = '#5EEAD4';
const LABEL = '#D5DEE8';
const LABEL_END = '#5EEAD4';

type Tick = { mm: number; px: number; kind: 'minor' | 'mid' | 'major' };

function tickStepMm(lengthMm: number, sizePx: number) {
  const pxPerMm = sizePx / Math.max(lengthMm, 0.01);
  if (pxPerMm >= 6) return 0.5;
  if (pxPerMm >= 3) return 1;
  if (pxPerMm >= 1.6) return 2;
  return 5;
}

/**
 * Map mm → px with the canvas edge as the authoritative end.
 * Using (mm / lengthMm) * sizePx keeps the last tick exactly on the canvas edge
 * even after pixel rounding of widthPx/heightPx.
 */
function ticksFor(lengthMm: number, sizePx: number): Tick[] {
  const length = Math.max(lengthMm, 0.01);
  const step = tickStepMm(lengthMm, sizePx);
  const items: Tick[] = [];
  for (let mm = 0; mm <= lengthMm + 0.001; mm += step) {
    const px = (mm / length) * sizePx;
    if (px > sizePx + 0.5) break;
    const isEnd = mm < 0.001 || Math.abs(mm - lengthMm) < 0.01;
    const major10 = isEnd || Math.abs(mm % 10) < 0.001;
    const mid5 = !major10 && Math.abs(mm % 5) < 0.001;
    items.push({
      mm: Math.round(mm * 100) / 100,
      px,
      kind: major10 ? 'major' : mid5 ? 'mid' : 'minor',
    });
  }
  if (items.length === 0 || Math.abs(items[items.length - 1].mm - lengthMm) > 0.01) {
    items.push({ mm: lengthMm, px: sizePx, kind: 'major' });
  }
  return items;
}

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

/** Stable millimetre scale along the main canvas. Ticks align to the nested artboard. */
export function HorizontalRuler({
  trackWidthPx,
  originPx,
  contentWidthPx,
  lengthMm,
}: {
  trackWidthPx: number;
  originPx: number;
  contentWidthPx: number;
  lengthMm: number;
}) {
  const track = Math.max(1, trackWidthPx);
  const content = Math.max(1, contentWidthPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => ticksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 20), [ticks]);

  return (
    <View style={[styles.hTrack, { width: track }]}>
      <Svg width={track} height={RULER_SIZE} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={track} height={RULER_SIZE} fill={TRACK} />
        <Rect x={0} y={1} width={track} height={1} fill="#3A4654" opacity={0.85} />
        <Rect x={0} y={0} width={track} height={1} fill={BEVEL} />
        <Rect x={0} y={RULER_SIZE - 5} width={track} height={2} fill="#1C2430" />
        <Rect x={0} y={RULER_SIZE - 3} width={track} height={3} fill={GROOVE} />
        <Rect x={0} y={RULER_SIZE - 2} width={track} height={2} fill={TICK_END} opacity={0.88} />
        {ticks.map((tick) => {
          const x = origin + tick.px;
          const h = tickLen(tick.kind, 16, 11, 6);
          const end = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
          return (
            <Line
              key={`h-${tick.mm}`}
              x1={x}
              y1={0}
              x2={x}
              y2={h}
              stroke={end ? TICK_END : tick.kind === 'major' ? TICK_MAJOR : tick.kind === 'mid' ? TICK_MID : TICK_MINOR}
              strokeWidth={tick.kind === 'major' ? 1.25 : 1}
              strokeLinecap="square"
            />
          );
        })}
      </Svg>
      {labels.map((tick) => (
        <Text
          key={`hl-${tick.mm}`}
          style={[
            styles.hLabel,
            tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01 ? styles.endLabel : null,
            { left: Math.min(origin + tick.px + 3, Math.max(0, track - 22)) },
          ]}>
          {formatTick(tick.mm)}
        </Text>
      ))}
    </View>
  );
}

export function VerticalRuler({
  trackHeightPx,
  originPx,
  contentHeightPx,
  lengthMm,
}: {
  trackHeightPx: number;
  originPx: number;
  contentHeightPx: number;
  lengthMm: number;
}) {
  const track = Math.max(1, trackHeightPx);
  const content = Math.max(1, contentHeightPx);
  const origin = Math.max(0, originPx);
  const ticks = useMemo(() => ticksFor(lengthMm, content), [lengthMm, content]);
  const labels = useMemo(() => spacedMajor(ticks, 14), [ticks]);

  return (
    <View style={[styles.vTrack, { height: track }]}>
      <Svg width={RULER_SIZE} height={track} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={RULER_SIZE} height={track} fill={TRACK} />
        <Rect x={1} y={0} width={1} height={track} fill="#3A4654" opacity={0.85} />
        <Rect x={0} y={0} width={1} height={track} fill={BEVEL} />
        <Rect x={RULER_SIZE - 5} y={0} width={2} height={track} fill="#1C2430" />
        <Rect x={RULER_SIZE - 3} y={0} width={3} height={track} fill={GROOVE} />
        <Rect x={RULER_SIZE - 2} y={0} width={2} height={track} fill={TICK_END} opacity={0.88} />
        {ticks.map((tick) => {
          const y = origin + tick.px;
          const w = tickLen(tick.kind, 16, 11, 6);
          const end = tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01;
          return (
            <Line
              key={`v-${tick.mm}`}
              x1={0}
              y1={y}
              x2={w}
              y2={y}
              stroke={end ? TICK_END : tick.kind === 'major' ? TICK_MAJOR : tick.kind === 'mid' ? TICK_MID : TICK_MINOR}
              strokeWidth={tick.kind === 'major' ? 1.25 : 1}
              strokeLinecap="square"
            />
          );
        })}
      </Svg>
      {labels.map((tick) => (
        <Text
          key={`vl-${tick.mm}`}
          style={[
            styles.vLabel,
            tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01 ? styles.endLabel : null,
            { top: Math.min(origin + tick.px + 2, Math.max(0, track - 12)) },
          ]}>
          {formatTick(tick.mm)}
        </Text>
      ))}
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
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  vTrack: {
    width: RULER_SIZE,
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  hLabel: {
    position: 'absolute',
    top: 12,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.35,
    color: LABEL,
  },
  vLabel: {
    position: 'absolute',
    left: 1,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: LABEL,
  },
  endLabel: {
    color: LABEL_END,
  },
  corner: {
    width: RULER_SIZE,
    height: RULER_SIZE,
    backgroundColor: GROOVE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BEVEL,
  },
  cornerText: {
    color: TICK_END,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
