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
  useAnimatedStyle,
  useSharedValue,
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
import { mmToPx, pxToMm } from '@/lib/label-coordinate-system';
import { dropTopLeftMm, grabOffsetMm } from '@/lib/editor/view-transform';
import { createFrameThrottled } from '@/lib/editor/drag-layer';
import { logPerf } from '@/lib/perf-logger';
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
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onQuickEdit?: (id: string, anchorRect?: ElementAnchorRect) => void;
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
const DOUBLE_TAP_MS = 1000;
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
  mediaShape,
  liveBounds,
  deselectGesture,
  topBarSelectionVisibleSv,
  bottomPanelVisibleSv,
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
  const hasMovedSv = useSharedValue(false);
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
  ]);

  useEffect(() => {
    // Don't clobber an in-progress gesture. A gesture folds its own final
    // position/size into these shared values synchronously as soon as it ends
    // (see the `onEnd` handlers below), so by the time this effect sees the
    // matching props update, it's just reasserting the value already on screen.
    if (isInteracting.value) return;

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
    startW,
    startH,
    liftSv,
  ]);

  const lastTapRef = useRef({ id: '', time: 0 });
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
      // The store update above is already queued — safe to hand control
      // back to the props-sync effect now, before anything else can render.
      isInteracting.value = false;
    },
    [sizeMm.width, sizeMm.height, canvasWidthMm, canvasHeightMm, element.id, element.left, element.top, baseRotation, isInteracting],
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
      logPerf(`[BODY_DRAG] commitDragFromPointer el=${element.id}`);
      const leftMm = pxToMm(fallbackLeftPx, pxPerMMSafe);
      const topMm = pxToMm(fallbackTopPx, pxPerMMSafe);
      callbacksRef.current.onSelect(element.id);
      dispatchDragCommitMm(leftMm, topMm);
    },
    [dispatchDragCommitMm, dragMovePump, element.id, pxPerMMSafe],
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
      if (!behavior) {
        isInteracting.value = false;
        return;
      }
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
      if (element.type === 'text' || element.type === 'degrees') {
        const rawText =
          element.contentType === 'Data Source' && element.columnNameContent
            ? `{${element.columnNameContent}}`
            : 'text' in element
              ? element.text
              : element.content;
        const fs = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
        const naturalHeightMm = computeTextElementHeightMm({
          text: rawText,
          fontSize: fs,
          widthMm: next.width,
          autoWrapping: element.autoWrapping ?? 'Word',
          lineSpacing: element.lineSpacing ?? '1.0',
          charSpacing: element.charSpacing ?? 0,
          bold: element.bold ?? false,
          verticalDisplay: element.verticalDisplay ?? false,
        });
        const clamped = clampToLabelBounds(
          { left: next.left, top: next.top, width: next.width, height: naturalHeightMm },
          { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
          { anchor: handle === 's' ? 's' : 'e', minMm: resizePolicy.minMm, naturalHeight: naturalHeightMm },
        );
        next.left = clamped.left;
        next.top = clamped.top;
        next.width = clamped.width;
        finalHeightMm = clamped.height;
        fontSize = fs;
      } else if (element.type === 'time') {
        const fs = 'fontSize' in element && typeof element.fontSize === 'number' ? element.fontSize : 12;
        const naturalHeightMm = textBlockHeightMm(fs, 1);
        const clamped = clampToLabelBounds(
          { left: next.left, top: next.top, width: next.width, height: naturalHeightMm },
          { widthMm: canvasWidthMm, heightMm: canvasHeightMm },
          { anchor: handle === 's' ? 's' : 'e', minMm: resizePolicy.minMm, naturalHeight: naturalHeightMm },
        );
        next.left = clamped.left;
        next.top = clamped.top;
        next.width = clamped.width;
        finalHeightMm = clamped.height;
        fontSize = fs;
      }

      const rotation = ((Math.round(rot) % 360) + 360) % 360;

      callbacksRef.current.onTransformEnd({
        id: element.id,
        leftMm: next.left,
        topMm: next.top,
        widthMm: next.width,
        heightMm: finalHeightMm,
        rotation,
        fontSize,
      });
      // The store update above is already queued — safe to hand control
      // back to the props-sync effect now, before anything else can render.
      isInteracting.value = false;
    },
    [pxPerMMSafe, canvasWidthMm, canvasHeightMm, element, resizePolicy, isInteracting],
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
    const target = 42;
    return {
      top: Math.max(12, (target - Math.max(1, baseHeightPx)) / 2),
      bottom: Math.max(12, (target - Math.max(1, baseHeightPx)) / 2),
      left: Math.max(12, (target - Math.max(1, baseWidthPx)) / 2),
      right: Math.max(12, (target - Math.max(1, baseWidthPx)) / 2),
    };
  }, [baseHeightPx, baseWidthPx]);

  const notifyTransformStartJS = useCallback((id: string) => {
    callbacksRef.current.onTransformStart?.(id);
  }, []);

  const notifySelectJS = useCallback((id: string, tBegin: number) => {
    const transit = Date.now() - tBegin;
    logPerf(`[JS_THREAD] onSelect arrived for el=${id} (bridge transit: ${transit}ms)`);
    callbacksRef.current.onSelect(id);
  }, []);

  const lastDoubleTapTimeRef = useRef(0);
  const triggerDoubleTapJS = useCallback(() => {
    const now = Date.now();
    if (now - lastDoubleTapTimeRef.current < 600) {
      return;
    }
    lastDoubleTapTimeRef.current = now;
    lastTapRef.current = { id: '', time: 0 };
    lastTapTimeSv.value = 0;

    logPerf(`[BODY_DRAG] triggerDoubleTapJS el=${element.id}`);
    callbacksRef.current.onSelect(element.id);

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
  }, [element.id, element.type, lastTapTimeSv]);

  const triggerSingleTapJS = useCallback(() => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble = last.id === element.id && now - last.time > 30 && now - last.time < 1200;
    lastTapRef.current = { id: element.id, time: now };

    logPerf(`[BODY_DRAG] triggerSingleTapJS el=${element.id}`);
    callbacksRef.current.onSelect(element.id);

    if (isDouble) {
      lastTapRef.current = { id: '', time: 0 };
      triggerDoubleTapJS();
    }
  }, [element.id, triggerDoubleTapJS]);

  const bodyDragGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(!element.lockMovement)
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
        // Immediately prime interaction and selection on UI thread
        // so positions and visual boundary are locked instantly with 0ms delay
        isInteracting.value = true;
        selectedSv.value = true;
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
        runOnJS(notifySelectJS)(element.id, tNow);
      })
      .onStart((_e) => {
        'worklet';
        const delta = Date.now() - beginTimeSv.value;
        isInteracting.value = true;
        selectedSv.value = true;
        runOnJS(logPerf)(`[BODY_DRAG] onStart el=${element.id} (begin->start: ${delta}ms)`);
      })
      .onUpdate((e) => {
        'worklet';
        const distSq = e.translationX * e.translationX + e.translationY * e.translationY;
        if (!hasMovedSv.value) {
          if (distSq < 100) {
            // Less than 10px: stationary touch noise, ignore so taps are rock solid
            return;
          }
          hasMovedSv.value = true;
          liftSv.value = DRAG_LIFT_OPACITY;
          const updateDelta = Date.now() - beginTimeSv.value;
          runOnJS(logPerf)(`[BODY_DRAG] first onUpdate el=${element.id} (begin->update: ${updateDelta}ms)`);
          runOnJS(notifyTransformStartJS)(element.id);
        }

        const z = padZoomSv.value > 0 ? padZoomSv.value : 1;
        const dx = e.translationX / z;
        const dy = e.translationY / z;

        const curLeftMm = (originLeftSv.value + dx) / sxSv.value;
        const curTopMm = (originTopSv.value + dy) / sySv.value;
        const curWMm = animW.value / sxSv.value;
        const curHMm = animH.value / sySv.value;

        const clamped = clampToLabelBounds(
          { left: curLeftMm, top: curTopMm, width: curWMm, height: curHMm },
          { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
          { anchor: 'body' },
        );

        const targetLeftPx = clamped.left * sxSv.value;
        const targetTopPx = clamped.top * sySv.value;

        transX.value = targetLeftPx - originLeftSv.value;
        transY.value = targetTopPx - originTopSv.value;

        if (liveBounds) {
          liveBounds.leftMm.value = clamped.left;
          liveBounds.topMm.value = clamped.top;
          liveBounds.widthMm.value = clamped.width;
          liveBounds.heightMm.value = clamped.height;
          liveBounds.visible.value = true;
        }
      })
      .onEnd((e) => {
        'worklet';
        liftSv.value = 1;
        const distSq = e.translationX * e.translationX + e.translationY * e.translationY;
        // Less than 20px translation (distSq < 400) or !hasMovedSv is treated as a tap
        const isTap = !hasMovedSv.value || distSq < 400;

        if (isTap) {
          tapHandledSv.value = true;
          transX.value = 0;
          transY.value = 0;
          isInteracting.value = false;

          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;

          if (deltaSinceLastTap > 30 && deltaSinceLastTap < 1200) {
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
          runOnJS(commitDragFromPointer)(
            e.absoluteX,
            e.absoluteY,
            originLeftSv.value,
            originTopSv.value,
          );
        }
      })
      .onFinalize((_e, success) => {
        'worklet';
        isInteracting.value = false;
        liftSv.value = 1;
        transX.value = 0;
        transY.value = 0;

        // If onEnd did not run (e.g. pan failed because touch ended before drag threshold),
        // but the finger did not drag, this was a stationary tap! Process it here!
        if (!tapHandledSv.value && !hasMovedSv.value) {
          tapHandledSv.value = true;
          const tNow = Date.now();
          const deltaSinceLastTap = tNow - lastTapTimeSv.value;

          if (deltaSinceLastTap > 30 && deltaSinceLastTap < 1200) {
            lastTapTimeSv.value = 0;
            runOnJS(triggerDoubleTapJS)();
          } else {
            lastTapTimeSv.value = tNow;
            lastTapXSv.value = _e?.absoluteX ?? 0;
            lastTapYSv.value = _e?.absoluteY ?? 0;
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
    notifySelectJS,
    notifyTransformStartJS,
    triggerDoubleTapJS,
    triggerSingleTapJS,
  ]);

  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(1200)
      .maxDelay(600)
      .hitSlop(bodyHitSlop)
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) {
          triggerDoubleTapJS();
        }
      });
  }, [bodyHitSlop, triggerDoubleTapJS]);

  const composedElementGesture = useMemo(() => {
    return Gesture.Simultaneous(bodyDragGesture, doubleTapGesture);
  }, [bodyDragGesture, doubleTapGesture]);

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
          runOnJS(notifyTransformStartJS)(element.id);
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
            const proposedWPx = originW + dx;
            const proposedWMm = Math.max(minResizeMmSv.value, proposedWPx / sxSv.value);
            let naturalHMm: number | undefined;

            if (isAutoTextSv.value) {
              naturalHMm = computeTextElementHeightMm({
                text: textContentSv.value,
                fontSize: textFontSizeSv.value,
                widthMm: proposedWMm,
                autoWrapping: autoWrappingSv.value,
                lineSpacing: lineSpacingSv.value,
                charSpacing: charSpacingSv.value,
                bold: boldSv.value,
                verticalDisplay: verticalDisplaySv.value,
              });
            }

            const clamped = clampToLabelBounds(
              {
                left: originLeft / sxSv.value,
                top: originTop / sySv.value,
                width: proposedWMm,
                height: originH / sySv.value,
              },
              { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
              { anchor: 'e', minMm: minResizeMmSv.value, naturalHeight: naturalHMm },
            );

            nw = clamped.width * sxSv.value;
            nh = clamped.height * sySv.value;
            left = clamped.left * sxSv.value;
            top = clamped.top * sySv.value;
          } else if (behavior === 'height' && handle === 's') {
            const proposedHPx = originH + dy;
            const proposedHMm = Math.max(minResizeMmSv.value, proposedHPx / sySv.value);

            const clamped = clampToLabelBounds(
              {
                left: originLeft / sxSv.value,
                top: originTop / sySv.value,
                width: originW / sxSv.value,
                height: proposedHMm,
              },
              { widthMm: canvasWMmSv.value, heightMm: canvasHMmSv.value },
              { anchor: 's', minMm: minResizeMmSv.value },
            );

            nw = clamped.width * sxSv.value;
            nh = clamped.height * sySv.value;
            left = clamped.left * sxSv.value;
            top = clamped.top * sySv.value;
          } else if (behavior === 'square') {
            const maxAvailable = Math.max(minPx, Math.min(canvasWPx - originLeft, canvasHPx - originTop));
            const proposed = handle === 'e' ? originW + dx : originH + dy;
            const targetSize = Math.max(minPx, Math.min(maxAvailable, proposed));
            nw = targetSize;
            nh = targetSize;
            left = originLeft;
            top = originTop;
          } else if (behavior === 'aspect') {
            if (handle === 'e') {
              const maxW = Math.max(minPx, Math.min(canvasWPx - originLeft, (canvasHPx - originTop) * aspect));
              const proposedW = originW + dx;
              const targetW = Math.max(minPx, Math.min(maxW, proposedW));
              nw = targetW;
              nh = targetW / aspect;
              left = originLeft;
              top = originTop;
            } else {
              const maxH = Math.max(minPx, Math.min(canvasHPx - originTop, (canvasWPx - originLeft) / aspect));
              const proposedH = originH + dy;
              const targetH = Math.max(minPx, Math.min(maxH, proposedH));
              nw = targetH * aspect;
              nh = targetH;
              left = originLeft;
              top = originTop;
            }
          }

          animW.value = nw;
          animH.value = nh;
          transX.value = left - originLeftSv.value;
          transY.value = top - originTopSv.value;

          if (liveBounds) {
            liveBounds.leftMm.value = left / sxSv.value;
            liveBounds.topMm.value = top / sySv.value;
            liveBounds.widthMm.value = nw / sxSv.value;
            liveBounds.heightMm.value = nh / sySv.value;
            liveBounds.visible.value = true;
          }

          const now = Date.now();
          if (now - lastTooltipTimeSv.value >= 80) {
            lastTooltipTimeSv.value = now;
            runOnJS(updateTooltipJS)(nw, nh);
          }
        })
        .onEnd(() => {
          'worklet';
          // Fold the gesture offset into the origin now, so the view is
          // already sitting at its final pixel size/position.
          originLeftSv.value = originLeftSv.value + transX.value;
          originTopSv.value = originTopSv.value + transY.value;
          transX.value = 0;
          transY.value = 0;
          // isInteracting stays true until the JS-side commit callback below
          // has actually queued the store update — otherwise an unrelated
          // re-render landing in the gap could snap this back to the stale
          // pre-resize props.
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

    return {
      position: 'absolute',
      left: liveLeft,
      top: liveTop,
      width: liveW,
      height: liveH,
      transform: [{ rotate: `${liveRot}deg` }],
      opacity: (element.opacity ?? 1) * liftSv.value,
      zIndex: selectedSv.value ? 100 : (element.zIndex ?? 1),
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
    return {
      opacity: selectedSv.value ? 1 : 0,
    };
  });

  const overflowBadgeStyle = useAnimatedStyle(() => {
    return {
      opacity: isInteracting.value ? 0 : 1,
    };
  });

  return (
    <Animated.View ref={containerRef} style={containerStyle} collapsable={false}>
      <GestureDetector gesture={composedElementGesture}>
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
        pointerEvents={selected ? 'box-none' : 'none'}
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
