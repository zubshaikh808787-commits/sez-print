import React, { forwardRef, memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import Svg, { Ellipse, Line, Rect } from 'react-native-svg';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';

import { KonvaTransformer, type TransformCommitPayload, type TransformMovePayload } from './konva-transformer';
import { type LiveRulerBounds } from '@/components/canvas-rulers';
import { CableFlagDieCutOverlay } from '@/components/cable-flag-outline';
import { StockSilhouetteOverlay } from '@/components/stock-silhouette';
import { type LabelDocument, type LabelElement, type MediaShape } from '@/lib/label-document';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { isCableFlagDieCutDocument } from '@/constants/cable-flag-diecut';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { sortLayers } from '@/lib/template-schema';
import { idleElementRefsUnchanged } from '@/lib/editor/drag-layer';
import { SNAP_GUIDE_COLOR, SNAP_GUIDE_STROKE_PX } from '@/lib/editor/canvas-chrome';
import type { SnapGuide } from '@/lib/editor/engine';

type KonvaCanvasProps = {
  document: LabelDocument;
  canvasWidthPx: number;
  canvasHeightPx: number;
  pxPerMM: number;
  padZoom: number;
  selectedIds: string[];
  selectionColor: string;
  /** Editor nested artboard fill. Print capture keeps document white. */
  surfaceColor?: string;
  showGrid?: boolean;
  liveBounds?: LiveRulerBounds;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  onSelect: (id: string) => void;
  onDeselectAll: () => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  /** Window point → artboard mm. Drag commit goes through this, not raw px. */
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

type ElementChrome = {
  pxPerMM: number;
  padZoom: number;
  selectedIds: string[];
  selectionColor: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  mediaShape?: MediaShape;
  liveBounds?: LiveRulerBounds;
  deselectGesture?: GestureType;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  pointerToMm?: (windowX: number, windowY: number) => { x: number; y: number } | null;
  snapMoveMm?: (input: {
    id: string;
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
  }) => { leftMm: number; topMm: number };
};

const CanvasElementNodes = memo(function CanvasElementNodes({
  elements,
  chrome,
}: {
  elements: LabelElement[];
  chrome: ElementChrome;
}) {
  return (
    <>
      {elements.map((element) => (
        <KonvaTransformer
          key={element.id}
          element={element}
          pxPerMM={chrome.pxPerMM}
          padZoom={chrome.padZoom}
          selected={chrome.selectedIds.includes(element.id)}
          selectionColor={chrome.selectionColor}
          canvasWidthMm={chrome.canvasWidthMm}
          canvasHeightMm={chrome.canvasHeightMm}
          mediaShape={chrome.mediaShape}
          liveBounds={chrome.liveBounds}
          deselectGesture={chrome.deselectGesture}
          topBarSelectionVisibleSv={chrome.topBarSelectionVisibleSv}
          bottomPanelVisibleSv={chrome.bottomPanelVisibleSv}
          onSelect={chrome.onSelect}
          onOpenPanel={chrome.onOpenPanel}
          onEditText={chrome.onEditText}
          onTransformStart={chrome.onTransformStart}
          onTransformMove={chrome.onTransformMove}
          onTransformEnd={chrome.onTransformEnd}
          onQuickRotate={chrome.onQuickRotate}
          pointerToMm={chrome.pointerToMm}
          snapMoveMm={chrome.snapMoveMm}
        />
      ))}
    </>
  );
}, (prev, next) => prev.chrome === next.chrome && idleElementRefsUnchanged(prev.elements, next.elements));

export const KonvaCanvas = forwardRef<ViewShot, KonvaCanvasProps>(function KonvaCanvas(
  {
    document: doc,
    canvasWidthPx,
    canvasHeightPx,
    pxPerMM,
    padZoom,
    selectedIds,
    selectionColor,
    surfaceColor,
    showGrid = false,
    liveBounds,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    onSelect,
    onDeselectAll,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    pointerToMm,
    snapMoveMm,
    snapGuides = [],
  },
  ref,
) {
  const w = Math.max(1, canvasWidthPx);
  const h = Math.max(1, canvasHeightPx);

  const isCircle = doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse';
  const cableFlag = isCableFlagDieCutDocument(doc);
  const stockCut = hasStockSilhouette(doc.templatePreviewType) || isRatTailGeometry(doc.mediaGeometry);
  const backgroundColor = cableFlag || stockCut || isCircle
    ? 'transparent'
    : surfaceColor
      ? surfaceColor
      : doc.background?.type === 'color'
        ? doc.background.color
        : '#FFFFFF';

  const stickerFillColor = surfaceColor
    ? surfaceColor
    : doc.background?.type === 'color'
      ? doc.background.color
      : '#FFFFFF';

  // Grid lines — engraved 1 / 5 / 10 mm like a machinist scale
  const gridLines = useMemo(() => {
    if (!showGrid || pxPerMM <= 0) return null;
    const vertical: { x: number; kind: 'minor' | 'mid' | 'major' }[] = [];
    const horizontal: { y: number; kind: 'minor' | 'mid' | 'major' }[] = [];
    const stepMm = pxPerMM >= 3 ? 1 : 5;
    for (let mm = stepMm; mm * pxPerMM < w - 0.5; mm += stepMm) {
      const kind = mm % 10 === 0 ? 'major' : mm % 5 === 0 ? 'mid' : 'minor';
      vertical.push({ x: mm * pxPerMM, kind });
    }
    for (let mm = stepMm; mm * pxPerMM < h - 0.5; mm += stepMm) {
      const kind = mm % 10 === 0 ? 'major' : mm % 5 === 0 ? 'mid' : 'minor';
      horizontal.push({ y: mm * pxPerMM, kind });
    }
    const stroke = (kind: 'minor' | 'mid' | 'major') =>
      kind === 'major' ? '#94A3B8' : kind === 'mid' ? '#CBD5E1' : '#E8EEF4';
    return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {vertical.map((tick) => (
          <Line
            key={`v${tick.x}`}
            x1={tick.x}
            y1={0}
            x2={tick.x}
            y2={h}
            stroke={stroke(tick.kind)}
            strokeWidth={tick.kind === 'major' ? 1 : StyleSheet.hairlineWidth}
          />
        ))}
        {horizontal.map((tick) => (
          <Line
            key={`h${tick.y}`}
            x1={0}
            y1={tick.y}
            x2={w}
            y2={tick.y}
            stroke={stroke(tick.kind)}
            strokeWidth={tick.kind === 'major' ? 1 : StyleSheet.hairlineWidth}
          />
        ))}
      </Svg>
    );
  }, [showGrid, pxPerMM, w, h]);

  // Jewelry rat-tail guides (if applicable)
  const jewelryGuides = useMemo(() => {
    if (doc.templatePreviewType !== JEWELRY_DIECUT_PREVIEW_SINGLE) return null;
    const { foldYMm, bodyHeightMm, tagWidthMm, tailWidthMm } = JEWELRY_DIECUT;
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View
          style={{
            position: 'absolute',
            top: foldYMm * pxPerMM,
            left: 0,
            right: 0,
            borderBottomWidth: 1,
            borderBottomColor: '#CBD5E1',
            borderStyle: 'dashed',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: bodyHeightMm * pxPerMM,
            left: 0,
            right: 0,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8F0',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: bodyHeightMm * pxPerMM,
            bottom: 0,
            left: ((tagWidthMm - tailWidthMm) / 2) * pxPerMM,
            width: tailWidthMm * pxPerMM,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderStyle: 'dashed',
            borderRadius: 1.2 * pxPerMM,
          }}
        />
      </View>
    );
  }, [doc.templatePreviewType, pxPerMM]);

  const stockOutline = useMemo(() => {
    if (!hasStockSilhouette(doc.templatePreviewType) && !isRatTailGeometry(doc.mediaGeometry)) return null;
    return (
      <StockSilhouetteOverlay
        document={doc}
        scaleX={pxPerMM}
        scaleY={pxPerMM}
        widthPx={w}
        heightPx={h}
      />
    );
  }, [doc, pxPerMM, w, h]);

  const cableFlagOutline = useMemo(() => {
    if (!isCableFlagDieCutDocument(doc)) return null;
    return (
      <CableFlagDieCutOverlay
        document={doc}
        scaleX={pxPerMM}
        scaleY={pxPerMM}
        widthPx={w}
        heightPx={h}
      />
    );
  }, [doc, pxPerMM, w, h]);

  const mediaShapeGuide = useMemo(() => {
    if (!doc.mediaShape || doc.mediaShape === 'rectangle' || doc.mediaShape === 'diecut') return null;
    if (doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse') {
      // Rendered directly on pageLayer inside canvasPad with stickerFillColor fill + 1px black stroke
      return null;
    }
    if (doc.mediaShape === 'roundedRectangle') {
      const radius = Math.min(w, h) * 0.1;
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Rect
            x={1}
            y={1}
            width={Math.max(1, w - 2)}
            height={Math.max(1, h - 2)}
            rx={radius}
            ry={radius}
            stroke="#000000"
            strokeWidth={1}
            fill="none"
          />
        </Svg>
      );
    }
    return null;
  }, [doc.mediaShape, w, h]);

  const deselectGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(2000)
        .onEnd((_e, success) => {
          'worklet';
          if (success) {
            if (topBarSelectionVisibleSv) {
              topBarSelectionVisibleSv.value = 0;
            }
            if (bottomPanelVisibleSv) {
              bottomPanelVisibleSv.value = 0;
            }
            runOnJS(onDeselectAll)();
          }
        }),
    [onDeselectAll, topBarSelectionVisibleSv, bottomPanelVisibleSv],
  );

  const canvasWidthMm = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry).width
    : doc.widthMm;
  const canvasHeightMm = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry).height
    : doc.heightMm;

  const sortedElements = useMemo(() => sortLayers(doc.elements), [doc.elements]);

  const chrome = useMemo<ElementChrome>(
    () => ({
      pxPerMM,
      padZoom,
      selectedIds,
      selectionColor,
      canvasWidthMm,
      canvasHeightMm,
      mediaShape: doc.mediaShape,
      liveBounds,
      deselectGesture,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      onSelect,
      onOpenPanel,
      onEditText,
      onTransformStart,
      onTransformMove,
      onTransformEnd,
      onQuickRotate,
      pointerToMm,
      snapMoveMm,
    }),
    [
      pxPerMM,
      padZoom,
      selectedIds,
      selectionColor,
      canvasWidthMm,
      canvasHeightMm,
      doc.mediaShape,
      liveBounds,
      deselectGesture,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      onSelect,
      onOpenPanel,
      onEditText,
      onTransformStart,
      onTransformMove,
      onTransformEnd,
      onQuickRotate,
      pointerToMm,
      snapMoveMm,
    ],
  );

  return (
    <View
      collapsable={false}
      style={{
        width: w,
        height: h,
        backgroundColor,
        overflow: 'hidden',
      }}>
      {stockOutline}
      <ViewShot ref={ref} options={{ format: 'png', quality: 1 }} style={{ width: w, height: h, overflow: 'hidden' }}>
        <View
          pointerEvents="none"
          collapsable={false}
          style={[
            styles.canvasPad,
            {
              width: w,
              height: h,
              backgroundColor,
            },
          ]}>
          {/* pageLayer: static artboard / page boundary. listening: false */}
          {doc.background?.type === 'image' ? (
            <View style={StyleSheet.absoluteFillObject}>
              <Image
                source={{ uri: doc.background.uri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            </View>
          ) : null}

          {isCircle ? (
            <Svg width={w} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <Ellipse
                cx={w / 2}
                cy={h / 2}
                rx={Math.max(1, (doc.mediaShape === 'circle' ? Math.min(w, h) / 2 : w / 2) - 1)}
                ry={Math.max(1, (doc.mediaShape === 'circle' ? Math.min(w, h) / 2 : h / 2) - 1)}
                fill={stickerFillColor}
                stroke="#000000"
                strokeWidth={1}
              />
            </Svg>
          ) : null}

          {jewelryGuides}
          {gridLines}

          {doc.elements.length === 0 && !stockCut ? (
            <View style={styles.emptyHintWrap}>
              <Text style={styles.emptyHint}>Tap or drag a tool onto the label</Text>
            </View>
          ) : null}

          {cableFlag || stockCut || isCircle ? null : (
            <View style={styles.artboardBorder} />
          )}
        </View>

        <GestureDetector gesture={deselectGesture}>
          <View style={StyleSheet.absoluteFillObject} collapsable={false} />
        </GestureDetector>

        <View pointerEvents="box-none" collapsable={false} style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
          {/* Stable single-layer element rendering: preserves component instances across drag without flicker */}
          <CanvasElementNodes elements={sortedElements} chrome={chrome} />
        </View>
      </ViewShot>
      {mediaShapeGuide}
      {cableFlagOutline}
      {snapGuides.length > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {snapGuides.map((guide, index) =>
            guide.axis === 'v' ? (
              <Line
                key={`v${guide.positionMm}-${index}`}
                x1={guide.positionMm * pxPerMM}
                y1={0}
                x2={guide.positionMm * pxPerMM}
                y2={h}
                stroke={SNAP_GUIDE_COLOR}
                strokeWidth={SNAP_GUIDE_STROKE_PX}
              />
            ) : (
              <Line
                key={`h${guide.positionMm}-${index}`}
                x1={0}
                y1={guide.positionMm * pxPerMM}
                x2={w}
                y2={guide.positionMm * pxPerMM}
                stroke={SNAP_GUIDE_COLOR}
                strokeWidth={SNAP_GUIDE_STROKE_PX}
              />
            ),
          )}
        </Svg>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  canvasPad: {
    overflow: 'hidden',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  emptyHintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  artboardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.45)',
  },
  activeLayer: {
    zIndex: 20,
  },
});
