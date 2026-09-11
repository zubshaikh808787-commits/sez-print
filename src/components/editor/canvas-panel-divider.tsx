/**
 * Horizontal split handle between the label artboard and the bottom tools sheet.
 * Lean bar, 44px hit target, PanResponder (not HTML5 drag-and-drop).
 * Height reports are animation-frame throttled; snap-to-fullscreen happens on release.
 * iOS: `onPanResponderTerminationRequest` is false so sheet bounce cannot steal the drag (Phase 7.2).
 */

import { useRef } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';

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
  viewportPx: number;
  panelMinPx?: number;
  onCanvasHeightChange: (nextCanvasPx: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (result: SplitReleaseResult) => void;
};

export function CanvasPanelDivider({
  canvasHeightPx,
  viewportPx,
  panelMinPx = PANEL_MIN_HEIGHT_PX,
  onCanvasHeightChange,
  onDragStart,
  onDragEnd,
}: CanvasPanelDividerProps) {
  const startPx = useRef(canvasHeightPx);
  const raf = useRef<number | null>(null);
  const pendingPx = useRef<number | null>(null);
  const live = useRef({
    canvasHeightPx,
    viewportPx,
    panelMinPx,
    onCanvasHeightChange,
    onDragStart,
    onDragEnd,
  });
  live.current = {
    canvasHeightPx,
    viewportPx,
    panelMinPx,
    onCanvasHeightChange,
    onDragStart,
    onDragEnd,
  };

  const flushPending = () => {
    raf.current = null;
    const px = pendingPx.current;
    pendingPx.current = null;
    if (px != null) live.current.onCanvasHeightChange(px);
  };

  const queueHeight = (next: number) => {
    pendingPx.current = next;
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(flushPending);
  };

  const cancelRaf = () => {
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    pendingPx.current = null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        startPx.current = live.current.canvasHeightPx;
        live.current.onDragStart?.();
      },
      onPanResponderMove: (_event, gesture) => {
        queueHeight(
          canvasHeightAfterDrag({
            startCanvasPx: startPx.current,
            deltaY: gesture.dy,
            viewportPx: live.current.viewportPx,
            panelMinPx: live.current.panelMinPx,
          }),
        );
      },
      onPanResponderRelease: (_event, gesture) => {
        cancelRaf();
        const canvasPx = canvasHeightAfterDrag({
          startCanvasPx: startPx.current,
          deltaY: gesture.dy,
          viewportPx: live.current.viewportPx,
          panelMinPx: live.current.panelMinPx,
        });
        const result = resolveSplitRelease({
          canvasPx,
          viewportPx: live.current.viewportPx,
          panelMinPx: live.current.panelMinPx,
        });
        live.current.onCanvasHeightChange(result.canvasPx);
        live.current.onDragEnd?.(result);
      },
      onPanResponderTerminate: () => {
        cancelRaf();
        live.current.onDragEnd?.(
          resolveSplitRelease({
            canvasPx: live.current.canvasHeightPx,
            viewportPx: live.current.viewportPx,
            panelMinPx: live.current.panelMinPx,
          }),
        );
      },
    }),
  ).current;

  return (
    <View
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel="Resize canvas and editing panel"
      {...pan.panHandlers}
      style={[styles.hit, Platform.OS === 'web' ? (webHandleStyle as object) : null]}>
      <View pointerEvents="none" style={styles.bar} />
    </View>
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
    zIndex: 4,
  },
  bar: {
    width: 44,
    height: DIVIDER_BAR_THICKNESS_PX,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
  },
});
