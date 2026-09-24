import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/ui';

const PRESETS = [
  { label: '0 (Off)', val: 0 },
  { label: '25', val: 25 },
  { label: '50', val: 50 },
  { label: '75', val: 75 },
  { label: '100 (Max)', val: 100 },
];

const THUMB_SIZE = 28;

export function PdfSharpnessTool({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  trackWidthRef.current = trackWidth;

  const startPctRef = useRef(value);

  const pct = Math.min(100, Math.max(0, value));

  const calculatePctFromX = useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= THUMB_SIZE) return 0;
    const travel = width - THUMB_SIZE;
    const clampedX = Math.min(width - THUMB_SIZE / 2, Math.max(THUMB_SIZE / 2, x));
    const ratio = (clampedX - THUMB_SIZE / 2) / travel;
    return Math.round(Math.min(100, Math.max(0, ratio * 100)));
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          const initialPct = calculatePctFromX(evt.nativeEvent.locationX);
          startPctRef.current = initialPct;
          onChange(initialPct);
        },
        onPanResponderMove: (_evt, gestureState) => {
          const width = trackWidthRef.current;
          if (width <= THUMB_SIZE) return;
          const travel = width - THUMB_SIZE;
          const deltaPct = (gestureState.dx / travel) * 100;
          const nextPct = Math.round(Math.min(100, Math.max(0, startPctRef.current + deltaPct)));
          onChange(nextPct);
        },
      }),
    [calculatePctFromX, onChange],
  );

  const travel = Math.max(1, trackWidth - THUMB_SIZE);
  const thumbLeft = (pct / 100) * travel;
  const fillWidth = thumbLeft + THUMB_SIZE / 2;

  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>
        Boosts barcode & text edge contrast. 0 preserves vector PDF text on export.
      </Text>

      <View style={styles.headerRow}>
        <Text style={styles.label}>Sharpness / Contrast</Text>
        <Text style={styles.value}>{pct}%</Text>
      </View>

      {/* Interactive Slider Row with Steppers */}
      <View style={styles.sliderRow}>
        <Pressable
          onPress={() => onChange(Math.max(0, pct - 5))}
          style={styles.stepBtn}
          hitSlop={8}
          accessibilityLabel="Decrease sharpness">
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>

        <View
          style={styles.sliderContainer}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTrackWidth(w);
            trackWidthRef.current = w;
          }}
          {...panResponder.panHandlers}>
          {/* Background Bar */}
          <View style={styles.trackBar} pointerEvents="none">
            {/* Active Fill Bar */}
            <View style={[styles.trackFill, { width: fillWidth }]} />
          </View>

          {/* Draggable Thumb Knob (Always 100% visible inside the container) */}
          <View
            style={[
              styles.thumb,
              { left: thumbLeft },
            ]}
            pointerEvents="none">
            <View style={styles.thumbCenterDot} />
          </View>
        </View>

        <Pressable
          onPress={() => onChange(Math.min(100, pct + 5))}
          style={styles.stepBtn}
          hitSlop={8}
          accessibilityLabel="Increase sharpness">
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>

      {/* Preset Buttons */}
      <View style={styles.presetRow}>
        {PRESETS.map((p) => {
          const active = pct === p.val;
          return (
            <Pressable
              key={p.val}
              onPress={() => onChange(p.val)}
              style={[styles.presetBtn, active && styles.presetBtnActive]}>
              <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  help: { fontSize: 12, color: Palette.muted, lineHeight: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: Palette.ink },
  value: { fontSize: 15, fontWeight: '700', color: Palette.accent },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: Palette.actionText,
    lineHeight: 20,
  },
  sliderContainer: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.hairline,
    overflow: 'hidden',
    width: '100%',
  },
  trackFill: {
    height: '100%',
    backgroundColor: Palette.accent,
    borderRadius: 5,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  thumbCenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.accent,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 2,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: Palette.accent,
    backgroundColor: '#E7F7F9',
  },
  presetText: {
    fontSize: 11,
    fontWeight: '500',
    color: Palette.muted,
  },
  presetTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
});
