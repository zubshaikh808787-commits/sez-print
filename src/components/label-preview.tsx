import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';
import { canvasFillFromDocument, sortLayers, templateScaleFactor } from '@/lib/template-schema';

/** Workspace chrome around the artboard — not part of template content. */
export const LABEL_PAD_STAGE_COLOR = '#C5CDD6';
export const LABEL_PAD_INSET = 14;
export const LABEL_PAD_STAGE_MIN_HEIGHT = 176;

/** Artboard bounds only. Fill comes from template JSON (`background`). */
export const LABEL_PAD_CANVAS_STYLE = {
  overflow: 'hidden' as const,
  borderWidth: 1,
  borderColor: 'rgba(15, 23, 42, 0.35)',
};

export function artboardSurfaceStyle(document: LabelDocument): ViewStyle {
  return {
    ...LABEL_PAD_CANVAS_STYLE,
    backgroundColor: canvasFillFromDocument(document),
  };
}

export function fitLabelCanvas(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
): { widthPx: number; heightPx: number; scale: number } {
  const scale = templateScaleFactor(widthMm, heightMm, maxWidthPx, maxHeightPx);
  return {
    widthPx: widthMm * scale,
    heightPx: heightMm * scale,
    scale,
  };
}

/** Fit the artboard inside the gray workspace the same way the editor does. */
export function fitLabelPad(
  widthMm: number,
  heightMm: number,
  stageOuterWidthPx: number,
  canvasMaxHeightPx: number,
) {
  return fitLabelCanvas(
    widthMm,
    heightMm,
    Math.max(0, stageOuterWidthPx - LABEL_PAD_INSET * 2),
    Math.max(0, canvasMaxHeightPx),
  );
}

type LabelPreviewProps = {
  document: LabelDocument;
  /** Maximum width in px. With `showStage`, the stage fills the parent and this is only a fallback before layout. */
  width?: number;
  /** Maximum canvas height in px. Defaults to the true aspect-ratio height for `width`. */
  maxHeight?: number;
  /** Gray workspace around the artboard — not template content. */
  showStage?: boolean;
  style?: StyleProp<ViewStyle>;
};

function LabelElements({
  document,
  scale,
}: {
  document: LabelDocument;
  scale: number;
}) {
  return (
    <>
      {sortLayers(document.elements).map((element) => {
        const size = elementSizeMm(element);
        const widthPx = Math.max(1, size.width * scale);
        const heightPx = Math.max(1, size.height * scale);
        return (
          <View
            key={element.id}
            style={{
              position: 'absolute',
              left: element.left * scale,
              top: element.top * scale,
              width: widthPx,
              height: heightPx,
              opacity: element.opacity ?? 1,
              zIndex: element.zIndex ?? 0,
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
    </>
  );
}

function TemplateBackgroundImage({ document }: { document: LabelDocument }) {
  if (document.background?.type !== 'image') return null;
  return (
    <Image
      source={{ uri: document.background.uri }}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
    />
  );
}

function LabelCanvas({
  document,
  fitted,
  style,
}: {
  document: LabelDocument;
  fitted: { widthPx: number; heightPx: number; scale: number };
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        artboardSurfaceStyle(document),
        { width: fitted.widthPx || 1, height: fitted.heightPx || 1 },
        style,
      ]}
      pointerEvents="none">
      <TemplateBackgroundImage document={document} />
      {fitted.scale > 0 ? <LabelElements document={document} scale={fitted.scale} /> : null}
    </View>
  );
}

/** Non-interactive scaled rendering of template JSON layers (same artboard as the editor). */
export function LabelPreview({
  document,
  width = 0,
  maxHeight,
  showStage = false,
  style,
}: LabelPreviewProps) {
  const [stageWidth, setStageWidth] = useState(0);

  if (!showStage) {
    const naturalHeight = width * (document.heightMm / Math.max(document.widthMm, 0.01));
    const fitted = fitLabelCanvas(
      document.widthMm,
      document.heightMm,
      width,
      maxHeight ?? naturalHeight,
    );
    return <LabelCanvas document={document} fitted={fitted} style={style} />;
  }

  const outerWidth = stageWidth > 0 ? stageWidth : width;
  const canvasMaxHeight = maxHeight ?? LABEL_PAD_STAGE_MIN_HEIGHT;
  const fitted = fitLabelPad(document.widthMm, document.heightMm, outerWidth, canvasMaxHeight);

  return (
    <View
      style={[styles.stage, { width: '100%', minHeight: LABEL_PAD_STAGE_MIN_HEIGHT }, style]}
      pointerEvents="none"
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (Math.abs(next - stageWidth) > 1) setStageWidth(next);
      }}>
      <LabelCanvas document={document} fitted={fitted} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: LABEL_PAD_STAGE_COLOR,
    paddingVertical: LABEL_PAD_INSET,
    paddingHorizontal: LABEL_PAD_INSET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
