#!/usr/bin/env node
/**
 * Phase 4: Physical Verification Print Script (Text Elements & Font Sizing)
 *
 * Usage:
 *   npx tsx scripts/print-phase4-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>     Label width in mm (default: 50)
 *   --labelHeight <mm>    Label height in mm (default: 30)
 *   --gap <mm>            Gap in mm (default: 2)
 *   --title <text>        Primary title text (default: "SAMPLE PRODUCT")
 *   --titleSize <pt>      Title font size in pt (default: 18)
 *   --subtitle <text>     Subtitle / SKU text (default: "SKU: 7788-ABC")
 *   --subtitleSize <pt>   Subtitle font size in pt (default: 12)
 *   --price <text>        Price text (default: "$29.99")
 *   --priceSize <pt>      Price font size in pt (default: 24)
 *   --copies <count>      Print copies (default: 1)
 *   --ip <address>        Printer network IP address (optional: sends over TCP 9100)
 *   --out <filepath>      Save raw TSPL script to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  resolveTsplFont,
  exportCanvasToTspl,
  mmToScreenPx,
  type CanvasDocument,
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
      console.log('Connected! Sending Phase 4 Text Elements TSPL payload...');
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

  const titleText = opts.title || 'SAMPLE PRODUCT';
  const titleSize = parseFloat(opts.titleSize || '18');

  const subtitleText = opts.subtitle || 'SKU: 7788-ABC';
  const subtitleSize = parseFloat(opts.subtitleSize || '12');

  const priceText = opts.price || '$29.99';
  const priceSize = parseFloat(opts.priceSize || '24');

  const copies = parseInt(opts.copies || '1', 10);

  console.log('================================================================');
  console.log('  SEZ PRINT — Phase 4: Text Elements & Font Sizing Demo');
  console.log('================================================================');
  console.log(`Printer DPI:         ${PRINTER_DPI}`);
  console.log(`Dots per mm:         ${DOTS_PER_MM.toFixed(8)}`);
  console.log('----------------------------------------------------------------');
  console.log(`Label Size:          ${labelWidth} mm × ${labelHeight} mm (Gap: ${gap} mm)`);
  console.log('----------------------------------------------------------------');

  const textItems = [
    { id: 't1', text: titleText, size: titleSize, left: 4, top: 4 },
    { id: 't2', text: subtitleText, size: subtitleSize, left: 4, top: 12 },
    { id: 't3', text: priceText, size: priceSize, left: 4, top: 19 },
  ];

  console.log('Deterministic Font Resolutions:');
  for (const item of textItems) {
    const fontRes = resolveTsplFont(item.size);
    const xDots = Math.round(item.left * DOTS_PER_MM);
    const yDots = Math.round(item.top * DOTS_PER_MM);
    console.log(`  "${item.text}":`);
    console.log(`    Position:       ${item.left} mm, ${item.top} mm  ->  (${xDots}, ${yDots}) dots`);
    console.log(`    Font Setting:   Size ${item.size} pt -> Font "${fontRes.font}", Multiplier (${fontRes.xMulti}x, ${fontRes.yMulti}y)`);
    console.log(`    Physical Cap:   ${fontRes.capHeightMm.toFixed(2)} mm height (${fontRes.dotsHeight} dots)`);
  }
  console.log('----------------------------------------------------------------');

  const previewScale = 6.0;
  console.log(`Screen Preview (at ${previewScale} px/mm):`);
  console.log(`  Canvas Size: ${mmToScreenPx(labelWidth, previewScale)} × ${mmToScreenPx(labelHeight, previewScale)} px`);
  for (const item of textItems) {
    const fontRes = resolveTsplFont(item.size);
    console.log(`  Text "${item.text}": x=${mmToScreenPx(item.left, previewScale)} px, y=${mmToScreenPx(item.top, previewScale)} px, rendered cap=${(fontRes.capHeightMm * previewScale).toFixed(1)} px`);
  }
  console.log('----------------------------------------------------------------');

  const canvasDoc: CanvasDocument = {
    widthMm: labelWidth,
    heightMm: labelHeight,
    gapMm: gap,
    direction: 1,
    elements: [
      {
        id: 'border-box',
        type: 'box',
        left: 1,
        top: 1,
        width: labelWidth - 2,
        height: labelHeight - 2,
        lineWidth: 0.35,
      },
      ...textItems.map((item) => ({
        id: item.id,
        type: 'text' as const,
        text: item.text,
        left: item.left,
        top: item.top,
        fontSize: item.size,
      })),
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
      console.log('[SUCCESS] Phase 4 text label printed directly to network printer!');
    } catch (err) {
      console.error('[ERROR] Failed to send to network printer:', err);
      process.exit(1);
    }
  } else {
    console.log('To print directly over network:');
    console.log(`  npm run print:phase4 -- --ip <printer_ip> [options]`);
  }

  console.log('\n[PHYSICAL VERIFICATION CHECKLIST]');
  for (const item of textItems) {
    const fontRes = resolveTsplFont(item.size);
    console.log(`- Measure "${item.text}":`);
    console.log(`    Target Baseline / Top position: ${item.top} mm from top margin (±0.5 mm)`);
    console.log(`    Target Capital letter height:   ${fontRes.capHeightMm.toFixed(2)} mm (calipers)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
