import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AlphaType,
  Canvas,
  ColorType,
  Fill,
  Image as SkiaImage,
  ImageShader,
  Skia,
  TileMode,
  useImage,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';

import type { EditorColorMode } from '@/lib/editor/image-mono';
import { applyMonoToRgba, resolveEditorColorMode } from '@/lib/editor/image-mono';

type MonoImagePreviewProps = {
  uri: string;
  widthPx: number;
  heightPx: number;
  colorMode?: EditorColorMode | string;
  grayThreshold?: number;
  tile?: boolean;
  contentFit?: 'fill' | 'contain' | 'cover';
  flipH?: boolean;
  flipV?: boolean;
  antiColor?: boolean;
};

export function MonoImagePreview({
  uri,
  widthPx,
  heightPx,
  colorMode,
  grayThreshold = 128,
  tile = false,
  contentFit = 'contain',
  flipH = false,
  flipV = false,
  antiColor = false,
}: MonoImagePreviewProps) {
  const mode = resolveEditorColorMode(colorMode);
  const source = useImage(uri);
  const [processed, setProcessed] = useState(source);

  useEffect(() => {
    if (!source) {
      setProcessed(null);
      return;
    }
    if (mode === 'Original') {
      setProcessed(source);
      return;
    }
    const raster = source.makeNonTextureImage();
    const width = raster.width();
    const height = raster.height();
    const pixels = raster.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) {
      setProcessed(source);
      return;
    }
    const rgba = pixels instanceof Uint8Array ? new Uint8Array(pixels) : new Uint8Array(pixels as ArrayBuffer);
    applyMonoToRgba(rgba, width, height, grayThreshold, mode);
    const next = Skia.Image.MakeImage(
      {
        width,
        height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      },
      Skia.Data.fromBytes(rgba),
      width * 4,
    );
    setProcessed(next ?? source);
  }, [source, mode, grayThreshold, uri]);

  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const tileW = processed ? Math.max(8, processed.width()) : w;
  const tileH = processed ? Math.max(8, processed.height()) : h;

  const transforms = useMemo(() => {
    const list: ({ scaleX: number } | { scaleY: number })[] = [];
    if (flipH) list.push({ scaleX: -1 });
    if (flipV) list.push({ scaleY: -1 });
    return list;
  }, [flipH, flipV]);

  if (mode === 'Original' && !tile) {
    return (
      <View style={[styles.fill, antiColor && styles.antiBg]}>
        <Image
          source={{ uri }}
          style={[styles.fill, transforms.length > 0 ? { transform: transforms } : null]}
          contentFit={contentFit}
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fill,
        antiColor && styles.antiBg,
        transforms.length > 0 ? { transform: transforms } : null,
      ]}>
      <Canvas style={{ width: w, height: h }} pointerEvents="none">
        {processed && !tile ? (
          <SkiaImage image={processed} x={0} y={0} width={w} height={h} fit={contentFit} />
        ) : null}
        {processed && tile ? (
          <Fill>
            <ImageShader
              image={processed}
              tx={TileMode.Repeat}
              ty={TileMode.Repeat}
              fit="none"
              width={tileW}
              height={tileH}
            />
          </Fill>
        ) : null}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  antiBg: {
    backgroundColor: '#111827',
  },
});
