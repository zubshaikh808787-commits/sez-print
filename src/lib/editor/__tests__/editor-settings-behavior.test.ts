import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { applyPictureAdsorption } from '@/lib/editor/picture-adsorption';
import type { LabelElement } from '@/lib/label-document';

describe('formatDataSourceColumn', () => {
  it('wraps column name in braces by default', () => {
    expect(formatDataSourceColumn('SKU', false)).toBe('{SKU}');
  });

  it('shows bare column name when display is enabled', () => {
    expect(formatDataSourceColumn('SKU', true)).toBe('SKU');
  });
});

describe('applyPictureAdsorption', () => {
  const qr: LabelElement = {
    id: 'qr1',
    type: 'qrcode',
    left: 10,
    top: 10,
    width: 20,
    height: 20,
    rotation: 0,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    drawingColorIndex: 1,
    contentType: 'Manual',
    content: 'hello',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '0',
    codeShape: 'Auto',
    columnNameContent: '',
    degreesOffset: 1,
  } as LabelElement;

  it('centers image on nearby QR code', () => {
    const image: LabelElement = {
      id: 'img1',
      type: 'image',
      left: 18,
      top: 18,
      width: 8,
      height: 8,
      rotation: 0,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
      drawingColorIndex: 0,
      uri: 'file://x',
      contentFit: 'contain',
      aspectRatioLocked: true,
    } as LabelElement;

    const snapped = applyPictureAdsorption(image, [qr], true);
    expect(snapped).not.toBeNull();
    expect(snapped!.left + snapped!.width / 2).toBeCloseTo(20, 1);
    expect(snapped!.top + snapped!.height / 2).toBeCloseTo(20, 1);
  });

  it('does nothing when disabled', () => {
    const image: LabelElement = {
      id: 'img1',
      type: 'image',
      left: 18,
      top: 18,
      width: 8,
      height: 8,
      rotation: 0,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
      drawingColorIndex: 0,
      uri: 'file://x',
      contentFit: 'contain',
      aspectRatioLocked: true,
    } as LabelElement;

    expect(applyPictureAdsorption(image, [qr], false)).toBeNull();
  });
});
