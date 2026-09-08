/**
 * Forensic print-pipeline logger.
 * Reports values produced by the running code — not comments or intended math.
 */

export type PrintTraceRecord = Record<string, string | number | boolean | null | undefined>;

export function logPrintTrace(stage: string, record: PrintTraceRecord): void {
  const body = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' | ');
  console.info(`[PRINT-TRACE] ${stage} | ${body}`);
}
