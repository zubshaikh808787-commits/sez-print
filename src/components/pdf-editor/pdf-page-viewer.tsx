import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, ColorMatrix, Image as SkiaImage, useImage } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/ui';
import { sharpnessPreviewMatrix } from '@/lib/pdf-editor/sharpen';
import {
  ptToMm,
  tiledRepeatCount,
  type OutputSize,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';

export function PdfPageViewer({
  uri,
  pageWpt,
  pageHpt,
  rotation,
  outputSize,
  originNorm,
  sizeNorm,
  onCropRect,
  cropEnabled,
  isCropped,
  watermark,
  watermarkEnabled,
  onStampOffset,
  sharpness,
}: {
  uri: string | null;
  pageWpt: number;
  pageHpt: number;
  rotation: number;
  outputSize: OutputSize;
  originNorm: { x: number; y: number };
  sizeNorm?: { w: number; h: number };
  onCropRect: (origin: { x: number; y: number }, size: { w: number; h: number }) => void;
  cropEnabled: boolean;
  isCropped?: boolean;
  watermark: PdfWatermark | null;
  watermarkEnabled: boolean;
  onStampOffset: (o: { x: number; y: number }) => void;
  sharpness: number;
}) {
  const image = useImage(uri ?? undefined);
  const pageMmW = ptToMm(pageWpt);
  const pageMmH = ptToMm(pageHpt);

  const layout = useMemo(() => {
    const maxW = 320;
    const maxH = 340;
    const scale = Math.min(maxW / Math.max(pageMmW, 1), maxH / Math.max(pageMmH, 1));
    const dispW = pageMmW * scale;
    const dispH = pageMmH * scale;

    let winW: number;
    let winH: number;
    if (sizeNorm && sizeNorm.w > 0 && sizeNorm.h > 0) {
      winW = Math.min(dispW, Math.max(30, sizeNorm.w * dispW));
      winH = Math.min(dispH, Math.max(30, sizeNorm.h * dispH));
    } else {
      const naturalW = (outputSize.widthMm / Math.max(pageMmW, 1)) * dispW;
      const naturalH = (outputSize.heightMm / Math.max(pageMmH, 1)) * dispH;
      if (naturalW > dispW || naturalH > dispH) {
        const s = Math.min(dispW / naturalW, dispH / naturalH);
        winW = naturalW * s;
        winH = naturalH * s;
      } else {
        winW = naturalW;
        winH = naturalH;
      }
    }

    const maxOx = Math.max(0, 1 - winW / dispW);
    const maxOy = Math.max(0, 1 - winH / dispH);
    const ox = Math.min(maxOx, Math.max(0, originNorm.x));
    const oy = Math.min(maxOy, Math.max(0, originNorm.y));
    const cropLeft = ox * dispW;
    const cropTop = oy * dispH;

    return { dispW, dispH, winW, winH, ox, oy, maxOx, maxOy, cropLeft, cropTop, scale };
  }, [originNorm.x, originNorm.y, outputSize.heightMm, outputSize.widthMm, pageMmH, pageMmW, sizeNorm]);

  const fitFrame = useMemo(() => {
    const maxW = 320;
    const maxH = 340;
    const frameScale = Math.min(maxW / Math.max(outputSize.widthMm, 1), maxH / Math.max(outputSize.heightMm, 1));
    const stageW = outputSize.widthMm * frameScale;
    const stageH = outputSize.heightMm * frameScale;
    const contain = Math.min(stageW / Math.max(pageMmW, 1), stageH / Math.max(pageMmH, 1));
    const imgW = pageMmW * contain;
    const imgH = pageMmH * contain;
    return {
      stageW,
      stageH,
      imgW,
      imgH,
      imgX: (stageW - imgW) / 2,
      imgY: (stageH - imgH) / 2,
    };
  }, [outputSize.heightMm, outputSize.widthMm, pageMmH, pageMmW]);

  const presentOnlyCrop = Boolean(isCropped && !cropEnabled);

  const cropLayout = useMemo(() => {
    if (!presentOnlyCrop) {
      return null;
    }
    const cropNormX = originNorm.x;
    const cropNormY = originNorm.y;
    const cropNormW = sizeNorm && sizeNorm.w > 0 ? sizeNorm.w : layout.winW / layout.dispW;
    const cropNormH = sizeNorm && sizeNorm.h > 0 ? sizeNorm.h : layout.winH / layout.dispH;

    const cropMmW = Math.max(5, cropNormW * pageMmW);
    const cropMmH = Math.max(5, cropNormH * pageMmH);

    const zoom = Math.min(320 / cropMmW, 340 / cropMmH);
    const stageW = cropMmW * zoom;
    const stageH = cropMmH * zoom;

    const imgW = pageMmW * zoom;
    const imgH = pageMmH * zoom;
    const imgX = -cropNormX * pageMmW * zoom;
    const imgY = -cropNormY * pageMmH * zoom;

    return { stageW, stageH, imgW, imgH, imgX, imgY, cropNormW, cropNormH };
  }, [
    presentOnlyCrop,
    originNorm.x,
    originNorm.y,
    sizeNorm,
    layout.winW,
    layout.dispW,
    layout.winH,
    layout.dispH,
    pageMmW,
    pageMmH,
  ]);

  const activeStageW = cropEnabled || presentOnlyCrop
    ? cropLayout
      ? cropLayout.stageW
      : layout.dispW
    : fitFrame.stageW;
  const activeStageH = cropEnabled || presentOnlyCrop
    ? cropLayout
      ? cropLayout.stageH
      : layout.dispH
    : fitFrame.stageH;
  const activeImgW = cropEnabled || presentOnlyCrop
    ? cropLayout
      ? cropLayout.imgW
      : layout.dispW
    : fitFrame.imgW;
  const activeImgH = cropEnabled || presentOnlyCrop
    ? cropLayout
      ? cropLayout.imgH
      : layout.dispH
    : fitFrame.imgH;
  const activeImgX = cropEnabled || presentOnlyCrop ? (cropLayout ? cropLayout.imgX : 0) : fitFrame.imgX;
  const activeImgY = cropEnabled || presentOnlyCrop ? (cropLayout ? cropLayout.imgY : 0) : fitFrame.imgY;

  const swap = rotation === 90 || rotation === 270;

  // Reanimated UI-thread shared values for zero-latency dragging
  const cropX = useSharedValue(layout.cropLeft);
  const cropY = useSharedValue(layout.cropTop);
  const cropW = useSharedValue(layout.winW);
  const cropH = useSharedValue(layout.winH);

  const startCrop = useSharedValue({
    left: layout.cropLeft,
    top: layout.cropTop,
    w: layout.winW,
    h: layout.winH,
  });

  const stampNormX = useSharedValue(watermark?.stamp?.offsetNorm.x ?? 0.5);
  const stampNormY = useSharedValue(watermark?.stamp?.offsetNorm.y ?? 0.5);
  const startStamp = useSharedValue({
    x: watermark?.stamp?.offsetNorm.x ?? 0.5,
    y: watermark?.stamp?.offsetNorm.y ?? 0.5,
  });

  useEffect(() => {
    cropX.value = layout.cropLeft;
    cropY.value = layout.cropTop;
    cropW.value = layout.winW;
    cropH.value = layout.winH;
  }, [layout.cropLeft, layout.cropTop, layout.winW, layout.winH, cropX, cropY, cropW, cropH]);

  useEffect(() => {
    stampNormX.value = watermark?.stamp?.offsetNorm.x ?? 0.5;
    stampNormY.value = watermark?.stamp?.offsetNorm.y ?? 0.5;
  }, [watermark?.stamp?.offsetNorm.x, watermark?.stamp?.offsetNorm.y, stampNormX, stampNormY]);

  // Animated styles
  const cropBoxStyle = useAnimatedStyle(() => ({
    left: cropX.value,
    top: cropY.value,
    width: cropW.value,
    height: cropH.value,
  }));

  const topMaskStyle = useAnimatedStyle(() => ({
    top: 0,
    left: 0,
    right: 0,
    height: Math.max(0, cropY.value),
  }));

  const bottomMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value + cropH.value,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  const leftMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value,
    left: 0,
    width: Math.max(0, cropX.value),
    height: cropH.value,
  }));

  const rightMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value,
    left: cropX.value + cropW.value,
    right: 0,
    height: cropH.value,
  }));

  const stampW = Math.max(110, Math.min(activeStageW * 0.9, activeStageW * (watermark?.stamp?.sizeNorm ?? 0.42)));
  const stampH = Math.max(42, Math.round(stampW * 0.35));

  const stampWrapperStyle = useAnimatedStyle(() => {
    const stageWidth = cropEnabled ? cropW.value : activeStageW;
    const stageHeight = cropEnabled ? cropH.value : activeStageH;
    const maxX = Math.max(0, stageWidth - stampW);
    const maxY = Math.max(0, stageHeight - stampH);
    const baseLeft = cropEnabled ? cropX.value : 0;
    const baseTop = cropEnabled ? cropY.value : 0;
    const tx = baseLeft + stampNormX.value * maxX;
    const ty = baseTop + stampNormY.value * maxY;
    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
      ],
    };
  });

  // Center pan gesture: moves crop box on UI thread, commits onEnd
  const cropCenterPan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startCrop.value = {
            left: cropX.value,
            top: cropY.value,
            w: cropW.value,
            h: cropH.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const maxLeft = layout.dispW - startCrop.value.w;
          const maxTop = layout.dispH - startCrop.value.h;
          const nLeft = Math.min(maxLeft, Math.max(0, startCrop.value.left + e.translationX));
          const nTop = Math.min(maxTop, Math.max(0, startCrop.value.top + e.translationY));
          cropX.value = nLeft;
          cropY.value = nTop;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onCropRect)(
            { x: cropX.value / layout.dispW, y: cropY.value / layout.dispH },
            { w: cropW.value / layout.dispW, h: cropH.value / layout.dispH },
          );
        }),
    [cropH, cropW, cropX, cropY, layout.dispH, layout.dispW, onCropRect, startCrop],
  );

  // Corner resize gestures
  const resizeTL = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startCrop.value = {
            left: cropX.value,
            top: cropY.value,
            w: cropW.value,
            h: cropH.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const minSize = 24;
          const maxL = startCrop.value.left + startCrop.value.w - minSize;
          const maxT = startCrop.value.top + startCrop.value.h - minSize;
          const nLeft = Math.min(maxL, Math.max(0, startCrop.value.left + e.translationX));
          const nTop = Math.min(maxT, Math.max(0, startCrop.value.top + e.translationY));
          cropX.value = nLeft;
          cropY.value = nTop;
          cropW.value = startCrop.value.left + startCrop.value.w - nLeft;
          cropH.value = startCrop.value.top + startCrop.value.h - nTop;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onCropRect)(
            { x: cropX.value / layout.dispW, y: cropY.value / layout.dispH },
            { w: cropW.value / layout.dispW, h: cropH.value / layout.dispH },
          );
        }),
    [cropH, cropW, cropX, cropY, layout.dispH, layout.dispW, onCropRect, startCrop],
  );

  const resizeTR = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startCrop.value = {
            left: cropX.value,
            top: cropY.value,
            w: cropW.value,
            h: cropH.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const minSize = 24;
          const maxT = startCrop.value.top + startCrop.value.h - minSize;
          const nTop = Math.min(maxT, Math.max(0, startCrop.value.top + e.translationY));
          const maxW = layout.dispW - startCrop.value.left;
          cropY.value = nTop;
          cropW.value = Math.min(maxW, Math.max(minSize, startCrop.value.w + e.translationX));
          cropH.value = startCrop.value.top + startCrop.value.h - nTop;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onCropRect)(
            { x: cropX.value / layout.dispW, y: cropY.value / layout.dispH },
            { w: cropW.value / layout.dispW, h: cropH.value / layout.dispH },
          );
        }),
    [cropH, cropW, cropX, cropY, layout.dispH, layout.dispW, onCropRect, startCrop],
  );

  const resizeBL = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startCrop.value = {
            left: cropX.value,
            top: cropY.value,
            w: cropW.value,
            h: cropH.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const minSize = 24;
          const maxL = startCrop.value.left + startCrop.value.w - minSize;
          const nLeft = Math.min(maxL, Math.max(0, startCrop.value.left + e.translationX));
          const maxH = layout.dispH - startCrop.value.top;
          cropX.value = nLeft;
          cropW.value = startCrop.value.left + startCrop.value.w - nLeft;
          cropH.value = Math.min(maxH, Math.max(minSize, startCrop.value.h + e.translationY));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onCropRect)(
            { x: cropX.value / layout.dispW, y: cropY.value / layout.dispH },
            { w: cropW.value / layout.dispW, h: cropH.value / layout.dispH },
          );
        }),
    [cropH, cropW, cropX, cropY, layout.dispH, layout.dispW, onCropRect, startCrop],
  );

  const resizeBR = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startCrop.value = {
            left: cropX.value,
            top: cropY.value,
            w: cropW.value,
            h: cropH.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const minSize = 24;
          const maxW = layout.dispW - startCrop.value.left;
          const maxH = layout.dispH - startCrop.value.top;
          cropW.value = Math.min(maxW, Math.max(minSize, startCrop.value.w + e.translationX));
          cropH.value = Math.min(maxH, Math.max(minSize, startCrop.value.h + e.translationY));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onCropRect)(
            { x: cropX.value / layout.dispW, y: cropY.value / layout.dispH },
            { w: cropW.value / layout.dispW, h: cropH.value / layout.dispH },
          );
        }),
    [cropH, cropW, cropX, cropY, layout.dispH, layout.dispW, onCropRect, startCrop],
  );

  const stampPan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startStamp.value = {
            x: stampNormX.value,
            y: stampNormY.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const stageWidth = cropEnabled ? cropW.value : activeStageW;
          const stageHeight = cropEnabled ? cropH.value : activeStageH;
          const maxX = Math.max(1, stageWidth - stampW);
          const maxY = Math.max(1, stageHeight - stampH);
          stampNormX.value = Math.min(1, Math.max(0, startStamp.value.x + e.translationX / maxX));
          stampNormY.value = Math.min(1, Math.max(0, startStamp.value.y + e.translationY / maxY));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onStampOffset)({ x: stampNormX.value, y: stampNormY.value });
        }),
    [activeStageH, activeStageW, cropEnabled, cropH, cropW, onStampOffset, stampH, stampNormX, stampNormY, stampW, startStamp],
  );

  const tiles = watermark?.layout === 'tiled' ? tiledRepeatCount(watermark.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 }) : null;

  return (
    <View style={styles.stage}>
      <View
        style={{
          width: swap ? activeStageH : activeStageW,
          height: swap ? activeStageW : activeStageH,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: activeStageW,
            height: activeStageH,
            transform: [{ rotate: `${rotation}deg` }],
            backgroundColor: '#fff',
            overflow: 'hidden',
            borderRadius: 4,
            elevation: 2,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
          }}>
          {image ? (
            <Canvas style={{ width: activeStageW, height: activeStageH }}>
              <SkiaImage
                image={image}
                x={activeImgX}
                y={activeImgY}
                width={activeImgW}
                height={activeImgH}
                fit="fill">
                <ColorMatrix matrix={sharpnessPreviewMatrix(sharpness)} />
              </SkiaImage>
            </Canvas>
          ) : uri ? (
            <View style={[styles.placeholder, { width: activeStageW, height: activeStageH }]}>
              <ActivityIndicator color={Palette.accent} size="small" />
            </View>
          ) : (
            <View style={[styles.placeholder, { width: activeStageW, height: activeStageH }]}>
              <Text style={styles.placeholderText}>No page</Text>
            </View>
          )}

          {/* Semi-transparent outer mask overlays (only shown when crop tool is actively open) */}
          {cropEnabled ? (
            <>
              {/* Top Mask */}
              <Animated.View pointerEvents="none" style={[styles.mask, topMaskStyle]} />
              {/* Bottom Mask */}
              <Animated.View pointerEvents="none" style={[styles.mask, bottomMaskStyle]} />
              {/* Left Mask */}
              <Animated.View pointerEvents="none" style={[styles.mask, leftMaskStyle]} />
              {/* Right Mask */}
              <Animated.View pointerEvents="none" style={[styles.mask, rightMaskStyle]} />
            </>
          ) : null}

          {/* Interactive Crop Window (only shown when crop tool is actively open) */}
          {cropEnabled ? (
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.crop,
                cropBoxStyle,
                { borderColor: '#FFFFFF' },
              ]}>
              {/* Center pan gesture to move crop window */}
              <GestureDetector gesture={cropCenterPan}>
                <View style={StyleSheet.absoluteFill} />
              </GestureDetector>

              {/* Corner Resize Handles */}
              <GestureDetector gesture={resizeTL}>
                <View style={[styles.handleTouch, styles.handleTouchTL]}>
                  <View style={styles.handleVisual} />
                </View>
              </GestureDetector>
              <GestureDetector gesture={resizeTR}>
                <View style={[styles.handleTouch, styles.handleTouchTR]}>
                  <View style={styles.handleVisual} />
                </View>
              </GestureDetector>
              <GestureDetector gesture={resizeBL}>
                <View style={[styles.handleTouch, styles.handleTouchBL]}>
                  <View style={styles.handleVisual} />
                </View>
              </GestureDetector>
              <GestureDetector gesture={resizeBR}>
                <View style={[styles.handleTouch, styles.handleTouchBR]}>
                  <View style={styles.handleVisual} />
                </View>
              </GestureDetector>
            </Animated.View>
          ) : null}

          {/* Tiled Watermark Pattern */}
          {watermark?.layout === 'tiled' && tiles
            ? Array.from({ length: tiles.rows * (tiles.cols + 2) }).map((_, i) => {
                const totalCols = tiles.cols + 2;
                const c = (i % totalCols) - 1;
                const r = Math.floor(i / totalCols);
                const cellW = activeStageW / tiles.cols;
                const cellH = activeStageH / tiles.rows;
                const wmColor = watermark.text?.color || '#DC2626';
                const staggered = watermark.tiled?.staggered ?? true;
                const staggerX = staggered && r % 2 === 1 ? cellW * 0.5 : 0;
                const userPt = watermark.text?.fontSizePt ?? 22;
                const fontSize = Math.max(8, (userPt / 22) * Math.min(cellW, cellH) * 0.22);
                return (
                  <View
                    key={i}
                    pointerEvents="none"
                    style={[
                      styles.tileCell,
                      {
                        left: c * cellW + staggerX,
                        top: r * cellH,
                        width: cellW,
                        height: cellH,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.tileText,
                        {
                          color: wmColor,
                          opacity: watermark.opacity,
                          fontSize,
                          transform: [{ rotate: `${watermark.rotationDeg}deg` }],
                        },
                      ]}
                      numberOfLines={1}>
                      {watermark.type === 'text' ? watermark.text?.content || 'WATERMARK' : '•'}
                    </Text>
                  </View>
                );
              })
            : null}

          {/* Draggable Watermark Single Stamp (Prominent, cleanly visible) */}
          {watermark?.layout === 'stamp' ? (
            <Animated.View
              pointerEvents={watermarkEnabled ? 'auto' : 'none'}
              style={[
                styles.stampWrapper,
                {
                  width: stampW,
                  height: stampH,
                },
                stampWrapperStyle,
              ]}>
              <GestureDetector gesture={stampPan}>
                <View
                  style={[
                    styles.stampBox,
                    {
                      width: stampW,
                      height: stampH,
                      borderColor: watermark.text?.color || '#DC2626',
                      backgroundColor: 'rgba(255, 255, 255, 0.88)',
                      opacity: Math.max(0.35, watermark.opacity),
                      transform: [{ rotate: `${watermark.rotationDeg}deg` }],
                    },
                  ]}>
                  {watermarkEnabled ? (
                    <View style={styles.dragBadge}>
                      <Text style={styles.dragBadgeText}>DRAG</Text>
                    </View>
                  ) : null}
                  {watermark.type === 'text' ? (
                    <Text
                      style={[
                        styles.stampText,
                        {
                          color: watermark.text?.color || '#DC2626',
                          fontSize: Math.max(14, Math.round(stampH * 0.42)),
                        },
                      ]}
                      numberOfLines={1}>
                      {watermark.text?.content || 'WATERMARK'}
                    </Text>
                  ) : watermark.image?.sourceUri ? (
                    <RNImage
                      source={{ uri: watermark.image.sourceUri }}
                      style={{
                        width: stampW - 16,
                        height: stampH - 12,
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={[styles.stampText, { color: watermark.text?.color || '#DC2626' }]}>
                      [IMAGE]
                    </Text>
                  )}
                </View>
              </GestureDetector>
            </Animated.View>
          ) : null}
        </View>
      </View>
      <Text style={styles.hint}>Preview is grayscale only — export keeps color.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: 8 },
  placeholder: { backgroundColor: Palette.cardTop, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Palette.muted },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  crop: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  handleTouch: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleTouchTL: { top: -18, left: -18 },
  handleTouchTR: { top: -18, right: -18 },
  handleTouchBL: { bottom: -18, left: -18 },
  handleTouchBR: { bottom: -18, right: -18 },
  handleVisual: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Palette.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  stampWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 25,
  },
  stampBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dragBadge: {
    position: 'absolute',
    top: -9,
    right: 8,
    backgroundColor: Palette.accent,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dragBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stampText: {
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tileCell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  hint: { marginTop: 6, fontSize: 11, color: Palette.muted },
});
