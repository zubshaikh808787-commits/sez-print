import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isQuickEditableType,
  getQuickEditValue,
  getQuickEditPatch,
  getQuickEditTitle,
  getQuickEditPlaceholder,
  QUICK_EDITABLE_TYPES,
} from '../quick-value';
import type { LabelElement } from '../../label-document';

test('isQuickEditableType identifies all 5 required element types', () => {
  assert.equal(isQuickEditableType('text'), true);
  assert.equal(isQuickEditableType('barcode'), true);
  assert.equal(isQuickEditableType('qrcode'), true);
  assert.equal(isQuickEditableType('arctext'), true);
  assert.equal(isQuickEditableType('degrees'), true); // Counter is 'degrees'

  // Non-editable types return false
  assert.equal(isQuickEditableType('line'), false);
  assert.equal(isQuickEditableType('shape'), false);
  assert.equal(isQuickEditableType('table'), false);
  assert.equal(isQuickEditableType('image'), false);
  assert.equal(isQuickEditableType('signature'), false);
  assert.equal(isQuickEditableType('border'), false);
  assert.equal(isQuickEditableType('clipart'), false);
});

test('getQuickEditValue correctly retrieves core value across all 5 types', () => {
  const textEl = { id: '1', type: 'text', text: 'Sample Text' } as unknown as LabelElement;
  assert.equal(getQuickEditValue(textEl), 'Sample Text');

  const barcodeEl = { id: '2', type: 'barcode', content: '9876543210' } as unknown as LabelElement;
  assert.equal(getQuickEditValue(barcodeEl), '9876543210');

  const qrEl = { id: '3', type: 'qrcode', content: 'https://example.com' } as unknown as LabelElement;
  assert.equal(getQuickEditValue(qrEl), 'https://example.com');

  const arcEl = { id: '4', type: 'arctext', text: 'CURVED BANNER' } as unknown as LabelElement;
  assert.equal(getQuickEditValue(arcEl), 'CURVED BANNER');

  const counterEl = { id: '5', type: 'degrees', content: '042' } as unknown as LabelElement;
  assert.equal(getQuickEditValue(counterEl), '042');
});

test('getQuickEditPatch correctly maps updated values to correct schema fields', () => {
  const textEl = { id: '1', type: 'text', text: 'Old' } as unknown as LabelElement;
  assert.deepEqual(getQuickEditPatch(textEl, 'New Text'), { text: 'New Text' });

  const barcodeEl = { id: '2', type: 'barcode', content: '123' } as unknown as LabelElement;
  assert.deepEqual(getQuickEditPatch(barcodeEl, '456789'), { content: '456789' });

  const qrEl = { id: '3', type: 'qrcode', content: 'old.url' } as unknown as LabelElement;
  assert.deepEqual(getQuickEditPatch(qrEl, 'new.url'), { content: 'new.url' });

  const arcEl = { id: '4', type: 'arctext', text: 'OLD ARC' } as unknown as LabelElement;
  assert.deepEqual(getQuickEditPatch(arcEl, 'NEW ARC'), { text: 'NEW ARC' });

  const counterEl = { id: '5', type: 'degrees', content: '001' } as unknown as LabelElement;
  assert.deepEqual(getQuickEditPatch(counterEl, '099'), { content: '099' });
});

test('getQuickEditTitle and placeholder provide clean descriptive labels for all 5 types', () => {
  for (const type of QUICK_EDITABLE_TYPES) {
    const title = getQuickEditTitle(type);
    const placeholder = getQuickEditPlaceholder(type);
    assert.ok(title.length > 0, `Title for ${type} should not be empty`);
    assert.ok(placeholder.length > 0, `Placeholder for ${type} should not be empty`);
  }
});
