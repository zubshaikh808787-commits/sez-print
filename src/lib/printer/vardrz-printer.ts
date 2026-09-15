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
 * High-level label print matching inventort-seznik printSpecViaEscposGraphic.
 */
export async function printVardrzLabel(
  base64Png: string,
  opts: {
    widthMm: number;
    heightMm: number;
    gapMm?: number;
    copies?: number;
    media?: 'gap' | 'bline' | 'continuous';
    paperWidth?: '58mm' | '80mm';
  }
): Promise<boolean> {
  if (!isVardrzAvailable()) return false;

  const paperWidth = opts.paperWidth ?? (opts.widthMm > 58 ? '80mm' : '58mm');
  const paperSize = paperWidth === '80mm' ? 80 : 58;
  const paperSizeDots = paperWidth === '80mm' ? 576 : 384;
  const labelWidthDots = Math.min(paperSizeDots, Math.round(opts.widthMm * 8));

  const isContinuous = opts.media === 'continuous';
  const gapMm = opts.gapMm ?? 2;
  const feedDots = isContinuous
    ? Math.max(0, Math.min(48, Math.round((gapMm || 0) * 8)))
    : Math.max(16, Math.min(48, Math.round((gapMm || 2) * 8)));

  const copies = Math.max(1, Math.round(opts.copies ?? 1));

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
