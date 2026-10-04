/**
 * Per-printer border calibration.
 *
 * The design inset is PRINT_BORDER_INSET_MM. A stored scale and offset move
 * layout millimetres once, before the mm→dot rounding:
 *   dot = round((mm * scale + offsetMm) * dotsPerMm)
 * with each edge rounded on its own (width = x1 - x0).
 *
 * BITMAP x,y and REFERENCE stay 0. A negative shift is this same translation.
 * If the outer edge would leave the bitmap, the correction is refused.
 */

import type { LabelElement } from '@/lib/label-document';
import { PRINT_BORDER_INSET_MM } from '@/printing/raster/border-frame';
import { mmToDots, type DotRect } from '@/lib/printer/print-spec';

export type LayoutCalibration = {
  hOffsetMm: number;
  vOffsetMm: number;
  hScale: number;
  vScale: number;
};

export const IDENTITY_LAYOUT_CALIBRATION: LayoutCalibration = {
  hOffsetMm: 0,
  vOffsetMm: 0,
  hScale: 1,
  vScale: 1,
};

export type StoredPrintCalibration = LayoutCalibration & {
  layoutVersion: 2;
  /** Old screens stored these as BITMAP x,y. They are not applied again. */
  retiredBitmapOffset?: { hOffsetMm: number; vOffsetMm: number } | null;
};

export type AxisMeasurement = {
  nearMm: number;
  farMm: number;
  realLabelMm: number;
  configuredLabelMm: number;
};

export type AxisSolution = {
  scale: number;
  /** Intercept in `mm * scale + offsetMm`. */
  offsetMm: number;
  /** (near − far) / 2. Zero when the two margins are equal. */
  marginImbalanceMm: number;
  designedOuterMm: number;
  measuredOuterMm: number;
  predictedNearMm: number;
  predictedFarMm: number;
};

export function solveBorderAxis(
  measured: AxisMeasurement,
  insetMm = PRINT_BORDER_INSET_MM,
): AxisSolution {
  const designedOuterMm = measured.configuredLabelMm - 2 * insetMm;
  const measuredOuterMm = measured.realLabelMm - measured.nearMm - measured.farMm;
  if (!(designedOuterMm > 0) || !(measuredOuterMm > 0)) {
    throw new Error(
      'Border outer size must stay positive. Check the measured margins against the label size.',
    );
  }
  const designNear = insetMm;
  const designFar = measured.configuredLabelMm - insetMm;
  const paperNear = measured.nearMm;
  const paperFar = measured.realLabelMm - measured.farMm;
  const span = designFar - designNear;
  if (!(span > 0)) {
    throw new Error('Configured label is too small for a 2 mm border.');
  }
  // paper = a * design + b, fitted to the two outer edges of this print.
  const a = (paperFar - paperNear) / span;
  if (!(a > 0)) {
    throw new Error('Measured border edges are reversed. Check near and far margins.');
  }
  const b = paperNear - a * designNear;
  const scale = designedOuterMm / measuredOuterMm;
  const offsetMm = -b * scale;
  const predict = (designMm: number) => a * (designMm * scale + offsetMm) + b;
  const predictedNearMm = predict(designNear);
  const predictedFarMm = measured.realLabelMm - predict(designFar);
  return {
    scale,
    offsetMm,
    marginImbalanceMm: (measured.nearMm - measured.farMm) / 2,
    designedOuterMm,
    measuredOuterMm,
    predictedNearMm,
    predictedFarMm,
  };
}

export function layoutMm(mm: number, scale: number, offsetMm: number): number {
  return mm * scale + offsetMm;
}

export function layoutEdgeDots(mm: number, scale: number, offsetMm: number, dpi: number): number {
  return mmToDots(layoutMm(mm, scale, offsetMm), dpi);
}

export function calibratedRectDots(
  leftMm: number,
  topMm: number,
  widthMm: number,
  heightMm: number,
  dpi: number,
  calibration: LayoutCalibration = IDENTITY_LAYOUT_CALIBRATION,
): DotRect {
  const x0 = layoutEdgeDots(leftMm, calibration.hScale, calibration.hOffsetMm, dpi);
  const y0 = layoutEdgeDots(topMm, calibration.vScale, calibration.vOffsetMm, dpi);
  const x1 = layoutEdgeDots(leftMm + widthMm, calibration.hScale, calibration.hOffsetMm, dpi);
  const y1 = layoutEdgeDots(topMm + heightMm, calibration.vScale, calibration.vOffsetMm, dpi);
  return { x0, y0, x1, y1, widthDots: x1 - x0, heightDots: y1 - y0 };
}

/** Full-bleed borders inset by 2 mm in design millimetres. A moved border keeps its own rectangle. */
export function borderOuterDesignMm(
  element: { left: number; top: number; width: number; height: number },
  labelWidthMm: number,
  labelHeightMm: number,
  insetMm = PRINT_BORDER_INSET_MM,
): { left: number; top: number; width: number; height: number } {
  const fullBleed =
    Math.abs(element.left) <= 0.05 &&
    Math.abs(element.top) <= 0.05 &&
    Math.abs(element.width - labelWidthMm) <= 0.05 &&
    Math.abs(element.height - labelHeightMm) <= 0.05;
  if (!fullBleed) {
    return {
      left: element.left,
      top: element.top,
      width: element.width,
      height: element.height,
    };
  }
  return {
    left: insetMm,
    top: insetMm,
    width: Math.max(0.1, labelWidthMm - 2 * insetMm),
    height: Math.max(0.1, labelHeightMm - 2 * insetMm),
  };
}

export function borderOuterDots(
  element: { left: number; top: number; width: number; height: number },
  labelWidthMm: number,
  labelHeightMm: number,
  dpi: number,
  calibration: LayoutCalibration = IDENTITY_LAYOUT_CALIBRATION,
): DotRect {
  const outer = borderOuterDesignMm(element, labelWidthMm, labelHeightMm);
  return calibratedRectDots(outer.left, outer.top, outer.width, outer.height, dpi, calibration);
}

export function borderExceedsBitmap(
  outer: DotRect,
  bitmapWidthDots: number,
  bitmapHeightDots: number,
): string | null {
  if (outer.x0 < 0 || outer.y0 < 0 || outer.x1 > bitmapWidthDots || outer.y1 > bitmapHeightDots) {
    return (
      `This correction puts the border outside the label ` +
      `(${outer.x0},${outer.y0})–(${outer.x1},${outer.y1}) on a ${bitmapWidthDots}×${bitmapHeightDots} bitmap. ` +
      `It was not applied. Nothing was clipped.`
    );
  }
  return null;
}

export type CalibrationMigration = {
  entry: StoredPrintCalibration;
  /** Human-readable note. Empty when the record was already version 2. */
  note: string;
};

/**
 * Older Print-screen steppers stored hOffsetMm/vOffsetMm as BITMAP x,y.
 * Reusing those numbers in the layout would move the border twice.
 * They are reset to 0 / 1 and kept only as retiredBitmapOffset.
 */
export function migrateCalibrationEntry(raw: unknown): CalibrationMigration {
  if (!raw || typeof raw !== 'object') {
    return { entry: { ...IDENTITY_LAYOUT_CALIBRATION, layoutVersion: 2, retiredBitmapOffset: null }, note: '' };
  }
  const record = raw as Partial<StoredPrintCalibration> & { hOffsetMm?: number; vOffsetMm?: number };
  if (record.layoutVersion === 2) {
    return {
      entry: {
        hOffsetMm: finiteOr(record.hOffsetMm, 0),
        vOffsetMm: finiteOr(record.vOffsetMm, 0),
        hScale: finiteOr(record.hScale, 1),
        vScale: finiteOr(record.vScale, 1),
        layoutVersion: 2,
        retiredBitmapOffset: record.retiredBitmapOffset ?? null,
      },
      note: '',
    };
  }
  const retiredH = finiteOr(record.hOffsetMm, 0);
  const retiredV = finiteOr(record.vOffsetMm, 0);
  const hadShift = retiredH !== 0 || retiredV !== 0;
  return {
    entry: {
      ...IDENTITY_LAYOUT_CALIBRATION,
      layoutVersion: 2,
      retiredBitmapOffset: hadShift ? { hOffsetMm: retiredH, vOffsetMm: retiredV } : null,
    },
    note: hadShift
      ? `Reset a previous BITMAP offset of h ${retiredH} mm, v ${retiredV} mm. It is not applied in the layout.`
      : '',
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readLayoutCalibration(raw: unknown): LayoutCalibration {
  return migrateCalibrationEntry(raw).entry;
}

export function fullBleedBorderElement(
  widthMm: number,
  heightMm: number,
): Extract<LabelElement, { type: 'border' }> {
  return {
    id: 'border-check',
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    rotation: 0,
    left: 0,
    top: 0,
    width: widthMm,
    height: heightMm,
    lockMovement: true,
    needPrinting: true,
    drawingColorIndex: 1,
  };
}
