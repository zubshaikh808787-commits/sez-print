import type { MediaProfile, PrintDocument } from '@/printing/document/types';
import type { PrinterCapabilities, ValidationResult } from '@/printing/printer/types';

export function validatePrintRequest(
  document: PrintDocument,
  media: MediaProfile,
  capabilities: PrinterCapabilities,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(media.widthMm > 0) || !(media.heightMm > 0)) {
    errors.push('Media width and height must be greater than 0 mm.');
  }
  if (Math.abs(document.widthMm - media.widthMm) > 0.2 || Math.abs(document.heightMm - media.heightMm) > 0.2) {
    warnings.push(
      `Document ${document.widthMm}×${document.heightMm} mm differs from media ${media.widthMm}×${media.heightMm} mm.`,
    );
  }
  if (media.widthMm > capabilities.maxWidthMm + 0.15) {
    errors.push(
      `Selected width ${media.widthMm} mm exceeds printer maximum ${capabilities.maxWidthMm} mm.`,
    );
  }
  if (capabilities.maxHeightMm != null && media.heightMm > capabilities.maxHeightMm + 0.15) {
    errors.push(
      `Selected height ${media.heightMm} mm exceeds printer maximum ${capabilities.maxHeightMm} mm.`,
    );
  }
  if (media.widthMm > capabilities.printableWidthMm + 0.15) {
    errors.push(
      `Selected width ${media.widthMm} mm exceeds printable width ${capabilities.printableWidthMm} mm.`,
    );
  }
  if (!capabilities.dpiX || !capabilities.dpiY) {
    errors.push('Printer DPI is unknown. Choose a printer profile before printing.');
  }
  if (media.type === 'blackmark' && !capabilities.supportsBlackMark) {
    errors.push('This printer does not support black-mark media.');
  }
  if (media.type === 'gap' && !capabilities.supportsGap) {
    warnings.push('Gap media was selected; this printer may not sense gaps.');
  }
  if (media.type === 'continuous' && !capabilities.supportsContinuous) {
    warnings.push('Continuous media was selected; this printer may expect gaps.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
