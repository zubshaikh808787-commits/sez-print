import { useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Palette, Type } from '@/constants/ui';

const DRAG_START_PX = 10;

export function PaletteToolItem({
  icon,
  label,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  style,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  onDragStart: (windowX: number, windowY: number) => void;
  onDragMove: (windowX: number, windowY: number) => void;
  onDragEnd: (windowX: number, windowY: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const callbacksRef = useRef({ onPress, onDragStart, onDragMove, onDragEnd });
  callbacksRef.current = { onPress, onDragStart, onDragMove, onDragEnd };

  const gesture = useMemo(() => {
    const fireStart = (x: number, y: number) => callbacksRef.current.onDragStart(x, y);
    const fireMove = (x: number, y: number) => callbacksRef.current.onDragMove(x, y);
    const fireEnd = (x: number, y: number) => callbacksRef.current.onDragEnd(x, y);
    const firePress = () => callbacksRef.current.onPress();
    const pan = Gesture.Pan()
      .minDistance(DRAG_START_PX)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .onStart((e) => {
        runOnJS(fireStart)(e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        runOnJS(fireMove)(e.absoluteX, e.absoluteY);
      })
      .onFinalize((e) => {
        runOnJS(fireEnd)(e.absoluteX, e.absoluteY);
      });
    const tap = Gesture.Tap()
      .maxDistance(DRAG_START_PX)
      .onEnd((_e, success) => {
        if (success) runOnJS(firePress)();
      });
    return Gesture.Exclusive(pan, tap);
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.hit, style, Platform.OS === 'web' ? (webHitStyle as object) : null]}
        collapsable={false}>
        <AppIcon name={icon} tintColor={Palette.accent} size={26} />
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </View>
    </GestureDetector>
  );
}

const webHitStyle = {
  touchAction: 'none',
  userSelect: 'none',
} as const;

const styles = StyleSheet.create({
  hit: {
    alignItems: 'center',
    gap: 8,
  },
  label: {
    ...Type.action,
    color: Palette.ink,
  },
});
