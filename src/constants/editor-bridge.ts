export type ScanResult = {
  type: string;
  data: string;
};

export type OcrResultType = 'Text' | 'Barcode' | 'QRCode';

export type OcrResult = {
  type: OcrResultType;
  data: string;
};

export type ClipartResult = {
  id: string;
};

export const editorBridge = {
  columnNameResult: null as string | null,
  columnNameConsumer: null as 'qrcode' | 'arctext' | 'degrees' | 'text' | 'barcode' | null,
  scanResult: null as ScanResult | null,
  ocrResult: null as OcrResult | null,
  asrResult: null as OcrResult | null,
  clipartResult: null as ClipartResult | null,
  borderResult: null as import('@/constants/border-library').BorderStyleId | null,
  fontResult: null as string | null,
};

const QR_SCAN_TYPES = new Set(['qr', 'aztec', 'datamatrix', 'pdf417']);

export function isQrScanType(type: string) {
  return QR_SCAN_TYPES.has(type.toLowerCase());
}

export function barcodeEncodeModeForScanType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('ean13')) return 'EAN-13';
  if (normalized.includes('ean8')) return 'EAN-8';
  if (normalized.includes('upc')) return 'UPC-A';
  if (normalized.includes('code39')) return 'CODE-39';
  if (normalized.includes('itf')) return 'ITF';
  return 'CODE-128';
}
