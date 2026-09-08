#!/usr/bin/env node
/**
 * Phase 7: Full End-to-End Print Pipeline Demo CLI Script
 *
 * Demonstrates universal label generation across variable physical label sizes:
 * - Dynamic size configuration (50x30, 60x40, 80x50 mm)
 * - Optional 1-bit monochrome bitmap raster background
 * - Overlay vector elements (boundary box, text, Code 128 barcode, QR code)
 * - Atomic binary TSPL job packaging (SIZE, GAP, DIRECTION, CLS, BITMAP, overlays, PRINT)
 * - Network TCP dispatch to thermal label printers
 *
 * Usage:
 *   npx tsx scripts/print-phase7-demo.ts [options]
 *
 * Options:
 *   --size <preset>      Preset: 50x30 | 60x40 | 80x50 (default: 50x30)
 *   --labelWidth <mm>    Custom width in mm
 *   --labelHeight <mm>   Custom height in mm
 *   --withBitmap <bool>  Include monochrome bitmap background raster (default: true)
 *   --pattern <pattern>  Bitmap pattern: checker | border | solid (default: checker)
 *   --copies <count>     Number of copies (default: 1)
 *   --ip <address>       Printer IP address (optional: sends over TCP 9100)
 *   --out <filepath>     Save binary payload to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  exportUnifiedCanvasJob,
  createMonochromePatternRaster,
  type CanvasDocument,
  type CanvasBitmapRaster,
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

async function sendToNetworkPrinter(ip: string, port: number, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    console.log(`Connecting to printer at ${ip}:${port}...`);
    client.connect(port, ip, () => {
      console.log('Connected! Sending Phase 7 End-to-End TSPL binary payload...');
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

  let widthMm = 50;
  let heightMm = 30;
  let gapMm = 2;

  const preset = opts.size ?? '50x30';
  if (preset === '60x40') {
    widthMm = 60;
    heightMm = 40;
    gapMm = 3;
  } else if (preset === '80x50') {
    widthMm = 80;
    heightMm = 50;
    gapMm = 2;
  }

  if (opts.labelWidth) widthMm = parseFloat(opts.labelWidth);
  if (opts.labelHeight) heightMm = parseFloat(opts.labelHeight);
  const copies = parseInt(opts.copies ?? '1', 10);
  const withBitmap = opts.withBitmap !== 'false';
  const pattern = (opts.pattern as 'checker' | 'border' | 'solid') ?? 'checker';

  console.log('====================================================');
  console.log('  SEZ PRINT — PHASE 7 END-TO-END PIPELINE DEMO');
  console.log('====================================================');
  console.log(`Printer DPI:         ${PRINTER_DPI}`);
  console.log(`Dots per mm:         ${DOTS_PER_MM.toFixed(4)}`);
  console.log(`Label Geometry:      ${widthMm} × ${heightMm} mm (GAP ${gapMm} mm)`);
  console.log(`Bitmap Background:   ${withBitmap ? `Yes (${pattern})` : 'No'}`);
  console.log(`Copies:              ${copies}`);
  console.log('----------------------------------------------------');

  // 1. Create document model
  const doc: CanvasDocument = {
    widthMm,
    heightMm,
    gapMm,
    direction: 1,
    elements: [
      {
        id: 'title-text',
        type: 'text',
        text: 'SEZ PRINT ENGINE',
        left: 4,
        top: 3,
        fontSize: 14,
      },
      {
        id: 'desc-text',
        type: 'text',
        text: `${widthMm}x${heightMm}mm 304DPI`,
        left: 4,
        top: 8,
        fontSize: 8,
      },
      {
        id: 'barcode-code128',
        type: 'barcode',
        data: 'SP-PH7-2026',
        left: 4,
        top: 13,
        height: Math.min(10, heightMm - 18),
        narrowDots: 2,
        readable: 1,
      },
      {
        id: 'qr-code',
        type: 'qr',
        data: `https://sez-print.app/label/${widthMm}x${heightMm}`,
        left: widthMm - Math.min(18, heightMm - 6) - 4,
        top: 4,
        sizeMm: Math.min(18, heightMm - 6),
      },
    ],
  };

  // 2. Generate optional background bitmap raster
  let bitmap: CanvasBitmapRaster | undefined;
  if (withBitmap) {
    const rasterWidthDots = Math.round(widthMm * DOTS_PER_MM);
    const rasterHeightDots = Math.round(heightMm * DOTS_PER_MM);
    // Create light patterned raster background
    bitmap = createMonochromePatternRaster(
      rasterWidthDots,
      rasterHeightDots,
      pattern,
      0,
      0,
    );
    console.log(
      `Generated 1bpp raster: ${rasterWidthDots}×${rasterHeightDots} dots (${bitmap.bytesPerRow} bytes/row, ${bitmap.data.length} bytes total)`,
    );
  }

  // 3. Export unified print job
  const job = exportUnifiedCanvasJob(doc, {
    bitmap,
    copies,
    printBoundary: true,
  });

  console.log('----------------------------------------------------');
  console.log('GENERATED TSPL INSPECTION (ASCII PREVIEW):');
  console.log('----------------------------------------------------');
  console.log(job.tsplAscii.trimEnd());
  console.log('----------------------------------------------------');
  console.log(`Binary Payload Size: ${job.totalBytes} bytes`);
  console.log(`Has Bitmap:          ${job.hasBitmap}`);
  console.log('----------------------------------------------------');

  // 4. Save to file if requested
  if (opts.out) {
    fs.writeFileSync(opts.out, Buffer.from(job.binaryPayload));
    console.log(`Saved binary TSPL payload to: ${opts.out}`);
  }

  // 5. Send to physical network printer if IP specified
  if (opts.ip) {
    const port = parseInt(opts.port ?? '9100', 10);
    try {
      await sendToNetworkPrinter(opts.ip, port, job.binaryPayload);
      console.log('Physical print job successfully dispatched!');
    } catch (err) {
      console.error('Failed to send print job to printer:', err);
      process.exit(1);
    }
  } else {
    console.log('NOTE: To print to a network printer, provide --ip <address>');
    console.log('Example: npm run print:phase7 -- --ip 192.168.1.100');
  }
}

main().catch((err) => {
  console.error('Error in Phase 7 demo script:', err);
  process.exit(1);
});
