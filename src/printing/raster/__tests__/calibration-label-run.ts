import { TD404_HEADLESS_SKIA_PRINT } from '../td404-headless-flag';
import { rasterizeDocumentToBitmapTimed } from '../skia-rasterizer';
import {
  CALIBRATION_DPI,
  assertCalibrationPage,
  createCalibrationLabel,
  dullnessReport,
  formatAssertions,
  formatDullness,
} from '../calibration-label';

const { doc, regions } = createCalibrationLabel();
const timed = rasterizeDocumentToBitmapTimed(doc, CALIBRATION_DPI, {
  threshold: 160,
  backend: 'dot-buffer',
});
const result = assertCalibrationPage(
  timed.gray,
  timed.result.widthDots,
  timed.result.heightDots,
  regions,
);
const dull = dullnessReport(doc, regions);

console.log(`page ${timed.result.widthDots}x${timed.result.heightDots}`);
console.log(formatAssertions(result));
console.log('--- dullness (report only, density unchanged) ---');
console.log(formatDullness(dull));
console.log(`TD404_HEADLESS_SKIA_PRINT=${TD404_HEADLESS_SKIA_PRINT}`);
if (!result.ok) {
  process.exitCode = 1;
}
