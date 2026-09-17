/** `tej` as its own token — not `tejas` (TD-404). Matches Seznik_Tej_DAA91. */
function hasTejToken(n: string): boolean {
  return /(^|[^a-z])tej([^a-z]|$)/.test(n);
}

/** Word-boundary `dev` — matches "DEV-001", "Seznik_Dev" but NOT "device", "development". */
function hasDevToken(n: string): boolean {
  return /(^|[^a-z])dev([^a-z]|$)/.test(n);
}

/** Word-boundary `veer` — matches "Veer-001" but NOT "veerendra" etc. */
function hasVeerToken(n: string): boolean {
  return /(^|[^a-z])veer([^a-z]|$)/.test(n);
}

export function isLikelyLabelXName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (n.includes('tejas') || n.includes('rudra') || n.includes('josh')) return false;
  return (
    n.includes('labelx') ||
    n.includes('label x') ||
    n.includes('gd985') ||
    n.includes('minix') ||
    n.includes('luckp') ||
    n.startsWith('u8_') ||
    n.startsWith('ppp1_') ||
    n.startsWith('lpc50_') ||
    n.startsWith('btw')
  );
}

export function isLikelyDevName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // TD-404 / Josh / Tez / Shakti / LabelX guards — these printers are NEVER Dev
  // NOTE: Do NOT call isLikelyTezName/isLikelyShaktiName here — they call isLikelyDevName (circular)
  if (isLikelyLabelXName(name)) return false;
  if (n.includes('tejas') || n.includes('rudra') || n.includes('josh')) return false;
  if (n.includes('tez') || n.includes('shakti') || n.includes('flashlabel') || hasTejToken(n)) return false;
  if (n.startsWith('seznik_') || n.startsWith('seznik-') || n === 'seznik' || n === 'seznek') return false;
  return (
    hasDevToken(n) ||
    hasVeerToken(n) ||
    n.includes('2in1') ||
    n.includes('2-in-1') ||
    n.includes('2 in 1') ||
    n.includes('autoreply') ||
    n.includes('caysn') ||
    n.includes('pos-58') ||
    n.includes('pos-80') ||
    n.includes('printer_58') ||
    n.includes('printer_80') ||
    n.startsWith('dev-') ||
    n.startsWith('dev_') ||
    n.startsWith('veer-') ||
    n.startsWith('veer_')
  );
}

export function isLikelyJoshName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // Never match other known models
  if (
    n.includes('tejas') ||
    n.includes('rudra') ||
    isLikelyDevName(name) ||
    isLikelyShaktiName(name)
  ) {
    return false;
  }
  return (
    n.includes('josh') ||
    n.includes('lpapi') ||
    n.includes('dothan') ||
    n.includes('dzprinter') ||
    n.startsWith('ld08') ||
    n.startsWith('ld-') ||
    n.startsWith('lp08') ||
    n.startsWith('lp12') ||
    n.startsWith('dt-') ||
    n.startsWith('dt_') ||
    n.startsWith('dp-') ||
    n.startsWith('dp_') ||
    n.startsWith('jc')
  );
}

export function isLikelyTezName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // CRITICAL: Tejas & Rudra are TD-404, Josh is LPAPI, Dev/Veer is POS — NOT Tez!
  if (
    n.includes('tejas') ||
    n.includes('rudra') ||
    n.includes('josh') ||
    isLikelyDevName(name) ||
    isLikelyJoshName(name)
  ) {
    return false;
  }
  return (
    n.includes('tez') ||
    hasTejToken(n) ||
    n.startsWith('tz-') ||
    n.startsWith('tz_') ||
    n.includes('tz100') ||
    n.includes('tz200') ||
    n.includes('flashlabel') ||
    n.includes('oem-tez') ||
    n.includes('y50') ||
    n.includes('y404') ||
    n.includes('y468') ||
    n.includes('yx') ||
    n.includes('z212') ||
    n.includes('ge920') ||
    n.includes('tp3z') ||
    n.includes('3121') ||
    n.includes('yc3121') ||
    // Standalone Seznik / Seznek brand without any non-Tez model indicator
    n === 'seznik' ||
    n === 'seznek' ||
    n.startsWith('seznik_') ||
    n.startsWith('seznik-')
  );
}

export function isLikelyShaktiName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (
    n.includes('tejas') ||
    n.includes('rudra') ||
    n.includes('josh') ||
    isLikelyDevName(name)
  ) {
    return false;
  }
  return (
    n.includes('shakti') ||
    n.startsWith('sh-') ||
    n.startsWith('sk-') ||
    n.startsWith('sh_') ||
    n.includes('shakti-')
  );
}

export function isLikelyTd404Name(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // If the device matches Dev, Josh, Shakti, or LabelX, it is NEVER a TD-404 printer
  if (isLikelyLabelXName(name) || isLikelyDevName(name) || isLikelyJoshName(name) || isLikelyShaktiName(name)) return false;
  // Tejas and Rudra are ALWAYS TD-404 (even if prefixed with Seznik / Sez)
  if (n.includes('tejas') || n.includes('rudra')) return true;
  // If it matches Tez explicitly, not TD-404
  if (isLikelyTezName(name)) return false;
  return (
    n.includes('sez') ||
    n.includes('td-404') ||
    n.includes('td404') ||
    n.includes('td 404') ||
    n.includes('ninestar') ||
    n.includes('nsprinter') ||
    n.includes('labelprinter') ||
    n.includes('label printer') ||
    n.includes('tpl') ||
    n.startsWith('btprinter') ||
    n.includes('gp-') ||
    n.includes('printer') ||
    // Common BLE / desktop thermal label printers (TSPL), e.g. "Thermal-3536-BLE".
    n.includes('thermal') ||
    n.includes('label') ||
    n.includes('sticker') ||
    n.includes('barcode') ||
    n.includes('phomemo') ||
    n.includes('marklife') ||
    n.includes('zebra') ||
    n.includes('godex') ||
    n.includes('tsc') ||
    n.includes('tspl') ||
    n.includes('gprinter') ||
    n.includes('xprinter') ||
    n.includes('hprt') ||
    n.includes('peripage') ||
    n.includes('munbyn') ||
    n.includes('beeprt') ||
    n.includes('jadens') ||
    n.includes('clover') ||
    n.includes('star') ||
    n.includes('bixolon') ||
    n.includes('citizen') ||
    n.includes('epson') ||
    n.includes('spp') ||
    n.startsWith('bt-') ||
    n.startsWith('bt_') ||
    n.includes('mpt') ||
    n.includes('mtp') ||
    n.includes('rpp') ||
    n.includes('qs-') ||
    n.includes('innerprinter')
  );
}

/** True when this connection should get TSPL label jobs (SIZE/GAP/BITMAP), not ESC/POS receipts. */
export function shouldUseTsplCommandSet(opts: {
  activeTransport: string | null;
  storeTransport: string | null;
  sdkId: string | null;
  deviceName: string | null;
}): boolean {
  if (
    opts.activeTransport === 'josh-lpapi' ||
    opts.activeTransport === 'tez-spp' ||
    opts.activeTransport === 'dev-spp' ||
    opts.activeTransport === 'labelx-spp' ||
    opts.sdkId === 'josh' ||
    opts.sdkId === 'tez' ||
    opts.sdkId === 'dev' ||
    opts.sdkId === 'labelx' ||
    opts.storeTransport === 'josh-lpapi' ||
    opts.storeTransport === 'tez-spp' ||
    opts.storeTransport === 'dev-spp' ||
    opts.storeTransport === 'labelx-spp'
  ) {
    return false;
  }
  if (
    opts.activeTransport === 'td404-spp' ||
    opts.activeTransport === 'wifi' ||
    opts.sdkId === 'td404' ||
    opts.storeTransport === 'bluetooth-spp' ||
    opts.storeTransport === 'wifi'
  ) {
    return true;
  }
  // BLE label printers were incorrectly classified as ESC/POS → continuous overlapping
  // dumps and left clipping. Prefer TSPL whenever the name looks like a label printer.
  if (opts.activeTransport === 'bluetooth-ble' || opts.storeTransport === 'bluetooth-ble') {
    return isLikelyTd404Name(opts.deviceName);
  }
  return false;
}
