export type SeznikPrinterModelId = 'td404' | 'josh' | 'dev' | 'tez' | 'labelx';

export interface SeznikPrinterModel {
  id: SeznikPrinterModelId;
  name: string;
  shortName: string;
  tagline: string;
  driver: string;
  driverType: 'td404' | 'josh' | 'dev' | 'tez' | 'labelx';
  defaultDpi: number;
  badgeColor: string;
  badgeTextColor: string;
  badgeBorderColor: string;
  description: string;
  warningNotice?: string;
  connectionHelp: string;
  supportedNames: string[];
}

export const SEZNIK_PRINTER_MODELS: Record<SeznikPrinterModelId, SeznikPrinterModel> = {
  td404: {
    id: 'td404',
    name: 'SEZNIK TEJAS / RUDRA',
    shortName: 'TEJAS / RUDRA',
    tagline: 'TD-404 TSPL High-Speed Label Engine',
    driver: 'TD-404 Driver (TSPL)',
    driverType: 'td404',
    defaultDpi: 304,
    badgeColor: '#F0F9FF',
    badgeTextColor: '#0284C7',
    badgeBorderColor: '#BAE6FD',
    description: 'High-speed 304 DPI & 203 DPI thermal label printer engine for Tejas, Rudra, and TD-404 series.',
    warningNotice: 'Optimized for high-resolution jewellery labels, cable flags, and sticker rolls.',
    connectionHelp: 'Power on your Tejas / Rudra / TD-404 printer, pair in Bluetooth settings or tap Scan below.',
    supportedNames: ['TEJAS', 'RUDRA', 'TD404', 'TD-404', 'TD_404', 'SEZNIK', '4BARCODE', 'POSTEK', 'TSC', 'GAINSCHA'],
  },
  josh: {
    id: 'josh',
    name: 'SEZNIK JOSH',
    shortName: 'JOSH',
    tagline: 'Dual-Mode Smart LPAPI Vector Engine',
    driver: 'JOSH LPAPI Driver',
    driverType: 'josh',
    defaultDpi: 203,
    badgeColor: '#F5F3FF',
    badgeTextColor: '#7C3AED',
    badgeBorderColor: '#DDD6FE',
    description: 'Premium dual-mode printer with hardware optical gap sensor and native LPAPI vector graphics.',
    warningNotice: 'Hardware optical gap detection for instant die-cut alignment.',
    connectionHelp: 'Power on JOSH printer and tap Scan under the JOSH section.',
    supportedNames: ['JOSH', 'D110', 'D11', 'B21', 'B1', 'B3S', 'JC', 'NIIMBOT', 'LPAPI'],
  },
  dev: {
    id: 'dev',
    name: 'SEZNIK DEV',
    shortName: 'DEV',
    tagline: 'AutoReplyPrint 2-in-1 POS & Label Driver',
    driver: 'DEV AutoReply Driver',
    driverType: 'dev',
    defaultDpi: 203,
    badgeColor: '#EFF6FF',
    badgeTextColor: '#2563EB',
    badgeBorderColor: '#BFDBFE',
    description: 'AutoReplyPrint SDK engine supporting 50×30mm die-cut labels and versatile media types.',
    warningNotice: 'Supports 50×30mm die-cut labels and continuous rolls.',
    connectionHelp: 'Pair via phone Bluetooth settings, then select SEZNIK DEV.',
    supportedNames: ['DEV', 'SEZNIK DEV', 'POS-58', 'MTP', 'RPP', 'MPT'],
  },
  tez: {
    id: 'tez',
    name: 'SEZNIK TEZ / SHAKTI',
    shortName: 'TEZ / SHAKTI',
    tagline: 'Smart Thermal Label Driver & Auto-Calibrate',
    driver: 'TEZ Smart Driver',
    driverType: 'tez',
    defaultDpi: 203,
    badgeColor: '#ECFDF5',
    badgeTextColor: '#059669',
    badgeBorderColor: '#A7F3D0',
    description: 'Proprietary TEZ / Shakti smart driver with hardware gap calibration and image print pipeline.',
    warningNotice: 'High-speed smart label printing with hardware paper calibration.',
    connectionHelp: 'Power on the TEZ printer and tap Scan under TEZ section.',
    supportedNames: ['TEZ', 'SHAKTI', 'TEZ-PRINT', 'YX', 'YIXIN'],
  },
  labelx: {
    id: 'labelx',
    name: 'SEZNIK LABEL X',
    shortName: 'LABEL X',
    tagline: 'LuckPrinter OEM Vector & Die-Cut Engine',
    driver: 'Label X OEM Driver',
    driverType: 'labelx',
    defaultDpi: 203,
    badgeColor: '#ECFEFF',
    badgeTextColor: '#0891B2',
    badgeBorderColor: '#A5F3FC',
    description: 'LuckPrinter SDK engine for Label X series portable wireless thermal printers.',
    warningNotice: 'Optimized for high-speed portable die-cut label rolls.',
    connectionHelp: 'Power on your Label X printer, pair in Bluetooth settings or tap Scan below.',
    supportedNames: ['LABELX', 'LABEL X', 'MINIX', 'GD985', 'LUCKP', 'U8', 'PPP1', 'LPC50'],
  },
};

export const PRINTER_MODEL_LIST: SeznikPrinterModel[] = [
  SEZNIK_PRINTER_MODELS.td404,
  SEZNIK_PRINTER_MODELS.josh,
  SEZNIK_PRINTER_MODELS.dev,
  SEZNIK_PRINTER_MODELS.tez,
  SEZNIK_PRINTER_MODELS.labelx,
];
