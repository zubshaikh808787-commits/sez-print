#!/usr/bin/env node
/**
 * Phase 8: Automatic Shape & Contour Detection Demo CLI Script
 *
 * Demonstrates:
 * 1. Automatic shape & contour detection on label images (rectangle, roundedRectangle, circle, diecut).
 * 2. Corner radius and circularity analysis.
 * 3. Non-rectangular boundary TSPL export (BOX, CIRCLE, or 1bpp BITMAP raster outline).
 * 4. Network socket dispatch to physical thermal printers.
 *
 * Usage:
 *   npx tsx scripts/print-phase8-demo.ts [options]
 *
 * Options:
 *   --shape <type>       Shape archetype: rect | rounded | circle | diecut (default: rounded)
 *   --width <mm>         Label physical width in mm (default: 50)
 *   --height <mm>        Label physical height in mm (default: 30)
 *   --radius <mm>        Corner radius in mm for rounded rectangle (default: 4)
 *   --ip <address>       Printer IP address (optional: sends over TCP 9100)
 *   --out <filepath>     Save TSPL payload to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  detectLabelContour,
  createSyntheticLabelImage,
  type LabelShapeType,
  type LabelShapeDefinition,
} from '../src/printing/contour-detection';
import { exportCanvasBoundaryJob } from '../src/printing/canvas-export';
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
      console.log('Connected! Sending Phase 8 Shape Boundary TSPL payload...');
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

  let shapeInput: LabelShapeType = 'roundedRectangle';
  if (opts.shape === 'rect' || opts.shape === 'rectangle') shapeInput = 'rectangle';
  else if (opts.shape === 'circle') shapeInput = 'circle';
  else if (opts.shape === 'diecut') shapeInput = 'diecut';

  const widthMm = opts.width ? parseFloat(opts.width) : (shapeInput === 'circle' ? 40 : 50);
  const heightMm = opts.height ? parseFloat(opts.height) : (shapeInput === 'circle' ? 40 : 30);
  const radiusMm = opts.radius ? parseFloat(opts.radius) : 4;

  console.log('====================================================');
  console.log('  SEZ PRINT — PHASE 8 SHAPE DETECTION DEMO');
  console.log('====================================================');
  console.log(`Simulated Shape:     ${shapeInput}`);
  console.log(`Target Dimensions:   ${widthMm} × ${heightMm} mm`);
  if (shapeInput === 'roundedRectangle') {
    console.log(`Target Corner Radius: ${radiusMm} mm`);
  }
  console.log('----------------------------------------------------');

  // 1. Generate synthetic test image
  const imgW = 200;
  const imgH = Math.round(imgW * (heightMm / widthMm));
  const radiusPx = Math.round(imgW * (radiusMm / widthMm));
  const testImage = createSyntheticLabelImage(shapeInput, imgW, imgH, {
    cornerRadiusPx: radiusPx,
  });
  console.log(`Generated synthetic label image: ${imgW}×${imgH} px`);

  // 2. Run Contour & Shape Detection
  const detected = detectLabelContour(testImage, imgW, imgH, {
    referenceWidthMm: widthMm,
  });

  console.log('----------------------------------------------------');
  console.log('CONTOUR DETECTION RESULTS:');
  console.log('----------------------------------------------------');
  console.log(`Detected Archetype:  ${detected.type.toUpperCase()}`);
  console.log(`Confidence Score:    ${Math.round(detected.confidence * 100)}%`);
  console.log(`Aspect Ratio:        ${detected.aspectRatio} (W:H)`);
  console.log(`Fill Ratio:          ${Math.round(detected.fillRatio * 100)}%`);
  if (detected.cornerRadiusMm !== undefined) {
    console.log(`Detected Radius:     ${detected.cornerRadiusMm} mm`);
  }
  console.log(
    `Suggested Size:      ${detected.suggestedWidthMm} × ${detected.suggestedHeightMm} mm`,
  );
  console.log('----------------------------------------------------');

  // 3. Create Shape Definition & Export Boundary TSPL Job
  const shapeDef: LabelShapeDefinition = {
    type: detected.type,
    widthMm,
    heightMm,
    cornerRadiusMm: detected.cornerRadiusMm ?? radiusMm,
    polygonPoints: detected.polygonPoints,
  };

  const job = exportCanvasBoundaryJob({
    widthMm,
    heightMm,
    gapMm: 2,
    direction: 1,
    lineWidth: 0.35,
    shape: shapeDef,
  });

  console.log('GENERATED TSPL BOUNDARY COMMANDS:');
  console.log('----------------------------------------------------');
  console.log(job.tsplAscii.trimEnd());
  console.log('----------------------------------------------------');
  console.log(`TSPL Payload Size:   ${job.totalBytes} bytes`);
  console.log(`Uses 1bpp Raster:    ${job.hasBitmap}`);
  console.log('----------------------------------------------------');

  // 4. Save to file if requested
  if (opts.out) {
    fs.writeFileSync(opts.out, Buffer.from(job.binaryPayload));
    console.log(`Saved TSPL boundary payload to: ${opts.out}`);
  }

  // 5. Send to physical network printer if IP specified
  if (opts.ip) {
    const port = parseInt(opts.port ?? '9100', 10);
    try {
      await sendToNetworkPrinter(opts.ip, port, job.binaryPayload);
      console.log('Boundary print job successfully dispatched!');
      console.log('Caliper Verification: Confirm printed boundary matches label contour within ±0.5mm.');
    } catch (err) {
      console.error('Failed to send print job to printer:', err);
      process.exit(1);
    }
  } else {
    console.log('NOTE: To print to a network printer, provide --ip <address>');
    console.log('Example: npm run print:phase8 -- --ip 192.168.1.100');
  }
}

main().catch((err) => {
  console.error('Error in Phase 8 demo script:', err);
  process.exit(1);
});
