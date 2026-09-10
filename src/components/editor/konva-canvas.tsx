import React, { forwardRef, memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import Svg, { Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { KonvaTransformer, type TransformCommitPayload } from './konva-transformer';
import { CableFlagDieCutOverlay } from '@/components/cable-flag-outline';
import { StockSilhouetteOverlay } from '@/components/stock-silhouette';
import { type LabelDocument, type LabelElement } from '@/lib/label-document';
import { mediaShapeClipStyle } from '@/lib/label-geometry';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { isCableFlagDieCutDocument } from '@/constants/cable-flag-diecut';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { sortLayers } from '@/lib/template-schema';

type KonvaCanvasProps = {
  document: LabelDocument;
  canvasWidthPx: number;
  canvasHeightPx: number;
  pxPerMM: number;
  padZoom: number;
  selectedIds: string[];
  selectionColor: string;
  showGrid?: boolean;
  onSelect: (id: string) => void;
  onDeselectAll: () => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  onTransformStart?: (id: string) => void;
  onTransformEnd: (payload: TransformCommitPayload) => void;
  onQuickRotate?: (id: string) => void;
};

export const KonvaCanvas = forwardRef<ViewShot, KonvaCanvasProps>(function KonvaCanvas(
  {
    document: doc,
    canvasWidthPx,
    canvasHeightPx,
    pxPerMM,
    padZoom,
    selectedIds,
    selectionColor,
    showGrid = false,
    onSelect,
    onDeselectAll,
    onOpenPanel,
    onEditText,
    onTransformStart,
    onTransformEnd,
    onQuickRotate,
  },
  ref,
) {
  const w = Math.max(1, canvasWidthPx);
  const h = Math.max(1, canvasHeightPx);
  const shapeClip = mediaShapeClipStyle(doc.mediaShape, w, h);

  const cableFlag = isCableFlagDieCutDocument(doc);
  const stockCut = hasStockSilhouette(doc.templatePreviewType) || isRatTailGeometry(doc.mediaGeometry);
  const backgroundColor = cableFlag || stockCut
    ? 'transparent'
    : doc.background?.type === 'color'
      ? doc.background.color
      : '#FFFFFF';

  // Grid lines
  const gridLines = useMemo(() => {
    if (!showGrid || pxPerMM <= 0) return null;
    const stepPx = 5 * pxPerMM;
    const vertical: number[] = [];
    const horizontal: number[] = [];
    for (let x = stepPx; x < w; x += stepPx) vertical.push(x);
    for (let y = stepPx; y < h; y += stepPx) horizontal.push(y);
    return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {vertical.map((x) => (
          <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#E2E8F0" strokeWidth={1} />
        ))}
        {horizontal.map((y) => (
          <Line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#E2E8F0" strokeWidth={1} />
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

  const deselectGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(2000)
        .onEnd((_e, success) => {
          if (success) runOnJS(onDeselectAll)();
        }),
    [onDeselectAll],
  );

  return (
    <View
      collapsable={false}
      style={{
        width: w,
        height: h,
        backgroundColor,
        ...(stockCut ? { overflow: 'hidden' as const } : shapeClip),
      }}>
      {stockOutline}
      <ViewShot ref={ref} options={{ format: 'png', quality: 1 }} style={{ width: w, height: h, ...shapeClip }}>
        <View
          collapsable={false}
          style={[
            styles.canvasPad,
            {
              width: w,
              height: h,
              backgroundColor,
              ...shapeClip,
            },
          ]}>
          {doc.background?.type === 'image' ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <Image
                source={{ uri: doc.background.uri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            </View>
          ) : null}

          {jewelryGuides}
          {gridLines}

          <GestureDetector gesture={deselectGesture}>
            <View style={StyleSheet.absoluteFillObject} collapsable={false} />
          </GestureDetector>

          {sortLayers(doc.elements).map((element: LabelElement) => (
            <KonvaTransformer
              key={element.id}
              element={element}
              pxPerMM={pxPerMM}
              padZoom={padZoom}
              selected={selectedIds.includes(element.id)}
              selectionColor={selectionColor}
              canvasWidthMm={
                isRatTailGeometry(doc.mediaGeometry)
                  ? ratTailBodyRectMm(doc.mediaGeometry).width
                  : doc.widthMm
              }
              canvasHeightMm={
                isRatTailGeometry(doc.mediaGeometry)
                  ? ratTailBodyRectMm(doc.mediaGeometry).height
                  : doc.heightMm
              }
              onSelect={onSelect}
              onOpenPanel={onOpenPanel}
              onEditText={onEditText}
              onTransformStart={onTransformStart}
              onTransformEnd={onTransformEnd}
              onQuickRotate={onQuickRotate}
            />
          ))}

          {doc.elements.length === 0 && !stockCut ? (
            <View pointerEvents="none" style={styles.emptyHintWrap}>
              <Text style={styles.emptyHint}>Tap a tool below to add elements</Text>
            </View>
          ) : null}

          {doc.mediaShape === 'diecut' || cableFlag || stockCut ? null : (
            <View pointerEvents="none" style={styles.artboardBorder} />
          )}
        </View>
      </ViewShot>
      {cableFlagOutline}
    </View>
  );
});

const styles = StyleSheet.create({
  canvasPad: {
    overflow: 'hidden',
    position: 'relative',
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
    borderColor: 'rgba(15, 23, 42, 0.25)',
  },
});
