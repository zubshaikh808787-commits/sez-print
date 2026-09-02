/**
 * Play Store–style zoomable editing pad.
 * Pinch to zoom, two-finger pan, double-tap zoom, +/- controls, and fit reset.
 * Transform runs on the UI thread via Reanimated for smooth 60fps scaling.
 */

import { Palette } from '@/constants/ui';
import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;
const DOUBLE_TAP_ZOOM = 2;

type ZoomableEditPadProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Current interaction zoom (1 = fit). Used by parent for accurate element drag math. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** When false, one-finger pan is disabled so element drag stays primary. */
  oneFingerPanEnabled?: boolean;
};

export function ZoomableEditPad({
  children,
  style,
  zoom,
  onZoomChange,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  oneFingerPanEnabled = true,
}: ZoomableEditPadProps) {
  const zoomSv = useSharedValue(zoom);
  const savedZoom = useSharedValue(zoom);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  // Keep shared value in sync when parent resets zoom (e.g. label size change).
  useEffect(() => {
    if (Math.abs(zoomSv.value - zoom) > 0.001) {
      zoomSv.value = withTiming(zoom, { duration: 160 });
      savedZoom.value = zoom;
      if (zoom <= 1.01) {
        panX.value = withTiming(0, { duration: 160 });
        panY.value = withTiming(0, { duration: 160 });
        savedPanX.value = 0;
        savedPanY.value = 0;
      }
    }
  }, [zoom, zoomSv, savedZoom, panX, panY, savedPanX, savedPanY]);

  const publishZoom = useCallback(
    (next: number) => {
      onZoomChange(next);
    },
    [onZoomChange],
  );

  const clampZoom = (value: number) => {
    'worklet';
    return Math.min(maxZoom, Math.max(minZoom, value));
  };

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin((e) => {
          originX.value = e.focalX;
          originY.value = e.focalY;
        })
        .onUpdate((e) => {
          const next = clampZoom(savedZoom.value * e.scale);
          // Zoom toward focal point for natural “pinch here” feel.
          const scaleRatio = next / Math.max(savedZoom.value, 0.001);
          const focalDx = e.focalX - originX.value;
          const focalDy = e.focalY - originY.value;
          zoomSv.value = next;
          panX.value = savedPanX.value * scaleRatio + focalDx;
          panY.value = savedPanY.value * scaleRatio + focalDy;
        })
        .onEnd(() => {
          savedZoom.value = zoomSv.value;
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
          runOnJS(publishZoom)(zoomSv.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxZoom, minZoom, publishZoom],
  );

  // Two-finger pan never fights single-finger element drag.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .averageTouches(true)
        .onUpdate((e) => {
          panX.value = savedPanX.value + e.translationX;
          panY.value = savedPanY.value + e.translationY;
        })
        .onEnd(() => {
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const panWhenZoomed = useMemo(
    () =>
      Gesture.Pan()
        .enabled(oneFingerPanEnabled && zoom > 1.02)
        .minPointers(1)
        .maxPointers(1)
        .activeOffsetX([-16, 16])
        .activeOffsetY([-16, 16])
        .onUpdate((e) => {
          if (savedZoom.value <= 1.02) return;
          panX.value = savedPanX.value + e.translationX;
          panY.value = savedPanY.value + e.translationY;
        })
        .onEnd(() => {
          if (savedZoom.value <= 1.02) return;
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oneFingerPanEnabled, zoom],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(280)
        .onEnd((_e, success) => {
          if (!success) return;
          const target = savedZoom.value > 1.15 ? 1 : DOUBLE_TAP_ZOOM;
          const next = clampZoom(target);
          zoomSv.value = withTiming(next, { duration: 200 });
          savedZoom.value = next;
          if (next <= 1.01) {
            panX.value = withTiming(0, { duration: 200 });
            panY.value = withTiming(0, { duration: 200 });
            savedPanX.value = 0;
            savedPanY.value = 0;
          }
          runOnJS(publishZoom)(next);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxZoom, minZoom, publishZoom],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, pan, panWhenZoomed, doubleTap),
    [pinch, pan, panWhenZoomed, doubleTap],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: zoomSv.value },
    ],
  }));

  const setZoomAnimated = useCallback(
    (next: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, next));
      zoomSv.value = withTiming(clamped, { duration: 180 });
      savedZoom.value = clamped;
      if (clamped <= 1.01) {
        panX.value = withTiming(0, { duration: 180 });
        panY.value = withTiming(0, { duration: 180 });
        savedPanX.value = 0;
        savedPanY.value = 0;
      }
      onZoomChange(clamped);
    },
    [maxZoom, minZoom, onZoomChange, zoomSv, savedZoom, panX, panY, savedPanX, savedPanY],
  );

  const zoomIn = () => setZoomAnimated(zoom * ZOOM_STEP);
  const zoomOut = () => setZoomAnimated(zoom / ZOOM_STEP);
  const zoomFit = () => setZoomAnimated(1);

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <View style={[styles.root, style]}>
      <GestureDetector gesture={composed}>
        <Animated.View
          style={[styles.viewport, animatedStyle]}
          collapsable={false}
          // Keep the transform on the GPU for smoother pinch/pan (Play Store feel).
          renderToHardwareTextureAndroid={Platform.OS === 'android'}
          shouldRasterizeIOS={false}>
          {children}
        </Animated.View>
      </GestureDetector>

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
