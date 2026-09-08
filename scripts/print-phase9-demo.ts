#!/usr/bin/env node
/**
 * Phase 9: Robustness, Multi-DPI, Media Sensors, Batch Printing & Caliper Calibration CLI Demo
 *
 * Demonstrates:
 * 1. Multi-DPI support (203, 300, 304, 600 DPI) with unrounded floating-point dot precision.
 * 2. Media sensor commands (Gap, Black Mark, Continuous Roll).
 * 3. Batch printing with sequential variable data merge ({seq}, {seq:001}, {serial}).
 * 4. Pre-flight print job validation (oversized head width, clipped elements, scannability).
 * 5. Caliper re-calibration flow (scale factor adjustment calculation).
 * 6. Direct network socket transmission to thermal printers (TCP port 9100).
 *
 * Usage:
 *   npx tsx scripts/print-phase9-demo.ts [options]
 *
 * Options:
 *   --dpi <203|300|304|600>    Target printer DPI (default: 304)
 *   --sensor <type>            Media sensor: gap | blackmark | continuous (default: gap)
 *   --bline <mm>               Black mark height in mm (default: 3.0)
 *   --batch <count>            Number of sequential labels to generate (default: 3)
 *   --start <number>           Starting sequence number (default: 1)
 *   --step <number>            Sequence increment step (default: 1)
 *   --pad <digits>             Number of leading zero digits (default: 3)
 *   --width <mm>               Label width in mm (default: 50)
 *   --height <mm>              Label height in mm (default: 30)
 *   --measuredW <mm>           Physical caliper measured width (triggers re-calibration)
 *   --measuredH <mm>           Physical caliper measured height (triggers re-calibration)
 *   --ip <address>             Printer IP address (optional: sends over TCP 9100)
 *   --out <filepath>           Save TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  computeDotsPerMm,
  calculateCalibrationAdjustment,
  exportBatchCanvasJob,
  validateCanvasPrintJob,
  type CanvasDocument,
  type CanvasTextElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasBoxElement,
  type SupportedDpi,
  type MediaSensorType,
} from '../src/printing/index';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }
  return options;
}

async function sendToNetworkPrinter(ip: string, port: number, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    console.log(`Connecting to printer at ${ip}:${port}...`);
    client.connect(port, ip, () => {
      console.log('Connected! Sending Phase 9 TSPL payload...');
      client.write(Buffer.from(data), (err) => {
        if (err) {
          client.destroy();
          return reject(err);
        }
        console.log(`Sent ${data.length} bytes successfully.`);
        client.end();
      });
    });

    client.on('close', () => {
      console.log('Connection closed.');
      resolve();
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Connection to ${ip}:${port} timed out.`));
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });
  });
}

async function main() {
  const opts = parseArgs();

  const dpi = (parseInt(opts.dpi, 10) || 304) as SupportedDpi;
  const sensorType = (opts.sensor || 'gap') as MediaSensorType;
  const blineMm = parseFloat(opts.bline) || 3.0;
  const batchCount = parseInt(opts.batch, 10) || 3;
  const startSeq = parseInt(opts.start, 10) || 1;
  const stepSeq = parseInt(opts.step, 10) || 1;
  const padDigits = parseInt(opts.pad, 10) || 3;
  const widthMm = parseFloat(opts.width) || 50;
  const heightMm = parseFloat(opts.height) || 30;

  console.log('====================================================');
  console.log(' Phase 9: Robustness, Multi-DPI & Batch Print Engine');
  console.log('====================================================');
  console.log(`Target DPI:          ${dpi} DPI (${computeDotsPerMm(dpi).toFixed(4)} dots/mm)`);
  console.log(`Media Sensor:        ${sensorType.toUpperCase()} ${sensorType === 'blackmark' ? `(${blineMm}mm height)` : ''}`);
  console.log(`Label Size:          ${widthMm}mm x ${heightMm}mm`);
  console.log(`Batch Configuration: ${batchCount} labels (start: ${startSeq}, step: ${stepSeq}, pad: ${padDigits})`);

  // Optional Caliper Re-Calibration
  let calibrationScale: { scaleX: number; scaleY: number } | undefined;
  if (opts.measuredW || opts.measuredH) {
    const measW = parseFloat(opts.measuredW) || widthMm;
    const measH = parseFloat(opts.measuredH) || heightMm;
    const adj = calculateCalibrationAdjustment(widthMm, measW, heightMm, measH, dpi);
    calibrationScale = { scaleX: adj.scaleFactorX, scaleY: adj.scaleFactorY };
    console.log('\n[CALIPER RE-CALIBRATION DETECTED]');
    console.log(`  Nominal Size:  ${widthMm} x ${heightMm} mm`);
    console.log(`  Measured Size: ${measW} x ${measH} mm`);
    console.log(`  Correction:    Sx = ${adj.scaleFactorX.toFixed(4)} (${((adj.scaleFactorX - 1) * 100).toFixed(2)}%), Sy = ${adj.scaleFactorY.toFixed(4)} (${((adj.scaleFactorY - 1) * 100).toFixed(2)}%)`);
  }

  // Construct Sample Multi-Element Canvas Document with Placeholders
  const doc: CanvasDocument = {
    widthMm,
    heightMm,
    gapMm: 2,
    elements: [
      {
        id: 'border-box',
        type: 'box',
        left: 1.5,
        top: 1.5,
        width: widthMm - 3,
        height: heightMm - 3,
        lineWidth: 0.35,
      } as CanvasBoxElement,
      {
        id: 'batch-title',
        type: 'text',
        text: 'BATCH ITEM #{seq:001}',
        left: 4,
        top: 3.5,
        fontSize: 12,
      } as CanvasTextElement,
      {
        id: 'barcode-el',
        type: 'barcode',
        data: 'SN-{seq:001}',
        left: 4,
        top: 10,
        height: 8,
        narrowDots: 2,
      } as CanvasBarcodeElement,
      {
        id: 'qr-el',
        type: 'qr',
        data: 'https://trace.io/lot/{seq:001}',
        left: widthMm - 18,
        top: 9,
        sizeMm: 14,
      } as CanvasQrElement,
      {
        id: 'footer-txt',
        type: 'text',
        text: `${dpi}DPI | ${sensorType.toUpperCase()} | P9 VALID`,
        left: 4,
        top: heightMm - 6.5,
        fontSize: 7,
      } as CanvasTextElement,
    ],
  };

  // Run Pre-Flight Validation
  console.log('\n[PRE-FLIGHT PRINT VALIDATION]');
  const report = validateCanvasPrintJob(doc);
  if (report.isValid) {
    console.log('  Status: PASS (No fatal errors detected)');
  } else {
    console.log('  Status: FAIL');
    for (const err of report.errors) {
      console.log(`  [ERROR] ${err.code}: ${err.message} (Fix: ${err.suggestedFix})`);
    }
  }
  if (report.warnings.length > 0) {
    for (const w of report.warnings) {
      console.log(`  [WARNING] ${w.code}: ${w.message}`);
    }
  }

  // Export Batch Print Job
  const batchResult = exportBatchCanvasJob(doc, batchCount, {
    dpi,
    sensorType,
    blackMarkHeightMm: blineMm,
    startSequence: startSeq,
    stepSequence: stepSeq,
    padDigits,
    calibrationScale,
  });

  console.log(`\nGenerated Batch Job: ${batchResult.labelCount} labels, ${batchResult.totalBytes} binary bytes`);

  // Print Preview Snippet
  console.log('\n--- TSPL Script Preview (First 25 lines) ---');
  const lines = batchResult.tsplAscii.split('\r\n').slice(0, 25);
  console.log(lines.join('\n'));
  if (batchResult.tsplAscii.split('\r\n').length > 25) {
    console.log('... [remaining TSPL commands omitted]');
  }
  console.log('-------------------------------------------');

  // Save to file if requested
  if (opts.out) {
    fs.writeFileSync(opts.out, batchResult.binaryPayload);
    console.log(`\nSaved binary TSPL payload to: ${opts.out}`);
  }

  // Send to Network Printer if IP specified
  if (opts.ip) {
    console.log(`\nDirect socket print requested for IP: ${opts.ip}`);
    await sendToNetworkPrinter(opts.ip, 9100, batchResult.binaryPayload);
  } else {
    console.log('\nTip: Run with --ip <printer_ip> to print directly to your thermal printer.');
  }

  console.log('\nPhase 9 CLI execution complete.');
}

main().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
