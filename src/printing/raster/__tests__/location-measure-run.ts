/**
 * Host measurement of the location fixture and the border cases.
 * Headless dot-buffer only. The live PNG dry-run is /location-dots on device.
 */
import { rasterizeDocumentToBitmapTimed } from '../skia-rasterizer';
import { TD404_HEADLESS_SKIA_PRINT } from '../td404-headless-flag';
import {
  LOCATION_DPI,
  bakeOffset,
  borderCases,
  classifyLocation,
  createBorderDocument,
  createLocationLabel,
  formatBorderTable,
  formatDeltaTable,
  measureBorderInk,
  measureLocationPage,
  reviewHeader,
  type BorderMeasure,
} from '../location-label';

const { doc, marks } = createLocationLabel();
const timed = rasterizeDocumentToBitmapTimed(doc, LOCATION_DPI, {
  threshold: 160,
  backend: 'dot-buffer',
});
const rows = measureLocationPage(timed.gray, timed.result.widthDots, timed.result.heightDots, doc, marks);
const classification = classifyLocation(rows);

const borders: BorderMeasure[] = [];
for (const c of borderCases()) {
  const borderDoc = createBorderDocument(c);
  const raster = rasterizeDocumentToBitmapTimed(borderDoc, LOCATION_DPI, {
    threshold: 160,
    backend: 'dot-buffer',
  });
  borders.push(
    measureBorderInk(raster.gray, raster.result.widthDots, raster.result.heightDots, {
      ...c,
      widthMm: borderDoc.widthMm,
      heightMm: borderDoc.heightMm,
    }),
  );
}

const flush = borders.find((b) => b.id === 'flush-50');
let calibration = 'flush-50 missing';
if (flush) {
  const flushDoc = createBorderDocument(borderCases()[0]);
  const raster = rasterizeDocumentToBitmapTimed(flushDoc, LOCATION_DPI, {
    threshold: 160,
    backend: 'dot-buffer',
  });
  const neg = bakeOffset(raster.gray, raster.result.widthDots, raster.result.heightDots, -12, 0);
  const shifted = measureBorderInk(neg, raster.result.widthDots, raster.result.heightDots, {
    ...borderCases()[0],
    widthMm: 50,
    heightMm: 30,
  });
  calibration = [
    'stored offsets on this host: h=0 v=0 (no printer store)',
    `zero-offset flush-50 margins L${flush.marginL} R${flush.marginR} T${flush.marginT} B${flush.marginB}`,
    `PNG bake of hOffset -1mm (-12 dots) margins L${shifted.marginL} R${shifted.marginR} T${shifted.marginT} B${shifted.marginB}`,
    'positive hOffset does not change payload margins; it sets BITMAP x',
  ].join('\n');
}

const zero = reviewHeader(50, 30, 0, 0, 2);
const plus = reviewHeader(50, 30, 1, 0.5, 2);
const minus = reviewHeader(50, 30, -1, 0, 2);

const borderSoftware = borders.filter(
  (b) => b.clipped || Math.abs(b.dOuterX0) > 1 || Math.abs(b.dOuterY0) > 1 || Math.abs(b.dOuterX1) > 1 || Math.abs(b.dOuterY1) > 1,
);
const unequalUnexplained = borders.filter((b) => b.marginSpread > 1 && !b.cropExplainsRight);

const lines = [
  `flag TD404_HEADLESS_SKIA_PRINT=${TD404_HEADLESS_SKIA_PRINT}`,
  `headless location ${timed.result.widthDots}x${timed.result.heightDots}`,
  '--- location deltas (d = ink vs rectMmToDots, inkD = ink vs drawer) ---',
  formatDeltaTable(rows),
  `classification: ${classification}`,
  '--- borders ---',
  formatBorderTable(borders),
  '--- calibration shift ---',
  calibration,
  '--- header review (Kotlin literals + createPrintSpec) ---',
  'h=0 v=0',
  ...zero.header,
  zero.negativeMono,
  zero.positiveShift,
  'h=+1mm v=+0.5mm',
  ...plus.header,
  'h=-1mm v=0',
  ...minus.header,
  minus.negativeMono,
  `border outer-edge errors: ${borderSoftware.map((b) => b.id).join(', ') || 'none'}`,
  `unequal margins not explained by pack-down: ${unequalUnexplained.map((b) => b.id).join(', ') || 'none'}`,
];

console.log(lines.join('\n'));

const placementOff = rows.filter((r) => {
  if (r.kind === 'box' || r.kind === 'tick') {
    return [r.dX0, r.dY0, r.dX1, r.dY1].some((d) => d == null || Math.abs(d) > 0);
  }
  if (r.kind === 'text' || r.kind === 'border') {
    return [r.inkDX0, r.inkDY0, r.inkDX1, r.inkDY1].some((d) => d == null || Math.abs(d) > 1);
  }
  if (r.kind === 'cross') {
    return [r.dX0, r.dY0].some((d) => d == null || Math.abs(d) > 1);
  }
  return false;
});
if (placementOff.length || borderSoftware.length || unequalUnexplained.length) {
  console.error(
    `software placement error: ${[...placementOff.map((r) => r.id), ...borderSoftware.map((b) => b.id), ...unequalUnexplained.map((b) => b.id)].join(', ')}`,
  );
  process.exitCode = 1;
} else {
  console.log('no software placement error — rendering unchanged');
}
