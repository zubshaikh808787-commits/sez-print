/**
 * Tej thermal label printer helper functions and constants (com.yx.print:PrintSDK).
 */

export const TEJ_HARDWARE_DPI = 203;
export const TEJ_DOTS_PER_MM = 8;

export const TEJ_PAPER_TYPE = {
  gap: 'gap',
  continuous: 'continuous',
  black: 'black',
  tattoo: 'tattoo',
} as const;

export function tejEffectiveDpi(settingsDpi?: number): number {
  if (settingsDpi === 300 || settingsDpi === 304) return 304;
  if (settingsDpi === 203) return 203;
  return TEJ_HARDWARE_DPI;
}

/**
 * Maps app-level media type to the Tej SDK's paper type constant.
 *
 * Phase 3 calibration fix: TATTOO is now classified as 'continuous' (not 'gap'),
 * because tattoo transfer paper has no physical gap/mark for the sensor to find.
 * See TEZ_PRINTER_CALIBRATION_FIX.md §2.3 / §3.3
 */
export function tejPaperTypeFromMedia(
  media: 'gap' | 'bline' | 'continuous' | 'tattoo' | undefined,
): 'gap' | 'continuous' | 'black' | 'tattoo' {
  if (media === 'continuous' || media === 'tattoo') return 'continuous';
  if (media === 'bline') return 'black';
  return 'gap';
}

export function tejDotsPerMm(dpi = TEJ_HARDWARE_DPI): number {
  if (dpi === 304) return 12;
  if (dpi === 203) return 8;
  return Math.round(dpi / 25.4);
}

export function isLikelyTejName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // CRITICAL: "Tejas" is a TD-404 printer, NEVER claim Tejas as Tej!
  if (n.includes('tejas')) return false;
  if (n.includes('josh') || n.includes('lpapi') || n.includes('dothan')) return false;
  return (
    n === 'tej' ||
    n.startsWith('tej ') ||
    n.startsWith('tej-') ||
    n.startsWith('tej_') ||
    n.endsWith(' tej') ||
    n.includes('tej ') ||
    n.includes('tej_') ||
    n.includes('tej-') ||
    n.includes('y50') ||
    n.includes('z212') ||
    n.includes('tp3z431') ||
    n.includes('ge920') ||
    n.startsWith('yx')
  );
}

