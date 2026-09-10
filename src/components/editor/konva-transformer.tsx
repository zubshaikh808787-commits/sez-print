import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Platform,
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
import { mmToPt } from '@/lib/label-document';
import { finiteMm, MIN_ELEMENT_MM, roundMm } from '@/lib/editor/engine';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';

export type TransformCommitPayload = {
  id: string;
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  fontSize?: number;
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
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
};

const HANDLE_SIZE = 18;
const HANDLE_RADIUS = 3;
const ROTATE_HANDLE_SIZE = 24;
const ROTATE_STEM = 28;
const HIT_TARGET_PX = 36;
const DOUBLE_TAP_MS = 350;
const TOOLTIP_MS = 80;

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

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
  onTransformEnd,
  onQuickRotate,
}: KonvaTransformerProps) {
  const pxPerMMSafe = pxPerMM > 0 && Number.isFinite(pxPerMM) ? pxPerMM : 1;
  const sx = pxPerMMSafe;
  const sy = pxPerMMSafe;
  const sizeMm = elementSizeMm(element);
  const hidden = element.visible === false;

  const baseLeftPx = mmToPx(finiteMm(element.left), pxPerMMSafe);
  const baseTopPx = mmToPx(finiteMm(element.top), pxPerMMSafe);
  const baseWidthPx = Math.max(1, mmToPx(sizeMm.width, pxPerMMSafe));
  const baseHeightPx = Math.max(element.type === 'line' ? 2 : 1, mmToPx(sizeMm.height, pxPerMMSafe));
  const minMm = element.type === 'line' ? 0.1 : MIN_ELEMENT_MM;
  const minResizePx = Math.max(2, minMm * pxPerMMSafe);
  const baseRotation = element.rotation ?? 0;

  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const animW = useSharedValue(baseWidthPx);
  const animH = useSharedValue(baseHeightPx);
  const animRot = useSharedValue<number>(baseRotation);
  const isInteracting = useSharedValue(false);
  const pendingCommit = useSharedValue(false);
  const selectedSv = useSharedValue(selected);
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
        animW.value = baseWidthPx;
        animH.value = baseHeightPx;
        animRot.value = baseRotation;
        isInteracting.value = false;
        pendingCommit.value = false;
      }
      return;
    }

    if (isInteracting.value) return;

    transX.value = 0;
    transY.value = 0;
    animW.value = baseWidthPx;
    animH.value = baseHeightPx;
    animRot.value = baseRotation;
    isInteracting.value = false;
    pendingCommit.value = false;
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
    animW,
    animH,
    animRot,
    isInteracting,
    pendingCommit,
  ]);

  const lastTapRef = useRef({ id: '', time: 0 });
  const callbacksRef = useRef({
    onSelect,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformEnd,
    onQuickRotate,
    selected,
  });
  callbacksRef.current = {
    onSelect,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformEnd,
    onQuickRotate,
    selected,
  };

  /** Committed drag: moves position only. NEVER alters width, height, or fontSize. */
  const dispatchDragCommit = useCallback(
    (nextLeftPx: number, nextTopPx: number) => {
      setTooltipText(null);
      const widthMm = sizeMm.width;
      const heightMm = sizeMm.height;

      const maxLeft = Math.max(0, canvasWidthMm - widthMm);
      const maxTop = Math.max(0, canvasHeightMm - heightMm);
      const leftMm = Math.max(0, Math.min(maxLeft, pxToMm(nextLeftPx, pxPerMMSafe)));
      const topMm = Math.max(0, Math.min(maxTop, pxToMm(nextTopPx, pxPerMMSafe)));

      const roundedLeft = roundMm(leftMm);
      const roundedTop = roundMm(topMm);

      if (Math.abs(roundedLeft - element.left) < 0.005 && Math.abs(roundedTop - element.top) < 0.005) {
        committedRef.current = null;
        transX.value = 0;
        transY.value = 0;
        isInteracting.value = false;
        pendingCommit.value = false;
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
    [pxPerMMSafe, sizeMm.width, sizeMm.height, canvasWidthMm, canvasHeightMm, element.id, element.left, element.top, baseRotation, transX, transY, isInteracting, pendingCommit],
  );

  /** Committed resize: alters width & height via resize handles. */
  const dispatchResizeCommit = useCallback(
    (nextLeftPx: number, nextTopPx: number, nextWPx: number, nextHPx: number, rot: number) => {
      setTooltipText(null);
      const minMm = element.type === 'line' ? 0.1 : MIN_ELEMENT_MM;
      let widthMm = Math.max(minMm, pxToMm(nextWPx, pxPerMMSafe));
      let heightMm = Math.max(minMm, pxToMm(nextHPx, pxPerMMSafe));
      widthMm = Math.min(widthMm, Math.max(minMm, canvasWidthMm));
      heightMm = Math.min(heightMm, Math.max(minMm, canvasHeightMm));
      let leftMm = Math.max(0, pxToMm(nextLeftPx, pxPerMMSafe));
      let topMm = Math.max(0, pxToMm(nextTopPx, pxPerMMSafe));
      leftMm = Math.min(Math.max(0, canvasWidthMm - widthMm), leftMm);
      topMm = Math.min(Math.max(0, canvasHeightMm - heightMm), topMm);

      let fontSize: number | undefined;
      if (element.type === 'text' || element.type === 'degrees' || element.type === 'time') {
        if ('fontSize' in element && typeof element.fontSize === 'number') {
          const oldH = Math.max(0.1, sizeMm.height);
          const ratio = heightMm / oldH;
          fontSize = Math.max(3, Math.min(72, Math.round(element.fontSize * ratio * 2) / 2));
        }
      }

      const roundedLeft = roundMm(leftMm);
      const roundedTop = roundMm(topMm);
      const roundedW = roundMm(widthMm);
      const roundedH = roundMm(heightMm);
      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      committedRef.current = {
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundedW,
        heightMm: roundedH,
        rotation,
      };

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundedW,
        heightMm: roundedH,
        rotation,
        fontSize,
      });
    },
    [pxPerMMSafe, canvasWidthMm, canvasHeightMm, element, sizeMm.height],
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
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const startAbsX = useSharedValue(0);
  const startAbsY = useSharedValue(0);
  const lockAspect = element.type === 'image' && Boolean(element.aspectRatioLocked);
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
          startTX.value = transX.value;
          startTY.value = transY.value;
          startAbsX.value = e.absoluteX;
          startAbsY.value = e.absoluteY;
          if (!selectedSv.value) {
            runOnJS(callbacksRef.current.onSelect)(element.id);
          }
          if (callbacksRef.current.onTransformStart) {
            runOnJS(callbacksRef.current.onTransformStart)(element.id);
          }
        })
        .onUpdate((e) => {
          'worklet';
          const z = padZoom > 0 ? padZoom : 1;
          const rawLeft = baseLeftPx + startTX.value + (e.absoluteX - startAbsX.value) / z;
          const rawTop = baseTopPx + startTY.value + (e.absoluteY - startAbsY.value) / z;

          const maxLeftPx = Math.max(0, (canvasWidthMm - sizeMm.width) * sx);
          const maxTopPx = Math.max(0, (canvasHeightMm - sizeMm.height) * sy);

          const clampedLeft = Math.max(0, Math.min(maxLeftPx, rawLeft));
          const clampedTop = Math.max(0, Math.min(maxTopPx, rawTop));

          transX.value = clampedLeft - baseLeftPx;
          transY.value = clampedTop - baseTopPx;
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchDragCommit)(
            baseLeftPx + transX.value,
            baseTopPx + transY.value,
          );
        }),
    [
      element.lockMovement,
      bodyHitSlop,
      padZoom,
      baseLeftPx,
      baseTopPx,
      canvasWidthMm,
      canvasHeightMm,
      sizeMm.width,
      sizeMm.height,
      sx,
      sy,
      dispatchDragCommit,
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
    (handle: HandlePosition) =>
      Gesture.Pan()
        .minDistance(1)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart((e) => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          startW.value = animW.value;
          startH.value = animH.value;
          startTX.value = transX.value;
          startTY.value = transY.value;
          startRot.value = animRot.value;
          startAbsX.value = e.absoluteX;
          startAbsY.value = e.absoluteY;

          const w = startW.value;
          const h = startH.value;
          const left = baseLeftPx + startTX.value;
          const top = baseTopPx + startTY.value;
          const rad = (startRot.value * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          let lx = 0;
          let ly = 0;
          if (handle === 'se') {
            lx = 0;
            ly = 0;
          } else if (handle === 'e') {
            lx = 0;
            ly = h / 2;
          } else if (handle === 's') {
            lx = w / 2;
            ly = 0;
          } else if (handle === 'ne') {
            lx = 0;
            ly = h;
          } else if (handle === 'n') {
            lx = w / 2;
            ly = h;
          } else if (handle === 'nw') {
            lx = w;
            ly = h;
          } else if (handle === 'w') {
            lx = w;
            ly = h / 2;
          } else {
            lx = w;
            ly = 0;
          }
          const cx = left + w / 2;
          const cy = top + h / 2;
          const dx = lx - w / 2;
          const dy = ly - h / 2;
          anchorX.value = cx + dx * cos - dy * sin;
          anchorY.value = cy + dx * sin + dy * cos;

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

          let nw = startW.value;
          let nh = startH.value;
          if (handle === 'se') {
            nw = Math.max(minResizePx, startW.value + dx);
            nh = Math.max(minResizePx, startH.value + dy);
          } else if (handle === 'e') {
            nw = Math.max(minResizePx, startW.value + dx);
          } else if (handle === 's') {
            nh = Math.max(minResizePx, startH.value + dy);
          } else if (handle === 'ne') {
            nw = Math.max(minResizePx, startW.value + dx);
            nh = Math.max(minResizePx, startH.value - dy);
          } else if (handle === 'n') {
            nh = Math.max(minResizePx, startH.value - dy);
          } else if (handle === 'nw') {
            nw = Math.max(minResizePx, startW.value - dx);
            nh = Math.max(minResizePx, startH.value - dy);
          } else if (handle === 'w') {
            nw = Math.max(minResizePx, startW.value - dx);
          } else {
            nw = Math.max(minResizePx, startW.value - dx);
            nh = Math.max(minResizePx, startH.value + dy);
          }

          if (lockAspect && startH.value > 0) {
            const ratio = startW.value / startH.value;
            const corner =
              handle === 'se' || handle === 'nw' || handle === 'ne' || handle === 'sw';
            if (corner) {
              if (Math.abs(nw - startW.value) >= Math.abs(nh - startH.value)) {
                nh = Math.max(minResizePx, nw / ratio);
              } else {
                nw = Math.max(minResizePx, nh * ratio);
              }
            } else if (handle === 'e' || handle === 'w') {
              nh = Math.max(minResizePx, nw / ratio);
            } else {
              nw = Math.max(minResizePx, nh * ratio);
            }
          }

          const canvasWPx = canvasWidthMm * sx;
          const canvasHPx = canvasHeightMm * sy;
          nw = Math.min(Math.max(minResizePx, nw), canvasWPx);
          nh = Math.min(Math.max(minResizePx, nh), canvasHPx);

          let ax = 0;
          let ay = 0;
          if (handle === 'se') {
            ax = 0;
            ay = 0;
          } else if (handle === 'e') {
            ax = 0;
            ay = nh / 2;
          } else if (handle === 's') {
            ax = nw / 2;
            ay = 0;
          } else if (handle === 'ne') {
            ax = 0;
            ay = nh;
          } else if (handle === 'n') {
            ax = nw / 2;
            ay = nh;
          } else if (handle === 'nw') {
            ax = nw;
            ay = nh;
          } else if (handle === 'w') {
            ax = nw;
            ay = nh / 2;
          } else {
            ax = nw;
            ay = 0;
          }

          const ldx = ax - nw / 2;
          const ldy = ay - nh / 2;
          let left = anchorX.value - nw / 2 - ldx * cos + ldy * sin;
          let top = anchorY.value - nh / 2 - ldx * sin - ldy * cos;
          left = Math.max(0, Math.min(Math.max(0, canvasWPx - nw), left));
          top = Math.max(0, Math.min(Math.max(0, canvasHPx - nh), top));

          animW.value = nw;
          animH.value = nh;
          transX.value = left - baseLeftPx;
          transY.value = top - baseTopPx;
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchResizeCommit)(
            baseLeftPx + transX.value,
            baseTopPx + transY.value,
            animW.value,
            animH.value,
            animRot.value,
          );
        })
        .blocksExternalGesture(bodyDragGesture),
    [
      padZoom,
      baseLeftPx,
      baseTopPx,
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
      anchorX,
      anchorY,
      isInteracting,
      pendingCommit,
      element.id,
      dispatchResizeCommit,
      minResizePx,
      lockAspect,
      bodyDragGesture,
      canvasWidthMm,
      canvasHeightMm,
      sx,
      sy,
    ],
  );

  const handleGestures = useMemo(
    () => ({
      nw: createHandleGesture('nw'),
      n: createHandleGesture('n'),
      ne: createHandleGesture('ne'),
      e: createHandleGesture('e'),
      se: createHandleGesture('se'),
      s: createHandleGesture('s'),
      sw: createHandleGesture('sw'),
      w: createHandleGesture('w'),
    }),
    [createHandleGesture],
  );

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
    left: baseLeftPx + transX.value,
    top: baseTopPx + transY.value,
    width: animW.value,
    height: animH.value,
    transform: [{ rotate: `${animRot.value}deg` }],
    zIndex: selected ? 99 : element.zIndex ?? 1,
    opacity: hidden ? 0.28 : element.opacity ?? 1,
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

  const borderStrokeColor = selectionColor || '#2563EB';

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
              { borderColor: borderStrokeColor },
            ]}
          />

          {tooltipText ? (
            <View pointerEvents="none" style={styles.tooltipPill}>
              <Text style={styles.tooltipText}>{tooltipText}</Text>
            </View>
          ) : null}

          {element.lockMovement ? null : (
            <>
              <View pointerEvents="box-none" style={styles.rotateWrap}>
                <View style={[styles.rotateStem, { backgroundColor: borderStrokeColor }]} />
                <GestureDetector gesture={combinedRotateGesture}>
                  <View
                    hitSlop={{ top: 14, left: 14, right: 14, bottom: 0 }}
                    style={[styles.rotateAnchor, { backgroundColor: borderStrokeColor }]}>
                    <AppIcon name="arrow.clockwise" tintColor="#FFFFFF" size={12} />
                  </View>
                </GestureDetector>
              </View>

              <HandleAnchor
                position="nw"
                gesture={handleGestures.nw}
                borderColor={borderStrokeColor}
                style={styles.handleNW}
              />
              <HandleAnchor
                position="ne"
                gesture={handleGestures.ne}
                borderColor={borderStrokeColor}
                style={styles.handleNE}
              />
              <HandleAnchor
                position="se"
                gesture={handleGestures.se}
                borderColor={borderStrokeColor}
                style={styles.handleSE}
              />
              <HandleAnchor
                position="sw"
                gesture={handleGestures.sw}
                borderColor={borderStrokeColor}
                style={styles.handleSW}
              />
              <HandleAnchor
                position="n"
                gesture={handleGestures.n}
                borderColor={borderStrokeColor}
                style={styles.handleN}
              />
              <HandleAnchor
                position="e"
                gesture={handleGestures.e}
                borderColor={borderStrokeColor}
                style={styles.handleE}
              />
              <HandleAnchor
                position="s"
                gesture={handleGestures.s}
                borderColor={borderStrokeColor}
                style={styles.handleS}
              />
              <HandleAnchor
                position="w"
                gesture={handleGestures.w}
                borderColor={borderStrokeColor}
                style={styles.handleW}
              />
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

const HandleAnchor = memo(function HandleAnchor({
  position,
  gesture,
  borderColor,
  style,
}: {
  position: HandlePosition;
  gesture: ReturnType<typeof Gesture.Pan>;
  borderColor: string;
  style: object;
}) {
  // Directed outward-only hitSlop leaves the entire element body unblocked for soft-touch dragging
  const hitSlop = useMemo(() => {
    switch (position) {
      case 'nw':
        return { top: 14, left: 14, bottom: 0, right: 0 };
      case 'ne':
        return { top: 14, right: 14, bottom: 0, left: 0 };
      case 'se':
        return { bottom: 14, right: 14, top: 0, left: 0 };
      case 'sw':
        return { bottom: 14, left: 14, top: 0, right: 0 };
      case 'n':
        return { top: 14, bottom: 0, left: 6, right: 6 };
      case 's':
        return { bottom: 14, top: 0, left: 6, right: 6 };
      case 'e':
        return { right: 14, left: 0, top: 6, bottom: 6 };
      case 'w':
        return { left: 14, right: 0, top: 6, bottom: 6 };
    }
  }, [position]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        hitSlop={hitSlop}
        style={[
          styles.anchorBase,
          { borderColor },
          style,
        ]}>
        <View style={styles.anchorInner} />
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'solid',
  },
  anchorBase: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderRadius: HANDLE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  anchorInner: {
    width: 3,
    height: 3,
    backgroundColor: 'transparent',
  },
  handleNW: {
    top: -HANDLE_SIZE / 2,
    left: -HANDLE_SIZE / 2,
  },
  handleNE: {
    top: -HANDLE_SIZE / 2,
    right: -HANDLE_SIZE / 2,
  },
  handleSE: {
    bottom: -HANDLE_SIZE / 2,
    right: -HANDLE_SIZE / 2,
  },
  handleSW: {
    bottom: -HANDLE_SIZE / 2,
    left: -HANDLE_SIZE / 2,
  },
  handleN: {
    top: -HANDLE_SIZE / 2,
    left: '50%',
    marginLeft: -HANDLE_SIZE / 2,
  },
  handleS: {
    bottom: -HANDLE_SIZE / 2,
    left: '50%',
    marginLeft: -HANDLE_SIZE / 2,
  },
  handleE: {
    top: '50%',
    right: -HANDLE_SIZE / 2,
    marginTop: -HANDLE_SIZE / 2,
  },
  handleW: {
    top: '50%',
    left: -HANDLE_SIZE / 2,
    marginTop: -HANDLE_SIZE / 2,
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
    width: 1.5,
    height: 16,
  },
  rotateAnchor: {
    width: ROTATE_HANDLE_SIZE,
    height: ROTATE_HANDLE_SIZE,
    borderRadius: ROTATE_HANDLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
    }),
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
