import assert from 'node:assert/strict';
import { BORDER_LIBRARY, borderStyleStrokeMm, resolveBorderStyle } from '@/constants/border-library';
import { mmToDots } from '@/lib/printer/print-spec';
import { fillRect, makeDotSurface, strokeRect, type DotSurface } from '@/printing/raster/dot-surface';
import { drawPrintBorder } from '@/printing/raster/print-border';
import { styledBorderBands, type BorderShape } from '@/printing/raster/border-shapes';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';

const dpi = 304;

function paint(widthMm: number, heightMm: number, style: string, mediaShape?: string, bakeFeed = true): DotSurface {
  const w = Math.floor(mmToDots(widthMm, dpi) / 8) * 8;
  const h = mmToDots(heightMm, dpi);
  const surface = makeDotSurface(w, h);
  drawPrintBorder(
    {
      fillRect: (x, y, bw, bh, g) => fillRect(surface, x, y, bw, bh, g),
      strokeRect: (x, y, bw, bh, s, g) => strokeRect(surface, x, y, bw, bh, s, g),
    },
    {
      ...fullBleedBorderElement(widthMm, heightMm),
      left: 2,
      top: 2,
      width: widthMm - 4,
      height: heightMm - 4,
      geometryVersion: 1,
      borderStyle: resolveBorderStyle(style),
      lineWidth: borderStyleStrokeMm(style),
    },
    dpi,
    1,
    { bitmapWidthDots: w, bitmapHeightDots: h, bakeFeed, mediaShape },
  );
  return surface;
}

function inked(s: DotSurface, x: number, y: number) {
  return s.gray[Math.round(y) * s.width + Math.round(x)] === 0;
}

function inkCount(s: DotSurface) {
  let n = 0;
  for (const v of s.gray) if (v === 0) n++;
  return n;
}

function inkBox(s: DotSurface) {
  let x0 = s.width;
  let y0 = s.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (s.gray[y * s.width + x] !== 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

// Circle labels print a ring: no ink in the corners, ink at the top and left of the ring.
for (const style of ['solid-medium', 'dashed', 'double', 'corner-brackets', 'caution-stripes']) {
  const ring = paint(40, 40, style, 'circle');
  const box = inkBox(ring);
  assert.ok(box.x1 > box.x0, `circle ${style} has ink`);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const corner = mmToDots(4, dpi);
  assert.ok(!inked(ring, box.x0 + corner / 2, box.y0 + corner / 2), `circle ${style} top-left corner is blank`);
  assert.ok(!inked(ring, box.x1 - corner / 2, box.y1 - corner / 2), `circle ${style} bottom-right corner is blank`);
  assert.ok(!inked(ring, cx, cy), `circle ${style} centre is blank`);
  if (style === 'solid-medium' || style === 'double' || style === 'corner-brackets') {
    assert.ok(inked(ring, cx, box.y0 + 1), `circle ${style} top of ring inked`);
    assert.ok(inked(ring, box.x0 + 1, cy), `circle ${style} left of ring inked`);
  }
}

// Ring stays inside the TD-404 border box.
const rect = inkBox(paint(40, 40, 'solid-medium'));
const circle = inkBox(paint(40, 40, 'solid-medium', 'circle'));
assert.ok(circle.x0 >= rect.x0 && circle.x1 <= rect.x1 && circle.y0 >= rect.y0 && circle.y1 <= rect.y1, 'circle inside rect box');

// Ellipse labels follow the full box.
const oval = paint(60, 30, 'solid-medium', 'ellipse');
const ovalBox = inkBox(oval);
const rectBox = inkBox(paint(60, 30, 'solid-medium'));
assert.ok(Math.abs(ovalBox.x0 - rectBox.x0) <= 1 && Math.abs(ovalBox.x1 - rectBox.x1) <= 1, 'ellipse spans width');
assert.ok(!inked(oval, ovalBox.x0 + 2, ovalBox.y0 + 2), 'ellipse corner blank');

// Rectangle labels: every style prints ink and the plain solids get thicker.
const counts = new Map<string, number>();
for (const item of BORDER_LIBRARY) {
  const s = paint(50, 30, item.id);
  counts.set(item.id, inkCount(s));
  assert.ok(counts.get(item.id)! > 0, `${item.id} prints ink`);
}
assert.ok(counts.get('solid-thin')! < counts.get('solid-medium')!, 'thin < medium');
assert.ok(counts.get('solid-medium')! < counts.get('solid-thick')!, 'medium < thick');

// Rounded styles leave the corner pixel blank; plain solid fills it.
for (const style of ['rounded', 'pill-shape']) {
  const s = paint(50, 30, style);
  const box = inkBox(s);
  assert.ok(!inked(s, box.x0, box.y0), `${style} corner is rounded`);
  assert.ok(inked(s, (box.x0 + box.x1) / 2, box.y0), `${style} top edge inked`);
}
const solid = paint(50, 30, 'solid-medium');
const solidBox = inkBox(solid);
assert.ok(inked(solid, solidBox.x0, solidBox.y0), 'solid corner is square');

// Corner brackets and crosshair leave the middle of each edge blank.
for (const style of ['corner-brackets', 'crosshair']) {
  const s = paint(50, 30, style);
  const box = inkBox(s);
  assert.ok(!inked(s, (box.x0 + box.x1) / 2, box.y0), `${style} top middle blank`);
}

// Dashed has gaps along the top edge.
const dashed = paint(50, 30, 'dashed');
const dBox = inkBox(dashed);
let gaps = 0;
for (let x = dBox.x0; x <= dBox.x1; x++) if (!inked(dashed, x, dBox.y0)) gaps++;
assert.ok(gaps > 20, `dashed has gaps (${gaps})`);

// Retired styles fall back to what printed before.
assert.equal(resolveBorderStyle('label-frame'), 'double');
assert.equal(resolveBorderStyle('ornate'), 'solid-medium');
assert.equal(resolveBorderStyle(undefined), 'solid-medium');

// Bands stay inside the region for every shape and style.
for (const shape of ['rect', 'circle', 'ellipse'] as BorderShape[]) {
  for (const item of BORDER_LIBRARY) {
    const bands = styledBorderBands({
      x: 10,
      y: 20,
      w: 300,
      h: 200,
      unitsPerMm: 12,
      stroke: 7,
      style: item.id,
      shape,
    });
    for (const b of bands) {
      assert.ok(
        b.left >= 10 && b.top >= 20 && b.left + b.width <= 310 && b.top + b.height <= 220,
        `${shape} ${item.id} band out of region ${JSON.stringify(b)}`,
      );
    }
  }
}

console.log('ok border-shapes');
