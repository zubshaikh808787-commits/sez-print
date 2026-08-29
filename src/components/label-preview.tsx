import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';
import { fitLabelSize } from '@/lib/label-geometry';
import { canvasFillFromDocument, sortLayers, templateUsesDieCutBackground } from '@/lib/template-schema';

/** Workspace chrome around the artboard — not part of template content. */
export const LABEL_PAD_STAGE_COLOR = '#C5CDD6';
export const LABEL_PAD_INSET = 14;
export const LABEL_PAD_STAGE_MIN_HEIGHT = 176;
export const ARTBOARD_BORDER_WIDTH = 1;
export const ARTBOARD_BORDER_COLOR = 'rgba(15, 23, 42, 0.45)';

export const LABEL_PAD_CANVAS_STYLE = {
  overflow: 'hidden' as const,
};

export function artboardSurfaceStyle(document: LabelDocument): ViewStyle {
  return {
    overflow: 'hidden',
    backgroundColor: canvasFillFromDocument(document),
  };
}

export function fitLabelCanvas(
  widthMm: number,
  heightMm: number,
  maxWidthPx: number,
  maxHeightPx: number,
) {
  return fitLabelSize(widthMm, heightMm, maxWidthPx, maxHeightPx);
}

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

/**
 * One box drives clip + overlay border. Border is painted on top and does not
 * change the layout size (avoids Yoga content-box vs border-width mismatch).
 */
export function ArtboardFrame({
  document,
  widthPx,
  heightPx,
  children,
  style,
}: {
  document: LabelDocument;
  widthPx: number;
  heightPx: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const dieCut = templateUsesDieCutBackground(document.templatePreviewType ?? '');

  return (
    <View
      collapsable={false}
      style={[
        {
          width: w,
          height: h,
          overflow: 'hidden',
          backgroundColor: canvasFillFromDocument(document),
        },
        style,
      ]}>
      <View style={{ width: w, height: h, overflow: 'hidden' }}>{children}</View>
      {dieCut ? null : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderWidth: ARTBOARD_BORDER_WIDTH,
              borderColor: ARTBOARD_BORDER_COLOR,
            },
          ]}
        />
      )}
    </View>
  );
}

type LabelPreviewProps = {
  document: LabelDocument;
  width?: number;
  maxHeight?: number;
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
    <ArtboardFrame
      document={document}
      widthPx={fitted.widthPx || 1}
      heightPx={fitted.heightPx || 1}
      style={style}>
      <TemplateBackgroundImage document={document} />
      {fitted.scale > 0 ? <LabelElements document={document} scale={fitted.scale} /> : null}
    </ArtboardFrame>
  );
}

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
    overflow: 'hidden',
  },
});
