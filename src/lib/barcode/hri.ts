/** Human-readable barcode text. Encoding still uses the raw digit string. */
export function formatBarcodeHri(mode: string, content: string): string {
  if (mode !== 'UPC-A') return content;
  const digits = content.replace(/\D/g, '');
  if (digits.length === 12) {
    return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
  }
  return content;
}
