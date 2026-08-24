import { StyleSheet, View } from 'react-native';

import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';

type LabelPreviewProps = {
  document: LabelDocument;
  /** Available width in px; height derives from the label aspect ratio. */
  width: number;
  style?: object;
};

/** Non-interactive scaled rendering of a label document. */
export function LabelPreview({ document, width, style }: LabelPreviewProps) {
  const scale = width / document.widthMm;
  const height = document.heightMm * scale;

  return (
    <View style={[styles.canvas, { width, height }, style]} pointerEvents="none">
      {document.elements.map((element) => {
        const size = elementSizeMm(element);
        const widthPx = Math.max(2, size.width * scale);
        const heightPx = Math.max(2, size.height * scale);
        return (
          <View
            key={element.id}
            style={{
              position: 'absolute',
              left: element.left * scale,
              top: element.top * scale,
              width: widthPx,
              height: heightPx,
              transform: [{ rotate: `${element.rotation}deg` }],
            }}>
            <ElementContentView
              element={element}
              widthPx={widthPx}
              heightPx={heightPx}
              scale={scale}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderRadius: 4,
  },
});
