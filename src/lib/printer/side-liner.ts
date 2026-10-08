export const SIDE_LINER_MAX_MM = 20;

function round2(mm: number): number {
  return Math.round(mm * 100) / 100;
}

/**
 * Horizontal shift of the label on the head caused by uneven side liner.
 * Assumes spring guides centre the roll: equal liner on both sides keeps the
 * label centred, so only the difference moves it, by half.
 */
export function sideLinerShiftMm(leftMm: number, rightMm: number): number {
  const l = Number.isFinite(leftMm) ? Math.max(0, leftMm) : 0;
  const r = Number.isFinite(rightMm) ? Math.max(0, rightMm) : 0;
  return round2((l - r) / 2);
}

/** REFERENCE x sent to the printer: per-printer correction plus this roll's liner shift. */
export function effectiveHOffsetMm(correctionMm: number, leftMm: number, rightMm: number): number {
  return round2(correctionMm + sideLinerShiftMm(leftMm, rightMm));
}
