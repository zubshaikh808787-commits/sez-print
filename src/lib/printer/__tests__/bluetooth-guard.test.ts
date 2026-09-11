import assert from 'node:assert/strict';

import {
  BLUETOOTH_OFF_MESSAGE,
  bluetoothOffScanResult,
  isBluetoothOffError,
} from '../bluetooth-guard';

function testDetectsNativeBtOffCodedError() {
  assert.equal(
    isBluetoothOffError({ code: 'BT_OFF', message: BLUETOOTH_OFF_MESSAGE }),
    true,
  );
  assert.equal(isBluetoothOffError(new Error(BLUETOOTH_OFF_MESSAGE)), true);
  assert.equal(isBluetoothOffError({ code: 'JOSH_BT_DISABLED', message: 'Bluetooth is not enabled' }), true);
  console.log('ok BT_OFF / adapter-off errors are recognized');
}

function testIgnoresUnrelatedFailures() {
  assert.equal(isBluetoothOffError(new Error('Classic BT scan failed.')), false);
  assert.equal(isBluetoothOffError({ code: 'PERMISSION', message: 'Bluetooth Connect permission is required.' }), false);
  assert.equal(isBluetoothOffError(null), false);
  console.log('ok unrelated Bluetooth errors are not treated as adapter-off');
}

function testQuietScanResultHasNoDevices() {
  const result = bluetoothOffScanResult();
  assert.equal(result.paired, 0);
  assert.equal(result.nearby, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0], BLUETOOTH_OFF_MESSAGE);
  console.log('ok adapter-off scan result is empty and does not throw');
}

function main() {
  testDetectsNativeBtOffCodedError();
  testIgnoresUnrelatedFailures();
  testQuietScanResultHasNoDevices();
  console.log('ALL BLUETOOTH GUARD TESTS PASSED');
}

main();
