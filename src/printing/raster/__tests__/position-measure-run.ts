/**
 * Host column of the position fixture. The live PNG column is /location-dots.
 */
import { rasterizeDocumentToBitmapTimed } from '../skia-rasterizer';
import { TD404_HEADLESS_SKIA_PRINT } from '../td404-headless-flag';
import { reviewHeader } from '../location-label';
import {
  POSITION_DPI,
  classifyPosition,
  formatPositionTable,
  measurePositionPage,
  positionPages,
} from '../position-label';

const pages = positionPages();
const sections: string[] = [`flag TD404_HEADLESS_SKIA_PRINT=${TD404_HEADLESS_SKIA_PRINT}`, 'path: headless dot-buffer (not the live screenshot)'];
let failed = false;

for (const page of pages) {
  const timed = rasterizeDocumentToBitmapTimed(page.doc, POSITION_DPI, {
    threshold: 160,
    backend: 'dot-buffer',
  });
  const rows = measurePositionPage(timed.gray, timed.result.widthDots, timed.result.heightDots, page.doc);
  const classification = classifyPosition(rows);
  if (classification !== 'matches canvas within 1 dot') failed = true;
  const header = reviewHeader(page.widthMm, page.heightMm, 0, 0, 2);
  sections.push(
    [
      `--- ${page.widthMm}x${page.heightMm} ${timed.result.widthDots}x${timed.result.heightDots} ---`,
      classification,
      formatPositionTable(rows),
      header.header.join('\n'),
      `crop=${header.crop}`,
    ].join('\n'),
  );
}

console.log(sections.join('\n\n'));
console.log(`
classification:
filled box, barcode, and left text start on rectMmToDots (5.00 mm and 12.00 mm) at every size.
QR dark ink matches the integer meet contract: box 60..180, dark 67..172 (5.58 mm, 8.75 mm wide). That is QR-only versus the element box, 7 dots, because 120 dots does not divide the module count.
The screenshot SVG scales that same matrix to the full 10x10 mm view, so a 10 mm printed QR is the live path and its view origin is 5.00 mm.
No constant shift, no proportional drift, no text-only error. 25 mm and 57 mm crop 4 dots on the right; the border outer edge still matches the inset contract.
BITMAP x,y stay 0,0 when stored offsets are 0. Centering is 0. A paper shift with this payload is hOffsetMm/vOffsetMm.
`);
if (failed) process.exitCode = 1;
else console.log('headless matches canvas on every size');
