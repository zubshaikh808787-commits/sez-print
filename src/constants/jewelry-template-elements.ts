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
