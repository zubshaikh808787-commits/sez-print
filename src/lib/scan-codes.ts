import type { BarcodeScanningResult, BarcodeType } from 'expo-camera';

export const SCAN_CODE_TYPES: BarcodeType[] = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
  'pdf417',
  'aztec',
  'datamatrix',
];

export function payloadFromBarcodeResult(result: BarcodeScanningResult): { type: string; data: string } | null {
  const extra = result as BarcodeScanningResult & { raw?: string; extra?: { raw?: string } };
  const data = String(result.data ?? extra.raw ?? extra.extra?.raw ?? '').trim();
  if (!data) return null;
  return { type: String(result.type || 'unknown'), data };
}

export function isScanEmptyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /no usable data|not found|nothing detected|no barcode/i.test(message);
}
