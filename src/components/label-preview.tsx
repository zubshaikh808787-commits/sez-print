import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CableFlagDieCutOverlay } from '@/components/cable-flag-outline';
import { ElementContentView } from '@/components/editor/element-renderer';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';
import { fitLabelSize, mediaShapeClipStyle } from '@/lib/label-geometry';
import { dotsPerMm, rectMmToDots } from '@/lib/printer/print-spec';
import { canvasFillFromDocument, sortLayers } from '@/lib/template-schema';

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
  showBorder = true,
}: {
  document: LabelDocument;
  widthPx: number;
  heightPx: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Editor chrome — omit when capturing a print raster. */
  showBorder?: boolean;
}) {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const bg = canvasFillFromDocument(document);
  const shapeClip = mediaShapeClipStyle(document.mediaShape, w, h);
  const showRectBorder = showBorder && document.mediaShape !== 'diecut';

  return (
    <View
      collapsable={false}
      style={[
        {
          width: w,
          height: h,
          backgroundColor: bg,
          ...shapeClip,
        },
        style,
      ]}>
      {/* Nested clip — absolute + rotated children must stay inside the label border. */}
      <View collapsable={false} style={{ width: w, height: h, backgroundColor: bg, ...shapeClip }}>
        {children}
      </View>
      {!showRectBorder ? null : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderWidth: ARTBOARD_BORDER_WIDTH,
              borderColor: ARTBOARD_BORDER_COLOR,
              borderRadius: shapeClip.borderRadius,
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
  /** Force exact pixel dimensions (print capture at printer dots for selected mm). */
  exactWidthPx?: number;
  exactHeightPx?: number;
  /** When set with exactWidthPx, element boxes use the same edge rounding as TSPL. */
  printDpi?: number;
  showStage?: boolean;
  style?: StyleProp<ViewStyle>;
  showArtboardBorder?: boolean;
  /** Omit elements with needPrinting === false (print capture only). */
  hideNonPrinting?: boolean;
};

function LabelElements({
  document,
  scale,
  hideNonPrinting = false,
  printDpi,
}: {
  document: LabelDocument;
  scale: number;
  hideNonPrinting?: boolean;
  printDpi?: number;
}) {
  const dpm = printDpi != null ? dotsPerMm(printDpi) : null;
  return (
    <>
      {sortLayers(document.elements)
        .filter((element) => !hideNonPrinting || element.needPrinting !== false)
        .map((element) => {
        const size = elementSizeMm(element);
        let leftPx: number;
        let topPx: number;
        let widthPx: number;
        let heightPx: number;
        let contentScale = scale;
        if (printDpi != null && dpm != null) {
          const box = rectMmToDots(element.left, element.top, size.width, size.height, printDpi);
          leftPx = box.x0;
          topPx = box.y0;
          widthPx = Math.max(1, box.widthDots);
          heightPx = Math.max(1, box.heightDots);
          contentScale = dpm;
        } else {
          widthPx = Math.max(1, size.width * scale);
          heightPx = Math.max(1, size.height * scale);
          leftPx = element.left * scale;
          topPx = element.top * scale;
        }
        return (
          <View
            key={element.id}
            style={{
              position: 'absolute',
              left: leftPx,
              top: topPx,
              width: widthPx,
              height: heightPx,
              overflow: 'hidden',
              opacity: element.opacity ?? 1,
              zIndex: element.zIndex ?? 0,
              transform: [{ rotate: `${element.rotation}deg` }],
            }}>
            <ElementContentView
              element={element}
              widthPx={widthPx}
              heightPx={heightPx}
              scale={contentScale}
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
  showBorder = true,
  hideNonPrinting = false,
  printDpi,
}: {
  document: LabelDocument;
  fitted: { widthPx: number; heightPx: number; scale: number };
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
  hideNonPrinting?: boolean;
  printDpi?: number;
}) {
  return (
    <ArtboardFrame
      document={document}
      widthPx={fitted.widthPx || 1}
      heightPx={fitted.heightPx || 1}
      style={style}
      showBorder={showBorder}>
      <TemplateBackgroundImage document={document} />
      {fitted.scale > 0 ? (
        <>
          {hideNonPrinting || printDpi != null ? null : (
            <CableFlagDieCutOverlay
              document={document}
              scale={fitted.scale}
              printDpi={printDpi}
              widthPx={fitted.widthPx || 1}
              heightPx={fitted.heightPx || 1}
            />
          )}
          <LabelElements
            document={document}
            scale={fitted.scale}
            hideNonPrinting={hideNonPrinting}
            printDpi={printDpi}
          />
        </>
      ) : null}
    </ArtboardFrame>
  );
}

export function LabelPreview({
  document,
  width = 0,
  maxHeight,
  exactWidthPx,
  exactHeightPx,
  printDpi,
  showStage = false,
  style,
  showArtboardBorder = true,
  hideNonPrinting = false,
}: LabelPreviewProps) {
  const [stageWidth, setStageWidth] = useState(0);

  if (exactWidthPx != null && exactHeightPx != null) {
    const w = Math.max(1, Math.round(exactWidthPx));
    const h = Math.max(1, Math.round(exactHeightPx));
    // Fill the capture box exactly (1:1 printer dots for the selected mm size).
    // Uniform scale from width keeps element aspect; artboard height is forced to h
    // so ViewShot matches SIZE / mm→dots (avoids 1px letterbox from independent rounding).
    const scale = w / Math.max(document.widthMm, 0.01);
    return (
      <View
        collapsable={false}
        style={[
          {
            width: w,
            height: h,
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
          },
          style,
        ]}>
        <LabelCanvas
          document={document}
          fitted={{ widthPx: w, heightPx: h, scale }}
          showBorder={showArtboardBorder}
          hideNonPrinting={hideNonPrinting}
          printDpi={printDpi}
        />
      </View>
    );
  }

  if (!showStage) {
    const naturalHeight = width * (document.heightMm / Math.max(document.widthMm, 0.01));
    const fitted = fitLabelCanvas(
      document.widthMm,
      document.heightMm,
      width,
      maxHeight ?? naturalHeight,
    );
    return (
      <LabelCanvas
        document={document}
        fitted={fitted}
        style={style}
        showBorder={showArtboardBorder}
        hideNonPrinting={hideNonPrinting}
      />
    );
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
      <LabelCanvas
        document={document}
        fitted={fitted}
        showBorder={showArtboardBorder}
        hideNonPrinting={hideNonPrinting}
      />
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
