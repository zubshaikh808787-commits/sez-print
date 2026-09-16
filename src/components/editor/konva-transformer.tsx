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
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';
import { AppIcon } from '@/components/app-icon';
import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, textBlockHeightMm, type LabelElement } from '@/lib/label-document';
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
  CHROME_HANDLE_FILL,
  CHROME_HANDLE_ICON_COLOR,
  CHROME_HANDLE_ICON_SIZE,
  CHROME_HANDLE_RADIUS_PX,
  CHROME_HANDLE_SIZE_PX,
  CHROME_SELECTION_STROKE,
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

const HIT_TARGET_PX = 36;
const DOUBLE_TAP_MS = 350;
const TOOLTIP_MS = 80;

type HandlePosition = ResizeAnchor;

type TooltipHandle = {
  setText: (text: string | null) => void;
};

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
  const circularBorder =
    element.type === 'border' &&
    Math.abs(canvasWidthMm - canvasHeightMm) < 0.75 &&
    Math.abs((element.width ?? canvasWidthMm) - canvasWidthMm) < 1.25 &&
    Math.abs((element.height ?? canvasHeightMm) - canvasHeightMm) < 1.25;

  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const originLeftSv = useSharedValue(baseLeftPx);
  const originTopSv = useSharedValue(baseTopPx);
  const padZoomSv = useSharedValue(padZoom > 0 ? padZoom : 1);
  const sizeWMmSv = useSharedValue(sizeMm.width);
  const sizeHMmSv = useSharedValue(sizeMm.height);
  const canvasWMmSv = useSharedValue(canvasWidthMm);
  const canvasHMmSv = useSharedValue(canvasHeightMm);
  const sxSv = useSharedValue(sx);
  const sySv = useSharedValue(sy);
  const startTX = useSharedValue(0);
  const startTY = useSharedValue(0);
  const startW = useSharedValue(baseWidthPx);
  const startH = useSharedValue(baseHeightPx);
  const startRot = useSharedValue(0);
  const startAbsX = useSharedValue(0);
  const startAbsY = useSharedValue(0);
  const animW = useSharedValue(baseWidthPx);
  const animH = useSharedValue(baseHeightPx);
  const animRot = useSharedValue<number>(baseRotation);
  const minResizeMmSv = useSharedValue(resizePolicy.minMm);
  const aspectSv = useSharedValue(aspectRatio);
  const isInteracting = useSharedValue(false);
  const pendingCommit = useSharedValue(false);
  const liftSv = useSharedValue(1);
  const selectedSv = useSharedValue(selected);
  const [moving, setMoving] = React.useState(false);
  const tooltipRef = useRef<TooltipHandle | null>(null);
  const lastTooltipAt = useRef(0);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
  }, []);

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
    minResizeMmSv.value = resizePolicy.minMm;
    aspectSv.value = aspectRatio;
  }, [
    padZoom,
    sizeMm.width,
    sizeMm.height,
    canvasWidthMm,
    canvasHeightMm,
    sx,
    sy,
    resizePolicy.minMm,
    aspectRatio,
    padZoomSv,
    sizeWMmSv,
    sizeHMmSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
    minResizeMmSv,
    aspectSv,
  ]);

  useEffect(() => {
    if (committedRef.current) {
      const c = committedRef.current;
      const curLeftMm = finiteMm(element.left);
      const curTopMm = finiteMm(element.top);
      const curWMm = sizeMm.width;
      const curHMm = sizeMm.height;
      const curRot = ((Math.round(element.rotation ?? 0) % 360) + 360) % 360;
      const isCommitted =
        Math.abs(curLeftMm - c.leftMm) < 0.25 &&
        Math.abs(curTopMm - c.topMm) < 0.25 &&
        Math.abs(curWMm - c.widthMm) < 0.25 &&
        Math.abs(curHMm - c.heightMm) < 0.25 &&
        Math.abs(curRot - c.rotation) < 2;

      if (isCommitted) {
        if (commitTimeoutRef.current) {
          clearTimeout(commitTimeoutRef.current);
          commitTimeoutRef.current = null;
        }
        committedRef.current = null;
        transX.value = 0;
        transY.value = 0;
        originLeftSv.value = baseLeftPx;
        originTopSv.value = baseTopPx;
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
        animRot.value = baseRotation;
        startW.value = baseWidthPx;
        startH.value = baseHeightPx;
        isInteracting.value = false;
        pendingCommit.value = false;
        liftSv.value = 1;
      }
      return;
    }

    if (isInteracting.value || pendingCommit.value) return;

    transX.value = 0;
    transY.value = 0;
    originLeftSv.value = baseLeftPx;
    originTopSv.value = baseTopPx;
    animW.value = baseWidthPx;
    animH.value = baseHeightPx;
    animRot.value = baseRotation;
    startW.value = baseWidthPx;
    startH.value = baseHeightPx;
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
      tooltipRef.current?.setText(null);
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

      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = setTimeout(() => {
        committedRef.current = null;
        pendingCommit.value = false;
        isInteracting.value = false;
        transX.value = 0;
        transY.value = 0;
        originLeftSv.value = baseLeftPx;
        originTopSv.value = baseTopPx;
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
      }, 500);

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        rotation: ((Math.round(baseRotation) % 360) + 360) % 360,
      });
    },
    [sizeMm.width, sizeMm.height, canvasWidthMm, canvasHeightMm, element.id, element.left, element.top, baseRotation, baseLeftPx, baseTopPx, baseWidthPx, baseHeightPx, transX, transY, originLeftSv, originTopSv, animW, animH, isInteracting, pendingCommit],
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

  const reportDragMove = useCallback(
    (_windowX: number, _windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      if (!emitMoveRef.current) return;
      dragMovePump.push({
        leftMm: pxToMm(fallbackLeftPx, pxPerMMSafe),
        topMm: pxToMm(fallbackTopPx, pxPerMMSafe),
      });
    },
    [dragMovePump, pxPerMMSafe],
  );

  const commitDragFromPointer = useCallback(
    (_windowX: number, _windowY: number, fallbackLeftPx: number, fallbackTopPx: number) => {
      dragMovePump.cancel();
      const leftMm = pxToMm(fallbackLeftPx, pxPerMMSafe);
      const topMm = pxToMm(fallbackTopPx, pxPerMMSafe);
      dispatchDragCommitMm(leftMm, topMm);
    },
    [dispatchDragCommitMm, dragMovePump, pxPerMMSafe],
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
      tooltipRef.current?.setText(null);
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
      let finalHeightMm = next.height;
      if (element.type === 'text' || element.type === 'degrees' || element.type === 'time') {
        const lines = ('text' in element ? element.text : 'content' in element ? element.content : '').split('\n').length || 1;
        const fs = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
        finalHeightMm = textBlockHeightMm(fs, lines);
        fontSize = fs;
      }

      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      committedRef.current = {
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: finalHeightMm,
        rotation,
      };

      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = setTimeout(() => {
        committedRef.current = null;
        pendingCommit.value = false;
        isInteracting.value = false;
        transX.value = 0;
        transY.value = 0;
        originLeftSv.value = baseLeftPx;
        originTopSv.value = baseTopPx;
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
      }, 500);

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: finalHeightMm,
        rotation,
        fontSize,
      });
    },
    [pxPerMMSafe, canvasWidthMm, canvasHeightMm, element, resizePolicy, baseLeftPx, baseTopPx, baseWidthPx, baseHeightPx, transX, transY, originLeftSv, originTopSv, animW, animH, isInteracting, pendingCommit],
  );

  /** Committed rotate: alters rotation angle only. */
  const dispatchRotateCommit = useCallback(
    (rot: number) => {
      tooltipRef.current?.setText(null);
      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      committedRef.current = {
        leftMm: roundMm(element.left),
        topMm: roundMm(element.top),
        widthMm: roundMm(sizeMm.width),
        heightMm: roundMm(sizeMm.height),
        rotation,
      };

      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = setTimeout(() => {
        committedRef.current = null;
        pendingCommit.value = false;
        isInteracting.value = false;
        transX.value = 0;
        transY.value = 0;
        originLeftSv.value = baseLeftPx;
        originTopSv.value = baseTopPx;
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
      }, 500);

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundMm(element.left),
        topMm: roundMm(element.top),
        widthMm: roundMm(sizeMm.width),
        heightMm: roundMm(sizeMm.height),
        rotation,
      });
    },
    [element.id, element.left, element.top, sizeMm.width, sizeMm.height, baseLeftPx, baseTopPx, baseWidthPx, baseHeightPx, transX, transY, originLeftSv, originTopSv, animW, animH, isInteracting, pendingCommit],
  );

  const updateTooltipJS = useCallback(
    (wPx: number, hPx: number) => {
      const now = Date.now();
      if (now - lastTooltipAt.current < TOOLTIP_MS) return;
      lastTooltipAt.current = now;
      const wMm = pxToMm(wPx, pxPerMMSafe).toFixed(2);
      const hMm = pxToMm(hPx, pxPerMMSafe).toFixed(2);
      tooltipRef.current?.setText(`${wMm} × ${hMm} mm`);
    },
    [pxPerMMSafe],
  );

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
        .onStart((_e) => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;
          liftSv.value = DRAG_LIFT_OPACITY;
          runOnJS(setMoveLift)(true);
          if (!selectedSv.value) {
            runOnJS(callbacksRef.current.onSelect)(element.id);
          }
          if (callbacksRef.current.onTransformStart) {
            runOnJS(callbacksRef.current.onTransformStart)(element.id);
          }
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
          const dx = e.translationX / z;
          const dy = e.translationY / z;

          const maxLeftPx = Math.max(0, (canvasWMmSv.value - sizeWMmSv.value) * sxSv.value);
          const maxTopPx = Math.max(0, (canvasHMmSv.value - sizeHMmSv.value) * sySv.value);

          const targetLeft = originLeftSv.value + dx;
          const targetTop = originTopSv.value + dy;

          const clampedLeft = Math.max(0, Math.min(maxLeftPx, targetLeft));
          const clampedTop = Math.max(0, Math.min(maxTopPx, targetTop));

          transX.value = clampedLeft - originLeftSv.value;
          transY.value = clampedTop - originTopSv.value;
        })
        .onEnd((e) => {
          'worklet';
          pendingCommit.value = true;
          liftSv.value = 1;
          runOnJS(setMoveLift)(false);
          const finalLeftPx = originLeftSv.value + transX.value;
          const finalTopPx = originTopSv.value + transY.value;
          runOnJS(commitDragFromPointer)(
            e.absoluteX,
            e.absoluteY,
            finalLeftPx,
            finalTopPx,
          );
        }),
    [
      element.lockMovement,
      bodyHitSlop,
      commitDragFromPointer,
      setMoveLift,
      element.id,
      originLeftSv,
      originTopSv,
      transX,
      transY,
      isInteracting,
      pendingCommit,
      liftSv,
      selectedSv,
      padZoomSv,
      canvasWMmSv,
      sizeWMmSv,
      sxSv,
      canvasHMmSv,
      sizeHMmSv,
      sySv,
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
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart((_e) => {
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
          const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
          const rad = (startRot.value * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const rawDx = e.translationX / z;
          const rawDy = e.translationY / z;
          const dx = rawDx * cos + rawDy * sin;
          const dy = -rawDx * sin + rawDy * cos;

          const originW = startW.value;
          const originH = startH.value;
          const originLeft = originLeftSv.value;
          const originTop = originTopSv.value;
          const canvasWPx = canvasWMmSv.value * sxSv.value;
          const canvasHPx = canvasHMmSv.value * sySv.value;
          const minPx = Math.max(2, minResizeMmSv.value * sxSv.value);
          const aspect = aspectSv.value > 0 ? aspectSv.value : 1;

          let nw = originW;
          let nh = originH;
          let left = originLeft;
          let top = originTop;

          if (behavior === 'width' && handle === 'e') {
            const maxW = Math.max(minPx, canvasWPx - originLeft);
            const proposedW = originW + dx;
            nw = Math.max(minPx, Math.min(maxW, proposedW));
            nh = originH;
            left = originLeft;
            top = originTop;
          } else if (behavior === 'height' && handle === 's') {
            const maxH = Math.max(minPx, canvasHPx - originTop);
            const proposedH = originH + dy;
            nh = Math.max(minPx, Math.min(maxH, proposedH));
            nw = originW;
            left = originLeft;
            top = originTop;
          } else if (behavior === 'aspect' || behavior === 'square') {
            const effectiveAspect = behavior === 'square' ? 1 : aspect;
            if (handle === 'e') {
              const maxW = Math.max(minPx, canvasWPx - originLeft);
              const proposedW = originW + dx;
              let targetW = Math.max(minPx, Math.min(maxW, proposedW));
              let targetH = targetW / effectiveAspect;

              let targetTop = originTop + (originH - targetH) / 2;
              if (targetTop < 0) {
                targetH = Math.min(canvasHPx, originH + 2 * originTop);
                targetW = targetH * effectiveAspect;
                targetTop = 0;
              }
              if (targetTop + targetH > canvasHPx) {
                targetH = Math.min(canvasHPx, originH + 2 * (canvasHPx - originTop - originH));
                targetW = targetH * effectiveAspect;
                targetTop = canvasHPx - targetH;
              }
              if (targetW < minPx) {
                targetW = minPx;
                targetH = targetW / effectiveAspect;
              }

              nw = targetW;
              nh = targetH;
              left = originLeft;
              top = Math.max(0, Math.min(canvasHPx - nh, originTop + (originH - nh) / 2));
            } else {
              const maxH = Math.max(minPx, canvasHPx - originTop);
              const proposedH = originH + dy;
              let targetH = Math.max(minPx, Math.min(maxH, proposedH));
              let targetW = targetH * effectiveAspect;

              let targetLeft = originLeft + (originW - targetW) / 2;
              if (targetLeft < 0) {
                targetW = Math.min(canvasWPx, originW + 2 * originLeft);
                targetH = targetW / effectiveAspect;
                targetLeft = 0;
              }
              if (targetLeft + targetW > canvasWPx) {
                targetW = Math.min(canvasWPx, originW + 2 * (canvasWPx - originLeft - originW));
                targetH = targetW / effectiveAspect;
                targetLeft = canvasWPx - targetW;
              }
              if (targetH < minPx) {
                targetH = minPx;
                targetW = targetH * effectiveAspect;
              }

              nw = targetW;
              nh = targetH;
              top = originTop;
              left = Math.max(0, Math.min(canvasWPx - nw, originLeft + (originW - nw) / 2));
            }
          }

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
      isInteracting,
      pendingCommit,
      element.id,
      dispatchResizeCommit,
      captureResizeStartFromPx,
      updateTooltipJS,
      bodyDragGesture,
      padZoomSv,
      canvasWMmSv,
      canvasHMmSv,
      sxSv,
      sySv,
      minResizeMmSv,
      aspectSv,
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

  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: 0,
    top: 0,
    width: animW.value,
    height: animH.value,
    transform: [
      { translateX: originLeftSv.value + transX.value },
      { translateY: originTopSv.value + transY.value },
      { rotate: `${animRot.value}deg` },
    ],
    zIndex: selected ? 99 : element.zIndex ?? 1,
    opacity: hidden ? 0.28 : (element.opacity ?? 1) * liftSv.value,
    overflow: 'visible' as const,
  }));

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
          mediaShape={circularBorder ? 'circle' : undefined}
        />
      </View>
    );
  }

  const borderStrokeColor = selectionColor || CHROME_SELECTION_STROKE;

  return (
    <Animated.View style={containerStyle} collapsable={false}>
      <GestureDetector gesture={combinedBodyGesture}>
        <View collapsable={false} style={styles.fillContainer}>
          <View pointerEvents="none" style={styles.fillContainer}>
            <ElementContentView
              element={element}
              widthPx={baseWidthPx}
              heightPx={baseHeightPx}
              scale={pxPerMMSafe}
              mediaShape={circularBorder ? 'circle' : undefined}
            />
          </View>
        </View>
      </GestureDetector>

      {selected ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View
            pointerEvents="none"
            style={[
              styles.selectionOutline,
              { borderColor: borderStrokeColor },
            ]}
          />

          <ResizeTooltip tooltipRef={tooltipRef} />

          {element.lockMovement || moving ? null : (
            <>
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

const ResizeTooltip = memo(function ResizeTooltip({
  tooltipRef,
}: {
  tooltipRef: React.MutableRefObject<TooltipHandle | null>;
}) {
  const [text, setText] = React.useState<string | null>(null);
  useEffect(() => {
    tooltipRef.current = { setText };
    return () => {
      tooltipRef.current = null;
    };
  }, [tooltipRef]);

  if (!text) return null;
  return (
    <View pointerEvents="none" style={styles.tooltipPill}>
      <Text style={styles.tooltipText}>{text}</Text>
    </View>
  );
});

const EdgeResizeHandle = memo(function EdgeResizeHandle({
  position,
  gesture,
}: {
  position: HandlePosition;
  gesture: ReturnType<typeof Gesture.Pan>;
}) {
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.handleCircle, position === 'e' ? styles.handleE : styles.handleS]}>
        <View pointerEvents="none">
          {position === 'e' ? (
            <Svg width={16} height={16} viewBox="-8 -8 16 16">
              <SvgPath d="M -2 -4 L -6.5 0 L -2 4 Z" fill="#FFFFFF" />
              <SvgPath d="M 2 -4 L 6.5 0 L 2 4 Z" fill="#FFFFFF" />
              <SvgLine x1={-3} y1={0} x2={3} y2={0} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            </Svg>
          ) : (
            <Svg width={16} height={16} viewBox="-8 -8 16 16">
              <SvgPath d="M -4 -2 L 0 -6.5 L 4 -2 Z" fill="#FFFFFF" />
              <SvgPath d="M -4 2 L 0 6.5 L 4 2 Z" fill="#FFFFFF" />
              <SvgLine x1={0} y1={-3} x2={0} y2={3} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            </Svg>
          )}
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fillContainer: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: CHROME_SELECTION_STROKE,
  },
  handleCircle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#54C8C8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  handleS: {
    bottom: -14,
    left: '50%',
    marginLeft: -14,
  },
  handleE: {
    top: '50%',
    right: -14,
    marginTop: -14,
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
