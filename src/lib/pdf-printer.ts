/**
 * PDF Thermal Print Engine
 *
 * Renders PDF documents natively to printer-resolution bitmaps and
 * dispatches them directly to the connected thermal printer (TD-404, Tez, Dev, Josh).
 */

import { renderPdfPages, type RenderedPdfPage, type RenderPdfResult } from 'td404-printer';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  encodeConnectedPrinterJob,
  rasterizePngForPrint,
  sendIsolatedPrintCopies,
} from '@/lib/printer/print-job';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { logPrintTrace } from '@/printing';

export type { RenderedPdfPage, RenderPdfResult };

export interface PdfPrintOptions {
  /** Page index to print, or 'all' for the whole document. Default: 'all'. */
  pageSelection?: number | 'all';
  /** Number of physical copies to print per page. Default: 1. */
  copies?: number;
  /** Thermal head density / darkness (0–15). Default: 10. */
  density?: number | null;
  /** Print speed (1–6). Default: 3. */
  speed?: number | null;
  /** Label gap in mm. Default: 2. */
  gapMm?: number;
  /** Media type: gap, continuous (receipt), or bline (black mark). Default: 'gap'. */
  mediaType?: 'gap' | 'continuous' | 'bline';
  /** Apply Floyd-Steinberg error diffusion for continuous tones. Default: true. */
  dither?: boolean;
  /** Document name for history logging. */
  docName?: string;
  /** Progress callback: (pageNumber, totalPagesToPrint). */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Fallback scanner for courier/shipping label PDFs containing embedded JPEG/PNG streams.
 * Allows instant thermal printing even if the native PDF module is pending recompilation.
 */
export async function extractEmbeddedImagesFromPdf(uri: string): Promise<RenderedPdfPage[]> {
  try {
    const FileSystem = await import('expo-file-system');
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64Data) return [];

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pages: RenderedPdfPage[] = [];
    let searchPos = 0;
    while (searchPos < bytes.length - 4) {
      if (bytes[searchPos] === 0xff && bytes[searchPos + 1] === 0xd8 && bytes[searchPos + 2] === 0xff) {
        const start = searchPos;
        let end = -1;
        for (let j = start + 3; j < bytes.length - 1; j++) {
          if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
            end = j + 2;
            break;
          }
        }
        if (end > start) {
          const jpegSlice = bytes.subarray(start, end);
          if (jpegSlice.length > 1024) {
            let binary = '';
            const CHUNK = 8192;
            for (let k = 0; k < jpegSlice.length; k += CHUNK) {
              const chunk = jpegSlice.subarray(k, Math.min(k + CHUNK, jpegSlice.length));
              binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
            }
            const b64 = btoa(binary);
            pages.push({
              pageIndex: pages.length,
              widthPx: 800,
              heightPx: 1200,
              widthMm: 100,
              heightMm: 150,
              base64: b64,
            });
            searchPos = end;
            continue;
          }
        }
      }
      searchPos++;
    }
    return pages;
  } catch (err) {
    console.warn('[pdf-printer] Stream extraction fallback failed:', err);
    return [];
  }
}

/**
 * Render PDF document pages into high-resolution bitmaps at the connected printer's DPI.
 */
export async function loadAndRenderPdf(
  uri: string,
  targetDpi?: number,
): Promise<RenderPdfResult> {
  const manager = getPrinterManager();
  const dpi = targetDpi ?? manager.getPrintDpi();

  // 1. Native hardware-accelerated PDF page renderer
  let result: RenderPdfResult | null = null;
  try {
    result = await renderPdfPages(uri, { dpi, maxPages: 50 });
  } catch (nativeErr) {
    console.warn('[pdf-printer] Native renderPdfPages threw:', nativeErr);
  }

  if (result && result.pages && result.pages.length > 0) {
    return result;
  }

  // 2. Embedded raster label stream extraction fallback
  const fallbackPages = await extractEmbeddedImagesFromPdf(uri);
  if (fallbackPages.length > 0) {
    return {
      pageCount: fallbackPages.length,
      pages: fallbackPages,
    };
  }

  throw new Error(
    'Unable to render PDF document. Please connect your printer and ensure the development build is up to date.',
  );
}

/**
 * Print rendered PDF pages directly to the connected thermal printer.
 */
export async function printPdfToThermal(
  pages: RenderedPdfPage[],
  options: PdfPrintOptions = {},
): Promise<{ pagesPrinted: number; totalJobs: number }> {
  const manager = getPrinterManager();
  if (!manager.isConnected) {
    throw new Error('Printer Not Connected. Please connect your printer before printing.');
  }

  const selection = options.pageSelection ?? 'all';
  const targetPages =
    selection === 'all'
      ? pages
      : pages.filter((p) => p.pageIndex === selection);

  if (targetPages.length === 0) {
    throw new Error('No valid PDF pages selected for printing.');
  }

  const copies = Math.max(1, options.copies ?? 1);
  const density = options.density ?? 10;
  const speed = options.speed ?? 3;
  const gapMm = options.gapMm ?? 2;
  const mediaType = options.mediaType ?? 'gap';
  const dither = options.dither ?? true;
  const dpi = manager.getPrintDpi();

  logPrintTrace('PDF_PRINT_START', {
    pageCount: targetPages.length,
    copies,
    density,
    speed,
    gapMm,
    mediaType,
    dither,
    dpi,
  });

  let pagesPrinted = 0;
  for (let i = 0; i < targetPages.length; i++) {
    const page = targetPages[i];
    options.onProgress?.(i + 1, targetPages.length);

    logPrintTrace('PDF_PRINT_PAGE', {
      pageIndex: page.pageIndex,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
    });

    let printed = false;
    try {
      printed = await manager.printPngLabelFast({
        pngBase64: page.base64,
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        gapMm,
        copies,
        density,
        speed,
        media: mediaType,
        dither,
        orientation: 0,
        dpi,
      });
    } catch (fastErr) {
      console.warn('[pdf-printer] printPngLabelFast threw, trying JS fallback:', fastErr);
      printed = false;
    }

    if (!printed) {
      console.info('[pdf-printer] Using JS raster fallback for PDF page', page.pageIndex);
      const bits = rasterizePngForPrint(page.base64, {
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        orientation: 0,
        dither,
        dpi,
      });

      const bytes = encodeConnectedPrinterJob(bits, {
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        gapMm,
        copies: 1,
        density,
        speed,
        media: mediaType,
        dpi,
      });

      await sendIsolatedPrintCopies(bytes, copies);
      pagesPrinted++;
    } else {
      pagesPrinted++;
    }
  }

  const printingSettings = useSettingsStore.getState().printing;
  if (printingSettings.recordHistory) {
    usePrinterStore.getState().addHistoryEntry({
      labelName: options.docName ?? `PDF Document (${pagesPrinted}p)`,
      copies,
      source: 'pdf',
    });
  }

  return { pagesPrinted, totalJobs: targetPages.length };
}
