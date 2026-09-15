/**
 * Shared thermal print quality — density, threshold, speed for all label jobs.
 * Higher Auto defaults keep borders and thin text sharp on Tez/Josh/TD heads.
 */

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
};

/**
 * Resolve density + threshold + speed for a print job.
 * Default Auto aims for crisp borders (B&W threshold, density 10, speed 3).
 */
export function resolvePrintQuality(input: PrintQualityInput): PrintQualityProfile {
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
