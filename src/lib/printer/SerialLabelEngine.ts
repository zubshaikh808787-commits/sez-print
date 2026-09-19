/**
 * SerialLabelEngine.ts
 *
 * Generates a sequence of labels (and matching barcode values) from ONE
 * sample label + a numeric range, with no Excel/PDF import required.
 */

// ---------- Types ----------

export interface ParsedSequence {
  prefix: string;
  number: number;
  suffix: string;
  /** number of digits in the original numeric part, used to infer padding */
  digitWidth: number;
}

export type BarcodeSymbology =
  | 'CODE128'
  | 'CODE39'
  | 'EAN13'
  | 'UPCA'
  | 'CUSTOM'; // treat value as an opaque string, no checksum logic

export interface SequenceRuleConfig {
  /** Starting number, e.g. 1 */
  startNumber: number;
  /** Ending number (inclusive), e.g. 100 */
  endNumber: number;
  /** Increment, default 1. Sign is inferred from start/end direction. */
  step?: number;
  /** Zero-pad width for the TEXT field, e.g. 3 -> "001". Omit for no padding. */
  textPadding?: number;

  // Barcode can mirror the text sequence or run independently.
  /** If false, barcode gets its own prefix/suffix/padding below. Default true (mirrors text). */
  barcodeMirrorsText?: boolean;
  barcodePrefix?: string;
  barcodeSuffix?: string;
  barcodePadding?: number;
  barcodeSymbology?: BarcodeSymbology; // default 'CODE128'
}

export interface LabelTemplate {
  /** Arbitrary field bag from existing label editor */
  fields: Record<string, any>;
  /** Which key in `fields` should receive the generated sequential display text */
  textFieldKey: string;
  /** Which key in `fields` should receive the generated barcode value */
  barcodeFieldKey: string;
}

export interface GeneratedLabel {
  index: number;
  sequenceNumber: number;
  text: string;
  barcodeValue: string;
  /** Full label data object, ready for your renderer/print pipeline */
  data: Record<string, any>;
}

// ---------- Constants ----------

/** Hard safety cap so a typo (e.g. 1 to 999999) can't lock the print queue. */
export const MAX_SERIAL_RANGE = 5000;

// ---------- Parsing ----------

/**
 * Splits a sample label like "Desk1", "GATE-007", "Bin 42B" into
 * prefix / numeric part / suffix. Picks the LAST run of digits in the string.
 */
export function parseSequenceFromText(sample: string): ParsedSequence | null {
  const match = sample.match(/^(.*?)(\d+)(\D*)$/s);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  return {
    prefix,
    number: parseInt(digits, 10),
    suffix,
    digitWidth: digits.length,
  };
}

// ---------- Barcode checksum handling ----------

function ean13CheckDigit(digits12: string): number {
  const nums = digits12.split('').map(Number);
  const sum = nums.reduce(
    (acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3),
    0
  );
  return (10 - (sum % 10)) % 10;
}

function upcACheckDigit(digits11: string): number {
  const nums = digits11.split('').map(Number);
  const sum = nums.reduce(
    (acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1),
    0
  );
  return (10 - (sum % 10)) % 10;
}

function buildBarcodeValue(
  numericPayload: string,
  symbology: BarcodeSymbology
): string {
  switch (symbology) {
    case 'EAN13': {
      const body = numericPayload.padStart(12, '0').slice(-12);
      return body + ean13CheckDigit(body);
    }
    case 'UPCA': {
      const body = numericPayload.padStart(11, '0').slice(-11);
      return body + upcACheckDigit(body);
    }
    case 'CODE128':
    case 'CODE39':
    case 'CUSTOM':
    default:
      return numericPayload;
  }
}

// ---------- Core generator ----------

function pad(num: number, width?: number): string {
  return width ? String(num).padStart(width, '0') : String(num);
}

export function validateRange(config: SequenceRuleConfig): string | null {
  const { startNumber, endNumber, step = 1 } = config;
  if (step === 0) return 'Step cannot be 0.';
  if (!Number.isFinite(startNumber) || !Number.isFinite(endNumber)) {
    return 'Start and end must be numbers.';
  }
  const count = Math.floor(Math.abs(endNumber - startNumber) / Math.abs(step)) + 1;
  if (count > MAX_SERIAL_RANGE) {
    return `Range too large (${count} labels). Max allowed is ${MAX_SERIAL_RANGE}.`;
  }
  return null;
}

/**
 * Expands a template + sequence rule into an array of label data objects.
 */
export function generateSerialLabels(
  template: LabelTemplate,
  parsedText: ParsedSequence,
  config: SequenceRuleConfig
): GeneratedLabel[] {
  const err = validateRange(config);
  if (err) throw new Error(err);

  const {
    startNumber,
    endNumber,
    step = 1,
    textPadding,
    barcodeMirrorsText = true,
    barcodePrefix = '',
    barcodeSuffix = '',
    barcodePadding,
    barcodeSymbology = 'CODE128',
  } = config;

  const ascending = endNumber >= startNumber;
  const actualStep = ascending ? Math.abs(step) : -Math.abs(step);

  const results: GeneratedLabel[] = [];
  let n = startNumber;
  let index = 0;

  while (ascending ? n <= endNumber : n >= endNumber) {
    const textNumStr = pad(n, textPadding ?? parsedText.digitWidth);
    const text = `${parsedText.prefix}${textNumStr}${parsedText.suffix}`;

    let barcodeValue: string;
    if (barcodeMirrorsText) {
      barcodeValue = buildBarcodeValue(String(n).padStart(textPadding ?? parsedText.digitWidth, '0'), barcodeSymbology);
    } else {
      const bcNumStr = pad(n, barcodePadding);
      barcodeValue = buildBarcodeValue(`${barcodePrefix}${bcNumStr}`.replace(/\D/g, ''), barcodeSymbology);
      if (barcodeSymbology === 'CODE128' || barcodeSymbology === 'CODE39' || barcodeSymbology === 'CUSTOM') {
        barcodeValue = `${barcodePrefix}${bcNumStr}${barcodeSuffix}`;
      }
    }

    const data = {
      ...template.fields,
      [template.textFieldKey]: text,
      [template.barcodeFieldKey]: barcodeValue,
    };

    results.push({ index, sequenceNumber: n, text, barcodeValue, data });
    n += actualStep;
    index++;
  }

  return results;
}

export function generateSerialLabelsFromSample(
  sampleText: string,
  template: LabelTemplate,
  config: SequenceRuleConfig
): GeneratedLabel[] {
  const parsed = parseSequenceFromText(sampleText);
  if (!parsed) {
    throw new Error(
      `Couldn't find a number to increment in "${sampleText}". Try something like "Desk1".`
    );
  }
  return generateSerialLabels(template, parsed, config);
}
