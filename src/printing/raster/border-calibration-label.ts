import {
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_SHAPE_STATE,
} from '@/components/editor/types';
import { createLabelDocument, mmToPt, type LabelDocument, type LabelElement } from '@/lib/label-document';

const TICK_MM = 0.15;
const REF_STROKE_MM = 0.2;

export type BorderCalibrationMeta = {
  dpi: number;
  gapMm: number;
  hOffsetMm: number;
  vOffsetMm: number;
};

function line(id: string, left: number, top: number, width: number, height: number): LabelElement {
  return { ...DEFAULT_LINE_STATE, id, type: 'line', left, top, width, height };
}

function rect(id: string, left: number, top: number, width: number, height: number, fill = false): LabelElement {
  return {
    ...DEFAULT_SHAPE_STATE,
    id,
    type: 'shape',
    figureShape: 'rectangle',
    fill,
    lineWidth: REF_STROKE_MM,
    left,
    top,
    width,
    height,
  };
}

function text(id: string, value: string, left: number, top: number, width: number, sizeMm: number): LabelElement {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id,
    type: 'text',
    text: value,
    fontSize: mmToPt(sizeMm),
    left,
    top,
    width,
    height: sizeMm * 1.3,
    autoWrapping: 'Close',
    bold: true,
  } as LabelElement;
}

/** Tick every 1 mm along all four edges; every 5 mm is twice as long. */
function rulers(w: number, h: number): LabelElement[] {
  const out: LabelElement[] = [];
  const len = (i: number) => (i % 5 === 0 ? 0.9 : 0.5);
  const half = TICK_MM / 2;
  for (let i = 1; i < w; i++) {
    out.push(line(`tick-t-${i}`, i - half, 0, TICK_MM, len(i)));
    out.push(line(`tick-b-${i}`, i - half, h - len(i), TICK_MM, len(i)));
  }
  for (let i = 1; i < h; i++) {
    out.push(line(`tick-l-${i}`, 0, i - half, len(i), TICK_MM));
    out.push(line(`tick-r-${i}`, w - len(i), i - half, len(i), TICK_MM));
  }
  return out;
}

/** Inward L marks at 1/2/3/5 mm — measurement rulers, not extra full frames. */
function insetRulers(w: number, h: number): LabelElement[] {
  const out: LabelElement[] = [];
  const half = TICK_MM / 2;
  for (const mm of [1, 2, 3, 5]) {
    if (mm * 2 >= w || mm * 2 >= h) continue;
    const arm = Math.min(3, Math.max(1.4, Math.min(w, h) * 0.1));
    out.push(line(`ref-tl-h-${mm}`, mm, mm - half, arm, TICK_MM));
    out.push(line(`ref-tl-v-${mm}`, mm - half, mm, TICK_MM, arm));
    out.push(line(`ref-tr-h-${mm}`, w - mm - arm, mm - half, arm, TICK_MM));
    out.push(line(`ref-tr-v-${mm}`, w - mm - half, mm, TICK_MM, arm));
    out.push(line(`ref-bl-h-${mm}`, mm, h - mm - half, arm, TICK_MM));
    out.push(line(`ref-bl-v-${mm}`, mm - half, h - mm - arm, TICK_MM, arm));
    out.push(line(`ref-br-h-${mm}`, w - mm - arm, h - mm - half, arm, TICK_MM));
    out.push(line(`ref-br-v-${mm}`, w - mm - half, h - mm - arm, TICK_MM, arm));
  }
  return out;
}

/**
 * Border isolation label. One 2 mm border (same draw path as user labels),
 * 1 mm edge rulers, centre cross, corner squares, and "TL" so H/V REFERENCE
 * shift can be measured against the die-cut — not confused with extra frames.
 */
export function buildBorderCalibrationDocument(
  widthMm: number,
  heightMm: number,
  meta: BorderCalibrationMeta,
): LabelDocument {
  const w = widthMm;
  const h = heightMm;
  const half = REF_STROKE_MM / 2;
  const elements: LabelElement[] = [
    {
      id: 'cal-border-2mm',
      type: 'border',
      borderStyle: 'solid-medium',
      lineWidth: 0.55,
      rotation: 0,
      left: 2,
      top: 2,
      width: Math.max(1, w - 4),
      height: Math.max(1, h - 4),
      lockMovement: true,
      needPrinting: true,
      drawingColorIndex: 0,
      geometryVersion: 1,
    },
    line('cal-center-h', 2, h / 2 - half, Math.max(0.5, w - 4), REF_STROKE_MM),
    line('cal-center-v', w / 2 - half, 2, REF_STROKE_MM, Math.max(0.5, h - 4)),
    ...rulers(w, h),
    ...insetRulers(w, h),
  ];
  if (w >= 10 && h >= 10) {
    const c = 0.8;
    elements.push(
      rect('cal-corner-tl', 3.4, 3.4, c, c, true),
      rect('cal-corner-tr', w - 3.4 - c, 3.4, c, c, true),
      rect('cal-corner-bl', 3.4, h - 3.4 - c, c, c, true),
      rect('cal-corner-br', w - 3.4 - c, h - 3.4 - c, c, c, true),
    );
  }
  const glyph = Math.max(1.2, Math.min(2.5, h * 0.12));
  if (w >= 12 && h >= 10) {
    elements.push(text('cal-tl', 'TL', 4.6, 3.3, glyph * 2.4, glyph));
  }
  if (w >= 20 && h >= 14) {
    const metaMm = Math.max(1.2, Math.min(2, h * 0.07));
    elements.push(
      text(
        'cal-meta',
        `${w}x${h} ${meta.dpi}dpi GAP ${meta.gapMm} H${meta.hOffsetMm} V${meta.vOffsetMm}`,
        4.6,
        h - 3.4 - metaMm * 1.4,
        Math.max(4, w - 9.2),
        metaMm,
      ),
    );
  }
  return createLabelDocument({
    name: `Border calibration ${w}x${h}`,
    widthMm: w,
    heightMm: h,
    paperType: 'Label',
    elements,
  });
}
