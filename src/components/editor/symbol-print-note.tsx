import { Text, StyleSheet } from 'react-native';

import { elementInkLayout } from '@/lib/printer/whole-dot-layout';
import type { LabelElement } from '@/lib/label-document';
import { useSettingsStore } from '@/stores/settings-store';

export function SymbolPrintNote({
  element,
}: {
  element: Extract<LabelElement, { type: 'qrcode' | 'barcode' }>;
}) {
  const dpi = useSettingsStore((s) => s.printing.printerDpi ?? 304);
  const exactBarcode = useSettingsStore((s) => s.printing.exactBarcodeWidth === true);
  const layout = elementInkLayout(element, dpi);
  const stretched = element.type === 'barcode' && !exactBarcode;
  const widthMm = stretched ? element.width : layout.printedWidthMm;
  const heightMm = element.type === 'barcode' ? element.height : layout.printedHeightMm;
  const warnings: string[] = [];
  if (layout.warnings.includes('qr_cell_gt_10')) {
    warnings.push('QR cell is wider than 10 dots (SDK vector limit). Bitmap print still uses this size.');
  }
  if (element.type === 'barcode' && layout.warnings.includes('bar_narrow_lt_2') && exactBarcode) {
    warnings.push('Narrow bar is under 2 dots at 304 dpi. Scanners may miss it.');
  }
  return (
    <>
      <Text style={styles.note}>
        {`Requested ${ (element.requestedWidthMm ?? element.width).toFixed(2) } × ${ (element.requestedHeightMm ?? element.height).toFixed(2) } mm. Prints ${widthMm.toFixed(2)} × ${heightMm.toFixed(2)} mm${stretched ? ' (bars stretched to the box)' : ''}.`}
      </Text>
      {warnings.map((line) => (
        <Text key={line} style={styles.warn}>
          {line}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 8, marginHorizontal: 16, fontSize: 13, lineHeight: 20, color: '#8A97A4' },
  warn: { marginTop: 4, marginHorizontal: 16, fontSize: 13, lineHeight: 20, color: '#B45309' },
});
