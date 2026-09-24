import { requireNativeModule } from 'expo-modules-core';

export type RasteredPdfPage = {
  uri: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  pageCount: number;
};

type NativePdfRaster = {
  renderPdfPage(uriString: string, pageIndex: number, dpi: number): Promise<RasteredPdfPage>;
};

let cached: NativePdfRaster | null | undefined;

function getNative(): NativePdfRaster | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativePdfRaster>('PdfRaster');
  } catch {
    cached = null;
  }
  return cached;
}

export async function renderPdfPage(
  uriString: string,
  pageIndex: number,
  dpi = 150,
): Promise<RasteredPdfPage> {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'PDF raster module is not available. Rebuild the development client after adding pdf-raster.',
    );
  }
  return mod.renderPdfPage(uriString, pageIndex, dpi);
}

export function isPdfRasterAvailable(): boolean {
  return getNative() != null;
}
