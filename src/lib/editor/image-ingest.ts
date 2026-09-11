/**
 * Editor image ingest math.
 *
 * Working copies are capped for drag performance. Print still uses the
 * original pixels. Placement is millimetres from source pixels / fit pxPerMm,
 * then contain-capped to the artboard so aspect never stretches.
 */

import { containFitImageOnLabel, type MmRect } from '@/lib/label-coordinate-system';
import { roundMm, type CanvasBounds } from '@/lib/editor/engine';
import type { LabelElement } from '@/lib/label-document';

export const EDITOR_IMAGE_MAX_EDGE_PX = 2000;
export const EDITOR_IMAGE_DIR_NAME = 'sez-editor-images';

export type WorkingImageSize = {
  widthPx: number;
  heightPx: number;
  downscaled: boolean;
};

export function workingSizePx(
  widthPx: number,
  heightPx: number,
  maxEdgePx = EDITOR_IMAGE_MAX_EDGE_PX,
): WorkingImageSize {
  const w = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  const h = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 1;
  const cap = Number.isFinite(maxEdgePx) && maxEdgePx > 0 ? maxEdgePx : EDITOR_IMAGE_MAX_EDGE_PX;
  const longEdge = Math.max(w, h);
  if (longEdge <= cap) {
    return { widthPx: Math.round(w), heightPx: Math.round(h), downscaled: false };
  }
  const scale = cap / longEdge;
  return {
    widthPx: Math.max(1, Math.round(w * scale)),
    heightPx: Math.max(1, Math.round(h * scale)),
    downscaled: true,
  };
}

/**
 * Initial on-label size: native pixels at the current fit `pxPerMm`, then
 * contain-fit if that box is larger than the content rect.
 */
export function placeImportedImageMm(opts: {
  widthPx: number;
  heightPx: number;
  pxPerMM: number;
  canvas: CanvasBounds;
  content?: MmRect;
}): MmRect {
  const box = opts.content ?? {
    left: 0,
    top: 0,
    width: opts.canvas.widthMm,
    height: opts.canvas.heightMm,
  };
  const iw = Number.isFinite(opts.widthPx) && opts.widthPx > 0 ? opts.widthPx : 1;
  const ih = Number.isFinite(opts.heightPx) && opts.heightPx > 0 ? opts.heightPx : 1;
  const scale = Number.isFinite(opts.pxPerMM) && opts.pxPerMM > 0 ? opts.pxPerMM : 0;
  if (scale > 0) {
    const naturalW = iw / scale;
    const naturalH = ih / scale;
    if (naturalW <= box.width + 1e-9 && naturalH <= box.height + 1e-9) {
      return {
        left: roundMm(box.left + (box.width - naturalW) / 2),
        top: roundMm(box.top + (box.height - naturalH) / 2),
        width: roundMm(naturalW),
        height: roundMm(naturalH),
      };
    }
  }
  return containFitImageOnLabel(
    { widthMm: opts.canvas.widthMm, heightMm: opts.canvas.heightMm },
    { widthPx: iw, heightPx: ih },
    box,
  );
}

export function printImageUri(el: { uri: string; printUri?: string }): string {
  const print = el.printUri?.trim();
  if (print) return print;
  return el.uri;
}

export function collectImageFileUris(groups: LabelElement[][]): string[] {
  const uris = new Set<string>();
  for (const elements of groups) {
    for (const el of elements) {
      if (el.type !== 'image') continue;
      if (el.uri) uris.add(el.uri);
      if (el.printUri) uris.add(el.printUri);
    }
  }
  return [...uris];
}

export function editorImageFileName(uri: string): string {
  const trimmed = uri.split('?')[0] ?? uri;
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function isManagedEditorImageUri(uri: string, dirName = EDITOR_IMAGE_DIR_NAME): boolean {
  return uri.includes(dirName);
}

export function unreferencedManagedFiles(
  existingFileNames: string[],
  keepUris: string[],
  dirName = EDITOR_IMAGE_DIR_NAME,
): string[] {
  const keep = new Set(
    keepUris.filter((uri) => isManagedEditorImageUri(uri, dirName)).map(editorImageFileName),
  );
  return existingFileNames.filter((name) => !keep.has(name));
}
