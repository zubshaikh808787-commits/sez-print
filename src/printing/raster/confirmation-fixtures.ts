/**
 * Confirmation-run label fixtures. Not used by the rasterizer default path.
 */

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { createLabelDocument, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { createPhase4FrozenDocument } from './skia-rasterizer';

export const CONFIRMATION_FIXTURE_IDS = [
  'baseline-50x30',
  'text-heavy',
  'dense',
  'minimal',
  'barcode-small',
] as const;

export type ConfirmationFixtureId = (typeof CONFIRMATION_FIXTURE_IDS)[number];

export type SymbolCrop = {
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  payload: string;
};

export type ConfirmationFixture = {
  id: ConfirmationFixtureId;
  document: LabelDocument;
  code128?: SymbolCrop;
  qr?: SymbolCrop;
};

function textEl(
  id: string,
  text: string,
  left: number,
  top: number,
  width: number,
  height: number,
  fontSize = 8,
): LabelElement {
  return {
    id,
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text,
    fontSize,
    left,
    top,
    width,
    height,
    align: 'left',
    autoWrapping: 'Word',
    fontFamily: 'Default',
    needPrinting: true,
  };
}

function rectEl(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
  fill: boolean,
): LabelElement {
  return {
    id,
    type: 'shape',
    ...DEFAULT_SHAPE_STATE,
    figureShape: 'rectangle',
    fill,
    lineWidth: 0.3,
    left,
    top,
    width,
    height,
    needPrinting: true,
  };
}

function barcodeEl(
  id: string,
  content: string,
  left: number,
  top: number,
  width: number,
  height: number,
): LabelElement {
  return {
    id,
    type: 'barcode',
    ...DEFAULT_BARCODE_STATE,
    content,
    encodeMode: 'CODE-128',
    textFlag: 'Bottom',
    left,
    top,
    width,
    height,
    needPrinting: true,
  };
}

function qrEl(
  id: string,
  content: string,
  left: number,
  top: number,
  width: number,
  height: number,
): LabelElement {
  return {
    id,
    type: 'qrcode',
    ...DEFAULT_QRCODE_STATE,
    content,
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '1' as typeof DEFAULT_QRCODE_STATE.zoneSize,
    left,
    top,
    width,
    height,
    needPrinting: true,
  };
}

function makeTextHeavy(): LabelDocument {
  const paragraph =
    'Packed shipping line SKU-4419 qty 24 lot A19 warehouse B aisle 12 bin 07 ' +
    'handle with care do not stack above 1.2 m keep dry lot-trace required';
  const elements: LabelElement[] = [];
  let top = 1.5;
  for (let i = 0; i < 6; i++) {
    elements.push(textEl(`th-text-${i}`, `${i + 1}. ${paragraph}`, 2, top, 46, 4.4, 7));
    top += 4.6;
  }
  return createLabelDocument({
    name: 'text-heavy 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements,
  });
}

function makeDense(): LabelDocument {
  const elements: LabelElement[] = [
    rectEl('dense-border', 1, 1, 48, 28, false),
    textEl('dense-title', 'DENSE PACK 50x30 MIXED MARKS', 2.5, 2, 45, 3.5, 8),
  ];
  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      elements.push(rectEl(`dense-mark-${n}`, 2.2 + col * 5.8, 6.2 + row * 2.4, 4.4, 1.6, true));
      n += 1;
    }
  }
  elements.push(
    barcodeEl('dense-barcode', 'BASELINE50X30', 3, 14.5, 26, 10),
    qrEl('dense-qr', 'https://sez.print/baseline', 32, 14.5, 14, 14),
  );
  return createLabelDocument({
    name: 'dense 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements,
  });
}

function makeMinimal(): LabelDocument {
  return createLabelDocument({
    name: 'minimal 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [rectEl('min-mark', 22, 12, 6, 6, true)],
  });
}

function makeBarcodeSmall(): LabelDocument {
  return createLabelDocument({
    name: 'barcode-small 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [
      barcodeEl('bs-barcode', 'BASELINE50X30', 3, 8, 22, 9),
      qrEl('bs-qr', 'https://sez.print/baseline', 28, 6, 18, 18),
    ],
  });
}

export const CONFIRMATION_FIXTURES: ConfirmationFixture[] = [
  {
    id: 'baseline-50x30',
    document: createPhase4FrozenDocument(),
    code128: { xMm: 3, yMm: 12, wMm: 28, hMm: 10, payload: 'BASELINE50X30' },
    qr: { xMm: 34, yMm: 12, wMm: 13, hMm: 13, payload: 'https://sez.print/baseline' },
  },
  { id: 'text-heavy', document: makeTextHeavy() },
  {
    id: 'dense',
    document: makeDense(),
    code128: { xMm: 3, yMm: 14.5, wMm: 26, hMm: 8, payload: 'BASELINE50X30' },
    qr: { xMm: 32, yMm: 14.5, wMm: 14, hMm: 14, payload: 'https://sez.print/baseline' },
  },
  { id: 'minimal', document: makeMinimal() },
  {
    id: 'barcode-small',
    document: makeBarcodeSmall(),
    code128: { xMm: 3, yMm: 8, wMm: 22, hMm: 7, payload: 'BASELINE50X30' },
    qr: { xMm: 28, yMm: 6, wMm: 18, hMm: 18, payload: 'https://sez.print/baseline' },
  },
];

export function fixtureById(id: ConfirmationFixtureId): ConfirmationFixture {
  const found = CONFIRMATION_FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown confirmation fixture ${id}`);
  return found;
}
