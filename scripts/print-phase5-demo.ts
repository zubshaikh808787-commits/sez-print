#!/usr/bin/env node
/**
 * Phase 5: Physical Verification Print Script (Barcode & QR Code Elements)
 *
 * Usage:
 *   npx tsx scripts/print-phase5-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>      Label width in mm (default: 50)
 *   --labelHeight <mm>     Label height in mm (default: 30)
 *   --gap <mm>             Gap in mm (default: 2)
 *   --title <text>         Title text (default: "INVENTORY ASSET")
 *   --barcode <data>       1D Barcode data string (default: "SP-10045")
 *   --barcodeHeight <mm>   Barcode height in mm (default: 10)
 *   --qr <data>            QR Code data string (default: "https://sez-print.local/verify")
 *   --qrSize <mm>          QR Code requested size in mm (default: 14)
 *   --copies <count>       Print copies (default: 1)
 *   --ip <address>         Printer network IP address (optional: sends over TCP 9100)
 *   --out <filepath>       Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  calculateCode128WidthMm,
  resolveQrCellWidth,
  calculateQrFootprintMm,
  validateScannability,
  exportCanvasToTspl,
  type CanvasDocument,
  type CanvasBarcodeElement,
  type CanvasQrElement,
} from '../src/printing/canvas-export';
import { PRINTER_DPI, DOTS_PER_MM } from '../src/printing/calibration';

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

async function sendToNetworkPrinter(ip: string, port: number, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    console.log(`Connecting to printer at ${ip}:${port}...`);
    client.connect(port, ip, () => {
      console.log('Connected! Sending Phase 5 Barcode & QR TSPL payload...');
      client.write(data, 'utf-8', (err) => {
        if (err) {
          client.destroy();
          return reject(err);
        }
        console.log(`Sent ${Buffer.byteLength(data, 'utf-8')} bytes successfully.`);
        client.end();
      });
    });

    client.on('close', () => {
      console.log('Connection closed.');
      resolve();
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Connection to ${ip}:${port} timed out after 5000ms.`));
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const opts = parseArgs();

  const widthMm = parseFloat(opts.labelWidth || '50');
  const heightMm = parseFloat(opts.labelHeight || '30');
  const gapMm = parseFloat(opts.gap || '2');
  const title = opts.title || 'INVENTORY ASSET';
  const barcodeData = opts.barcode || 'SP-10045';
  const barcodeHeight = parseFloat(opts.barcodeHeight || '10');
  const qrData = opts.qr || 'https://sez-print.local/verify';
  const qrSize = parseFloat(opts.qrSize || '14');
  const copies = parseInt(opts.copies || '1', 10);

  console.log('==================================================');
  console.log(' SEZ-PRINT: Phase 5 Barcode & QR Code Engine');
  console.log('==================================================');
  console.log(`Hardware Configuration:`);
  console.log(`  Printer DPI:       ${PRINTER_DPI}`);
  console.log(`  Dots per mm:       ${DOTS_PER_MM.toFixed(8)}`);
  console.log(`  Label Geometry:    ${widthMm.toFixed(2)} mm × ${heightMm.toFixed(2)} mm (gap: ${gapMm} mm)`);
  console.log(`  Label Resolution:  ${Math.round(widthMm * DOTS_PER_MM)} × ${Math.round(heightMm * DOTS_PER_MM)} dots\n`);

  // Define elements
  const barcodeEl: CanvasBarcodeElement = {
    id: 'bc-1',
    type: 'barcode',
    data: barcodeData,
    left: 4,
    top: 9,
    height: barcodeHeight,
    narrowDots: 2,
    readable: 1,
  };

  const qrEl: CanvasQrElement = {
    id: 'qr-1',
    type: 'qr',
    data: qrData,
    left: 31,
    top: 9,
    sizeMm: qrSize,
    eccLevel: 'M',
  };

  // Run Scannability Validations
  console.log('Scannability & Footprint Analysis:');
  const bcResult = validateScannability(barcodeEl, widthMm, heightMm);
  console.log(`  [1D Barcode: Code 128]`);
  console.log(`    Data:            "${barcodeData}"`);
  console.log(`    Calculated Size: ${bcResult.calculatedWidthMm} mm × ${bcResult.calculatedHeightMm} mm`);
  console.log(`    Scannable:       ${bcResult.isScannable ? 'YES (High Readability)' : 'NO / WARNING'}`);
  if (bcResult.warnings.length > 0) {
    bcResult.warnings.forEach((w) => console.log(`    ! Warning: ${w}`));
  }

  const qrResult = validateScannability(qrEl, widthMm, heightMm);
  const cellDots = resolveQrCellWidth(qrSize, qrData.length);
  console.log(`\n  [2D QR Code]`);
  console.log(`    Data:            "${qrData}"`);
  console.log(`    Requested Size:  ${qrSize} mm × ${qrSize} mm`);
  console.log(`    Resolved Cell:   ${cellDots} dots/module (~${(cellDots / DOTS_PER_MM).toFixed(3)} mm/module)`);
  console.log(`    Actual Footprint:${qrResult.calculatedWidthMm} mm × ${qrResult.calculatedHeightMm} mm`);
  console.log(`    Scannable:       ${qrResult.isScannable ? 'YES (High Readability)' : 'NO / WARNING'}`);
  if (qrResult.warnings.length > 0) {
    qrResult.warnings.forEach((w) => console.log(`    ! Warning: ${w}`));
  }

  // Create document
  const doc: CanvasDocument = {
    widthMm,
    heightMm,
    gapMm,
    direction: 1,
    elements: [
      // Outer footprint guide
      {
        id: 'boundary',
        type: 'box',
        left: 0,
        top: 0,
        width: widthMm,
        height: heightMm,
        lineWidth: 0.35,
      },
      // Header Text
      {
        id: 'header',
        type: 'text',
        text: title,
        left: 4,
        top: 3,
        fontSize: 12,
      },
      // Code 128 Barcode
      barcodeEl,
      // QR Code
      qrEl,
      // Subtext
      {
        id: 'footer',
        type: 'text',
        text: '304 DPI CALIBRATED TSPL',
        left: 4,
        top: 24,
        fontSize: 8,
      },
    ],
  };

  const tspl = exportCanvasToTspl(doc, { copies });

  console.log('\nGenerated TSPL Script:');
  console.log('--------------------------------------------------');
  console.log(tspl);
  console.log('--------------------------------------------------');

  if (opts.out) {
    fs.writeFileSync(opts.out, tspl, 'utf-8');
    console.log(`Saved TSPL script to: ${opts.out}`);
  }

  if (opts.ip) {
    const port = parseInt(opts.port || '9100', 10);
    try {
      await sendToNetworkPrinter(opts.ip, port, tspl);
      console.log('\n[SUCCESS] Phase 5 Barcode & QR Code label sent to printer.');
      console.log('Physical Caliper & Scanner Verification Steps:');
      console.log('  1. Measure barcode footprint with calipers (target ~25mm × 10mm).');
      console.log('  2. Measure QR code footprint with calipers (target ~12mm-14mm).');
      console.log('  3. Scan barcode with handheld 1D scanner -> confirm decodes "${barcodeData}".');
      console.log('  4. Scan QR code with mobile camera -> confirm decodes "${qrData}".');
    } catch (err) {
      console.error('\n[ERROR] Failed to send to network printer:', err);
      process.exit(1);
    }
  } else {
    console.log('\n[INFO] To send directly to a network printer, supply --ip <printer_ip>.');
    console.log('Example:');
    console.log('  npm run print:phase5 -- --ip 192.168.1.100');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
