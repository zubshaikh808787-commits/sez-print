import { GRID_SPACING_PRESETS_MM, clampGridSpacingMm } from '@/lib/editor/canvas-grid';

export const GRID_SPACING_LABELS = GRID_SPACING_PRESETS_MM.map((mm) => `${mm} mm`) as readonly string[];

export const GRID_CUSTOM_LABEL = 'Custom';

export const GRID_SPACING_OPTIONS = [...GRID_SPACING_LABELS, GRID_CUSTOM_LABEL] as const;

export const GRID_PRINT_DISCLAIMER =
  'Design grid is editor-only and is not included when you print.';

export function isPresetGridSpacing(mm: number): boolean {
  const clamped = clampGridSpacingMm(mm);
  return GRID_SPACING_PRESETS_MM.some((value) => value === clamped);
}

export function spacingLabelForMm(mm: number): string {
  const clamped = clampGridSpacingMm(mm);
  const preset = GRID_SPACING_PRESETS_MM.find((value) => value === clamped);
  return preset ? `${preset} mm` : `${clamped} mm`;
}

/** Preset chip label, or Custom when the saved spacing is not a preset. */
export function spacingOptionForMm(mm: number): (typeof GRID_SPACING_OPTIONS)[number] {
  return isPresetGridSpacing(mm) ? spacingLabelForMm(mm) as (typeof GRID_SPACING_OPTIONS)[number] : GRID_CUSTOM_LABEL;
}
