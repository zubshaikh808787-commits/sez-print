import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCanvasGridLines,
  buildOccludedCanvasGridLines,
  clampGridSpacingMm,
  elementOccluderRectsPx,
  gridSegmentsToPathD,
  GRID_MIN_SPACING_PX,
  rotatedAabbPx,
  shouldRenderCanvasGrid,
} from '@/lib/editor/canvas-grid';
import type { LabelElement } from '@/lib/label-document';

describe('canvas-grid', () => {
  it('clamps spacing to allowed range', () => {
    assert.equal(clampGridSpacingMm(0.1), 0.5);
    assert.equal(clampGridSpacingMm(5), 5);
    assert.equal(clampGridSpacingMm(99), 20);
    assert.equal(clampGridSpacingMm(Number.NaN), 5);
  });

  it('builds uniform lines for a 40x30 mm label at 5 px/mm', () => {
    const lines = buildCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
    });
    assert.ok(lines);
    assert.equal(lines!.vertical.length, 7);
    assert.equal(lines!.horizontal.length, 5);
    assert.deepEqual(lines!.vertical.slice(0, 3), [25, 50, 75]);
    assert.deepEqual(lines!.horizontal.slice(0, 2), [25, 50]);
  });

  it('returns null when spacing is too dense at current zoom', () => {
    assert.equal(shouldRenderCanvasGrid(1, 2), false);
    assert.equal(shouldRenderCanvasGrid(1, GRID_MIN_SPACING_PX), true);
    assert.equal(
      buildCanvasGridLines({
        widthPx: 100,
        heightPx: 80,
        pxPerMM: 2,
        spacingMm: 1,
      }),
      null,
    );
  });

  it('returns null for invalid dimensions', () => {
    assert.equal(
      buildCanvasGridLines({
        widthPx: 0,
        heightPx: 100,
        pxPerMM: 5,
        spacingMm: 5,
      }),
      null,
    );
  });

  it('clips a vertical grid line around a single occluder', () => {
    const lines = buildOccludedCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
      occluders: [{ leftPx: 40, topPx: 50, widthPx: 30, heightPx: 50 }],
    });
    assert.ok(lines);

    const atX25 = lines!.vertical.filter((seg) => seg.x1 === 25);
    assert.equal(atX25.length, 1);
    assert.deepEqual(atX25[0], { x1: 25, y1: 0, x2: 25, y2: 150 });

    const atX50 = lines!.vertical.filter((seg) => seg.x1 === 50);
    assert.equal(atX50.length, 2);
    assert.deepEqual(atX50[0], { x1: 50, y1: 0, x2: 50, y2: 50 });
    assert.deepEqual(atX50[1], { x1: 50, y1: 100, x2: 50, y2: 150 });
  });

  it('clips a horizontal grid line around a single occluder', () => {
    const lines = buildOccludedCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
      occluders: [{ leftPx: 40, topPx: 50, widthPx: 30, heightPx: 50 }],
    });
    assert.ok(lines);

    const atY50 = lines!.horizontal.filter((seg) => seg.y1 === 50);
    assert.equal(atY50.length, 2);
    assert.deepEqual(atY50[0], { x1: 0, y1: 50, x2: 40, y2: 50 });
    assert.deepEqual(atY50[1], { x1: 70, y1: 50, x2: 200, y2: 50 });
  });

  it('merges clipping from multiple occluders on one vertical line', () => {
    const lines = buildOccludedCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
      occluders: [
        { leftPx: 45, topPx: 20, widthPx: 10, heightPx: 40 },
        { leftPx: 45, topPx: 80, widthPx: 10, heightPx: 40 },
      ],
    });
    assert.ok(lines);

    const atX50 = lines!.vertical.filter((seg) => seg.x1 === 50);
    assert.equal(atX50.length, 3);
    assert.deepEqual(atX50[0], { x1: 50, y1: 0, x2: 50, y2: 20 });
    assert.deepEqual(atX50[1], { x1: 50, y1: 60, x2: 50, y2: 80 });
    assert.deepEqual(atX50[2], { x1: 50, y1: 120, x2: 50, y2: 150 });
  });

  it('returns full lines when no occluders are provided', () => {
    const base = buildCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
    });
    const occluded = buildOccludedCanvasGridLines({
      widthPx: 200,
      heightPx: 150,
      pxPerMM: 5,
      spacingMm: 5,
      occluders: [],
    });
    assert.ok(base);
    assert.ok(occluded);
    assert.equal(occluded!.vertical.length, base!.vertical.length);
    assert.equal(occluded!.horizontal.length, base!.horizontal.length);
    assert.deepEqual(occluded!.vertical[0], { x1: 25, y1: 0, x2: 25, y2: 150 });
    assert.deepEqual(occluded!.horizontal[0], { x1: 0, y1: 25, x2: 200, y2: 25 });
  });

  it('expands occluder bounds for rotated elements', () => {
    const unrotated = rotatedAabbPx(10, 10, 20, 10, 0, 5);
    const rotated = rotatedAabbPx(10, 10, 20, 10, 90, 5);
    assert.deepEqual(unrotated, { leftPx: 50, topPx: 50, widthPx: 100, heightPx: 50 });
    assert.deepEqual(rotated, { leftPx: 75, topPx: 25, widthPx: 50, heightPx: 100 });
  });

  it('converts clipped segments into svg path data', () => {
    const path = gridSegmentsToPathD([
      { x1: 25, y1: 0, x2: 25, y2: 50 },
      { x1: 25, y1: 100, x2: 25, y2: 150 },
    ]);
    assert.equal(path, 'M25 0L25 50M25 100L25 150');
  });

  it('omits a suspended element from occluder rects while a gesture is active', () => {
    const elements = [
      {
        id: 'a',
        type: 'text',
        left: 5,
        top: 5,
        width: 20,
        height: 10,
        rotation: 0,
        needPrinting: true,
        visible: true,
      },
      {
        id: 'b',
        type: 'text',
        left: 30,
        top: 5,
        width: 10,
        height: 10,
        rotation: 0,
        needPrinting: true,
        visible: true,
      },
    ] as LabelElement[];

    const occluders = elementOccluderRectsPx(elements, 5, ['a']);
    assert.equal(occluders.length, 1);
    assert.equal(occluders[0]?.leftPx, 150);
  });

  it('builds occluder rects from visible elements only', () => {
    const elements = [
      {
        id: 'a',
        type: 'text',
        left: 5,
        top: 5,
        width: 20,
        height: 10,
        rotation: 0,
        needPrinting: true,
        visible: true,
      },
      {
        id: 'b',
        type: 'text',
        left: 30,
        top: 5,
        width: 20,
        height: 10,
        rotation: 0,
        needPrinting: true,
        visible: false,
      },
    ] as LabelElement[];

    const occluders = elementOccluderRectsPx(elements, 5);
    assert.equal(occluders.length, 1);
    assert.deepEqual(occluders[0], {
      leftPx: 25,
      topPx: 25,
      widthPx: 100,
      heightPx: 50,
    });
  });
});
