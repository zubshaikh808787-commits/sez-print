import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_SHAPE_STATE,
  type BarcodeElementState,
} from '@/components/editor/types';
import { templateFontSizes, textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelElement } from '@/lib/label-document';
import { MM_PER_INCH } from '@/lib/label-geometry';

type Frame = { left: number; top: number; width: number; height?: number };

export const SHIPPING_LABEL_WIDTH_MM = 4 * MM_PER_INCH;
export const SHIPPING_LABEL_HEIGHT_MM = 6 * MM_PER_INCH;

export const SHIPPING_TEMPLATE_CATALOG = [
  { id: 'ship-plastic', name: 'Warehouse shipping', previewType: 'ship-plastic' },
  { id: 'ship-parcel', name: 'Parcel FROM / SHIP TO', previewType: 'ship-parcel' },
  { id: 'ship-gs1', name: 'GS1 SSCC / ROUTE', previewType: 'ship-gs1' },
  { id: 'ship-freight', name: 'Freight FROM / TO / SSCC', previewType: 'ship-freight' },
] as const;

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
    height: extra.height ?? textBlockHeightMm(fontSize, content.split('\n').length),
    autoWrapping: 'Word',
    ...extra,
  };
}

function barcode(
  frame: Frame,
  content: string,
  extra: Partial<BarcodeElementState> = {},
): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? 10,
    textFlag: extra.textFlag ?? 'Bottom',
    ...extra,
  };
}

function box(
  left: number,
  top: number,
  width: number,
  height: number,
  opts: {
    fill?: boolean;
    fillColor?: string;
    rounded?: boolean;
    radius?: number;
    color?: number;
    lineWidth?: number;
  } = {},
): LabelElement {
  return {
    ...DEFAULT_SHAPE_STATE,
    id: generateId(),
    type: 'shape',
    figureShape: opts.rounded === false ? 'rectangle' : 'roundedRectangle',
    left,
    top,
    width,
    height,
    lineWidth: opts.lineWidth ?? 0.35,
    fill: opts.fill ?? false,
    fillColor: opts.fillColor,
    roundRadius: opts.radius ?? 1.2,
    drawingColorIndex: opts.color ?? 1,
  };
}

function hrule(left: number, top: number, width: number): LabelElement {
  return box(left, top, width, 0.4, {
    rounded: false,
    fill: true,
    fillColor: '#111827',
    lineWidth: 0,
    radius: 0,
  });
}

function vrule(left: number, top: number, height: number): LabelElement {
  return box(left, top, 0.4, height, {
    rounded: false,
    fill: true,
    fillColor: '#111827',
    lineWidth: 0,
    radius: 0,
  });
}

function shipPlastic(w: number, h: number): LabelElement[] {
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const m = Math.max(1 + 0.6, w * 0.018);
  const innerW = w - m * 2;
  const innerH = h - m * 2;
  const mid = m + innerW * 0.38;
  const rightW = w - m - mid - 0.4;
  const y0 = m;
  const y1 = m + innerH * 0.16;
  const y2 = m + innerH * 0.34;
  const y3 = m + innerH * 0.5;
  const y4 = m + innerH * 0.62;

  return [
    box(m, m, innerW, innerH, { rounded: true, radius: 3.2, lineWidth: 0.45 }),
    hrule(m, y1, innerW),
    hrule(m, y2, innerW),
    hrule(m, y3, innerW),
    hrule(m, y4, innerW),
    vrule(mid, y0, y3 - y0),
    vrule(m + innerW * 0.5, y3, y4 - y3),
    vrule(mid, y4, m + innerH - y4),

    text({ left: m + 2, top: y0 + 3, width: mid - m - 4 }, 'LOGO', titlePt * 1.35, { bold: true }),
    text({ left: mid + 2, top: y0 + 1.6, width: rightW - 3 }, 'From:', smallPt, { bold: true }),
    text(
      { left: mid + 2, top: y0 + 6.5, width: rightW - 3 },
      'Company Name\nAddress\nCity',
      bodyPt,
    ),

    box(m + 2.2, y1 + 2.2, mid - m - 4.4, y2 - y1 - 4.4, {
      rounded: false,
      fill: true,
      fillColor: '#111827',
      lineWidth: 0,
    }),
    text(
      { left: m + 2.2, top: y1 + (y2 - y1) * 0.58, width: mid - m - 4.4 },
      'FRAGILE',
      smallPt,
      { bold: true, align: 'center', antiColor: true },
    ),
    text({ left: mid + 2, top: y1 + 1.6, width: rightW - 3 }, 'To:', smallPt, { bold: true }),
    text(
      { left: mid + 2, top: y1 + 7, width: rightW - 3 },
      'Company Name\nAddress\nCity',
      titlePt,
      { bold: true },
    ),

    text({ left: m + 2, top: y2 + 2, width: mid - m - 4 }, 'Order nr.:', smallPt),
    text({ left: m + 2, top: y2 + 8, width: mid - m - 4 }, '00000/2017', bodyPt, { bold: true }),
    barcode(
      { left: mid + 3, top: y2 + 2.5, width: rightW - 6, height: y3 - y2 - 7 },
      '000002017',
      { textFlag: 'Hide' },
    ),

    text({ left: m + 2, top: y3 + 2.4, width: innerW * 0.45 }, 'Ref number:', smallPt),
    text(
      { left: m + innerW * 0.5 + 2, top: y3 + 2.4, width: innerW * 0.45 },
      'Lot number:',
      smallPt,
    ),

    text({ left: m + 2, top: y4 + 2, width: mid - m - 4 }, 'Item nr.:', smallPt),
    text({ left: m + 2, top: y4 + 8, width: mid - m - 4 }, '00000/2017', bodyPt, { bold: true }),
    text({ left: m + 2, top: y4 + 16, width: mid - m - 4 }, 'Delivery instruction:', smallPt),
    text(
      { left: m + 2, top: y4 + 22, width: mid - m - 4 },
      'Leave with receptionist',
      bodyPt,
    ),
    barcode(
      { left: mid + 3, top: y4 + 3, width: rightW - 6, height: m + innerH - y4 - 8 },
      '000002017ITEM',
      { textFlag: 'Hide' },
    ),
  ];
}

function shipParcel(w: number, h: number): LabelElement[] {
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const m = Math.max(1.5, w * 0.02);
  const innerW = w - m * 2;
  const innerH = h - m * 2;
  const colW = innerW / 2;
  const yMid = m + innerH * 0.40;
  const yBar = m + innerH * 0.60;
  const midColW = innerW / 3;

  return [
    box(m, m, innerW, innerH, { rounded: false, radius: 0, lineWidth: 0.45 }),
    vrule(m + colW, m, yMid - m),
    hrule(m, yMid, innerW),
    hrule(m, yBar, innerW),

    text({ left: m + 2, top: m + 2, width: colW - 4 }, 'FROM', smallPt),
    text(
      { left: m + 2, top: m + 7, width: colW - 4 },
      'Acme Corporation\n123 Warehouse Blvd,\nSuite 100,\nLos Angeles, CA 90012',
      bodyPt,
      { bold: true },
    ),
    text({ left: m + colW + 2, top: m + 2, width: colW - 4 }, 'SHIP TO', smallPt),
    text(
      { left: m + colW + 2, top: m + 7, width: colW - 4 },
      'Sarah Johnson\n456 Oak Avenue, Apt 7B,\nBrooklyn, NY 11201,\nUnited States',
      bodyPt,
      { bold: true },
    ),

    // Middle 3-column section: WEIGHT | DIMENSIONS | SHIPPING DATE
    text({ left: m + 1, top: yMid + 1.5, width: midColW - 2 }, 'WEIGHT', smallPt, {
      align: 'center',
    }),
    text(
      { left: m + 1, top: yMid + (yBar - yMid) * 0.45, width: midColW - 2 },
      '3 lbs',
      bodyPt,
      { bold: true, align: 'center' },
    ),
    text(
      { left: m + midColW + 1, top: yMid + 1.5, width: midColW - 2 },
      'DIMENSIONS',
      smallPt,
      { align: 'center' },
    ),
    text(
      { left: m + midColW + 1, top: yMid + (yBar - yMid) * 0.45, width: midColW - 2 },
      '12x8x2 cm',
      bodyPt,
      { bold: true, align: 'center' },
    ),
    text(
      { left: m + midColW * 2 + 1, top: yMid + 1.5, width: midColW - 2 },
      'SHIP DATE',
      smallPt,
      { align: 'center' },
    ),
    text(
      { left: m + midColW * 2 + 1, top: yMid + (yBar - yMid) * 0.45, width: midColW - 2 },
      '3-Dec-2025',
      bodyPt,
      { bold: true, align: 'center' },
    ),

    barcode(
      {
        left: m + innerW * 0.05,
        top: yBar + (innerH - (yBar - m)) * 0.1,
        width: innerW * 0.9,
        height: (innerH - (yBar - m)) * 0.75,
      },
      'SAMPLE123',
    ),
  ];
}

function shipGs1(w: number, h: number): LabelElement[] {
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const m = Math.max(3 + 0.5, w * 0.045);
  const innerW = w - m * 2;
  const colW = innerW / 2;
  const yInfo = h * 0.34;
  const yRule1 = h * 0.48;
  const yRule2 = h * 0.66;
  const yBar1 = h * 0.68;
  const yBar2 = h * 0.84;

  return [
    text({ left: m, top: m, width: colW - 2 }, 'Von/From', smallPt),
    text(
      { left: m, top: m + 6, width: colW - 2 },
      'Mustermann GmbH\nHerr Schmidt\nHauptstr.35\n123456 Frankfurt\nGermany',
      bodyPt,
    ),
    text({ left: m + colW, top: m, width: colW }, 'An/TO', smallPt),
    text(
      { left: m + colW, top: m + 6, width: colW },
      'Edificio de Servicio Generales\nMs.Li\nCalle Centella 20\n00112 Barcelona\nSpain',
      bodyPt,
    ),

    text({ left: m, top: yInfo, width: innerW }, 'Dimensions/Weight: 60*10*10cm/30,0kg', titlePt, {
      bold: true,
    }),
    text({ left: m, top: yInfo + 8, width: innerW }, 'Billing No: 012345678900 12 12', bodyPt, {
      bold: true,
    }),

    hrule(m, yRule1, innerW),
    text({ left: m, top: yRule1 + 2, width: innerW }, 'SSCC', smallPt, { align: 'center' }),
    text(
      { left: m, top: yRule1 + 8, width: innerW },
      '012345678912345678',
      titlePt,
      { bold: true, align: 'center' },
    ),
    text({ left: m, top: yRule1 + 16, width: innerW * 0.5 }, 'ROUTE', smallPt, { align: 'center' }),
    text(
      { left: m, top: yRule1 + 22, width: innerW * 0.5 },
      '012345',
      bodyPt,
      { bold: true, align: 'center' },
    ),
    text(
      { left: m + innerW * 0.5, top: yRule1 + 16, width: innerW * 0.5 },
      'GINC',
      smallPt,
      { align: 'center' },
    ),
    text(
      { left: m + innerW * 0.5, top: yRule1 + 22, width: innerW * 0.5 },
      '0123456789',
      bodyPt,
      { bold: true, align: 'center' },
    ),
    hrule(m, yRule2, innerW),

    barcode(
      { left: m + innerW * 0.08, top: yBar1, width: innerW * 0.84, height: h * 0.12 },
      '0010123456B12345678',
    ),
    barcode(
      { left: m, top: yBar2, width: innerW, height: h - yBar2 - m - 2 },
      '1112345678909876543212401678901',
    ),
  ];
}

function shipFreight(w: number, h: number): LabelElement[] {
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const m = Math.max(3 + 0.2, w * 0.04);
  const innerW = w - m * 2;
  const colW = innerW / 2;
  const y1 = h * 0.34;
  const y2 = h * 0.58;

  return [
    vrule(m + colW, m, y1 - m),
    hrule(m, y1, innerW),
    vrule(m + colW, y1, y2 - y1),
    hrule(m, y2, innerW),

    text({ left: m, top: m, width: colW - 2 }, 'FROM', smallPt, { bold: true }),
    text(
      { left: m, top: m + 7, width: colW - 2 },
      'BIG SUPPLIER\n6th AVENUE\nNANJING\nCHINA',
      bodyPt,
    ),
    text({ left: m + colW + 2, top: m, width: colW - 2 }, 'TO', smallPt, { bold: true }),
    text(
      { left: m + colW + 2, top: m + 7, width: colW - 2 },
      'GREAT VALUE\n1234 NEWCAJUN\nDAYTON, OHIO\nUSA',
      titlePt,
      { bold: true },
    ),

    text({ left: m, top: y1 + 2, width: colW - 2 }, 'SHIP TO POST', smallPt, { bold: true }),
    barcode(
      { left: m + 2, top: y1 + 9, width: colW - 8, height: y2 - y1 - 18 },
      '32112345',
    ),
    text({ left: m + colW + 2, top: y1 + 2, width: colW - 4 }, 'CARRIER', smallPt, { bold: true }),
    text({ left: m + colW + 2, top: y1 + 8, width: colW - 4 }, 'Best Freight', bodyPt),
    text({ left: m + colW + 2, top: y1 + 16, width: colW - 4 }, 'BIL', smallPt, { bold: true }),
    text({ left: m + colW + 2, top: y1 + 21.5, width: colW - 4 }, '567890', bodyPt),
    text({ left: m + colW + 2, top: y1 + 29, width: colW - 4 }, 'PRO', smallPt, { bold: true }),
    text({ left: m + colW + 2, top: y1 + 34.5, width: colW - 4 }, '0123456789', bodyPt),

    text({ left: m, top: y2 + 2, width: innerW }, 'SSCC', smallPt, { bold: true }),
    barcode(
      { left: m + 2, top: y2 + 10, width: innerW - 4, height: h - y2 - m - 12 },
      '0001234561234567890',
    ),
  ];
}

export function buildShippingTemplateElements(
  previewType: string,
  w: number,
  h: number,
): LabelElement[] | null {
  switch (previewType) {
    case 'ship-plastic':
      return shipPlastic(w, h);
    case 'ship-parcel':
      return shipParcel(w, h);
    case 'ship-gs1':
      return shipGs1(w, h);
    case 'ship-freight':
      return shipFreight(w, h);
    default:
      return null;
  }
}
