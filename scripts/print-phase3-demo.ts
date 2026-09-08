#!/usr/bin/env node
/**
 * Phase 3 (Reworked): Size-First Import Flow with Ruled Measurement Canvas Demo
 *
 * Demonstrates:
 * 1. Physical size commitment first (label width & height in mm).
 * 2. Ruler scale guide marks (10mm major ticks, 1mm minor ticks).
 * 3. Freeform image placement overlay (stored in mm).
 * 4. TSPL boundary footprint verification (non-printing background reference guarantee).
 * 5. Socket transmission over TCP port 9100.
 *
 * Usage:
 *   npx tsx scripts/print-phase3-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>    Committed physical label width in mm (default: 50)
 *   --labelHeight <mm>   Committed physical label height in mm (default: 30)
 *   --gap <mm>           Gap in mm (default: 2)
 *   --imgLeft <mm>       Freeform image placement X in mm (default: 0)
 *   --imgTop <mm>        Freeform image placement Y in mm (default: 0)
 *   --imgWidth <mm>      Freeform image placement width in mm (default: 50)
 *   --imgHeight <mm>     Freeform image placement height in mm (default: 30)
 *   --thickness <mm>     Boundary line thickness in mm (default: 0.35)
 *   --copies <count>     Print copies (default: 1)
 *   --ip <address>       Printer network IP address (optional: sends over TCP 9100)
 *   --out <filepath>     Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  exportCanvasBoundaryToTspl,
  generateRulerTicks,
  mmToScreenPx,
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
      console.log('Connected! Sending Phase 3 Canvas Boundary TSPL payload...');
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
      client.destroy();
      reject(err);
    });
  });
}

async function main() {
  const opts = parseArgs();

  const labelWidth = parseFloat(opts.labelWidth || '50');
  const labelHeight = parseFloat(opts.labelHeight || '30');
  const gap = parseFloat(opts.gap || '2');
  const imgLeft = parseFloat(opts.imgLeft || '0');
  const imgTop = parseFloat(opts.imgTop || '0');
  const imgWidth = parseFloat(opts.imgWidth || String(labelWidth));
  const imgHeight = parseFloat(opts.imgHeight || String(labelHeight));
  const thickness = parseFloat(opts.thickness || '0.35');
  const copies = parseInt(opts.copies || '1', 10);

  console.log('================================================================');
  console.log('  SEZ PRINT — Phase 3 (Reworked): Size-First Ruled Canvas Demo');
  console.log('================================================================');
  console.log(`Printer DPI:             ${PRINTER_DPI}`);
  console.log(`Dots per mm:             ${DOTS_PER_MM.toFixed(8)}`);
  console.log('----------------------------------------------------------------');
  console.log(`1. Committed Label Size: ${labelWidth} mm × ${labelHeight} mm (Gap: ${gap} mm)`);
  console.log(`2. Freeform Image Layer: ${imgWidth} × ${imgHeight} mm at (${imgLeft}, ${imgTop}) mm`);
  console.log('----------------------------------------------------------------');

  // Ruler Scale Guide Inspection
  const horizontalTicks = generateRulerTicks(labelWidth);
  const verticalTicks = generateRulerTicks(labelHeight);
  const majorHTicks = horizontalTicks.filter((t) => t.isMajor).map((t) => `${t.mm}mm`).join(', ');
  const majorVTicks = verticalTicks.filter((t) => t.isMajor).map((t) => `${t.mm}mm`).join(', ');

  console.log('Ruler Measurement Scale Guides:');
  console.log(`  Top Ruler (Width):     ${horizontalTicks.length} ticks (${majorHTicks})`);
  console.log(`  Left Ruler (Height):   ${verticalTicks.length} ticks (${majorVTicks})`);
  console.log('----------------------------------------------------------------');

  // Non-printing note
  console.log('TSPL Print Strategy:');
  console.log('  Background reference photo is NON-PRINTING (0 bitmap ink).');
  console.log('  Only the physical canvas boundary box is emitted for measurement.');
  console.log('----------------------------------------------------------------');

  const previewScale = 6.0;
  console.log(`Screen Preview (at ${previewScale} px/mm):`);
  console.log(`  Canvas:  ${mmToScreenPx(labelWidth, previewScale)} × ${mmToScreenPx(labelHeight, previewScale)} px`);
  console.log('----------------------------------------------------------------');

  const x1Dots = Math.round(labelWidth * DOTS_PER_MM);
  const y1Dots = Math.round(labelHeight * DOTS_PER_MM);
  const tDots = Math.max(1, Math.round(thickness * DOTS_PER_MM));
  console.log('Printer Dots (Boundary):');
  console.log(`  BOX 0,0,${x1Dots},${y1Dots},${tDots}`);
  console.log(`  Span: ${x1Dots} dots wide × ${y1Dots} dots high`);
  console.log('----------------------------------------------------------------');

  const tspl = exportCanvasBoundaryToTspl(
    {
      widthMm: labelWidth,
      heightMm: labelHeight,
      gapMm: gap,
      direction: 1,
      lineWidth: thickness,
    },
    { copies },
  );

  console.log('Generated TSPL Payload:');
  console.log('<<< START TSPL >>>');
  console.log(tspl.trim());
  console.log('<<< END TSPL >>>');
  console.log('----------------------------------------------------------------');

  if (opts.out) {
    fs.writeFileSync(opts.out, tspl, 'utf-8');
    console.log(`[OK] Wrote TSPL script to: ${opts.out}`);
  }

  if (opts.ip) {
    const port = parseInt(opts.port || '9100', 10);
    try {
      await sendToNetworkPrinter(opts.ip, port, tspl);
      console.log('[SUCCESS] Canvas boundary printed directly to network printer!');
    } catch (err) {
      console.error('[ERROR] Failed to send to network printer:', err);
      process.exit(1);
    }
  } else {
    console.log('To print boundary directly over network:');
    console.log(`  npm run print:phase3 -- --ip <printer_ip> [options]`);
  }

  console.log('\n[PHYSICAL VERIFICATION CHECKLIST]');
  console.log(`1. Place the printed label under your real reference label or measure with calipers.`);
  console.log(`2. Outer boundary width must match ${labelWidth} mm (±0.5 mm).`);
  console.log(`3. Outer boundary height must match ${labelHeight} mm (±0.5 mm).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
