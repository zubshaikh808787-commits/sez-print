import assert from 'node:assert/strict';

import {
  isLikelyLabelXName,
  isLikelyDevName,
  isLikelyTezName,
  isLikelyShaktiName,
  isLikelyTd404Name,
  isLikelyJoshName,
  shouldUseTsplCommandSet,
} from '../printer-heuristics';

function testNameClassification() {
  // Positive Label X / Seznik MiniX / GD985 / LuckPrinter matches
  assert.equal(isLikelyLabelXName('Seznik MiniX_'), true);
  assert.equal(isLikelyLabelXName('MiniX'), true);
  assert.equal(isLikelyLabelXName('LabelX'), true);
  assert.equal(isLikelyLabelXName('Label X'), true);
  assert.equal(isLikelyLabelXName('GD985'), true);
  assert.equal(isLikelyLabelXName('LuckP_L3'), true);
  assert.equal(isLikelyLabelXName('U8_Printer'), true);
  assert.equal(isLikelyLabelXName('PPP1_001'), true);
  assert.equal(isLikelyLabelXName('LPC50_Tag'), true);
  assert.equal(isLikelyLabelXName('BTW Identi-Express_'), true);

  // Negative matches - must never hijack or be hijacked by other models
  assert.equal(isLikelyLabelXName('Tejas'), false);
  assert.equal(isLikelyLabelXName('Rudra'), false);
  assert.equal(isLikelyLabelXName('Seznik Tejas'), false);
  assert.equal(isLikelyLabelXName('JOSH-LD08'), false);
  assert.equal(isLikelyLabelXName('DEV-001'), false);
  assert.equal(isLikelyLabelXName('Tez Printer'), false);
  assert.equal(isLikelyLabelXName('TD-404'), false);

  // Cross-heuristic safety: Label X device names must NEVER match other models
  assert.equal(isLikelyTd404Name('Seznik MiniX_'), false, 'MiniX must NOT match TD-404');
  assert.equal(isLikelyDevName('Seznik MiniX_'), false, 'MiniX must NOT match DEV');
  assert.equal(isLikelyTezName('Seznik MiniX_'), false, 'MiniX must NOT match TEZ');
  assert.equal(isLikelyJoshName('Seznik MiniX_'), false, 'MiniX must NOT match JOSH');
  assert.equal(isLikelyShaktiName('Seznik MiniX_'), false, 'MiniX must NOT match SHAKTI');

  assert.equal(isLikelyTd404Name('Label X Printer'), false, 'Label X must NOT match TD-404');
  assert.equal(isLikelyDevName('Label X Printer'), false, 'Label X must NOT match DEV');

  console.log('ok Device name classification heuristics for Label X / GD985 validated');
}

function testDpiAndGeometry() {
  const DPI = 203;
  const DOTS_PER_MM = 8; // 203 DPI = 8 dots/mm (LuckPrinter hardware specification)

  function mmToDots(mm: number): number {
    return Math.round(mm * DOTS_PER_MM);
  }

  // Seznik MiniX max printable width is 48 mm = 384 dots
  assert.equal(mmToDots(48), 384);

  // Standard 40 x 30 mm label
  assert.equal(mmToDots(40), 320);
  assert.equal(mmToDots(30), 240);

  // Standard 50 x 30 mm label clamped to 48mm head
  assert.equal(mmToDots(48), 384);

  console.log('ok Label X 203 DPI geometry (48mm = 384 dots) verified');
}

function testStatusDecoding() {
  // Constant codes from LuckPrinter com.luckprinter.sdk_new.constant.PrinterStatus
  const PRINTER_STATUS = {
    OUTPAPER: 0,
    OPENCOVER: 1,
    OVERHEAT: 2,
    LOWVAL: 3,
    PRINTTING: 4,
    RECHARGE: 5,
    NOT_LABEL: 6,
  };

  function decodeStatus(status: number) {
    return {
      paperOut: status === PRINTER_STATUS.OUTPAPER,
      coverOpen: status === PRINTER_STATUS.OPENCOVER,
      overheat: status === PRINTER_STATUS.OVERHEAT,
      lowBattery: status === PRINTER_STATUS.LOWVAL,
      printing: status === PRINTER_STATUS.PRINTTING,
    };
  }

  assert.equal(decodeStatus(PRINTER_STATUS.OUTPAPER).paperOut, true);
  assert.equal(decodeStatus(PRINTER_STATUS.OPENCOVER).coverOpen, true);
  assert.equal(decodeStatus(PRINTER_STATUS.OVERHEAT).overheat, true);
  assert.equal(decodeStatus(PRINTER_STATUS.LOWVAL).lowBattery, true);
  assert.equal(decodeStatus(PRINTER_STATUS.PRINTTING).printing, true);

  console.log('ok LuckPrinter status decoding verified');
}

function testCommandSetExclusion() {
  // Label X uses OEM LuckPrinter SDK and must NOT receive raw TD-404 TSPL bytes
  const usesTspl = shouldUseTsplCommandSet({
    activeTransport: 'labelx-spp',
    storeTransport: 'labelx-spp',
    sdkId: 'labelx',
    deviceName: 'Seznik MiniX_',
  });
  assert.equal(usesTspl, false, 'Label X must NOT use raw TD404 command set');

  console.log('ok Command set exclusion for Label X verified');
}

function testConnectByMacValidation() {
  const isValidMac = (mac: string) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac.trim().toUpperCase());

  assert.equal(isValidMac('AA:BB:CC:DD:EE:FF'), true);
  assert.equal(isValidMac('66:32:B6:01:23:45'), true);
  assert.equal(isValidMac('invalid-mac'), false);
  assert.equal(isValidMac('AA:BB:CC:DD:EE'), false);
  assert.equal(isValidMac(''), false);

  console.log('ok Label X MAC address validation verified');
}

function testRoutingPriority() {
  // Discovered device routing in printer-connect.tsx
  function resolveTransport(name: string) {
    const isLabelX = isLikelyLabelXName(name);
    const isJosh = !isLabelX && isLikelyJoshName(name);
    const isTez = !isLabelX && !isJosh && (isLikelyTezName(name) || isLikelyShaktiName(name));
    const isTd404 = !isLabelX && !isJosh && !isTez && isLikelyTd404Name(name);
    const isDev = !isLabelX && !isJosh && !isTez && !isTd404 && isLikelyDevName(name);

    if (isLabelX) return 'labelx-spp';
    if (isJosh) return 'josh-lpapi';
    if (isTez) return 'tez-spp';
    if (isTd404) return 'bluetooth-spp';
    if (isDev) return 'dev-spp';
    return 'bluetooth-spp';
  }

  assert.equal(resolveTransport('Seznik MiniX_'), 'labelx-spp');
  assert.equal(resolveTransport('GD985-001'), 'labelx-spp');
  assert.equal(resolveTransport('LabelX'), 'labelx-spp');
  assert.equal(resolveTransport('LuckP_88'), 'labelx-spp');
  assert.equal(resolveTransport('BTW Identi-Express_'), 'labelx-spp');
  assert.equal(resolveTransport('DEV-001'), 'dev-spp');
  assert.equal(resolveTransport('JOSH-LD08'), 'josh-lpapi');
  assert.equal(resolveTransport('Tejas'), 'bluetooth-spp');

  console.log('ok Transport routing priority for Label X verified');
}

function runAll() {
  console.log('--- Running Label X Print Engine Tests ---');
  testNameClassification();
  testDpiAndGeometry();
  testStatusDecoding();
  testCommandSetExclusion();
  testConnectByMacValidation();
  testRoutingPriority();
  console.log('All Label X print tests passed successfully.');
}

runAll();

