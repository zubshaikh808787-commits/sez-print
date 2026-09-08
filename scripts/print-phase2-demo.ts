#!/usr/bin/env node
/**
 * Phase 2: Physical Verification Print Script (Canvas Model -> TSPL Box)
 *
 * Usage:
 *   npx tsx scripts/print-phase2-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>   Label width in mm (default: 50)
 *   --labelHeight <mm>  Label height in mm (default: 30)
 *   --gap <mm>          Gap in mm (default: 2)
 *   --boxLeft <mm>      Box left position in mm (default: 5)
 *   --boxTop <mm>       Box top position in mm (default: 5)
 *   --boxWidth <mm>     Box width in mm (default: 40)
 *   --boxHeight <mm>    Box height in mm (default: 20)
 *   --thickness <mm>    Box line thickness in mm (default: 0.35)
 *   --copies <count>    Print copies (default: 1)
 *   --ip <address>      Printer network IP address (optional: sends over TCP 9100)
 *   --out <filepath>    Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import { exportCanvasToTspl, mmToScreenPx, type CanvasDocument } from '../src/printing/canvas-export';
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
      console.log('Connected! Sending Phase 2 Canvas TSPL payload...');
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
  const boxLeft = parseFloat(opts.boxLeft || '5');
  const boxTop = parseFloat(opts.boxTop || '5');
  const boxWidth = parseFloat(opts.boxWidth || '40');
  const boxHeight = parseFloat(opts.boxHeight || '20');
  const thickness = parseFloat(opts.thickness || '0.35');
  const copies = parseInt(opts.copies || '1', 10);

  console.log('================================================================');
  console.log('  SEZ PRINT — Phase 2: Canvas Model -> TSPL Box Print Demo');
  console.log('================================================================');
  console.log(`Printer DPI:         ${PRINTER_DPI}`);
  console.log(`Dots per mm:         ${DOTS_PER_MM.toFixed(8)} (unrounded: ${PRINTER_DPI} / 25.4)`);
  console.log('----------------------------------------------------------------');
  console.log(`Label Size (mm):     ${labelWidth} mm × ${labelHeight} mm (Gap: ${gap} mm)`);
  console.log(`Box Position (mm):   left=${boxLeft} mm, top=${boxTop} mm`);
  console.log(`Box Dimensions (mm): width=${boxWidth} mm, height=${boxHeight} mm, thickness=${thickness} mm`);
  console.log('----------------------------------------------------------------');

  // Preview derived coordinate representations
  const previewScale = 6.0; // 6 px per mm
  console.log(`Screen Preview (at ${previewScale} px/mm):`);
  console.log(`  Label:  ${mmToScreenPx(labelWidth, previewScale)} × ${mmToScreenPx(labelHeight, previewScale)} px`);
  console.log(`  Box:    x=${mmToScreenPx(boxLeft, previewScale)}, y=${mmToScreenPx(boxTop, previewScale)}, w=${mmToScreenPx(boxWidth, previewScale)}, h=${mmToScreenPx(boxHeight, previewScale)} px`);
  console.log('----------------------------------------------------------------');

  const x0Dots = Math.round(boxLeft * DOTS_PER_MM);
  const y0Dots = Math.round(boxTop * DOTS_PER_MM);
  const x1Dots = Math.round((boxLeft + boxWidth) * DOTS_PER_MM);
  const y1Dots = Math.round((boxTop + boxHeight) * DOTS_PER_MM);
  const tDots = Math.max(1, Math.round(thickness * DOTS_PER_MM));

  console.log('Printer Dots:');
  console.log(`  BOX ${x0Dots},${y0Dots},${x1Dots},${y1Dots},${tDots}`);
  console.log(`  Span: ${x1Dots - x0Dots} dots horizontal × ${y1Dots - y0Dots} dots vertical`);
  console.log('----------------------------------------------------------------');

  const canvasDoc: CanvasDocument = {
    widthMm: labelWidth,
    heightMm: labelHeight,
    gapMm: gap,
    direction: 1,
    elements: [
      {
        id: 'box-1',
        type: 'box',
        left: boxLeft,
        top: boxTop,
        width: boxWidth,
        height: boxHeight,
        lineWidth: thickness,
      },
    ],
  };

  const tspl = exportCanvasToTspl(canvasDoc, { copies });

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
      console.log('[SUCCESS] Phase 2 box layout printed directly to network printer!');
    } catch (err) {
      console.error('[ERROR] Failed to send to network printer:', err);
      process.exit(1);
    }
  } else {
    console.log('To print directly over network:');
    console.log(`  npm run print:phase2 -- --ip <printer_ip> [options]`);
  }

  console.log('\n[TEST CHECKLIST]');
  console.log(`- Measure printed outer width: target = ${boxWidth} mm (Tolerance: ±0.5 mm)`);
  console.log(`- Measure printed outer height: target = ${boxHeight} mm (Tolerance: ±0.5 mm)`);
  console.log(`- Measure left margin to edge:  target = ${boxLeft} mm`);
  console.log(`- Measure top margin to edge:   target = ${boxTop} mm`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
