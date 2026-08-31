/**
 * SDK registry — register every printer vendor adapter here.
 * To add another SDK later:
 *   1. Create backend/sdks/<id>/index.js exporting a PrinterSdkAdapter
 *   2. require() it below and push into ADAPTERS
 */

const td404 = require('./td404');

/** @type {import('./types').PrinterSdkAdapter[]} */
const ADAPTERS = [td404];

function listSdks() {
  return ADAPTERS.map((a) => a.capabilities);
}

function getSdk(sdkId) {
  const adapter = ADAPTERS.find((a) => a.capabilities.id === sdkId);
  if (!adapter) {
    const err = new Error(`Unknown SDK "${sdkId}"`);
    err.code = 'SDK_NOT_FOUND';
    throw err;
  }
  return adapter;
}

module.exports = {
  ADAPTERS,
  listSdks,
  getSdk,
};
