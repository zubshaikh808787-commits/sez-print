/**
 * Phase 1: Standalone TSPL Command Builder
 *
 * Turns simple typed instructions into valid TSPL, using physical mm as the
 * input unit everywhere. All conversions to printer dots are calculated
 * internally using PRINTER_DPI = 304 and unrounded DOTS_PER_MM (≈ 11.9685).
 *
 * No UI or canvas dependencies. Output is plain TSPL string or byte buffer.
 */

import { DOTS_PER_MM, PRINTER_DPI } from './calibration';

export { PRINTER_DPI, DOTS_PER_MM };

export interface TsplBuilderOptions {
  /** Target printer DPI (default 304). */
  dpi?: number;
  /** Micro-calibration scaling factors along X and Y axes. */
  calibrationScale?: { scaleX?: number; scaleY?: number };
}

export type TextOptions = {
  /** Built-in TSPL font (e.g. "0", "1", "2", "3", "4", "5", "TSS24.BF2"). Default "3" (or auto-picked by fontSize). */
  font?: string;
  /** Rotation in degrees: 0, 90, 180, 270. Default 0. */
  rotation?: 0 | 90 | 180 | 270;
  /** Horizontal magnification 1-10. Default 1. */
  xMulti?: number;
  /** Vertical magnification 1-10. Default 1. */
  yMulti?: number;
};

export type BarcodeOptions = {
  /** Height in millimeters. Default 10 mm. */
  heightMm?: number;
  /** Human-readable text: 0 (none), 1 (aligned with barcode bottom). Default 1. */
  readable?: 0 | 1;
  /** Rotation: 0, 90, 180, 270. Default 0. */
  rotation?: 0 | 90 | 180 | 270;
  /** Narrow bar width in dots. Default 2 for 304 DPI (~0.167 mm). */
  narrowDots?: number;
  /** Wide bar width in dots. Default 4. */
  wideDots?: number;
};

export type QrCodeOptions = {
  /** Module/cell width in dots (1-10). Default 4 (~0.33 mm at 304 DPI). */
  cellWidthDots?: number;
  /** Error correction level: L (7%), M (15%), Q (25%), H (30%). Default "M". */
  eccLevel?: 'L' | 'M' | 'Q' | 'H';
  /** QR model: M1 or M2. Default "M2". */
  model?: 'M1' | 'M2';
  /** Mask pattern: S0-S8. Default "S7". */
  mask?: string;
  /** Rotation: 0, 90, 180, 270. Default 0. */
  rotation?: 0 | 90 | 180 | 270;
};

function escapeTsplString(str: string): string {
  return str.replace(/"/g, '\\"');
}

/**
 * Fluent TSPL Command Builder.
 * All spatial coordinates and dimensions are in physical millimeters.
 */
export class TsplBuilder {
  private commands: string[] = [];
  private dpmX: number;
  private dpmY: number;

  constructor(options?: TsplBuilderOptions) {
    const dpi = options?.dpi ?? PRINTER_DPI;
    const baseDpm = dpi / 25.4;
    this.dpmX = baseDpm * (options?.calibrationScale?.scaleX ?? 1.0);
    this.dpmY = baseDpm * (options?.calibrationScale?.scaleY ?? 1.0);
  }

  /**
   * Set label size in millimeters: SIZE <w> mm, <h> mm
   */
  setSize(widthMm: number, heightMm: number): this {
    this.commands.push(`SIZE ${widthMm} mm, ${heightMm} mm`);
    return this;
  }

  /**
   * Set label gap in millimeters: GAP <gap> mm, <offset> mm
   */
  setGap(gapMm: number, offsetMm = 0): this {
    this.commands.push(`GAP ${gapMm} mm, ${offsetMm} mm`);
    return this;
  }

  /**
   * Set black mark sensor in millimeters: BLINE <height> mm, <offset> mm
   */
  setBline(heightMm: number, offsetMm = 0): this {
    this.commands.push(`BLINE ${heightMm} mm, ${offsetMm} mm`);
    return this;
  }

  /**
   * Set media sensor type: 'gap' | 'blackmark' | 'continuous'
   */
  setSensor(
    type: 'gap' | 'blackmark' | 'continuous' = 'gap',
    paramMm = 2,
    offsetMm = 0,
  ): this {
    if (type === 'continuous') {
      this.commands.push('GAP 0 mm, 0 mm');
    } else if (type === 'blackmark') {
      this.commands.push(`BLINE ${paramMm} mm, ${offsetMm} mm`);
    } else {
      this.commands.push(`GAP ${paramMm} mm, ${offsetMm} mm`);
    }
    return this;
  }

  /**
   * Set print orientation: DIRECTION 0 (preview match) or 1 (inverted exit).
   */
  setDirection(direction: 0 | 1 = 1): this {
    this.commands.push(`DIRECTION ${direction}`);
    return this;
  }

  /**
   * Set origin reference in millimeters: REFERENCE <x>, <y>
   */
  setReference(xMm = 0, yMm = 0): this {
    const x = Math.round(xMm * this.dpmX);
    const y = Math.round(yMm * this.dpmY);
    this.commands.push(`REFERENCE ${x},${y}`);
    return this;
  }

  /**
   * Clear image buffer: CLS
   */
  clear(): this {
    this.commands.push('CLS');
    return this;
  }

  /**
   * Draw a box outline in millimeters: BOX <x0>,<y0>,<x1>,<y1>,<thickness>
   */
  drawBox(
    xMm: number,
    yMm: number,
    wMm: number,
    hMm: number,
    thicknessMm = 0.35,
  ): this {
    const x0 = Math.round(xMm * this.dpmX);
    const y0 = Math.round(yMm * this.dpmY);
    const x1 = Math.round((xMm + wMm) * this.dpmX);
    const y1 = Math.round((yMm + hMm) * this.dpmY);
    const thicknessDots = Math.max(1, Math.round(thicknessMm * this.dpmX));
    this.commands.push(`BOX ${x0},${y0},${x1},${y1},${thicknessDots}`);
    return this;
  }

  /**
   * Draw a circle in millimeters: CIRCLE <x>,<y>,<diameter>,<thickness>
   */
  drawCircle(
    xMm: number,
    yMm: number,
    diameterMm: number,
    thicknessMm = 0.35,
  ): this {
    const x = Math.round(xMm * this.dpmX);
    const y = Math.round(yMm * this.dpmY);
    const diameterDots = Math.round(diameterMm * this.dpmX);
    const thicknessDots = Math.max(1, Math.round(thicknessMm * this.dpmX));
    this.commands.push(`CIRCLE ${x},${y},${diameterDots},${thicknessDots}`);
    return this;
  }

  /**
   * Draw text in millimeters: TEXT <x>,<y>,"<font>",<rotation>,<x-multi>,<y-multi>,"<text>"
   */
  drawText(
    xMm: number,
    yMm: number,
    text: string,
    fontSize?: number,
    options?: TextOptions,
  ): this {
    const x = Math.round(xMm * this.dpmX);
    const y = Math.round(yMm * this.dpmY);
    const rotation = options?.rotation ?? 0;
    const xMulti = options?.xMulti ?? 1;
    const yMulti = options?.yMulti ?? 1;

    // Pick font: explicit font option > mapped fontSize > default "3" (16x24 dots)
    let font = options?.font;
    if (!font) {
      if (fontSize != null) {
        if (fontSize <= 8) font = '1';
        else if (fontSize <= 10) font = '2';
        else if (fontSize <= 14) font = '3';
        else if (fontSize <= 20) font = '4';
        else font = '5';
      } else {
        font = '3';
      }
    }

    const safeText = escapeTsplString(text);
    this.commands.push(`TEXT ${x},${y},"${font}",${rotation},${xMulti},${yMulti},"${safeText}"`);
    return this;
  }

  /**
   * Draw 1D barcode in millimeters: BARCODE <x>,<y>,"<type>",<height>,<readable>,<rot>,<narrow>,<wide>,"<code>"
   */
  drawBarcode(
    xMm: number,
    yMm: number,
    data: string,
    type = '128',
    options?: BarcodeOptions,
  ): this {
    const x = Math.round(xMm * this.dpmX);
    const y = Math.round(yMm * this.dpmY);
    const heightMm = options?.heightMm ?? 10;
    const heightDots = Math.max(8, Math.round(heightMm * this.dpmY));
    const readable = options?.readable ?? 1;
    const rotation = options?.rotation ?? 0;
    const narrow = options?.narrowDots ?? 2;
    const wide = options?.wideDots ?? (type === '128' ? 2 : 4);

    const safeData = escapeTsplString(data);
    this.commands.push(
      `BARCODE ${x},${y},"${type}",${heightDots},${readable},${rotation},${narrow},${wide},"${safeData}"`,
    );
    return this;
  }

  /**
   * Draw 2D QR Code in millimeters: QRCODE <x>,<y>,<ecc>,<cellWidth>,A,<rot>,<model>,<mask调整>,"<data>"
   */
  drawQrCode(
    xMm: number,
    yMm: number,
    data: string,
    options?: QrCodeOptions,
  ): this {
    const x = Math.round(xMm * this.dpmX);
    const y = Math.round(yMm * this.dpmY);
    const cellWidth = options?.cellWidthDots ?? 4;
    const ecc = options?.eccLevel ?? 'M';
    const model = options?.model ?? 'M2';
    const mask = options?.mask ?? 'S7';
    const rotation = options?.rotation ?? 0;

    const safeData = escapeTsplString(data);
    this.commands.push(`QRCODE ${x},${y},${ecc},${cellWidth},A,${rotation},${model},${mask},"${safeData}"`);
    return this;
  }

  /**
   * Print job: PRINT <copies>
   */
  print(copies = 1): this {
    const n = Math.max(1, Math.round(copies));
    this.commands.push(`PRINT ${n}`);
    return this;
  }

  /**
   * Return the list of generated commands.
   */
  getCommands(): string[] {
    return [...this.commands];
  }

  /**
   * Build the raw TSPL command script string terminated by CRLF.
   */
  build(): string {
    return this.commands.join('\r\n') + '\r\n';
  }

  /**
   * Convert the TSPL script to an encoded Uint8Array byte buffer.
   */
  toBytes(): Uint8Array {
    return new TextEncoder().encode(this.build());
  }
}

// Standalone function exports for direct functional composition
export function setSize(widthMm: number, heightMm: number): string {
  return `SIZE ${widthMm} mm, ${heightMm} mm`;
}

export function setGap(gapMm: number, offsetMm = 0): string {
  return `GAP ${gapMm} mm, ${offsetMm} mm`;
}

export function setBline(heightMm: number, offsetMm = 0): string {
  return `BLINE ${heightMm} mm, ${offsetMm} mm`;
}

export function clear(): string {
  return 'CLS';
}

export function drawBox(
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  thicknessMm = 0.35,
): string {
  const x0 = Math.round(xMm * DOTS_PER_MM);
  const y0 = Math.round(yMm * DOTS_PER_MM);
  const x1 = Math.round((xMm + wMm) * DOTS_PER_MM);
  const y1 = Math.round((yMm + hMm) * DOTS_PER_MM);
  const thicknessDots = Math.max(1, Math.round(thicknessMm * DOTS_PER_MM));
  return `BOX ${x0},${y0},${x1},${y1},${thicknessDots}`;
}

export function drawCircle(
  xMm: number,
  yMm: number,
  diameterMm: number,
  thicknessMm = 0.35,
): string {
  const builder = new TsplBuilder();
  builder.drawCircle(xMm, yMm, diameterMm, thicknessMm);
  return builder.getCommands()[0];
}


export function drawText(
  xMm: number,
  yMm: number,
  text: string,
  fontSize?: number,
  options?: TextOptions,
): string {
  const builder = new TsplBuilder();
  builder.drawText(xMm, yMm, text, fontSize, options);
  return builder.getCommands()[0];
}

export function drawBarcode(
  xMm: number,
  yMm: number,
  data: string,
  type = '128',
  options?: BarcodeOptions,
): string {
  const builder = new TsplBuilder();
  builder.drawBarcode(xMm, yMm, data, type, options);
  return builder.getCommands()[0];
}

export function drawQrCode(
  xMm: number,
  yMm: number,
  data: string,
  options?: QrCodeOptions,
): string {
  const builder = new TsplBuilder();
  builder.drawQrCode(xMm, yMm, data, options);
  return builder.getCommands()[0];
}

export function printCommand(copies = 1): string {
  return `PRINT ${Math.max(1, Math.round(copies))}`;
}
