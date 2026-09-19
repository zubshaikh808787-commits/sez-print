export interface LabelXDiscoveredDevice {
  name: string;
  mac: string;
  bonded?: boolean;
  type?: number;
}

export interface LabelXStatusResult {
  connected: boolean;
  name: string;
  mac: string;
  statusCode: number;
  statusMessage: string;
  paperOut: boolean;
  coverOpen: boolean;
  overheating: boolean;
  lowBattery: boolean;
  printing: boolean;
}

export interface LabelXPrintOptions {
  pngBase64: string;
  copies?: number;
  widthMm?: number;
  heightMm?: number;
  widthDots?: number;
  paperType?: 'tag' | 'continuous' | 'receipt' | 'blacktag' | 'blackmark' | 'circle' | 'circletag';
  density?: number; // 0, 1, 2
  threshold?: number;
  dither?: boolean;
}

export interface LabelXPrintResult {
  success: boolean;
  pagesPrinted: number;
}

export interface LabelXScanResult {
  discoveryStarted: boolean;
  bondedCount: number;
  reason?: string;
}

export function isLikelyLabelXName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.trim().toUpperCase();
  return (
    upper.includes('MINIX') ||
    upper.includes('LABELX') ||
    upper.includes('LABEL X') ||
    upper.includes('GD985') ||
    upper.includes('LUCKP') ||
    upper.startsWith('BP') ||
    upper.includes('BP 330') ||
    upper.includes('BP330') ||
    upper.startsWith('U8_') ||
    upper.startsWith('PPP1_') ||
    upper.startsWith('LPC50_') ||
    upper.startsWith('BTW') ||
    upper.includes('SEZNIK MINIX')
  );
}
