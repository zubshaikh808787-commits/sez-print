/**
 * Zoomable editing pad.
 * Two-finger pinch zooms around the pinch focal point. Two-finger pan moves a
 * zoomed artboard. One-finger pan is only used when nothing is selected so it
 * cannot steal element drag/resize. Fit (zoom = 1) clears pan.
 *
 * This is React Native Gesture Handler on iOS/Android — not a WKWebView. The
 * WebView `touch-action` / momentum-scroll issues from the brief do not apply;
 * `.shouldCancelWhenOutside(false)` keeps the pinch/pan from being cancelled
 * by a parent native scroll (Phase 7.2).
 */

import { formatViewZoomLabel } from '@/lib/label-geometry';
import {
  VIEW_ZOOM_MAX,
  VIEW_ZOOM_MIN,
  VIEW_ZOOM_STEP,
  clampViewZoom,
} from '@/lib/editor/view-transform';
import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const ZOOM_REPORT_MS = 80;

export type EditPadViewTransform = {
  zoom: number;
  panX: number;
  panY: number;
};

type ZoomableEditPadProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onViewTransformChange?: (view: EditPadViewTransform) => void;
  onViewportLayout?: (size: { width: number; height: number }) => void;
  onWindowOriginChange?: (origin: { x: number; y: number }) => void;
  minZoom?: number;
  maxZoom?: number;
  oneFingerPanEnabled?: boolean;
};

function panLimit(viewSize: number, zoom: number) {
  'worklet';
  return Math.max(24, (viewSize * Math.max(0, zoom - 1)) / 2 + 48);
}

export function ZoomableEditPad({
  children,
  style,
  zoom,
  onZoomChange,
  onViewTransformChange,
  onViewportLayout,
  onWindowOriginChange,
  minZoom = VIEW_ZOOM_MIN,
  maxZoom = VIEW_ZOOM_MAX,
  oneFingerPanEnabled = false,
}: ZoomableEditPadProps) {
  const zoomSv = useSharedValue(zoom);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchStartZoom = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);
  const pinchActive = useSharedValue(false);
  const minZoomSv = useSharedValue(minZoom);
  const maxZoomSv = useSharedValue(maxZoom);
  const viewW = useSharedValue(1);
  const viewH = useSharedValue(1);
  const lastZoomReportAt = useSharedValue(0);
  const rootRef = useRef<View>(null);

  useEffect(() => {
    minZoomSv.value = minZoom;
    maxZoomSv.value = maxZoom;
  }, [minZoom, maxZoom, minZoomSv, maxZoomSv]);

  const reportView = useCallback(
    (nextZoom: number, nextPanX: number, nextPanY: number) => {
      const z = clampViewZoom(Math.min(maxZoom, Math.max(minZoom, nextZoom)));
      const panCleared = z <= 1.01;
      const x = panCleared ? 0 : nextPanX;
      const y = panCleared ? 0 : nextPanY;
      onZoomChange(z);
      onViewTransformChange?.({ zoom: z, panX: x, panY: y });
    },
    [maxZoom, minZoom, onZoomChange, onViewTransformChange],
  );

  useEffect(() => {
    if (pinchActive.value) return;
    zoomSv.value = zoom;
    if (zoom <= 1.01) {
      panX.value = 0;
      panY.value = 0;
      onViewTransformChange?.({ zoom, panX: 0, panY: 0 });
    }
  }, [zoom, zoomSv, panX, panY, pinchActive, onViewTransformChange]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .shouldCancelWhenOutside(false)
        .onStart((e) => {
          'worklet';
          pinchActive.value = true;
          pinchStartZoom.value = zoomSv.value;
          panStartX.value = panX.value;
          panStartY.value = panY.value;
          pinchFocalX.value = e.focalX;
          pinchFocalY.value = e.focalY;
        })
        .onUpdate((e) => {
          'worklet';
          const next = Math.min(
            maxZoomSv.value,
            Math.max(minZoomSv.value, pinchStartZoom.value * e.scale),
          );
          const ratio = next / Math.max(0.01, pinchStartZoom.value);
          zoomSv.value = next;

          const cx = viewW.value / 2;
          const cy = viewH.value / 2;
          let x =
            panStartX.value +
            (e.focalX - pinchFocalX.value) +
            (pinchFocalX.value - cx) * (1 - ratio);
          let y =
            panStartY.value +
            (e.focalY - pinchFocalY.value) +
            (pinchFocalY.value - cy) * (1 - ratio);
          if (next <= 1.01) {
            x = 0;
            y = 0;
          } else {
            const limitX = panLimit(viewW.value, next);
            const limitY = panLimit(viewH.value, next);
            x = Math.min(limitX, Math.max(-limitX, x));
            y = Math.min(limitY, Math.max(-limitY, y));
          }
          panX.value = x;
          panY.value = y;

          const now = Date.now();
          if (now - lastZoomReportAt.value >= ZOOM_REPORT_MS) {
            lastZoomReportAt.value = now;
            runOnJS(reportView)(next, x, y);
          }
        })
        .onEnd(() => {
          'worklet';
          pinchActive.value = false;
          runOnJS(reportView)(zoomSv.value, panX.value, panY.value);
        }),
    [
      lastZoomReportAt,
      maxZoomSv,
      minZoomSv,
      panStartX,
      panStartY,
      panX,
      panY,
      pinchActive,
      pinchFocalX,
      pinchFocalY,
      pinchStartZoom,
      reportView,
      viewH,
      viewW,
      zoomSv,
    ],
  );

  const twoFingerPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .maxPointers(2)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          panStartX.value = panX.value;
          panStartY.value = panY.value;
        })
        .onUpdate((e) => {
          'worklet';
          if (pinchActive.value) return;
          if (zoomSv.value <= 1.01) {
            panX.value = 0;
            panY.value = 0;
            return;
          }
          const z = zoomSv.value;
          const limitX = panLimit(viewW.value, z);
          const limitY = panLimit(viewH.value, z);
          const x = Math.min(limitX, Math.max(-limitX, panStartX.value + e.translationX));
          const y = Math.min(limitY, Math.max(-limitY, panStartY.value + e.translationY));
          panX.value = x;
          panY.value = y;
          const now = Date.now();
          if (now - lastZoomReportAt.value >= ZOOM_REPORT_MS) {
            lastZoomReportAt.value = now;
            runOnJS(reportView)(z, x, y);
          }
        })
        .onEnd(() => {
          'worklet';
          runOnJS(reportView)(zoomSv.value, panX.value, panY.value);
        }),
    [lastZoomReportAt, panStartX, panStartY, panX, panY, pinchActive, reportView, viewH, viewW, zoomSv],
  );

  const oneFingerPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(oneFingerPanEnabled && zoom > 1.05)
        .minPointers(1)
        .maxPointers(1)
        .minDistance(12)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          panStartX.value = panX.value;
          panStartY.value = panY.value;
        })
        .onUpdate((e) => {
          'worklet';
          if (zoomSv.value <= 1.01) return;
          const z = zoomSv.value;
          const limitX = panLimit(viewW.value, z);
          const limitY = panLimit(viewH.value, z);
          const x = Math.min(limitX, Math.max(-limitX, panStartX.value + e.translationX));
          const y = Math.min(limitY, Math.max(-limitY, panStartY.value + e.translationY));
          panX.value = x;
          panY.value = y;
          const now = Date.now();
          if (now - lastZoomReportAt.value >= ZOOM_REPORT_MS) {
            lastZoomReportAt.value = now;
            runOnJS(reportView)(z, x, y);
          }
        })
        .onEnd(() => {
          'worklet';
          runOnJS(reportView)(zoomSv.value, panX.value, panY.value);
        }),
    [lastZoomReportAt, oneFingerPanEnabled, zoom, panStartX, panStartY, panX, panY, reportView, viewH, viewW, zoomSv],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, twoFingerPan, oneFingerPan),
    [oneFingerPan, pinch, twoFingerPan],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoomSv.value }],
  }));

  const setZoomAnimated = useCallback(
    (next: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, next));
      zoomSv.value = withTiming(clamped, { duration: 180 });
      let nextPanX = panX.value;
      let nextPanY = panY.value;
      if (clamped <= 1.01) {
        nextPanX = 0;
        nextPanY = 0;
        panX.value = withTiming(0, { duration: 180 });
        panY.value = withTiming(0, { duration: 180 });
      } else {
        const limitX = panLimit(viewW.value, clamped);
        const limitY = panLimit(viewH.value, clamped);
        nextPanX = Math.min(limitX, Math.max(-limitX, panX.value));
        nextPanY = Math.min(limitY, Math.max(-limitY, panY.value));
        panX.value = withTiming(nextPanX, { duration: 180 });
        panY.value = withTiming(nextPanY, { duration: 180 });
      }
      reportView(clamped, nextPanX, nextPanY);
    },
    [maxZoom, minZoom, reportView, zoomSv, panX, panY, viewW, viewH],
  );

  const zoomIn = () => setZoomAnimated(zoom * VIEW_ZOOM_STEP);
  const zoomOut = () => setZoomAnimated(zoom / VIEW_ZOOM_STEP);
  const zoomFit = () => setZoomAnimated(1);

  const zoomLabel = formatViewZoomLabel(zoom);

  return (
    <View
      ref={rootRef}
      style={[styles.root, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          viewW.value = width;
          viewH.value = height;
          onViewportLayout?.({ width, height });
          rootRef.current?.measureInWindow((x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) {
              onWindowOriginChange?.({ x, y });
            }
          });
        }
      }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.viewport, animatedStyle]} collapsable={false}>
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
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  viewport: {
    ...StyleSheet.absoluteFillObject,
  },
  controls: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14, 20, 28, 0.94)',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2C3642',
    elevation: 3,
    shadowColor: '#0B1016',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  ctrlBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C2430',
  },
  ctrlBtnDisabled: {
    opacity: 0.35,
  },
  ctrlGlyph: {
    color: '#E8EEF4',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: -1,
  },
  zoomBadge: {
    minWidth: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  zoomText: {
    color: '#5EEAD4',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.75,
  },
});
