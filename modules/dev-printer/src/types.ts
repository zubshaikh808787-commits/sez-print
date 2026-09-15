export const DEV_PAPER_TYPE = {
  GAP: 0,
  CONTINUOUS: 1,
  BLACK_MARK: 2,
} as const;

export const DEV_PRINT_MODE = {
  LABEL: 0,
  RECEIPT: 1,
} as const;

export function parseDevPaperType(
  type: 'gap' | 'bline' | 'black_mark' | 'continuous' | number | undefined,
): number {
  if (typeof type === 'number') return type;
  if (!type) return DEV_PAPER_TYPE.GAP;
  const lower = type.toLowerCase();
  if (lower === 'continuous') return DEV_PAPER_TYPE.CONTINUOUS;
  if (lower === 'bline' || lower === 'black_mark') return DEV_PAPER_TYPE.BLACK_MARK;
  return DEV_PAPER_TYPE.GAP;
}

export type DevDiscoveredDevice = {
  id: string;
  name: string | null;
  rawName?: string | null;
  bonded?: boolean;
  transport?: string;
  sdkId?: string;
  likelyDev?: boolean;
};

export type DevPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  rotation?: number;
  threshold?: number;
  gapMm?: number;
  media?: 'gap' | 'bline' | 'continuous' | string;
  speed?: number;
  commandSet?: 'tspl' | 'escpos' | 'auto';
  hOffsetMm?: number;
  vOffsetMm?: number;
};

export type DevPrintResult = {
  success: boolean;
  widthDots?: number;
  heightDots?: number;
  copies?: number;
  durationMs?: number;
};

export type DevCalibrationResult = {
  success: boolean;
  calibrated?: boolean;
  fed?: boolean;
};

export type DevStatusResult = {
  ready: boolean;
  hasError: boolean;
  noPaper: boolean;
  coverOpen: boolean;
  overheat: boolean;
  cutterError: boolean;
  lowVoltage: boolean;
  isLabelPaper: boolean;
  isLabelMode: boolean;
  rawErrorStatus?: number;
  rawInfoStatus?: number;
  error?: string;
};
