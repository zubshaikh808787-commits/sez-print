#!/usr/bin/env node
/**
 * Phase 1: Physical Verification Print Script (Box + Text + Barcode + QR)
 *
 * Usage:
 *   npx tsx scripts/print-phase1-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>   Label width in mm (default: 50)
 *   --labelHeight <mm>  Label height in mm (default: 30)
 *   --gap <mm>          Gap in mm (default: 2)
 *   --barcode <data>    Barcode data (default: "PHASE1-TEST")
 *   --qr <data>         QR code data (default: "https://sezprint.io/phase1")
 *   --ip <address>      Printer network IP address (optional: sends over TCP 9100)
 *   --out <filepath>    Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import { TsplBuilder, PRINTER_DPI, DOTS_PER_MM } from '../src/printing/tspl-builder';

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
      console.log('Connected! Sending raw TSPL Phase 1 payload...');
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

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Timeout connecting to ${ip}:${port}`));
    });
  });
}

async function main() {
  const args = parseArgs();

  const labelWidthMm = parseFloat(args.labelWidth || '50');
  const labelHeightMm = parseFloat(args.labelHeight || '30');
  const gapMm = parseFloat(args.gap || '2');
  const barcodeData = args.barcode || 'PHASE1-TEST';
  const qrData = args.qr || 'https://sezprint.io/phase1';

  // Layout calculations in mm:
  // Outer reference box: 44mm x 24mm centered on 50x30mm label
  const boxWMm = Math.min(44, labelWidthMm - 6);
  const boxHMm = Math.min(24, labelHeightMm - 6);
  const boxXMm = (labelWidthMm - boxWMm) / 2;
  const boxYMm = (labelHeightMm - boxHMm) / 2;

  const builder = new TsplBuilder()
    .setSize(labelWidthMm, labelHeightMm)
    .setGap(gapMm)
    .setDirection(1)
    .clear()
    // 1. Calibration boundary box: exactly boxWMm x boxHMm
    .drawBox(boxXMm, boxYMm, boxWMm, boxHMm, 0.35)
    // 2. Title text at (boxXMm + 2, boxYMm + 2)
    .drawText(boxXMm + 2, boxYMm + 2, 'PHASE 1 VERIFY', 12)
    // 3. Small edge case box (5mm x 5mm) in top right inside corner
    .drawBox(boxXMm + boxWMm - 7, boxYMm + 2, 5, 5, 0.25)
    // 4. Barcode at (boxXMm + 2, boxYMm + 8), height 8mm
    .drawBarcode(boxXMm + 2, boxYMm + 8, barcodeData, '128', { heightMm: 8, readable: 1 })
    .print(1);

  const tspl = builder.build();
  const bytes = builder.toBytes();

  console.log('====================================================');
  console.log('  Phase 1: TSPL Command Builder Verification Print  ');
  console.log('====================================================');
  console.log(`Printer DPI           : ${PRINTER_DPI}`);
  console.log(`DOTS_PER_MM           : ${DOTS_PER_MM.toFixed(8)}`);
  console.log(`Label Size            : ${labelWidthMm} mm × ${labelHeightMm} mm`);
  console.log(`Outer Box Size        : ${boxWMm} mm × ${boxHMm} mm at (${boxXMm}, ${boxYMm}) mm`);
  console.log(`Small Test Box        : 5 mm × 5 mm`);
  console.log(`Barcode Data          : "${barcodeData}" (Code 128)`);
  console.log('----------------------------------------------------');
  console.log('Generated Raw TSPL Commands:');
  console.log(tspl.trim());
  console.log('----------------------------------------------------');

  if (args.out) {
    fs.writeFileSync(args.out, tspl, 'utf8');
    console.log(`Saved TSPL script to: ${args.out}`);
  }

  if (args.ip) {
    const port = parseInt(args.port || '9100', 10);
    try {
      await sendToNetworkPrinter(args.ip, port, bytes);
      console.log('SUCCESS: Phase 1 test label sent to physical printer.');
    } catch (err) {
      console.error('ERROR: Failed to send to printer:', err);
      process.exit(1);
    }
  } else {
    console.log('NOTE: To send directly to a network printer, add `--ip <printer_ip>`.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
