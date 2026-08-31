import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  createTableState,
} from '@/components/editor/types';
import { buildIndustryPreviewElements } from '@/constants/industry-template-elements';
import { buildJewelryTemplateElements } from '@/constants/jewelry-template-elements';
import { templateFontSizes, textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';
import {
  colorBackground,
  emptyBackground,
  freezeTemplateLayers,
  instantiateTemplate,
  templateUsesDieCutBackground,
  type TemplateDefinition,
} from '@/lib/template-schema';

/** Map previewType prefix to the layout builder category. */
function categoryForPreview(previewType: string, fallback: string): string {
  if (previewType.startsWith('jew-')) return 'jewelry';
  if (previewType.startsWith('ship-')) return 'shipping';
  if (previewType.startsWith('smkt-')) return 'supermarket';
  if (previewType.startsWith('food-')) return 'food';
  if (previewType.startsWith('cable-')) return 'cable';
  if (previewType.startsWith('circle-')) return 'circle';
  if (previewType.startsWith('appl-')) return 'appliances';
  if (previewType.startsWith('storage-')) return 'storage';
  if (previewType.startsWith('other-')) return 'other';
  if (
    previewType.startsWith('rect-') ||
    previewType.startsWith('dual-') ||
    previewType.startsWith('two-') ||
    previewType.startsWith('three-') ||
    previewType.startsWith('four-')
  ) {
    return 'general';
  }
  if (['macaroon', 'cartoon', 'watercolor', 'color-pill'].includes(previewType)) return 'popular';
  return fallback;
}

type Frame = { left: number; top: number; width: number; height?: number };

function text(
  frame: Frame,
  content: string,
  fontSize: number,
  extra: Partial<typeof DEFAULT_ELEMENT_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: generateId(),
    type: 'text',
    text: content,
    fontSize,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: textBlockHeightMm(fontSize, content.split('\n').length),
    ...extra,
  };
}

function barcode(frame: Frame, content: string): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? 10,
  };
}

function qrcode(frame: Frame, content: string): LabelElement {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: generateId(),
    type: 'qrcode',
    content,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? frame.width,
  };
}

function line(frame: Frame): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: 0.4,
  };
}

function frameShape(widthMm: number, heightMm: number, rounded = true): LabelElement {
  return {
    ...DEFAULT_SHAPE_STATE,
    id: generateId(),
    type: 'shape',
    figureShape: rounded ? 'roundedRectangle' : 'rectangle',
    left: 0.8,
    top: 0.8,
    width: widthMm - 1.6,
    height: heightMm - 1.6,
    lineWidth: 0.4,
  };
}

function circleShape(widthMm: number, heightMm: number): LabelElement {
  const d = Math.min(widthMm, heightMm) - 1.6;
  return {
    ...DEFAULT_SHAPE_STATE,
    id: generateId(),
    type: 'shape',
    figureShape: 'circle',
    left: (widthMm - d) / 2,
    top: (heightMm - d) / 2,
    width: d,
    height: d,
    lineWidth: 0.4,
    fill: true,
    fillColor: '#FFFFFF',
  };
}

function timeElement(frame: Frame, fontSize: number): LabelElement {
  return {
    ...DEFAULT_TIME_STATE,
    id: generateId(),
    type: 'time',
    fontSize,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: textBlockHeightMm(fontSize, 1),
    align: 'left',
  };
}

function table(frame: Frame, rows: number, columns: number): LabelElement {
  const state = createTableState(rows, columns);
  return {
    ...state,
    id: generateId(),
    type: 'table',
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? 20,
    rowHeights: Array.from({ length: rows }, () => (frame.height ?? 20) / rows),
    columnWidths: Array.from({ length: columns }, () => frame.width / columns),
  };
}

/**
 * Build a representative element layout for a template card.
 * Layouts adapt to the label size; unknown categories get a sensible default.
 */
export function buildTemplateElements(
  category: string,
  name: string,
  w: number,
  h: number,
  previewType?: string,
): LabelElement[] {
  if (previewType?.startsWith('jew-')) {
    return buildJewelryTemplateElements(previewType, w, h);
  }

  if (previewType) {
    const specific = buildIndustryPreviewElements(previewType, name, w, h);
    if (specific) return specific;
  }

  const effectiveCategory = previewType ? categoryForPreview(previewType, category) : category;
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const pad = Math.max(1, w * 0.04);
  const innerW = w - pad * 2;

  switch (effectiveCategory.toLowerCase()) {
    case 'popular':
      return [
        frameShape(w, h),
        text({ left: pad + 1, top: h * 0.18, width: innerW - 2 }, name.split('-')[1] ?? 'Label', titlePt, {
          align: 'center',
          bold: true,
        }),
        text({ left: pad + 1, top: h * 0.58, width: innerW - 2 }, `${w} × ${h} mm`, smallPt, {
          align: 'center',
        }),
      ];

    case 'general':
    case 'other':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Product Name', bodyPt, { bold: true }),
        barcode(
          { left: pad, top: h * 0.42, width: innerW, height: h * 0.42 },
          '6901234567892',
        ),
      ];

    case 'cable':
      return [
        frameShape(w, h, false),
        text({ left: pad, top: h * 0.1, width: innerW }, 'LINE A · PORT 01', smallPt, { bold: true }),
        line({ left: pad, top: h * 0.42, width: innerW }),
        text({ left: pad, top: h * 0.52, width: innerW }, 'To: Switch 3 / U12', smallPt),
      ];

    case 'circle':
      return [
        circleShape(w, h),
        text({ left: w * 0.15, top: h * 0.38, width: w * 0.7 }, 'QC PASS', bodyPt, {
          align: 'center',
          bold: true,
        }),
      ];

    case 'jewelry':
      return [
        text({ left: pad, top: h * 0.12, width: innerW * 0.55 }, 'Au750 · 2.35g', smallPt, { bold: true }),
        barcode(
          { left: pad, top: h * 0.45, width: innerW * 0.6, height: h * 0.4 },
          '10592184',
        ),
      ];

    case 'supermarket':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Fresh Orange Juice 1L', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.3, width: innerW * 0.55 }, '₹ 99.00', titlePt, {
          bold: true,
        }),
        barcode(
          { left: pad + innerW * 0.58, top: h * 0.36, width: innerW * 0.42, height: h * 0.34 },
          '8901234567895',
        ),
      ];

    case 'clothing':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Cotton Shirt · Size L', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.3, width: innerW }, 'MRP ₹ 1,299', smallPt),
        barcode({ left: pad, top: h * 0.52, width: innerW, height: h * 0.34 }, '2400012345678'),
      ];

    case 'food':
      return [
        text({ left: pad, top: h * 0.05, width: innerW }, 'Baked Cookies 250g', smallPt, { bold: true }),
        timeElement({ left: pad, top: h * 0.32, width: innerW }, smallPt * 0.9),
        barcode({ left: pad, top: h * 0.55, width: innerW, height: h * 0.32 }, '8904567891234'),
      ];

    case 'appliances':
      return [
        text({ left: pad, top: h * 0.1, width: innerW * 0.6 }, 'Tested OK · 230V', smallPt, { bold: true }),
        qrcode(
          { left: w - pad - h * 0.7, top: h * 0.15, width: h * 0.7 },
          'https://example.com/asset',
        ),
      ];

    case 'storage':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Kitchen · Shelf B', smallPt, { bold: true }),
        table({ left: pad, top: h * 0.3, width: innerW, height: h * 0.6 }, 2, 2),
      ];

    case 'file':
      return [
        frameShape(w, h, false),
        text({ left: pad + 1, top: h * 0.14, width: innerW - 2 }, 'PROJECT FILES', smallPt, {
          bold: true,
          align: 'center',
        }),
        line({ left: pad + 1, top: h * 0.48, width: innerW - 2 }),
        text({ left: pad + 1, top: h * 0.58, width: innerW - 2 }, '2025 — Archive 03', smallPt * 0.9, {
          align: 'center',
        }),
      ];

    case 'asset':
      return [
        qrcode({ left: pad, top: h * 0.14, width: h * 0.7 }, 'ASSET-000123'),
        text(
          { left: pad + h * 0.7 + 2, top: h * 0.16, width: w - pad * 2 - h * 0.7 - 2 },
          'IT Asset · Laptop',
          smallPt,
          { bold: true },
        ),
        text(
          { left: pad + h * 0.7 + 2, top: h * 0.5, width: w - pad * 2 - h * 0.7 - 2 },
          'No. A-000123',
          smallPt * 0.9,
        ),
      ];

    case 'school':
      return [
        frameShape(w, h),
        text({ left: pad + 1, top: h * 0.2, width: innerW - 2 }, 'Name: ______', smallPt, { bold: true }),
        text({ left: pad + 1, top: h * 0.55, width: innerW - 2 }, 'Class: ______', smallPt),
      ];

    case 'material':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.6 }, 'Material: Steel M6', smallPt, { bold: true }),
        qrcode({ left: w - pad - h * 0.6, top: h * 0.1, width: h * 0.6 }, 'MAT-M6-STEEL'),
        text({ left: pad, top: h * 0.55, width: innerW * 0.6 }, 'Qty: 500 pcs', smallPt * 0.9),
      ];

    case 'racking':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.5 }, 'A-03-02', titlePt, {
          bold: true,
        }),
        barcode(
          { left: pad + innerW * 0.52, top: h * 0.2, width: innerW * 0.48, height: h * 0.5 },
          'A0302',
        ),
      ];

    case 'laboratory':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Sample #S-0042', smallPt, { bold: true }),
        line({ left: pad, top: h * 0.4, width: innerW }),
        timeElement({ left: pad, top: h * 0.5, width: innerW }, smallPt * 0.9),
      ];

    default:
      return [
        text({ left: pad, top: h * 0.12, width: innerW }, name, bodyPt, {
          bold: true,
        }),
        text({ left: pad, top: h * 0.55, width: innerW }, `${w} × ${h} mm`, smallPt),
      ];
  }
}

export function getTemplateDefinition(params: {
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
  previewType: string;
}): TemplateDefinition {
  const layers = freezeTemplateLayers(
    params.previewType,
    buildTemplateElements(
      params.category,
      params.name,
      params.widthMm,
      params.heightMm,
      params.previewType,
    ),
  );
  return {
    id: params.previewType,
    name: params.name,
    category: params.category,
    designWidth: params.widthMm,
    designHeight: params.heightMm,
    background: templateUsesDieCutBackground(params.previewType)
      ? emptyBackground()
      : colorBackground('#FFFFFF'),
    layers,
  };
}

export function createIndustryTemplateDocument(params: {
  name: string;
  category: string;
  widthMm: number;
  heightMm: number;
  previewType: string;
}): LabelDocument {
  return instantiateTemplate(getTemplateDefinition(params));
}
