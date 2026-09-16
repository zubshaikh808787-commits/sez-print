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
        .minDistance(0)
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
          mediaShape={circularBorder ? 'circle' : undefined}
        />
      </View>
    );
  }

  const borderStrokeColor = selectionColor || CHROME_SELECTION_STROKE;

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
              mediaShape={circularBorder ? 'circle' : undefined}
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
              { borderColor: borderStrokeColor },
            ]}
          />

          {tooltipText ? (
            <View pointerEvents="none" style={styles.tooltipPill}>
              <Text style={styles.tooltipText}>{tooltipText}</Text>
            </View>
          ) : null}

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
        style={[styles.handleCircle, position === 'e' ? styles.handleE : styles.handleS]}>
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
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
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
