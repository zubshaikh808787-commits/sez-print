/**
 * Horizontal split handle between the label artboard and the bottom tools sheet.
 * Lean bar, 44px hit target, Gesture.Pan (Reanimated UI thread worklet).
 *
 * During active drag:
 * Updates `canvasHeightSv` directly on the UI thread worklet for 60/120fps live resize.
 * Zero React component re-renders on the JS thread during active dragging.
 *
 * On release:
 * Computes `resolveSplitRelease` on the UI thread and notifies `onDragEnd` to persist settled state.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Palette } from '@/constants/ui';
import {
  DIVIDER_BAR_THICKNESS_PX,
  DIVIDER_HIT_SIZE_PX,
  PANEL_MIN_HEIGHT_PX,
  canvasHeightAfterDrag,
  resolveSplitRelease,
  type SplitReleaseResult,
} from '@/lib/editor/canvas-split';

type CanvasPanelDividerProps = {
  canvasHeightPx: number;
  canvasHeightSv?: SharedValue<number>;
  isDraggingSv?: SharedValue<boolean>;
  viewportPx: number;
  panelMinPx?: number;
  onCanvasHeightChange?: (nextCanvasPx: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (result: SplitReleaseResult) => void;
};

export function CanvasPanelDivider({
  canvasHeightPx,
  canvasHeightSv,
  isDraggingSv,
  viewportPx,
  panelMinPx = PANEL_MIN_HEIGHT_PX,
  onCanvasHeightChange,
  onDragStart,
  onDragEnd,
}: CanvasPanelDividerProps) {
  const fallbackHeightSv = useSharedValue(canvasHeightPx);
  const activeHeightSv = canvasHeightSv ?? fallbackHeightSv;
  const startPxSv = useSharedValue(canvasHeightPx);
  const viewportPxSv = useSharedValue(viewportPx);
  const panelMinPxSv = useSharedValue(panelMinPx);

  useEffect(() => {
    viewportPxSv.value = viewportPx;
  }, [viewportPx, viewportPxSv]);

  useEffect(() => {
    panelMinPxSv.value = panelMinPx;
  }, [panelMinPx, panelMinPxSv]);

  const callbacksRef = useRef({ onDragStart, onDragEnd, onCanvasHeightChange });
  callbacksRef.current = { onDragStart, onDragEnd, onCanvasHeightChange };

  const fireDragStart = useCallback(() => {
    callbacksRef.current.onDragStart?.();
  }, []);

  const fireCanvasHeightChange = useCallback((nextPx: number) => {
    callbacksRef.current.onCanvasHeightChange?.(nextPx);
  }, []);

  const fireDragEnd = useCallback((result: SplitReleaseResult) => {
    callbacksRef.current.onDragEnd?.(result);
  }, []);

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(1)
      .activeOffsetY([-1, 1])
      .shouldCancelWhenOutside(false)
      .hitSlop({ top: 12, bottom: 12 })
      .onBegin(() => {
        'worklet';
        startPxSv.value = activeHeightSv.value;
        if (isDraggingSv) {
          isDraggingSv.value = true;
        }
        runOnJS(fireDragStart)();
      })
      .onUpdate((e) => {
        'worklet';
        const nextPx = canvasHeightAfterDrag({
          startCanvasPx: startPxSv.value,
          deltaY: e.translationY,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        activeHeightSv.value = nextPx;
        runOnJS(fireCanvasHeightChange)(nextPx);
      })
      .onEnd((e) => {
        'worklet';
        const rawFinalPx = canvasHeightAfterDrag({
          startCanvasPx: startPxSv.value,
          deltaY: e.translationY,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        const result = resolveSplitRelease({
          canvasPx: rawFinalPx,
          viewportPx: viewportPxSv.value,
          panelMinPx: panelMinPxSv.value,
        });
        activeHeightSv.value = result.canvasPx;
        if (isDraggingSv) {
          isDraggingSv.value = false;
        }
        runOnJS(fireDragEnd)(result);
      })
      .onFinalize(() => {
        'worklet';
        if (isDraggingSv) {
          isDraggingSv.value = false;
        }
      });
  }, [
    activeHeightSv,
    fireCanvasHeightChange,
    fireDragEnd,
    fireDragStart,
    isDraggingSv,
    panelMinPxSv,
    startPxSv,
    viewportPxSv,
  ]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        accessibilityRole="adjustable"
        accessibilityLabel="Resize canvas and editing panel"
        style={[styles.hit, Platform.OS === 'web' ? (webHandleStyle as object) : null]}>
        <View pointerEvents="none" style={styles.bar} />
      </Animated.View>
    </GestureDetector>
  );
}

const webHandleStyle = {
  touchAction: 'none',
  cursor: 'row-resize',
  userSelect: 'none',
} as const;

const styles = StyleSheet.create({
  hit: {
    height: DIVIDER_HIT_SIZE_PX,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.screen,
    zIndex: 10,
  },
  bar: {
    width: 44,
    height: DIVIDER_BAR_THICKNESS_PX,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
  },
});
