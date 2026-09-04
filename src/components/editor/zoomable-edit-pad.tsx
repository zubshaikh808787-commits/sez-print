/**
 * Zoomable editing pad.
 * Pinch/one-finger pan are intentionally NOT attached to the canvas — nested
 * GestureDetectors steal element tap/drag/resize on Android. Zoom with +/-.
 */

import { Palette } from '@/constants/ui';
import { ReactNode, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

type ZoomableEditPadProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** Kept for call-site compatibility; canvas gestures are owned by elements. */
  oneFingerPanEnabled?: boolean;
};

export function ZoomableEditPad({
  children,
  style,
  zoom,
  onZoomChange,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
}: ZoomableEditPadProps) {
  const zoomSv = useSharedValue(zoom);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);

  useEffect(() => {
    zoomSv.value = zoom;
    if (zoom <= 1.01) {
      panX.value = 0;
      panY.value = 0;
    }
  }, [zoom, zoomSv, panX, panY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoomSv.value }],
  }));

  const setZoomAnimated = useCallback(
    (next: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, next));
      zoomSv.value = withTiming(clamped, { duration: 180 });
      if (clamped <= 1.01) {
        panX.value = withTiming(0, { duration: 180 });
        panY.value = withTiming(0, { duration: 180 });
      }
      onZoomChange(clamped);
    },
    [maxZoom, minZoom, onZoomChange, zoomSv, panX, panY],
  );

  const zoomIn = () => setZoomAnimated(zoom * ZOOM_STEP);
  const zoomOut = () => setZoomAnimated(zoom / ZOOM_STEP);
  const zoomFit = () => setZoomAnimated(1);

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <View style={[styles.root, style]}>
      <Animated.View style={[styles.viewport, animatedStyle]} collapsable={false}>
        {children}
      </Animated.View>

      <View pointerEvents="box-none" style={styles.controls}>
        <Pressable
          onPress={zoomOut}
          disabled={zoom <= minZoom + 0.01}
          hitSlop={8}
          style={({ pressed }) => [
            styles.ctrlBtn,
            zoom <= minZoom + 0.01 && styles.ctrlBtnDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.ctrlGlyph}>−</Text>
        </Pressable>
        <Pressable
          onPress={zoomFit}
          hitSlop={6}
          style={({ pressed }) => [styles.zoomBadge, pressed && styles.pressed]}>
          <Text style={styles.zoomText}>{zoomLabel}</Text>
        </Pressable>
        <Pressable
          onPress={zoomIn}
          disabled={zoom >= maxZoom - 0.01}
          hitSlop={8}
          style={({ pressed }) => [
            styles.ctrlBtn,
            zoom >= maxZoom - 0.01 && styles.ctrlBtnDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.ctrlGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewport: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5DCE4',
    elevation: 3,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  ctrlBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  ctrlBtnDisabled: {
    opacity: 0.35,
  },
  ctrlGlyph: {
    color: Palette.ink,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: -1,
  },
  zoomBadge: {
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  zoomText: {
    color: Palette.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.75,
  },
});
