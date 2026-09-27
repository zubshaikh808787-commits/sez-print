import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const ACCENT = '#48C3C7';

export function GrayThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const widthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setFromX = (x: number) => {
    const w = widthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    onChangeRef.current(Math.round(ratio * 255));
  };

  const gesture = useMemo(() => {
    const fire = (x: number) => setFromX(x);
    const pan = Gesture.Pan()
      .activeOffsetX([-2, 2])
      .failOffsetY([-16, 16])
      .onBegin((e) => {
        runOnJS(fire)(e.x);
      })
      .onUpdate((e) => {
        runOnJS(fire)(e.x);
      });
    const tap = Gesture.Tap().onEnd((e) => {
      runOnJS(fire)(e.x);
    });
    return Gesture.Exclusive(pan, tap);
  }, []);

  const ratio = Math.max(0, Math.min(1, value / 255));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.sliderBlock}
        onLayout={(event) => {
          widthRef.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        hitSlop={{ top: 12, bottom: 12 }}>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${ratio * 100}%` }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sliderBlock: {
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: ACCENT,
  },
});
