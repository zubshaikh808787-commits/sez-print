/**
 * Phase 8: Automatic Shape & Contour Detection Engine
 *
 * Capabilities:
 * 1. Analyzes 2D pixel luminance buffers to isolate foreground label stickers from background backing.
 * 2. Classifies label geometry into standard archetypes:
 *    - 'rectangle' (sharp corners, fill ~ 1.0)
 *    - 'roundedRectangle' (rounded corners, estimated radius R)
 *    - 'circle' (aspect ratio ~ 1.0, circular fill ~ pi/4)
 *    - 'ellipse' (aspect ratio != 1.0, elliptical symmetry)
 *    - 'diecut' (irregular concave, barbell, cable flag, or notched tag)
 * 3. Extracts outer bounding box, aspect ratio, corner radius, and normalized polygon contour points.
 * 4. Generates synthetic test label images for deterministic automated testing.
 * 5. Generates 1-bit boundary raster outlines for physical TSPL printing of any shape.
 */

import { DOTS_PER_MM } from './calibration';

export type LabelShapeType =
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'ellipse'
  | 'diecut';

export interface LabelShapeDefinition {
  type: LabelShapeType;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm?: number;
  polygonPoints?: Array<{ x: number; y: number }>; // Normalized 0..1 coordinates
}

export interface DetectedLabelShape {
  type: LabelShapeType;
  confidence: number; // 0.0 to 1.0
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  aspectRatio: number; // width / height
  cornerRadiusMm?: number;
  fillRatio: number;
  suggestedWidthMm: number;
  suggestedHeightMm: number;
  polygonPoints?: Array<{ x: number; y: number }>;
}

export interface ContourDetectOptions {
  referenceWidthMm?: number; // default 50 mm
  thresholdDelta?: number; // luminance difference from background (default 25)
  minFeatureSize?: number; // minimum dimension in px to consider valid
}

/**
 * Detect label contour and geometry from an 8-bit grayscale or 32-bit RGBA pixel buffer.
 */
export function detectLabelContour(
  buffer: Uint8Array,
  widthPx: number,
  heightPx: number,
  options?: ContourDetectOptions,
): DetectedLabelShape {
  const refWidthMm = options?.referenceWidthMm ?? 50;
  const thresholdDelta = options?.thresholdDelta ?? 25;
  const minFeatureSize = options?.minFeatureSize ?? 10;

  const isRgba = buffer.length === widthPx * heightPx * 4;

  // Helper to get luminance 0-255 and alpha 0-255 at (x, y)
  const getPixel = (x: number, y: number): { lum: number; alpha: number } => {
    if (x < 0 || x >= widthPx || y < 0 || y >= heightPx) {
      return { lum: 255, alpha: 255 };
    }
    if (isRgba) {
      const idx = (y * widthPx + x) * 4;
      const r = buffer[idx];
      const g = buffer[idx + 1];
      const b = buffer[idx + 2];
      const a = buffer[idx + 3];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      return { lum, alpha: a };
    } else {
      const idx = y * widthPx + x;
      return { lum: buffer[idx], alpha: 255 };
    }
  };

  // 1. Estimate background color by sampling perimeter corners
  const samplePoints = [
    { x: 2, y: 2 },
    { x: widthPx - 3, y: 2 },
    { x: 2, y: heightPx - 3 },
    { x: widthPx - 3, y: heightPx - 3 },
    { x: Math.floor(widthPx / 2), y: 1 },
    { x: 1, y: Math.floor(heightPx / 2) },
    { x: widthPx - 2, y: Math.floor(heightPx / 2) },
    { x: Math.floor(widthPx / 2), y: heightPx - 2 },
  ];

  let bgLumSum = 0;
  let bgSampleCount = 0;
  for (const pt of samplePoints) {
    const px = getPixel(pt.x, pt.y);
    if (px.alpha >= 128) {
      bgLumSum += px.lum;
      bgSampleCount++;
    }
  }
  const bgLuminance = bgSampleCount > 0 ? bgLumSum / bgSampleCount : 240;

  // 2. Classify foreground mask and compute bounding envelope
  let minX = widthPx;
  let maxX = 0;
  let minY = heightPx;
  let maxY = 0;
  let foregroundCount = 0;

  // 2D mask (1 = foreground, 0 = background)
  const mask = new Uint8Array(widthPx * heightPx);

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const { lum, alpha } = getPixel(x, y);
      const isForeground = alpha < 128 || Math.abs(lum - bgLuminance) >= thresholdDelta;

      if (isForeground) {
        mask[y * widthPx + x] = 1;
        foregroundCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback if no distinct foreground found
  if (foregroundCount < 50 || minX >= maxX || minY >= maxY) {
    return {
      type: 'rectangle',
      confidence: 0.5,
      bounds: { left: 0, top: 0, width: widthPx, height: heightPx },
      aspectRatio: Number((widthPx / heightPx).toFixed(3)),
      fillRatio: 1.0,
      suggestedWidthMm: refWidthMm,
      suggestedHeightMm: Number((refWidthMm / (widthPx / heightPx)).toFixed(2)),
    };
  }

  const boxW = Math.max(minFeatureSize, maxX - minX + 1);
  const boxH = Math.max(minFeatureSize, maxY - minY + 1);
  const boxArea = boxW * boxH;
  const fillRatio = Math.min(1.0, foregroundCount / boxArea);
  const aspectRatio = Number((boxW / boxH).toFixed(3));

  // 3. Corner Void Analysis
  // Evaluate the 4 corners of the bounding box
  const cornerSampleRadius = Math.max(3, Math.min(Math.floor(boxW * 0.2), Math.floor(boxH * 0.2)));

  const countCornerForeground = (startX: number, endX: number, startY: number, endY: number) => {
    let count = 0;
    const total = (endX - startX + 1) * (endY - startY + 1);
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (mask[y * widthPx + x] === 1) count++;
      }
    }
    return count / Math.max(1, total);
  };

  const tlFill = countCornerForeground(
    minX,
    minX + cornerSampleRadius,
    minY,
    minY + cornerSampleRadius,
  );
  const trFill = countCornerForeground(
    maxX - cornerSampleRadius,
    maxX,
    minY,
    minY + cornerSampleRadius,
  );
  const blFill = countCornerForeground(
    minX,
    minX + cornerSampleRadius,
    maxY - cornerSampleRadius,
    maxY,
  );
  const brFill = countCornerForeground(
    maxX - cornerSampleRadius,
    maxX,
    maxY - cornerSampleRadius,
    maxY,
  );

  const avgCornerFill = (tlFill + trFill + blFill + brFill) / 4;
  const cornerVariance =
    Math.max(tlFill, trFill, blFill, brFill) - Math.min(tlFill, trFill, blFill, brFill);

  // 4. Center-waist check (detect necking for barbell or notched die-cut tags)
  const midY = Math.floor((minY + maxY) / 2);
  let midRowFg = 0;
  for (let x = minX; x <= maxX; x++) {
    if (mask[midY * widthPx + x] === 1) midRowFg++;
  }
  const midRowRatio = midRowFg / boxW;

  const midX = Math.floor((minX + maxX) / 2);
  let midColFg = 0;
  for (let y = minY; y <= maxY; y++) {
    if (mask[y * widthPx + midX] === 1) midColFg++;
  }
  const midColRatio = midColFg / boxH;

  // 5. Shape Classification
  let type: LabelShapeType = 'rectangle';
  let confidence = 0.85;
  let estimatedRadiusMm: number | undefined;

  const suggestedWidthMm = refWidthMm;
  const suggestedHeightMm = Number((refWidthMm / aspectRatio).toFixed(2));
  const mmPerPixel = suggestedWidthMm / boxW;

  // Check 5A: Circle vs Ellipse (fill ~ pi/4 ≈ 0.785, low corner fill, symmetric)
  const isCircularFill = fillRatio >= 0.70 && fillRatio <= 0.84 && avgCornerFill <= 0.55;
  if (isCircularFill) {
    if (aspectRatio >= 0.92 && aspectRatio <= 1.08) {
      type = 'circle';
      confidence = 0.95;
    } else {
      type = 'ellipse';
      confidence = 0.9;
    }
  }
  // Check 5B: Die-cut tag (notched waist, high asymmetry, or very low fill ratio)
  else if (midRowRatio < 0.65 || midColRatio < 0.65 || (fillRatio < 0.72 && cornerVariance > 0.25)) {
    type = 'diecut';
    confidence = 0.92;
  }
  // Check 5C: Sharp Rectangle (corners are full, fill >= 0.95)
  else if (avgCornerFill >= 0.92 && fillRatio >= 0.95) {
    type = 'rectangle';
    confidence = 0.98;
  }
  // Check 5D: Rounded Rectangle (corners voided with high symmetry, fill 0.82 - 0.95)
  else if (fillRatio >= 0.80 && avgCornerFill < 0.88 && cornerVariance <= 0.2) {
    type = 'roundedRectangle';
    confidence = 0.92;

    // Corner radius estimation: (4 - pi) * R^2 = missing_area
    const missingArea = Math.max(0, boxArea - foregroundCount);
    const estimatedRadiusPx = Math.sqrt(missingArea / (4 - Math.PI));
    const maxAllowableRadiusPx = Math.min(boxW, boxH) / 2;
    const clampedRadiusPx = Math.min(maxAllowableRadiusPx, Math.max(2, estimatedRadiusPx));
    estimatedRadiusMm = Number((clampedRadiusPx * mmPerPixel).toFixed(1));
  } else {
    // Default to rectangle
    type = 'rectangle';
    confidence = 0.8;
  }

  // 6. Extract normalized polygon points (16 points around boundary)
  const polygonPoints: Array<{ x: number; y: number }> = [];
  const steps = 16;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    // Raycast from center outward
    let dist = 0;
    const maxDist = Math.max(boxW, boxH);
    let edgeX = centerX;
    let edgeY = centerY;

    while (dist < maxDist) {
      const curX = Math.round(centerX + dirX * dist);
      const curY = Math.round(centerY + dirY * dist);
      if (curX < 0 || curX >= widthPx || curY < 0 || curY >= heightPx) break;
      if (mask[curY * widthPx + curX] === 1) {
        edgeX = curX;
        edgeY = curY;
      }
      dist += 1;
    }

    polygonPoints.push({
      x: Number(((edgeX - minX) / boxW).toFixed(3)),
      y: Number(((edgeY - minY) / boxH).toFixed(3)),
    });
  }

  return {
    type,
    confidence,
    bounds: {
      left: minX,
      top: minY,
      width: boxW,
      height: boxH,
    },
    aspectRatio,
    cornerRadiusMm: estimatedRadiusMm,
    fillRatio: Number(fillRatio.toFixed(3)),
    suggestedWidthMm,
    suggestedHeightMm,
    polygonPoints,
  };
}

/**
 * Generate a synthetic 8-bit grayscale image of a given shape on contrasting background.
 * For deterministic automated tests and demo scripts.
 */
export function createSyntheticLabelImage(
  shape: LabelShapeType,
  widthPx: number,
  heightPx: number,
  options?: {
    cornerRadiusPx?: number;
    bgLuminance?: number;
    fgLuminance?: number;
    marginRatio?: number;
  },
): Uint8Array {
  const bg = options?.bgLuminance ?? 245;
  const fg = options?.fgLuminance ?? 20;
  const margin = options?.marginRatio ?? 0.1;

  const data = new Uint8Array(widthPx * heightPx);
  data.fill(bg);

  const innerLeft = Math.round(widthPx * margin);
  const innerTop = Math.round(heightPx * margin);
  const innerWidth = widthPx - innerLeft * 2;
  const innerHeight = heightPx - innerTop * 2;
  const innerRight = innerLeft + innerWidth;
  const innerBottom = innerTop + innerHeight;
  const radius = options?.cornerRadiusPx ?? Math.round(Math.min(innerWidth, innerHeight) * 0.2);

  const cx = innerLeft + innerWidth / 2;
  const cy = innerTop + innerHeight / 2;
  const rx = innerWidth / 2;
  const ry = innerHeight / 2;

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      let inside = false;

      if (shape === 'rectangle') {
        inside = x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom;
      } else if (shape === 'circle' || shape === 'ellipse') {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        inside = dx * dx + dy * dy <= 1.0;
      } else if (shape === 'roundedRectangle') {
        if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) {
          // Check the four rounded corners
          const inCornerTL = x < innerLeft + radius && y < innerTop + radius;
          const inCornerTR = x > innerRight - radius && y < innerTop + radius;
          const inCornerBL = x < innerLeft + radius && y > innerBottom - radius;
          const inCornerBR = x > innerRight - radius && y > innerBottom - radius;

          if (inCornerTL) {
            const dx = x - (innerLeft + radius);
            const dy = y - (innerTop + radius);
            inside = dx * dx + dy * dy <= radius * radius;
          } else if (inCornerTR) {
            const dx = x - (innerRight - radius);
            const dy = y - (innerTop + radius);
            inside = dx * dx + dy * dy <= radius * radius;
          } else if (inCornerBL) {
            const dx = x - (innerLeft + radius);
            const dy = y - (innerBottom - radius);
            inside = dx * dx + dy * dy <= radius * radius;
          } else if (inCornerBR) {
            const dx = x - (innerRight - radius);
            const dy = y - (innerBottom - radius);
            inside = dx * dx + dy * dy <= radius * radius;
          } else {
            inside = true;
          }
        }
      } else if (shape === 'diecut') {
        // Barbell jewelry tag: two circular heads connected by a narrow waist bridge
        const headRadius = Math.min(innerWidth, innerHeight) * 0.35;
        const head1X = innerLeft + headRadius;
        const head2X = innerRight - headRadius;
        const waistHeight = innerHeight * 0.3;

        const inHead1 =
          (x - head1X) * (x - head1X) + (y - cy) * (y - cy) <= headRadius * headRadius;
        const inHead2 =
          (x - head2X) * (x - head2X) + (y - cy) * (y - cy) <= headRadius * headRadius;
        const inWaist =
          x >= head1X &&
          x <= head2X &&
          y >= cy - waistHeight / 2 &&
          y <= cy + waistHeight / 2;

        inside = inHead1 || inHead2 || inWaist;
      }

      if (inside) {
        data[y * widthPx + x] = fg;
      }
    }
  }

  return data;
}

/**
 * Generate a 1-bit monochrome raster buffer containing the outline of any arbitrary shape.
 * Used to print physical non-rectangular boundaries with sub-millimeter precision on TSPL printers.
 */
export function generateShapeBoundaryRaster(
  shape: LabelShapeDefinition,
  options?: {
    thicknessMm?: number;
    dpi?: number;
  },
): {
  data: Uint8Array;
  bytesPerRow: number;
  widthDots: number;
  heightDots: number;
} {
  const thicknessMm = options?.thicknessMm ?? 0.35;
  const widthDots = Math.round(shape.widthMm * DOTS_PER_MM);
  const heightDots = Math.round(shape.heightMm * DOTS_PER_MM);
  const strokeDots = Math.max(1, Math.round(thicknessMm * DOTS_PER_MM));
  const bytesPerRow = Math.ceil(widthDots / 8);

  const data = new Uint8Array(bytesPerRow * heightDots);

  const setDot = (x: number, y: number) => {
    if (x >= 0 && x < widthDots && y >= 0 && y < heightDots) {
      const byteIdx = y * bytesPerRow + Math.floor(x / 8);
      const bitIdx = 7 - (x % 8);
      data[byteIdx] |= 1 << bitIdx;
    }
  };

  const drawStrokeLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let currX = x0;
    let currY = y0;

    while (true) {
      for (let ty = -Math.floor(strokeDots / 2); ty <= Math.floor(strokeDots / 2); ty++) {
        for (let tx = -Math.floor(strokeDots / 2); tx <= Math.floor(strokeDots / 2); tx++) {
          setDot(currX + tx, currY + ty);
        }
      }
      if (currX === x1 && currY === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        currX += sx;
      }
      if (e2 < dx) {
        err += dx;
        currY += sy;
      }
    }
  };

  if (shape.type === 'rectangle') {
    // 4 borders
    drawStrokeLine(0, 0, widthDots - 1, 0);
    drawStrokeLine(widthDots - 1, 0, widthDots - 1, heightDots - 1);
    drawStrokeLine(widthDots - 1, heightDots - 1, 0, heightDots - 1);
    drawStrokeLine(0, heightDots - 1, 0, 0);
  } else if (shape.type === 'circle' || shape.type === 'ellipse') {
    const cx = (widthDots - 1) / 2;
    const cy = (heightDots - 1) / 2;
    const rx = cx - strokeDots;
    const ry = cy - strokeDots;
    const steps = Math.max(36, Math.round(Math.max(rx, ry) * 3));

    let prevX = cx + rx;
    let prevY = cy;
    for (let i = 1; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const x = Math.round(cx + rx * Math.cos(angle));
      const y = Math.round(cy + ry * Math.sin(angle));
      drawStrokeLine(prevX, prevY, x, y);
      prevX = x;
      prevY = y;
    }
  } else if (shape.type === 'roundedRectangle') {
    const rDots = Math.round((shape.cornerRadiusMm ?? 3) * DOTS_PER_MM);
    const maxR = Math.floor(Math.min(widthDots, heightDots) / 2);
    const r = Math.min(maxR, Math.max(2, rDots));

    // Straight edges
    drawStrokeLine(r, 0, widthDots - r, 0);
    drawStrokeLine(widthDots - 1, r, widthDots - 1, heightDots - r);
    drawStrokeLine(widthDots - r, heightDots - 1, r, heightDots - 1);
    drawStrokeLine(0, heightDots - r, 0, r);

    // 4 Corner Arcs
    const drawArc = (arcCx: number, arcCy: number, startAngle: number) => {
      const steps = 12;
      let px = Math.round(arcCx + r * Math.cos(startAngle));
      let py = Math.round(arcCy + r * Math.sin(startAngle));
      for (let i = 1; i <= steps; i++) {
        const theta = startAngle + (i / steps) * (Math.PI / 2);
        const nx = Math.round(arcCx + r * Math.cos(theta));
        const ny = Math.round(arcCy + r * Math.sin(theta));
        drawStrokeLine(px, py, nx, ny);
        px = nx;
        py = ny;
      }
    };

    drawArc(widthDots - r, r, -Math.PI / 2); // TR
    drawArc(widthDots - r, heightDots - r, 0); // BR
    drawArc(r, heightDots - r, Math.PI / 2); // BL
    drawArc(r, r, Math.PI); // TL
  } else {
    // Die-cut polygon points
    const pts = shape.polygonPoints ?? [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    for (let i = 0; i < pts.length; i++) {
      const nextIdx = (i + 1) % pts.length;
      const x0 = Math.round(pts[i].x * (widthDots - 1));
      const y0 = Math.round(pts[i].y * (heightDots - 1));
      const x1 = Math.round(pts[nextIdx].x * (widthDots - 1));
      const y1 = Math.round(pts[nextIdx].y * (heightDots - 1));
      drawStrokeLine(x0, y0, x1, y1);
    }
  }

  return {
    data,
    bytesPerRow,
    widthDots,
    heightDots,
  };
}
