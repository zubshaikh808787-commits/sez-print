import { dotsPerMm, type PrinterAlignment } from '@/lib/printer/print-spec';

/**
 * DothanTech / JOSH LPAPI heads are 203 DPI (8 dots/mm).
 * The app's shared printerDpi defaults to 304 for TD-404 and must not leak here:
 * a 50×30 mm capture at 12 dpm is 600×360 dots → ~75×45 mm on a 203 DPI head.
 */
export const JOSH_HARDWARE_DPI = 203;
// Derived from print-spec.ts `dotsPerMm` — the single source of truth for the
// 304→12 / 203→8 hardware special case. Do not re-hardcode 8 elsewhere.
export const JOSH_DOTS_PER_MM = dotsPerMm(JOSH_HARDWARE_DPI);

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

export function joshEffectiveDpi(
  settingsDpi?: number | null,
  deviceDpi?: number | null,
): number {
  if (deviceDpi != null && Number.isFinite(deviceDpi) && deviceDpi > 0) {
    if (settingsDpi === 300 && deviceDpi >= 280) return 300;
    if (deviceDpi >= 190 && deviceDpi <= 220) return 203;
    if (deviceDpi >= 280 && deviceDpi < 302) return 300;
    return Math.round(deviceDpi);
  }
  if (settingsDpi === 300) return 300;
  if (settingsDpi === 203) return 203;
  return JOSH_HARDWARE_DPI;
}

/** Prefer LPAPI-reported head width. 108 mm is the leaked TD-404 default. */
export function joshHeadWidthMm(
  deviceWidthMm?: number | null,
  settingsWidthMm?: number | null,
): number {
  if (
    deviceWidthMm != null &&
    Number.isFinite(deviceWidthMm) &&
    deviceWidthMm >= 15 &&
    deviceWidthMm <= 120
  ) {
    return deviceWidthMm;
  }
  if (settingsWidthMm === 108) return 50;
  return settingsWidthMm ?? 50;
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
