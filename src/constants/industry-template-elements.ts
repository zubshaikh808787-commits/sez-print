import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  createTableState,
  type BarcodeElementState,
} from '@/components/editor/types';
import { templateFontSizes, textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelElement } from '@/lib/label-document';

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
    height: 0.35,
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

function circle(widthMm: number, heightMm: number): LabelElement {
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

function clipart(frame: Frame, clipartId: string): LabelElement {
  return {
    id: generateId(),
    type: 'clipart',
    clipartId,
    rotation: 0,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? frame.width,
    lockMovement: false,
    needPrinting: true,
    drawingColorIndex: 1,
  };
}

function outline(w: number, h: number, radius = 1.2) {
  return [box(0.7, 0.7, w - 1.4, h - 1.4, { radius })];
}

function dualCols(w: number, h: number, radius = 1.2) {
  const gap = 0.8;
  const colW = (w - 1.6 - gap) / 2;
  return [
    box(0.8, 0.8, colW, h - 1.6, { radius }),
    box(0.8 + colW + gap, 0.8, colW, h - 1.6, { radius }),
  ];
}

/** N-up horizontal columns (2ups / 3ups / 4ups) with optional label text per panel. */
function multiCols(
  w: number,
  h: number,
  count: number,
  radius = 1.2,
  labels?: string[],
): LabelElement[] {
  const gap = Math.max(0.6, Math.min(1.2, w * 0.015));
  const pad = 0.7;
  const colW = (w - pad * 2 - gap * (count - 1)) / count;
  const { smallPt } = templateFontSizes(colW, h);
  const els: LabelElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const left = pad + i * (colW + gap);
    els.push(box(left, pad, colW, h - pad * 2, { radius, fill: true, fillColor: '#FFFFFF' }));
    const caption = labels?.[i] ?? `Label ${i + 1}`;
    els.push(
      text(
        { left: left + 0.8, top: h * 0.28, width: Math.max(4, colW - 1.6) },
        caption,
        Math.max(5.5, smallPt * 0.9),
        { align: 'center', bold: true },
      ),
    );
  }
  return els;
}

function dualStacked(w: number, h: number, radius = 1.5) {
  const gap = 0.6;
  const rowH = (h - 1.6 - gap) / 2;
  return [
    box(0.8, 0.8, w - 1.6, rowH, { radius }),
    box(0.8, 0.8 + rowH + gap, w - 1.6, rowH, { radius }),
  ];
}

function pStyle(w: number, h: number, extra: LabelElement[] = []) {
  const pad = 0.7;
  const headW = w * 0.68;
  const tailW = Math.max(2.5, w - headW - pad * 2);
  return [
    box(pad, pad, headW, h - pad * 2, { radius: 0.6 }),
    box(pad + headW, h * 0.34, tailW, h * 0.32, { rounded: false }),
    ...extra,
  ];
}

function tStyle(w: number, h: number, extra: LabelElement[] = []) {
  const pad = 0.7;
  const headH = h * 0.55;
  const tailW = w * 0.38;
  return [
    box(pad, pad, w - pad * 2, headH, { radius: 0.6 }),
    box((w - tailW) / 2, pad + headH, tailW, h - headH - pad * 2, { rounded: false }),
    ...extra,
  ];
}

/**
 * Per-previewType editor layouts so the industry card and editing pad share one document.
 * Returns null when the type should use the category fallback.
 */
export function buildIndustryPreviewElements(
  previewType: string,
  _name: string,
  w: number,
  h: number,
): LabelElement[] | null {
  const { titlePt, bodyPt, smallPt } = templateFontSizes(w, h);
  const pad = Math.max(0.8, Math.min(w, h) * 0.04);
  const innerW = w - pad * 2;

  switch (previewType) {
    case 'macaroon':
      return [
        box(pad, pad, innerW, h - pad * 2, { fill: true, color: 3, radius: 2, lineWidth: 0 }),
      ];
    case 'cartoon':
      return [
        box(pad * 0.4, pad * 0.4, w - pad * 0.8, h - pad * 0.8, { radius: 1.2 }),
        clipart({ left: pad, top: h * 0.12, width: h * 0.7, height: h * 0.7 }, 'an-rabbit'),
        clipart({ left: w * 0.38, top: h * 0.08, width: h * 0.85, height: h * 0.85 }, 'an-rabbit'),
        clipart({ left: w * 0.68, top: h * 0.18, width: h * 0.62, height: h * 0.62 }, 'an-rabbit'),
      ];
    case 'watercolor':
      return [
        box(pad, pad, innerW * 0.48, h * 0.55, { fill: true, color: 3, radius: 3, lineWidth: 0 }),
        box(w * 0.4, h * 0.12, innerW * 0.42, h * 0.5, { fill: true, color: 5, radius: 3, lineWidth: 0 }),
        box(w * 0.28, h * 0.42, innerW * 0.4, h * 0.42, { fill: true, color: 4, radius: 3, lineWidth: 0 }),
      ];
    case 'color-pill':
      return [
        box(pad, pad, innerW * 0.55, h - pad * 2, { fill: true, color: 4, radius: h / 2, lineWidth: 0 }),
        box(pad + innerW * 0.5, pad, innerW * 0.5, h - pad * 2, { radius: h / 2 }),
      ];

    case 'rect-30x22':
      return outline(w, h, 1.4);
    case 'rect-35x15':
      return outline(w, h, 0.4);
    case 'rect-40x15':
      return outline(w, h, 1.4);
    case 'rect-40x80':
      return outline(w, h, 1.4);
    case 'rect-50x20':
      return outline(w, h, 3.2);
    case 'rect-50x25':
      return outline(w, h, 1.4);
    case 'rect-50x70':
      return outline(w, h, 1.4);
    case 'rect-60x38':
      return outline(w, h, 0.8);
    case 'rect-60x80':
      return outline(w, h, 1.4);
    case 'rect-65x35':
      return outline(w, h, 0.8);
    case 'dual-stacked-20x10':
      return dualStacked(w, h, 2.2);
    case 'dual-cols-20x10':
      return dualCols(w, h, 1.2);
    case 'dual-stacked-30x15':
      return dualStacked(w, h, 2.2);
    case 'dual-cols-30x30':
      return dualCols(w, h, 1.6);
    case 'dual-cols-22.5x13':
      return dualCols(w, h, 1.2);
    case 'two-ups-30x20':
      return multiCols(w, h, 2, 1.4, ['Product A', 'Product B']);
    case 'two-ups-40x25':
      return multiCols(w, h, 2, 1.6, ['Left', 'Right']);
    case 'three-ups-25x15':
      return multiCols(w, h, 3, 1.2, ['A', 'B', 'C']);
    case 'three-ups-30x20':
      return multiCols(w, h, 3, 1.4, ['Item 1', 'Item 2', 'Item 3']);
    case 'four-ups-20x15':
      return multiCols(w, h, 4, 1.0, ['1', '2', '3', '4']);

    case 'cable-yellow-4col': {
      const colW = (w - pad * 2) / 4;
      return [0, 1, 2, 3].map((i) =>
        box(pad + i * colW, pad, colW - (i < 3 ? 0.35 : 0), h - pad * 2, { rounded: false }),
      );
    }
    case 'cable-12.5x74':
      return pStyle(w, h);
    case 'cable-301-pstyle':
      return pStyle(w, h, [line({ left: pad + 1, top: h * 0.5, width: w * 0.62 })]);
    case 'cable-428-inspected':
      return pStyle(w, h, [
        text({ left: pad + 1, top: h * 0.08, width: w * 0.6 }, 'CABLE 428', smallPt, { bold: true }),
        text({ left: pad + 1, top: h * 0.28, width: w * 0.6 }, 'RESET CIRCUIT', smallPt * 0.9),
        line({ left: pad + 1, top: h * 0.48, width: w * 0.6 }),
        text({ left: pad + 1, top: h * 0.55, width: w * 0.6 }, 'INSPECTED 15/AUG', smallPt * 0.9),
      ]);
    case 'cable-tall-dual-flag':
      return dualCols(w, h, 0.6);
    case 'cable-d38-inverted':
      return [
        ...dualStacked(w, h, 0.5),
        text({ left: pad + 1, top: h * 0.12, width: innerW * 0.7 }, 'China Telecom  A-01', smallPt),
        text({ left: pad + 1, top: h * 0.58, width: innerW * 0.7 }, 'China Telecom  A-01', smallPt),
      ];
    case 'cable-gp60-hangtag':
      return [
        ...dualCols(w, h, 0.4),
        text({ left: pad + 1, top: h * 0.12, width: innerW * 0.45 }, 'GB45-60RD', smallPt, { bold: true }),
        text({ left: pad + 1, top: h * 0.32, width: innerW * 0.45 }, 'Indoor Hangtag', smallPt * 0.9),
        text({ left: w * 0.54, top: h * 0.12, width: innerW * 0.45 }, 'GB45-60RD', smallPt, { bold: true }),
        text({ left: w * 0.54, top: h * 0.32, width: innerW * 0.45 }, 'Indoor Hangtag', smallPt * 0.9),
      ];
    case 'cable-hb38-red':
      return pStyle(w, h);
    case 'cable-lf45-double':
      return pStyle(w, h, dualStacked(w * 0.68, h, 0.4));
    case 'cable-lf64-dash':
      return pStyle(w, h, [line({ left: pad + 1, top: h * 0.5, width: w * 0.6 })]);
    case 'cable-lt38-tstyle':
      return tStyle(w, h);
    case 'cable-lt45-tstyle':
      return tStyle(w, h);
    case 'cable-pstyle-barcode':
      return pStyle(w, h, [
        barcode({ left: pad + 1, top: h * 0.1, width: w * 0.58, height: h * 0.32 }, '001234567895'),
        text({ left: pad + 1, top: h * 0.55, width: w * 0.4 }, 'USB CABLE', smallPt, { bold: true }),
      ]);
    case 'cable-pstyle-panel23':
      return pStyle(w, h, [
        text({ left: pad + 1, top: h * 0.12, width: w * 0.6 }, 'PANEL 23 42:A', smallPt, { bold: true }),
        text({ left: pad + 1, top: h * 0.34, width: w * 0.6 }, 'INSPECTED 02/29', smallPt),
      ]);
    case 'cable-tstyle-barcode':
      return tStyle(w, h, [
        text({ left: pad + 1, top: h * 0.06, width: innerW }, 'BCX 13.1.03.ZX.IN3', smallPt, { bold: true }),
        text({ left: pad + 1, top: h * 0.2, width: innerW }, 'PPL 15.3.01.AT.OUT8', smallPt),
        barcode({ left: pad + 1, top: h * 0.36, width: innerW, height: h * 0.16 }, 'B03F09R11'),
      ]);

    case 'other-8x60-5rows':
      return [table({ left: pad, top: pad, width: innerW, height: h - pad * 2 }, 5, 1)];
    case 'other-15x25-rect':
      return outline(w, h, 0.4);
    case 'other-19x13-rect':
      return outline(w, h, 0.4);
    case 'other-50x10-plus4':
      return dualStacked(w, h, 1.2);
    case 'other-storage-bag-v1':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.5 }, 'Name:', smallPt),
        text({ left: pad + innerW * 0.5, top: h * 0.08, width: innerW * 0.5 }, 'Bed No.:', smallPt),
        text({ left: pad, top: h * 0.32, width: innerW }, 'Pumping Date  Y / M / D', smallPt),
        line({ left: pad, top: h * 0.52, width: innerW }),
        text({ left: pad, top: h * 0.62, width: innerW * 0.45 }, 'Time', smallPt),
        text({ left: pad + innerW * 0.45, top: h * 0.62, width: innerW * 0.55 }, 'Capacity    ml', smallPt),
      ];
    case 'other-storage-bag-v2':
      return [
        text({ left: pad, top: h * 0.1, width: innerW }, 'Date  ________', smallPt),
        text({ left: pad, top: h * 0.38, width: innerW }, 'Time  ________', smallPt),
        text({ left: pad, top: h * 0.66, width: innerW }, 'Capacity  ____ ml', smallPt),
      ];
    case 'other-storage-bag-v3':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Bed No.: ________', smallPt),
        text({ left: pad, top: h * 0.3, width: innerW }, 'Name: ________', smallPt),
        text({ left: pad, top: h * 0.52, width: innerW }, 'Hospital No.: ________', smallPt),
        text({ left: pad, top: h * 0.74, width: innerW }, 'Pumping Time: ________', smallPt),
      ];
    case 'other-storage-bag-v4':
    case 'other-storage-bag-v5':
    case 'other-storage-bag-v6':
    case 'other-storage-bag-v7':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.5 }, 'Name: ____', smallPt),
        text({ left: pad + innerW * 0.5, top: h * 0.08, width: innerW * 0.5 }, 'Bed No.: ____', smallPt),
        text({ left: pad, top: h * 0.36, width: innerW }, 'Hospital No.: ________', smallPt),
        text({ left: pad, top: h * 0.62, width: innerW }, 'Pumping Time: ________', smallPt),
      ];
    case 'other-fishing-50x30-simple':
      return [
        text({ left: pad, top: h * 0.12, width: innerW }, 'Fishing Line', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.52, width: innerW }, `${w} × ${h} mm`, smallPt, { align: 'center' }),
      ];
    case 'other-fishing-50x70-tall':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Fishing Line', bodyPt, { bold: true, align: 'center' }),
        qrcode({ left: w * 0.3, top: h * 0.32, width: w * 0.4 }, 'FISH-50x70'),
      ];
    case 'other-fishing-70x50-park':
      return [
        text({ left: pad, top: h * 0.1, width: innerW }, 'PARK FISHING', titlePt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.45, width: innerW }, 'Hotline bait · 70×50', smallPt, { align: 'center' }),
      ];
    case 'other-fishing-70x50-hotline':
      return [
        text({ left: pad, top: h * 0.1, width: innerW }, 'HOTLINE', titlePt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.48, width: innerW }, 'Fishing accessory', smallPt, { align: 'center' }),
      ];
    case 'other-fishing-80x50-qr1':
    case 'other-fishing-80x50-qr2':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.55 }, 'Fishing Gear', bodyPt, { bold: true }),
        qrcode({ left: w - pad - h * 0.55, top: h * 0.2, width: h * 0.55 }, 'https://example.com/fish'),
      ];
    case 'other-fabric-50x70-remark':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Remark', smallPt, { bold: true }),
        table({ left: pad, top: h * 0.22, width: innerW, height: h * 0.7 }, 4, 2),
      ];
    case 'other-fabric-50x70-table':
      return [table({ left: pad, top: pad, width: innerW, height: h - pad * 2 }, 5, 2)];
    case 'other-fabric-70x50-simple':
      return [
        text({ left: pad, top: h * 0.12, width: innerW }, 'Fabric Sample', bodyPt, { bold: true }),
        text({ left: pad, top: h * 0.48, width: innerW }, 'Lot / Color / Width', smallPt),
      ];
    case 'other-fabric-70x50-spec':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Fabric Spec', bodyPt, { bold: true }),
        table({ left: pad, top: h * 0.28, width: innerW, height: h * 0.62 }, 3, 2),
      ];
    case 'other-fabric-70x50-company':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Company Fabric', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.4, width: innerW }, 'Composition / Width / Lot', smallPt, { align: 'center' }),
      ];
    case 'other-fabric-70x50-rows':
      return [table({ left: pad, top: pad, width: innerW, height: h - pad * 2 }, 4, 1)];
    case 'other-barcode-library':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Library', smallPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.32, width: innerW, height: h * 0.5 }, '6901234567892'),
      ];
    case 'other-barcode-apparel':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Apparel', smallPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.32, width: innerW, height: h * 0.52 }, '2400012345678'),
      ];
    case 'other-barcode-elementary':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Elementary', smallPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.32, width: innerW, height: h * 0.52 }, '1234567890128'),
      ];
    case 'other-service-card-warranty':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Warranty Card', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.4, width: innerW }, 'SN / Date / Dealer', smallPt, { align: 'center' }),
      ];
    case 'other-service-water-filter':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Water Filter', bodyPt, { bold: true }),
        text({ left: pad, top: h * 0.4, width: innerW }, 'Replace date: ____', smallPt),
      ];
    case 'other-service-equipment':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Equipment Service', bodyPt, { bold: true }),
        qrcode({ left: w - pad - h * 0.5, top: h * 0.28, width: h * 0.5 }, 'EQ-SERVICE'),
      ];

    case 'storage-home-50x20':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 0.8 }),
        text({ left: pad + 1, top: h * 0.28, width: innerW - 2 }, 'Counting Cards', bodyPt, {
          align: 'center',
          bold: true,
        }),
      ];
    case 'storage-kitchen-cabinet-101x51':
      return [
        text({ left: pad, top: h * 0.32, width: innerW }, 'Forks', titlePt, { align: 'center', bold: true }),
      ];
    case 'storage-kitchen-vanilla-44x32':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 0.6 }),
        text({ left: pad + 1, top: h * 0.22, width: innerW - 2 }, 'French', bodyPt, { align: 'center' }),
        text({ left: pad + 1, top: h * 0.52, width: innerW - 2 }, 'Vanilla', bodyPt, { align: 'center', bold: true }),
      ];

    case 'transparent-30x20':
    case 'transparent-40x20':
      return outline(w, h, 0.8);

    case 'circle-30':
    case 'circle-40':
    case 'circle-50':
      return [circle(w, h)];

    case 'smkt-black-yellow-60x40':
      return [
        text({ left: pad, top: h * 0.05, width: innerW * 0.58 }, 'Thermal Label\nSticker Paper', smallPt, {
          bold: true,
        }),
        text({ left: pad, top: h * 0.42, width: innerW * 0.58 }, 'Type: black mark', smallPt * 0.85),
        barcode({ left: pad, top: h * 0.58, width: innerW * 0.55, height: h * 0.32 }, '1234567890128'),
        text({ left: pad + innerW * 0.6, top: h * 0.08, width: innerW * 0.4 }, 'Clearance', smallPt, {
          bold: true,
          align: 'center',
        }),
        text({ left: pad + innerW * 0.6, top: h * 0.38, width: innerW * 0.4 }, '₹241', titlePt, {
          bold: true,
          align: 'center',
        }),
      ];
    case 'smkt-orange-50x30':
      return [
        barcode({ left: pad, top: pad, width: innerW, height: h * 0.38 }, '4934321111571', {
          encodeMode: 'EAN-13',
        }),
        text({ left: pad, top: h * 0.48, width: innerW }, 'Wheat Tortillas 2.5kg', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.7, width: innerW * 0.5 }, '₹ 280 / kg', smallPt),
        text({ left: pad + innerW * 0.5, top: h * 0.66, width: innerW * 0.5 }, '₹699', titlePt, {
          bold: true,
          align: 'right',
        }),
      ];
    case 'smkt-yellow-40x30':
      return [
        text({ left: pad, top: h * 0.04, width: innerW * 0.55 }, 'WHOOPS!', smallPt, { bold: true }),
        text({ left: pad + innerW * 0.5, top: h * 0.04, width: innerW * 0.5 }, 'WAS: ₹140', smallPt),
        barcode({ left: pad, top: h * 0.28, width: innerW, height: h * 0.38 }, '4901111776807', {
          encodeMode: 'EAN-13',
        }),
        text({ left: pad, top: h * 0.72, width: innerW }, 'NOW: ₹107', bodyPt, { bold: true }),
      ];
    case 'smkt-shelf-50x30-1':
      return [
        text({ left: pad, top: h * 0.04, width: innerW * 0.7 }, 'PREMIUM GROUND CHUCK', smallPt, { bold: true }),
        text({ left: pad + innerW * 0.7, top: h * 0.06, width: innerW * 0.3 }, '1 LB', smallPt),
        text({ left: pad, top: h * 0.4, width: innerW * 0.45 }, '₹115 LB', smallPt),
        text({ left: pad + innerW * 0.5, top: h * 0.36, width: innerW * 0.5 }, '₹ 115', titlePt, { bold: true }),
        barcode({ left: pad, top: h * 0.68, width: innerW, height: h * 0.24 }, '1234567890128'),
      ];
    case 'smkt-shelf-50x30-2':
      return [
        text({ left: pad, top: h * 0.04, width: innerW * 0.35 }, 'RETAIL PRICE', smallPt),
        text({ left: pad + innerW * 0.32, top: h * 0.02, width: innerW * 0.36 }, '5.99', titlePt, {
          bold: true,
          align: 'center',
        }),
        text({ left: pad, top: h * 0.4, width: innerW }, '(H)NERD COSTUME SET PPR AST', smallPt * 0.9),
        barcode({ left: pad, top: h * 0.62, width: innerW * 0.7, height: h * 0.28 }, '04902284053'),
      ];
    case 'smkt-twocolor-50x30':
      return [
        text({ left: pad, top: h * 0.06, width: innerW * 0.55 }, 'MANGO', titlePt, { bold: true }),
        text({ left: pad + innerW * 0.55, top: h * 0.08, width: innerW * 0.45 }, "Orchard's\n100g=₹249", smallPt),
        text({ left: pad, top: h * 0.55, width: innerW * 0.35 }, 'SALE', bodyPt, { bold: true }),
        text({ left: pad + innerW * 0.35, top: h * 0.52, width: innerW * 0.65 }, '₹ 253', titlePt, { bold: true }),
      ];
    case 'smkt-black-yellow-40x30':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'DETONGER', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.28, width: innerW }, 'FULL CREAM MILK POWDER', smallPt * 0.9),
        text({ left: pad, top: h * 0.52, width: innerW * 0.4 }, '400g', smallPt),
        text({ left: pad + innerW * 0.4, top: h * 0.48, width: innerW * 0.6 }, '₹2499', titlePt, { bold: true }),
      ];
    case 'smkt-red-40x30':
      return [
        text({ left: pad, top: h * 0.04, width: innerW }, 'REDUCED', smallPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.22, width: innerW, height: h * 0.4 }, '4947975415759', {
          encodeMode: 'EAN-13',
        }),
        text({ left: pad, top: h * 0.7, width: innerW }, 'NOW ₹429', bodyPt, { bold: true, align: 'center' }),
      ];
    case 'smkt-black-75x38':
      return [
        text({ left: pad, top: h * 0.06, width: innerW * 0.62 }, "BULL'S-EYE ORIGINAL BBQ SAUCE", smallPt, {
          bold: true,
        }),
        barcode({ left: pad, top: h * 0.5, width: innerW * 0.5, height: h * 0.38 }, '344470'),
        text({ left: pad + innerW * 0.58, top: h * 0.25, width: innerW * 0.42 }, '₹1130', titlePt, {
          bold: true,
          align: 'right',
        }),
      ];
    case 'smkt-black-green-60x40':
      return [
        text({ left: pad, top: h * 0.04, width: innerW }, 'Baby Wipes', bodyPt, { bold: true }),
        text({ left: pad, top: h * 0.28, width: innerW * 0.62 }, '*56 wipes  *Alcohol free', smallPt * 0.9),
        barcode({ left: pad, top: h * 0.55, width: innerW * 0.55, height: h * 0.35 }, '1234567890128'),
        text({ left: pad + innerW * 0.58, top: h * 0.4, width: innerW * 0.42 }, '₹223', titlePt, {
          bold: true,
          align: 'right',
        }),
      ];
    case 'smkt-sale-talker-635x984':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'KRAFT RANCH DRESSING', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.28, width: innerW }, '₹165', titlePt, { bold: true }),
        text({ left: pad, top: h * 0.52, width: innerW }, '2/₹249  YOU SAVE ₹81', smallPt),
        text({ left: pad, top: h * 0.78, width: innerW }, 'sale', bodyPt, { bold: true, align: 'center' }),
      ];
    case 'smkt-shelf-84x30-cvs':
      return [
        text({ left: pad, top: h * 0.06, width: innerW * 0.55 }, 'CVS C 500MG EZSWLO', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.4, width: innerW * 0.55 }, '12161   145470', smallPt * 0.85),
        barcode({ left: pad + innerW * 0.55, top: h * 0.08, width: innerW * 0.45, height: h * 0.4 }, '12161145470'),
        text({ left: pad + innerW * 0.55, top: h * 0.55, width: innerW * 0.45 }, 'YOU PAY  ₹439', smallPt, {
          bold: true,
          align: 'right',
        }),
      ];
    case 'smkt-shelf-84x30-bbq':
      return [
        text({ left: pad, top: h * 0.06, width: innerW * 0.62 }, "BULL'S-EYE ORIGINAL BBQ SAUCE", smallPt, {
          bold: true,
        }),
        barcode({ left: pad, top: h * 0.5, width: innerW * 0.48, height: h * 0.38 }, '344470'),
        text({ left: pad + innerW * 0.55, top: h * 0.22, width: innerW * 0.45 }, '₹1130', titlePt, {
          bold: true,
          align: 'right',
        }),
      ];
    case 'smkt-shelf-84x30-2':
      return [
        text({ left: pad, top: h * 0.04, width: innerW * 0.4 }, 'EVERYDAY PRICE', smallPt, { bold: true }),
        barcode({ left: pad, top: h * 0.4, width: innerW * 0.42, height: h * 0.48 }, '03700085522'),
        text({ left: pad + innerW * 0.48, top: h * 0.12, width: innerW * 0.52 }, 'YOU PAY  539', titlePt, {
          bold: true,
        }),
        text({ left: pad + innerW * 0.48, top: h * 0.62, width: innerW * 0.52 }, 'GAIN FIREWORKS ORIG 9.7Z', smallPt * 0.85),
      ];

    case 'food-baked-30x15':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 0.8 }),
        text({ left: pad + 1, top: h * 0.28, width: innerW - 2 }, 'Baking bread', bodyPt, {
          align: 'center',
          bold: true,
        }),
      ];
    case 'food-price-496x296':
      return [
        barcode({ left: pad, top: h * 0.18, width: innerW * 0.42, height: h * 0.64 }, '6901234567892', {
          encodeMode: 'EAN-13',
        }),
        text({ left: pad + innerW * 0.48, top: h * 0.18, width: innerW * 0.5 }, 'Coffee and Walnut', smallPt, {
          bold: true,
        }),
        text({ left: pad + innerW * 0.48, top: h * 0.42, width: innerW * 0.5 }, 'Filigree Biscuits', smallPt),
        text({ left: pad + innerW * 0.48, top: h * 0.66, width: innerW * 0.5 }, '₹580 for 25', smallPt, {
          bold: true,
        }),
      ];
    case 'food-imported-60x50':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'WAGYU RIBEYE', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.32, width: innerW }, 'CARCASS NO.:4660', smallPt),
        text({ left: pad, top: h * 0.5, width: innerW }, 'WEIGHT:1.02LB', smallPt),
        text({ left: pad, top: h * 0.68, width: innerW }, 'CATTLE ID NO.: 0863354944', smallPt),
      ];
    case 'food-ingredients-50x40':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Ingredients:', bodyPt, { bold: true }),
        text({ left: pad, top: h * 0.32, width: innerW }, '-Salmon\n-Yams\n-Corn Flour\n-Wheat Flour', smallPt),
      ];

    case 'appl-electrical-40x20':
      return [
        text({ left: pad, top: h * 0.04, width: innerW }, 'ACS Electrical', smallPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.24, width: innerW }, 'Tel:.0120 314 5666', smallPt * 0.9, { align: 'center' }),
        barcode({ left: pad, top: h * 0.46, width: innerW, height: h * 0.46 }, '6901234567892', {
          encodeMode: 'EAN-13',
        }),
      ];

    case 'file-address-667x254':
      return [
        text({ left: pad, top: h * 0.32, width: innerW }, 'OPEN IMMEDIATELY', bodyPt, {
          bold: true,
          align: 'center',
        }),
      ];
    case 'file-cabinet-52x169':
      return [text({ left: pad, top: h * 0.35, width: innerW }, 'bank', titlePt, { align: 'center' })];
    case 'file-folder-192x61':
      return [text({ left: pad, top: h * 0.32, width: innerW }, 'Marketing', titlePt, { align: 'center' })];
    case 'file-label-40x25a':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 1 }),
        text({ left: pad + 1, top: h * 0.18, width: innerW - 2 }, 'Important Meeting', smallPt, {
          bold: true,
          align: 'center',
        }),
        line({ left: pad + 2, top: h * 0.5, width: innerW - 4 }),
        text({ left: pad + 1, top: h * 0.58, width: innerW - 2 }, 'Note-taking', smallPt, { align: 'center' }),
      ];
    case 'file-label-40x25b':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 1 }),
        text({ left: pad + 1, top: h * 0.1, width: innerW - 2 }, 'Staff Handbook', smallPt, {
          bold: true,
          align: 'center',
        }),
        text({ left: pad + 1, top: h * 0.4, width: innerW - 2 }, 'Personnel', smallPt, { align: 'center' }),
        text({ left: pad + 1, top: h * 0.65, width: innerW - 2 }, '2018 Year', smallPt, { align: 'center' }),
      ];
    case 'file-visitor-968x54':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'VISITOR', smallPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.32, width: innerW }, 'JOHN TAY', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.62, width: innerW }, 'ABC Corp  08/22  15:35', smallPt, { align: 'center' }),
      ];

    case 'asset-tag-508x19':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'PROPERTY OF OSSIA / SOUNDWORKS', smallPt, {
          bold: true,
        }),
        text({ left: pad, top: h * 0.38, width: innerW }, 'ASSET NO.', smallPt),
        text({ left: pad, top: h * 0.62, width: innerW }, 'HQBOAFT01000586481', smallPt * 0.9, { bold: true }),
      ];
    case 'asset-tag-6985x3175':
      return [
        text({ left: pad, top: h * 0.08, width: innerW * 0.55 }, 'Company Name', bodyPt, { bold: true }),
        text({ left: pad, top: h * 0.38, width: innerW * 0.55 }, 'Company address', smallPt),
        barcode({ left: pad + innerW * 0.5, top: h * 0.28, width: innerW * 0.5, height: h * 0.5 }, '1234567890'),
      ];
    case 'asset-tag-9525x508-1':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'PROPERTY OF HARK INDUSTRIES', smallPt, {
          bold: true,
          align: 'center',
        }),
        barcode({ left: pad, top: h * 0.35, width: innerW, height: h * 0.52 }, '12345678912345678'),
      ];
    case 'asset-tag-9525x508-2':
      return [
        text({ left: pad, top: h * 0.04, width: innerW }, 'PROPERTY OF HARK INDUSTRIES', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.28, width: innerW }, 'ASSET NO.  NSN 1450-01-425-2548', smallPt * 0.9),
        text({ left: pad, top: h * 0.5, width: innerW }, 'SERIAL NO.  1    PART NO.  10162862', smallPt * 0.9),
        text({ left: pad, top: h * 0.72, width: innerW }, 'CONTR NO.  SP0700-03-MQ053', smallPt * 0.9),
      ];

    case 'school-name-sticker-40x25a':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 1 }),
        text({ left: pad + 1, top: h * 0.18, width: innerW - 2 }, 'WangLele', bodyPt, { bold: true, align: 'center' }),
        line({ left: pad + 2, top: h * 0.52, width: innerW - 4 }),
        text({ left: pad + 1, top: h * 0.58, width: innerW - 2 }, 'No.24', smallPt, { align: 'center' }),
      ];
    case 'school-name-sticker-40x25b':
      return [
        box(pad, pad, innerW, h - pad * 2, { radius: 1 }),
        text({ left: pad + 1, top: h * 0.08, width: innerW - 2 }, 'Class 403', smallPt, { align: 'center' }),
        text({ left: pad + 1, top: h * 0.36, width: innerW - 2 }, 'WangLele', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad + 1, top: h * 0.68, width: innerW - 2 }, 'No.24', smallPt, { align: 'center' }),
      ];

    case 'material-label-445x14':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, "1/4 -20  HE'S NUT", smallPt, {
          bold: true,
          align: 'center',
        }),
        barcode({ left: pad, top: h * 0.38, width: innerW, height: h * 0.52 }, '690123456787'),
      ];
    case 'material-label-61x508':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Lock Nut', bodyPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.38, width: innerW * 0.5 }, '1/2 diameter\nInsert Lock NF', smallPt),
        text({ left: pad + innerW * 0.5, top: h * 0.38, width: innerW * 0.5 }, '20TPI\nZinc Plated', smallPt),
      ];
    case 'material-label-70x222':
      return [
        text({ left: pad, top: h * 0.08, width: innerW }, 'Machine Screws', bodyPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.4, width: innerW, height: h * 0.48 }, '6901234567892'),
      ];
    case 'material-label-80x40':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'SCREW TRUSS HEAD TYPE', smallPt, { bold: true }),
        text({ left: pad, top: h * 0.32, width: innerW }, 'B.SS #4  ________', smallPt),
        text({ left: pad, top: h * 0.54, width: innerW }, 'TYPE-B #4 SS  ________', smallPt),
        text({ left: pad, top: h * 0.76, width: innerW }, '1/3", 1/2"  ________', smallPt),
      ];

    case 'rack-label-80x40':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'KRC DISTRIBUTORS', smallPt, { bold: true, align: 'center' }),
        barcode({ left: pad, top: h * 0.3, width: innerW, height: h * 0.4 }, 'A25B588'),
        text({ left: pad, top: h * 0.76, width: innerW }, 'A-25-B-588', smallPt, { align: 'center', bold: true }),
      ];
    case 'rack-label-100x40':
      return [
        barcode({ left: pad, top: pad, width: innerW * 0.75, height: h * 0.55 }, 'ISLEDROW41'),
        text({ left: pad, top: h * 0.68, width: innerW * 0.75 }, 'Isle D - Row 41', bodyPt, { bold: true }),
      ];

    case 'lab-label-508x37':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'Brenmoor Cameo Label', smallPt, {
          bold: true,
          align: 'center',
        }),
        qrcode({ left: (w - h * 0.42) / 2, top: h * 0.28, width: h * 0.42 }, 'CAMEO'),
        text({ left: pad, top: h * 0.78, width: innerW }, 'Plowman  Sally  11.1.2005', smallPt, { align: 'center' }),
      ];
    case 'lab-microscope-22x22':
      return [
        barcode({ left: pad, top: pad, width: innerW, height: h * 0.32 }, 'SRS0003'),
        text({ left: pad, top: h * 0.4, width: innerW }, 'SRS0003', smallPt, { bold: true, align: 'center' }),
        text({ left: pad, top: h * 0.58, width: innerW }, 'Patient ID:GREY.ANN', smallPt * 0.85, { align: 'center' }),
        text({ left: pad, top: h * 0.76, width: innerW }, 'date:06/05/16 12:07', smallPt * 0.85, { align: 'center' }),
      ];
    case 'lab-pathology-508x19':
      return [
        text({ left: pad, top: h * 0.06, width: innerW }, 'NAME  ________', smallPt),
        text({ left: pad, top: h * 0.3, width: innerW }, 'DOB  ________', smallPt),
        text({ left: pad, top: h * 0.54, width: innerW }, 'Specimen  ________', smallPt),
        text({ left: pad, top: h * 0.76, width: innerW }, 'Rm.No. ____    Date ____', smallPt),
      ];

    default:
      return null;
  }
}
