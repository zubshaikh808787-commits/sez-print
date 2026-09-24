import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { cropNormToPixels, type NormalizedCrop } from '@/lib/editor/image-crop-math';

export async function applyImageCrop(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  crop: NormalizedCrop,
): Promise<{ uri: string; width: number; height: number }> {
  const { originX, originY, width, height } = cropNormToPixels(crop, sourceWidth, sourceHeight);
  const ctx = ImageManipulator.manipulate(sourceUri);
  ctx.crop({ originX, originY, width, height });
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  return {
    uri: saved.uri,
    width: rendered.width || width,
    height: rendered.height || height,
  };
}

export async function resolveImageDimensions(
  uri: string,
  fallbackWidth?: number,
  fallbackHeight?: number,
): Promise<{ width: number; height: number }> {
  if (fallbackWidth && fallbackHeight && fallbackWidth > 0 && fallbackHeight > 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  return {
    width: rendered.width || fallbackWidth || 1,
    height: rendered.height || fallbackHeight || 1,
  };
}
