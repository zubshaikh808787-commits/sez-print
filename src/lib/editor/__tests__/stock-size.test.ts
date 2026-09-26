import test from 'node:test';
import assert from 'node:assert/strict';

import { repositionDocumentToSize, scaleDocumentToSize } from '@/lib/element-sizing';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { applyDocumentStockSize } from '@/lib/stock-size';

function textEl(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return {
    id,
    type: 'text',
    text: 'Hello',
    left,
    top,
    width,
    height,
    fontSize: 10,
    autoWrapping: 'Word',
    lineSpacing: '1.0',
  } as unknown as LabelElement;
}

function borderEl(width: number, height: number): LabelElement {
  return {
    id: 'border',
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 1,
    left: 0,
    top: 0,
    width,
    height,
    lockMovement: true,
    needPrinting: true,
    rotation: 0,
    drawingColorIndex: 0,
  } as unknown as LabelElement;
}

function doc(widthMm: number, heightMm: number, elements: LabelElement[]): LabelDocument {
  return {
    id: 'd1',
    name: 'Test',
    orientation: 0,
    paperType: 'Label',
    widthMm,
    heightMm,
    elements,
    groupId: null,
    createdAt: 0,
    updatedAt: 0,
  } as LabelDocument;
}

test('keep-as-is moves origins by the relative formula and leaves size fields', () => {
  const source = doc(50, 30, [textEl('t1', 10, 6, 20, 8), borderEl(50, 30)]);
  const next = repositionDocumentToSize(source, 100, 60);
  const text = next.elements.find((el) => el.id === 't1')!;
  const border = next.elements.find((el) => el.id === 'border')!;
  assert.equal(next.widthMm, 100);
  assert.equal(next.heightMm, 60);
  assert.equal(text.left, 20);
  assert.equal(text.top, 12);
  assert.equal(text.width, 20);
  assert.equal(text.height, 8);
  assert.equal((text as { fontSize?: number }).fontSize, 10);
  assert.equal(border.left, 0);
  assert.equal(border.top, 0);
  assert.equal(border.width, 50);
  assert.equal(border.height, 30);
});

test('scale path still pins a full-bleed border to the new stock', () => {
  const source = doc(50, 30, [borderEl(50, 30)]);
  const next = scaleDocumentToSize(source, 80, 20);
  const border = next.elements.find((el) => el.id === 'border')!;
  assert.equal(border.left, 0);
  assert.equal(border.top, 0);
  assert.equal(border.width, 80);
  assert.equal(border.height, 20);
});

test('keep-as-is repositions inactive ups panels', () => {
  const source = doc(40, 20, [textEl('a', 4, 2, 10, 5)]);
  source.ups = {
    columns: 2,
    columnSpacingMm: 0,
    batchEdit: false,
    activeIndex: 0,
    panels: [[textEl('a', 4, 2, 10, 5)], [textEl('b', 8, 4, 10, 5)]],
  };
  const next = repositionDocumentToSize(source, 80, 40);
  assert.equal(next.elements[0].left, 8);
  assert.equal(next.elements[0].top, 4);
  assert.equal(next.ups?.panels[1][0].left, 16);
  assert.equal(next.ups?.panels[1][0].top, 8);
  assert.equal(next.ups?.panels[1][0].width, 10);
});

test('applyDocumentStockSize keep matches repositionDocumentToSize', () => {
  const source = doc(50, 25, [textEl('t1', 5, 5, 12, 6)]);
  const a = applyDocumentStockSize(source, 75, 50, 'keep');
  const b = repositionDocumentToSize(source, 75, 50);
  assert.equal(a.elements[0].left, b.elements[0].left);
  assert.equal(a.elements[0].top, b.elements[0].top);
  assert.equal(a.elements[0].width, 12);
  assert.ok(a.updatedAt >= source.updatedAt);
});
