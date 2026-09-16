import { NativeModules } from 'react-native';

const NativeBluetoothManager = NativeModules.BluetoothManager;
const NativeEscposPrinter = NativeModules.BluetoothEscposPrinter;
const NativeTscPrinter = NativeModules.BluetoothTscPrinter;

export function isVardrzAvailable(): boolean {
  return Boolean(
    NativeBluetoothManager &&
    NativeEscposPrinter &&
    typeof NativeEscposPrinter.printPic === 'function'
  );
}

export async function connectVardrz(macAddress: string): Promise<boolean> {
  if (!NativeBluetoothManager) return false;
  try {
    await NativeBluetoothManager.connect(macAddress);
    return true;
  } catch (err) {
    console.error('[Vardrz] connect error:', err);
    throw err;
  }
}

export async function disconnectVardrz(macAddress?: string): Promise<boolean> {
  if (!NativeBluetoothManager) return false;
  try {
    if (macAddress) {
      await NativeBluetoothManager.disconnect(macAddress);
    } else {
      const addr = await NativeBluetoothManager.getConnectedDeviceAddress?.();
      if (addr) await NativeBluetoothManager.disconnect(addr);
    }
    return true;
  } catch {
    return false;
  }
}

export async function isVardrzConnected(): Promise<boolean> {
  if (!NativeBluetoothManager) return false;
  try {
    return Boolean(await NativeBluetoothManager.isDeviceConnected?.());
  } catch {
    return false;
  }
}

/**
 * Print raster image via ESC/POS printPic with calibrated feed parameter matching inventort-seznik.
 */
export async function printVardrzPic(
  base64Png: string,
  options: {
    width?: number;
    center?: boolean;
    left?: number;
    autoCut?: boolean;
    paperSize?: number;
    feed?: number;
  }
): Promise<void> {
  if (!NativeEscposPrinter || typeof NativeEscposPrinter.printPic !== 'function') {
    throw new Error('BluetoothEscposPrinter.printPic is not available');
  }

  // Strip data:image/...;base64, prefix if present
  const cleanBase64 = base64Png.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const result = NativeEscposPrinter.printPic(cleanBase64, {
    autoCut: false,
    center: true,
    ...options,
  });

  if (result && typeof result.then === 'function') {
    await result;
  } else {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
/**
 * Print via TSPL hardware gap sensing (BluetoothTscPrinter) matching inventort-seznik.
 * This utilizes the printer's optical gap sensor so each label is positioned at (0, 0)
 * and advances to the exact tear bar without cumulative drift.
 */
export async function printVardrzTscLabel(
  base64Png: string,
  opts: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    vOffsetMm?: number;
    hOffsetMm?: number;
    copies?: number;
    paperWidth?: '58mm' | '80mm';
  }
): Promise<boolean> {
  if (!NativeTscPrinter || typeof NativeTscPrinter.printLabel !== 'function') {
    return false;
  }

  const cleanBase64 = base64Png.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const widthMm = Math.max(10, Math.round(opts.widthMm));
  const heightMm = Math.max(10, Math.round(opts.heightMm));
  const gapMm = Math.max(1, Math.round(opts.gapMm ?? 2));
  const copies = Math.max(1, Math.round(opts.copies ?? 1));

  // 58mm printer (48mm head) = 384 dots at 203 DPI (8 dpm).
  // 80mm printer (72mm head) = 576 dots at 203 DPI (8 dpm).
  const paperWidth = opts.paperWidth ?? (opts.widthMm > 58 ? '80mm' : '58mm');
  const headWidthDots = paperWidth === '80mm' ? 576 : 384;
  const rawWidthDots = Math.round(widthMm * 8);
  const labelWidthDots = Math.min(headWidthDots, rawWidthDots);

  // Center horizontally within printable head width so left & right borders are perfectly symmetric:
  const hOffsetDots = Math.round((opts.hOffsetMm ?? 0) * 8);
  const centerOffset = Math.max(0, Math.floor((headWidthDots - labelWidthDots) / 2));
  const leftPadding = Math.max(0, Math.min(headWidthDots - labelWidthDots, centerOffset + hOffsetDots));
  const vOffsetDots = Math.max(0, Math.round((opts.vOffsetMm ?? 0) * 8));

  for (let i = 0; i < copies; i++) {
    await NativeTscPrinter.printLabel({
      width: widthMm,
      height: heightMm,
      gap: gapMm,
      direction: NativeTscPrinter.DIRECTION?.FORWARD ?? 0,
      reference: [0, 0],
      tear: NativeTscPrinter.TEAR?.ON ?? 'ON',
      sound: 0,
      image: [
        {
          x: leftPadding,
          y: vOffsetDots,
          width: labelWidthDots,
          mode: 0,
          image: cleanBase64,
        },
      ],
    });

    if (i < copies - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return true;
}

/**
 * High-level label print matching inventort-seznik printSpecViaEscposGraphic / printLabelFromTemplate.
 */
export async function printVardrzLabel(
  base64Png: string,
  opts: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    vOffsetMm?: number;
    hOffsetMm?: number;
    copies?: number;
    media?: 'gap' | 'bline' | 'continuous';
    paperWidth?: '58mm' | '80mm';
  }
): Promise<boolean> {
  if (!isVardrzAvailable()) return false;

  const isContinuous = opts.media === 'continuous';

  // For die-cut sticker rolls (gap mode), prioritize hardware TSPL gap sensing
  // matching inventort-seznik preferTsplForLabels() -> NativeTscPrinter.printLabel():
  if (!isContinuous && NativeTscPrinter && typeof NativeTscPrinter.printLabel === 'function') {
    try {
      console.info(
        `[Vardrz] Printing via NativeTscPrinter with hardware gap sensing: ${opts.widthMm}x${opts.heightMm}mm gap=${opts.gapMm ?? 2}mm copies=${opts.copies ?? 1}`,
      );
      const ok = await printVardrzTscLabel(base64Png, opts);
      if (ok) return true;
    } catch (tscErr) {
      console.warn('[Vardrz] NativeTscPrinter failed, falling back to calibrated ESC/POS raster:', tscErr);
    }
  }

  const paperWidth = opts.paperWidth ?? (opts.widthMm > 58 ? '80mm' : '58mm');
  const paperSize = paperWidth === '80mm' ? 80 : 58;
  const paperSizeDots = paperWidth === '80mm' ? 576 : 384;
  const rawWidthDots = Math.round(opts.widthMm * 8);
  const labelWidthDots = Math.min(paperSizeDots, rawWidthDots);

  // Calculate actual printed image height after POS_PrintBMP scaling:
  // POS_PrintBMP scales width to labelWidthDots and height proportionally:
  // height = Math.round(mBitmap.getHeight() * labelWidthDots / mBitmap.getWidth())
  const rawHeightDots = Math.round(opts.heightMm * 8);
  const printedHeightDots =
    rawWidthDots > 0
      ? Math.round((rawHeightDots * labelWidthDots) / rawWidthDots)
      : rawHeightDots;

  // Total physical label pitch in dots: (label height + gap + vertical calibration trim)
  const effectiveGapMm = isContinuous ? 0 : (opts.gapMm ?? 2);
  const vOffsetMm = opts.vOffsetMm ?? 0;
  const totalPitchDots = Math.round((opts.heightMm + effectiveGapMm + vOffsetMm) * 8);

  // Exact trailing feed needed so (printedHeightDots + feedDots) equals total pitch:
  // This prevents any cumulative drift across multiple copies or labels.
  const feedDots = isContinuous
    ? Math.max(0, Math.min(255, Math.round((opts.gapMm || 0) * 8)))
    : Math.max(0, Math.min(255, totalPitchDots - printedHeightDots));

  // Horizontal offset trim (centered on roll by default to prevent right-edge clipping):
  const hOffsetDots = Math.round((opts.hOffsetMm ?? 0) * 8);
  const centerOffset = Math.max(0, Math.floor((paperSizeDots - labelWidthDots) / 2));
  const leftPadding = Math.max(
    0,
    Math.min(paperSizeDots - labelWidthDots, centerOffset + hOffsetDots),
  );

  const copies = Math.max(1, Math.round(opts.copies ?? 1));

  console.info(
    `[Vardrz] ESC/POS Pitch calibration: size=${opts.widthMm}x${opts.heightMm}mm gap=${effectiveGapMm}mm vOffset=${vOffsetMm}mm -> printedHeight=${printedHeightDots}dots, feed=${feedDots}dots, totalAdvance=${printedHeightDots + feedDots}dots (pitchTarget=${totalPitchDots}dots), leftPadding=${leftPadding}dots`,
  );

  // Initialize printer state before sending raster graphics (matches inventort-seznik initPrinter)
  try {
    if (typeof NativeEscposPrinter.printerInit === 'function') {
      await NativeEscposPrinter.printerInit();
    }
    if (typeof NativeEscposPrinter.printerLeftSpace === 'function') {
      await NativeEscposPrinter.printerLeftSpace(0);
    }
    if (typeof NativeEscposPrinter.printerAlign === 'function') {
      await NativeEscposPrinter.printerAlign(0);
    }
  } catch (e) {
    console.warn('[Vardrz] initPrinter non-fatal error:', e);
  }

  for (let i = 0; i < copies; i++) {
    await printVardrzPic(base64Png, {
      width: labelWidthDots,
      center: true,
      left: leftPadding,
      autoCut: false,
      paperSize,
      feed: feedDots,
    });

    if (!isContinuous && i < copies - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return true;
}

export { NativeBluetoothManager, NativeEscposPrinter, NativeTscPrinter };

