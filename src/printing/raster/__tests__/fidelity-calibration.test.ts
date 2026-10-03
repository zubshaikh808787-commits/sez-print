import assert from 'node:assert/strict';
import test from 'node:test';

import { elementInkLayout } from '@/lib/printer/whole-dot-layout';
import { createFidelityCalibrationLabel } from '@/printing/raster/calibration-label';
import { rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';
import { unpackedHeadlessGray } from '@/printing/raster/parity-diff';
import { inkBoundingBox } from '@/printing/raster/tspl-wire';

test('fidelity label QR ink matches the centred whole-dot layout', () => {
  const { doc } = createFidelityCalibrationLabel();
  const bits = rasterizeDocumentToBitmap(doc, 304, { backend: 'dot-buffer' });
  const gray = unpackedHeadlessGray(bits);
  for (const el of doc.elements) {
    if (el.type !== 'qrcode') continue;
    const layout = elementInkLayout(el, 304);
    const ink = inkBoundingBox(gray, bits.widthDots, bits.heightDots, {
      x: layout.inkDots.x0,
      y: layout.inkDots.y0,
      w: layout.inkDots.widthDots,
      h: layout.inkDots.heightDots,
    });
    assert.ok(ink, el.id);
    assert.equal(ink.x0, layout.inkDots.x0, el.id);
    assert.equal(ink.y0, layout.inkDots.y0, el.id);
    assert.equal(ink.x1, layout.inkDots.x1 - 1, el.id);
    assert.equal(ink.y1, layout.inkDots.y1 - 1, el.id);
  }
  const barcode = doc.elements.find((el) => el.type === 'barcode');
  assert.ok(barcode);
  const layout = elementInkLayout(barcode, 304);
  assert.equal(layout.printedWidthMm, 17);
});
