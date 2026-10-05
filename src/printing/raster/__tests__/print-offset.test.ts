import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import { mmToDots } from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed, shiftGray } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(): LabelDocument {
  return {
    id: 'offset',
    name: 'offset',
    widthMm: 50,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      {
        ...fullBleedBorderElement(50, 30),
        left: 2,
        top: 2,
        width: 46,
        height: 26,
        geometryVersion: 1,
      },
      {
        id: 'bar',
        type: 'shape',
        shapeType: 'rectangle',
        left: 20,
        top: 12,
        width: 10,
        height: 6,
        lineWidth: 0.5,
        fill: true,
        needPrinting: true,
        drawingColorIndex: 0,
      },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

function inkBox(gray: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (gray[y * w + x] >= 160) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function render(shiftMm?: { x: number; y: number }) {
  const t = rasterizeDocumentToBitmapTimed(doc(), dpi, {
    backend: 'dot-buffer',
    bakeTd404Feed: true,
    shiftDots: shiftMm ? { x: mmToDots(shiftMm.x, dpi), y: mmToDots(shiftMm.y, dpi) } : undefined,
  });
  return { gray: t.gray, w: t.result.widthDots, h: t.result.heightDots };
}

const base = render();
const W = base.w;
const H = base.h;
const borderBase = inkBox(base.gray, W, H, 0, 0, W, H);
// The filled shape sits well inside the border; look only at the middle of the label.
const mid = { x0: mmToDots(10, dpi), y0: mmToDots(7, dpi), x1: mmToDots(40, dpi), y1: mmToDots(23, dpi) };
const shapeBase = inkBox(base.gray, W, H, mid.x0, mid.y0, mid.x1, mid.y1);

for (const shift of [
  { x: 1, y: 0.5 },
  { x: -1, y: -0.5 },
  { x: 0.5, y: 1.5 },
]) {
  const out = render(shift);
  const dx = mmToDots(shift.x, dpi);
  const dy = mmToDots(shift.y, dpi);
  const border = inkBox(out.gray, W, H, 0, 0, W, H);
  const shape = inkBox(out.gray, W, H, mid.x0 + dx, mid.y0 + dy, mid.x1 + dx, mid.y1 + dy);
  assert.equal(border.minX - borderBase.minX, dx, `border x moves ${dx} for ${JSON.stringify(shift)}`);
  assert.equal(border.minY - borderBase.minY, dy, `border y moves ${dy} for ${JSON.stringify(shift)}`);
  assert.equal(border.maxX - borderBase.maxX, dx, `border right edge moves ${dx}`);
  assert.equal(border.maxY - borderBase.maxY, dy, `border bottom edge moves ${dy}`);
  assert.equal(shape.minX - shapeBase.minX, dx, `shape x moves with the border`);
  assert.equal(shape.minY - shapeBase.minY, dy, `shape y moves with the border`);
}

// Past the room the border has, ink is cropped rather than wrapped.
const cropped = shiftGray(new Uint8Array([0, 255, 255, 0]), 2, 2, 1, 0);
assert.deepEqual([...cropped], [255, 0, 255, 255]);
assert.equal(shiftGray(base.gray, W, H, 0, 0), base.gray);

console.log('ok print-offset');
