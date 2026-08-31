const express = require('express');
const printerService = require('../services/printerService');
const { getSdk } = require('../../sdks/registry');
const { buildSampleTscLabel, buildTscBitmapLabel } = require('../services/printPayload');

const router = express.Router();

/** List all registered printer SDKs (td404, future vendors…). */
router.get('/sdks', (_req, res) => {
  res.json({ sdks: printerService.listRegisteredSdks() });
});

/** Detail for one SDK including native integration hints. */
router.get('/sdks/:sdkId', (req, res) => {
  try {
    const sdk = getSdk(req.params.sdkId);
    res.json({
      capabilities: sdk.capabilities,
      defaultWifiPort: sdk.DEFAULT_WIFI_PORT ?? null,
      vendorPath: `sdks/${sdk.capabilities.id}/vendor`,
      analysis: `sdks/${sdk.capabilities.id}/ANALYSIS.md`,
    });
  } catch (err) {
    res.status(404).json({ error: err.message, code: err.code });
  }
});

/**
 * Build a print payload the mobile app can send over Bluetooth SPP,
 * or the backend can send over Wi‑Fi.
 * Body: { format: 'tsc-text'|'tsc-bitmap', ... }
 */
router.post('/print/test-payload', (req, res) => {
  try {
    const format = req.body?.format || 'tsc-text';
    let buf;
    if (format === 'tsc-bitmap') {
      buf = buildTscBitmapLabel(req.body || {});
    } else {
      buf = buildSampleTscLabel(req.body || {});
    }
    res.json({
      format: format === 'tsc-bitmap' ? 'tsc-bitmap' : 'tsc-text',
      encoding: 'base64',
      data: buf.toString('base64'),
      bytes: buf.length,
      hint: 'Send these bytes over Bluetooth SPP from the app, or POST to /api/printers/:id/print for Wi‑Fi.',
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

router.post('/print/build-bitmap', (req, res) => {
  try {
    const buf = buildTscBitmapLabel(req.body || {});
    res.json({
      format: 'tsc-bitmap',
      encoding: 'base64',
      data: buf.toString('base64'),
      bytes: buf.length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/** Active printer sessions. */
router.get('/printers', async (_req, res) => {
  res.json({ printers: await printerService.listPrinters() });
});

/**
 * Connect a printer.
 * Body examples:
 *   { "sdkId": "td404", "transport": "wifi", "ip": "192.168.1.50", "port": 9100, "name": "Shop TD-404" }
 *   { "sdkId": "td404", "transport": "bluetooth-spp", "macAddress": "AA:BB:..." }
 *     → returns 501 with native integration hint (must run on device)
 */
router.post('/printers/connect', async (req, res) => {
  try {
    const { sdkId = 'td404', ...options } = req.body || {};
    if (!options.transport) {
      return res.status(400).json({
        error: 'transport is required (wifi | bluetooth-spp | bluetooth-ble | usb)',
      });
    }
    const endpoint = await printerService.connectPrinter(sdkId, options);
    res.status(201).json({ printer: endpoint });
  } catch (err) {
    const status = err.code === 'TRANSPORT_REQUIRES_NATIVE' ? 501 : 400;
    res.status(status).json({
      error: err.message,
      code: err.code,
      hint: err.hint,
    });
  }
});

router.get('/printers/:id', async (req, res) => {
  const printer = await printerService.getPrinter(req.params.id);
  if (!printer) return res.status(404).json({ error: 'Printer not found' });
  res.json({ printer });
});

router.delete('/printers/:id', async (req, res) => {
  await printerService.disconnectPrinter(req.params.id);
  res.json({ ok: true });
});

/**
 * Print raw bytes.
 * Body: { "encoding": "base64"|"raw", "data": "<base64 or utf8>", "awaitAck": false }
 */
router.post('/printers/:id/print', async (req, res) => {
  try {
    const result = await printerService.printRaw(req.params.id, {
      data: req.body?.data,
      encoding: req.body?.encoding || 'base64',
      awaitAck: Boolean(req.body?.awaitAck),
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

/** Quick TSC sample label (WiFi TD-404). */
router.post('/printers/:id/print-sample', async (req, res) => {
  try {
    const result = await printerService.printSample(req.params.id, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
});

module.exports = router;
