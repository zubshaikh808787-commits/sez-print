import { scaleDocumentToSize } from '@/lib/element-sizing';
import {
  CABLE_FLAG_DIECUT,
  cableFlagPrintDocument,
  isCableFlagPrintPresetId,
} from '@/constants/cable-flag-diecut';
import {
  JEWELRY_DIECUT,
  JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM,
  JEWELRY_DIECUT_PRINT_PRESET_2UP,
  JEWELRY_DIECUT_PRINT_PRESET_3UP,
  jewelryDieCutColumnX,
  jewelryDieCutComposedWidthMm,
  jewelryDieCutContentIsSingleTag,
  isNearMm,
} from '@/constants/jewelry-diecut';
import { generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';
import {
  clampLabelMm,
  MM_PER_INCH,
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
    id: '50x50',
    label: '50 × 50 mm',
    detail: '2 × 2 in Square Label',
    widthMm: 50,
    heightMm: 50,
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

  {
    id: 'jewellery-2up-diecut-37x96',
    label: 'Jewellery 2-Up — 37 × 96 mm',
    detail: '2 labels (14 mm × 96 mm), 3 mm gap, 3 mm margins',
    widthMm: JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM,
    heightMm: JEWELRY_DIECUT.sheetHeightMm,
    labelsPerRow: 2,
  },
  {
    id: 'jewellery-3up-diecut-54x100',
    label: 'Jewellery 3-Up — 54 × 96 mm',
    detail: '3 labels (14 mm × 96 mm), 3 mm gaps, 3 mm margins',
    widthMm: JEWELRY_DIECUT.sheetWidthMm,
    heightMm: JEWELRY_DIECUT.sheetHeightMm,
    labelsPerRow: JEWELRY_DIECUT.columns,
  },
  {
    id: 'jewellery-rattail-12x100',
    label: 'Jewellery Tag — 14 × 96 mm',
    detail: 'Single 14 × 96 mm tag for 3-up die-cut sheet',
    widthMm: JEWELRY_DIECUT.tagWidthMm,
    heightMm: JEWELRY_DIECUT.tagHeightMm,
  },
  { id: 'cable', label: 'Cable Tag — 50 × 15 mm', widthMm: 50, heightMm: 15 },
  {
    id: 'cable-flag-50x73',
    label: 'Cable Label — 50 × 73 mm',
    detail: 'Two 25 mm P-style flags on one 50 × 73 mm piece',
    widthMm: CABLE_FLAG_DIECUT.widthMm,
    heightMm: CABLE_FLAG_DIECUT.heightMm,
    labelsPerRow: CABLE_FLAG_DIECUT.columns,
  },
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

/** Three 14.3×100 mm labels across with 1.7 mm gutter (total 46.3 mm active on 50 mm roll). */
export function tileDocumentThreeUpRatTail(source: LabelDocument): LabelDocument {
  const cellW = 14.3;
  const gap = 1.7;
  const cellH = 100.0;
  const leftMargin = 1.85; // Centers 46.3 mm active label area on 50 mm liner
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
    ...offsetElements(scaled, leftMargin, 0),
    ...offsetElements(scaled, leftMargin + cellW + gap, 0),
    ...offsetElements(scaled, leftMargin + 2 * (cellW + gap), 0),
  ];
  return {
    ...source,
    id: generateId('label'),
    name: `${source.name} · 3-UPS (14.3mm)`,
    widthMm: 50,
    heightMm: cellH,
    elements,
    updatedAt: Date.now(),
  };
}

/**
 * Place jewellery die-cut content onto the 54 × 96 mm sheet without scaling.
 * - 14 mm tag: three copies at x = 3, 20, 37 mm
 * - ~48 mm composed UPS strip: pad 3 mm left/right
 * - already 54 mm: pass through
 */
export function tileDocumentThreeUpDieCut54(source: LabelDocument): LabelDocument {
  const { sheetWidthMm, sheetHeightMm, sideMarginMm, columns } = JEWELRY_DIECUT;
  const composedW = jewelryDieCutComposedWidthMm();
  const singleTag = jewelryDieCutContentIsSingleTag(source);

  if (isNearMm(source.widthMm, sheetWidthMm) && !singleTag) {
    if (isNearMm(source.heightMm, sheetHeightMm)) return source;
    return {
      ...source,
      heightMm: sheetHeightMm,
      ups: undefined,
      updatedAt: Date.now(),
    };
  }

  if (singleTag) {
    const elements: LabelElement[] = [];
    for (let i = 0; i < columns; i++) {
      elements.push(...offsetElements(source.elements, jewelryDieCutColumnX(i), 0));
    }
    return {
      ...source,
      id: generateId('label'),
      name: `${source.name} · 3-UPS`,
      widthMm: sheetWidthMm,
      heightMm: sheetHeightMm,
      ups: undefined,
      elements,
      updatedAt: Date.now(),
    };
  }

  if (isNearMm(source.widthMm, composedW)) {
    return {
      ...source,
      id: generateId('label'),
      name: `${source.name} · 3-UPS`,
      widthMm: sheetWidthMm,
      heightMm: sheetHeightMm,
      ups: undefined,
      elements: offsetElements(source.elements, sideMarginMm, 0),
      updatedAt: Date.now(),
    };
  }

  const elements: LabelElement[] = [];
  for (let i = 0; i < columns; i++) {
    elements.push(...offsetElements(source.elements, jewelryDieCutColumnX(i), 0));
  }
  return {
    ...source,
    id: generateId('label'),
    name: `${source.name} · 3-UPS`,
    widthMm: sheetWidthMm,
    heightMm: sheetHeightMm,
    ups: undefined,
    elements,
    updatedAt: Date.now(),
  };
}

/**
 * Place jewellery die-cut content onto the 37 × 96 mm 2-up sheet without
 * center-letterboxing a single tag.
 */
export function tileDocumentTwoUpDieCut37(source: LabelDocument): LabelDocument {
  const sheetWidthMm = JEWELRY_DIECUT_2UP_SHEET_WIDTH_MM;
  const { sheetHeightMm, sideMarginMm, tagWidthMm, gapMm } = JEWELRY_DIECUT;
  const columns = 2;
  const composedW = tagWidthMm * columns + gapMm * (columns - 1);
  const singleTag = jewelryDieCutContentIsSingleTag(source);

  if (isNearMm(source.widthMm, sheetWidthMm) && !singleTag) {
    if (isNearMm(source.heightMm, sheetHeightMm)) return source;
    return {
      ...source,
      heightMm: sheetHeightMm,
      ups: undefined,
      updatedAt: Date.now(),
    };
  }

  if (singleTag) {
    const elements: LabelElement[] = [];
    for (let i = 0; i < columns; i++) {
      elements.push(...offsetElements(source.elements, jewelryDieCutColumnX(i), 0));
    }
    return {
      ...source,
      id: generateId('label'),
      name: `${source.name} · 2-UPS`,
      widthMm: sheetWidthMm,
      heightMm: sheetHeightMm,
      ups: undefined,
      elements,
      updatedAt: Date.now(),
    };
  }

  if (isNearMm(source.widthMm, composedW)) {
    return {
      ...source,
      id: generateId('label'),
      name: `${source.name} · 2-UPS`,
      widthMm: sheetWidthMm,
      heightMm: sheetHeightMm,
      ups: undefined,
      elements: offsetElements(source.elements, sideMarginMm, 0),
      updatedAt: Date.now(),
    };
  }

  const elements: LabelElement[] = [];
  for (let i = 0; i < columns; i++) {
    elements.push(...offsetElements(source.elements, jewelryDieCutColumnX(i), 0));
  }
  return {
    ...source,
    id: generateId('label'),
    name: `${source.name} · 2-UPS`,
    widthMm: sheetWidthMm,
    heightMm: sheetHeightMm,
    ups: undefined,
    elements,
    updatedAt: Date.now(),
  };
}

/** Force the cable pair onto 50 × 73 mm. Do not tile to 100 mm. */
export function tileDocumentTwoUpCableFlag(source: LabelDocument): LabelDocument {
  return cableFlagPrintDocument(source);
}

export function applyPrintSize(
  source: LabelDocument,
  preset: PrintSizePreset | null,
  custom: LabelSizeMm,
): LabelDocument {
  if (preset?.id === 'a4' || preset?.sheet) return tileDocumentOnA4(source);
  if (preset?.id === '2ups') return tileDocumentTwoUp(source);
  if (preset?.id === 'jewellery-3up-14x100') return tileDocumentThreeUpRatTail(source);
  if (preset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) return tileDocumentThreeUpDieCut54(source);
  if (preset?.id === JEWELRY_DIECUT_PRINT_PRESET_2UP) return tileDocumentTwoUpDieCut37(source);
  if (isCableFlagPrintPresetId(preset?.id)) return cableFlagPrintDocument(source);
  const page = clampLabelMm(custom.widthMm, custom.heightMm);
  // Same size as the design — keep element positions (preview == print).
  if (
    Math.abs(page.widthMm - source.widthMm) < 0.2 &&
    Math.abs(page.heightMm - source.heightMm) < 0.2
  ) {
    return source;
  }
  // Fill the chosen millimetre stock. Center-letterbox is a false border.
  return scaleDocumentToSize(source, page.widthMm, page.heightMm);
}

/** Closest stock preset to an imported template's pixel aspect (no stretching). */
export function suggestPrintSizeFromAspect(imageWidthPx: number, imageHeightPx: number): LabelSizeMm {
  const iw = Math.max(1, imageWidthPx);
  const ih = Math.max(1, imageHeightPx);
  const aspect = iw / ih;
  const jewellery = PRINT_SIZE_PRESETS.filter(
    (p) =>
      p.id === JEWELRY_DIECUT_PRINT_PRESET_2UP ||
      p.id === JEWELRY_DIECUT_PRINT_PRESET_3UP ||
      p.id === 'jewellery-rattail-12x100',
  );
  const pool = jewellery.length > 0 ? jewellery : PRINT_SIZE_PRESETS;
  let best: PrintSizePreset = pool[0] ?? PRINT_SIZE_PRESETS[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const preset of pool) {
    if (!(preset.widthMm > 0) || !(preset.heightMm > 0) || preset.sheet) continue;
    const score = Math.abs(Math.log(aspect / (preset.widthMm / preset.heightMm)));
    if (score < bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return { widthMm: best.widthMm, heightMm: best.heightMm };
}

export function formatPrintSize(widthMm: number, heightMm: number, unit: LabelUnit = 'mm'): string {
  if (unit === 'in') {
    const w = Math.round((widthMm / MM_PER_INCH) * 100) / 100;
    const h = Math.round((heightMm / MM_PER_INCH) * 100) / 100;
    return `${w.toFixed(2)} × ${h.toFixed(2)} in`;
  }
  const w = Math.round(widthMm * 100) / 100;
  const h = Math.round(heightMm * 100) / 100;
  return `${w.toFixed(2)} × ${h.toFixed(2)} mm`;
}
