import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { createPhase4FrozenDocument } from '@/printing/raster/skia-rasterizer';
import { assertHeadlessRasterDocument } from '@/printing/raster/skia-rasterizer';

function timeEl(id: string, needPrinting: boolean): LabelElement {
  return {
    id,
    type: 'time',
    ...DEFAULT_ELEMENT_STATE,
    needPrinting,
    left: 1,
    top: 1,
    width: 10,
    height: 5,
    fontSize: 8,
  } as unknown as LabelElement;
}

test('frozen fixture is headless-printable', () => {
  assert.doesNotThrow(() => assertHeadlessRasterDocument(createPhase4FrozenDocument()));
});

test('printable time aborts before any buffer is produced', () => {
  const doc = createPhase4FrozenDocument();
  (doc as LabelDocument).elements.push(timeEl('clock', true));
  assert.throws(
    () => assertHeadlessRasterDocument(doc),
    /Unsupported print element type: time/,
  );
});

test('needPrinting=false time still aborts so the rest of the label is not sent', () => {
  const doc = createPhase4FrozenDocument();
  (doc as LabelDocument).elements.push(timeEl('hidden-clock', false));
  assert.throws(
    () => assertHeadlessRasterDocument(doc),
    /Headless TD-404 print aborted; no bytes were sent/,
  );
});
