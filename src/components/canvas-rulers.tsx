import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const TICK = '#94A3B8';
const MAJOR = '#64748B';
const LABEL = '#475569';

export const RULER_SIZE = 20;

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
  // Always include the exact end mark so ruler length matches the canvas.
  if (items.length === 0 || Math.abs(items[items.length - 1].mm - lengthMm) > 0.01) {
    items.push({ mm: lengthMm, px: sizePx, major: true });
  }
  return items;
}

export function HorizontalRuler({
  widthPx,
  lengthMm,
}: {
  widthPx: number;
  lengthMm: number;
  /** @deprecated Ignored — ticks are derived from widthPx / lengthMm so they match the canvas. */
  pxPerMm?: number;
}) {
  const ticks = useMemo(() => ticksFor(lengthMm, widthPx), [lengthMm, widthPx]);
  return (
    <View style={[styles.hTrack, { width: widthPx }]}>
      {ticks.map((tick) => (
        <View
          key={`h-${tick.mm}`}
          style={[
            styles.hTick,
            {
              left: tick.px,
              height: tick.major ? 12 : 7,
              backgroundColor: tick.major ? MAJOR : TICK,
            },
          ]}
        />
      ))}
      {ticks
        .filter((t) => t.major)
        .map((tick) => (
          <Text
            key={`hl-${tick.mm}`}
            style={[
              styles.hLabel,
              {
                left: Math.min(tick.px + 2, Math.max(0, widthPx - 18)),
              },
            ]}>
            {Number.isInteger(tick.mm) ? tick.mm : tick.mm.toFixed(1)}
          </Text>
        ))}
    </View>
  );
}

export function VerticalRuler({
  heightPx,
  lengthMm,
}: {
  heightPx: number;
  lengthMm: number;
  /** @deprecated Ignored — ticks are derived from heightPx / lengthMm so they match the canvas. */
  pxPerMm?: number;
}) {
  const ticks = useMemo(() => ticksFor(lengthMm, heightPx), [lengthMm, heightPx]);
  return (
    <View style={[styles.vTrack, { height: heightPx }]}>
      {ticks.map((tick) => (
        <View
          key={`v-${tick.mm}`}
          style={[
            styles.vTick,
            {
              top: tick.px,
              width: tick.major ? 12 : 7,
              backgroundColor: tick.major ? MAJOR : TICK,
            },
          ]}
        />
      ))}
      {ticks
        .filter((t) => t.major)
        .map((tick) => (
          <Text
            key={`vl-${tick.mm}`}
            style={[
              styles.vLabel,
              {
                top: Math.min(tick.px + 2, Math.max(0, heightPx - 12)),
              },
            ]}>
            {Number.isInteger(tick.mm) ? tick.mm : tick.mm.toFixed(1)}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hTrack: {
    height: RULER_SIZE,
    backgroundColor: '#E8EEF4',
    overflow: 'hidden',
  },
  vTrack: {
    width: RULER_SIZE,
    backgroundColor: '#E8EEF4',
    overflow: 'hidden',
  },
  hTick: {
    position: 'absolute',
    top: 0,
    width: 1,
  },
  vTick: {
    position: 'absolute',
    left: 0,
    height: 1,
  },
  hLabel: {
    position: 'absolute',
    top: 8,
    fontSize: 8,
    color: LABEL,
  },
  vLabel: {
    position: 'absolute',
    left: 1,
    fontSize: 8,
    color: LABEL,
  },
});
