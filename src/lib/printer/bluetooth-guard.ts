/** Shown in the connect UI. Must stay in sync with native BT_OFF copy. */
export const BLUETOOTH_OFF_MESSAGE =
  'Bluetooth is turned off. Enable Bluetooth and try again.';

export type BluetoothOffScanResult = {
  paired: 0;
  nearby: 0;
  errors: [string];
};

/**
 * True when a native/JS Bluetooth failure is "adapter off" — not a crash,
 * and not a reason to start scan, discovery, or reconnect.
 */
export function isBluetoothOffError(error: unknown): boolean {
  if (error == null) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  if (code === 'BT_OFF' || code === 'JOSH_BT_DISABLED') return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';
  return /bluetooth is turned off/i.test(message) || /bluetooth is not enabled/i.test(message);
}

export function bluetoothOffScanResult(): BluetoothOffScanResult {
  return { paired: 0, nearby: 0, errors: [BLUETOOTH_OFF_MESSAGE] };
}
