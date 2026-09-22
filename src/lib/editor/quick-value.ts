import type { ElementType, LabelElement } from '@/lib/label-document';

export type ElementAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const QUICK_EDITABLE_TYPES: ElementType[] = [
  'text',
  'barcode',
  'qrcode',
  'arctext',
  'degrees',
];

export function isQuickEditableType(type: ElementType | string): boolean {
  return QUICK_EDITABLE_TYPES.includes(type as ElementType);
}

export function getQuickEditValue(element: LabelElement): string {
  switch (element.type) {
    case 'text':
      return element.text ?? '';
    case 'barcode':
    case 'qrcode':
      return element.content ?? '';
    case 'arctext':
      return element.text ?? '';
    case 'degrees':
      return element.content ?? '';
    default:
      return '';
  }
}

export function getQuickEditPatch(
  element: LabelElement,
  newValue: string,
): Record<string, unknown> {
  switch (element.type) {
    case 'text':
    case 'arctext':
      return { text: newValue };
    case 'barcode':
    case 'qrcode':
    case 'degrees':
      return { content: newValue };
    default:
      return {};
  }
}

export function getQuickEditTitle(type: ElementType): string {
  switch (type) {
    case 'text':
      return 'Edit Text';
    case 'barcode':
      return 'Edit Barcode Value';
    case 'qrcode':
      return 'Edit QR Code Value';
    case 'arctext':
      return 'Edit Arc Text';
    case 'degrees':
      return 'Edit Counter Start Value';
    default:
      return 'Edit Value';
  }
}

export function getQuickEditPlaceholder(type: ElementType): string {
  switch (type) {
    case 'text':
      return 'Type text…';
    case 'barcode':
      return 'Enter barcode content…';
    case 'qrcode':
      return 'Enter QR code content or URL…';
    case 'arctext':
      return 'Enter arc text…';
    case 'degrees':
      return 'Enter counter starting value…';
    default:
      return 'Enter value…';
  }
}
