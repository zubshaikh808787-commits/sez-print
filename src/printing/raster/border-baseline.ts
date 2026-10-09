/** Git restore point for the production border pipeline (~90% accuracy). */
export const BORDER_BASELINE_TAG = 'border-accuracy-90' as const;
export const BORDER_BASELINE_BRANCH = 'border/stable-baseline' as const;

/**
 * Print-time centering engine (canvas W×H on label/cell W×H).
 * Set false to restore `drawPrintBorderBaseline` (tag `border-accuracy-90`).
 */
export const USE_CENTERED_BORDER_ENGINE = true;

export type BorderPrintEngine = 'centered' | 'baseline';

export function borderPrintEngine(): BorderPrintEngine {
  return USE_CENTERED_BORDER_ENGINE ? 'centered' : 'baseline';
}
