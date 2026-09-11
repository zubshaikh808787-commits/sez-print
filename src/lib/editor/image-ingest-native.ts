/**
 * Native image ingest: decode/downscale on a background thread
 * (`expo-image-manipulator`, the RN stand-in for `createImageBitmap`).
 */

import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { generateId } from '@/lib/label-document';
import {
  EDITOR_IMAGE_DIR_NAME,
  EDITOR_IMAGE_MAX_EDGE_PX,
  unreferencedManagedFiles,
  workingSizePx,
} from '@/lib/editor/image-ingest';

export type IngestedEditorImage = {
  previewUri: string;
  printUri: string;
  widthPx: number;
  heightPx: number;
  workingWidthPx: number;
  workingHeightPx: number;
  originalAspect: number;
};

function editorImageDir(): string | null {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) return null;
  return `${root}${EDITOR_IMAGE_DIR_NAME}/`;
}

async function ensureEditorImageDir(): Promise<string | null> {
  const dir = editorImageDir();
  if (!dir) return null;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function persistToEditorDir(sourceUri: string, fileName: string): Promise<string> {
  const dir = await ensureEditorImageDir();
  if (!dir) return sourceUri;
  const dest = `${dir}${fileName}`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri;
  }
}

/**
 * Decode the pick, keep a print-quality copy, and a ≤2000px working copy
 * for on-canvas drag. Yields so a loading spinner can paint first.
 */
export async function ingestEditorImage(source: {
  uri: string;
  width?: number;
  height?: number;
}): Promise<IngestedEditorImage> {
  await new Promise<void>((resolve) => setTimeout(resolve, 16));

  const id = generateId();
  const context = ImageManipulator.manipulate(source.uri);
  const originalRef = await context.renderAsync();
  const widthPx = originalRef.width || source.width || 1;
  const heightPx = originalRef.height || source.height || 1;
  const printSaved = await originalRef.saveAsync({
    compress: 0.92,
    format: SaveFormat.JPEG,
  });

  const working = workingSizePx(widthPx, heightPx, EDITOR_IMAGE_MAX_EDGE_PX);
  let previewSavedUri = printSaved.uri;
  if (working.downscaled) {
    const previewCtx = ImageManipulator.manipulate(printSaved.uri);
    previewCtx.resize({ width: working.widthPx, height: working.heightPx });
    const previewRef = await previewCtx.renderAsync();
    const previewSaved = await previewRef.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    previewSavedUri = previewSaved.uri;
  }

  const printUri = await persistToEditorDir(printSaved.uri, `${id}-print.jpg`);
  const previewUri = working.downscaled
    ? await persistToEditorDir(previewSavedUri, `${id}-preview.jpg`)
    : printUri;

  try {
    await Image.prefetch(previewUri);
  } catch {
    // Prefetch is best-effort; expo-image will decode on first paint.
  }

  return {
    previewUri,
    printUri,
    widthPx,
    heightPx,
    workingWidthPx: working.widthPx,
    workingHeightPx: working.heightPx,
    originalAspect: widthPx / heightPx,
  };
}

export async function sweepEditorImageFiles(keepUris: string[]): Promise<void> {
  const dir = editorImageDir();
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) return;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  const stale = unreferencedManagedFiles(names, keepUris);
  await Promise.all(
    stale.map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true })),
  );
}
