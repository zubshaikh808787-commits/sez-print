/**
 * Shipping Label PDF & Thermal Print Command Generator.
 * Outputs pixel-perfect vector PDFs at exact physical label dimensions,
 * as well as direct ZPL/TSPL command streams.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { generateCode128Vector } from '@/lib/shipping-editor/svg-barcode';
import {
  DEFAULT_SHIPPING_ORDER_DATA,
  LabelSizePreset,
  MM_PER_INCH,
  ShippingField,
  ShippingOrderData,
  ShippingTemplate,
  STANDARD_LABEL_SIZES,
} from '@/lib/shipping-editor/types';

/**
 * Resolves text content for a field based on data bindings or custom content.
 */
export function resolveFieldContent(
  field: ShippingField,
  data: ShippingOrderData = DEFAULT_SHIPPING_ORDER_DATA,
): string {
  if ('customContent' in field && field.customContent) return field.customContent;
  if ('dataKey' in field && field.dataKey) return (data as Record<string, string>)[field.dataKey] || field.label || '';
  return field.label || '';
}

/**
 * Generates an exact-size HTML / SVG representation of the shipping label.
 */
export function generateShippingLabelHtml(
  template: ShippingTemplate,
  data: ShippingOrderData = DEFAULT_SHIPPING_ORDER_DATA,
  sizePreset: LabelSizePreset = STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
): string {
  const widthMm = template.customWidthMm || sizePreset.widthMm;
  const heightMm = template.customHeightMm || sizePreset.heightMm;
  const safeMarginMm = template.safeMarginMm || 2;

  const fieldHtmlList: string[] = [];

  for (const field of template.fields) {
    const leftPct = field.x;
    const topPct = field.y;
    const widthPct = field.width;
    const heightPct = field.height;

    if (field.type === 'box') {
      const lineWidth = field.lineWidth || 1.5;
      fieldHtmlList.push(`
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${widthPct}%;
          height: ${heightPct}%;
          border: ${lineWidth}px solid #000000;
          box-sizing: border-box;
          pointer-events: none;
        "></div>
      `);
      continue;
    }

    if (field.type === 'line') {
      const lineWidth = field.lineWidth || 1;
      const isVert = field.orientation === 'vertical';
      fieldHtmlList.push(`
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${isVert ? `${lineWidth}px` : `${widthPct}%`};
          height: ${isVert ? `${heightPct}%` : `${lineWidth}px`};
          background-color: #000000;
          pointer-events: none;
        "></div>
      `);
      continue;
    }

    if (field.type === 'text-block') {
      const content = resolveFieldContent(field, data);
      const align = field.align || 'left';
      const isBold = field.bold ? '700' : '400';
      const labelBadge = field.label
        ? `<div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; color: #333333;">${escapeHtml(field.label)}</div>`
        : '';

      fieldHtmlList.push(`
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${widthPct}%;
          height: ${heightPct}%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          text-align: ${align};
          box-sizing: border-box;
          padding: 2px 4px;
        ">
          ${labelBadge}
          <div style="
            font-size: 10pt;
            font-weight: ${isBold};
            line-height: 1.25;
            white-space: pre-wrap;
            word-break: break-word;
            flex: 1;
          ">${escapeHtml(content)}</div>
        </div>
      `);
      continue;
    }

    if (field.type === 'row') {
      const colsHtml = field.columns
        .map((col) => {
          const colContent = col.customContent || (col.dataKey ? (data as Record<string, string>)[col.dataKey] : '') || '';
          return `
            <div style="
              width: ${col.widthPct}%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              border-right: 1px solid #000000;
              box-sizing: border-box;
              padding: 2px;
            ">
              <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; color: #444444;">${escapeHtml(col.label)}</div>
              <div style="font-size: 10pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${escapeHtml(colContent)}</div>
            </div>
          `;
        })
        .join('');

      fieldHtmlList.push(`
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${widthPct}%;
          height: ${heightPct}%;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          box-sizing: border-box;
        ">
          ${colsHtml}
        </div>
      `);
      continue;
    }

    if (field.type === 'barcode') {
      const rawValue = resolveFieldContent(field, data) || 'SAMPLE123456789';
      // Compute pixel width inside HTML (approx 200px)
      const barcodeWidthPx = Math.max(100, Math.round((widthMm * (widthPct / 100) / MM_PER_INCH) * 203));
      const barcodeHeightPx = Math.max(40, Math.round((heightMm * (heightPct / 100) / MM_PER_INCH) * 203));
      const vector = generateCode128Vector(rawValue, barcodeWidthPx, barcodeHeightPx, '#000000', field.showValueBelow !== false);

      fieldHtmlList.push(`
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${widthPct}%;
          height: ${heightPct}%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-sizing: border-box;
          padding: 2px;
        ">
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            ${vector.svgHtml}
          </div>
        </div>
      `);
      continue;
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #FFFFFF;
      color: #000000;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
    }
    .label-canvas {
      position: relative;
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      background-color: #FFFFFF;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="label-canvas">
    ${fieldHtmlList.join('\n')}
  </div>
</body>
</html>
  `;
}

/**
 * Renders the shipping label to a true-size PDF file.
 */
export async function renderLabelToPDF(
  template: ShippingTemplate,
  data: ShippingOrderData = DEFAULT_SHIPPING_ORDER_DATA,
  sizePreset: LabelSizePreset = STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
): Promise<{ uri: string; numberOfPages: number }> {
  const widthMm = template.customWidthMm || sizePreset.widthMm;
  const heightMm = template.customHeightMm || sizePreset.heightMm;

  const widthPt = (widthMm / MM_PER_INCH) * 72;
  const heightPt = (heightMm / MM_PER_INCH) * 72;

  const html = generateShippingLabelHtml(template, data, sizePreset);

  const file = await Print.printToFileAsync({
    html,
    width: Math.round(widthPt),
    height: Math.round(heightPt),
  });

  return file;
}

/**
 * Shares or saves a generated PDF.
 */
export async function shareLabelPDF(pdfUri: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(pdfUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Shipping Label PDF',
    UTI: 'com.adobe.pdf',
  });
}

/**
 * Generates direct Zebra Programming Language (ZPL) text commands.
 */
export function renderLabelToZPL(
  template: ShippingTemplate,
  data: ShippingOrderData = DEFAULT_SHIPPING_ORDER_DATA,
  sizePreset: LabelSizePreset = STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
  dpi: 203 | 300 = 203,
): string {
  const widthMm = template.customWidthMm || sizePreset.widthMm;
  const heightMm = template.customHeightMm || sizePreset.heightMm;

  const widthDots = Math.round((widthMm / MM_PER_INCH) * dpi);
  const heightDots = Math.round((heightMm / MM_PER_INCH) * dpi);

  const commands: string[] = [];
  commands.push('^XA'); // Start Format
  commands.push(`^PW${widthDots}`); // Print Width
  commands.push(`^LL${heightDots}`); // Label Length
  commands.push('^LH0,0'); // Label Home
  commands.push('^PON'); // Print Orientation Normal

  for (const field of template.fields) {
    const xDot = Math.round((field.x / 100) * widthDots);
    const yDot = Math.round((field.y / 100) * heightDots);
    const wDot = Math.round((field.width / 100) * widthDots);
    const hDot = Math.round((field.height / 100) * heightDots);

    if (field.type === 'box') {
      const thickness = field.lineWidth ? Math.round(field.lineWidth * (dpi / 203) * 2) : 3;
      commands.push(`^FO${xDot},${yDot}^GB${wDot},${hDot},${thickness}^FS`);
      continue;
    }

    if (field.type === 'line') {
      const thickness = field.lineWidth ? Math.round(field.lineWidth * (dpi / 203) * 2) : 2;
      const isVert = field.orientation === 'vertical';
      if (isVert) {
        commands.push(`^FO${xDot},${yDot}^GB${thickness},${hDot},${thickness}^FS`);
      } else {
        commands.push(`^FO${xDot},${yDot}^GB${wDot},${thickness},${thickness}^FS`);
      }
      continue;
    }

    if (field.type === 'text-block') {
      const content = resolveFieldContent(field, data);
      const fontHeight = Math.max(18, Math.round(28 * (dpi / 203)));
      const fontWidth = Math.max(12, Math.round(18 * (dpi / 203)));
      commands.push(`^FO${xDot + 10},${yDot + 10}^A0N,${fontHeight},${fontWidth}^FB${wDot - 20},6,0,L,0^FD${content}^FS`);
      continue;
    }

    if (field.type === 'row') {
      let colLeft = xDot;
      for (const col of field.columns) {
        const colWidth = Math.round((col.widthPct / 100) * wDot);
        const colContent = col.customContent || (col.dataKey ? (data as Record<string, string>)[col.dataKey] : '') || '';
        commands.push(`^FO${colLeft + 5},${yDot + 5}^A0N,18,14^FD${col.label}^FS`);
        commands.push(`^FO${colLeft + 5},${yDot + 28}^A0N,26,20^FD${colContent}^FS`);
        colLeft += colWidth;
      }
      continue;
    }

    if (field.type === 'barcode') {
      const rawValue = resolveFieldContent(field, data) || 'SAMPLE123';
      const barHeight = Math.max(40, hDot - 30);
      commands.push(`^FO${xDot + 20},${yDot + 10}^BY2,3,${barHeight}^BCN,${barHeight},Y,N,N^FD${rawValue}^FS`);
      continue;
    }
  }

  commands.push('^XZ'); // End Format
  return commands.join('\n');
}

/**
 * Generates direct TSPL text commands for TD-404 / TSC printers.
 */
export function renderLabelToTSPL(
  template: ShippingTemplate,
  data: ShippingOrderData = DEFAULT_SHIPPING_ORDER_DATA,
  sizePreset: LabelSizePreset = STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
  dpi: 203 | 300 = 203,
): string {
  const widthMm = Math.max(1, Math.round(template.customWidthMm || sizePreset.widthMm));
  const heightMm = Math.max(1, Math.round(template.customHeightMm || sizePreset.heightMm));

  const widthDots = Math.round((widthMm / MM_PER_INCH) * dpi);
  const heightDots = Math.round((heightMm / MM_PER_INCH) * dpi);

  const lines: string[] = [];
  lines.push(`SIZE ${widthMm} mm,${heightMm} mm`);
  lines.push('GAP 2 mm,0 mm');
  lines.push('DIRECTION 0,0');
  lines.push('REFERENCE 0,0');
  lines.push('CLS');

  for (const field of template.fields) {
    const xDot = Math.round((field.x / 100) * widthDots);
    const yDot = Math.round((field.y / 100) * heightDots);
    const wDot = Math.round((field.width / 100) * widthDots);
    const hDot = Math.round((field.height / 100) * heightDots);

    if (field.type === 'box') {
      lines.push(`BOX ${xDot},${yDot},${xDot + wDot},${yDot + hDot},2`);
      continue;
    }

    if (field.type === 'line') {
      const isVert = field.orientation === 'vertical';
      if (isVert) {
        lines.push(`BAR ${xDot},${yDot},2,${hDot}`);
      } else {
        lines.push(`BAR ${xDot},${yDot},${wDot},2`);
      }
      continue;
    }

    if (field.type === 'text-block') {
      const content = resolveFieldContent(field, data);
      const cleanText = content.replace(/\n/g, ' ');
      lines.push(`TEXT ${xDot + 10},${yDot + 10},"3",0,1,1,"${cleanText}"`);
      continue;
    }

    if (field.type === 'barcode') {
      const rawValue = resolveFieldContent(field, data) || 'SAMPLE123';
      const barHeight = Math.max(40, hDot - 30);
      lines.push(`BARCODE ${xDot + 20},${yDot + 10},"128",${barHeight},1,0,2,2,"${rawValue}"`);
      continue;
    }
  }

  lines.push('PRINT 1,1');
  return lines.join('\r\n') + '\r\n';
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
