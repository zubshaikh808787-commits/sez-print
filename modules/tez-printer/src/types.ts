export const TEZ_PAPER_TYPE = {
  GAP: 0,
  CONTINUOUS: 1,
  BLACK: 2,
  TATTOO: 3,
} as const;

export type TezDiscoveredDevice = {
  id: string;
  name: string | null;
  modelKey?: string;
  bonded?: boolean;
};

export type TezPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  speed?: number;
  paperType?: 'gap' | 'continuous' | 'black' | 'tattoo' | number;
  threshold?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
};

export type TezPrintResult = {
  success: boolean;
  copies: number;
  durationMs: number;
  widthMm: number;
  heightMm: number;
};

export type TezCalibrationResult = {
  success: boolean;
  paperType: number;
};

export type TezStatusResult = {
  bitmask: number;
  isIdle: boolean;
  isPrinting: boolean;
  isCoverOpen: boolean;
  isNoPaper: boolean;
  isLowBattery: boolean;
  isOverheat: boolean;
  errorMessage?: string | null;
};

export function parsePaperType(type?: string | number): number {
  if (typeof type === 'number') return type;
  switch (type) {
    case 'continuous':
      return TEZ_PAPER_TYPE.CONTINUOUS;
    case 'black':
      return TEZ_PAPER_TYPE.BLACK;
    case 'tattoo':
      return TEZ_PAPER_TYPE.TATTOO;
    case 'gap':
    default:
      return TEZ_PAPER_TYPE.GAP;
  }
}
