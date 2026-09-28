/**
 * Match BarcodeContent SVG stretch: bar.x * widthPx, then snap each edge to a whole dot.
 * Neighbors are clamped so rounded edges neither overlap nor leave a 0-width bar.
 */

export type StretchBar = { x: number; width: number };

export type RoundedBar = { x0: number; width: number };

export function stretchThenRoundBars(
  bars: StretchBar[],
  originX: number,
  boxW: number,
): RoundedBar[] {
  const w = Math.max(1, boxW);
  const out: RoundedBar[] = [];
  let minNext = Math.round(originX);
  const boxEnd = Math.round(originX + w);
  for (const bar of bars) {
    let left = Math.round(originX + bar.x * w);
    let right = Math.round(originX + (bar.x + bar.width) * w);
    if (left < minNext) left = minNext;
    if (right <= left) right = left + 1;
    if (right > boxEnd) right = boxEnd;
    if (right <= left) continue;
    out.push({ x0: left, width: right - left });
    minNext = right;
  }
  return out;
}

/** Max/min black-run width ratio along one scanline inside a barcode crop. 1 = even modules. */
export function barcodeRunWidthRatio(gray: Uint8Array, width: number, row: number, x0: number, x1: number): {
  minRun: number;
  maxRun: number;
  ratio: number;
  runCount: number;
} {
  const y = Math.max(0, Math.min(Math.floor(row), Math.floor(gray.length / width) - 1));
  const left = Math.max(0, Math.floor(x0));
  const right = Math.min(width, Math.ceil(x1));
  const runs: number[] = [];
  let run = 0;
  let ink = false;
  for (let x = left; x < right; x++) {
    const black = gray[y * width + x] < 160;
    if (black) {
      if (!ink) {
        ink = true;
        run = 1;
      } else {
        run += 1;
      }
    } else if (ink) {
      runs.push(run);
      ink = false;
      run = 0;
    }
  }
  if (ink && run > 0) runs.push(run);
  if (runs.length === 0) return { minRun: 0, maxRun: 0, ratio: 0, runCount: 0 };
  const minRun = Math.min(...runs);
  const maxRun = Math.max(...runs);
  return { minRun, maxRun, ratio: minRun > 0 ? maxRun / minRun : Infinity, runCount: runs.length };
}
