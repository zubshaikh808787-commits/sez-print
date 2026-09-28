/**
 * Host dump-and-diff: headless packed buffer vs editor-parity (flag-off) 600×360.
 * Writes PNGs under fixtures/phase4/parity/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { barcodeRunWidthRatio } from '../barcode-stretch';
import { rasterizeEditorParityReference, frozenFixtureRegions } from '../editor-parity-reference';
import {
  diffHeadlessVsReference,
  grayToRgbaPng,
  overlayRgba,
  unpackedHeadlessGray,
} from '../parity-diff';
import {
  createPhase4FrozenDocument,
  rasterizeDocumentToBitmap,
  rasterizeDocumentToBitmapTimed,
} from '../skia-rasterizer';
import { probeSkiaOffscreen } from '../skia-surface';

const DPI = 304;
const THRESHOLD = 160;
const OUT = path.resolve(process.cwd(), 'fixtures/phase4/parity');

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const doc = createPhase4FrozenDocument();
  const headless = rasterizeDocumentToBitmap(doc, DPI, { threshold: THRESHOLD, backend: 'dot-buffer' });
  const headlessGray = unpackedHeadlessGray(headless);
  const reference = rasterizeEditorParityReference(doc, DPI);
  const report = diffHeadlessVsReference(
    headlessGray,
    reference.gray,
    headless.widthDots,
    headless.heightDots,
    DPI,
    THRESHOLD,
  );

  fs.writeFileSync(path.join(OUT, 'headless.png'), grayToRgbaPng(headlessGray, report.width, report.height));
  fs.writeFileSync(path.join(OUT, 'flag-off-editor.png'), grayToRgbaPng(reference.gray, report.width, report.height));
  fs.writeFileSync(
    path.join(OUT, 'overlay-full.png'),
    overlayRgba(headlessGray, reference.gray, report.width, report.height, THRESHOLD),
  );
  const regions = frozenFixtureRegions(DPI);
  for (const id of ['bars', 'digits', 'border', 'text'] as const) {
    fs.writeFileSync(
      path.join(OUT, `overlay-${id}.png`),
      overlayRgba(headlessGray, reference.gray, report.width, report.height, THRESHOLD, regions[id]),
    );
  }

  const bars = regions.bars;
  const jitter = barcodeRunWidthRatio(
    headlessGray,
    report.width,
    bars.y + Math.floor(bars.h / 2),
    bars.x,
    bars.x + bars.w,
  );

  const skiaProbe = probeSkiaOffscreen();
  let skiaTimed: ReturnType<typeof rasterizeDocumentToBitmapTimed> | null = null;
  let skiaError: string | null = null;
  try {
    skiaTimed = rasterizeDocumentToBitmapTimed(doc, DPI, { threshold: THRESHOLD, backend: 'skia' });
  } catch (err) {
    skiaError = err instanceof Error ? err.message : String(err);
  }
  const dotTimed = rasterizeDocumentToBitmapTimed(doc, DPI, { threshold: THRESHOLD, backend: 'dot-buffer' });

  const json = {
    ...report,
    barcodeRunWidthRatio: jitter,
    skiaProbe,
    backendMs: {
      skia: skiaTimed
        ? {
            backend: skiaTimed.backend,
            rasterizeMs: skiaTimed.rasterizeMs,
            drawMs: skiaTimed.drawMs,
            packMs: skiaTimed.packMs,
            readbackMs: skiaTimed.readbackMs,
            encodeMs: skiaTimed.encodeMs,
          }
        : { error: skiaError },
      dotBuffer: {
        backend: dotTimed.backend,
        rasterizeMs: dotTimed.rasterizeMs,
        drawMs: dotTimed.drawMs,
        packMs: dotTimed.packMs,
        readbackMs: dotTimed.readbackMs,
        encodeMs: dotTimed.encodeMs,
      },
    },
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(json, null, 2));
  console.log(JSON.stringify(json, null, 2));
}

main();
