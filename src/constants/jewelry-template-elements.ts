import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import {
  JEWELRY_DIECUT,
  JEWELRY_DIECUT_TYPE,
  jewelryDieCutColumnX,
  jewelryDieCutFieldTops,
} from '@/constants/jewelry-diecut';
import { clampElementToLabel, templateFontSizes, textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelElement } from '@/lib/label-document';
import { buildRatTail143Elements } from '@/constants/rat-tail-143';
import {
  hasStockSilhouette,
  JEWEL_STOCK,
  jewHangTabLayout,
  jewThreeUpLayout,
} from '@/lib/stock-silhouette';

type Frame = { left: number; top: number; width: number; height?: number };

function textEl(
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
    drawingColorIndex: 1,
    ...extra,
  };
}

function barcodeEl(
  frame: Frame,
  content: string,
  extra: Partial<typeof DEFAULT_BARCODE_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId(),
    type: 'barcode',
    content,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height ?? 8,
    textFlag: 'Hide',
    drawingColorIndex: 1,
    ...extra,
  };
}

function boxEl(
  left: number,
  top: number,
  width: number,
  height: number,
  opts: {
    fill?: boolean;
    fillColor?: string;
    rounded?: boolean;
    radius?: number;
    needPrinting?: boolean;
    lockMovement?: boolean;
    drawingColorIndex?: number;
    lineWidth?: number;
    figureShape?: 'rectangle' | 'roundedRectangle' | 'circle';
  } = {},
): LabelElement {
  const fill = opts.fill ?? true;
  return {
    ...DEFAULT_SHAPE_STATE,
    id: generateId(),
    type: 'shape',
    figureShape:
      opts.figureShape ?? (opts.rounded === false ? 'rectangle' : 'roundedRectangle'),
    left,
    top,
    width,
    height,
    lineWidth: opts.lineWidth ?? 0.38,
    fill,
    fillColor: opts.fillColor ?? (fill ? '#FFFFFF' : undefined),
    roundRadius: opts.radius ?? 1.4,
    drawingColorIndex: opts.drawingColorIndex ?? 0,
    needPrinting: opts.needPrinting ?? true,
    lockMovement: opts.lockMovement ?? false,
  };
}

function lineEl(
  left: number,
  top: number,
  width: number,
  extra: Partial<typeof DEFAULT_LINE_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left,
    top,
    width,
    height: 0.35,
    ...extra,
  };
}

function vLineEl(
  left: number,
  top: number,
  height: number,
  extra: Partial<typeof DEFAULT_LINE_STATE> = {},
): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left,
    top,
    width: 0.28,
    height,
    ...extra,
  };
}

type DieCutItemData = {
  title: string;
  karat: string;
  grWt: string;
  ntWt: string;
  sku: string;
  price: string;
  barcode: string;
  huid: string;
};

const DEFAULT_DIECUT_ITEM: DieCutItemData = {
  title: 'GOLD RING',
  karat: '22K (916) BIS',
  grWt: '3.450g',
  ntWt: '3.280g',
  sku: 'RNG-450',
  price: '₹ 24,950',
  barcode: '91603450',
  huid: 'HUID: B7810A',
};

const dieCutLine = {
  align: 'center' as const,
  autoWrapping: 'Close' as const,
};

/** One 14×96 mm die-cut tag: 64 mm printable body (fold at 32) + 32 mm tail. Chrome is non-printing. */
function buildDieCutTagElements(colX: number, item: DieCutItemData = DEFAULT_DIECUT_ITEM): LabelElement[] {
  const colW = JEWELRY_DIECUT.tagWidthMm;
  const { bodyHeightMm, foldYMm, tailHeightMm, tailWidthMm } = JEWELRY_DIECUT;
  const type = JEWELRY_DIECUT_TYPE;
  const tailX = colX + (colW - tailWidthMm) / 2;
  const innerW = colW - type.insetXMm * 2;
  const left = colX + type.insetXMm;
  const titleH = textBlockHeightMm(type.titlePt, 1);
  const karatH = textBlockHeightMm(type.karatPt, 1);
  const bodyH = textBlockHeightMm(type.bodyPt, 1);
  const priceH = textBlockHeightMm(type.pricePt, 1);
  const skuH = textBlockHeightMm(type.skuPt, 1);
  const huidH = textBlockHeightMm(type.huidPt, 1);
  const tops = jewelryDieCutFieldTops({
    title: titleH,
    karat: karatH,
    gr: bodyH,
    nt: bodyH,
    price: priceH,
    barcode: type.barcodeHeightMm,
    sku: skuH,
    huid: huidH,
  });

  const title = textEl({ left, top: tops.title, width: innerW }, item.title, type.titlePt, {
    ...dieCutLine,
    bold: true,
  });
  const karat = textEl({ left, top: tops.karat, width: innerW }, item.karat, type.karatPt, {
    ...dieCutLine,
    bold: true,
  });
  const gr = textEl({ left, top: tops.gr, width: innerW }, `Gr: ${item.grWt}`, type.bodyPt, {
    ...dieCutLine,
    bold: true,
  });
  const nt = textEl({ left, top: tops.nt, width: innerW }, `Nt: ${item.ntWt}`, type.bodyPt, {
    ...dieCutLine,
    bold: true,
  });
  const price = textEl({ left, top: tops.price, width: innerW }, item.price, type.pricePt, {
    ...dieCutLine,
    bold: true,
  });

  return [
    boxEl(colX, 0, colW, bodyHeightMm, {
      rounded: true,
      radius: 2.0,
      needPrinting: false,
      lockMovement: true,
    }),
    lineEl(colX + 0.5, foldYMm, colW - 1.0, {
      lineStyle: 'dashed',
      needPrinting: false,
      lockMovement: true,
    }),
    boxEl(tailX, bodyHeightMm, tailWidthMm, tailHeightMm, {
      rounded: true,
      radius: 1.2,
      needPrinting: false,
      lockMovement: true,
    }),

    title,
    karat,
    gr,
    nt,
    price,

    barcodeEl(
      { left, top: tops.barcode, width: innerW, height: type.barcodeHeightMm },
      item.barcode,
      { fontSize: type.bodyPt, textFlag: 'Hide' },
    ),
    textEl({ left, top: tops.sku, width: innerW }, item.sku, type.skuPt, { ...dieCutLine, bold: true }),
    textEl({ left, top: tops.huid, width: innerW }, item.huid, type.huidPt, { ...dieCutLine, bold: true }),
  ];
}

function faceLabel(
  left: number,
  top: number,
  width: number,
  height: number,
  copy: string,
  fontSize: number,
): LabelElement {
  const textH = textBlockHeightMm(fontSize, 1);
  return textEl(
    {
      left: left + 0.45,
      top: top + Math.max(0.25, (height - textH) / 2),
      width: Math.max(4, width - 0.9),
      height: Math.max(textH, height * 0.7),
    },
    copy,
    fontSize,
    { align: 'center', drawingColorIndex: 1, autoWrapping: 'Close' },
  );
}

function jewFlagRight(_w: number, h: number, smallPt: number) {
  const { headW } = JEWEL_STOCK.flag20;
  const half = h / 2;
  return [
    faceLabel(0.5, 0.3, headW - 1, half - 0.5, 'Jewelry label', smallPt),
    faceLabel(0.5, half + 0.2, headW - 1, half - 0.5, 'Jewelry label', smallPt),
  ];
}

function jewFlagLeft(w: number, h: number, smallPt: number) {
  const { headW } = JEWEL_STOCK.flag20;
  const headX = w - headW;
  const half = h / 2;
  return [
    faceLabel(headX + 0.5, 0.3, headW - 1, half - 0.5, 'Jewelry label', smallPt),
    faceLabel(headX + 0.5, half + 0.2, headW - 1, half - 0.5, 'Jewelry label', smallPt),
  ];
}

function jewP50Faces(h: number, smallPt: number) {
  const faceW = JEWEL_STOCK.p50.headW / 2 - 0.4;
  return [
    faceLabel(0.5, 0.35, faceW, h - 0.7, 'Jewelry label', smallPt),
    faceLabel(JEWEL_STOCK.p50.foldX + 0.2, 0.35, faceW, h - 0.7, 'Jewelry label', smallPt),
  ];
}

function buildThreeUpRatTailContent(w: number, h: number, smallPt: number): LabelElement[] {
  const { cols, tagW, gap, bodyH } = jewThreeUpLayout(w, h);
  const foldY = bodyH / 2;
  const inner = tagW - 1.0;
  const els: LabelElement[] = [];
  const typePt = Math.max(4.8, Math.min(6.2, smallPt * 0.82));
  for (let i = 0; i < cols; i++) {
    const colX = i * (tagW + gap);
    const left = colX + 0.5;
    els.push(textEl({ left, top: 1.6, width: inner }, 'GOLD RING', typePt, { align: 'center', bold: true }));
    els.push(textEl({ left, top: 7.0, width: inner }, '22K (916)', typePt * 0.88, { align: 'center' }));
    els.push(textEl({ left, top: 12.2, width: inner }, '₹ 24,950', typePt * 0.9, { align: 'center', bold: true }));
    els.push(
      barcodeEl({ left: colX + 0.8, top: foldY + 2.2, width: tagW - 1.6, height: Math.min(10, foldY - 4) }, '91603450', {
        fontSize: typePt * 0.7,
      }),
    );
    els.push(textEl({ left, top: foldY + 13.4, width: inner }, 'RNG-450', typePt * 0.82, { align: 'center' }));
  }
  return els;
}

export function buildJewelryTemplateElements(previewType: string, w: number, h: number): LabelElement[] {
  const { smallPt, bodyPt } = templateFontSizes(w, h);
  const pad = Math.max(0.8, w * 0.02);

  const els: LabelElement[] = (() => {
  switch (previewType) {
    case 'jew-dumbell-13x85': {
      const neckW = Math.min(3.6, w * 0.045);
      const capW = (w - neckW) / 2;
      return [
        faceLabel(0.6, 0.4, capW - 1.2, h - 0.8, 'Jewelry label', smallPt),
        faceLabel(capW + neckW + 0.6, 0.4, capW - 1.2, h - 0.8, 'Jewelry label', smallPt),
      ];
    }

    case 'jew-dumbell-15x85': {
      const neckW = Math.min(3.6, w * 0.045);
      const capW = (w - neckW) / 2;
      const rightLeft = capW + neckW;
      return [
        barcodeEl(
          { left: 1.1, top: h * 0.1, width: Math.max(4, capW - 2.2), height: h * 0.78 },
          '5060185190113',
          { encodeMode: 'EAN-13', textFlag: 'Bottom', fontSize: Math.max(4.5, smallPt * 0.7) },
        ),
        textEl({ left: rightLeft + 1.2, top: h * 0.12, width: capW - 2.2 }, 'Amber Necklace', smallPt * 0.95),
        textEl(
          { left: rightLeft + 1.2, top: h * 0.4, width: capW - 2.2 },
          'Sterling Silver Chain',
          smallPt * 0.82,
        ),
        textEl(
          { left: rightLeft + 1.2, top: h * 0.66, width: capW - 2.2 },
          '€29.9/£24.99',
          smallPt * 0.82,
        ),
      ];
    }

    case 'jew-hangtag-159x413': {
      const tabW = JEWEL_STOCK.hangtag.tabW;
      return [
        textEl({ left: tabW + 1.2, top: h * 0.08, width: w - tabW - 2.4 }, 'woodlawn bracelet', smallPt, {
          align: 'center',
        }),
        barcodeEl(
          { left: tabW + 2, top: h * 0.38, width: w - tabW - 4, height: h * 0.42 },
          '123456789012',
          { encodeMode: 'UPC-A', textFlag: 'Hide' },
        ),
      ];
    }

    case 'jew-label-20x20-right':
      return jewFlagRight(w, h, smallPt);

    case 'jew-label-20x20-left':
      return jewFlagLeft(w, h, smallPt);

    case 'jew-label-50x13-horizontal':
    case 'jew-label-50x13-yellow':
      return jewP50Faces(h, smallPt);

    case 'jew-sample-25x30-flower': {
      const { headW } = JEWEL_STOCK.flower;
      const floralH = Math.min(4.2, h * 0.22);
      const half = h / 2;
      const red = {
        fill: true as const,
        fillColor: '#E53935',
        drawingColorIndex: 3 as const,
        rounded: false as const,
        needPrinting: true as const,
      };
      return [
        faceLabel(0.5, 0.3, headW - 1, half - 0.5, 'Jewelry label', smallPt),
        faceLabel(0.5, half + 0.2, headW - 1, half - 0.5, 'Jewelry label', smallPt),
        boxEl(0.7, h - floralH - 0.4, headW / 2 - 1.2, floralH - 0.2, red),
        boxEl(headW / 2 + 0.4, h - floralH - 0.4, headW / 2 - 1.2, floralH - 0.2, red),
      ];
    }

    case 'jew-sample-30x25-stacked': {
      const { headW } = JEWEL_STOCK.stacked;
      const gap = JEWEL_STOCK.stacked.gap;
      const panelH = (h - gap) / 2;
      return [
        faceLabel(0.6, 0.35, headW - 1.2, panelH - 0.6, 'Jewelry label', smallPt),
        faceLabel(0.6, panelH + gap + 0.25, headW - 1.2, panelH - 0.6, 'Jewelry label', smallPt),
      ];
    }

    case 'jew-sample-30x25-pattern': {
      const { headW } = JEWEL_STOCK.stacked;
      const gap = JEWEL_STOCK.stacked.gap;
      const panelH = (h - gap) / 2;
      const strip = 1.15;
      const red = {
        fill: true as const,
        fillColor: '#C62828',
        drawingColorIndex: 3 as const,
        rounded: false as const,
        needPrinting: true as const,
      };
      const stripH = panelH - 1.2;
      return [
        faceLabel(strip + 1.0, 0.4, headW - strip * 2 - 2, panelH - 0.8, 'Jewelry label', smallPt),
        faceLabel(strip + 1.0, panelH + gap + 0.3, headW - strip * 2 - 2, panelH - 0.8, 'Jewelry label', smallPt),
        boxEl(0.45, 0.6, strip, stripH, red),
        boxEl(headW - strip - 0.45, 0.6, strip, stripH, red),
        boxEl(0.45, panelH + gap + 0.6, strip, stripH, red),
        boxEl(headW - strip - 0.45, panelH + gap + 0.6, strip, stripH, red),
      ];
    }

    case 'jew-sample-50x15-holes': {
      const { gap } = JEWEL_STOCK.holes50;
      const colW = (w - gap) / 2;
      return [
        faceLabel(0.6, 0.5, colW - 1.2, h - 1, 'Jewelry label', smallPt),
        faceLabel(colW + gap + 0.6, 0.5, colW - 1.2, h - 1, 'Jewelry label', smallPt),
      ];
    }

    case 'jew-sample-50x19-tabs': {
      const { gap, colW, tabH, bodyH } = jewHangTabLayout(w, h);
      return [
        faceLabel(0.5, tabH + 0.4, colW - 1, bodyH - 0.8, 'Jewelry label', smallPt),
        faceLabel(colW + gap + 0.5, tabH + 0.4, colW - 1, bodyH - 0.8, 'Jewelry label', smallPt),
      ];
    }

    case 'jew-sample-53x14-bar': {
      const { neckW } = JEWEL_STOCK.bar53;
      const capW = (w - neckW) / 2;
      return [
        faceLabel(0.6, 0.4, capW - 1.2, h - 0.8, 'Jewelry label', smallPt),
        faceLabel(capW + neckW + 0.6, 0.4, capW - 1.2, h - 0.8, 'Jewelry label', smallPt),
      ];
    }

    case 'jew-rattail-143x635':
      return buildRatTail143Elements();

    case 'jew-label-46x100':
    case 'jew-rattail-3row-14x100':
    case 'jew-rattail-3row-55x80':
      return buildThreeUpRatTailContent(w, h, smallPt);


    case 'jew-rattail-single-14x100': {
      const bodyH = h * 0.58;
      const foldY = bodyH / 2;
      const inner = Math.max(4, w - 1.2);
      return [
        textEl({ left: 0.6, top: 1.8, width: inner }, 'GOLD RING', smallPt * 0.95, { align: 'center', bold: true }),
        textEl({ left: 0.6, top: 7.4, width: inner }, '22K (916) BIS', smallPt * 0.8, { align: 'center' }),
        textEl({ left: 0.6, top: 12.4, width: inner }, 'Gr: 3.450g', smallPt * 0.75, { align: 'center' }),
        textEl({ left: 0.6, top: 17.2, width: inner }, 'Nt: 3.280g', smallPt * 0.75, { align: 'center' }),
        textEl({ left: 0.6, top: 22.0, width: inner }, '₹ 24,950', smallPt * 0.85, { align: 'center', bold: true }),
        barcodeEl({ left: 0.8, top: foldY + 2.4, width: w - 1.6, height: 10 }, '91603450'),
        textEl({ left: 0.6, top: foldY + 14.0, width: inner }, 'RNG-450', smallPt * 0.75, { align: 'center' }),
      ];
    }


    case 'jew-rattail-vertical-15x80': {
      const foldY = h * 0.29;
      const inner = Math.max(4, w - 1.2);
      return [
        textEl({ left: 0.6, top: 2.2, width: inner }, 'GOLD RING', smallPt * 0.95, {
          align: 'center',
          bold: true,
        }),
        textEl({ left: 0.6, top: 7.2, width: inner }, '22K (916) BIS', smallPt * 0.8, { align: 'center' }),
        barcodeEl({ left: 1.0, top: foldY + 2.4, width: w - 2.0, height: 9.5 }, '91603450', {
          fontSize: smallPt * 0.7,
        }),
      ];
    }

    case 'jew-rattail-horizontal-80x15': {
      const bodyL = w - 44;
      const foldX = bodyL + 22;
      return [
        textEl({ left: bodyL + 1.0, top: 1.5, width: 19.5 }, 'GOLD RING 22K', smallPt * 0.85, { bold: true }),
        textEl({ left: bodyL + 1.0, top: 5.8, width: 19.5 }, 'Gr: 3.45g | Nt: 3.28g', smallPt * 0.72),
        textEl({ left: bodyL + 1.0, top: 9.8, width: 19.5 }, '₹ 24,950', smallPt * 0.85, { bold: true }),
        barcodeEl({ left: foldX + 1.5, top: 1.8, width: 18.5, height: 7.8 }, '91603450'),
        textEl({ left: foldX + 1.5, top: 10.2, width: 18.5 }, 'SKU: RNG-916-450', smallPt * 0.72, {
          align: 'center',
        }),
      ];
    }

    case 'jew-rattail-single-12x100': {
      return buildDieCutTagElements(0);
    }

    case 'jew-rattail-3row-54x100': {
      const allEls: LabelElement[] = [];
      const itemData: DieCutItemData = {
        ...DEFAULT_DIECUT_ITEM,
        huid: 'HUID: A916B2',
      };
      for (let i = 0; i < JEWELRY_DIECUT.columns; i++) {
        allEls.push(...buildDieCutTagElements(jewelryDieCutColumnX(i), itemData));
      }
      return allEls;
    }

    default:
      return [
        textEl({ left: pad, top: h * 0.12, width: w - pad * 2 }, 'Au750 · 2.35g', smallPt, { bold: true }),
        barcodeEl({ left: pad, top: h * 0.45, width: w * 0.6, height: h * 0.4 }, '10592184'),
        textEl({ left: pad, top: h * 0.55, width: w - pad * 2 }, `${w} × ${h} mm`, bodyPt * 0.85, {
          align: 'center',
        }),
      ];
  }
  })();

  const printable = hasStockSilhouette(previewType)
    ? els.filter((el) => {
        if (el.type === 'line') return el.needPrinting !== false;
        if (el.type !== 'shape') return true;
        const color = (el.fillColor ?? '').toLowerCase();
        return color === '#e53935' || color === '#c62828';
      })
    : els;

  return printable.map((el) => clampElementToLabel(el, { widthMm: w, heightMm: h }));
}
