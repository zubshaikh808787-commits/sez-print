/**
 * Automated tests for Phase 8: Automatic Shape & Contour Detection.
 */

import {
  detectLabelContour,
  createSyntheticLabelImage,
  generateShapeBoundaryRaster,
  type LabelShapeDefinition,
} from '../contour-detection';
import {
  exportCanvasBoundaryToTspl,
  exportCanvasBoundaryJob,
} from '../canvas-export';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runShapeDetectionTests(): void {
  console.log('--- Phase 8: Automatic Shape & Contour Detection Tests ---');

  // Test 1: Sharp Rectangle detection
  const rectImg = createSyntheticLabelImage('rectangle', 200, 120);
  const rectResult = detectLabelContour(rectImg, 200, 120, { referenceWidthMm: 50 });

  assert(rectResult.type === 'rectangle', `Expected rectangle, got ${rectResult.type}`);
  assert(rectResult.confidence >= 0.9, `Confidence should be >= 0.9, got ${rectResult.confidence}`);
  assert(rectResult.fillRatio >= 0.95, `Fill ratio should be >= 0.95, got ${rectResult.fillRatio}`);
  assert(
    Math.abs(rectResult.aspectRatio - 1.667) < 0.1,
    `Aspect ratio should be ~1.67, got ${rectResult.aspectRatio}`,
  );
  assert(rectResult.suggestedWidthMm === 50, 'Suggested width matches reference');
  console.log('ok sharp rectangle accurately detected with high confidence');

  // Test 2: Rounded Rectangle detection with corner radius estimation
  const roundedImg = createSyntheticLabelImage('roundedRectangle', 200, 120, {
    cornerRadiusPx: 24,
  });
  const roundedResult = detectLabelContour(roundedImg, 200, 120, { referenceWidthMm: 50 });

  assert(
    roundedResult.type === 'roundedRectangle',
    `Expected roundedRectangle, got ${roundedResult.type}`,
  );
  assert(
    roundedResult.confidence >= 0.85,
    `Confidence should be >= 0.85, got ${roundedResult.confidence}`,
  );
  assert(
    roundedResult.cornerRadiusMm !== undefined &&
      roundedResult.cornerRadiusMm >= 4.0 &&
      roundedResult.cornerRadiusMm <= 9.0,
    `Corner radius should be ~6-7mm, got ${roundedResult.cornerRadiusMm}`,
  );
  assert(
    roundedResult.fillRatio >= 0.80 && roundedResult.fillRatio <= 0.98,
    `Rounded rect fill ratio should be 0.80-0.98, got ${roundedResult.fillRatio}`,
  );
  console.log(
    `ok rounded rectangle detected with corner radius ${roundedResult.cornerRadiusMm}mm`,
  );

  // Test 3: Circle detection
  const circleImg = createSyntheticLabelImage('circle', 160, 160);
  const circleResult = detectLabelContour(circleImg, 160, 160, { referenceWidthMm: 40 });

  assert(circleResult.type === 'circle', `Expected circle, got ${circleResult.type}`);
  assert(circleResult.confidence >= 0.9, `Confidence should be >= 0.9, got ${circleResult.confidence}`);
  assert(
    Math.abs(circleResult.aspectRatio - 1.0) <= 0.05,
    `Aspect ratio should be ~1.0, got ${circleResult.aspectRatio}`,
  );
  assert(
    circleResult.fillRatio >= 0.74 && circleResult.fillRatio <= 0.82,
    `Circle fill ratio should be ~pi/4 (0.785), got ${circleResult.fillRatio}`,
  );
  console.log('ok circular label detected with aspect ~1.0 and fill ~0.785');

  // Test 4: Die-cut Barbell Tag detection
  const diecutImg = createSyntheticLabelImage('diecut', 200, 100);
  const diecutResult = detectLabelContour(diecutImg, 200, 100, { referenceWidthMm: 60 });

  assert(diecutResult.type === 'diecut', `Expected diecut, got ${diecutResult.type}`);
  assert(
    diecutResult.confidence >= 0.85,
    `Confidence should be >= 0.85, got ${diecutResult.confidence}`,
  );
  assert(
    diecutResult.polygonPoints !== undefined && diecutResult.polygonPoints.length === 16,
    'Normalized polygon boundary contour points extracted',
  );
  console.log('ok die-cut irregular tag detected with raycasted polygon points');

  // Test 5: Boundary TSPL Generation across Shapes
  // 5A: Rectangle
  const rectShape: LabelShapeDefinition = { type: 'rectangle', widthMm: 50, heightMm: 30 };
  const rectTspl = exportCanvasBoundaryToTspl({
    widthMm: 50,
    heightMm: 30,
    shape: rectShape,
  });
  assert(rectTspl.includes('BOX 0,0,598,359,4'), 'Rectangle boundary exports BOX command');

  // 5B: Circle
  const circleShape: LabelShapeDefinition = { type: 'circle', widthMm: 40, heightMm: 40 };
  const circleTspl = exportCanvasBoundaryToTspl({
    widthMm: 40,
    heightMm: 40,
    shape: circleShape,
  });
  assert(circleTspl.includes('CIRCLE 0,0,479,4'), 'Circle boundary exports CIRCLE command');

  // 5C: Rounded Rectangle Job
  const roundedShape: LabelShapeDefinition = {
    type: 'roundedRectangle',
    widthMm: 50,
    heightMm: 30,
    cornerRadiusMm: 3,
  };
  const roundedJob = exportCanvasBoundaryJob({
    widthMm: 50,
    heightMm: 30,
    shape: roundedShape,
  });
  assert(roundedJob.hasBitmap, 'Rounded rectangle boundary job generates 1bpp raster bitmap');
  assert(roundedJob.totalBytes > 20000, `Payload contains raster bytes (${roundedJob.totalBytes} B)`);
  assert(roundedJob.tsplAscii.includes('BITMAP 0,0,'), 'TSPL includes BITMAP command');

  // 5D: Die-cut Shape Boundary Raster
  const diecutShape: LabelShapeDefinition = {
    type: 'diecut',
    widthMm: 60,
    heightMm: 30,
    polygonPoints: diecutResult.polygonPoints,
  };
  const diecutRaster = generateShapeBoundaryRaster(diecutShape);
  assert(diecutRaster.widthDots === Math.round(60 * (304 / 25.4)), 'Raster width matches mm spec');
  assert(diecutRaster.data.some((b) => b > 0), 'Diecut boundary contains non-zero ink dots');
  console.log('ok TSPL boundary generation verified across rectangle, circle, rounded, and die-cut');

  console.log('=== All Phase 8 Shape Detection Tests Passed! ===\n');
}
