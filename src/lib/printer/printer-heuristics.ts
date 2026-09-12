export function isLikelyTezName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // CRITICAL: Tejas is TD-404, NOT Tez!
  if (n.includes('tejas')) return false;
  return (
    n.includes('tez') ||
    n.startsWith('tz-') ||
    n.startsWith('tz_') ||
    n.includes('tz100') ||
    n.includes('tz200') ||
    n.includes('flashlabel') ||
    n.includes('oem-tez')
  );
}

export function isLikelyShaktiName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // CRITICAL: Tejas is TD-404, NOT Shakti!
  if (n.includes('tejas')) return false;
  return (
    n.includes('shakti') ||
    n.startsWith('sh-') ||
    n.startsWith('sk-') ||
    n.startsWith('sh_') ||
    n.includes('shakti-')
  );
}

export function isLikelyJoshName(name: string | null | undefined): boolean {
  if (!name) return false;
  // If the device matches Tez or Shakti, it is NEVER a Josh printer
  if (isLikelyTezName(name) || isLikelyShaktiName(name)) return false;
  const n = name.toLowerCase().trim();
  // TD404 specific names
  if (
    n.includes('tejas') ||
    n.includes('rudra') ||
    n.includes('sez') ||
    n.includes('td-404') ||
    n.includes('td404') ||
    n.includes('ninestar')
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

export function isLikelyTd404Name(name: string | null | undefined): boolean {
  if (!name) return false;
  // If the device matches Tez, Shakti, or Josh, it is NEVER a TD-404 printer
  if (isLikelyTezName(name) || isLikelyShaktiName(name) || isLikelyJoshName(name)) return false;
  const n = name.toLowerCase().trim();
  return (
    n.includes('tejas') ||
    n.includes('rudra') ||
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
    n.includes('bt-') ||
    n.includes('bt_') ||
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
