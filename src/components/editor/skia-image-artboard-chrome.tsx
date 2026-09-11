import { memo, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { DIVIDER_HIT_SIZE_PX } from '@/lib/editor/canvas-split';
import { CHROME_HANDLE_COLOR, CHROME_STROKE_LIGHT, CHROME_STROKE_PX } from '@/lib/editor/canvas-chrome';
import { RESIZE_MIN_PROPORTIONAL_MM } from '@/lib/editor/resize-policy';
import type { MmBox, ResizeAnchor } from '@/lib/editor/resize-policy';
import {
  mmBoxToSkiaRect,
  skiaImageDragMm,
  skiaImageResizeMm,
} from '@/lib/editor/skia-prototype';
import { pxToMm } from '@/lib/label-coordinate-system';

const EDGE = DIVIDER_HIT_SIZE_PX;

export type SkiaImageArtboardChromeProps = {
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
  image: MmBox;
  onImageChange: (next: MmBox) => void;
  children: ReactNode;
};

/**
 * RNGH overlay: drag + Phase 5 e/s resize. Rendering (Skia or View) is `children`.
 */
export const SkiaImageArtboardChrome = memo(function SkiaImageArtboardChrome({
  widthMm,
  heightMm,
  pxPerMm,
  image,
  onImageChange,
  children,
}: SkiaImageArtboardChromeProps) {
  const canvas = useMemo(() => ({ widthMm, heightMm }), [widthMm, heightMm]);
  const rect = mmBoxToSkiaRect(image, pxPerMm);
  const canvasW = Math.max(1, widthMm * pxPerMm);
  const canvasH = Math.max(1, heightMm * pxPerMm);

  const imageRef = useRef(image);
  imageRef.current = image;
  const startRef = useRef(image);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const pxRef = useRef(pxPerMm);
  pxRef.current = pxPerMm;
  const emitRef = useRef(onImageChange);
  emitRef.current = onImageChange;

  const applyDrag = (dxPx: number, dyPx: number) => {
    const start = startRef.current;
    const scale = pxRef.current;
    emitRef.current(
      skiaImageDragMm({
        leftMm: start.left + pxToMm(dxPx, scale),
        topMm: start.top + pxToMm(dyPx, scale),
        widthMm: start.width,
        heightMm: start.height,
        canvas: canvasRef.current,
      }),
    );
  };

  const applyResize = (anchor: ResizeAnchor, dxPx: number, dyPx: number) => {
    const start = startRef.current;
    const scale = pxRef.current;
    const aspect = start.height > 0 ? start.width / start.height : 1;
    emitRef.current(
      skiaImageResizeMm({
        anchor,
        start,
        proposed:
          anchor === 'e'
            ? { width: start.width + pxToMm(dxPx, scale), height: start.height }
            : { width: start.width, height: start.height + pxToMm(dyPx, scale) },
        aspect,
        canvas: canvasRef.current,
        minMm: RESIZE_MIN_PROPORTIONAL_MM,
      }),
    );
  };

  const captureStart = () => {
    startRef.current = imageRef.current;
  };

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          runOnJS(captureStart)();
        })
        .onUpdate((e) => {
          runOnJS(applyDrag)(e.translationX, e.translationY);
        }),
    [],
  );

  const resizeE = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(1)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          runOnJS(captureStart)();
        })
        .onUpdate((e) => {
          runOnJS(applyResize)('e', e.translationX, e.translationY);
        }),
    [],
  );

  const resizeS = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(1)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          runOnJS(captureStart)();
        })
        .onUpdate((e) => {
          runOnJS(applyResize)('s', e.translationX, e.translationY);
        }),
    [],
  );

  return (
    <View style={[styles.board, { width: canvasW, height: canvasH }]}>
      {children}
      <GestureDetector gesture={drag}>
        <View
          collapsable={false}
          style={[
            styles.bodyHit,
            {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderColor: CHROME_STROKE_LIGHT,
              borderWidth: CHROME_STROKE_PX,
            },
          ]}
        />
      </GestureDetector>
      <GestureDetector gesture={resizeE}>
        <View
          collapsable={false}
          style={[
            styles.handle,
            { left: rect.x + rect.width - EDGE / 2, top: rect.y + rect.height / 2 - EDGE / 2 },
          ]}>
          <AppIcon name="arrow.left.and.right" tintColor={CHROME_HANDLE_COLOR} size={14} weight="light" />
        </View>
      </GestureDetector>
      <GestureDetector gesture={resizeS}>
        <View
          collapsable={false}
          style={[
            styles.handle,
            { left: rect.x + rect.width / 2 - EDGE / 2, top: rect.y + rect.height - EDGE / 2 },
          ]}>
          <AppIcon name="arrow.up.and.down" tintColor={CHROME_HANDLE_COLOR} size={14} weight="light" />
        </View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  board: {
    overflow: 'hidden',
    backgroundColor: '#E6EBEF',
  },
  bodyHit: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  handle: {
    position: 'absolute',
    width: EDGE,
    height: EDGE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
