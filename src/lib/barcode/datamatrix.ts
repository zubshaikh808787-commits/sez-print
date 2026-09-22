/**
 * Authentic ISO/IEC 16022 DataMatrix (ECC 200) Encoder.
 *
 * Implements standard ASCII/numeric encodation, Reed-Solomon error correction,
 * Utah module placement, finder L-patterns, and alternating timing tracks.
 *
 * Output is a 2D boolean array [row][col] where true = dark module, false = light module.
 */

// Galois Field GF(256) with primitive polynomial 0x12D (301): x^8 + x^5 + x^3 + x^2 + 1
const GF_POLY = 0x12d;
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= GF_POLY;
  }
  GF_LOG[0] = 0; // Special case for zero
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Standard ECC 200 Symbol Sizes & Capacities (Rows, Cols, DataCodewords, EccCodewords) */
type DataMatrixSymbolSpec = {
  rows: number;
  cols: number;
  dataCapacity: number;
  eccCount: number;
  blockData: number;
  blockEcc: number;
  regionsR: number;
  regionsC: number;
};

const SYMBOL_SPECS: DataMatrixSymbolSpec[] = [
  { rows: 10, cols: 10, dataCapacity: 3, eccCount: 5, blockData: 3, blockEcc: 5, regionsR: 1, regionsC: 1 },
  { rows: 12, cols: 12, dataCapacity: 5, eccCount: 7, blockData: 5, blockEcc: 7, regionsR: 1, regionsC: 1 },
  { rows: 14, cols: 14, dataCapacity: 8, eccCount: 10, blockData: 8, blockEcc: 10, regionsR: 1, regionsC: 1 },
  { rows: 16, cols: 16, dataCapacity: 12, eccCount: 12, blockData: 12, blockEcc: 12, regionsR: 1, regionsC: 1 },
  { rows: 18, cols: 18, dataCapacity: 18, eccCount: 14, blockData: 18, blockEcc: 14, regionsR: 1, regionsC: 1 },
  { rows: 20, cols: 20, dataCapacity: 22, eccCount: 18, blockData: 22, blockEcc: 18, regionsR: 1, regionsC: 1 },
  { rows: 22, cols: 22, dataCapacity: 30, eccCount: 20, blockData: 30, blockEcc: 20, regionsR: 1, regionsC: 1 },
  { rows: 24, cols: 24, dataCapacity: 36, eccCount: 24, blockData: 36, blockEcc: 24, regionsR: 1, regionsC: 1 },
  { rows: 26, cols: 26, dataCapacity: 44, eccCount: 28, blockData: 44, blockEcc: 28, regionsR: 1, regionsC: 1 },
  { rows: 32, cols: 32, dataCapacity: 62, eccCount: 36, blockData: 62, blockEcc: 36, regionsR: 2, regionsC: 2 },
  { rows: 36, cols: 36, dataCapacity: 86, eccCount: 42, blockData: 86, blockEcc: 42, regionsR: 2, regionsC: 2 },
  { rows: 40, cols: 40, dataCapacity: 114, eccCount: 48, blockData: 114, blockEcc: 48, regionsR: 2, regionsC: 2 },
  { rows: 44, cols: 44, dataCapacity: 144, eccCount: 56, blockData: 144, blockEcc: 56, regionsR: 2, regionsC: 2 },
  { rows: 48, cols: 48, dataCapacity: 174, eccCount: 68, blockData: 174, blockEcc: 68, regionsR: 2, regionsC: 2 },
  // Common Rectangular symbols
  { rows: 8, cols: 18, dataCapacity: 5, eccCount: 7, blockData: 5, blockEcc: 7, regionsR: 1, regionsC: 1 },
  { rows: 8, cols: 32, dataCapacity: 10, eccCount: 11, blockData: 10, blockEcc: 11, regionsR: 1, regionsC: 2 },
  { rows: 12, cols: 26, dataCapacity: 16, eccCount: 14, blockData: 16, blockEcc: 14, regionsR: 1, regionsC: 1 },
  { rows: 12, cols: 36, dataCapacity: 22, eccCount: 18, blockData: 22, blockEcc: 18, regionsR: 1, regionsC: 2 },
  { rows: 16, cols: 36, dataCapacity: 32, eccCount: 24, blockData: 32, blockEcc: 24, regionsR: 1, regionsC: 2 },
  { rows: 16, cols: 48, dataCapacity: 49, eccCount: 28, blockData: 49, blockEcc: 28, regionsR: 1, regionsC: 2 },
];

/** Encodes string into ASCII codewords with 2-digit compaction */
function encodeAscii(text: string): number[] {
  const codewords: number[] = [];
  let i = 0;
  while (i < text.length) {
    const c1 = text.charCodeAt(i);
    const c2 = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;

    // Check if next two chars are digits 00..99
    if (c1 >= 48 && c1 <= 57 && c2 >= 48 && c2 <= 57) {
      const num = (c1 - 48) * 10 + (c2 - 48);
      codewords.push(num + 130);
      i += 2;
    } else if (c1 <= 127) {
      codewords.push(c1 + 1);
      i += 1;
    } else {
      // Extended ASCII (byte unlatch)
      codewords.push(235);
      codewords.push(c1 - 128 + 1);
      i += 1;
    }
  }
  return codewords;
}

/** Pads codewords to target capacity using ISO 253-state pseudo-random algorithm */
function padCodewords(data: number[], capacity: number): number[] {
  const result = [...data];
  if (result.length < capacity) {
    // First pad is 129 (ASCII Unlatch / End of message)
    result.push(129);
    while (result.length < capacity) {
      const pos = result.length + 1;
      const r = ((149 * pos) % 253) + 1;
      const pad = (129 + r) % 254;
      result.push(pad);
    }
  }
  return result;
}

/** Computes Reed-Solomon error correction codewords */
function computeReedSolomon(data: number[], eccLength: number): number[] {
  // Build generator polynomial g(x) = (x - 2^1)(x - 2^2)...(x - 2^eccLength)
  const g = new Uint8Array(eccLength + 1);
  g[0] = 1;
  for (let i = 1; i <= eccLength; i++) {
    const root = GF_EXP[i];
    g[i] = 1;
    for (let j = i - 1; j > 0; j--) {
      g[j] = g[j - 1] ^ gfMul(g[j], root);
    }
    g[0] = gfMul(g[0], root);
  }

  const ecc = new Uint8Array(eccLength);
  for (const byte of data) {
    const factor = byte ^ ecc[eccLength - 1];
    for (let j = eccLength - 1; j > 0; j--) {
      ecc[j] = ecc[j - 1] ^ gfMul(g[j], factor);
    }
    ecc[0] = gfMul(g[0], factor);
  }

  const out: number[] = [];
  for (let i = eccLength - 1; i >= 0; i--) {
    out.push(ecc[i]);
  }
  return out;
}

/**
 * Places codewords into the matrix using the ISO/IEC 16022 Utah algorithm.
 */
function placeCodewords(
  codewords: number[],
  dataRows: number,
  dataCols: number,
): boolean[][] {
  const grid: number[][] = Array.from({ length: dataRows }, () => Array(dataCols).fill(-1));

  let row = 4;
  let col = 0;
  let k = 0;

  function setModule(r: number, c: number, bit: number, val: number) {
    if (r < 0) {
      r += dataRows;
      c += 4 - ((dataRows + 4) % 8);
    }
    if (c < 0) {
      c += dataCols;
      r += 4 - ((dataCols + 4) % 8);
    }
    grid[r][c] = ((val >> (7 - bit)) & 1);
  }

  function placeUtah(r: number, c: number, val: number) {
    setModule(r - 2, c - 2, 0, val);
    setModule(r - 2, c - 1, 1, val);
    setModule(r - 1, c - 2, 2, val);
    setModule(r - 1, c - 1, 3, val);
    setModule(r - 1, c, 4, val);
    setModule(r, c - 2, 5, val);
    setModule(r, c - 1, 6, val);
    setModule(r, c, 7, val);
  }

  while (k < codewords.length && (row < dataRows || col < dataCols)) {
    // Check corner 1
    if (row === dataRows && col === 0) {
      setModule(dataRows - 1, 0, 0, codewords[k]);
      setModule(dataRows - 1, 1, 1, codewords[k]);
      setModule(dataRows - 1, 2, 2, codewords[k]);
      setModule(0, dataCols - 2, 3, codewords[k]);
      setModule(0, dataCols - 1, 4, codewords[k]);
      setModule(1, dataCols - 1, 5, codewords[k]);
      setModule(2, dataCols - 1, 6, codewords[k]);
      setModule(3, dataCols - 1, 7, codewords[k]);
      k++;
    }
    // Check corner 2
    else if (row === dataRows - 2 && col === 0 && dataCols % 4 !== 0) {
      setModule(dataRows - 3, 0, 0, codewords[k]);
      setModule(dataRows - 2, 0, 1, codewords[k]);
      setModule(dataRows - 1, 0, 2, codewords[k]);
      setModule(0, dataCols - 4, 3, codewords[k]);
      setModule(0, dataCols - 3, 4, codewords[k]);
      setModule(0, dataCols - 2, 5, codewords[k]);
      setModule(0, dataCols - 1, 6, codewords[k]);
      setModule(1, dataCols - 1, 7, codewords[k]);
      k++;
    }
    // Check corner 3
    else if (row === dataRows - 2 && col === 0 && dataCols % 8 === 4) {
      setModule(dataRows - 3, 0, 0, codewords[k]);
      setModule(dataRows - 2, 0, 1, codewords[k]);
      setModule(dataRows - 1, 0, 2, codewords[k]);
      setModule(0, dataCols - 2, 3, codewords[k]);
      setModule(0, dataCols - 1, 4, codewords[k]);
      setModule(1, dataCols - 1, 5, codewords[k]);
      setModule(2, dataCols - 1, 6, codewords[k]);
      setModule(3, dataCols - 1, 7, codewords[k]);
      k++;
    }
    // Check corner 4
    else if (row === dataRows + 4 && col === 2 && dataCols % 8 === 0) {
      setModule(dataRows - 1, 0, 0, codewords[k]);
      setModule(dataRows - 1, dataCols - 1, 1, codewords[k]);
      setModule(0, dataCols - 3, 2, codewords[k]);
      setModule(0, dataCols - 2, 3, codewords[k]);
      setModule(0, dataCols - 1, 4, codewords[k]);
      setModule(1, dataCols - 3, 5, codewords[k]);
      setModule(1, dataCols - 2, 6, codewords[k]);
      setModule(1, dataCols - 1, 7, codewords[k]);
      k++;
    }

    // Sweep upward
    while (row >= 0 && col < dataCols) {
      if (row < dataRows && col >= 0 && grid[row][col] === -1) {
        if (k < codewords.length) placeUtah(row, col, codewords[k++]);
      }
      row -= 2;
      col += 2;
    }
    row += 1;
    col += 3;

    // Sweep downward
    while (row < dataRows && col >= 0) {
      if (row >= 0 && col < dataCols && grid[row][col] === -1) {
        if (k < codewords.length) placeUtah(row, col, codewords[k++]);
      }
      row += 2;
      col -= 2;
    }
    row += 3;
    col += 1;
  }

  // Fill unassigned modules with 0
  return grid.map((r) => r.map((c) => c === 1));
}

export type DataMatrixMatrix = {
  rows: number;
  cols: number;
  matrix: boolean[][];
};

/**
 * Encodes text into an ISO/IEC 16022 compliant DataMatrix ECC 200 module matrix.
 *
 * @param content String to encode
 * @param rectangular If true, prefers rectangular symbol sizes when content fits
 */
export function encodeDataMatrix(content: string, rectangular: boolean = false): DataMatrixMatrix | null {
  if (!content) return null;

  const dataCodewords = encodeAscii(content);

  // Find smallest symbol specification that fits dataCodewords
  const candidates = SYMBOL_SPECS.filter((s) => {
    if (rectangular) {
      return s.dataCapacity >= dataCodewords.length;
    }
    return s.rows === s.cols && s.dataCapacity >= dataCodewords.length;
  });

  const spec = candidates[0] || SYMBOL_SPECS[SYMBOL_SPECS.length - 1];
  if (!spec || dataCodewords.length > spec.dataCapacity) return null;

  const paddedData = padCodewords(dataCodewords, spec.dataCapacity);
  const ecc = computeReedSolomon(paddedData, spec.eccCount);
  const allCodewords = [...paddedData, ...ecc];

  // Data region dimensions (excluding finder patterns)
  const regionDataRows = Math.floor(spec.rows / spec.regionsR) - 2;
  const regionDataCols = Math.floor(spec.cols / spec.regionsC) - 2;
  const totalDataRows = regionDataRows * spec.regionsR;
  const totalDataCols = regionDataCols * spec.regionsC;

  const dataGrid = placeCodewords(allCodewords, totalDataRows, totalDataCols);

  // Assemble full matrix with L-finder pattern and alternating clocking track
  const fullMatrix: boolean[][] = Array.from({ length: spec.rows }, () => Array(spec.cols).fill(false));
  const regionR = regionDataRows + 2;
  const regionC = regionDataCols + 2;

  for (let rIdx = 0; rIdx < spec.regionsR; rIdx++) {
    for (let cIdx = 0; cIdx < spec.regionsC; cIdx++) {
      const top = rIdx * regionR;
      const left = cIdx * regionC;

      // Draw alignment patterns for this region
      for (let r = 0; r < regionR; r++) {
        for (let c = 0; c < regionC; c++) {
          const globalR = top + r;
          const globalC = left + c;

          if (r === regionR - 1) {
            // Bottom solid bar (L-finder)
            fullMatrix[globalR][globalC] = true;
          } else if (c === 0) {
            // Left solid bar (L-finder)
            fullMatrix[globalR][globalC] = true;
          } else if (r === 0) {
            // Top alternating clock track (dark at even col, light at odd col; top-right is light in ECC 200)
            fullMatrix[globalR][globalC] = c % 2 === 0;
          } else if (c === regionC - 1) {
            // Right alternating clock track (dark at odd row, light at even row; bottom-right is dark)
            fullMatrix[globalR][globalC] = r % 2 === 1;
          } else {
            // Data cell from placed grid
            const dataR = rIdx * regionDataRows + (r - 1);
            const dataC = cIdx * regionDataCols + (c - 1);
            fullMatrix[globalR][globalC] = dataGrid[dataR][dataC];
          }
        }
      }
    }
  }

  return {
    rows: spec.rows,
    cols: spec.cols,
    matrix: fullMatrix,
  };
}
