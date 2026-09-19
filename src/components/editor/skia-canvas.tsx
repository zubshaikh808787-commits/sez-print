import React, { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Group,
  Line,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';

import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { elementSizeMm } from '@/lib/label-document';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { finiteMm, roundMm, type SnapGuide } from '@/lib/editor/engine';
import {
  SkiaElementView,
  SkiaSelectionOverlay,
} from '@/components/editor/skia-element-renderer';
import { StockSilhouetteOverlay } from '@/components/stock-silhouette';
import { CableFlagDieCutOverlay } from '@/components/cable-flag-outline';
import { isCableFlagDieCutDocument } from '@/constants/cable-flag-diecut';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry } from '@/lib/media-geometry';
import { type LiveRulerBounds } from '@/components/canvas-rulers';

export type SkiaTransformCommitPayload = {
  id: string;
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
};

export type SkiaTransformMovePayload = {
  id: string;
  leftMm: number;
  topMm: number;
};

export type SkiaCanvasProps = {
  document: LabelDocument;
  canvasWidthPx: number;
  canvasHeightPx: number;
  pxPerMM: number;
  padZoom: number;
  selectedIds: string[];
  selectionColor?: string;
  surfaceColor?: string;
  showGrid?: boolean;
  liveBounds?: LiveRulerBounds;
  onSelect: (id: string) => void;
  onDeselectAll: () => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformMove?: (payload: SkiaTransformMovePayload) => void;
  onTransformEnd: (payload: SkiaTransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  pointerToMm?: (windowX: number, windowY: number) => { x: number; y: number } | null;
  snapMoveMm?: (input: {
    id: string;
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
  }) => { leftMm: number; topMm: number };
  snapGuides?: SnapGuide[];
};

const HANDLE_HIT_SIZE = 44; // 44×44pt touch target per canvas.md §4.3
const MIN_ELEMENT_MM = 1;

export type ElementSharedState = {
  transX: SharedValue<number>;
  transY: SharedValue<number>;
  curWidth: SharedValue<number>;
  curHeight: SharedValue<number>;
  isInteracting: SharedValue<boolean>;
};

function getOrCreateElementSharedState(
  map: Map<string, ElementSharedState>,
  element: LabelElement,
  pxPerMM: number,
): ElementSharedState {
  let state = map.get(element.id);
  const sizeMm = elementSizeMm(element);
  const widthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMM));
  const heightPx = Math.max(1, mmToPx(sizeMm.height, pxPerMM));

  if (!state) {
    state = {
      transX: makeMutable(0),
      transY: makeMutable(0),
      curWidth: makeMutable(widthPx),
      curHeight: makeMutable(heightPx),
      isInteracting: makeMutable(false),
    };
    map.set(element.id, state);
  } else if (!state.isInteracting.value) {
    state.curWidth.value = widthPx;
    state.curHeight.value = heightPx;
  }
  return state;
}

/**
 * Single Skia Element Node that renders the visual element in Skia and binds its GPU transform
 * directly to Reanimated shared values for buttery 60fps/120fps live dragging and resizing.
 */
const SkiaElementNode = memo(function SkiaElementNode({
  element,
  pxPerMM,
  selected,
  sharedState,
}: {
  element: LabelElement;
  pxPerMM: number;
  selected: boolean;
  sharedState: ElementSharedState;
}) {
  const sizeMm = elementSizeMm(element);
  const leftPx = mmToPx(element.left, pxPerMM);
  const topPx = mmToPx(element.top, pxPerMM);
  const widthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMM));
  const heightPx = Math.max(1, mmToPx(sizeMm.height, pxPerMM));

  const { transX, transY, curWidth, curHeight } = sharedState;

  // Outer group handles translation and center-pivot rotation
  const outerTransform = useDerivedValue(() => {
    const rot = element.rotation ?? 0;
    const rad = (rot * Math.PI) / 180;
    if (!rot) {
      return [
        { translateX: leftPx + transX.value },
        { translateY: topPx + transY.value },
      ];
    }
    const cx = curWidth.value / 2;
    const cy = curHeight.value / 2;
    return [
      { translateX: leftPx + transX.value + cx },
      { translateY: topPx + transY.value + cy },
      { rotate: rad },
      { translateX: -cx },
      { translateY: -cy },
    ];
  });

  // Content group handles GPU live scaling during resize gestures (Option A)
  const contentTransform = useDerivedValue(() => [
    { scaleX: widthPx > 0 ? curWidth.value / widthPx : 1 },
    { scaleY: heightPx > 0 ? curHeight.value / heightPx : 1 },
  ]);

  return (
    <Group transform={outerTransform}>
      <Group transform={contentTransform}>
        <SkiaElementView
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={pxPerMM}
        />
      </Group>
      {selected && (
        <SkiaSelectionOverlay
          widthPx={widthPx}
          heightPx={heightPx}
          curWidth={curWidth}
          curHeight={curHeight}
        />
      )}
    </Group>
  );
});

/**
 * Gesture Overlay Node for an individual element.
 * Provides completely uninhibited, 1:1 pixel-exact, buttery smooth dragging without any
 * repulsive snapping, magnetic offset, or release jumping.
 */
const ElementGestureNode = memo(function ElementGestureNode({
  element,
  pxPerMM,
  padZoom,
  selected,
  canvasWidthMm,
  canvasHeightMm,
  liveBounds,
  onSelect,
  onEditText,
  onTransformStart,
  onTransformMove,
  onTransformEnd,
  sharedState,
}: {
  element: LabelElement;
  pxPerMM: number;
  padZoom: number;
  selected: boolean;
  canvasWidthMm: number;
  canvasHeightMm: number;
  liveBounds?: LiveRulerBounds;
  onSelect: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformMove?: (payload: SkiaTransformMovePayload) => void;
  onTransformEnd: (payload: SkiaTransformCommitPayload) => void;
  sharedState: ElementSharedState;
}) {
  const sizeMm = elementSizeMm(element);
  const leftPx = mmToPx(element.left, pxPerMM);
  const topPx = mmToPx(element.top, pxPerMM);
  const widthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMM));
  const heightPx = Math.max(1, mmToPx(sizeMm.height, pxPerMM));

  const { transX, transY, curWidth, curHeight, isInteracting } = sharedState;
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startWidth = useSharedValue(widthPx);
  const startHeight = useSharedValue(heightPx);

  const zoomSv = useSharedValue(padZoom || 1);

  useEffect(() => {
    zoomSv.value = padZoom || 1;
  }, [padZoom, zoomSv]);

  // Pure 1:1 Worklet Drag Gesture
  const dragGesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(0)
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        isInteracting.value = true;
        startX.value = transX.value;
        startY.value = transY.value;
        if (onTransformStart) {
          runOnJS(onTransformStart)(element.id);
        }
      })
      .onUpdate((e) => {
        'worklet';
        // Precise scale-aware finger translation: 1 finger px = 1 screen px / zoom
        const dx = e.translationX / zoomSv.value;
        const dy = e.translationY / zoomSv.value;

        const maxLeftPx = Math.max(0, mmToPx(canvasWidthMm - sizeMm.width, pxPerMM));
        const maxTopPx = Math.max(0, mmToPx(canvasHeightMm - sizeMm.height, pxPerMM));

        const targetLeftPx = leftPx + startX.value + dx;
        const targetTopPx = topPx + startY.value + dy;

        // Clamp cleanly inside the physical label bounds without any repulsive pull
        const clampedLeftPx = Math.max(0, Math.min(maxLeftPx, targetLeftPx));
        const clampedTopPx = Math.max(0, Math.min(maxTopPx, targetTopPx));

        transX.value = clampedLeftPx - leftPx;
        transY.value = clampedTopPx - topPx;

        if (liveBounds) {
          liveBounds.leftMm.value = pxToMm(clampedLeftPx, pxPerMM);
          liveBounds.topMm.value = pxToMm(clampedTopPx, pxPerMM);
          liveBounds.widthMm.value = sizeMm.width;
          liveBounds.heightMm.value = sizeMm.height;
          liveBounds.visible.value = true;
        }

        if (onTransformMove) {
          runOnJS(onTransformMove)({
            id: element.id,
            leftMm: pxToMm(clampedLeftPx, pxPerMM),
            topMm: pxToMm(clampedTopPx, pxPerMM),
          });
        }
      })
      .onEnd(() => {
        'worklet';
        const finalLeftPx = leftPx + transX.value;
        const finalTopPx = topPx + transY.value;
        const leftMm = Math.max(0, Math.min(canvasWidthMm - sizeMm.width, pxToMm(finalLeftPx, pxPerMM)));
        const topMm = Math.max(0, Math.min(canvasHeightMm - sizeMm.height, pxToMm(finalTopPx, pxPerMM)));

        isInteracting.value = false;

        // Sub-millimeter precision (3-4 decimals) eliminates rounding jump artifacts
        runOnJS(onTransformEnd)({
          id: element.id,
          leftMm: roundMm(leftMm, 4),
          topMm: roundMm(topMm, 4),
          widthMm: roundMm(sizeMm.width, 4),
          heightMm: roundMm(sizeMm.height, 4),
          rotation: element.rotation,
        });
      });
  }, [
    element.id,
    element.rotation,
    leftPx,
    topPx,
    sizeMm.width,
    sizeMm.height,
    canvasWidthMm,
    canvasHeightMm,
    pxPerMM,
    isInteracting,
    startX,
    startY,
    transX,
    transY,
    zoomSv,
    liveBounds,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
  ]);

  // Middle-Right Width Resize Handle Gesture
  const widthResizeGesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(0)
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        isInteracting.value = true;
        startWidth.value = curWidth.value;
        startHeight.value = curHeight.value;
        if (onTransformStart) {
          runOnJS(onTransformStart)(element.id);
        }
      })
      .onUpdate((e) => {
        'worklet';
        const isSquare = element.type === 'qrcode';
        const maxW = mmToPx(canvasWidthMm - element.left, pxPerMM);
        const maxH = mmToPx(canvasHeightMm - element.top, pxPerMM);
        const maxAllowed = isSquare ? Math.min(maxW, maxH) : maxW;
        const minAllowed = mmToPx(MIN_ELEMENT_MM, pxPerMM);

        const newW = Math.max(minAllowed, Math.min(maxAllowed, startWidth.value + e.translationX / zoomSv.value));
        curWidth.value = newW;
        if (isSquare) {
          curHeight.value = newW;
        }

        if (liveBounds) {
          liveBounds.leftMm.value = element.left;
          liveBounds.topMm.value = element.top;
          liveBounds.widthMm.value = pxToMm(newW, pxPerMM);
          liveBounds.heightMm.value = isSquare ? pxToMm(newW, pxPerMM) : sizeMm.height;
          liveBounds.visible.value = true;
        }
      })
      .onEnd(() => {
        'worklet';
        const isSquare = element.type === 'qrcode';
        const finalWidthMm = pxToMm(curWidth.value, pxPerMM);
        const finalHeightMm = isSquare ? finalWidthMm : sizeMm.height;
        isInteracting.value = false;

        runOnJS(onTransformEnd)({
          id: element.id,
          leftMm: roundMm(element.left, 4),
          topMm: roundMm(element.top, 4),
          widthMm: roundMm(finalWidthMm, 4),
          heightMm: roundMm(finalHeightMm, 4),
          rotation: element.rotation,
        });
      });
  }, [
    element.id,
    element.type,
    element.left,
    element.top,
    element.rotation,
    sizeMm.height,
    canvasWidthMm,
    canvasHeightMm,
    pxPerMM,
    isInteracting,
    startWidth,
    startHeight,
    curWidth,
    curHeight,
    zoomSv,
    liveBounds,
    onTransformStart,
    onTransformEnd,
  ]);

  // Bottom-Middle Height Resize Handle Gesture
  const heightResizeGesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(0)
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        isInteracting.value = true;
        startHeight.value = curHeight.value;
        startWidth.value = curWidth.value;
        if (onTransformStart) {
          runOnJS(onTransformStart)(element.id);
        }
      })
      .onUpdate((e) => {
        'worklet';
        const isSquare = element.type === 'qrcode';
        const maxW = mmToPx(canvasWidthMm - element.left, pxPerMM);
        const maxH = mmToPx(canvasHeightMm - element.top, pxPerMM);
        const maxAllowed = isSquare ? Math.min(maxW, maxH) : maxH;
        const minAllowed = mmToPx(MIN_ELEMENT_MM, pxPerMM);

        const newH = Math.max(minAllowed, Math.min(maxAllowed, startHeight.value + e.translationY / zoomSv.value));
        curHeight.value = newH;
        if (isSquare) {
          curWidth.value = newH;
        }

        if (liveBounds) {
          liveBounds.leftMm.value = element.left;
          liveBounds.topMm.value = element.top;
          liveBounds.widthMm.value = isSquare ? pxToMm(newH, pxPerMM) : sizeMm.width;
          liveBounds.heightMm.value = pxToMm(newH, pxPerMM);
          liveBounds.visible.value = true;
        }
      })
      .onEnd(() => {
        'worklet';
        const isSquare = element.type === 'qrcode';
        const finalHeightMm = pxToMm(curHeight.value, pxPerMM);
        const finalWidthMm = isSquare ? finalHeightMm : sizeMm.width;
        isInteracting.value = false;

        runOnJS(onTransformEnd)({
          id: element.id,
          leftMm: roundMm(element.left, 4),
          topMm: roundMm(element.top, 4),
          widthMm: roundMm(finalWidthMm, 4),
          heightMm: roundMm(finalHeightMm, 4),
          rotation: element.rotation,
        });
      });
  }, [
    element.id,
    element.type,
    element.left,
    element.top,
    element.rotation,
    sizeMm.width,
    canvasWidthMm,
    canvasHeightMm,
    pxPerMM,
    isInteracting,
    startHeight,
    startWidth,
    curHeight,
    curWidth,
    zoomSv,
    liveBounds,
    onTransformStart,
    onTransformEnd,
  ]);

  // Tap to select
  const tapSelectGesture = useMemo(() => {
    return Gesture.Tap()
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success) {
          runOnJS(onSelect)(element.id);
        }
      });
  }, [element.id, onSelect]);

  // Double tap to edit text
  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(350)
      .onEnd((_e, success) => {
        if (success && element.type === 'text') {
          runOnJS(onEditText)(element.id);
        }
      });
  }, [element.id, element.type, onEditText]);

  const combinedElementGesture = useMemo(() => {
    return Gesture.Race(dragGesture, doubleTapGesture, tapSelectGesture);
  }, [doubleTapGesture, dragGesture, tapSelectGesture]);

  const boxStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: leftPx + transX.value,
    top: topPx + transY.value,
    width: curWidth.value,
    height: curHeight.value,
    transform: [{ rotate: `${element.rotation ?? 0}deg` }],
  }));

  const rightHandleStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: leftPx + transX.value + curWidth.value - HANDLE_HIT_SIZE / 2,
    top: topPx + transY.value + curHeight.value / 2 - HANDLE_HIT_SIZE / 2,
    width: HANDLE_HIT_SIZE,
    height: HANDLE_HIT_SIZE,
  }));

  const bottomHandleStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: leftPx + transX.value + curWidth.value / 2 - HANDLE_HIT_SIZE / 2,
    top: topPx + transY.value + curHeight.value - HANDLE_HIT_SIZE / 2,
    width: HANDLE_HIT_SIZE,
    height: HANDLE_HIT_SIZE,
  }));

  return (
    <>
      <GestureDetector gesture={combinedElementGesture}>
        <Animated.View style={boxStyle} pointerEvents="box-only" />
      </GestureDetector>

      {selected && !element.lockMovement && (
        <>
          <GestureDetector gesture={widthResizeGesture}>
            <Animated.View style={rightHandleStyle} pointerEvents="box-only" />
          </GestureDetector>
          <GestureDetector gesture={heightResizeGesture}>
            <Animated.View style={bottomHandleStyle} pointerEvents="box-only" />
          </GestureDetector>
        </>
      )}
    </>
  );
});

/**
 * Full Native Skia Canvas for Label Designer.
 */
export const SkiaCanvas = forwardRef<ViewShot, SkiaCanvasProps>(function SkiaCanvas(
  {
    document: doc,
    canvasWidthPx,
    canvasHeightPx,
    pxPerMM,
    padZoom,
    selectedIds,
    selectionColor,
    surfaceColor,
    showGrid,
    liveBounds,
    onSelect,
    onDeselectAll,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
  },
  ref,
) {
  const w = Math.max(1, canvasWidthPx);
  const h = Math.max(1, canvasHeightPx);
  const canvasWidthMm = doc.widthMm;
  const canvasHeightMm = doc.heightMm;

  const sharedStatesRef = useRef<Map<string, ElementSharedState>>(new Map());

  // Clean up removed elements from shared state map
  useEffect(() => {
    const currentIds = new Set(doc.elements.map((el) => el.id));
    for (const id of sharedStatesRef.current.keys()) {
      if (!currentIds.has(id)) {
        sharedStatesRef.current.delete(id);
      }
    }
  }, [doc.elements]);

  // Background deselect tap gesture
  const deselectGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(2000)
        .onEnd((_e, success) => {
          if (success) runOnJS(onDeselectAll)();
        }),
    [onDeselectAll],
  );

  // Grid lines calculation
  const gridLines = useMemo(() => {
    if (!showGrid) return { v: [], h: [] };
    const stepMm = 5; // 5mm grid
    const stepPx = mmToPx(stepMm, pxPerMM);
    const v: number[] = [];
    const hArr: number[] = [];

    for (let x = stepPx; x < w; x += stepPx) v.push(x);
    for (let y = stepPx; y < h; y += stepPx) hArr.push(y);
    return { v, h: hArr };
  }, [showGrid, pxPerMM, w, h]);

  return (
    <View style={{ width: w, height: h, overflow: 'visible' }}>
      <ViewShot ref={ref} options={{ format: 'png', quality: 1 }} style={{ width: w, height: h }}>
        {/* Single Skia Canvas Root */}
        <Canvas style={{ width: w, height: h }}>
          {/* Label Background Rect */}
          <Rect x={0} y={0} width={w} height={h} color={surfaceColor || '#FFFFFF'} />

          {/* Optional Grid */}
          {showGrid && (
            <Group>
              {gridLines.v.map((x, i) => (
                <Line
                  key={`gv-${i}`}
                  p1={vec(x, 0)}
                  p2={vec(x, h)}
                  color="#E5E7EB"
                  strokeWidth={1}
                />
              ))}
              {gridLines.h.map((y, i) => (
                <Line
                  key={`gh-${i}`}
                  p1={vec(0, y)}
                  p2={vec(w, y)}
                  color="#E5E7EB"
                  strokeWidth={1}
                />
              ))}
            </Group>
          )}

          {/* Render All Elements in Skia with Live Reanimated Shared Values */}
          {doc.elements.map((element) => {
            const sharedState = getOrCreateElementSharedState(sharedStatesRef.current, element, pxPerMM);
            return (
              <SkiaElementNode
                key={element.id}
                element={element}
                pxPerMM={pxPerMM}
                selected={selectedIds.includes(element.id)}
                sharedState={sharedState}
              />
            );
          })}
        </Canvas>

        {/* Diecut / Silhouette Overlays */}
        {isCableFlagDieCutDocument(doc) && (
          <CableFlagDieCutOverlay
            document={doc}
            scaleX={pxPerMM}
            scaleY={pxPerMM}
            widthPx={w}
            heightPx={h}
          />
        )}
        {(hasStockSilhouette(doc.templatePreviewType) || isRatTailGeometry(doc.mediaGeometry)) && (
          <StockSilhouetteOverlay
            document={doc}
            scaleX={pxPerMM}
            scaleY={pxPerMM}
            widthPx={w}
            heightPx={h}
          />
        )}

        {/* Background Deselect Overlay */}
        <GestureDetector gesture={deselectGesture}>
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none" />
        </GestureDetector>

        {/* Interactive Gesture Hitbox Nodes */}
        {doc.elements.map((element) => {
          const sharedState = getOrCreateElementSharedState(sharedStatesRef.current, element, pxPerMM);
          return (
            <ElementGestureNode
              key={`gesture-${element.id}`}
              element={element}
              pxPerMM={pxPerMM}
              padZoom={padZoom}
              selected={selectedIds.includes(element.id)}
              canvasWidthMm={canvasWidthMm}
              canvasHeightMm={canvasHeightMm}
              liveBounds={liveBounds}
              onSelect={onSelect}
              onEditText={onEditText}
              onTransformStart={onTransformStart}
              onTransformMove={onTransformMove}
              onTransformEnd={onTransformEnd}
              sharedState={sharedState}
            />
          );
        })}
      </ViewShot>
    </View>
  );
});
