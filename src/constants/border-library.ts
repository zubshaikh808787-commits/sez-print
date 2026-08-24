export type BorderStyleId =
  | 'solid-thin'
  | 'solid-medium'
  | 'solid-thick'
  | 'dashed'
  | 'dotted'
  | 'double'
  | 'rounded'
  | 'ticket'
  | 'scallop'
  | 'corner-brackets'
  | 'label-frame'
  | 'ornate'
  | 'wave'
  | 'stamp'
  | 'industrial'
  | 'price-tag'
  | 'triple-line'
  | 'shadow-box'
  | 'inset-panel'
  | 'pill-shape'
  | 'barcode-frame'
  | 'zigzag'
  | 'chain-link'
  | 'laurel'
  | 'vintage-frame'
  | 'art-deco'
  | 'rope-border'
  | 'caution-stripes'
  | 'hazard-diamond'
  | 'warning-bar'
  | 'crosshair'
  | 'shipping-box';

export interface BorderLibraryItem {
  id: BorderStyleId;
  name: string;
  category: 'Basic' | 'Label' | 'Decorative' | 'Industrial' | 'Vintage' | 'Safety' | 'Frame';
}

export const BORDER_LIBRARY: BorderLibraryItem[] = [
  { id: 'solid-thin', name: 'Solid Thin', category: 'Basic' },
  { id: 'solid-medium', name: 'Solid Medium', category: 'Basic' },
  { id: 'solid-thick', name: 'Solid Thick', category: 'Basic' },
  { id: 'dashed', name: 'Dashed Line', category: 'Basic' },
  { id: 'dotted', name: 'Dotted Line', category: 'Basic' },
  { id: 'double', name: 'Double Line', category: 'Basic' },
  { id: 'rounded', name: 'Rounded Rect', category: 'Label' },
  { id: 'ticket', name: 'Ticket Stub', category: 'Label' },
  { id: 'label-frame', name: 'Label Frame', category: 'Label' },
  { id: 'price-tag', name: 'Price Tag', category: 'Label' },
  { id: 'pill-shape', name: 'Pill Shape', category: 'Label' },
  { id: 'barcode-frame', name: 'Barcode Frame', category: 'Label' },
  { id: 'shipping-box', name: 'Shipping Box', category: 'Label' },
  { id: 'corner-brackets', name: 'Corner Brackets', category: 'Decorative' },
  { id: 'scallop', name: 'Scalloped Edge', category: 'Decorative' },
  { id: 'ornate', name: 'Ornate Frame', category: 'Decorative' },
  { id: 'wave', name: 'Wave Border', category: 'Decorative' },
  { id: 'stamp', name: 'Postage Stamp', category: 'Decorative' },
  { id: 'zigzag', name: 'Zigzag Edge', category: 'Decorative' },
  { id: 'chain-link', name: 'Chain Link', category: 'Decorative' },
  { id: 'laurel', name: 'Laurel Wreath', category: 'Decorative' },
  { id: 'industrial', name: 'Industrial Plate', category: 'Industrial' },
  { id: 'crosshair', name: 'Crosshair Marks', category: 'Industrial' },
  { id: 'triple-line', name: 'Triple Line', category: 'Frame' },
  { id: 'shadow-box', name: 'Shadow Box', category: 'Frame' },
  { id: 'inset-panel', name: 'Inset Panel', category: 'Frame' },
  { id: 'vintage-frame', name: 'Vintage Frame', category: 'Vintage' },
  { id: 'art-deco', name: 'Art Deco', category: 'Vintage' },
  { id: 'rope-border', name: 'Rope Border', category: 'Vintage' },
  { id: 'caution-stripes', name: 'Caution Stripes', category: 'Safety' },
  { id: 'hazard-diamond', name: 'Hazard Diamond', category: 'Safety' },
  { id: 'warning-bar', name: 'Warning Bar', category: 'Safety' },
];

export const BORDER_CATEGORIES = [
  'All',
  'Basic',
  'Label',
  'Decorative',
  'Industrial',
  'Frame',
  'Vintage',
  'Safety',
] as const;
