import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/ui';

const MINOR = 'rgba(15, 118, 110, 0.28)';
const MAJOR = '#0F766E';
const ACCENT = Palette.accent;
const LABEL = '#134E4A';

export const RULER_SIZE = 26;

/**
 * Map mm → px with the canvas edge as the authoritative end.
 * Using (mm / lengthMm) * sizePx keeps the last tick exactly on the canvas edge
 * even after pixel rounding of widthPx/heightPx.
 */
function ticksFor(lengthMm: number, sizePx: number) {
  const length = Math.max(lengthMm, 0.01);
  const step = lengthMm <= 40 ? 1 : lengthMm <= 120 ? 2 : 5;
  const majorEvery = step === 1 ? 5 : 10;
  const items: { mm: number; px: number; major: boolean }[] = [];
  for (let mm = 0; mm <= lengthMm + 0.001; mm += step) {
    const px = (mm / length) * sizePx;
    if (px > sizePx + 0.5) break;
    items.push({
      mm,
      px,
      major: Math.abs(mm % majorEvery) < 0.001 || mm < 0.001,
    });
  }
  if (items.length === 0 || Math.abs(items[items.length - 1].mm - lengthMm) > 0.01) {
    items.push({ mm: lengthMm, px: sizePx, major: true });
  }
  return items;
}

function formatTick(mm: number) {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}

function spacedMajor(ticks: { mm: number; px: number; major: boolean }[], minGapPx: number) {
  const majors = ticks.filter((t) => t.major);
  const kept: typeof majors = [];
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
  const labels = useMemo(() => spacedMajor(ticks, 22), [ticks]);

  return (
    <View style={[styles.hTrack, { width: track }]}>
      <View style={styles.hAccent} />
      {ticks.map((tick) => (
        <View
          key={`h-${tick.mm}`}
          style={[
            styles.hTick,
            {
              left: origin + tick.px,
              height: tick.major ? 14 : 7,
              backgroundColor: tick.major ? MAJOR : MINOR,
              width: tick.major ? 1.5 : 1,
            },
          ]}
        />
      ))}
      {labels.map((tick) => (
        <Text
          key={`hl-${tick.mm}`}
          style={[
            styles.hLabel,
            tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01 ? styles.endLabel : null,
            {
              left: Math.min(origin + tick.px + 3, Math.max(0, track - 22)),
            },
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
  const labels = useMemo(() => spacedMajor(ticks, 16), [ticks]);

  return (
    <View style={[styles.vTrack, { height: track }]}>
      <View style={styles.vAccent} />
      {ticks.map((tick) => (
        <View
          key={`v-${tick.mm}`}
          style={[
            styles.vTick,
            {
              top: origin + tick.px,
              width: tick.major ? 14 : 7,
              backgroundColor: tick.major ? MAJOR : MINOR,
              height: tick.major ? 1.5 : 1,
            },
          ]}
        />
      ))}
      {labels.map((tick) => (
        <Text
          key={`vl-${tick.mm}`}
          style={[
            styles.vLabel,
            tick.mm < 0.001 || Math.abs(tick.mm - lengthMm) < 0.01 ? styles.endLabel : null,
            {
              top: Math.min(origin + tick.px + 2, Math.max(0, track - 12)),
            },
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
    backgroundColor: '#F3F7FB',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(23, 166, 184, 0.35)',
  },
  vTrack: {
    width: RULER_SIZE,
    backgroundColor: '#F3F7FB',
    overflow: 'hidden',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(23, 166, 184, 0.35)',
  },
  hAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: ACCENT,
    opacity: 0.85,
  },
  vAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 2,
    backgroundColor: ACCENT,
    opacity: 0.85,
  },
  hTick: {
    position: 'absolute',
    top: 0,
  },
  vTick: {
    position: 'absolute',
    left: 0,
  },
  hLabel: {
    position: 'absolute',
    top: 9,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: LABEL,
  },
  vLabel: {
    position: 'absolute',
    left: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.15,
    color: LABEL,
  },
  endLabel: {
    color: ACCENT,
  },
  corner: {
    width: RULER_SIZE,
    height: RULER_SIZE,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerText: {
    color: '#5EEAD4',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
