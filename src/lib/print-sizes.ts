import { fitDocumentToFillPage } from '@/lib/element-sizing';
import { generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';
import {
  clampLabelMm,
  MM_PER_INCH,
  printMediaSizeMm,
  type LabelSizeMm,
  type LabelUnit,
} from '@/lib/label-geometry';

/**
 * Print-job size presets (Feature 4).
 *
 * - 4 inch or less: 4×6 in — the standard US thermal shipping / desktop label.
 * - Jewellery: 50×15 mm jewellery tag.
 * - Cable tag / 2-UPS: 50×15 mm wrap tags; 2-UPS prints two across.
 * - A4: ISO 216 portrait 210×297 mm with 10 mm margins for multi-up tiling.
 */
export type PrintSizePreset = {
  id: string;
  label: string;
  detail?: string;
  widthMm: number;
  heightMm: number;
  /** Labels across the media (2-UPS). */
  labelsPerRow?: number;
  /** Tile original labels onto this page (A4). */
  sheet?: boolean;
};

export const PRINT_SIZE_PRESETS: PrintSizePreset[] = [
  {
    id: '100x155',
    label: '100 × 155 mm',
    detail: 'Standard Logistics / Waybill Label',
    widthMm: 100,
    heightMm: 155,
  },
  {
    id: '100x150',
    label: '100 × 150 mm',
    detail: '4 × 6 in Thermal Shipping Label',
    widthMm: 100,
    heightMm: 150,
  },
  {
    id: '4x6in',
    label: '4 × 6 in (101.6 × 152.4 mm)',
    detail: 'US Standard 4×6 Shipping',
    widthMm: 101.6,
    heightMm: 152.4,
  },
  {
    id: '100x100',
    label: '100 × 100 mm',
    detail: '4 × 4 in Parcel / Box Label',
    widthMm: 100,
    heightMm: 100,
  },
  {
    id: '76x130',
    label: '76 × 130 mm',
    detail: 'Courier / Freight Label',
    widthMm: 76,
    heightMm: 130,
  },
  {
    id: '75x100',
    label: '75 × 100 mm',
    detail: '3 × 4 in Shipping Label',
    widthMm: 75,
    heightMm: 100,
  },
  {
    id: '80x50',
    label: '80 × 50 mm',
    detail: 'Warehouse / Shelf Label',
    widthMm: 80,
    heightMm: 50,
  },
  {
    id: '60x40',
    label: '60 × 40 mm',
    detail: 'Barcode / Product Label',
    widthMm: 60,
    heightMm: 40,
  },
  {
    id: '50x30',
    label: '50 × 30 mm',
    detail: 'Standard Retail Tag',
    widthMm: 50,
    heightMm: 30,
  },
  {
    id: '57x30',
    label: '57 × 30 mm',
    detail: 'Receipt / Small Thermal Label',
    widthMm: 57,
    heightMm: 30,
  },
  {
    id: 'jewellery',
    label: 'Jewellery Label — 50 × 15 mm',
    detail: 'Jewellery tag',
    widthMm: 50,
    heightMm: 15,
  },
  { id: 'cable', label: 'Cable Tag — 50 × 15 mm', widthMm: 50, heightMm: 15 },
  {
    id: '2ups',
    label: '2-UPS — 50 × 15 mm',
    detail: '2 labels per row',
    widthMm: 50,
    heightMm: 15,
    labelsPerRow: 2,
  },
  {
    id: 'a4',
    label: 'A4 Multi-Up Sheet',
    detail: '210 × 297 mm portrait tiling',
    widthMm: 210,
    heightMm: 297,
    sheet: true,
  },
];

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_MARGIN_MM = 10;
export const A4_GAP_MM = 4;

export type SheetLayout = {
  pageWidthMm: number;
  pageHeightMm: number;
  cols: number;
  rows: number;
  count: number;
  marginMm: number;
  gapMm: number;
};

export function sheetLayout(
  pageWidthMm: number,
  pageHeightMm: number,
  labelWidthMm: number,
  labelHeightMm: number,
  marginMm = A4_MARGIN_MM,
  gapMm = A4_GAP_MM,
): SheetLayout {
  const innerW = Math.max(1, pageWidthMm - marginMm * 2);
  const innerH = Math.max(1, pageHeightMm - marginMm * 2);
  const w = Math.max(labelWidthMm, 1);
  const h = Math.max(labelHeightMm, 1);
  const cols = Math.max(1, Math.floor((innerW + gapMm) / (w + gapMm)));
  const rows = Math.max(1, Math.floor((innerH + gapMm) / (h + gapMm)));
  return {
    pageWidthMm,
    pageHeightMm,
    cols,
    rows,
    count: cols * rows,
    marginMm,
    gapMm,
  };
}

export function a4SheetLayout(labelWidthMm: number, labelHeightMm: number): SheetLayout {
  return sheetLayout(A4_WIDTH_MM, A4_HEIGHT_MM, labelWidthMm, labelHeightMm);
}

function offsetElements(elements: LabelElement[], dx: number, dy: number): LabelElement[] {
  return elements.map((el) => ({
    ...el,
    id: generateId(),
    left: el.left + dx,
    top: el.top + dy,
  }));
}

/** Tile a label onto an A4 page with margins. Falls back to a single copy if the label is larger than the inner area. */
export function tileDocumentOnA4(source: LabelDocument): LabelDocument {
  return tileDocumentOnSheet(source, A4_WIDTH_MM, A4_HEIGHT_MM);
}

/** Tile label copies onto an arbitrary paper/page size (custom paper or A4). */
export function tileDocumentOnSheet(
  source: LabelDocument,
  pageWidthMm: number,
  pageHeightMm: number,
  marginMm = A4_MARGIN_MM,
  gapMm = A4_GAP_MM,
): LabelDocument {
  const page = clampLabelMm(pageWidthMm, pageHeightMm);
  const layout = sheetLayout(
    page.widthMm,
    page.heightMm,
    source.widthMm,
    source.heightMm,
    marginMm,
    gapMm,
  );
  const elements: LabelElement[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const ox = layout.marginMm + col * (source.widthMm + layout.gapMm);
      const oy = layout.marginMm + row * (source.heightMm + layout.gapMm);
      elements.push(...offsetElements(source.elements, ox, oy));
    }
  }
  const now = Date.now();
  return {
    ...source,
    id: generateId('label'),
    name: `${source.name} · ${Math.round(page.widthMm)}×${Math.round(page.heightMm)}`,
    widthMm: page.widthMm,
    heightMm: page.heightMm,
    paperType: 'Cardstock',
    elements,
    updatedAt: now,
  };
}

/** Two 50×15 labels across a 104×15 mm strip (2 mm gutter). */
export function tileDocumentTwoUp(source: LabelDocument): LabelDocument {
  const gap = 2;
  const cellW = 50;
  const cellH = 15;
  const sx = cellW / Math.max(source.widthMm, 0.01);
  const sy = cellH / Math.max(source.heightMm, 0.01);
  const scaled: LabelElement[] = source.elements.map((el) => {
    const next = {
      ...el,
      left: el.left * sx,
      top: el.top * sy,
      width: el.width * sx,
    } as LabelElement;
    if ('height' in next && typeof next.height === 'number') {
      (next as { height: number }).height *= sy;
    }
    return next;
  });
  const elements = [
    ...offsetElements(scaled, 0, 0),
    ...offsetElements(scaled, cellW + gap, 0),
  ];
  return {
    ...source,
    id: generateId('label'),
    name: `${source.name} · 2-UPS`,
    widthMm: cellW * 2 + gap,
    heightMm: cellH,
    elements,
    updatedAt: Date.now(),
  };
}

export function applyPrintSize(
  source: LabelDocument,
  preset: PrintSizePreset | null,
  custom: LabelSizeMm,
): LabelDocument {
  if (preset?.id === 'a4' || preset?.sheet) return tileDocumentOnA4(source);
  if (preset?.id === '2ups') return tileDocumentTwoUp(source);
  const clamped = clampLabelMm(custom.widthMm, custom.heightMm);
  // Integer mm matches TSPL SIZE — 4×6 in (101.6×152.4) → 102×152 mm on the printer.
  const page = printMediaSizeMm(clamped.widthMm, clamped.heightMm);
  // Already on the same media SIZE — keep layout; only rematch mm if fractional.
  if (
    Math.abs(page.widthMm - source.widthMm) < 0.05 &&
    Math.abs(page.heightMm - source.heightMm) < 0.05
  ) {
    return source;
  }
  // Stretch to fill selected paper edge-to-edge (avoids tiny centered stamp on 4×6).
  return fitDocumentToFillPage(source, page.widthMm, page.heightMm);
}

export function formatPrintSize(widthMm: number, heightMm: number, unit: LabelUnit = 'mm'): string {
  if (unit === 'in') {
    const w = Math.round((widthMm / MM_PER_INCH) * 100) / 100;
    const h = Math.round((heightMm / MM_PER_INCH) * 100) / 100;
    return `${w} × ${h} in`;
  }
  return `${Math.round(widthMm * 10) / 10} × ${Math.round(heightMm * 10) / 10} mm`;
}
