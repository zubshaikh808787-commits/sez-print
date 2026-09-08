import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeJpeg } from 'jpeg-js';

import { applyExifOrientation, readJpegExifOrientation } from '@/lib/printer/exif-orientation';
import { base64ToBytes, pngBase64ToGray, type GrayRaster } from '@/lib/printer/escpos';
import { logPrintTrace } from '@/printing';

export type GalleryDecodeResult = {
  gray: GrayRaster;
  sourceWidth: number;
  sourceHeight: number;
  exifOrientation: number | null;
  normalizedWidth: number;
  normalizedHeight: number;
  format: 'jpeg' | 'png' | 'unknown';
};

/**
 * Decode a gallery file to an upright gray bitmap.
 * EXIF is applied here once. Callers must not rotate again for EXIF.
 */
export async function decodeGalleryImage(uri: string): Promise<GalleryDecodeResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const format = sniffFormat(bytes);

  let gray: GrayRaster;
  let exifOrientation: number | null = null;
  let sourceWidth: number;
  let sourceHeight: number;

  if (format === 'png') {
    gray = pngBase64ToGray(base64);
    sourceWidth = gray.width;
    sourceHeight = gray.height;
  } else if (format === 'jpeg') {
    exifOrientation = readJpegExifOrientation(bytes);
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 96,
    });
    sourceWidth = decoded.width;
    sourceHeight = decoded.height;
    gray = rgbaToGray(decoded.width, decoded.height, decoded.data);
    gray = applyExifOrientation(gray, exifOrientation);
  } else {
    throw new Error('Unsupported gallery image. Use a JPEG or PNG.');
  }

  logPrintTrace('GALLERY_DECODE', {
    format,
    sourceWidth,
    sourceHeight,
    exifOrientation: exifOrientation ?? 1,
    normalizedWidth: gray.width,
    normalizedHeight: gray.height,
  });

  return {
    gray,
    sourceWidth,
    sourceHeight,
    exifOrientation,
    normalizedWidth: gray.width,
    normalizedHeight: gray.height,
    format,
  };
}

function sniffFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'unknown' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  return 'unknown';
}

function rgbaToGray(width: number, height: number, data: Uint8Array): GrayRaster {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = data[p + 3];
    if (a === 0) {
      gray[i] = 255;
      continue;
    }
    const lum = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
    gray[i] = a === 255 ? lum : (lum * a + 255 * (255 - a) + 128) >> 8;
  }
  return { width, height, gray };
}
