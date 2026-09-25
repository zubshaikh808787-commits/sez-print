/**
 * Forensic print-pipeline logger.
 * Reports values produced by the running code — not comments or intended math.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type PrintTraceRecord = Record<string, string | number | boolean | null | undefined>;

function emitPipelineLogcat(body: string): void {
  if (Platform.OS !== 'android') return;
  try {
    const mod = requireOptionalNativeModule<{ logPipelineTrace?: (message: string) => void }>(
      'Td404Printer',
    );
    mod?.logPipelineTrace?.(body);
  } catch {
    // Native bridge unavailable — ReactNativeJS console line remains.
  }
}

export function logPrintTrace(stage: string, record: PrintTraceRecord): void {
  const body = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' | ');
  console.info(`[PRINT-TRACE] ${stage} | ${body}`);
  if (stage === 'PIPELINE') {
    emitPipelineLogcat(body);
  }
}
