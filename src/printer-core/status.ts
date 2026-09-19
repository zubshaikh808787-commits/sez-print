/**
 * printer-core / status
 *
 * Every SDK reports faults in its own vocabulary. They all land here, so the error
 * UI is identical regardless of which printer is plugged in and screens never
 * branch on a brand.
 */
import { PrinterStatus } from './contract';

export const OK_STATUS: PrinterStatus = {
  ready: true,
  noPaper: false,
  coverOpen: false,
  overheat: false,
  lowBattery: false,
  busy: false,
  labelNotDetected: false,
};

export function makeStatus(partial: Partial<PrinterStatus>): PrinterStatus {
  const status: PrinterStatus = { ...OK_STATUS, ...partial };
  // `ready` is derived, never trusted from a bridge that forgot to clear it.
  status.ready =
    !status.noPaper &&
    !status.coverOpen &&
    !status.overheat &&
    !status.busy &&
    !status.labelNotDetected &&
    !status.disconnected;
  return status;
}

export const DISCONNECTED_STATUS: PrinterStatus = makeStatus({
  disconnected: true,
  message: 'Printer disconnected.',
});

/**
 * LuckPrinter (LABELX) reference code set. Treated as the canonical numbering
 * because it is the most complete of the five.
 */
export const LUCK_STATUS = {
  OUTPAPER: 0,
  OPENCOVER: 1,
  OVERHEAT: 2,
  LOWVAL: 3,
  PRINTTING: 4,
  RECHARGE: 5,
  NOT_LABEL: 6,
  CONNECTION_LOST: -1,
} as const;

export function fromLuckCode(code: number, raw?: Record<string, unknown>): PrinterStatus {
  switch (code) {
    case LUCK_STATUS.OUTPAPER:
      return makeStatus({ noPaper: true, message: 'Out of paper.', raw });
    case LUCK_STATUS.OPENCOVER:
      return makeStatus({ coverOpen: true, message: 'Cover is open.', raw });
    case LUCK_STATUS.OVERHEAT:
      return makeStatus({ overheat: true, message: 'Printhead is too hot. Let it cool.', raw });
    case LUCK_STATUS.LOWVAL:
      return makeStatus({ lowBattery: true, message: 'Battery is low.', raw });
    case LUCK_STATUS.PRINTTING:
      return makeStatus({ busy: true, message: 'Printing.', raw });
    case LUCK_STATUS.RECHARGE:
      return makeStatus({ lowBattery: true, message: 'Charging.', raw });
    case LUCK_STATUS.NOT_LABEL:
      return makeStatus({
        labelNotDetected: true,
        message: 'No label detected. Check the media type and run a calibration.',
        raw,
      });
    case LUCK_STATUS.CONNECTION_LOST:
      return makeStatus({ disconnected: true, message: 'Printer disconnected.', raw });
    default:
      return makeStatus({ raw });
  }
}

/** Bitmask-style reporters (TEZ/SHAKTI and most TSPL firmwares). */
export function fromFlags(flags: {
  isIdle?: boolean;
  isPrinting?: boolean;
  isCoverOpen?: boolean;
  isNoPaper?: boolean;
  isLowBattery?: boolean;
  isOverheat?: boolean;
  labelNotDetected?: boolean;
  errorMessage?: string | null;
  raw?: Record<string, unknown>;
}): PrinterStatus {
  return makeStatus({
    noPaper: Boolean(flags.isNoPaper),
    coverOpen: Boolean(flags.isCoverOpen),
    overheat: Boolean(flags.isOverheat),
    lowBattery: Boolean(flags.isLowBattery),
    busy: Boolean(flags.isPrinting),
    labelNotDetected: Boolean(flags.labelNotDetected),
    message: flags.errorMessage ?? undefined,
    raw: flags.raw,
  });
}

/** One sentence for the operator. Most urgent fault first. */
export function describeStatus(status: PrinterStatus): string {
  if (status.disconnected) return 'Printer disconnected.';
  if (status.coverOpen) return 'Close the printer cover.';
  if (status.noPaper) return 'Load paper.';
  if (status.labelNotDetected) return 'Labels not detected — check media type and calibrate.';
  if (status.overheat) return 'Printhead is too hot. Wait for it to cool.';
  if (status.busy) return 'Printing.';
  if (status.lowBattery) return 'Battery is low.';
  return 'Ready.';
}

/** Faults that make printing pointless right now, as opposed to merely noteworthy. */
export function isBlocking(status: PrinterStatus): boolean {
  return Boolean(
    status.disconnected || status.noPaper || status.coverOpen || status.overheat || status.labelNotDetected,
  );
}
