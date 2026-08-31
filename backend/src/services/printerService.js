const { listSdks, getSdk } = require('../../sdks/registry');

/** In-memory multi-printer session table (sdkId + printerId). */
const printers = new Map();

function listRegisteredSdks() {
  return listSdks();
}

async function connectPrinter(sdkId, options) {
  const sdk = getSdk(sdkId);
  const endpoint = await sdk.connect(options);
  printers.set(endpoint.id, { sdkId, endpoint });
  return endpoint;
}

async function disconnectPrinter(printerId) {
  const row = printers.get(printerId);
  if (!row) return { ok: true };
  const sdk = getSdk(row.sdkId);
  await sdk.disconnect(printerId);
  printers.delete(printerId);
  return { ok: true };
}

async function getPrinter(printerId) {
  const row = printers.get(printerId);
  if (!row) return null;
  const sdk = getSdk(row.sdkId);
  const connected = await sdk.isConnected(printerId);
  return { ...row.endpoint, connected };
}

async function listPrinters() {
  const out = [];
  for (const [id, row] of printers) {
    const sdk = getSdk(row.sdkId);
    out.push({
      ...row.endpoint,
      connected: await sdk.isConnected(id),
    });
  }
  return out;
}

async function printRaw(printerId, job) {
  const row = printers.get(printerId);
  if (!row) {
    const err = new Error(`Printer ${printerId} not found`);
    err.code = 'PRINTER_NOT_FOUND';
    throw err;
  }
  const sdk = getSdk(row.sdkId);
  return sdk.print(printerId, job);
}

async function printSample(printerId, sample = {}) {
  const row = printers.get(printerId);
  if (!row) {
    const err = new Error(`Printer ${printerId} not found`);
    err.code = 'PRINTER_NOT_FOUND';
    throw err;
  }
  const sdk = getSdk(row.sdkId);
  if (typeof sdk.buildSampleTscLabel !== 'function') {
    throw new Error(`SDK ${row.sdkId} does not provide a sample label builder`);
  }
  const data = sdk.buildSampleTscLabel(sample);
  return sdk.print(printerId, { data, encoding: 'raw' });
}

module.exports = {
  listRegisteredSdks,
  connectPrinter,
  disconnectPrinter,
  getPrinter,
  listPrinters,
  printRaw,
  printSample,
};
