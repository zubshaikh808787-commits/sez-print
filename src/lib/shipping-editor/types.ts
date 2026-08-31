/**
 * Shipping Label Editor Types, Standard Sizes, and Starter Templates.
 * Built according to the percentage-based, size-agnostic template specification.
 */

import { MM_PER_INCH } from '@/lib/printer/print-spec';

export { MM_PER_INCH };

export type LabelDpi = 203 | 300;

export type StandardLabelSizeId = '4x6' | '100x155' | '100x150' | '4x4' | '3x2' | '2x1' | 'A6' | 'custom';

export type LabelSizePreset = {
  id: StandardLabelSizeId;
  name: string;
  detail: string;
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;
  safeMarginMm: number;
  /** Expected pixel dimensions at standard DPIs */
  px203: { width: number; height: number };
  px300: { width: number; height: number };
};

export const STANDARD_LABEL_SIZES: Record<StandardLabelSizeId, LabelSizePreset> = {
  '100x155': {
    id: '100x155',
    name: '100 × 155 mm',
    detail: 'Standard Logistics / Waybill',
    widthIn: 3.94,
    heightIn: 6.1,
    widthMm: 100,
    heightMm: 155,
    safeMarginMm: 2,
    px203: { width: 800, height: 1239 },
    px300: { width: 1181, height: 1831 },
  },
  '100x150': {
    id: '100x150',
    name: '100 × 150 mm',
    detail: '4 × 6 in Thermal Shipping Label',
    widthIn: 3.94,
    heightIn: 5.91,
    widthMm: 100,
    heightMm: 150,
    safeMarginMm: 2,
    px203: { width: 800, height: 1199 },
    px300: { width: 1181, height: 1772 },
  },
  '4x6': {
    id: '4x6',
    name: '4 × 6 in (101.6 × 152.4 mm)',
    detail: 'US Standard Shipping Label',
    widthIn: 4,
    heightIn: 6,
    widthMm: 101.6,
    heightMm: 152.4,
    safeMarginMm: 2,
    px203: { width: 812, height: 1218 },
    px300: { width: 1200, height: 1800 },
  },
  '4x4': {
    id: '4x4',
    name: '4 × 4 in',
    detail: 'Small Parcel / Square',
    widthIn: 4,
    heightIn: 4,
    widthMm: 101.6,
    heightMm: 101.6,
    safeMarginMm: 2,
    px203: { width: 812, height: 812 },
    px300: { width: 1200, height: 1200 },
  },
  '3x2': {
    id: '3x2',
    name: '3 × 2 in',
    detail: 'Retail / Product Label',
    widthIn: 3,
    heightIn: 2,
    widthMm: 76.2,
    heightMm: 50.8,
    safeMarginMm: 2,
    px203: { width: 609, height: 406 },
    px300: { width: 900, height: 600 },
  },
  '2x1': {
    id: '2x1',
    name: '2 × 1 in',
    detail: 'Barcode / Asset Tag',
    widthIn: 2,
    heightIn: 1,
    widthMm: 50.8,
    heightMm: 25.4,
    safeMarginMm: 2,
    px203: { width: 406, height: 203 },
    px300: { width: 600, height: 300 },
  },
  A6: {
    id: 'A6',
    name: 'A6',
    detail: '105 × 148 mm International',
    widthIn: 4.13,
    heightIn: 5.83,
    widthMm: 105,
    heightMm: 148,
    safeMarginMm: 2,
    px203: { width: 839, height: 1185 },
    px300: { width: 1240, height: 1748 },
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    detail: 'User Defined Dimensions',
    widthIn: 4,
    heightIn: 6,
    widthMm: 101.6,
    heightMm: 152.4,
    safeMarginMm: 2,
    px203: { width: 812, height: 1218 },
    px300: { width: 1200, height: 1800 },
  },
};

/** Unit Conversion Utilities */
export function mmToPx(mm: number, dpi: LabelDpi = 203): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function inToPx(inches: number, dpi: LabelDpi = 203): number {
  return Math.round(inches * dpi);
}

export function pxToPt(px: number, dpi: LabelDpi = 203): number {
  return (px / dpi) * 72;
}

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * 72;
}

export function ptToMm(pt: number): number {
  return (pt / 72) * MM_PER_INCH;
}

/** Field Definition in percentage (0 to 100) */
export type ShippingField =
  | {
      id: string;
      type: 'text-block';
      label: string;
      x: number; // percentage
      y: number; // percentage
      width: number; // percentage
      height: number; // percentage
      fontSize?: 'auto' | number;
      align?: 'left' | 'center' | 'right' | 'justify';
      wrap?: boolean;
      bold?: boolean;
      dataKey?: string;
      customContent?: string;
    }
  | {
      id: string;
      type: 'row';
      label?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      columns: Array<{
        id: string;
        label: string;
        widthPct: number;
        dataKey?: string;
        customContent?: string;
      }>;
    }
  | {
      id: string;
      type: 'barcode';
      label?: string;
      format: 'CODE128' | 'EAN13' | 'UPC' | 'QR';
      x: number;
      y: number;
      width: number;
      height: number;
      showValueBelow?: boolean;
      dataKey?: string;
      customContent?: string;
    }
  | {
      id: string;
      type: 'box';
      label?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      lineWidth?: number;
    }
  | {
      id: string;
      type: 'line';
      label?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      orientation?: 'horizontal' | 'vertical';
      lineWidth?: number;
    };

export type ShippingTemplate = {
  templateId: string;
  name: string;
  labelSize: StandardLabelSizeId;
  unit: 'percent';
  fields: ShippingField[];
  safeMarginMm: number;
  customWidthMm?: number;
  customHeightMm?: number;
};

export type ShippingOrderData = {
  senderName: string;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  weight: string;
  dimension: string;
  shipDate: string;
  trackingNumber: string;
  carrier: string;
  serviceType: string;
};

export const DEFAULT_SHIPPING_ORDER_DATA: ShippingOrderData = {
  senderName: 'Acme Corporation',
  senderAddress: '123 Warehouse Blvd,\nSuite 100,\nLos Angeles, CA 90012',
  recipientName: 'Sarah Johnson',
  recipientAddress: '456 Oak Avenue, Apt 7B,\nBrooklyn, NY 11201,\nUnited States',
  weight: '3 lbs',
  dimension: '12x8x2 cm',
  shipDate: '3-Dec-2025',
  trackingNumber: 'SAMPLE123456789',
  carrier: 'PRIORITY EXPRESS',
  serviceType: 'STANDARD PARCEL',
};

/**
 * 3 Built-in Starter Templates (Section 4)
 */

export const TEMPLATE_STANDARD_4X6: ShippingTemplate = {
  templateId: 'standard-4x6-v1',
  name: 'Standard 4 × 6 Shipping Label',
  labelSize: '4x6',
  unit: 'percent',
  safeMarginMm: 2.5,
  fields: [
    // Outer border (leaves 2.5% safe margin on left/right and top/bottom)
    {
      id: 'outerBorder',
      type: 'box',
      x: 2.5,
      y: 2,
      width: 95,
      height: 95.5,
      lineWidth: 1.5,
    },
    // Top separator between From and Ship To
    {
      id: 'verticalSep',
      type: 'line',
      x: 50,
      y: 2,
      width: 0,
      height: 32,
      orientation: 'vertical',
      lineWidth: 1,
    },
    // From block
    {
      id: 'from',
      type: 'text-block',
      label: 'FROM',
      x: 3.5,
      y: 3,
      width: 44.5,
      height: 29,
      fontSize: 'auto',
      align: 'left',
      wrap: true,
      bold: true,
      dataKey: 'senderAddress',
    },
    // Ship To block
    {
      id: 'shipTo',
      type: 'text-block',
      label: 'SHIP TO',
      x: 52,
      y: 3,
      width: 44.5,
      height: 29,
      fontSize: 'auto',
      align: 'left',
      wrap: true,
      bold: true,
      dataKey: 'recipientAddress',
    },
    // Horizontal divider 1
    {
      id: 'hDivider1',
      type: 'line',
      x: 2.5,
      y: 34,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1.2,
    },
    // Metadata row (Weight, Dimension, Ship Date)
    {
      id: 'metaRow',
      type: 'row',
      x: 3.5,
      y: 35.5,
      width: 93,
      height: 14,
      columns: [
        { id: 'weight', label: 'WEIGHT', widthPct: 30, dataKey: 'weight' },
        { id: 'dimension', label: 'DIMENSION', widthPct: 36, dataKey: 'dimension' },
        { id: 'shipDate', label: 'SHIPPING DATE', widthPct: 34, dataKey: 'shipDate' },
      ],
    },
    // Horizontal divider 2
    {
      id: 'hDivider2',
      type: 'line',
      x: 2.5,
      y: 50.5,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1.2,
    },
    // Carrier header
    {
      id: 'carrierHeader',
      type: 'text-block',
      label: 'CARRIER',
      x: 3.5,
      y: 52,
      width: 93,
      height: 8.5,
      fontSize: 'auto',
      align: 'center',
      bold: true,
      dataKey: 'carrier',
    },
    // Horizontal divider 3
    {
      id: 'hDivider3',
      type: 'line',
      x: 2.5,
      y: 61.5,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1.2,
    },
    // Barcode block
    {
      id: 'barcode',
      type: 'barcode',
      format: 'CODE128',
      x: 4.5,
      y: 64,
      width: 91,
      height: 31.5,
      showValueBelow: true,
      dataKey: 'trackingNumber',
    },
  ],
};

export const TEMPLATE_COMPACT_4X4: ShippingTemplate = {
  templateId: 'compact-4x4-v1',
  name: 'Compact 4 × 4 Parcel Label',
  labelSize: '4x4',
  unit: 'percent',
  safeMarginMm: 2.5,
  fields: [
    {
      id: 'outerBorder',
      type: 'box',
      x: 2.5,
      y: 2.5,
      width: 95,
      height: 95,
      lineWidth: 1.5,
    },
    // From Block
    {
      id: 'from',
      type: 'text-block',
      label: 'FROM',
      x: 4,
      y: 4,
      width: 92,
      height: 17,
      fontSize: 'auto',
      align: 'left',
      wrap: true,
      dataKey: 'senderAddress',
    },
    {
      id: 'hDivider1',
      type: 'line',
      x: 2.5,
      y: 22,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1,
    },
    // Ship To Block
    {
      id: 'shipTo',
      type: 'text-block',
      label: 'SHIP TO',
      x: 4,
      y: 23.5,
      width: 92,
      height: 21,
      fontSize: 'auto',
      align: 'left',
      wrap: true,
      bold: true,
      dataKey: 'recipientAddress',
    },
    {
      id: 'hDivider2',
      type: 'line',
      x: 2.5,
      y: 46,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1,
    },
    // Meta row
    {
      id: 'metaRow',
      type: 'row',
      x: 4,
      y: 47.5,
      width: 92,
      height: 12,
      columns: [
        { id: 'weight', label: 'WEIGHT', widthPct: 32, dataKey: 'weight' },
        { id: 'dimension', label: 'DIMS', widthPct: 34, dataKey: 'dimension' },
        { id: 'shipDate', label: 'DATE', widthPct: 34, dataKey: 'shipDate' },
      ],
    },
    {
      id: 'hDivider3',
      type: 'line',
      x: 2.5,
      y: 61,
      width: 95,
      height: 0,
      orientation: 'horizontal',
      lineWidth: 1,
    },
    // Barcode block
    {
      id: 'barcode',
      type: 'barcode',
      format: 'CODE128',
      x: 5,
      y: 63.5,
      width: 90,
      height: 32,
      showValueBelow: true,
      dataKey: 'trackingNumber',
    },
  ],
};

export const TEMPLATE_ASSET_TAG_2X1: ShippingTemplate = {
  templateId: 'asset-tag-2x1-v1',
  name: 'Asset Tag 2 × 1 in',
  labelSize: '2x1',
  unit: 'percent',
  safeMarginMm: 1.5,
  fields: [
    {
      id: 'headerText',
      type: 'text-block',
      label: 'PROPERTY OF',
      x: 5,
      y: 6,
      width: 90,
      height: 22,
      fontSize: 'auto',
      align: 'center',
      bold: true,
      dataKey: 'senderName',
    },
    {
      id: 'barcode',
      type: 'barcode',
      format: 'CODE128',
      x: 5,
      y: 32,
      width: 90,
      height: 60,
      showValueBelow: true,
      dataKey: 'trackingNumber',
    },
  ],
};

export const STARTER_SHIPPING_TEMPLATES: ShippingTemplate[] = [
  TEMPLATE_STANDARD_4X6,
  TEMPLATE_COMPACT_4X4,
  TEMPLATE_ASSET_TAG_2X1,
];
