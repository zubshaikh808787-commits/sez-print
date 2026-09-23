import assert from 'node:assert/strict';
import test from 'node:test';

import { fitNewTextDefaults, fitTextDefaults, NEW_TEXT_PLACEHOLDER } from '@/lib/element-sizing';
import {
  fullyInsideLabelMm,
  labelElementsOverlap,
  labelOverlapRegionMm,
  labelOverlapRegionsMm,
  overlapBannerPositionPx,
  overlapBannerPositionsPx,
} from '@/lib/editor/safe-mode';
import type { LabelElement } from '@/lib/label-document';
import { measureTextWidthMm } from '@/lib/text-metrics';

test('fullyInsideLabelMm pulls a box that hangs off the label back inside', () => {
  const inside = fullyInsideLabelMm(-4, 28, 10, 8, 40, 30);
  assert.equal(inside.left, 0);
  assert.equal(inside.top, 22);
});

test('fullyInsideLabelMm leaves an interior box where it is', () => {
  const inside = fullyInsideLabelMm(4, 6, 10, 8, 40, 30);
  assert.deepEqual(inside, { left: 4, top: 6 });
});

test('labelElementsOverlap detects area overlap and ignores borders and edge contact', () => {
  const text = {
    id: 'a',
    type: 'text',
    text: 'A',
    left: 0,
    top: 0,
    width: 10,
    height: 8,
    fontSize: 10,
    autoTextHeight: false,
  } as unknown as LabelElement;
  const shape = {
    id: 'b',
    type: 'shape',
    left: 8,
    top: 4,
    width: 10,
    height: 8,
  } as unknown as LabelElement;
  const touching = {
    id: 'c',
    type: 'shape',
    left: 10,
    top: 0,
    width: 10,
    height: 8,
  } as unknown as LabelElement;
  const border = {
    id: 'd',
    type: 'border',
    left: 0,
    top: 0,
    width: 40,
    height: 30,
  } as unknown as LabelElement;

  assert.equal(labelElementsOverlap([text, shape]), true);
  assert.equal(labelElementsOverlap([text, touching]), false);
  assert.equal(labelElementsOverlap([text, border]), false);

  const region = labelOverlapRegionMm([text, shape]);
  assert.deepEqual(region, { left: 8, top: 4, width: 2, height: 4 });

  const placement = overlapBannerPositionPx(region!, 4, 160, 120, 28);
  assert.equal(placement.left, 32);
  assert.equal(placement.top, 38);
});

test('labelOverlapRegionsMm keeps separate warnings for distant overlap piles', () => {
  const leftPair = {
    id: 'a',
    type: 'text',
    text: 'A',
    left: 0,
    top: 0,
    width: 10,
    height: 8,
    fontSize: 10,
    autoTextHeight: false,
  } as unknown as LabelElement;
  const leftOverlap = {
    id: 'b',
    type: 'shape',
    left: 8,
    top: 4,
    width: 10,
    height: 8,
  } as unknown as LabelElement;
  const rightPair = {
    id: 'c',
    type: 'text',
    text: 'C',
    left: 30,
    top: 20,
    width: 10,
    height: 8,
    fontSize: 10,
    autoTextHeight: false,
  } as unknown as LabelElement;
  const rightOverlap = {
    id: 'd',
    type: 'shape',
    left: 36,
    top: 22,
    width: 10,
    height: 8,
  } as unknown as LabelElement;

  const regions = labelOverlapRegionsMm([leftPair, leftOverlap, rightPair, rightOverlap]);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions[0], { left: 8, top: 4, width: 2, height: 4 });
  assert.deepEqual(regions[1], { left: 36, top: 22, width: 4, height: 6 });

  const placements = overlapBannerPositionsPx(regions, 4, 320, 240, 28);
  assert.equal(placements.length, 2);
  assert.notDeepEqual(placements[0], placements[1]);
});

test('new text box is only as wide as the placeholder line', () => {
  const wide = fitTextDefaults(80, 30, []);
  const fitted = fitNewTextDefaults(80, 30, []);
  assert.equal(NEW_TEXT_PLACEHOLDER, 'Double tap to add text');
  assert.ok(fitted.width < wide.width);
  assert.ok(fitted.width <= measureTextWidthMm(NEW_TEXT_PLACEHOLDER, fitted.fontSize) + 1.6);
  assert.equal(fitted.fontSize, wide.fontSize);
});
