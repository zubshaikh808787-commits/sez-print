import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path as SvgPath, Line as SvgLine } from 'react-native-svg';
import { AppIcon } from '@/components/app-icon';
import { type LiveRulerBounds } from '@/components/canvas-rulers';
import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, textBlockHeightMm, type LabelElement, type MediaShape } from '@/lib/label-document';
import { computeTextElementHeightMm } from '@/lib/text-metrics';
import { clampToLabelBounds, fitFontSizeToLabel } from '@/lib/editor/label-bounds';
import { DIVIDER_HIT_SIZE_PX } from '@/lib/editor/canvas-split';
import { finiteMm, roundMm } from '@/lib/editor/engine';
import { fullyInsideLabelMm } from '@/lib/editor/safe-mode';
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { grabOffsetMm } from '@/lib/editor/view-transform';
import { createFrameThrottled } from '@/lib/editor/drag-layer';
import {
  aspectRatioOf,
  resizeMemberByScale,
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

export type TransformStartKind = 'move' | 'resize';

import { type ElementAnchorRect } from '@/lib/editor/quick-value';

export type KonvaTransformerProps = {
  element: LabelElement;
  pxPerMM: number;
  padZoom: number;
  selected: boolean;
  selectionColor: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  /** Stock shape from the document — the print capture uses this, so the editor must too. */
  mediaShape?: MediaShape;
  liveBounds?: LiveRulerBounds;
  deselectGesture?: GestureType;
  activeSelectedIdSv?: SharedValue<string>;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  multipleMode?: boolean;
  /** 1 when selectedIds.length > 1 */
  groupEligibleSv?: SharedValue<number>;
  groupAnchorIdSv?: SharedValue<string>;
  groupDeltaLeftMm?: SharedValue<number>;
  groupDeltaTopMm?: SharedValue<number>;
  groupScaleXSv?: SharedValue<number>;
  groupScaleYSv?: SharedValue<number>;
  /** 0 = east, 1 = south */
  groupHandleSv?: SharedValue<number>;
  groupScaleMinSv?: SharedValue<number>;
  groupScaleMaxSv?: SharedValue<number>;
  onGroupResizeHandleBegin?: (handle: 'e' | 's') => void;
  /** 1 when Safe Mode is on — drags may leave the label, then spring back on release. */
  safeModeSv?: SharedValue<number>;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onQuickEdit?: (id: string, anchorRect?: ElementAnchorRect) => void;
  onTransformStart?: (id: string, kind: TransformStartKind) => void;
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
const TOOLTIP_MS = 80;

/**
 * Drag activation / tap tolerance — restored to the 6b97449 "deliberate drag" feel.
 * A finger must travel >10px before the element starts following (kills sudden-drag
 * on what was meant to be a tap), and a gesture that ends under 20px of travel snaps
 * back and is treated as a tap/select rather than a committed move.
 */
const DRAG_ACTIVATE_DIST_SQ_PX = 100; // (10px)^2
const TAP_MAX_DIST_SQ_PX = 400; // (20px)^2

/** Standard double-tap window. Wider gaps are two unrelated taps, not a double tap. */
const DOUBLE_TAP_MAX_GAP_MS = 300;
/** Soft overshoot so a Safe Mode release outside the label settles back inside. */
const SAFE_MODE_SPRING = { damping: 12, stiffness: 180, mass: 0.6 };

/** Below this the two reports are one physical tap double-counted. */
const DOUBLE_TAP_MIN_GAP_MS = 30;
/** Both taps must land on roughly the same spot, not opposite ends of a wide element. */
const DOUBLE_TAP_MAX_DIST_PX = 32;
/** Dedupes the native, UI-thread, and JS-thread detectors firing for one gesture. */
const DOUBLE_TAP_DEDUPE_MS = 350;

function asResizeBehavior(value: string | ResizeBehavior): ResizeBehavior {
  'worklet';
  if (value === 'aspect' || value === 'square' || value === 'height' || value === 'width') {
    return value;
  }
  return 'width';
}

function logMultiTransformBox(
  phase: string,
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  console.log(
    `[multi-transform] ${phase} ${id} l=${left.toFixed(2)} t=${top.toFixed(2)} w=${width.toFixed(2)} h=${height.toFixed(2)}`,
  );
}

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
  mediaShape,
  liveBounds,
  deselectGesture,
  activeSelectedIdSv,
  topBarSelectionVisibleSv,
  bottomPanelVisibleSv,
  multipleMode = false,
  groupEligibleSv,
  groupAnchorIdSv,
  groupDeltaLeftMm,
  groupDeltaTopMm,
  groupScaleXSv,
  groupScaleYSv,
  groupHandleSv,
  groupScaleMinSv,
  groupScaleMaxSv,
  onGroupResizeHandleBegin,
  onSelect,
  onOpenPanel,
  onEditText,
  onQuickEdit,
  onTransformStart,
  onTransformMove,
  onTransformEnd,
  onQuickRotate,
  pointerToMm,
  snapMoveMm,
  safeModeSv,
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
  // Border shape comes from the stock shape, never from how square the label
  // happens to be. The print capture decides this from `mediaShape`
  // (label-preview -> element-renderer), so a squareness guess here meant a
  // square rectangular label drew an ellipse ring on screen and a rectangle on paper.
  const borderMediaShape = element.type === 'border' ? mediaShape : undefined;

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
  const lastTooltipTimeSv = useSharedValue(0);
  const lastTapTimeSv = useSharedValue(0);
  const lastTapXSv = useSharedValue(0);
  const lastTapYSv = useSharedValue(0);
  const tapHandledSv = useSharedValue(false);

  const isTextElement = element.type === 'text' || element.type === 'degrees';
  const isAutoHeight = isTextElement && element.autoTextHeight !== false && element.autoWrapping !== 'Close';
  const textContent =
    element.type === 'text'
      ? (element.contentType === 'Data Source' && element.columnNameContent ? `{${element.columnNameContent}}` : element.text)
      : element.type === 'degrees'
        ? (element.contentType === 'Data Source' && element.columnNameContent ? `{${element.columnNameContent}}` : element.content)
        : '';
  const textFontSize = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
  const textAutoWrapping = 'autoWrapping' in element ? element.autoWrapping ?? 'Word' : 'Word';
  const textLineSpacing = 'lineSpacing' in element ? element.lineSpacing ?? '1.0' : '1.0';
  const textCharSpacing = 'charSpacing' in element && typeof element.charSpacing === 'number' ? element.charSpacing : 0;
  const textBold = 'bold' in element ? element.bold ?? false : false;
  const textVerticalDisplay = 'verticalDisplay' in element ? element.verticalDisplay ?? false : false;

  const isAutoTextSv = useSharedValue(isAutoHeight);
  const textContentSv = useSharedValue(textContent);
  const textFontSizeSv = useSharedValue(textFontSize);
  const autoWrappingSv = useSharedValue(textAutoWrapping);
  const lineSpacingSv = useSharedValue(textLineSpacing);
  const charSpacingSv = useSharedValue(textCharSpacing);
  const boldSv = useSharedValue(textBold);
  const verticalDisplaySv = useSharedValue(textVerticalDisplay);

  const isInteracting = useSharedValue(false);
  const liftSv = useSharedValue(1);
  const selectedSv = useSharedValue(selected);
  const anchorStartLeftMmSv = useSharedValue(finiteMm(element.left));
  const anchorStartTopMmSv = useSharedValue(finiteMm(element.top));
  const hasMovedSv = useSharedValue(false);
  const followerStartLeftMmSv = useSharedValue(finiteMm(element.left));
  const followerStartTopMmSv = useSharedValue(finiteMm(element.top));
  const followerStartWidthMmSv = useSharedValue(sizeMm.width);
  const followerStartHeightMmSv = useSharedValue(sizeMm.height);
  const resizeBehaviorESv = useSharedValue(resizePolicy.behavior.e ?? 'none');
  const resizeBehaviorSSv = useSharedValue(resizePolicy.behavior.s ?? 'none');
  const beginTimeSv = useSharedValue(0);
  const tooltipRef = useRef<TooltipHandle | null>(null);
  const lastTooltipAt = useRef(0);
  const containerRef = useRef<View>(null);

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
    isAutoTextSv.value = isAutoHeight;
    textContentSv.value = textContent;
    textFontSizeSv.value = textFontSize;
    autoWrappingSv.value = textAutoWrapping;
    lineSpacingSv.value = textLineSpacing;
    charSpacingSv.value = textCharSpacing;
    boldSv.value = textBold;
    verticalDisplaySv.value = textVerticalDisplay;
    resizeBehaviorESv.value = resizePolicy.behavior.e ?? 'none';
    resizeBehaviorSSv.value = resizePolicy.behavior.s ?? 'none';
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
    isAutoHeight,
    textContent,
    textFontSize,
    textAutoWrapping,
    textLineSpacing,
    textCharSpacing,
    textBold,
    textVerticalDisplay,
    padZoomSv,
    sizeWMmSv,
    sizeHMmSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
    minResizeMmSv,
    aspectSv,
    isAutoTextSv,
    textContentSv,
    textFontSizeSv,
    autoWrappingSv,
    lineSpacingSv,
    charSpacingSv,
    boldSv,
    verticalDisplaySv,
    resizeBehaviorESv,
    resizeBehaviorSSv,
    resizePolicy.behavior.e,
    resizePolicy.behavior.s,
  ]);

  useEffect(() => {
    // Don't clobber an in-progress gesture. A gesture folds its own final
    // position/size into these shared values synchronously as soon as it ends.
    const groupActive = Boolean(
      groupAnchorIdSv?.value &&
        groupAnchorIdSv.value !== '' &&
        selectedSv.value,
    );
    if (isInteracting.value || groupActive) {
      return;
    }

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
    groupAnchorIdSv,
    selectedSv,
    startW,
    startH,
    liftSv,
  ]);

  const lastTapRef = useRef({ id: '', time: 0 });
  const pendingRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({
    onSelect,
    onOpenPanel,
    onEditText,
    onQuickEdit,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    selected,
    multipleMode,
  });
  callbacksRef.current = {
    onSelect,
    onOpenPanel,
    onEditText,
    onQuickEdit,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    selected,
    multipleMode,
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
      const clamped = clampToLabelBounds(
        { left: leftMm, top: topMm, width: widthMm, height: heightMm },
        { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        { anchor: 'body' },
      );
      const roundedLeft = clamped.left;
      const roundedTop = clamped.top;
      logMultiTransformBox('commit', element.id, roundedLeft, roundedTop, widthMm, heightMm);

      if (Math.abs(roundedLeft - element.left) < 0.005 && Math.abs(roundedTop - element.top) < 0.005) {
        if (groupAnchorIdSv?.value === element.id) {
          groupAnchorIdSv.value = '';
          if (groupDeltaLeftMm) groupDeltaLeftMm.value = 0;
          if (groupDeltaTopMm) groupDeltaTopMm.value = 0;
        }
        isInteracting.value = false;
        return;
      }

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: roundedLeft,
        topMm: roundedTop,
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        rotation: ((Math.round(baseRotation) % 360) + 360) % 360,
      });
      isInteracting.value = false;
    },
    [
      sizeMm.width,
      sizeMm.height,
      canvasWidthMm,
      canvasHeightMm,
      element.id,
      element.left,
      element.top,
      baseRotation,
      isInteracting,
      groupAnchorIdSv,
      groupDeltaLeftMm,
      groupDeltaTopMm,
    ],
  );

  useAnimatedReaction(
    () => groupAnchorIdSv?.value ?? '',
    (anchorId) => {
      if (anchorId && anchorId !== element.id && selectedSv.value) {
        followerStartLeftMmSv.value =
          (originLeftSv.value + transX.value) / sxSv.value;
        followerStartTopMmSv.value =
          (originTopSv.value + transY.value) / sySv.value;
        followerStartWidthMmSv.value = animW.value / sxSv.value;
        followerStartHeightMmSv.value = animH.value / sySv.value;
      }
    },
  );

  useAnimatedReaction(
    () => ({
      anchor: groupAnchorIdSv?.value ?? '',
      dx: groupDeltaLeftMm?.value ?? 0,
      dy: groupDeltaTopMm?.value ?? 0,
      scaleX: groupScaleXSv?.value ?? 1,
      scaleY: groupScaleYSv?.value ?? 1,
      handle: groupHandleSv?.value ?? 0,
    }),
    (cur) => {
      if (!cur.anchor || cur.anchor === element.id || !selectedSv.value) {
        return;
      }
      const handle: ResizeAnchor = cur.handle === 1 ? 's' : 'e';
      const rawBehavior = handle === 'e' ? resizeBehaviorESv.value : resizeBehaviorSSv.value;
      let naturalHeightMm: number | undefined;
      if (isAutoTextSv.value && handle === 'e') {
        naturalHeightMm = computeTextElementHeightMm({
          text: textContentSv.value,
          fontSize: textFontSizeSv.value,
          widthMm: followerStartWidthMmSv.value * cur.scaleX,
          autoWrapping: autoWrappingSv.value,
          lineSpacing: lineSpacingSv.value,
          charSpacing: charSpacingSv.value,
          bold: boldSv.value,
          verticalDisplay: verticalDisplaySv.value,
        });
      }
      const start = {
        left: followerStartLeftMmSv.value,
        top: followerStartTopMmSv.value,
        width: followerStartWidthMmSv.value,
        height: followerStartHeightMmSv.value,
      };
      const box =
        rawBehavior === 'none'
          ? start
          : resizeMemberByScale({
              start,
              handle,
              behavior: asResizeBehavior(rawBehavior),
              scaleX: cur.scaleX,
              scaleY: cur.scaleY,
              aspect: aspectSv.value > 0 ? aspectSv.value : 1,
              minMm: minResizeMmSv.value,
              canvas: { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
              naturalHeightMm,
            });
      originLeftSv.value = (box.left + cur.dx) * sxSv.value;
      originTopSv.value = (box.top + cur.dy) * sySv.value;
      animW.value = Math.max(1, box.width * sxSv.value);
      animH.value = Math.max(1, box.height * sySv.value);
      transX.value = 0;
      transY.value = 0;
    },
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

  /** Committed resize: same resizeMemberByScale as live preview. Origin never moves. */
  const dispatchResizeCommit = useCallback(
    (handle: ResizeAnchor, nextWPx: number, nextHPx: number, rot: number) => {
      tooltipRef.current?.setText(null);
      const behavior = resizePolicy.behavior[handle];
      if (!behavior) {
        isInteracting.value = false;
        return;
      }
      const start = resizeStartRef.current;
      const startW = Math.max(0.001, start.width);
      const startH = Math.max(0.001, start.height);
      const scaleX = pxToMm(nextWPx, pxPerMMSafe) / startW;
      const scaleY = pxToMm(nextHPx, pxPerMMSafe) / startH;

      let fontSize: number | undefined;
      let naturalHeightMm: number | undefined;
      if (element.type === 'text' || element.type === 'degrees') {
        const rawText =
          element.contentType === 'Data Source' && element.columnNameContent
            ? `{${element.columnNameContent}}`
            : 'text' in element
              ? element.text
              : element.content;
        const fs = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
        naturalHeightMm = computeTextElementHeightMm({
          text: rawText,
          fontSize: fs,
          widthMm: startW * scaleX,
          autoWrapping: element.autoWrapping ?? 'Word',
          lineSpacing: element.lineSpacing ?? '1.0',
          charSpacing: element.charSpacing ?? 0,
          bold: element.bold ?? false,
          verticalDisplay: element.verticalDisplay ?? false,
        });
        fontSize = fs;
      } else if (element.type === 'time') {
        const fs = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
        naturalHeightMm = textBlockHeightMm(fs, 1);
        fontSize = fs;
      }

      const next = resizeMemberByScale({
        start,
        handle,
        behavior,
        scaleX,
        scaleY,
        aspect: aspectRatioOf(element),
        minMm: resizePolicy.minMm,
        canvas: { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
        naturalHeightMm,
      });

      const rotation = ((Math.round(rot) % 360) + 360) % 360;
      logMultiTransformBox('commit', element.id, next.left, next.top, next.width, next.height);

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: next.height,
        rotation,
        fontSize,
      });
      isInteracting.value = false;
    },
    [
      pxPerMMSafe,
      canvasWidthMm,
      canvasHeightMm,
      element,
      resizePolicy,
      isInteracting,
    ],
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

  const bodyHitSlop = useMemo(() => {
    const target = 48;
    const minSlop = 16;
    return {
      top: Math.max(minSlop, (target - Math.max(1, baseHeightPx)) / 2),
      bottom: Math.max(minSlop, (target - Math.max(1, baseHeightPx)) / 2),
      left: Math.max(minSlop, (target - Math.max(1, baseWidthPx)) / 2),
      right: Math.max(minSlop, (target - Math.max(1, baseWidthPx)) / 2),
    };
  }, [baseHeightPx, baseWidthPx]);

  const notifyTransformStartJS = useCallback((id: string, kind: TransformStartKind) => {
    callbacksRef.current.onTransformStart?.(id, kind);
  }, []);

  /** Kept in the gesture closure so Reanimated worklets never capture a missing identifier. */
  const notifySelectJS = useCallback((_id: string) => {
  }, []);

  const notifyGroupResizeHandleBeginJS = useCallback(
    (handle: 'e' | 's') => {
      onGroupResizeHandleBegin?.(handle);
    },
    [onGroupResizeHandleBegin],
  );

  const lastDoubleTapTimeRef = useRef(0);
  const lastLiveLogAtRef = useRef(0);
  const cancelPendingRemoveJS = useCallback(() => {
    if (pendingRemoveTimerRef.current) {
      clearTimeout(pendingRemoveTimerRef.current);
      pendingRemoveTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancelPendingRemoveJS(), [cancelPendingRemoveJS]);

  const logLiveBoxJS = useCallback(
    (left: number, top: number, width: number, height: number) => {
      const now = Date.now();
      if (now - lastLiveLogAtRef.current < 200) return;
      lastLiveLogAtRef.current = now;
      logMultiTransformBox('live', element.id, left, top, width, height);
    },
    [element.id],
  );

  const triggerDoubleTapJS = useCallback(() => {
    cancelPendingRemoveJS();
    const now = Date.now();
    if (now - lastDoubleTapTimeRef.current < DOUBLE_TAP_DEDUPE_MS) {
      return;
    }
    lastDoubleTapTimeRef.current = now;
    lastTapRef.current = { id: '', time: 0 };
    lastTapTimeSv.value = 0;

    if (!callbacksRef.current.selected) {
      callbacksRef.current.onSelect(element.id);
    }

    const openWithAnchor = (anchor?: ElementAnchorRect) => {
      if (
        element.type === 'text' ||
        element.type === 'barcode' ||
        element.type === 'qrcode' ||
        element.type === 'arctext' ||
        element.type === 'degrees'
      ) {
        if (callbacksRef.current.onQuickEdit) {
          callbacksRef.current.onQuickEdit(element.id, anchor);
        } else if (element.type === 'text' || element.type === 'degrees') {
          callbacksRef.current.onEditText(element.id);
        } else {
          callbacksRef.current.onOpenPanel(element.id);
        }
      } else {
        callbacksRef.current.onOpenPanel(element.id);
      }
    };

    if (containerRef.current && typeof (containerRef.current as any).measureInWindow === 'function') {
      (containerRef.current as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        if (Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0) {
          openWithAnchor({ x, y, width, height });
        } else {
          openWithAnchor();
        }
      });
    } else {
      openWithAnchor();
    }
  }, [element.id, element.type, lastTapTimeSv, cancelPendingRemoveJS]);

  const triggerSingleTapJS = useCallback(() => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble =
      last.id === element.id &&
      now - last.time > DOUBLE_TAP_MIN_GAP_MS &&
      now - last.time < DOUBLE_TAP_MAX_GAP_MS;
    lastTapRef.current = { id: element.id, time: now };

    if (isDouble) {
      lastTapRef.current = { id: '', time: 0 };
      triggerDoubleTapJS();
      return;
    }

    // Add-to-selection is immediate. Remove is deferred so a second tap
    // within the double-tap window can open quick-edit instead of toggling off.
    if (callbacksRef.current.multipleMode && callbacksRef.current.selected) {
      cancelPendingRemoveJS();
      pendingRemoveTimerRef.current = setTimeout(() => {
        pendingRemoveTimerRef.current = null;
        callbacksRef.current.onSelect(element.id);
      }, DOUBLE_TAP_MAX_GAP_MS);
      return;
    }

    callbacksRef.current.onSelect(element.id);
  }, [element.id, triggerDoubleTapJS, cancelPendingRemoveJS]);

  const bodyDragGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(true)
      .minDistance(0)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .hitSlop(bodyHitSlop);

    if (deselectGesture) {
      pan.blocksExternalGesture(deselectGesture);
    }

    return pan
      .onBegin((_e) => {
        'worklet';
        const tNow = Date.now();
        beginTimeSv.value = tNow;
        hasMovedSv.value = false;
        tapHandledSv.value = false;
        // Prime selection chrome and chrome bars on the UI thread before JS catches up.
        isInteracting.value = true;
        selectedSv.value = true;
        if (activeSelectedIdSv) {
          activeSelectedIdSv.value = element.id;
        }
        if (topBarSelectionVisibleSv) {
          topBarSelectionVisibleSv.value = 1;
        }
        if (bottomPanelVisibleSv) {
          bottomPanelVisibleSv.value = 1;
        }
        originLeftSv.value = originLeftSv.value + transX.value;
        originTopSv.value = originTopSv.value + transY.value;
        transX.value = 0;
        transY.value = 0;
      })
      .onStart((_e) => {
        'worklet';
      })
      .onUpdate((e) => {
        'worklet';
        const distSq = e.translationX * e.translationX + e.translationY * e.translationY;
        if (!hasMovedSv.value) {
          if (element.lockMovement) {
            return;
          }
          if (distSq < DRAG_ACTIVATE_DIST_SQ_PX) {
            // Under 10px: stationary touch noise / tap intent — don't start dragging.
            return;
          }
          hasMovedSv.value = true;
          liftSv.value = DRAG_LIFT_OPACITY;
          runOnJS(cancelPendingRemoveJS)();

          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = element.id;
            anchorStartLeftMmSv.value = originLeftSv.value / sxSv.value;
            anchorStartTopMmSv.value = originTopSv.value / sySv.value;
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
            if (groupScaleXSv) groupScaleXSv.value = 1;
            if (groupScaleYSv) groupScaleYSv.value = 1;
          }

          runOnJS(notifyTransformStartJS)(element.id, 'move');
        }

        if (element.lockMovement) {
          return;
        }

        const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
        const dx = e.translationX / z;
        const dy = e.translationY / z;

        const curLeftMm = (originLeftSv.value + dx) / sxSv.value;
        const curTopMm = (originTopSv.value + dy) / sySv.value;
        const curWMm = animW.value / sxSv.value;
        const curHMm = animH.value / sySv.value;

        const placed =
          safeModeSv && safeModeSv.value > 0.5
            ? { left: curLeftMm, top: curTopMm, width: curWMm, height: curHMm }
            : clampToLabelBounds(
                { left: curLeftMm, top: curTopMm, width: curWMm, height: curHMm },
                { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
                { anchor: 'body' },
              );

        const targetLeftPx = placed.left * sxSv.value;
        const targetTopPx = placed.top * sySv.value;

        transX.value = targetLeftPx - originLeftSv.value;
        transY.value = targetTopPx - originTopSv.value;

        if (liveBounds) {
          liveBounds.leftMm.value = placed.left;
          liveBounds.topMm.value = placed.top;
          liveBounds.widthMm.value = placed.width;
          liveBounds.heightMm.value = placed.height;
          liveBounds.visible.value = true;
        }

        if (
          groupAnchorIdSv &&
          groupAnchorIdSv.value === element.id &&
          groupDeltaLeftMm &&
          groupDeltaTopMm
        ) {
          groupDeltaLeftMm.value = placed.left - anchorStartLeftMmSv.value;
          groupDeltaTopMm.value = placed.top - anchorStartTopMmSv.value;
        }

        runOnJS(logLiveBoxJS)(placed.left, placed.top, placed.width, placed.height);
      })
      .onEnd((e) => {
        'worklet';
        liftSv.value = 1;
        const distSq = e.translationX * e.translationX + e.translationY * e.translationY;
        // Under 20px translation, or never crossed the drag threshold, or locked: treat as a tap.
        const isTap = !hasMovedSv.value || distSq < TAP_MAX_DIST_SQ_PX || element.lockMovement;

        if (isTap) {
          tapHandledSv.value = true;
          transX.value = 0;
          transY.value = 0;
          isInteracting.value = false;

          if (
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = '';
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
          }

          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;
          const dxTap = e.absoluteX - lastTapXSv.value;
          const dyTap = e.absoluteY - lastTapYSv.value;
          const distKnown = Number.isFinite(dxTap) && Number.isFinite(dyTap);
          const nearLastTap =
            !distKnown ||
            dxTap * dxTap + dyTap * dyTap <=
              DOUBLE_TAP_MAX_DIST_PX * DOUBLE_TAP_MAX_DIST_PX;

          if (
            deltaSinceLastTap > DOUBLE_TAP_MIN_GAP_MS &&
            deltaSinceLastTap < DOUBLE_TAP_MAX_GAP_MS &&
            nearLastTap
          ) {
            // Confirmed double tap on UI thread
            lastTapTimeSv.value = 0;
            runOnJS(triggerDoubleTapJS)();
          } else {
            // First tap
            lastTapTimeSv.value = tNow;
            lastTapXSv.value = e.absoluteX;
            lastTapYSv.value = e.absoluteY;
            runOnJS(triggerSingleTapJS)();
          }
        } else {
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;

          let commitLeftPx = originLeftSv.value;
          let commitTopPx = originTopSv.value;
          if (safeModeSv && safeModeSv.value > 0.5) {
            const leftMm = originLeftSv.value / sxSv.value;
            const topMm = originTopSv.value / sySv.value;
            const inside = fullyInsideLabelMm(
              leftMm,
              topMm,
              animW.value / sxSv.value,
              animH.value / sySv.value,
              canvasWMmSv.value,
              canvasHMmSv.value,
            );
            commitLeftPx = inside.left * sxSv.value;
            commitTopPx = inside.top * sySv.value;
            const bounce =
              Math.abs(commitLeftPx - originLeftSv.value) > 0.5 ||
              Math.abs(commitTopPx - originTopSv.value) > 0.5;
            if (
              groupAnchorIdSv &&
              groupAnchorIdSv.value === element.id &&
              groupDeltaLeftMm &&
              groupDeltaTopMm
            ) {
              groupDeltaLeftMm.value = inside.left - anchorStartLeftMmSv.value;
              groupDeltaTopMm.value = inside.top - anchorStartTopMmSv.value;
            }
            if (liveBounds && bounce) {
              liveBounds.leftMm.value = withSpring(inside.left, SAFE_MODE_SPRING);
              liveBounds.topMm.value = withSpring(inside.top, SAFE_MODE_SPRING);
            }
            if (bounce) {
              originLeftSv.value = withSpring(commitLeftPx, SAFE_MODE_SPRING);
              originTopSv.value = withSpring(commitTopPx, SAFE_MODE_SPRING, (finished) => {
                if (finished) {
                  runOnJS(commitDragFromPointer)(0, 0, commitLeftPx, commitTopPx);
                }
              });
              return;
            }
          }

          runOnJS(commitDragFromPointer)(
            e.absoluteX,
            e.absoluteY,
            commitLeftPx,
            commitTopPx,
          );
        }
      })
      .onFinalize((_e, success) => {
        'worklet';
        if (!hasMovedSv.value) {
          isInteracting.value = false;
        }
        liftSv.value = 1;
        transX.value = 0;
        transY.value = 0;

        // If onEnd did not run (e.g. pan failed because touch ended before drag threshold),
        // but the finger did not drag, this was a stationary tap! Process it here!
        if (!tapHandledSv.value && !hasMovedSv.value) {
          tapHandledSv.value = true;

          if (
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupDeltaLeftMm &&
            groupDeltaTopMm
          ) {
            groupAnchorIdSv.value = '';
            groupDeltaLeftMm.value = 0;
            groupDeltaTopMm.value = 0;
          }

          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;
          // This fallback can run without an event, so NaN marks the position
          // unknown and the distance gate is skipped rather than compared to 0,0.
          const tapX = _e ? _e.absoluteX : NaN;
          const tapY = _e ? _e.absoluteY : NaN;
          const dxTap = tapX - lastTapXSv.value;
          const dyTap = tapY - lastTapYSv.value;
          const distKnown = Number.isFinite(dxTap) && Number.isFinite(dyTap);
          const nearLastTap =
            !distKnown ||
            dxTap * dxTap + dyTap * dyTap <=
              DOUBLE_TAP_MAX_DIST_PX * DOUBLE_TAP_MAX_DIST_PX;

          if (
            deltaSinceLastTap > DOUBLE_TAP_MIN_GAP_MS &&
            deltaSinceLastTap < DOUBLE_TAP_MAX_GAP_MS &&
            nearLastTap
          ) {
            lastTapTimeSv.value = 0;
            runOnJS(triggerDoubleTapJS)();
          } else {
            lastTapTimeSv.value = tNow;
            lastTapXSv.value = tapX;
            lastTapYSv.value = tapY;
            runOnJS(triggerSingleTapJS)();
          }
        }
      });
  }, [
    element.lockMovement,
    bodyHitSlop,
    deselectGesture,
    commitDragFromPointer,
    element.id,
    originLeftSv,
    originTopSv,
    transX,
    transY,
    animW,
    animH,
    isInteracting,
    liftSv,
    selectedSv,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    padZoomSv,
    canvasWMmSv,
    canvasHMmSv,
    sxSv,
    sySv,
    liveBounds,
    hasMovedSv,
    beginTimeSv,
    lastTapTimeSv,
    lastTapXSv,
    lastTapYSv,
    tapHandledSv,
    notifyTransformStartJS,
    notifySelectJS,
    activeSelectedIdSv,
    groupEligibleSv,
    groupAnchorIdSv,
    groupDeltaLeftMm,
    groupDeltaTopMm,
    groupScaleXSv,
    groupScaleYSv,
    anchorStartLeftMmSv,
    anchorStartTopMmSv,
    triggerDoubleTapJS,
    triggerSingleTapJS,
    safeModeSv,
    cancelPendingRemoveJS,
    logLiveBoxJS,
  ]);

  const createHandleGesture = useCallback(
    (handle: HandlePosition, behavior: ResizeBehavior) => {
      const handlePan = Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false);

      if (deselectGesture) {
        handlePan.blocksExternalGesture(bodyDragGesture, deselectGesture);
      } else {
        handlePan.blocksExternalGesture(bodyDragGesture);
      }

      return handlePan
        .onStart((_e) => {
          'worklet';
          isInteracting.value = true;
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
          runOnJS(notifyTransformStartJS)(element.id, 'resize');
          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupScaleXSv &&
            groupScaleYSv
          ) {
            groupAnchorIdSv.value = element.id;
            groupScaleXSv.value = 1;
            groupScaleYSv.value = 1;
            if (groupHandleSv) groupHandleSv.value = handle === 's' ? 1 : 0;
            if (groupDeltaLeftMm) groupDeltaLeftMm.value = 0;
            if (groupDeltaTopMm) groupDeltaTopMm.value = 0;
            runOnJS(notifyGroupResizeHandleBeginJS)(handle);
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

          const originW = Math.max(1, startW.value);
          const originH = Math.max(1, startH.value);
          let scaleX = 1;
          let scaleY = 1;
          if (handle === 'e') {
            scaleX = (originW + dx) / originW;
            if (behavior === 'square' || behavior === 'aspect') {
              scaleY = scaleX;
            }
          } else {
            scaleY = (originH + dy) / originH;
            if (behavior === 'square' || behavior === 'aspect') {
              scaleX = scaleY;
            }
          }

          if (
            groupEligibleSv &&
            groupEligibleSv.value === 1 &&
            groupAnchorIdSv &&
            groupAnchorIdSv.value === element.id &&
            groupScaleXSv &&
            groupScaleYSv &&
            groupScaleMinSv &&
            groupScaleMaxSv
          ) {
            const driving = handle === 'e' ? scaleX : scaleY;
            const capped = Math.min(
              Math.max(driving, groupScaleMinSv.value),
              groupScaleMaxSv.value,
            );
            if (handle === 'e') {
              scaleX = capped;
              scaleY = behavior === 'square' || behavior === 'aspect' ? capped : 1;
            } else {
              scaleY = capped;
              scaleX = behavior === 'square' || behavior === 'aspect' ? capped : 1;
            }
            groupScaleXSv.value = scaleX;
            groupScaleYSv.value = scaleY;
            if (groupHandleSv) groupHandleSv.value = handle === 's' ? 1 : 0;
          }

          const startWMm = originW / sxSv.value;
          const startHMm = originH / sySv.value;
          let naturalHeightMm: number | undefined;
          if (isAutoTextSv.value && handle === 'e') {
            naturalHeightMm = computeTextElementHeightMm({
              text: textContentSv.value,
              fontSize: textFontSizeSv.value,
              widthMm: startWMm * scaleX,
              autoWrapping: autoWrappingSv.value,
              lineSpacing: lineSpacingSv.value,
              charSpacing: charSpacingSv.value,
              bold: boldSv.value,
              verticalDisplay: verticalDisplaySv.value,
            });
          }

          const box = resizeMemberByScale({
            start: {
              left: originLeftSv.value / sxSv.value,
              top: originTopSv.value / sySv.value,
              width: startWMm,
              height: startHMm,
            },
            handle,
            behavior,
            scaleX,
            scaleY,
            aspect: aspectSv.value > 0 ? aspectSv.value : 1,
            minMm: minResizeMmSv.value,
            canvas: { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
            naturalHeightMm,
          });

          animW.value = Math.max(1, box.width * sxSv.value);
          animH.value = Math.max(1, box.height * sySv.value);
          transX.value = 0;
          transY.value = 0;

          if (liveBounds) {
            liveBounds.leftMm.value = box.left;
            liveBounds.topMm.value = box.top;
            liveBounds.widthMm.value = box.width;
            liveBounds.heightMm.value = box.height;
            liveBounds.visible.value = true;
          }

          runOnJS(logLiveBoxJS)(box.left, box.top, box.width, box.height);

          const now = Date.now();
          if (now - lastTooltipTimeSv.value >= 80) {
            lastTooltipTimeSv.value = now;
            runOnJS(updateTooltipJS)(animW.value, animH.value);
          }
        })
        .onEnd(() => {
          'worklet';
          transX.value = 0;
          transY.value = 0;
          runOnJS(dispatchResizeCommit)(handle, animW.value, animH.value, animRot.value);
        });
    },
    [
      deselectGesture,
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
      element.id,
      dispatchResizeCommit,
      captureResizeStartFromPx,
      updateTooltipJS,
      notifyTransformStartJS,
      notifyGroupResizeHandleBeginJS,
      groupEligibleSv,
      groupAnchorIdSv,
      groupScaleXSv,
      groupScaleYSv,
      groupHandleSv,
      groupScaleMinSv,
      groupScaleMaxSv,
      groupDeltaLeftMm,
      groupDeltaTopMm,
      bodyDragGesture,
      padZoomSv,
      canvasWMmSv,
      canvasHMmSv,
      sxSv,
      sySv,
      minResizeMmSv,
      aspectSv,
      isAutoTextSv,
      textContentSv,
      textFontSizeSv,
      autoWrappingSv,
      lineSpacingSv,
      charSpacingSv,
      boldSv,
      verticalDisplaySv,
      liveBounds,
      lastTooltipTimeSv,
      logLiveBoxJS,
    ],
  );

  const handleGestures = useMemo(() => {
    const map: Partial<Record<HandlePosition, ReturnType<typeof createHandleGesture>>> = {};
    for (const anchor of resizePolicy.anchors) {
      const b = resizePolicy.behavior[anchor];
      if (b) map[anchor] = createHandleGesture(anchor, b);
    }
    return map;
  }, [createHandleGesture, resizePolicy]);

  const containerStyle = useAnimatedStyle(() => {
    const liveW = Math.max(1, animW.value);
    const liveH = Math.max(1, animH.value);
    const liveLeft = originLeftSv.value + transX.value;
    const liveTop = originTopSv.value + transY.value;
    const liveRot = animRot.value;
    const isPrimaryTouch = activeSelectedIdSv?.value === element.id;
    const zBoost = isPrimaryTouch ? 100 : selectedSv.value ? 50 : 0;

    return {
      position: 'absolute' as const,
      left: liveLeft,
      top: liveTop,
      width: liveW,
      height: liveH,
      transform: [{ rotate: `${liveRot}deg` }],
      opacity: (element.opacity ?? 1) * liftSv.value,
      zIndex: zBoost + (element.zIndex ?? 1),
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
          mediaShape={borderMediaShape}
        />
      </View>
    );
  }

  if (hidden) return null;

  const naturalTextHeightMm = isTextElement && isAutoHeight
    ? computeTextElementHeightMm({
        text: textContent,
        fontSize: textFontSize,
        widthMm: sizeMm.width,
        autoWrapping: textAutoWrapping,
        lineSpacing: textLineSpacing,
        charSpacing: textCharSpacing,
        bold: textBold,
        verticalDisplay: textVerticalDisplay,
      })
    : sizeMm.height;

  const boundsCheck = clampToLabelBounds(
    { left: element.left, top: element.top, width: sizeMm.width, height: naturalTextHeightMm },
    { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
    { anchor: 'body', naturalHeight: naturalTextHeightMm },
  );
  const isOverflowed = isTextElement && boundsCheck.overflowed;

  const handleFitToLabelAction = () => {
    if (!isTextElement) return;
    const targetMaxH = Math.max(2, canvasHeightMm - Math.max(0, element.top));
    const fittedFs = fitFontSizeToLabel({
      text: textContent,
      widthMm: sizeMm.width,
      maxHeightMm: targetMaxH,
      initialFontSize: textFontSize,
      autoWrapping: textAutoWrapping,
      lineSpacing: textLineSpacing,
      charSpacing: textCharSpacing,
      bold: textBold,
      verticalDisplay: textVerticalDisplay,
    });
    const fittedHMm = computeTextElementHeightMm({
      text: textContent,
      fontSize: fittedFs,
      widthMm: sizeMm.width,
      autoWrapping: textAutoWrapping,
      lineSpacing: textLineSpacing,
      charSpacing: textCharSpacing,
      bold: textBold,
      verticalDisplay: textVerticalDisplay,
    });
    callbacksRef.current.onTransformEnd({
      id: element.id,
      leftMm: roundMm(element.left),
      topMm: roundMm(element.top),
      widthMm: roundMm(sizeMm.width),
      heightMm: roundMm(fittedHMm),
      rotation: ((Math.round(baseRotation) % 360) + 360) % 360,
      fontSize: fittedFs,
    });
  };

  const borderStrokeColor = isOverflowed ? '#EF4444' : selectionColor || CHROME_SELECTION_STROKE;

  const selectionOverlayStyle = useAnimatedStyle(() => {
    const multiGroup = groupEligibleSv?.value === 1;
    const touchId = activeSelectedIdSv?.value ?? '';
    const showChrome = multiGroup
      ? selectedSv.value
      : touchId.length > 0
        ? touchId === element.id
        : selectedSv.value;
    return {
      opacity: showChrome ? 1 : 0,
      pointerEvents: (showChrome ? 'box-none' : 'none') as 'box-none' | 'none',
    };
  });

  const overflowBadgeStyle = useAnimatedStyle(() => {
    return {
      opacity: isInteracting.value ? 0 : 1,
    };
  });

  return (
    <Animated.View ref={containerRef} style={containerStyle} collapsable={false}>
      <GestureDetector gesture={bodyDragGesture}>
        <View
          collapsable={false}
          style={styles.fillContainer}
          {...(Platform.OS === 'web'
            ? {
                onClick: (e: any) => {
                  e?.stopPropagation?.();
                  triggerSingleTapJS();
                },
                onDoubleClick: (e: any) => {
                  e?.stopPropagation?.();
                  triggerDoubleTapJS();
                },
              }
            : {})}>
          <View pointerEvents="none" style={styles.fillContainer}>
            <ElementContentView
              element={element}
              widthPx={baseWidthPx}
              heightPx={baseHeightPx}
              scale={pxPerMMSafe}
              mediaShape={borderMediaShape}
            />
          </View>
        </View>
      </GestureDetector>

      <Animated.View
        style={[StyleSheet.absoluteFill, selectionOverlayStyle]}>
        <View
          pointerEvents="none"
          style={[
            styles.selectionOutline,
            { borderColor: borderStrokeColor },
            isOverflowed && styles.selectionOutlineOverflow,
          ]}
        />

        <ResizeTooltip tooltipRef={tooltipRef} />

        {isOverflowed ? (
          <Animated.View style={overflowBadgeStyle}>
            <Pressable
              onPress={handleFitToLabelAction}
              style={styles.overflowBadge}>
              <AppIcon name="exclamationmark.triangle.fill" tintColor="#FFFFFF" size={11} />
              <Text style={styles.overflowBadgeText}>
                Overflow: text exceeds label height • <Text style={styles.overflowBadgeAction}>Fit</Text>
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {element.lockMovement ? null : (
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
      </Animated.View>
    </Animated.View>
  );
}, (prev, next) => {
  return (
    prev.element === next.element &&
    prev.selected === next.selected &&
    prev.pxPerMM === next.pxPerMM &&
    prev.padZoom === next.padZoom &&
    prev.selectionColor === next.selectionColor &&
    prev.canvasWidthMm === next.canvasWidthMm &&
    prev.canvasHeightMm === next.canvasHeightMm &&
    prev.mediaShape === next.mediaShape &&
    prev.liveBounds === next.liveBounds &&
    prev.deselectGesture === next.deselectGesture &&
    prev.activeSelectedIdSv === next.activeSelectedIdSv &&
    prev.topBarSelectionVisibleSv === next.topBarSelectionVisibleSv &&
    prev.bottomPanelVisibleSv === next.bottomPanelVisibleSv &&
    prev.multipleMode === next.multipleMode &&
    prev.groupEligibleSv === next.groupEligibleSv &&
    prev.groupAnchorIdSv === next.groupAnchorIdSv &&
    prev.groupDeltaLeftMm === next.groupDeltaLeftMm &&
    prev.groupDeltaTopMm === next.groupDeltaTopMm &&
    prev.groupScaleXSv === next.groupScaleXSv &&
    prev.groupScaleYSv === next.groupScaleYSv &&
    prev.groupHandleSv === next.groupHandleSv &&
    prev.groupScaleMinSv === next.groupScaleMinSv &&
    prev.groupScaleMaxSv === next.groupScaleMaxSv
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
            <Svg width={CHROME_HANDLE_ICON_SIZE} height={CHROME_HANDLE_ICON_SIZE} viewBox="-10 -10 20 20">
              <SvgPath
                d="M -3 -5 L -8.5 0 L -3 5 L -3 1.5 L 3 1.5 L 3 5 L 8.5 0 L 3 -5 L 3 -1.5 L -3 -1.5 Z"
                fill="#FFFFFF"
              />
            </Svg>
          ) : (
            <Svg width={CHROME_HANDLE_ICON_SIZE} height={CHROME_HANDLE_ICON_SIZE} viewBox="-10 -10 20 20">
              <SvgPath
                d="M -5 -3 L 0 -8.5 L 5 -3 L 1.5 -3 L 1.5 3 L 5 3 L 0 8.5 L -5 3 L -1.5 3 L -1.5 -3 Z"
                fill="#FFFFFF"
              />
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
    overflow: 'visible',
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: CHROME_SELECTION_STROKE,
  },
  handleCircle: {
    position: 'absolute',
    width: CHROME_HANDLE_SIZE_PX,
    height: CHROME_HANDLE_SIZE_PX,
    borderRadius: CHROME_HANDLE_RADIUS_PX,
    backgroundColor: CHROME_HANDLE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 2,
  },
  handleS: {
    bottom: -CHROME_HANDLE_RADIUS_PX,
    left: '50%',
    marginLeft: -CHROME_HANDLE_RADIUS_PX,
  },
  handleE: {
    top: '50%',
    right: -CHROME_HANDLE_RADIUS_PX,
    marginTop: -CHROME_HANDLE_RADIUS_PX,
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
  selectionOutlineOverflow: {
    borderColor: '#EF4444',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  overflowBadge: {
    position: 'absolute',
    top: -36,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 4,
  },
  overflowBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  overflowBadgeAction: {
    color: '#FEF08A',
    fontWeight: '800',
    textDecorationLine: 'underline',
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
