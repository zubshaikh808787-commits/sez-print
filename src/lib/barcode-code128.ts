/**
 * CODE128 encoder producing module widths for SVG rendering.
 * Uses code set B (printable ASCII) with automatic switch to set C for digit runs.
 */

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** Returns an array of [barWidth, spaceWidth, ...] module counts, or null if unencodable. */
export function encodeCode128(input: string): number[] | null {
  if (!input) return null;
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
  }

  const codes: number[] = [];
  let index = 0;
  let currentSet: 'B' | 'C' | null = null;

  const digitRunLength = (from: number) => {
    let len = 0;
    while (from + len < input.length && input[from + len] >= '0' && input[from + len] <= '9') {
      len += 1;
    }
    return len;
  };

  while (index < input.length) {
    const run = digitRunLength(index);
    const useC =
      run >= 4 || (run >= 2 && index === 0 && run === input.length);

    if (useC) {
      if (currentSet !== 'C') {
        codes.push(currentSet === null ? START_C : CODE_C);
        currentSet = 'C';
      }
      const pairs = Math.floor(run / 2);
      for (let i = 0; i < pairs; i += 1) {
        codes.push(parseInt(input.slice(index, index + 2), 10));
        index += 2;
      }
    } else {
      if (currentSet !== 'B') {
        codes.push(currentSet === null ? START_B : CODE_B);
        currentSet = 'B';
      }
      codes.push(input.charCodeAt(index) - 32);
      index += 1;
    }
  }

  let checksum = codes[0];
  for (let i = 1; i < codes.length; i += 1) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  const modules: number[] = [];
  for (const code of codes) {
    for (const digit of PATTERNS[code]) {
      modules.push(parseInt(digit, 10));
    }
  }
  return modules;
}

export type BarcodeBar = { x: number; width: number };

/** Convert module widths into bar rectangles normalized to total width 1. */
export function code128Bars(input: string): BarcodeBar[] | null {
  const modules = encodeCode128(input);
  if (!modules) return null;
  const total = modules.reduce((sum, m) => sum + m, 0);
  const bars: BarcodeBar[] = [];
  let x = 0;
  for (let i = 0; i < modules.length; i += 1) {
    const width = modules[i] / total;
    if (i % 2 === 0) {
      bars.push({ x, width });
    }
    x += width;
  }
  return bars;
}

const CODE39_MAP: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn',
  $: 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
};

function modulesToBars(modules: number[]): BarcodeBar[] {
  const total = modules.reduce((sum, m) => sum + m, 0);
  const bars: BarcodeBar[] = [];
  let x = 0;
  for (let i = 0; i < modules.length; i += 1) {
    const width = modules[i] / total;
    if (i % 2 === 0) bars.push({ x, width });
    x += width;
  }
  return bars;
}

function encodeCode39(input: string): number[] | null {
  const payload = `*${input.toUpperCase()}*`;
  const modules: number[] = [];
  for (const ch of payload) {
    const pattern = CODE39_MAP[ch];
    if (!pattern) return null;
    if (modules.length) modules.push(1);
    for (const bit of pattern) modules.push(bit === 'w' ? 3 : 1);
  }
  return modules;
}

function encodeItf(input: string): number[] | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 2) return null;
  const padded = digits.length % 2 === 1 ? `0${digits}` : digits;
  const patterns = [
    'nnwwn',
    'wnnnw',
    'nwnnw',
    'wwnnn',
    'nnwnw',
    'wnwnn',
    'nwwnn',
    'nnnww',
    'wnnwn',
    'nwnwn',
  ];
  const modules: number[] = [1, 1, 1, 1];
  for (let i = 0; i < padded.length; i += 2) {
    const a = patterns[Number(padded[i])];
    const b = patterns[Number(padded[i + 1])];
    for (let j = 0; j < 5; j += 1) {
      modules.push(a[j] === 'w' ? 3 : 1);
      modules.push(b[j] === 'w' ? 3 : 1);
    }
  }
  modules.push(3, 1, 1);
  return modules;
}

export const BARCODE_MODES = ['CODE-128', 'CODE-39', 'ITF', 'EAN-13', 'EAN-8', 'UPC-A'] as const;

/** Encode barcode content for the selected mode into normalized bar rectangles. */
export function barcodeBarsForMode(mode: string, input: string): BarcodeBar[] | null {
  const content = input || '0123456789';
  if (mode === 'CODE-39') {
    const modules = encodeCode39(content);
    return modules ? modulesToBars(modules) : null;
  }
  if (mode === 'ITF' || mode === 'EAN-13' || mode === 'EAN-8' || mode === 'UPC-A') {
    const modules = encodeItf(content);
    return modules ? modulesToBars(modules) : null;
  }
  return code128Bars(content);
}

