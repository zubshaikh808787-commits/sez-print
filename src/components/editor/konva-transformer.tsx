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
  scaleX: number;
  scaleY: number;
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
const MIN_SIZE_PX = 18;
const DOUBLE_TAP_MS = 350;
const TOOLTIP_MS = 80;

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const KonvaTransformer = memo(function KonvaTransformer({
  element,
  scaleX,
  scaleY,
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
  const sx = scaleX > 0 ? scaleX : 1;
  const sy = scaleY > 0 ? scaleY : 1;
  const sizeMm = elementSizeMm(element);

  const baseLeftPx = element.left * sx;
  const baseTopPx = element.top * sy;
  const baseWidthPx = Math.max(MIN_SIZE_PX, sizeMm.width * sx);
  const baseHeightPx = Math.max(
    element.type === 'line' ? 2 : MIN_SIZE_PX,
    sizeMm.height * sy,
  );
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

  useEffect(() => {
    selectedSv.value = selected;
  }, [selected, selectedSv]);

  useEffect(() => {
    if (isInteracting.value && !pendingCommit.value) return;
    transX.value = 0;
    transY.value = 0;
    animW.value = baseWidthPx;
    animH.value = baseHeightPx;
    animRot.value = baseRotation;
    isInteracting.value = false;
    pendingCommit.value = false;
  }, [
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

  const releaseAfterCommit = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isInteracting.value = false;
        pendingCommit.value = false;
      });
    });
  }, [isInteracting, pendingCommit]);

  const dispatchTransformCommit = useCallback(
    (nextLeftPx: number, nextTopPx: number, nextWPx: number, nextHPx: number, rot: number) => {
      setTooltipText(null);
      let leftMm = Math.max(0, nextLeftPx / sx);
      let topMm = Math.max(0, nextTopPx / sy);
      let widthMm = Math.max(2, nextWPx / sx);
      let heightMm = Math.max(element.type === 'line' ? 0.5 : 2, nextHPx / sy);

      if (leftMm + widthMm > canvasWidthMm) {
        widthMm = Math.max(2, canvasWidthMm - leftMm);
      }
      if (topMm + heightMm > canvasHeightMm) {
        heightMm = Math.max(element.type === 'line' ? 0.5 : 2, canvasHeightMm - topMm);
      }

      let fontSize: number | undefined;
      if (element.type === 'text' || element.type === 'degrees' || element.type === 'time') {
        const textContent =
          element.type === 'time'
            ? '2026-01-01'
            : 'text' in element
            ? element.text
            : element.content;
        const lines = Math.max(1, (textContent || '').split('\n').length);
        fontSize = Math.max(
          6,
          Math.min(64, Math.round(mmToPt(heightMm / (1.25 * lines)) * 2) / 2),
        );
      }

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: Math.round(leftMm * 10) / 10,
        topMm: Math.round(topMm * 10) / 10,
        widthMm: Math.round(widthMm * 10) / 10,
        heightMm: Math.round(heightMm * 10) / 10,
        rotation: ((Math.round(rot) % 360) + 360) % 360,
        fontSize,
      });
      releaseAfterCommit();
    },
    [sx, sy, canvasWidthMm, canvasHeightMm, element, releaseAfterCommit],
  );

  const updateTooltipJS = useCallback(
    (wPx: number, hPx: number) => {
      const now = Date.now();
      if (now - lastTooltipAt.current < TOOLTIP_MS) return;
      lastTooltipAt.current = now;
      const wMm = (wPx / sx).toFixed(1);
      const hMm = (hPx / sy).toFixed(1);
      setTooltipText(`${wMm} × ${hMm} mm`);
    },
    [sx, sy],
  );

  const startTX = useSharedValue(0);
  const startTY = useSharedValue(0);
  const startW = useSharedValue(0);
  const startH = useSharedValue(0);
  const startRot = useSharedValue(0);
  const startAngle = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);

  const bodyDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!element.lockMovement)
        .minDistance(8)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          startTX.value = transX.value;
          startTY.value = transY.value;
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
          transX.value = startTX.value + e.translationX / z;
          transY.value = startTY.value + e.translationY / z;
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchTransformCommit)(
            baseLeftPx + transX.value,
            baseTopPx + transY.value,
            animW.value,
            animH.value,
            animRot.value,
          );
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element.lockMovement, padZoom, baseLeftPx, baseTopPx, dispatchTransformCommit, element.id],
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
        .maxDuration(2000)
        .maxDistance(14)
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
        .hitSlop(16)
        .onStart(() => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          startW.value = animW.value;
          startH.value = animH.value;
          startTX.value = transX.value;
          startTY.value = transY.value;
          startRot.value = animRot.value;

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
          const rawDx = e.translationX / z;
          const rawDy = e.translationY / z;
          const dx = rawDx * cos + rawDy * sin;
          const dy = -rawDx * sin + rawDy * cos;

          let nw = startW.value;
          let nh = startH.value;
          if (handle === 'se') {
            nw = Math.max(MIN_SIZE_PX, startW.value + dx);
            nh = Math.max(MIN_SIZE_PX, startH.value + dy);
          } else if (handle === 'e') {
            nw = Math.max(MIN_SIZE_PX, startW.value + dx);
          } else if (handle === 's') {
            nh = Math.max(MIN_SIZE_PX, startH.value + dy);
          } else if (handle === 'ne') {
            nw = Math.max(MIN_SIZE_PX, startW.value + dx);
            nh = Math.max(MIN_SIZE_PX, startH.value - dy);
          } else if (handle === 'n') {
            nh = Math.max(MIN_SIZE_PX, startH.value - dy);
          } else if (handle === 'nw') {
            nw = Math.max(MIN_SIZE_PX, startW.value - dx);
            nh = Math.max(MIN_SIZE_PX, startH.value - dy);
          } else if (handle === 'w') {
            nw = Math.max(MIN_SIZE_PX, startW.value - dx);
          } else {
            nw = Math.max(MIN_SIZE_PX, startW.value - dx);
            nh = Math.max(MIN_SIZE_PX, startH.value + dy);
          }

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
          const left = anchorX.value - nw / 2 - ldx * cos + ldy * sin;
          const top = anchorY.value - nh / 2 - ldx * sin - ldy * cos;

          animW.value = nw;
          animH.value = nh;
          transX.value = left - baseLeftPx;
          transY.value = top - baseTopPx;
          runOnJS(updateTooltipJS)(nw, nh);
        })
        .onEnd(() => {
          'worklet';
          pendingCommit.value = true;
          runOnJS(dispatchTransformCommit)(
            baseLeftPx + transX.value,
            baseTopPx + transY.value,
            animW.value,
            animH.value,
            animRot.value,
          );
        }),
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
      anchorX,
      anchorY,
      isInteracting,
      pendingCommit,
      element.id,
      dispatchTransformCommit,
      updateTooltipJS,
    ],
  );

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          isInteracting.value = true;
          pendingCommit.value = false;
          startRot.value = animRot.value;
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
          const touchX = cx + e.translationX / z;
          const touchY = -ROTATE_STEM + e.translationY / z;
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
          runOnJS(dispatchTransformCommit)(
            baseLeftPx + transX.value,
            baseTopPx + transY.value,
            animW.value,
            animH.value,
            animRot.value,
          );
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
      dispatchTransformCommit,
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
    opacity: element.opacity ?? 1,
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
          scale={Math.min(sx, sy)}
        />
      </View>
    );
  }

  const borderStrokeColor = selectionColor || '#2563EB';

  return (
    <Animated.View style={containerStyle} collapsable={false}>
      <GestureDetector gesture={combinedBodyGesture}>
        <Animated.View collapsable={false} style={contentScaleStyle}>
          <ElementContentView
            element={element}
            widthPx={baseWidthPx}
            heightPx={baseHeightPx}
            scale={Math.min(sx, sy)}
          />
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

          <View pointerEvents="box-none" style={styles.rotateWrap}>
            <View style={[styles.rotateStem, { backgroundColor: borderStrokeColor }]} />
            <GestureDetector gesture={combinedRotateGesture}>
              <View
                hitSlop={12}
                style={[styles.rotateAnchor, { backgroundColor: borderStrokeColor }]}>
                <AppIcon name="arrow.clockwise" tintColor="#FFFFFF" size={12} />
              </View>
            </GestureDetector>
          </View>

          <HandleAnchor
            position="nw"
            gesture={createHandleGesture('nw')}
            borderColor={borderStrokeColor}
            style={styles.handleNW}
          />
          <HandleAnchor
            position="ne"
            gesture={createHandleGesture('ne')}
            borderColor={borderStrokeColor}
            style={styles.handleNE}
          />
          <HandleAnchor
            position="se"
            gesture={createHandleGesture('se')}
            borderColor={borderStrokeColor}
            style={styles.handleSE}
          />
          <HandleAnchor
            position="sw"
            gesture={createHandleGesture('sw')}
            borderColor={borderStrokeColor}
            style={styles.handleSW}
          />
          <HandleAnchor
            position="n"
            gesture={createHandleGesture('n')}
            borderColor={borderStrokeColor}
            style={styles.handleN}
          />
          <HandleAnchor
            position="e"
            gesture={createHandleGesture('e')}
            borderColor={borderStrokeColor}
            style={styles.handleE}
          />
          <HandleAnchor
            position="s"
            gesture={createHandleGesture('s')}
            borderColor={borderStrokeColor}
            style={styles.handleS}
          />
          <HandleAnchor
            position="w"
            gesture={createHandleGesture('w')}
            borderColor={borderStrokeColor}
            style={styles.handleW}
          />

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
  position: _pos,
  gesture,
  borderColor,
  style,
}: {
  position: HandlePosition;
  gesture: ReturnType<typeof Gesture.Pan>;
  borderColor: string;
  style: object;
}) {
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
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
