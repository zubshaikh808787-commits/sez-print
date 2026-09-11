import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { AppIcon } from '@/components/app-icon';
import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, type LabelElement } from '@/lib/label-document';
import { DIVIDER_HIT_SIZE_PX } from '@/lib/editor/canvas-split';
import { finiteMm, roundMm } from '@/lib/editor/engine';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { dropTopLeftMm, grabOffsetMm } from '@/lib/editor/view-transform';
import { createFrameThrottled } from '@/lib/editor/drag-layer';
import {
  aspectRatioOf,
  boundBoxMm,
  resizePolicyFor,
  type ResizeAnchor,
  type ResizeBehavior,
} from '@/lib/editor/resize-policy';
import {
  CHROME_HANDLE_COLOR,
  CHROME_STROKE_LIGHT,
  CHROME_STROKE_PX,
  DRAG_LIFT_OPACITY,
} from '@/lib/editor/canvas-chrome';

export type TransformCommitPayload = {
  id: string;
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
};

export type TransformMovePayload = {
  id: string;
  leftMm: number;
  topMm: number;
};

type KonvaTransformerProps = {
  element: LabelElement;
  pxPerMM: number;
  padZoom: number;
  selected: boolean;
  selectionColor: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  /** Window point → artboard mm. Drag commit goes through this, not raw px. */
  pointerToMm?: (windowX: number, windowY: number) => { x: number; y: number } | null;
  /** Magnetic snap for move-drag. Returns millimetre left/top. */
  snapMoveMm?: (input: {
    id: string;
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
  }) => { leftMm: number; topMm: number };
};

const EDGE_HIT_PX = DIVIDER_HIT_SIZE_PX;
const ROTATE_HANDLE_SIZE = 20;
const ROTATE_STEM = 22;
const HIT_TARGET_PX = 36;
const DOUBLE_TAP_MS = 350;
const TOOLTIP_MS = 80;

type HandlePosition = ResizeAnchor;

export const KonvaTransformer = memo(function KonvaTransformer({
  element,
  pxPerMM,
  padZoom,
  selected,
  selectionColor,
  canvasWidthMm,
  canvasHeightMm,
  onSelect,
  onOpenPanel,
  onEditText,
  onTransformStart,
  onTransformMove,
  onTransformEnd,
  onQuickRotate,
  pointerToMm,
  snapMoveMm,
}: KonvaTransformerProps) {
  const pxPerMMSafe = pxPerMM > 0 && Number.isFinite(pxPerMM) ? pxPerMM : 1;
  const sx = pxPerMMSafe;
  const sy = pxPerMMSafe;
  const sizeMm = elementSizeMm(element);
  const hidden = element.visible === false;
  const resizePolicy = resizePolicyFor(element);
  const aspectRatio = Math.max(1e-6, aspectRatioOf(element));

  const baseLeftPx = mmToPx(finiteMm(element.left), pxPerMMSafe);
  const baseTopPx = mmToPx(finiteMm(element.top), pxPerMMSafe);
  const baseWidthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMMSafe));
  const baseHeightPx = Math.max(element.type === 'line' ? 2 : 1, mmToPx(sizeMm.height, pxPerMMSafe));
  const minResizePx = Math.max(2, resizePolicy.minMm * pxPerMMSafe);
  const baseRotation = element.rotation ?? 0;

  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const snapDxPx = useSharedValue(0);
  const snapDyPx = useSharedValue(0);
  const originLeftSv = useSharedValue(baseLeftPx);
  const originTopSv = useSharedValue(baseTopPx);
  const padZoomSv = useSharedValue(padZoom > 0 ? padZoom : 1);
  const sizeWMmSv = useSharedValue(sizeMm.width);
  const sizeHMmSv = useSharedValue(sizeMm.height);
  const canvasWMmSv = useSharedValue(canvasWidthMm);
  const canvasHMmSv = useSharedValue(canvasHeightMm);
  const sxSv = useSharedValue(sx);
  const sySv = useSharedValue(sy);
  const animW = useSharedValue(baseWidthPx);
  const animH = useSharedValue(baseHeightPx);
  const animRot = useSharedValue<number>(baseRotation);
  const isInteracting = useSharedValue(false);
  const pendingCommit = useSharedValue(false);
  const liftSv = useSharedValue(1);
  const selectedSv = useSharedValue(selected);
  const [moving, setMoving] = React.useState(false);
  const [tooltipText, setTooltipText] = React.useState<string | null>(null);
  const lastTooltipAt = useRef(0);

  const committedRef = useRef<{
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
    rotation: number;
  } | null>(null);

  useEffect(() => {
    selectedSv.value = selected;
  }, [selected, selectedSv]);

  useEffect(() => {
    padZoomSv.value = padZoom > 0 ? padZoom : 1;
    sizeWMmSv.value = sizeMm.width;
    sizeHMmSv.value = sizeMm.height;
    canvasWMmSv.value = canvasWidthMm;
    canvasHMmSv.value = canvasHeightMm;
    sxSv.value = sx;
    sySv.value = sy;
  }, [
    padZoom,
    sizeMm.width,
    sizeMm.height,
    canvasWidthMm,
    canvasHeightMm,
    sx,
    sy,
    padZoomSv,
    sizeWMmSv,
    sizeHMmSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
  ]);

  useEffect(() => {
    if (committedRef.current) {
      const committed = committedRef.current;
      const posOk =
        Math.abs(element.left - committed.leftMm) <= 0.05 &&
        Math.abs(element.top - committed.topMm) <= 0.05;
      const sizeOk =
        Math.abs(sizeMm.width - committed.widthMm) <= 0.05 &&
        Math.abs(sizeMm.height - committed.heightMm) <= 0.05;
      const rotOk = Math.abs(((element.rotation ?? 0) % 360) - committed.rotation) <= 0.5;
      if (posOk && sizeOk && rotOk) {
        committedRef.current = null;
        transX.value = 0;
        transY.value = 0;
        snapDxPx.value = 0;
        snapDyPx.value = 0;
        originLeftSv.value = baseLeftPx;
        originTopSv.value = baseTopPx;
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
        animRot.value = baseRotation;
        isInteracting.value = false;
        pendingCommit.value = false;
        liftSv.value = 1;
      }
      return;
    }

    if (isInteracting.value) return;

    transX.value = 0;
    transY.value = 0;
    snapDxPx.value = 0;
    snapDyPx.value = 0;
    originLeftSv.value = baseLeftPx;
    originTopSv.value = baseTopPx;
    animW.value = baseWidthPx;
    animH.value = baseHeightPx;
    animRot.value = baseRotation;
    isInteracting.value = false;
    pendingCommit.value = false;
    liftSv.value = 1;
  }, [
    element.left,
    element.top,
    sizeMm.width,
    sizeMm.height,
    element.rotation,
    baseLeftPx,
    baseTopPx,
    baseWidthPx,
    baseHeightPx,
    baseRotation,
    transX,
    transY,
    snapDxPx,
    snapDyPx,
    originLeftSv,
    originTopSv,
    animW,
    animH,
    animRot,
    isInteracting,
    pendingCommit,
    liftSv,
  ]);

  const lastTapRef = useRef({ id: '', time: 0 });
  const callbacksRef = useRef({
    onSelect,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    selected,
  });
  callbacksRef.current = {
    onSelect,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    selected,
  };
  const pointerToMmRef = useRef(pointerToMm);
  pointerToMmRef.current = pointerToMm;
  const snapMoveMmRef = useRef(snapMoveMm);
  snapMoveMmRef.current = snapMoveMm;
  const elementBoxRef = useRef({
    left: finiteMm(element.left),
    top: finiteMm(element.top),
    width: sizeMm.width,
    height: sizeMm.height,
  });
  elementBoxRef.current = {
    left: finiteMm(element.left),
    top: finiteMm(element.top),
    width: sizeMm.width,
    height: sizeMm.height,
  };
  const resizeStartRef = useRef(elementBoxRef.current);
  const grabOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const emitMoveRef = useRef(onTransformMove);
  emitMoveRef.current = onTransformMove;
  const dragMovePump = useMemo(
    () =>
      createFrameThrottled<{ leftMm: number; topMm: number }>((pos) => {
        emitMoveRef.current?.({ id: element.id, leftMm: pos.leftMm, topMm: pos.topMm });
      }),
    [element.id],
  );
  useEffect(() => () => dragMovePump.cancel(), [dragMovePump]);

  /** Committed drag: moves position only. NEVER alters width, height, or fontSize. */
  const dispatchDragCommitMm = useCallback(
    (leftMm: number, topMm: number) => {
      setTooltipText(null);
      const widthMm = sizeMm.width;
      const heightMm = sizeMm.height;
      const next = dropTopLeftMm({
        pointerMm: { x: leftMm, y: topMm },
        grabOffsetMm: { x: 0, y: 0 },
        widthMm,
        heightMm,
        canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
      });
      const roundedLeft = next.left;
      const roundedTop = next.top;

      if (Math.abs(roundedLeft - element.left) < 0.005 && Math.abs(roundedTop - element.top) < 0.005) {
        committedRef.current = null;
        transX.value = 0;
        transY.value = 0;
        snapDxPx.value = 0;
        snapDyPx.value = 0;
        isInteracting.value = false;
        pendingCommit.value = false;
        liftSv.value = 1;
        setMoving(false);
        return;
      }

      committedRef.current = {
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        rotation: ((Math.round(baseRotation) % 360) + 360) % 360,
      };

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        rotation: ((Math.round(baseRotation) % 360) + 360) % 360,
      });
    },
    [sizeMm.width, sizeMm.height, canvasWidthMm, canvasHeightMm, element.id, element.left, element.top, baseRotation, transX, transY, isInteracting, pendingCommit, liftSv],
  );

  const captureDragGrab = useCallback((windowX: number, windowY: number) => {
    const pointerMm = pointerToMmRef.current?.(windowX, windowY);
    if (!pointerMm) {
      grabOffsetRef.current = null;
      return;
    }
    grabOffsetRef.current = grabOffsetMm(pointerMm, {
      x: elementBoxRef.current.left,
      y: elementBoxRef.current.top,
    });
  }, []);

  const applyMoveSnap = useCallback(
    (leftMm: number, topMm: number): { left: number; top: number } => {
      const snapped = snapMoveMmRef.current?.({
        id: element.id,
        leftMm,
        topMm,
        widthMm: elementBoxRef.current.width,
        heightMm: elementBoxRef.current.height,
      });
      const next = snapped ? { left: snapped.leftMm, top: snapped.topMm } : { left: leftMm, top: topMm };
      snapDxPx.value = mmToPx(next.left - leftMm, pxPerMMSafe);
      snapDyPx.value = mmToPx(next.top - topMm, pxPerMMSafe);
      return next;
    },
    [element.id, pxPerMMSafe, snapDxPx, snapDyPx],
  );

  const reportDragMove = useCallback(
    (windowX: number, windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      if (!emitMoveRef.current) return;
      const pointerMm = pointerToMmRef.current?.(windowX, windowY);
      const grab = grabOffsetRef.current;
      if (pointerMm && grab) {
        const next = dropTopLeftMm({
          pointerMm,
          grabOffsetMm: grab,
          widthMm: elementBoxRef.current.width,
          heightMm: elementBoxRef.current.height,
          canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        });
        const snapped = applyMoveSnap(next.left, next.top);
        dragMovePump.push({ leftMm: snapped.left, topMm: snapped.top });
        return;
      }
      snapDxPx.value = 0;
      snapDyPx.value = 0;
      dragMovePump.push({
        leftMm: pxToMm(fallbackLeftPx, pxPerMMSafe),
        topMm: pxToMm(fallbackTopPx, pxPerMMSafe),
      });
    },
    [applyMoveSnap, canvasWidthMm, canvasHeightMm, dragMovePump, pxPerMMSafe, snapDxPx, snapDyPx],
  );

  const commitDragFromPointer = useCallback(
    (windowX: number, windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      dragMovePump.cancel();
      const pointerMm = pointerToMmRef.current?.(windowX, windowY);
      const grab = grabOffsetRef.current;
      grabOffsetRef.current = null;
      if (pointerMm && grab) {
        const next = dropTopLeftMm({
          pointerMm,
          grabOffsetMm: grab,
          widthMm: elementBoxRef.current.width,
          heightMm: elementBoxRef.current.height,
          canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        });
        const snapped = applyMoveSnap(next.left, next.top);
        dispatchDragCommitMm(snapped.left, snapped.top);
        return;
      }
      snapDxPx.value = 0;
      snapDyPx.value = 0;
      dispatchDragCommitMm(pxToMm(fallbackLeftPx, pxPerMMSafe), pxToMm(fallbackTopPx, pxPerMMSafe));
    },
    [applyMoveSnap, canvasWidthMm, canvasHeightMm, dispatchDragCommitMm, dragMovePump, pxPerMMSafe, snapDxPx, snapDyPx],
  );

  const captureResizeStartFromPx = useCallback(
    (leftPx: number, topPx: number, wPx: number, hPx: number) => {
      resizeStartRef.current = {
        left: pxToMm(leftPx, pxPerMMSafe),
        top: pxToMm(topPx, pxPerMMSafe),
        width: pxToMm(wPx, pxPerMMSafe),
        height: pxToMm(hPx, pxPerMMSafe),
      };
    },
    [pxPerMMSafe],
  );

  /** Committed resize: millimetres via boundBoxMm, then written to the store. */
  const dispatchResizeCommit = useCallback(
    (handle: ResizeAnchor, nextWPx: number, nextHPx: number, rot: number) => {
      setTooltipText(null);
      const behavior = resizePolicy.behavior[handle];
      if (!behavior) return;
      const start = resizeStartRef.current;
      const next = boundBoxMm({
        anchor: handle,
        behavior,
        start,
        proposed: {
          width: pxToMm(nextWPx, pxPerMMSafe),
          height: pxToMm(nextHPx, pxPerMMSafe),
        },
        aspect: aspectRatioOf(element),
        minMm: resizePolicy.minMm,
        canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
      });

      let fontSize: number | undefined;
      if (element.type === 'text' || element.type === 'degrees' || element.type === 'time') {
        if ('fontSize' in element && typeof element.fontSize === 'number') {
          const oldH = Math.max(0.1, start.height);
          const ratio = next.height / oldH;
          fontSize = Math.max(3, Math.min(72, Math.round(element.fontSize * ratio * 2) / 2));
        }
      }

      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      committedRef.current = {
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: next.height,
        rotation,
      };

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: next.height,
        rotation,
        fontSize,
      });
    },
    [pxPerMMSafe, canvasWidthMm, canvasHeightMm, element, resizePolicy],
  );

  /** Committed rotate: alters rotation angle only. */
  const dispatchRotateCommit = useCallback(
    (rot: number) => {
      setTooltipText(null);
      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      committedRef.current = {
        leftMm: roundMm(element.left),
        topMm: roundMm(element.top),
        widthMm: roundMm(sizeMm.width),
        heightMm: roundMm(sizeMm.height),
        rotation,
      };
      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundMm(element.left),
        topMm: roundMm(element.top),
        widthMm: roundMm(sizeMm.width),
        heightMm: roundMm(sizeMm.height),
        rotation,
      });
    },
    [element.id, element.left, element.top, sizeMm.width, sizeMm.height],
  );

  const updateTooltipJS = useCallback(
    (wPx: number, hPx: number) => {
      const now = Date.now();
      if (now - lastTooltipAt.current < TOOLTIP_MS) return;
      lastTooltipAt.current = now;
      const wMm = pxToMm(wPx, pxPerMMSafe).toFixed(2);
      const hMm = pxToMm(hPx, pxPerMMSafe).toFixed(2);
      setTooltipText(`${wMm} × ${hMm} mm`);
    },
    [pxPerMMSafe],
  );

  const startTX = useSharedValue(0);
  const startTY = useSharedValue(0);
  const startW = useSharedValue(0);
  const startH = useSharedValue(0);
  const startRot = useSharedValue(0);
  const startAngle = useSharedValue(0);
  const startAbsX = useSharedValue(0);
  const startAbsY = useSharedValue(0);
  const setMoveLift = useCallback((on: boolean) => {
    setMoving(on);
  }, []);

  const bodyHitSlop = useMemo(() => {
    const target = selected ? HIT_TARGET_PX : 42;
    return {
      top: Math.max(12, (target - Math.max(1, baseHeightPx)) / 2),
      bottom: Math.max(12, (target - Math.max(1, baseHeightPx)) / 2),
      left: Math.max(12, (target - Math.max(1, baseWidthPx)) / 2),
      right: Math.max(12, (target - Math.max(1, baseWidthPx)) / 2),
    };
  }, [selected, baseHeightPx, baseWidthPx]);

  const bodyDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!element.lockMovement)
        .minDistance(2)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .hitSlop(bodyHitSlop)
        .onStart((e) => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;
          snapDxPx.value = 0;
          snapDyPx.value = 0;
          startTX.value = 0;
          startTY.value = 0;
          startAbsX.value = e.absoluteX;
          startAbsY.value = e.absoluteY;
          liftSv.value = DRAG_LIFT_OPACITY;
          runOnJS(setMoveLift)(true);
          if (!selectedSv.value) {
            runOnJS(callbacksRef.current.onSelect)(element.id);
          }
          if (callbacksRef.current.onTransformStart) {
            runOnJS(callbacksRef.current.onTransformStart)(element.id);
          }
          runOnJS(captureDragGrab)(e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
          const rawLeft = originLeftSv.value + startTX.value + (e.absoluteX - startAbsX.value) / z;
          const rawTop = originTopSv.value + startTY.value + (e.absoluteY - startAbsY.value) / z;

          const maxLeftPx = Math.max(0, (canvasWMmSv.value - sizeWMmSv.value) * sxSv.value);
          const maxTopPx = Math.max(0, (canvasHMmSv.value - sizeHMmSv.value) * sySv.value);

          const clampedLeft = Math.max(0, Math.min(maxLeftPx, rawLeft));
          const clampedTop = Math.max(0, Math.min(maxTopPx, rawTop));

          transX.value = clampedLeft - originLeftSv.value;
          transY.value = clampedTop - originTopSv.value;
          runOnJS(reportDragMove)(e.absoluteX, e.absoluteY, clampedLeft, clampedTop);
        })
        .onEnd((e) => {
          'worklet';
          pendingCommit.value = true;
          liftSv.value = 1;
          runOnJS(setMoveLift)(false);
          runOnJS(commitDragFromPointer)(
            e.absoluteX,
            e.absoluteY,
            originLeftSv.value + transX.value,
            originTopSv.value + transY.value,
          );
        }),
    [
      element.lockMovement,
      bodyHitSlop,
      captureDragGrab,
      commitDragFromPointer,
      reportDragMove,
      setMoveLift,
      element.id,
    ],
  );

  const handleSingleTap = useCallback(() => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble = last.id === element.id && now - last.time < DOUBLE_TAP_MS;
    lastTapRef.current = { id: element.id, time: now };

    callbacksRef.current.onSelect(element.id);

    if (isDouble) {
      if (element.type === 'text' || element.type === 'degrees') {
        callbacksRef.current.onEditText(element.id);
      } else {
        callbacksRef.current.onOpenPanel(element.id);
      }
    }
  }, [element.id, element.type]);

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(350)
        .maxDistance(16)
        .onEnd((_e, success) => {
          if (success) runOnJS(handleSingleTap)();
        }),
    [handleSingleTap],
  );

  const combinedBodyGesture = useMemo(
    () => Gesture.Exclusive(bodyDragGesture, tapGesture),
    [bodyDragGesture, tapGesture],
  );

  const createHandleGesture = useCallback(
    (handle: HandlePosition, behavior: ResizeBehavior) =>
      Gesture.Pan()
        .minDistance(1)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart((e) => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;
          startW.value = animW.value;
          startH.value = animH.value;
          startTX.value = 0;
          startTY.value = 0;
          startRot.value = animRot.value;
          startAbsX.value = e.absoluteX;
          startAbsY.value = e.absoluteY;
          runOnJS(captureResizeStartFromPx)(
            originLeftSv.value,
            originTopSv.value,
            startW.value,
            startH.value,
          );
          if (callbacksRef.current.onTransformStart) {
            runOnJS(callbacksRef.current.onTransformStart)(element.id);
          }
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoom > 0 ? padZoom : 1;
          const rad = (startRot.value * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const rawDx = (e.absoluteX - startAbsX.value) / z;
          const rawDy = (e.absoluteY - startAbsY.value) / z;
          const dx = rawDx * cos + rawDy * sin;
          const dy = -rawDx * sin + rawDy * cos;

          const originW = startW.value;
          const originH = startH.value;
          const originLeft = originLeftSv.value;
          const originTop = originTopSv.value;
          const canvasWPx = canvasWidthMm * sx;
          const canvasHPx = canvasHeightMm * sy;
          const proposedW = originW + (handle === 'e' ? dx : 0);
          const proposedH = originH + (handle === 's' ? dy : 0);

          let nw = originW;
          let nh = originH;
          if (behavior === 'square') {
            const driving = handle === 'e' ? proposedW : proposedH;
            const side = Math.min(Math.min(canvasWPx, canvasHPx), Math.max(minResizePx, driving));
            nw = side;
            nh = side;
          } else if (behavior === 'aspect') {
            if (handle === 'e') {
              nw = Math.min(canvasWPx, Math.max(minResizePx, proposedW));
              nh = nw / aspectRatio;
              if (nh > canvasHPx) {
                nh = canvasHPx;
                nw = nh * aspectRatio;
              }
            } else {
              nh = Math.min(canvasHPx, Math.max(minResizePx, proposedH));
              nw = nh * aspectRatio;
              if (nw > canvasWPx) {
                nw = canvasWPx;
                nh = nw / aspectRatio;
              }
            }
          } else if (behavior === 'width' && handle === 'e') {
            nw = Math.min(canvasWPx, Math.max(minResizePx, proposedW));
            nh = originH;
          } else if (behavior === 'height' && handle === 's') {
            nh = Math.min(canvasHPx, Math.max(minResizePx, proposedH));
            nw = originW;
          }

          if (behavior === 'aspect' || behavior === 'square') {
            const grow = Math.max(minResizePx / Math.max(nw, 1e-6), minResizePx / Math.max(nh, 1e-6));
            if (grow > 1) {
              nw *= grow;
              nh *= grow;
            }
            const shrink = Math.min(canvasWPx / Math.max(nw, 1e-6), canvasHPx / Math.max(nh, 1e-6));
            if (shrink < 1) {
              nw *= shrink;
              nh *= shrink;
            }
          }

          let left = originLeft;
          let top = originTop;
          if (handle === 'e') {
            left = originLeft;
            top = originTop + (originH - nh) / 2;
          } else {
            top = originTop;
            left = originLeft + (originW - nw) / 2;
          }
          left = Math.max(0, Math.min(Math.max(0, canvasWPx - nw), left));
          top = Math.max(0, Math.min(Math.max(0, canvasHPx - nh), top));

          animW.value = nw;
          animH.value = nh;
          transX.value = left - originLeftSv.value;
          transY.value = top - originTopSv.value;
          runOnJS(updateTooltipJS)(nw, nh);
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchResizeCommit)(handle, animW.value, animH.value, animRot.value);
        })
        .blocksExternalGesture(bodyDragGesture),
    [
      padZoom,
      originLeftSv,
      originTopSv,
      animW,
      animH,
      animRot,
      transX,
      transY,
      startW,
      startH,
      startTX,
      startTY,
      startRot,
      startAbsX,
      startAbsY,
      isInteracting,
      pendingCommit,
      element.id,
      dispatchResizeCommit,
      captureResizeStartFromPx,
      updateTooltipJS,
      minResizePx,
      aspectRatio,
      bodyDragGesture,
      canvasWidthMm,
      canvasHeightMm,
      sx,
      sy,
    ],
  );

  const handleGestures = useMemo(() => {
    const next: Partial<Record<ResizeAnchor, ReturnType<typeof Gesture.Pan>>> = {};
    for (const anchor of resizePolicy.anchors) {
      const behavior = resizePolicy.behavior[anchor];
      if (behavior) next[anchor] = createHandleGesture(anchor, behavior);
    }
    return next;
  }, [createHandleGesture, resizePolicy]);

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .maxPointers(1)
        .onStart((e) => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          startRot.value = animRot.value;
          startAbsX.value = e.absoluteX;
          startAbsY.value = e.absoluteY;
          const cy = animH.value / 2;
          startAngle.value = Math.atan2(-ROTATE_STEM - cy, 0);
          if (callbacksRef.current.onTransformStart) {
            runOnJS(callbacksRef.current.onTransformStart)(element.id);
          }
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoom > 0 ? padZoom : 1;
          const cx = animW.value / 2;
          const cy = animH.value / 2;
          const touchX = cx + (e.absoluteX - startAbsX.value) / z;
          const touchY = -ROTATE_STEM + (e.absoluteY - startAbsY.value) / z;
          const currentAngle = Math.atan2(touchY - cy, touchX - cx);
          let deg =
            startRot.value + ((currentAngle - startAngle.value) * 180) / Math.PI;
          deg = ((deg % 360) + 360) % 360;

          const snapThreshold = 4;
          for (const cardinal of [0, 90, 180, 270, 360]) {
            if (Math.abs(deg - cardinal) < snapThreshold || Math.abs(deg - cardinal + 360) < snapThreshold) {
              deg = cardinal % 360;
              break;
            }
          }
          animRot.value = Math.round(deg);
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchRotateCommit)(animRot.value);
        }),
    [
      padZoom,
      animW,
      animH,
      animRot,
      baseLeftPx,
      baseTopPx,
      transX,
      transY,
      startRot,
      startAngle,
      isInteracting,
      pendingCommit,
      element.id,
      dispatchRotateCommit,
    ],
  );

  const fireQuickRotate = useCallback(() => {
    callbacksRef.current.onQuickRotate?.(element.id);
  }, [element.id]);

  const rotateTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .maxDistance(12)
        .onEnd((_e, success) => {
          if (success) runOnJS(fireQuickRotate)();
        }),
    [fireQuickRotate],
  );

  const combinedRotateGesture = useMemo(
    () => Gesture.Exclusive(rotateGesture, rotateTapGesture),
    [rotateGesture, rotateTapGesture],
  );

  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: originLeftSv.value + transX.value + snapDxPx.value,
    top: originTopSv.value + transY.value + snapDyPx.value,
    width: animW.value,
    height: animH.value,
    transform: [{ rotate: `${animRot.value}deg` }],
    zIndex: selected ? 99 : element.zIndex ?? 1,
    opacity: hidden ? 0.28 : (element.opacity ?? 1) * liftSv.value,
    overflow: 'visible' as const,
  }));

  const contentScaleStyle = useAnimatedStyle(() => {
    const bw = Math.max(1, baseWidthPx);
    const bh = Math.max(1, baseHeightPx);
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: bw,
      height: bh,
      transformOrigin: 'top left' as const,
      transform: [{ scaleX: animW.value / bw }, { scaleY: animH.value / bh }],
    };
  });

  if (element.type === 'border' || element.needPrinting === false) {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: baseLeftPx,
          top: baseTopPx,
          width: baseWidthPx,
          height: baseHeightPx,
          zIndex: 0,
          transform: [{ rotate: `${baseRotation}deg` }],
          opacity: element.opacity ?? 1,
        }}>
        <ElementContentView
          element={element}
          widthPx={baseWidthPx}
          heightPx={baseHeightPx}
          scale={pxPerMMSafe}
        />
      </View>
    );
  }

  const borderStrokeColor = selectionColor || CHROME_STROKE_LIGHT;

  return (
    <Animated.View style={containerStyle} collapsable={false}>
      <GestureDetector gesture={combinedBodyGesture}>
        <Animated.View collapsable={false} style={contentScaleStyle}>
          <View pointerEvents="none" style={{ width: baseWidthPx, height: baseHeightPx }}>
            <ElementContentView
              element={element}
              widthPx={baseWidthPx}
              heightPx={baseHeightPx}
              scale={pxPerMMSafe}
            />
          </View>
        </Animated.View>
      </GestureDetector>

      {selected ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View
            pointerEvents="none"
            style={[
              styles.selectionOutline,
              { borderColor: borderStrokeColor, borderWidth: CHROME_STROKE_PX },
            ]}
          />

          {tooltipText ? (
            <View pointerEvents="none" style={styles.tooltipPill}>
              <Text style={styles.tooltipText}>{tooltipText}</Text>
            </View>
          ) : null}

          {element.lockMovement || moving ? null : (
            <>
              {resizePolicy.rotateHandle ? (
                <View pointerEvents="box-none" style={styles.rotateWrap}>
                  <View style={[styles.rotateStem, { backgroundColor: borderStrokeColor }]} />
                  <GestureDetector gesture={combinedRotateGesture}>
                    <View
                      hitSlop={{ top: 14, left: 14, right: 14, bottom: 0 }}
                      style={[
                        styles.rotateAnchor,
                        { borderColor: borderStrokeColor },
                      ]}>
                      <AppIcon name="arrow.clockwise" tintColor={borderStrokeColor} size={11} weight="light" />
                    </View>
                  </GestureDetector>
                </View>
              ) : null}

              {handleGestures.e ? (
                <EdgeResizeHandle position="e" gesture={handleGestures.e} />
              ) : null}
              {handleGestures.s ? (
                <EdgeResizeHandle position="s" gesture={handleGestures.s} />
              ) : null}
            </>
          )}

          {element.lockMovement ? (
            <View pointerEvents="none" style={styles.lockBadge}>
              <AppIcon name="lock.fill" tintColor="#FFFFFF" size={9} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
});

const EdgeResizeHandle = memo(function EdgeResizeHandle({
  position,
  gesture,
}: {
  position: HandlePosition;
  gesture: ReturnType<typeof Gesture.Pan>;
}) {
  const icon = position === 'e' ? 'arrow.left.and.right' : 'arrow.up.and.down';
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={[styles.edgeHit, position === 'e' ? styles.handleE : styles.handleS]}>
        <View pointerEvents="none" style={styles.edgeGlyph}>
          <AppIcon name={icon} tintColor={CHROME_HANDLE_COLOR} size={14} weight="light" />
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: CHROME_STROKE_PX,
    borderStyle: 'solid',
  },
  edgeHit: {
    position: 'absolute',
    width: EDGE_HIT_PX,
    height: EDGE_HIT_PX,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  edgeGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleS: {
    bottom: -EDGE_HIT_PX / 2,
    left: '50%',
    marginLeft: -EDGE_HIT_PX / 2,
  },
  handleE: {
    top: '50%',
    right: -EDGE_HIT_PX / 2,
    marginTop: -EDGE_HIT_PX / 2,
  },
  rotateWrap: {
    position: 'absolute',
    top: -ROTATE_STEM,
    left: '50%',
    marginLeft: -ROTATE_HANDLE_SIZE / 2,
    alignItems: 'center',
    zIndex: 15,
  },
  rotateStem: {
    position: 'absolute',
    top: ROTATE_HANDLE_SIZE - 2,
    width: CHROME_STROKE_PX,
    height: 14,
  },
  rotateAnchor: {
    width: ROTATE_HANDLE_SIZE,
    height: ROTATE_HANDLE_SIZE,
    borderRadius: ROTATE_HANDLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: CHROME_STROKE_PX,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  tooltipPill: {
    position: 'absolute',
    top: -46,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 20,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  lockBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 8,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
