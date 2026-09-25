import React, { forwardRef, memo, useEffect, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import Svg, { Ellipse, Line, Rect } from 'react-native-svg';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { SelectSource, TransformStartKind } from './konva-transformer';

import { KonvaTransformer, type TransformCommitPayload, type TransformMovePayload } from './konva-transformer';
import { CanvasGridOverlay } from '@/components/editor/canvas-grid-overlay';
import { DEFAULT_GRID_SPACING_MM } from '@/lib/editor/canvas-grid';
import { type LiveRulerBounds } from '@/components/canvas-rulers';
import { CableFlagDieCutOverlay } from '@/components/cable-flag-outline';
import { StockSilhouetteOverlay } from '@/components/stock-silhouette';
import { type LabelDocument, type LabelElement, type MediaShape, elementSizeMm } from '@/lib/label-document';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { isCableFlagDieCutDocument } from '@/constants/cable-flag-diecut';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { sortLayers } from '@/lib/template-schema';
import { idleElementRefsUnchanged } from '@/lib/editor/drag-layer';
import { SNAP_GUIDE_COLOR, SNAP_GUIDE_STROKE_PX } from '@/lib/editor/canvas-chrome';
import type { SnapGuide } from '@/lib/editor/engine';
import { type ElementAnchorRect } from '@/lib/editor/quick-value';

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
  /** Editor-only design grid (not included in print capture via LabelPreview). */
  showGrid?: boolean;
  gridSpacingMm?: number;
  liveBounds?: LiveRulerBounds;
  activeSelectedIdSv?: SharedValue<string>;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  multipleMode?: boolean;
  groupEligibleSv?: SharedValue<number>;
  groupAnchorIdSv?: SharedValue<string>;
  groupDeltaLeftMm?: SharedValue<number>;
  groupDeltaTopMm?: SharedValue<number>;
  groupScaleXSv?: SharedValue<number>;
  groupScaleYSv?: SharedValue<number>;
  groupHandleSv?: SharedValue<number>;
  groupScaleMinSv?: SharedValue<number>;
  groupScaleMaxSv?: SharedValue<number>;
  onGroupResizeHandleBegin?: (handle: 'e' | 's') => void;
  onSelect: (id: string, source?: SelectSource) => void;
  onDeselectAll: () => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onQuickEdit?: (id: string, anchorRect?: ElementAnchorRect) => void;
  onTransformStart?: (id: string, kind: TransformStartKind) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  onTableCellPress?: (tableId: string, cell: { row: number; col: number } | null) => void;
  onTableCellQuickEdit?: (
    tableId: string,
    cell: { row: number; col: number },
    anchorRect?: ElementAnchorRect,
  ) => void;
  selectedTableCell?: { tableId: string; row: number; col: number } | null;
  tableSelectionColor?: string;
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
  safeModeSv?: SharedValue<number>;
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
  activeSelectedIdSv?: SharedValue<string>;
  topBarSelectionVisibleSv?: SharedValue<number>;
  bottomPanelVisibleSv?: SharedValue<number>;
  multipleMode?: boolean;
  groupEligibleSv?: SharedValue<number>;
  groupAnchorIdSv?: SharedValue<string>;
  groupDeltaLeftMm?: SharedValue<number>;
  groupDeltaTopMm?: SharedValue<number>;
  groupScaleXSv?: SharedValue<number>;
  groupScaleYSv?: SharedValue<number>;
  groupHandleSv?: SharedValue<number>;
  groupScaleMinSv?: SharedValue<number>;
  groupScaleMaxSv?: SharedValue<number>;
  onGroupResizeHandleBegin?: (handle: 'e' | 's') => void;
  onSelect: (id: string, source?: SelectSource) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onQuickEdit?: (id: string, anchorRect?: ElementAnchorRect) => void;
  onTransformStart?: (id: string, kind: TransformStartKind) => void;
  onTransformMove?: (payload: TransformMovePayload) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
  onTableCellPress?: (tableId: string, cell: { row: number; col: number } | null) => void;
  onTableCellQuickEdit?: (
    tableId: string,
    cell: { row: number; col: number },
    anchorRect?: ElementAnchorRect,
  ) => void;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
  pointerToMm?: (windowX: number, windowY: number) => { x: number; y: number } | null;
  snapMoveMm?: (input: {
    id: string;
    leftMm: number;
    topMm: number;
    widthMm: number;
    heightMm: number;
  }) => { leftMm: number; topMm: number };
  /** 1 when Safe Mode is on. */
  safeModeSv?: SharedValue<number>;
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
          activeSelectedIdSv={chrome.activeSelectedIdSv}
          topBarSelectionVisibleSv={chrome.topBarSelectionVisibleSv}
          bottomPanelVisibleSv={chrome.bottomPanelVisibleSv}
          multipleMode={chrome.multipleMode}
          groupEligibleSv={chrome.groupEligibleSv}
          groupAnchorIdSv={chrome.groupAnchorIdSv}
          groupDeltaLeftMm={chrome.groupDeltaLeftMm}
          groupDeltaTopMm={chrome.groupDeltaTopMm}
          groupScaleXSv={chrome.groupScaleXSv}
          groupScaleYSv={chrome.groupScaleYSv}
          groupHandleSv={chrome.groupHandleSv}
          groupScaleMinSv={chrome.groupScaleMinSv}
          groupScaleMaxSv={chrome.groupScaleMaxSv}
          onGroupResizeHandleBegin={chrome.onGroupResizeHandleBegin}
          onSelect={chrome.onSelect}
          onOpenPanel={chrome.onOpenPanel}
          onEditText={chrome.onEditText}
          onQuickEdit={chrome.onQuickEdit}
          onTransformStart={chrome.onTransformStart}
          onTransformMove={chrome.onTransformMove}
          onTransformEnd={chrome.onTransformEnd}
          onQuickRotate={chrome.onQuickRotate}
          onTableCellPress={chrome.onTableCellPress}
          onTableCellQuickEdit={chrome.onTableCellQuickEdit}
          selectedTableCell={
            element.type === 'table' &&
            chrome.selectedTableCell &&
            chrome.selectedIds.includes(element.id)
              ? { row: chrome.selectedTableCell.row, col: chrome.selectedTableCell.col }
              : null
          }
          tableSelectionColor={chrome.tableSelectionColor ?? chrome.selectionColor}
          pointerToMm={chrome.pointerToMm}
          snapMoveMm={chrome.snapMoveMm}
          safeModeSv={chrome.safeModeSv}
        />
      ))}
    </>
  );
}, (prev, next) => prev.chrome === next.chrome && idleElementRefsUnchanged(prev.elements, next.elements));

/**
 * Covers grid lines under the live element. Size/position use transform from a
 * 1×1 anchor so the view cannot stretch to fill the artboard on first drag.
 */
const GridLivePlate = memo(function GridLivePlate({
  liveBounds,
  showGridSv,
  pxPerMM,
  color,
  rotationDeg,
}: {
  liveBounds: LiveRulerBounds;
  showGridSv: SharedValue<number>;
  pxPerMM: number;
  color: string;
  rotationDeg: number;
}) {
  const style = useAnimatedStyle(() => {
    const w = liveBounds.widthMm.value * pxPerMM;
    const h = liveBounds.heightMm.value * pxPerMM;
    const ready =
      showGridSv.value > 0.5 &&
      liveBounds.visible.value &&
      Number.isFinite(w) &&
      Number.isFinite(h) &&
      w >= 1 &&
      h >= 1;
    return {
      opacity: ready ? 1 : 0,
      width: ready ? w : 1,
      height: ready ? h : 1,
      transform: [
        { translateX: ready ? liveBounds.leftMm.value * pxPerMM : 0 },
        { translateY: ready ? liveBounds.topMm.value * pxPerMM : 0 },
        { rotate: `${rotationDeg}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

const GridStaticPlate = memo(function GridStaticPlate({
  leftPx,
  topPx,
  widthPx,
  heightPx,
  color,
  rotationDeg,
}: {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  color: string;
  rotationDeg: number;
}) {
  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        backgroundColor: color,
        transform: [{ rotate: `${rotationDeg}deg` }],
      }}
    />
  );
});

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
    gridSpacingMm = DEFAULT_GRID_SPACING_MM,
    liveBounds,
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
    onDeselectAll,
    onOpenPanel,
    onEditText,
    onQuickEdit,
    onTransformStart,
    onTransformMove,
    onTransformEnd,
    onQuickRotate,
    onTableCellPress,
    onTableCellQuickEdit,
    selectedTableCell,
    tableSelectionColor,
    pointerToMm,
    snapMoveMm,
    snapGuides = [],
    safeModeSv,
  },
  ref,
) {
  const w = Math.max(1, canvasWidthPx);
  const h = Math.max(1, canvasHeightPx);
  const resolvedGridSpacingMm = gridSpacingMm ?? DEFAULT_GRID_SPACING_MM;
  const showGridSv = useSharedValue(showGrid ? 1 : 0);
  useEffect(() => {
    showGridSv.value = showGrid ? 1 : 0;
  }, [showGrid, showGridSv]);

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
            if (activeSelectedIdSv) {
              activeSelectedIdSv.value = '';
            }
            if (topBarSelectionVisibleSv) {
              topBarSelectionVisibleSv.value = 0;
            }
            if (bottomPanelVisibleSv) {
              bottomPanelVisibleSv.value = 0;
            }
            runOnJS(onDeselectAll)();
          }
        }),
    [onDeselectAll, activeSelectedIdSv, topBarSelectionVisibleSv, bottomPanelVisibleSv],
  );

  const canvasWidthMm = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry).width
    : doc.widthMm;
  const canvasHeightMm = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry).height
    : doc.heightMm;

  const sortedElements = useMemo(() => sortLayers(doc.elements), [doc.elements]);

  const gridLiveElementId = selectedIds.length === 1 ? selectedIds[0] : null;
  const gridLiveRotation = useMemo(() => {
    if (!gridLiveElementId) return 0;
    const anchor = sortedElements.find((el) => el.id === gridLiveElementId);
    return anchor && 'rotation' in anchor ? (anchor.rotation ?? 0) : 0;
  }, [gridLiveElementId, sortedElements]);

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
      activeSelectedIdSv,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      multipleMode,
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
      onTableCellPress,
      onTableCellQuickEdit,
      selectedTableCell:
        selectedTableCell && selectedIds.includes(selectedTableCell.tableId)
          ? { row: selectedTableCell.row, col: selectedTableCell.col }
          : null,
      tableSelectionColor: tableSelectionColor ?? selectionColor,
      pointerToMm,
      snapMoveMm,
      safeModeSv,
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
      activeSelectedIdSv,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      multipleMode,
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
      onTableCellPress,
      onTableCellQuickEdit,
      selectedTableCell,
      tableSelectionColor,
      pointerToMm,
      snapMoveMm,
      safeModeSv,
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
      <View
        pointerEvents="none"
        collapsable={false}
        style={[styles.artboardLayer, { width: w, height: h }]}>
        <View
          collapsable={false}
          style={[
            styles.canvasPad,
            {
              width: w,
              height: h,
              backgroundColor,
            },
          ]}>
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

          {doc.elements.length === 0 && !stockCut ? (
            <View style={styles.emptyHintWrap}>
              <Text style={styles.emptyHint}>Tap or drag a tool onto the label</Text>
            </View>
          ) : null}

          {cableFlag || stockCut || isCircle ? null : <View style={styles.artboardBorder} />}

          <CanvasGridOverlay
            widthPx={w}
            heightPx={h}
            pxPerMM={pxPerMM}
            spacingMm={resolvedGridSpacingMm}
            visible={showGrid}
          />
          {showGrid
            ? sortedElements.map((el) => {
                if (el.visible === false || el.id === gridLiveElementId) return null;
                const rotation = 'rotation' in el ? (el.rotation ?? 0) : 0;
                const size = elementSizeMm(el);
                return (
                  <GridStaticPlate
                    key={el.id}
                    leftPx={el.left * pxPerMM}
                    topPx={el.top * pxPerMM}
                    widthPx={Math.max(1, size.width * pxPerMM)}
                    heightPx={Math.max(1, size.height * pxPerMM)}
                    color={stickerFillColor}
                    rotationDeg={rotation}
                  />
                );
              })
            : null}
          {liveBounds ? (
            <GridLivePlate
              liveBounds={liveBounds}
              showGridSv={showGridSv}
              pxPerMM={pxPerMM}
              color={stickerFillColor}
              rotationDeg={gridLiveRotation}
            />
          ) : null}
        </View>
      </View>
      <ViewShot
        ref={ref}
        options={{ format: 'png', quality: 1 }}
        style={[styles.elementLayer, { width: w, height: h }]}>
        <GestureDetector gesture={deselectGesture}>
          <View style={StyleSheet.absoluteFillObject} collapsable={false} />
        </GestureDetector>

        <View pointerEvents="box-none" collapsable={false} style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
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
  artboardLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  elementLayer: {
    zIndex: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
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
