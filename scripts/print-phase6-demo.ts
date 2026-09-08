#!/usr/bin/env node
/**
 * Phase 6: Element Manipulation & Editing UX Demo CLI Script
 *
 * Simulates a full interactive manipulation sequence:
 * - Element selection, drag-move with mm clamping and snap-to-grid
 * - Corner resize with type constraints
 * - 90-degree rotation cycling
 * - Layer z-ordering (bring to front / send to back)
 * - Multi-step Undo / Redo history state restoration
 * - TSPL export and physical printing
 *
 * Usage:
 *   npx tsx scripts/print-phase6-demo.ts [options]
 *
 * Options:
 *   --labelWidth <mm>    Label width in mm (default: 50)
 *   --labelHeight <mm>   Label height in mm (default: 30)
 *   --snap <mm>          Snap step in mm (default: 1.0)
 *   --copies <count>     Print copies (default: 1)
 *   --ip <address>       Printer IP address (optional: sends over TCP 9100)
 *   --out <filepath>     Save TSPL to file (optional)
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  snapToGridMm,
  moveElementInCanvas,
  resizeElementInCanvas,
  rotateElementInCanvas,
  reorderElementInCanvas,
  CanvasHistoryManager,
  exportCanvasToTspl,
  validateScannability,
  type CanvasElement,
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
      console.log('Connected! Sending Phase 6 Manipulated Canvas TSPL payload...');
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
      reject(new Error(`Connection to ${ip}:${port} timed out.`));
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
  const snap = parseFloat(opts.snap || '1.0');
  const copies = parseInt(opts.copies || '1', 10);

  console.log('==================================================');
  console.log(' SEZ-PRINT: Phase 6 Element Manipulation UX Engine');
  console.log('==================================================');
  console.log(`Hardware Configuration:`);
  console.log(`  Printer DPI:       ${PRINTER_DPI}`);
  console.log(`  Dots per mm:       ${DOTS_PER_MM.toFixed(8)}`);
  console.log(`  Label Geometry:    ${widthMm} mm × ${heightMm} mm`);
  console.log(`  Snap-to-Grid:      ${snap} mm\n`);

  // Step 1: Initialize canvas elements
  let currentElements: CanvasElement[] = [
    {
      id: 'bg-box',
      type: 'box',
      left: 2,
      top: 2,
      width: 46,
      height: 26,
      lineWidth: 0.35,
    },
    {
      id: 'prod-title',
      type: 'text',
      text: 'PART: PRECISION COUPLING',
      left: 4,
      top: 4,
      fontSize: 12,
    },
    {
      id: 'sku-barcode',
      type: 'barcode',
      data: 'PC-88902',
      left: 4,
      top: 10,
      height: 9,
      narrowDots: 2,
      readable: 1,
    },
    {
      id: 'serial-qr',
      type: 'qr',
      data: 'https://sez-print.local/part/88902',
      left: 32,
      top: 10,
      sizeMm: 12,
      eccLevel: 'M',
    },
  ];

  const history = new CanvasHistoryManager<CanvasElement[]>(currentElements);
  console.log('Step 1: Canvas initialized with 4 elements.');
  console.log(`  Initial elements: ${currentElements.map((e) => `${e.type} (${e.id})`).join(', ')}`);

  // Step 2: Drag-move QR Code with snap-to-grid
  console.log('\nStep 2: Drag QR code with snap-to-grid...');
  currentElements = moveElementInCanvas(currentElements, 'serial-qr', 33.4, 11.2, widthMm, heightMm, snap);
  history.push(currentElements);
  const movedQr = currentElements.find((e) => e.id === 'serial-qr')!;
  console.log(`  Moved serial-qr to snapped (${movedQr.left}mm, ${movedQr.top}mm)`);

  // Step 3: Resize barcode height
  console.log('\nStep 3: Resize barcode height from 9mm to 11mm...');
  currentElements = resizeElementInCanvas(currentElements, 'sku-barcode', 's', 0, 2, widthMm, heightMm, snap);
  history.push(currentElements);
  const resizedBc = currentElements.find((e) => e.id === 'sku-barcode') as CanvasBarcodeElement;
  console.log(`  Resized sku-barcode height to ${resizedBc.height}mm`);

  // Step 4: Layer re-ordering (Bring barcode to front)
  console.log('\nStep 4: Reorder layers — Bring barcode to front...');
  currentElements = reorderElementInCanvas(currentElements, 'sku-barcode', 'bringToFront');
  history.push(currentElements);
  console.log(`  New layer order (front at end): ${currentElements.map((e) => e.id).join(' -> ')}`);

  // Step 5: Test Undo & Redo
  console.log('\nStep 5: Testing Undo and Redo operations...');
  console.log(`  Can Undo: ${history.canUndo()} (history depth: ${history.getPastCount()})`);
  const undoneElements = history.undo()!;
  console.log(`  Undid reorder! Current top element: ${undoneElements[undoneElements.length - 1].id}`);
  const redoneElements = history.redo()!;
  console.log(`  Redid reorder! Current top element: ${redoneElements[redoneElements.length - 1].id}`);
  currentElements = redoneElements;

  // Step 6: Scannability verification
  console.log('\nScannability Analysis of Final Layout:');
  for (const el of currentElements) {
    if (el.type === 'barcode' || el.type === 'qr') {
      const res = validateScannability(el as CanvasBarcodeElement | CanvasQrElement, widthMm, heightMm);
      console.log(`  [${el.type.toUpperCase()}: ${el.id}]`);
      console.log(`    Footprint: ${res.calculatedWidthMm} × ${res.calculatedHeightMm} mm`);
      console.log(`    Status:    ${res.isScannable ? 'SCANNABLE' : 'WARNING'}`);
      res.warnings.forEach((w) => console.log(`    ! ${w}`));
    }
  }

  // Step 7: Export to TSPL
  const doc: CanvasDocument = {
    widthMm,
    heightMm,
    gapMm: 2,
    direction: 1,
    elements: currentElements,
  };

  const tspl = exportCanvasToTspl(doc, { copies, printBoundary: true });
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
      console.log('\n[SUCCESS] Phase 6 manipulated label successfully transmitted to printer.');
      console.log('Physical Caliper Verification:');
      console.log('  1. Measure all element positions on printed label.');
      console.log('  2. Verify snap-to-grid alignment matches (within ±0.5 mm).');
    } catch (err) {
      console.error('\n[ERROR] Failed to send to network printer:', err);
      process.exit(1);
    }
  } else {
    console.log('\n[INFO] To send directly to a network printer, supply --ip <printer_ip>.');
    console.log('Example:');
    console.log('  npm run print:phase6 -- --ip 192.168.1.100');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
