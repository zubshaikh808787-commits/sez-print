import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { EXPORT_DPI, PREVIEW_DPI } from '@/lib/pdf-editor/raster';
import { tiledRepeatCount } from '@/lib/pdf-editor/session';

const TILE_MAX_EDGE_PX = 512;

export function tileFootprintPx(args: {
  pageMinSideMm: number;
  spacingNorm: { x: number; y: number };
  dpi: number;
}): { w: number; h: number } {
  const { cols, rows } = tiledRepeatCount(args.spacingNorm);
  const tileMmW = args.pageMinSideMm / Math.max(cols, 1);
  const tileMmH = args.pageMinSideMm / Math.max(rows, 1);
  const w = Math.min(TILE_MAX_EDGE_PX, Math.max(8, Math.round((tileMmW / 25.4) * args.dpi)));
  const h = Math.min(TILE_MAX_EDGE_PX, Math.max(8, Math.round((tileMmH / 25.4) * args.dpi)));
  return { w, h };
}

/** Downscale source to the tile footprint. Always from source, never from a prior tile. */
export async function downscaleWatermarkTile(sourceUri: string, tilePx: { w: number; h: number }) {
  const ctx = ImageManipulator.manipulate(sourceUri);
  ctx.resize({ width: tilePx.w, height: tilePx.h });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ compress: 0.85, format: SaveFormat.PNG });
  return {
    tileUri: saved.uri,
    tilePx: { w: ref.width || tilePx.w, h: ref.height || tilePx.h },
  };
}

export function previewTileSize(pageMinSideMm: number, spacingNorm: { x: number; y: number }) {
  return tileFootprintPx({ pageMinSideMm, spacingNorm, dpi: PREVIEW_DPI });
}

export function exportTileSize(pageMinSideMm: number, spacingNorm: { x: number; y: number }) {
  return tileFootprintPx({ pageMinSideMm, spacingNorm, dpi: EXPORT_DPI });
}
