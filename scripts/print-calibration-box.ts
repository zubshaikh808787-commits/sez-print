#!/usr/bin/env node
/**
 * Phase 0: Calibration CLI Tool
 *
 * Usage:
 *   npx tsx scripts/print-calibration-box.ts [options]
 *
 * Options:
 *   --labelWidth <mm>   Label width in mm (default: 50)
 *   --labelHeight <mm>  Label height in mm (default: 30)
 *   --boxWidth <mm>     Calibration box width in mm (default: 40)
 *   --boxHeight <mm>    Calibration box height in mm (default: 20)
 *   --x <mm>            Box top-left X in mm (default: centered)
 *   --y <mm>            Box top-left Y in mm (default: centered)
 *   --gap <mm>          Label gap in mm (default: 2)
 *   --thickness <mm>    Box border thickness in mm (default: 0.35)
 *   --ip <address>      Printer network IP address (optional: sends over TCP port 9100)
 *   --out <filepath>    Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import { generateCalibrationTspl, PRINTER_DPI, DOTS_PER_MM } from '../src/printing/calibration';

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
      console.log('Connected! Sending raw TSPL calibration payload...');
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
  const boxWidthMm = parseFloat(args.boxWidth || '40');
  const boxHeightMm = parseFloat(args.boxHeight || '20');
  const gapMm = parseFloat(args.gap || '2');
  const thicknessMm = parseFloat(args.thickness || '0.35');
  const xMm = args.x ? parseFloat(args.x) : undefined;
  const yMm = args.y ? parseFloat(args.y) : undefined;

  console.log('====================================================');
  console.log('  Phase 0: Ground-Truth TSPL Calibration Generator  ');
  console.log('====================================================');
  console.log(`Hardcoded Printer DPI : ${PRINTER_DPI}`);
  console.log(`Computed DOTS_PER_MM  : ${DOTS_PER_MM.toFixed(8)} (unrounded float)`);
  console.log(`Label Size            : ${labelWidthMm} mm × ${labelHeightMm} mm (GAP ${gapMm} mm)`);
  console.log(`Target Box Size       : ${boxWidthMm} mm × ${boxHeightMm} mm`);
  console.log('----------------------------------------------------');

  const result = generateCalibrationTspl({
    labelWidthMm,
    labelHeightMm,
    boxWidthMm,
    boxHeightMm,
    xMm,
    yMm,
    thicknessMm,
    gapMm,
  });

  const { dots, tspl } = result;

  console.log('Predicted Dot Coordinates:');
  console.log(`  Label Dots : ${dots.labelWidthDots} × ${dots.labelHeightDots} dots`);
  console.log(`  Box X0, Y0 : (${dots.x0}, ${dots.y0})`);
  console.log(`  Box X1, Y1 : (${dots.x1}, ${dots.y1})`);
  console.log(`  Box Size   : ${dots.boxWidthDots} × ${dots.boxHeightDots} dots`);
  console.log(`  Stroke     : ${dots.thicknessDots} dots`);
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
      await sendToNetworkPrinter(args.ip, port, result.bytes);
      console.log('SUCCESS: Calibration box sent to physical printer.');
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
