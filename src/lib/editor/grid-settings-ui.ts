import { GRID_SPACING_PRESETS_MM, clampGridSpacingMm } from '@/lib/editor/canvas-grid';

export const GRID_SPACING_LABELS = GRID_SPACING_PRESETS_MM.map((mm) => `${mm} mm`) as readonly string[];

export const GRID_PRINT_DISCLAIMER =
  'Design grid is editor-only and is not included when you print.';

export function spacingLabelForMm(mm: number): string {
  const clamped = clampGridSpacingMm(mm);
  const preset = GRID_SPACING_PRESETS_MM.find((value) => value === clamped);
  return preset ? `${preset} mm` : `${clamped} mm`;
}
