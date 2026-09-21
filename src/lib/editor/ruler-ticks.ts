/**
 * Millimetre ruler ticks. Positions are in unzoomed artboard pixels so they
 * stay glued to the page edge; view zoom scales the whole pad together.
 */

export type RulerTickKind = 'minor' | 'mid' | 'major';

export type RulerTick = { mm: number; px: number; kind: RulerTickKind };

export function rulerTickPx(mm: number, lengthMm: number, contentPx: number): number {
  const length = Math.max(lengthMm, 0.01);
  const size = Math.max(contentPx, 1);
  return (mm / length) * size;
}

function tickStepMm(lengthMm: number, sizePx: number) {
  const pxPerMm = sizePx / Math.max(lengthMm, 0.01);
  if (pxPerMm >= 6) return 0.5;
  if (pxPerMm >= 3) return 1;
  if (pxPerMm >= 1.6) return 2;
  return 5;
}

export function rulerTicksFor(lengthMm: number, sizePx: number): RulerTick[] {
  const length = Math.max(lengthMm, 0.01);
  const size = Math.max(sizePx, 1);
  const step = tickStepMm(lengthMm, size);
  const items: RulerTick[] = [];
  for (let mm = 0; mm <= lengthMm + 0.001; mm += step) {
    const px = rulerTickPx(mm, length, size);
    if (px > size + 0.5) break;
    const rounded = Math.round(mm * 100) / 100;
    const isMajor = rounded < 0.001 || Math.abs(rounded % 10) < 0.001;
    const isMid = !isMajor && Math.abs(rounded % 5) < 0.001;
    items.push({
      mm: rounded,
      px,
      kind: isMajor ? 'major' : isMid ? 'mid' : 'minor',
    });
  }
  return items;
}   
