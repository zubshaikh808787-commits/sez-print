import { renderPdfPage, type RasteredPdfPage } from 'pdf-raster';

export const PREVIEW_DPI = 300;
export const EXPORT_DPI = 300;

const cache = new Map<string, RasteredPdfPage>();

function key(uri: string, pageIndex: number, dpi: number) {
  return `${uri}::${pageIndex}::${dpi}`;
}

export async function rasterPdfPageCached(
  uri: string,
  pageIndex: number,
  dpi: number,
): Promise<RasteredPdfPage> {
  const k = key(uri, pageIndex, dpi);
  const hit = cache.get(k);
  if (hit) return hit;
  const page = await renderPdfPage(uri, pageIndex, dpi);
  cache.set(k, page);
  return page;
}

export function prefetchNeighborPages(uri: string, pageIndex: number, pageCount: number, dpi: number) {
  const neighbors = [pageIndex - 1, pageIndex + 1].filter((i) => i >= 0 && i < pageCount);
  for (const i of neighbors) {
    void rasterPdfPageCached(uri, i, dpi).catch(() => {});
  }
}

export function clearRasterCache() {
  cache.clear();
}

export type { RasteredPdfPage };
