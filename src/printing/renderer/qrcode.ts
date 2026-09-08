/**
 * Crisp QR code renderer for printer output.
 * Renders QR modules as exact black/white squares — no anti-aliasing.
 * Uses a minimal QR encoder so the universal renderer stays SDK-free.
 */

import type { GrayBitmap } from '@/printing/document/types';
import { fillRect } from '@/printing/raster/bitmap';

/**
 * Draw a QR code for `payload` into `dest` at the given dot rectangle.
 * Each module is rendered as a sharp integer-sized square.
 */
export function drawQrCode(
  dest: GrayBitmap,
  payload: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!payload || w <= 0 || h <= 0) return;

  const matrix = generateQrMatrix(payload);
  if (!matrix || matrix.size === 0) return;

  const size = Math.min(w, h);
  const moduleSize = Math.max(1, Math.floor(size / matrix.size));
  const totalSize = moduleSize * matrix.size;

  // Center the QR code in the box
  const ox = x + Math.floor((w - totalSize) / 2);
  const oy = y + Math.floor((h - totalSize) / 2);

  // White background for quiet zone
  fillRect(dest, x, y, w, h, 255);

  // Draw modules
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.data[row * matrix.size + col]) {
        fillRect(
          dest,
          ox + col * moduleSize,
          oy + row * moduleSize,
          moduleSize,
          moduleSize,
          0,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal QR Code encoder — byte mode, error correction L
// ---------------------------------------------------------------------------

type QrMatrix = { size: number; data: Uint8Array };

function generateQrMatrix(text: string): QrMatrix | null {
  const data = encodeUtf8(text);
  const version = selectVersion(data.length);
  if (version < 1) return null;

  const size = 17 + version * 4;
  const modules = new Uint8Array(size * size);
  const reserved = new Uint8Array(size * size);

  placeFunctionPatterns(modules, reserved, size, version);

  const bits = encodeDataBits(data, version);
  const ecBits = addErrorCorrection(bits, version);
  placeDataBits(modules, reserved, size, ecBits);

  applyBestMask(modules, reserved, size);

  return { size, data: modules };
}

// UTF-8 encoding
function encodeUtf8(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        c = ((c - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

// Data capacity for byte mode, EC level L (versions 1–40)
const DATA_CAPACITY_L: number[] = [
  0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271,
  321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732,
  1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953,
];

function selectVersion(byteCount: number): number {
  for (let v = 1; v <= 40; v++) {
    if (DATA_CAPACITY_L[v] >= byteCount) return v;
  }
  return -1;
}

// EC codewords for Level L
const EC_CODEWORDS_L: number[] = [
  0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
  20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
  28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
];

// Number of EC blocks for Level L
const EC_BLOCKS_L: number[] = [
  0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
  4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
  8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
  16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
];

// Total data codewords per version
function totalDataCodewords(version: number): number {
  const size = 17 + version * 4;
  const totalModules = size * size;
  // Function pattern modules (approximate — exact for common versions)
  const funcModules = functionPatternModules(version, size);
  const availableBits = totalModules - funcModules;
  const totalCodewords = Math.floor(availableBits / 8);
  const ecTotal = EC_CODEWORDS_L[version] * EC_BLOCKS_L[version];
  return totalCodewords - ecTotal;
}

function functionPatternModules(version: number, size: number): number {
  // 3 finder patterns (8×8 each with separators)
  let count = 3 * 64 + 3 * 15; // finder + separators
  // Timing patterns
  count += 2 * (size - 16);
  // Format info (15 bits × 2 copies)
  count += 31;
  if (version >= 7) count += 36; // version info
  // Alignment patterns
  const alignPos = getAlignmentPositions(version);
  const alignCount = alignPos.length * alignPos.length;
  // Subtract 3 overlapping with finder patterns
  const overlap = version >= 2 ? 3 : 0;
  count += (alignCount - overlap) * 25;
  return count;
}

function encodeDataBits(data: Uint8Array, version: number): Uint8Array {
  const totalCw = totalDataCodewords(version);
  const bits: number[] = [];

  // Mode indicator: byte mode = 0100
  pushBits(bits, 0b0100, 4);

  // Character count
  const ccBits = version <= 9 ? 8 : 16;
  pushBits(bits, data.length, ccBits);

  // Data
  for (const b of data) pushBits(bits, b, 8);

  // Terminator (up to 4 zeros)
  const rem = totalCw * 8 - bits.length;
  pushBits(bits, 0, Math.min(4, rem));

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bits.length < totalCw * 8) {
    pushBits(bits, padBytes[pi % 2], 8);
    pi++;
  }

  const codewords = new Uint8Array(totalCw);
  for (let i = 0; i < totalCw; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i * 8 + b] ?? 0);
    codewords[i] = byte;
  }
  return codewords;
}

function pushBits(arr: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) arr.push((value >> i) & 1);
}

// Reed-Solomon error correction (GF(256) with 0x11d)
function addErrorCorrection(data: Uint8Array, version: number): Uint8Array {
  const ecPerBlock = EC_CODEWORDS_L[version];
  const numBlocks = EC_BLOCKS_L[version];
  const totalCw = data.length;
  const dataPerBlock = Math.floor(totalCw / numBlocks);
  const extraBlocks = totalCw % numBlocks;

  const gen = rsGeneratorPoly(ecPerBlock);
  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const blockLen = dataPerBlock + (b >= numBlocks - extraBlocks ? 1 : 0);
    const block = data.slice(offset, offset + blockLen);
    offset += blockLen;
    blocks.push(block);
    ecBlocks.push(rsEncode(block, gen, ecPerBlock));
  }

  // Interleave
  const result: number[] = [];
  const maxDataLen = dataPerBlock + (extraBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecBlocks) result.push(ec[i]);
  }

  return new Uint8Array(result);
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF_EXP[i];
    for (let j = gen.length - 1; j >= 0; j--) {
      next[j + 1] ^= gen[j];
      next[j] ^= gfMul(gen[j], root);
    }
    gen = next;
  }
  return gen;
}

function rsEncode(data: Uint8Array, gen: Uint8Array, ecLen: number): Uint8Array {
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buf[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return buf.slice(data.length);
}

// Alignment pattern positions
function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = 17 + version * 4;
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((size - 13) / (count - 1));
  const positions = [6];
  for (let i = 1; i < count; i++) {
    positions.push(size - 7 - (count - 1 - i) * step);
  }
  // Re-sort and ensure first is 6, last is size - 7
  positions.sort((a, b) => a - b);
  if (positions[positions.length - 1] !== size - 7) {
    positions[positions.length - 1] = size - 7;
  }
  return positions;
}

function placeFunctionPatterns(
  modules: Uint8Array,
  reserved: Uint8Array,
  size: number,
  version: number,
): void {
  const set = (r: number, c: number, value: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r * size + c] = value;
      reserved[r * size + c] = 1;
    }
  };

  // Finder patterns
  const placeFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter =
          dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inMiddle = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(r, c, inOuter || inMiddle ? 1 : 0);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Separators (white) — already set by finder placing -1 to 7

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    set(6, i, v);
    set(i, 6, v);
  }

  // Dark module
  set(size - 8, 8, 1);

  // Alignment patterns
  const alignPos = getAlignmentPositions(version);
  for (const row of alignPos) {
    for (const col of alignPos) {
      // Skip if overlapping finder pattern
      if (row <= 8 && col <= 8) continue;
      if (row <= 8 && col >= size - 8) continue;
      if (row >= size - 8 && col <= 8) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const v =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0;
          set(row + dr, col + dc, v);
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    reserved[8 * size + i] = 1;
    reserved[i * size + 8] = 1;
    reserved[8 * size + (size - 1 - i)] = 1;
    reserved[(size - 1 - i) * size + 8] = 1;
  }
  reserved[8 * size + 8] = 1;

  // Version info areas
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[(size - 11 + j) * size + i] = 1;
        reserved[i * size + (size - 11 + j)] = 1;
      }
    }
  }
}

function placeDataBits(
  modules: Uint8Array,
  reserved: Uint8Array,
  size: number,
  data: Uint8Array,
): void {
  let bitIndex = 0;
  const totalBits = data.length * 8;

  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // Skip timing column
    for (let count = 0; count < size; count++) {
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        const isUpward = ((size - 1 - col) >> 1) % 2 === 0;
        const r = isUpward ? size - 1 - count : count;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        if (reserved[r * size + c]) continue;
        if (bitIndex < totalBits) {
          const byteIdx = bitIndex >> 3;
          const bitIdx = 7 - (bitIndex & 7);
          modules[r * size + c] = (data[byteIdx] >> bitIdx) & 1;
          bitIndex++;
        }
      }
    }
  }
}

function applyBestMask(
  modules: Uint8Array,
  reserved: Uint8Array,
  size: number,
): void {
  let bestScore = Infinity;
  let bestMask = 0;

  for (let mask = 0; mask < 8; mask++) {
    const trial = new Uint8Array(modules);
    applyMask(trial, reserved, size, mask);
    placeFormatBits(trial, size, mask);
    const score = evaluatePenalty(trial, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }

  applyMask(modules, reserved, size, bestMask);
  placeFormatBits(modules, size, bestMask);
}

function applyMask(
  modules: Uint8Array,
  reserved: Uint8Array,
  size: number,
  mask: number,
): void {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r * size + c]) continue;
      let flip = false;
      switch (mask) {
        case 0: flip = (r + c) % 2 === 0; break;
        case 1: flip = r % 2 === 0; break;
        case 2: flip = c % 3 === 0; break;
        case 3: flip = (r + c) % 3 === 0; break;
        case 4: flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: flip = (r * c) % 2 + (r * c) % 3 === 0; break;
        case 6: flip = ((r * c) % 2 + (r * c) % 3) % 2 === 0; break;
        case 7: flip = ((r + c) % 2 + (r * c) % 3) % 2 === 0; break;
      }
      if (flip) modules[r * size + c] ^= 1;
    }
  }
}

// Format info for EC level L (01)
const FORMAT_INFO_BITS: number[] = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

function placeFormatBits(modules: Uint8Array, size: number, mask: number): void {
  const bits = FORMAT_INFO_BITS[mask];

  // Around top-left finder
  const positions1: [number, number][] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = positions1[i];
    modules[r * size + c] = (bits >> (14 - i)) & 1;
  }

  // Around bottom-left and top-right finders
  const positions2: [number, number][] = [
    [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
    [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
    [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
    [size - 3, 8], [size - 2, 8], [size - 1, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = positions2[i];
    modules[r * size + c] = (bits >> (14 - i)) & 1;
  }
}

function evaluatePenalty(modules: Uint8Array, size: number): number {
  let penalty = 0;

  // Rule 1: Consecutive same-color modules (5+)
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r * size + c] === modules[r * size + c - 1]) {
        run++;
        if (run === 5) penalty += 3;
        else if (run > 5) penalty++;
      } else {
        run = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r * size + c] === modules[(r - 1) * size + c]) {
        run++;
        if (run === 5) penalty += 3;
        else if (run > 5) penalty++;
      } else {
        run = 1;
      }
    }
  }

  // Rule 2: 2×2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r * size + c];
      if (
        v === modules[r * size + c + 1] &&
        v === modules[(r + 1) * size + c] &&
        v === modules[(r + 1) * size + c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: Proportion of dark modules
  let dark = 0;
  for (let i = 0; i < size * size; i++) dark += modules[i];
  const pct = (dark * 100) / (size * size);
  penalty += Math.abs(Math.floor(pct / 5) * 5 - 50) * 2;

  return penalty;
}
