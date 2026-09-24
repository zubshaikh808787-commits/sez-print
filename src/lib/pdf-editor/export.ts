import * as FileSystem from 'expo-file-system/legacy';
import { decodePng, encodePng } from '@/lib/fast-png-shim';
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
} from 'pdf-lib';

import { EXPORT_DPI, rasterPdfPageCached } from '@/lib/pdf-editor/raster';
import {
  cropWindowPts,
  resolveScopeIndices,
  shouldRasterizePage,
  stampRectInCropSpace,
  tiledRepeatCount,
  type PdfBoxPts,
  type PdfEditSession,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';
import { unsharpRgba } from '@/lib/pdf-editor/sharpen';
import { downscaleWatermarkTile, exportTileSize } from '@/lib/pdf-editor/watermark-tile';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function readBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function cropBoxForPage(session: PdfEditSession, pageIndex: number): PdfBoxPts {
  const size = session.pageSizesPt[pageIndex] ?? { w: 612, h: 792 };
  const cropPages = session.crop
    ? new Set(resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex))
    : new Set<number>();
  if (!session.crop || !cropPages.has(pageIndex)) {
    return { x: 0, y: 0, w: size.w, h: size.h, fits: true };
  }
  return cropWindowPts(size, session.outputSize, session.crop.originNorm, session.crop.sizeNorm);
}

function applyCollapsedBoxes(page: PDFPage, box: PdfBoxPts) {
  if (!box.fits) return;
  page.setMediaBox(box.x, box.y, box.w, box.h);
  page.setCropBox(box.x, box.y, box.w, box.h);
}

async function drawWatermark(
  out: PDFDocument,
  page: PDFPage,
  crop: PdfBoxPts,
  wm: PdfWatermark,
  pageMinSideMm: number,
) {
  const opacity = Math.min(1, Math.max(0, wm.opacity));
  const rotation = wm.rotationDeg;

  if (wm.layout === 'tiled') {
    const spacing = wm.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 };
    const { cols, rows } = tiledRepeatCount(spacing);
    const cellW = crop.w / cols;
    const cellH = crop.h / rows;

    if (wm.type === 'image' && wm.image?.sourceUri) {
      const tilePx = exportTileSize(pageMinSideMm, spacing);
      const tile = await downscaleWatermarkTile(wm.image.sourceUri, tilePx);
      const bytes = await readBytes(tile.tileUri);
      const img = await out.embedPng(bytes);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = crop.x + c * cellW + cellW * 0.1;
          const y = crop.y + (rows - 1 - r) * cellH + cellH * 0.1;
          page.drawImage(img, {
            x,
            y,
            width: cellW * 0.8,
            height: cellH * 0.8,
            rotate: degrees(rotation),
            opacity,
          });
        }
      }
      return;
    }

    const font = await out.embedFont(StandardFonts.Helvetica);
    const text = wm.text?.content || 'WATERMARK';
    const color = hexToRgb(wm.text?.color || '#888888');
    const size = Math.max(6, Math.min(cellW, cellH) * 0.18);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = crop.x + c * cellW + cellW * 0.1;
        const y = crop.y + (rows - 1 - r) * cellH + cellH * 0.35;
        page.drawText(text, {
          x,
          y,
          size,
          font,
          color,
          rotate: degrees(rotation),
          opacity,
        });
      }
    }
    return;
  }

  const stamp = wm.stamp ?? {
    offsetNorm: { x: 0.5, y: 0.5 },
    sizeNorm: 0.28,
    anchor: 'center' as const,
  };
  const rect = stampRectInCropSpace(crop, stamp);

  if (wm.type === 'image' && wm.image?.sourceUri) {
    const bytes = await readBytes(wm.image.sourceUri);
    const img = bytes[0] === 0xff ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    page.drawImage(img, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      rotate: degrees(rotation),
      opacity,
    });
    return;
  }

  const font = await out.embedFont(StandardFonts.Helvetica);
  page.drawText(wm.text?.content || 'WATERMARK', {
    x: rect.x,
    y: rect.y + rect.h * 0.3,
    size: Math.max(8, rect.h * 0.25),
    font,
    color: hexToRgb(wm.text?.color || '#888888'),
    rotate: degrees(rotation),
    opacity,
  });
}

function rotateRgba(
  src: Uint8Array,
  width: number,
  height: number,
  deg: number,
): { data: Uint8Array; width: number; height: number } {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return { data: src, width, height };
  if (r === 180) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        out[di] = src[si];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = src[si + 3];
      }
    }
    return { data: out, width, height };
  }
  const outW = height;
  const outH = width;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const dx = r === 90 ? height - 1 - y : y;
      const dy = r === 90 ? x : width - 1 - x;
      const di = (dy * outW + dx) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}

function cropRgba(
  src: Uint8Array,
  width: number,
  height: number,
  box: PdfBoxPts,
  pageWpt: number,
  pageHpt: number,
): { data: Uint8Array; width: number; height: number } {
  const x0 = Math.max(0, Math.floor((box.x / pageWpt) * width));
  const y0Top = Math.max(0, Math.floor(((pageHpt - box.y - box.h) / pageHpt) * height));
  const cw = Math.max(1, Math.min(width - x0, Math.round((box.w / pageWpt) * width)));
  const ch = Math.max(1, Math.min(height - y0Top, Math.round((box.h / pageHpt) * height)));
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcOff = ((y0Top + y) * width + x0) * 4;
    out.set(src.subarray(srcOff, srcOff + cw * 4), y * cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

export type PdfExportProgress = (current: number, total: number) => void;

export type PdfExportResult = {
  uri: string;
  usedRaster: boolean[];
};

export async function exportEditedPdf(
  session: PdfEditSession,
  onProgress?: PdfExportProgress,
): Promise<PdfExportResult> {
  const srcBytes = await readBytes(session.sourceUri);
  const srcDoc = await PDFDocument.load(srcBytes);
  const out = await PDFDocument.create();
  const usedRaster: boolean[] = [];

  const wmPages = session.watermark
    ? new Set(
        resolveScopeIndices(session.watermark.scope, session.pageCount, session.currentPageIndex),
      )
    : new Set<number>();

  for (let i = 0; i < session.pageCount; i++) {
    onProgress?.(i + 1, session.pageCount);
    const sharpness = session.sharpnessByPage[i] ?? 0;
    const rotation = session.rotationByPage[i] ?? 0;
    const box = cropBoxForPage(session, i);
    const pageSize = session.pageSizesPt[i] ?? { w: 612, h: 792 };
    const raster = shouldRasterizePage(sharpness);
    usedRaster.push(raster);

    if (raster) {
      const rendered = await rasterPdfPageCached(session.sourceUri, i, EXPORT_DPI);
      const pngBytes = await readBytes(rendered.uri);
      const decoded = decodePng(pngBytes);
      const rgba = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
      const cropped = box.fits
        ? cropRgba(rgba, decoded.width, decoded.height, box, pageSize.w, pageSize.h)
        : { data: rgba, width: decoded.width, height: decoded.height };
      const rotated = rotateRgba(cropped.data, cropped.width, cropped.height, rotation);
      const radius = Math.max(1, Math.round((EXPORT_DPI / 150) * 1));
      const sharp = unsharpRgba(rotated.data, rotated.width, rotated.height, sharpness, radius);
      const encoded = encodePng({
        width: rotated.width,
        height: rotated.height,
        data: sharp,
        depth: 8,
        channels: 4,
      });
      const pageW = box.fits ? box.w : pageSize.w;
      const pageH = box.fits ? box.h : pageSize.h;
      const page = out.addPage([pageW, pageH]);
      const img = await out.embedPng(encoded);
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
      if (session.watermark && wmPages.has(i)) {
        const wmBox: PdfBoxPts = { x: 0, y: 0, w: pageW, h: pageH, fits: true };
        await drawWatermark(out, page, wmBox, session.watermark, (pageW * 25.4) / 72);
      }
      continue;
    }

    const [copied] = await out.copyPages(srcDoc, [i]);
    out.addPage(copied);
    applyCollapsedBoxes(copied, box);
    if (rotation) copied.setRotation(degrees(rotation));
    if (session.watermark && wmPages.has(i)) {
      const wmBox = box.fits ? box : { x: 0, y: 0, w: pageSize.w, h: pageSize.h, fits: true };
      await drawWatermark(
        out,
        copied,
        wmBox,
        session.watermark,
        (wmBox.w * 25.4) / 72,
      );
    }
  }

  const outB64 = await out.saveAsBase64({ dataUri: false });
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const dir = `${root}pdf-editor/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const uri = `${dir}export_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(uri, outB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri, usedRaster };
}
