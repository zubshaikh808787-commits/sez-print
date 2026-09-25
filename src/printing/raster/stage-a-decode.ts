/**
 * Task 4.4b — expand packed 1-bit buffer and decode frozen-fixture Code128 + QR.
 * Shared by host gates and the on-device harness. Decode time is not on the 15 ms clock.
 */

import * as zxing from '@zxing/library';
import { unpackMono1bppToGray } from './bit-packer';
import type { RasterBitmap } from './skia-rasterizer';

export const STAGE_A_CODE128_PAYLOAD = 'BASELINE50X30';
export const STAGE_A_QR_PAYLOAD = 'https://sez.print/baseline';

const DPM = 12;

function cropGray(
  gray: Uint8Array,
  pageW: number,
  x: number,
  y: number,
  w: number,
  h: number,
): { lum: Uint8ClampedArray; width: number; height: number } {
  const lum = new Uint8ClampedArray(w * h);
  for (let row = 0; row < h; row++) {
    const src = (y + row) * pageW + x;
    lum.set(gray.subarray(src, src + w), row * w);
  }
  return { lum, width: w, height: h };
}

function decode(
  lum: Uint8ClampedArray,
  width: number,
  height: number,
  hints: Map<zxing.DecodeHintType, unknown>,
): string {
  const source = new zxing.RGBLuminanceSource(lum, width, height);
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(source));
  const reader = new zxing.MultiFormatReader();
  reader.setHints(hints);
  return reader.decode(bitmap).getText();
}

export type StageADecodeResult = {
  code128: string | null;
  qr: string | null;
  code128Pass: boolean;
  qrPass: boolean;
  pass: boolean;
  error?: string;
};

export function decodeStageAFrozenBuffer(bits: RasterBitmap): StageADecodeResult {
  try {
    const gray = unpackMono1bppToGray(
      bits.mono1bppBuffer,
      bits.widthDots,
      bits.heightDots,
      bits.bytesPerRow,
    );
    const barcodeCrop = cropGray(
      gray,
      bits.widthDots,
      Math.round(3 * DPM),
      Math.round(12 * DPM),
      Math.round(28 * DPM),
      Math.round(10 * DPM),
    );
    const qrCrop = cropGray(
      gray,
      bits.widthDots,
      Math.round(34 * DPM),
      Math.round(12 * DPM),
      Math.round(13 * DPM),
      Math.round(13 * DPM),
    );

    const codeHints = new Map<zxing.DecodeHintType, unknown>();
    codeHints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.CODE_128]);
    codeHints.set(zxing.DecodeHintType.TRY_HARDER, true);
    const qrHints = new Map<zxing.DecodeHintType, unknown>();
    qrHints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.QR_CODE]);
    qrHints.set(zxing.DecodeHintType.TRY_HARDER, true);

    const code128 = decode(barcodeCrop.lum, barcodeCrop.width, barcodeCrop.height, codeHints);
    const qr = decode(qrCrop.lum, qrCrop.width, qrCrop.height, qrHints);
    const code128Pass = code128 === STAGE_A_CODE128_PAYLOAD;
    const qrPass = qr === STAGE_A_QR_PAYLOAD;
    return { code128, qr, code128Pass, qrPass, pass: code128Pass && qrPass };
  } catch (err) {
    return {
      code128: null,
      qr: null,
      code128Pass: false,
      qrPass: false,
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
