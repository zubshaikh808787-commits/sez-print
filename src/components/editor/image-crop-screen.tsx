import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyImageCrop, resolveImageDimensions } from '@/lib/editor/apply-image-crop';
import {
  FULL_CROP,
  computeContainRect,
  hitTestCropDrag,
  layoutFromNorm,
  moveCrop,
  resizeCropCorner,
  type CropDragKind,
  type NormalizedCrop,
} from '@/lib/editor/image-crop-math';

const ACCENT = '#48C3C7';
const HANDLE = 24;

type ImageCropScreenProps = {
  sourceUri: string;
  sourceWidth?: number;
  sourceHeight?: number;
  onCancel: () => void;
  onDone: (result: { uri: string; width: number; height: number }) => void;
};

function readCrop(
  cropX: SharedValue<number>,
  cropY: SharedValue<number>,
  cropW: SharedValue<number>,
  cropH: SharedValue<number>,
): NormalizedCrop {
  'worklet';
  return {
    x: cropX.value,
    y: cropY.value,
    w: cropW.value,
    h: cropH.value,
  };
}

function writeCrop(
  crop: NormalizedCrop,
  cropX: SharedValue<number>,
  cropY: SharedValue<number>,
  cropW: SharedValue<number>,
  cropH: SharedValue<number>,
) {
  'worklet';
  cropX.value = crop.x;
  cropY.value = crop.y;
  cropW.value = crop.w;
  cropH.value = crop.h;
}

export function ImageCropScreen({
  sourceUri,
  sourceWidth,
  sourceHeight,
  onCancel,
  onDone,
}: ImageCropScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [loadingDims, setLoadingDims] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dims, setDims] = useState({ width: sourceWidth ?? 1, height: sourceHeight ?? 1 });
  const [stageSize, setStageSize] = useState({ width: screenW - 24, height: 400 });

  const cropX = useSharedValue(FULL_CROP.x);
  const cropY = useSharedValue(FULL_CROP.y);
  const cropW = useSharedValue(FULL_CROP.w);
  const cropH = useSharedValue(FULL_CROP.h);

  const imgX = useSharedValue(0);
  const imgY = useSharedValue(0);
  const imgW = useSharedValue(1);
  const imgH = useSharedValue(1);

  const dragKind = useSharedValue<CropDragKind>('none');
  const startCrop = useSharedValue<NormalizedCrop>(FULL_CROP);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveImageDimensions(sourceUri, sourceWidth, sourceHeight);
        if (!cancelled) setDims(resolved);
      } finally {
        if (!cancelled) setLoadingDims(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceUri, sourceWidth, sourceHeight]);

  useEffect(() => {
    const rect = computeContainRect(stageSize.width, stageSize.height, dims.width, dims.height);
    imgX.value = rect.x;
    imgY.value = rect.y;
    imgW.value = rect.width;
    imgH.value = rect.height;
  }, [stageSize, dims.width, dims.height, imgX, imgY, imgW, imgH]);

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin((event) => {
      'worklet';
      const layout = layoutFromNorm(
        readCrop(cropX, cropY, cropW, cropH),
        imgX.value,
        imgY.value,
        imgW.value,
        imgH.value,
      );
      dragKind.value = hitTestCropDrag(event.x, event.y, layout);
      startCrop.value = readCrop(cropX, cropY, cropW, cropH);
    })
    .onUpdate((event) => {
      'worklet';
      if (dragKind.value === 'none' || imgW.value <= 0 || imgH.value <= 0) return;
      const dx = event.translationX / imgW.value;
      const dy = event.translationY / imgH.value;
      const start = startCrop.value;
      if (dragKind.value === 'move') {
        writeCrop(moveCrop(start, dx, dy), cropX, cropY, cropW, cropH);
        return;
      }
      const corner = dragKind.value;
      if (corner === 'tl' || corner === 'tr' || corner === 'bl' || corner === 'br') {
        writeCrop(resizeCropCorner(start, corner, dx, dy), cropX, cropY, cropW, cropH);
      }
    })
    .onFinalize(() => {
      'worklet';
      dragKind.value = 'none';
    });

  const cropBoxStyle = useAnimatedStyle(() => ({
    left: imgX.value + cropX.value * imgW.value,
    top: imgY.value + cropY.value * imgH.value,
    width: cropW.value * imgW.value,
    height: cropH.value * imgH.value,
  }));

  const dimTopStyle = useAnimatedStyle(() => ({
    top: 0,
    left: 0,
    right: 0,
    height: imgY.value + cropY.value * imgH.value,
  }));

  const dimBottomStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value + cropH.value * imgH.value,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  const dimLeftStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value,
    left: 0,
    width: imgX.value + cropX.value * imgW.value,
    height: cropH.value * imgH.value,
  }));

  const dimRightStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value,
    left: imgX.value + cropX.value * imgW.value + cropW.value * imgW.value,
    right: 0,
    height: cropH.value * imgH.value,
  }));

  const handleReset = () => {
    cropX.value = FULL_CROP.x;
    cropY.value = FULL_CROP.y;
    cropW.value = FULL_CROP.w;
    cropH.value = FULL_CROP.h;
  };

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const crop = readCrop(cropX, cropY, cropW, cropH);
      const cropped = await applyImageCrop(sourceUri, dims.width, dims.height, crop);
      onDone(cropped);
    } catch (error) {
      Alert.alert(
        'Crop failed',
        error instanceof Error ? error.message : 'Could not crop this photo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Crop Photo</Text>
          <Text style={styles.subtitle}>Drag corners or move the frame</Text>
        </View>
        <Pressable
          disabled={saving || loadingDims}
          onPress={handleConfirm}
          hitSlop={12}
          style={({ pressed }) => [styles.doneBtn, (pressed || saving) && styles.pressed]}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.doneText}>Done</Text>
          )}
        </Pressable>
      </View>

      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setStageSize((prev) =>
              Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height },
            );
          }
        }}>
        {loadingDims ? (
          <ActivityIndicator color={ACCENT} size="large" />
        ) : (
          <>
            <Image source={{ uri: sourceUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
            <Animated.View pointerEvents="none" style={[styles.dim, dimTopStyle]} />
            <Animated.View pointerEvents="none" style={[styles.dim, dimBottomStyle]} />
            <Animated.View pointerEvents="none" style={[styles.dim, dimLeftStyle]} />
            <Animated.View pointerEvents="none" style={[styles.dim, dimRightStyle]} />

            <GestureDetector gesture={panGesture}>
              <View style={styles.gestureLayer}>
                <Animated.View pointerEvents="none" style={[styles.cropFrame, cropBoxStyle]}>
                  <View style={styles.cropBorder}>
                    <View style={[styles.gridLine, styles.gridVertical, { left: '33.33%' }]} />
                    <View style={[styles.gridLine, styles.gridVertical, { left: '66.66%' }]} />
                    <View style={[styles.gridLine, styles.gridHorizontal, { top: '33.33%' }]} />
                    <View style={[styles.gridLine, styles.gridHorizontal, { top: '66.66%' }]} />
                  </View>
                  <View style={[styles.handle, styles.handleTL]} />
                  <View style={[styles.handle, styles.handleTR]} />
                  <View style={[styles.handle, styles.handleBL]} />
                  <View style={[styles.handle, styles.handleBR]} />
                </Animated.View>
              </View>
            </GestureDetector>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
        <Text style={styles.footerHint}>Drag inside to move · corners to resize</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerBtn: { minWidth: 64, paddingVertical: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  cancelText: { color: '#CBD5E1', fontSize: 16, fontWeight: '500' },
  doneBtn: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { position: 'absolute', backgroundColor: 'rgba(15, 23, 42, 0.68)' },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  cropFrame: {
    position: 'absolute',
  },
  cropBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridVertical: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  gridHorizontal: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: '#FFFFFF',
  },
  handleTL: { left: -HANDLE / 2, top: -HANDLE / 2 },
  handleTR: { right: -HANDLE / 2, top: -HANDLE / 2 },
  handleBL: { left: -HANDLE / 2, bottom: -HANDLE / 2 },
  handleBR: { right: -HANDLE / 2, bottom: -HANDLE / 2 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  resetText: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },
  footerHint: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
