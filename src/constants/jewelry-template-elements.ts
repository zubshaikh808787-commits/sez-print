import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { clampElementToLabel, templateFontSizes, textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelElement } from '@/lib/label-document';

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
    ...extra,
  };
}

function boxEl(
  left: number,
  top: number,
  width: number,
  height: number,
  opts: { fill?: boolean; fillColor?: string; rounded?: boolean; radius?: number } = {},
): LabelElement {
  const fill = opts.fill ?? true;
  return {
    ...DEFAULT_SHAPE_STATE,
    id: generateId(),
    type: 'shape',
    figureShape: opts.rounded === false ? 'rectangle' : 'roundedRectangle',
    left,
    top,
    width,
    height,
    lineWidth: 0.35,
    fill,
    fillColor: opts.fillColor ?? (fill ? '#FFFFFF' : undefined),
    roundRadius: opts.radius ?? 1.2,
  };
}

function lineEl(left: number, top: number, width: number): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left,
    top,
    width,
    height: 0.35,
  };
}

function vLineEl(left: number, top: number, height: number): LabelElement {
  return {
    ...DEFAULT_LINE_STATE,
    id: generateId(),
    type: 'line',
    left,
    top,
    width: 0.35,
    height,
  };
}

function jewFlagRight(w: number, h: number, smallPt: number, withText = true) {
  const panelW = w * 0.64;
  const panelH = (h - 1.2) / 2;
  const tailW = w - panelW - 1.5;
  const els: LabelElement[] = [
    boxEl(0.8, 0.6, panelW, panelH),
    boxEl(0.8, 0.6 + panelH + 0.4, panelW, panelH),
    boxEl(panelW + 0.5, h * 0.38, Math.max(2, tailW), h * 0.22, { rounded: false }),
  ];
  if (withText) {
    els.push(
      textEl({ left: 1.5, top: panelH * 0.2, width: panelW - 2 }, 'Jewelry label', smallPt, {
        align: 'center',
      }),
      textEl(
        { left: 1.5, top: 0.6 + panelH + 0.4 + panelH * 0.2, width: panelW - 2 },
        'Jewelry label',
        smallPt,
        { align: 'center' },
      ),
    );
  }
  return els;
}

function jewFlagLeft(w: number, h: number, smallPt: number, withText = true) {
  const panelW = w * 0.64;
  const panelH = (h - 1.2) / 2;
  const tailW = w - panelW - 1.5;
  const panelLeft = tailW + 0.7;
  const els: LabelElement[] = [
    boxEl(panelLeft, 0.6, panelW, panelH),
    boxEl(panelLeft, 0.6 + panelH + 0.4, panelW, panelH),
    boxEl(0.5, h * 0.38, Math.max(2, tailW), h * 0.22, { rounded: false }),
  ];
  if (withText) {
    els.push(
      textEl({ left: panelLeft + 0.7, top: panelH * 0.2, width: panelW - 2 }, 'Jewelry label', smallPt, {
        align: 'center',
      }),
      textEl(
        { left: panelLeft + 0.7, top: 0.6 + panelH + 0.4 + panelH * 0.2, width: panelW - 2 },
        'Jewelry label',
        smallPt,
        { align: 'center' },
      ),
    );
  }
  return els;
}

export function buildJewelryTemplateElements(previewType: string, w: number, h: number): LabelElement[] {
  const { smallPt, bodyPt } = templateFontSizes(w, h);
  const pad = Math.max(0.8, w * 0.02);

  const els: LabelElement[] = (() => {
  switch (previewType) {
    case 'jew-dumbell-13x85': {
      const bridgeW = Math.min(3.2, w * 0.08);
      const capW = (w - bridgeW) / 2;
      return [
        boxEl(0, 0, capW, h, { radius: 2.4 }),
        boxEl(capW, h * 0.32, bridgeW, h * 0.36, { rounded: false }),
        boxEl(capW + bridgeW, 0, capW, h, { radius: 2.4 }),
        textEl({ left: 1, top: h * 0.28, width: capW - 2 }, 'Jewelry label', smallPt, {
          align: 'center',
        }),
        textEl(
          { left: capW + bridgeW + 1, top: h * 0.28, width: capW - 2 },
          'Jewelry label',
          smallPt,
          { align: 'center' },
        ),
      ];
    }

    case 'jew-dumbell-15x85': {
      const bridgeW = Math.min(3.4, w * 0.08);
      const leftW = (w - bridgeW) * 0.46;
      const rightW = w - leftW - bridgeW;
      const rightLeft = leftW + bridgeW;
      return [
        boxEl(0, 0, leftW, h, { radius: 2.6 }),
        boxEl(leftW, h * 0.34, bridgeW, h * 0.32, { rounded: false }),
        boxEl(rightLeft, 0, rightW, h, { radius: 2.6 }),
        barcodeEl(
          { left: 1.1, top: h * 0.1, width: Math.max(4, leftW - 2.2), height: h * 0.78 },
          '5060185190113',
          { encodeMode: 'EAN-13', textFlag: 'Bottom', fontSize: Math.max(4.5, smallPt * 0.7) },
        ),
        textEl({ left: rightLeft + 1.2, top: h * 0.1, width: rightW - 2.2 }, 'Amber Necklace', smallPt, {
          bold: true,
        }),
        textEl(
          { left: rightLeft + 1.2, top: h * 0.38, width: rightW - 2.2 },
          'Sterling Silver Chain',
          smallPt * 0.92,
        ),
        textEl(
          { left: rightLeft + 1.2, top: h * 0.64, width: rightW - 2.2 },
          '€29.9/£24.99',
          smallPt * 0.92,
        ),
      ];
    }

    case 'jew-hangtag-159x413':
      return [
        boxEl(pad, pad * 0.3, w - pad * 2, h - pad * 0.6, { radius: 1 }),
        textEl({ left: pad + 1, top: h * 0.1, width: w - pad * 2 - 2 }, 'woodlawn bracelet', smallPt, {
          align: 'center',
          bold: true,
        }),
        barcodeEl({ left: pad + 2, top: h * 0.42, width: w - pad * 2 - 4, height: h * 0.38 }, '1234567890'),
        textEl({ left: pad + 1, top: h * 0.82, width: w - pad * 2 - 2 }, '1234567890', smallPt * 0.85, {
          align: 'center',
        }),
      ];

    case 'jew-label-20x20-right':
      return jewFlagRight(w, h, smallPt);

    case 'jew-label-20x20-left':
      return jewFlagLeft(w, h, smallPt);

    case 'jew-label-50x13-horizontal': {
      const halfW = (w - 4) / 2;
      return [
        boxEl(pad, pad * 0.4, halfW, h - pad * 0.8),
        boxEl(pad + halfW + 0.6, pad * 0.4, halfW, h - pad * 0.8),
        boxEl(w - pad * 2.5, h * 0.35, pad * 1.5, h * 0.3, { rounded: false }),
        textEl({ left: pad + 0.5, top: h * 0.28, width: halfW - 1 }, 'Jewelry label', smallPt, {
          align: 'center',
        }),
        textEl({ left: pad + halfW + 1, top: h * 0.28, width: halfW - 1 }, 'Jewelry label', smallPt, {
          align: 'center',
        }),
      ];
    }

    case 'jew-label-50x13-yellow': {
      const halfW = (w - 4) / 2;
      return [
        boxEl(pad, pad * 0.4, halfW, h - pad * 0.8, { fill: true, fillColor: '#F7E329' }),
        boxEl(pad + halfW + 0.6, pad * 0.4, halfW, h - pad * 0.8, { fill: true, fillColor: '#F7E329' }),
        boxEl(w - pad * 2.5, h * 0.35, pad * 1.5, h * 0.3, { rounded: false }),
      ];
    }

    case 'jew-sample-25x30-flower':
      return [
        ...jewFlagRight(w, h, smallPt, false),
        textEl({ left: 2, top: h * 0.12, width: w * 0.55 }, '◆  ◆  ◆', smallPt * 0.9, { align: 'center' }),
        textEl({ left: 2, top: h * 0.55, width: w * 0.55 }, '◆  ◆  ◆', smallPt * 0.9, { align: 'center' }),
      ];

    case 'jew-sample-30x25-stacked':
      return jewFlagRight(w, h, smallPt, false);

    case 'jew-sample-30x25-pattern':
      return [
        ...jewFlagRight(w, h, smallPt, false),
        textEl({ left: 2, top: h * 0.15, width: w * 0.55 }, '◆  ◆  ◆', smallPt, { align: 'center' }),
        textEl({ left: 2, top: h * 0.58, width: w * 0.55 }, '◆  ◆  ◆', smallPt, { align: 'center' }),
      ];

    case 'jew-sample-50x15-holes': {
      const halfW = (w - 1.5) / 2;
      return [
        boxEl(pad, pad * 0.3, halfW, h - pad * 0.6, { radius: 2 }),
        boxEl(pad + halfW + 0.5, pad * 0.3, halfW, h - pad * 0.6, { radius: 2 }),
        boxEl(pad + 2, pad, 2.5, 2.5, { fill: true, fillColor: '#111827', radius: 1.2 }),
        boxEl(pad + halfW + 2.5, pad, 2.5, 2.5, { fill: true, fillColor: '#111827', radius: 1.2 }),
      ];
    }

    case 'jew-sample-50x19-tabs': {
      const unitW = (w - 2) / 2;
      const flapH = h * 0.28;
      const bodyH = h - flapH - pad;
      return [
        boxEl(pad, pad, unitW - 0.5, flapH, { radius: 1 }),
        boxEl(pad, pad + flapH, unitW - 0.5, bodyH, { radius: 0.8 }),
        boxEl(pad + unitW + 0.5, pad, unitW - 0.5, flapH, { radius: 1 }),
        boxEl(pad + unitW + 0.5, pad + flapH, unitW - 0.5, bodyH, { radius: 0.8 }),
        boxEl(pad + unitW * 0.35, pad + 0.5, 2, 2, { fill: true, fillColor: '#111827', radius: 1 }),
        boxEl(pad + unitW + unitW * 0.35, pad + 0.5, 2, 2, { fill: true, fillColor: '#111827', radius: 1 }),
      ];
    }

    case 'jew-sample-53x14-bar': {
      const capW = (w - 2.5) / 2;
      return [
        boxEl(pad, h * 0.15, capW, h * 0.7, { radius: 2 }),
        lineEl(pad + capW, h * 0.45, 1.2),
        boxEl(pad + capW + 1.2, h * 0.15, capW, h * 0.7, { radius: 2 }),
      ];
    }

    case 'jew-rattail-143x635': {
      const headW = w * 0.72;
      const stripW = w - headW - pad;
      return [
        boxEl(pad, pad * 0.3, headW, h - pad * 0.6, { radius: 1 }),
        barcodeEl({ left: pad + 1, top: h * 0.15, width: headW * 0.38, height: h * 0.65 }, '1234567890'),
        textEl({ left: pad + headW * 0.42, top: h * 0.12, width: headW * 0.55 }, "Men's Comfort Band", smallPt, {
          bold: true,
        }),
        textEl(
          { left: pad + headW * 0.42, top: h * 0.42, width: headW * 0.55 },
          '14K Gold, 10.5 Size',
          smallPt * 0.9,
        ),
        textEl({ left: pad + headW * 0.42, top: h * 0.68, width: headW * 0.55 }, '22 grams', smallPt * 0.9),
        boxEl(headW + pad, h * 0.2, stripW, h * 0.6, { rounded: false }),
      ];
    }

    case 'jew-rattail-3row-14x100': {
      // 3 labels across: each width 14.3 mm, distance between labels 1.7 mm, length 100 mm.
      // Total active span = 3 * 14.3 + 2 * 1.7 = 42.9 + 3.4 = 46.3 mm.
      // Total roll/paper width = 50.0 mm (standard 2" / 50 mm jewelry roll).
      // Left/Right margin = (50.0 - 46.3) / 2 = 1.85 mm.
      const colW = 14.3;
      const colGap = 1.7;
      const startX = 1.85;
      const tailW = 3.2;
      const tailH = 40.0;
      const bodyTop = 41.5;
      const bodyH = 57.0;
      const foldY = bodyTop + 28.5; // Fold line at Y = 70.0 mm
      const allEls: LabelElement[] = [];

      const mockData = [
        { title: 'Au 750', karat: '18K Gold', grWt: '3.250g', ntWt: '3.100g', sku: 'RNG-101', price: '₹ 22,500' },
        { title: 'Au 916', karat: '22K Gold', grWt: '4.450g', ntWt: '4.280g', sku: 'ERN-204', price: '₹ 32,900' },
        { title: 'Pt 950', karat: 'Platinum', grWt: '5.100g', ntWt: '4.950g', sku: 'PND-308', price: '₹ 41,200' },
      ];

      for (let i = 0; i < 3; i++) {
        const colX = startX + i * (colW + colGap);
        const tailX = colX + (colW - tailW) / 2;
        const data = mockData[i];

        // 1. Narrow loop tail at the top (3.2 mm x 40.0 mm)
        allEls.push(boxEl(tailX, 1.5, tailW, tailH, { rounded: true, radius: 1.6 }));
        // 2. Main printable tag body (14.3 mm x 57.0 mm)
        allEls.push(boxEl(colX, bodyTop, colW, bodyH, { rounded: true, radius: 2.2 }));
        // 3. Middle fold guide line (at Y = 70.0 mm)
        allEls.push(lineEl(colX + 0.6, foldY, colW - 1.2));

        // --- Upper Fold Panel (Front Details: 14.3 mm x 28.5 mm) ---
        allEls.push(
          textEl({ left: colX + 0.4, top: bodyTop + 2.0, width: colW - 0.8 }, data.title, smallPt * 0.9, {
            align: 'center',
            bold: true,
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: bodyTop + 7.5, width: colW - 0.8 }, data.karat, smallPt * 0.75, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: bodyTop + 12.8, width: colW - 0.8 }, `Gr: ${data.grWt}`, smallPt * 0.72, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: bodyTop + 17.5, width: colW - 0.8 }, `Nt: ${data.ntWt}`, smallPt * 0.72, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: bodyTop + 22.8, width: colW - 0.8 }, data.price, smallPt * 0.82, {
            align: 'center',
            bold: true,
          }),
        );

        // --- Lower Fold Panel (Back Details & Barcode: 14.3 mm x 28.5 mm) ---
        allEls.push(
          barcodeEl(
            { left: colX + 0.8, top: foldY + 3.0, width: colW - 1.6, height: 11.0 },
            `9160${i + 1}450`,
            { fontSize: smallPt * 0.65 },
          ),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: foldY + 16.0, width: colW - 0.8 }, data.sku, smallPt * 0.75, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.4, top: foldY + 21.0, width: colW - 0.8 }, 'HUID: A916B2', smallPt * 0.7, {
            align: 'center',
          }),
        );
      }

      return allEls;
    }

    case 'jew-rattail-single-14x100': {
      // Single 14.3 mm x 100 mm Rat Tail Jewelry Tag
      const tailW = 3.2;
      const tailH = 40.0;
      const tailX = (w - tailW) / 2;
      const bodyW = 14.3;
      const bodyX = 0;
      const bodyTop = 41.5;
      const bodyH = 57.0;
      const foldY = bodyTop + 28.5; // at Y = 70.0 mm

      return [
        // Loop strap at the top
        boxEl(tailX, 1.5, tailW, tailH, { rounded: true, radius: 1.6 }),
        // Printable foldable body
        boxEl(bodyX, bodyTop, bodyW, bodyH, { rounded: true, radius: 2.2 }),
        // Fold guide line
        lineEl(bodyX + 0.6, foldY, bodyW - 1.2),

        // Front details (upper half of body)
        textEl({ left: bodyX + 0.4, top: bodyTop + 2.0, width: bodyW - 0.8 }, 'GOLD RING', smallPt * 0.95, {
          align: 'center',
          bold: true,
        }),
        textEl({ left: bodyX + 0.4, top: bodyTop + 7.5, width: bodyW - 0.8 }, '22K (916) BIS', smallPt * 0.8, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.4, top: bodyTop + 12.8, width: bodyW - 0.8 }, 'Gr Wt: 3.450g', smallPt * 0.75, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.4, top: bodyTop + 17.5, width: bodyW - 0.8 }, 'Nt Wt: 3.280g', smallPt * 0.75, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.4, top: bodyTop + 22.8, width: bodyW - 0.8 }, 'MRP: ₹ 24,950', smallPt * 0.85, {
          align: 'center',
          bold: true,
        }),

        // Back details (lower half of body)
        barcodeEl({ left: bodyX + 0.8, top: foldY + 3.0, width: bodyW - 1.6, height: 11.5 }, '91603450', {
          fontSize: smallPt * 0.7,
        }),
        textEl({ left: bodyX + 0.4, top: foldY + 16.5, width: bodyW - 0.8 }, 'SKU: RNG-450', smallPt * 0.75, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.4, top: foldY + 21.5, width: bodyW - 0.8 }, 'HUID: B7810A', smallPt * 0.7, {
          align: 'center',
        }),
      ];
    }

    case 'jew-rattail-3row-55x80': {
      const colW = 14.5;
      const colGap = 3.5;
      const startX = 2.2;
      const tailW = 3.2;
      const tailH = 32.0;
      const bodyTop = 33.5;
      const bodyH = 44.0;
      const foldY = bodyTop + 22.0;
      const allEls: LabelElement[] = [];

      const mockData = [
        { title: 'Au 750', karat: '18K Gold', wt: '2.45g', sku: 'RNG-101', price: '₹ 18,500' },
        { title: 'Au 916', karat: '22K Gold', wt: '3.80g', sku: 'ERN-204', price: '₹ 28,900' },
        { title: 'Pt 950', karat: 'Platinum', wt: '4.10g', sku: 'PND-308', price: '₹ 34,200' },
      ];

      for (let i = 0; i < 3; i++) {
        const colX = startX + i * (colW + colGap);
        const tailX = colX + (colW - tailW) / 2;
        const data = mockData[i];

        // Narrow loop strap/tail at the top (matching photo)
        allEls.push(boxEl(tailX, 1.5, tailW, tailH, { rounded: true, radius: 1.5 }));
        // Main printable tag body at the bottom
        allEls.push(boxEl(colX, bodyTop, colW, bodyH, { rounded: true, radius: 2.2 }));
        // Subtle horizontal fold line dividing front and back
        allEls.push(lineEl(colX + 0.8, foldY, colW - 1.6));

        // Upper Fold Panel (Front)
        allEls.push(
          textEl({ left: colX + 0.5, top: bodyTop + 1.8, width: colW - 1 }, data.title, smallPt * 0.85, {
            align: 'center',
            bold: true,
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.5, top: bodyTop + 6.8, width: colW - 1 }, data.karat, smallPt * 0.72, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.5, top: bodyTop + 11.5, width: colW - 1 }, `Wt: ${data.wt}`, smallPt * 0.75, {
            align: 'center',
          }),
        );
        allEls.push(
          textEl({ left: colX + 0.5, top: bodyTop + 16.2, width: colW - 1 }, data.price, smallPt * 0.78, {
            align: 'center',
            bold: true,
          }),
        );

        // Lower Fold Panel (Back) - Barcode & SKU
        allEls.push(
          barcodeEl(
            { left: colX + 1.0, top: foldY + 2.5, width: colW - 2.0, height: 9.0 },
            `9160${i + 1}45`,
            { fontSize: smallPt * 0.65 },
          ),
        );
        allEls.push(
          textEl({ left: colX + 0.5, top: foldY + 13.0, width: colW - 1 }, data.sku, smallPt * 0.72, {
            align: 'center',
          }),
        );
      }

      return allEls;
    }

    case 'jew-rattail-vertical-15x80': {
      const tailW = 3.5;
      const tailH = 33.0;
      const tailX = (w - tailW) / 2;
      const bodyW = w - 1.2;
      const bodyX = 0.6;
      const bodyTop = 34.5;
      const bodyH = 43.5;
      const foldY = bodyTop + 21.5;

      return [
        // Top narrow strap / tail
        boxEl(tailX, 1.5, tailW, tailH, { rounded: true, radius: 1.5 }),
        // Main foldable body
        boxEl(bodyX, bodyTop, bodyW, bodyH, { rounded: true, radius: 2.2 }),
        // Fold guide line
        lineEl(bodyX + 0.8, foldY, bodyW - 1.6),

        // Upper Panel (Front Details)
        textEl({ left: bodyX + 0.5, top: bodyTop + 2.0, width: bodyW - 1 }, 'GOLD RING', smallPt * 0.95, {
          align: 'center',
          bold: true,
        }),
        textEl({ left: bodyX + 0.5, top: bodyTop + 6.8, width: bodyW - 1 }, '22K (916) BIS', smallPt * 0.8, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.5, top: bodyTop + 11.2, width: bodyW - 1 }, 'Gr: 3.450g', smallPt * 0.8, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.5, top: bodyTop + 15.5, width: bodyW - 1 }, 'Nt: 3.280g', smallPt * 0.8, {
          align: 'center',
        }),

        // Lower Panel (Back: Barcode, Code & MRP)
        barcodeEl({ left: bodyX + 1.0, top: foldY + 2.5, width: bodyW - 2.0, height: 9.5 }, '91603450', {
          fontSize: smallPt * 0.7,
        }),
        textEl({ left: bodyX + 0.5, top: foldY + 13.5, width: bodyW - 1 }, 'SKU: RNG-450', smallPt * 0.75, {
          align: 'center',
        }),
        textEl({ left: bodyX + 0.5, top: foldY + 17.5, width: bodyW - 1 }, 'MRP: ₹ 24,950', smallPt * 0.85, {
          align: 'center',
          bold: true,
        }),
      ];
    }

    case 'jew-rattail-horizontal-80x15': {
      const tailL = 1.5;
      const tailW = 33.0;
      const tailH = 3.5;
      const tailY = (h - tailH) / 2;
      const bodyL = 36.0;
      const bodyW = 42.5;
      const bodyH = h - 1.2;
      const bodyY = 0.6;
      const foldX = bodyL + 21.0;

      return [
        // Horizontal narrow strap / tail on the left
        boxEl(tailL, tailY, tailW, tailH, { rounded: true, radius: 1.5 }),
        // Main printable tag body on the right
        boxEl(bodyL, bodyY, bodyW, bodyH, { rounded: true, radius: 2.2 }),
        // Vertical fold separator
        vLineEl(foldX, bodyY + 0.8, bodyH - 1.6),

        // Left Tag Panel
        textEl({ left: bodyL + 1.0, top: 1.5, width: 19.5 }, 'GOLD RING 22K', smallPt * 0.85, { bold: true }),
        textEl({ left: bodyL + 1.0, top: 5.8, width: 19.5 }, 'Gr: 3.45g | Nt: 3.28g', smallPt * 0.72),
        textEl({ left: bodyL + 1.0, top: 9.8, width: 19.5 }, '₹ 24,950', smallPt * 0.85, { bold: true }),

        // Right Tag Panel (Barcode + SKU)
        barcodeEl({ left: foldX + 1.5, top: 1.8, width: 18.5, height: 7.8 }, '91603450'),
        textEl({ left: foldX + 1.5, top: 10.2, width: 18.5 }, 'SKU: RNG-916-450', smallPt * 0.72, {
          align: 'center',
        }),
      ];
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

  return els.map((el) => clampElementToLabel(el, { widthMm: w, heightMm: h }));
}
