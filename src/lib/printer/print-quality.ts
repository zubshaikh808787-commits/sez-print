/**
 * Shared thermal print quality — density, threshold, speed for all label jobs.
 * Higher Auto defaults keep borders and thin text sharp on Tez/Josh/TD heads.
 */

import { clampToCap, type BridgeQualityCaps } from '@/lib/printer/bridge-quality-caps';

export type PrintQualityProfile = {
  /** Heat / darkness sent to OEM SDK (typically 1–15). */
  density: number;
  /** Gray→1bpp cutoff; higher = more black (darker). */
  threshold: number;
  /** Print speed; lower = darker, sharper on most thermal heads. */
  speed: number;
  dither: boolean;
};

export type PrintQualityInput = {
  darkness: number | null;
  speed: number | null;
  grayThreshold?: number;
  colorMode?: string;
  /** Jewellery / cable / rat-tail die-cut stock. */
  dieCut?: boolean;
  jewelry?: boolean;
  /**
   * Bridge capability. A non-legacy scale clamps the manual value to it; a manual darkness
   * then sets DENSITY and moves the threshold from its Auto value, so the scale default
   * prints exactly like Auto and every other step changes the bitmap too.
   */
  caps?: BridgeQualityCaps;
};

/**
 * Resolve density + threshold + speed for a print job.
 * Default Auto aims for crisp borders (B&W threshold, density 10, speed 3).
 */
export function resolvePrintQuality(input: PrintQualityInput): PrintQualityProfile {
  const densityCap = input.caps?.density ?? 'legacy';
  const speedCap = input.caps?.speed ?? 'legacy';
  if (densityCap === 'legacy' && speedCap === 'legacy') return resolveLegacy(input);

  const auto = resolveLegacy({ ...input, darkness: null, speed: null });
  const legacy = resolveLegacy(input);
  const speed =
    speedCap === 'legacy' ? legacy.speed : (clampToCap(input.speed, speedCap).value ?? auto.speed);
  if (densityCap === 'legacy') {
    return { density: legacy.density, threshold: legacy.threshold, speed, dither: auto.dither };
  }
  const manual = clampToCap(input.darkness, densityCap).value;
  if (manual == null) return { ...auto, speed };
  const dieCut = input.jewelry || input.dieCut;
  const perStep = dieCut ? DIECUT_THRESHOLD_PER_STEP : THRESHOLD_PER_STEP;
  const [lo, hi] = dieCut ? DIECUT_THRESHOLD_RANGE : THRESHOLD_RANGE;
  const threshold = Math.min(
    hi,
    Math.max(lo, auto.threshold + (manual - densityCap.default) * perStep),
  );
  return { density: manual, threshold, speed, dither: auto.dither };
}

/** Gray levels the B&W cutoff moves per darkness step on a capped bridge. */
const THRESHOLD_PER_STEP = 8;
const DIECUT_THRESHOLD_PER_STEP = 5;
const THRESHOLD_RANGE = [80, 230] as const;
const DIECUT_THRESHOLD_RANGE = [120, 220] as const;

function resolveLegacy(input: PrintQualityInput): PrintQualityProfile {
  const grayBase = Math.max(10, Math.min(250, input.grayThreshold ?? 160));
  // Halftone softens frames — only dither when user explicitly chose it.
  const dither = !input.dieCut && input.colorMode === 'Halftone';

  if (input.jewelry || input.dieCut) {
    const density =
      input.darkness != null ? Math.max(1, Math.min(15, Math.round(input.darkness))) : 10;
    const threshold =
      input.darkness != null
        ? Math.min(205, Math.max(155, grayBase + (input.darkness - 8) * 5 + (input.jewelry ? 16 : 24)))
        : Math.min(195, Math.max(165, grayBase + (input.jewelry ? 12 : 20)));
    const speed =
      input.speed != null ? Math.max(1, Math.min(8, input.speed)) : 2;
    return { density, threshold, speed, dither: false };
  }

  const density =
    input.darkness != null ? Math.max(1, Math.min(15, Math.round(input.darkness))) : 10;
  const threshold = Math.min(
    250,
    Math.max(140, grayBase + (input.darkness != null ? (input.darkness - 8) * 8 : 0)),
  );
  const speed = input.speed != null ? Math.max(1, Math.min(8, input.speed)) : 3;
  return { density, threshold, speed, dither };
}

/** Legacy helper used by Img-to-Label binarize path. */
export function calcLabelImageThreshold(grayThreshold: number, darkness: number | null): number {
  const base = Math.max(145, Math.min(195, grayThreshold + 8));
  if (darkness == null) return base;
  return Math.min(220, Math.max(120, base + (darkness - 8) * 5));
}
