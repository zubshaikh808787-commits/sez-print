export type BorderStyleId =
  | 'solid-thin'
  | 'solid-medium'
  | 'solid-thick'
  | 'dashed'
  | 'dotted'
  | 'double'
  | 'rounded'
  | 'pill-shape'
  | 'triple-line'
  | 'shadow-box'
  | 'corner-brackets'
  | 'industrial'
  | 'crosshair'
  | 'caution-stripes';

export interface BorderLibraryItem {
  id: BorderStyleId;
  name: string;
  category: 'Basic' | 'Label' | 'Frame' | 'Decorative' | 'Industrial' | 'Safety';
}

export const BORDER_LIBRARY: BorderLibraryItem[] = [
  { id: 'solid-thin', name: 'Solid Thin', category: 'Basic' },
  { id: 'solid-medium', name: 'Solid Medium', category: 'Basic' },
  { id: 'solid-thick', name: 'Solid Thick', category: 'Basic' },
  { id: 'dashed', name: 'Dashed Line', category: 'Basic' },
  { id: 'dotted', name: 'Dotted Line', category: 'Basic' },
  { id: 'double', name: 'Double Line', category: 'Basic' },
  { id: 'rounded', name: 'Rounded Rect', category: 'Label' },
  { id: 'pill-shape', name: 'Pill Shape', category: 'Label' },
  { id: 'triple-line', name: 'Triple Line', category: 'Frame' },
  { id: 'shadow-box', name: 'Shadow Box', category: 'Frame' },
  { id: 'corner-brackets', name: 'Corner Brackets', category: 'Decorative' },
  { id: 'industrial', name: 'Industrial Plate', category: 'Industrial' },
  { id: 'crosshair', name: 'Crosshair Marks', category: 'Industrial' },
  { id: 'caution-stripes', name: 'Caution Stripes', category: 'Safety' },
];

export const BORDER_CATEGORIES = [
  'All',
  'Basic',
  'Label',
  'Frame',
  'Decorative',
  'Industrial',
  'Safety',
] as const;

const SUPPORTED = new Set<string>(BORDER_LIBRARY.map((item) => item.id));

/** Styles that were removed from the gallery. Saved labels keep printing the frame they printed before. */
const RETIRED: Record<string, BorderStyleId> = {
  'label-frame': 'double',
  'inset-panel': 'double',
};

export function resolveBorderStyle(id: string | null | undefined): BorderStyleId {
  if (id && SUPPORTED.has(id)) return id as BorderStyleId;
  if (id && RETIRED[id]) return RETIRED[id];
  return 'solid-medium';
}

/** Default stroke for each style in millimetres. Picking a style sets the border to this width. */
export function borderStyleStrokeMm(id: string | null | undefined): number {
  switch (resolveBorderStyle(id)) {
    case 'solid-thin':
    case 'triple-line':
      return 0.35;
    case 'solid-thick':
    case 'industrial':
      return 0.9;
    case 'dashed':
    case 'dotted':
      return 0.5;
    case 'corner-brackets':
      return 0.7;
    default:
      return 0.55;
  }
}
