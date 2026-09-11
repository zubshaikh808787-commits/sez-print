import { dotsPerMm, type PrinterAlignment } from '@/lib/printer/print-spec';

/**
 * DothanTech / JOSH LPAPI heads are 203 DPI (8 dots/mm).
 * The app's shared printerDpi defaults to 304 for TD-404 and must not leak here:
 * a 50×30 mm capture at 12 dpm is 600×360 dots → ~75×45 mm on a 203 DPI head.
 */
export const JOSH_HARDWARE_DPI = 203;
export const JOSH_DOTS_PER_MM = 8;

/**
 * LPAPI PrintParamName.GAP_TYPE (official demo: list index − 1).
 * 50×30 die-cut stickers are gap paper (Label = 2).
 */
export const JOSH_GAP_TYPE = {
  printerDefault: -1,
  receipt: 0,
  hole: 1,
  label: 2,
  blackMark: 3,
} as const;

export function joshEffectiveDpi(settingsDpi?: number): number {
  if (settingsDpi === 300) return 300;
  if (settingsDpi === 203) return 203;
  return JOSH_HARDWARE_DPI;
}

export function joshLabelDots(
  widthMm: number,
  heightMm: number,
  dpi = JOSH_HARDWARE_DPI,
): { widthDots: number; heightDots: number } {
  const dpm = dpi === 203 ? JOSH_DOTS_PER_MM : dotsPerMm(dpi);
  return {
    widthDots: Math.max(1, Math.round(widthMm * dpm)),
    heightDots: Math.max(1, Math.round(heightMm * dpm)),
  };
}

export function joshGapTypeFromMedia(
  media: 'gap' | 'bline' | 'continuous' | undefined,
): number {
  if (media === 'continuous') return JOSH_GAP_TYPE.receipt;
  if (media === 'bline') return JOSH_GAP_TYPE.blackMark;
  return JOSH_GAP_TYPE.label;
}

export type JoshDrawRectMm = {
  xMm: number;
  yMm: number;
  drawWidthMm: number;
  drawHeightMm: number;
};

/**
 * LPAPI startJob(widthMm, heightMm) makes the page equal the physical label.
 * Printhead centering is mechanical (guides). Only user H/V offsets move ink.
 */
export function joshDrawRectMm(options: {
  widthMm: number;
  heightMm: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: PrinterAlignment;
}): JoshDrawRectMm {
  const widthMm = Math.max(0.1, options.widthMm);
  const heightMm = Math.max(0.1, options.heightMm);
  const h = Number.isFinite(options.hOffsetMm) ? (options.hOffsetMm as number) : 0;
  const v = Number.isFinite(options.vOffsetMm) ? (options.vOffsetMm as number) : 0;
  return {
    xMm: roundMm(h),
    yMm: roundMm(Math.max(0, v)),
    drawWidthMm: roundMm(widthMm),
    drawHeightMm: roundMm(heightMm),
  };
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}
