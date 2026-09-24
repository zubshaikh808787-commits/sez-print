export type NormalizedCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, w: 1, h: 1 };

const MIN_FRACTION = 0.08;

export function computeContainRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
): LayoutRect {
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

export function cropNormToLayout(crop: NormalizedCrop, imageRect: LayoutRect): LayoutRect {
  return {
    x: imageRect.x + crop.x * imageRect.width,
    y: imageRect.y + crop.y * imageRect.height,
    width: crop.w * imageRect.width,
    height: crop.h * imageRect.height,
  };
}

function clamp01(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

/** Move crop box — width/height stay fixed; only origin shifts. */
export function moveCrop(crop: NormalizedCrop, dxNorm: number, dyNorm: number): NormalizedCrop {
  'worklet';
  return {
    x: clamp01(crop.x + dxNorm, 0, 1 - crop.w),
    y: clamp01(crop.y + dyNorm, 0, 1 - crop.h),
    w: crop.w,
    h: crop.h,
  };
}

/** Resize from a corner while keeping the opposite corner anchored. */
export function resizeCropCorner(
  start: NormalizedCrop,
  corner: 'tl' | 'tr' | 'bl' | 'br',
  dxNorm: number,
  dyNorm: number,
): NormalizedCrop {
  'worklet';
  const minW = MIN_FRACTION;
  const minH = MIN_FRACTION;

  if (corner === 'br') {
    const x = start.x;
    const y = start.y;
    const w = clamp01(start.w + dxNorm, minW, 1 - x);
    const h = clamp01(start.h + dyNorm, minH, 1 - y);
    return { x, y, w, h };
  }

  if (corner === 'bl') {
    const anchorRight = start.x + start.w;
    const y = start.y;
    const x = clamp01(start.x + dxNorm, 0, anchorRight - minW);
    const w = anchorRight - x;
    const h = clamp01(start.h + dyNorm, minH, 1 - y);
    return { x, y, w, h };
  }

  if (corner === 'tr') {
    const x = start.x;
    const anchorBottom = start.y + start.h;
    const y = clamp01(start.y + dyNorm, 0, anchorBottom - minH);
    const w = clamp01(start.w + dxNorm, minW, 1 - x);
    const h = anchorBottom - y;
    return { x, y, w, h };
  }

  const anchorRight = start.x + start.w;
  const anchorBottom = start.y + start.h;
  const x = clamp01(start.x + dxNorm, 0, anchorRight - minW);
  const y = clamp01(start.y + dyNorm, 0, anchorBottom - minH);
  const w = anchorRight - x;
  const h = anchorBottom - y;
  return { x, y, w, h };
}

export function cropNormToPixels(
  crop: NormalizedCrop,
  sourceWidth: number,
  sourceHeight: number,
): { originX: number; originY: number; width: number; height: number } {
  const originX = Math.max(0, Math.round(crop.x * sourceWidth));
  const originY = Math.max(0, Math.round(crop.y * sourceHeight));
  const width = Math.max(1, Math.min(sourceWidth - originX, Math.round(crop.w * sourceWidth)));
  const height = Math.max(1, Math.min(sourceHeight - originY, Math.round(crop.h * sourceHeight)));
  return { originX, originY, width, height };
}

export type CropDragKind = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'none';

const HANDLE_RADIUS = 28;

/** Hit-test touch point against crop handles and interior (screen coordinates). */
export function hitTestCropDrag(
  touchX: number,
  touchY: number,
  layout: LayoutRect,
): CropDragKind {
  'worklet';
  if (layout.width <= 0 || layout.height <= 0) return 'none';

  const corners: { kind: CropDragKind; cx: number; cy: number }[] = [
    { kind: 'tl', cx: layout.x, cy: layout.y },
    { kind: 'tr', cx: layout.x + layout.width, cy: layout.y },
    { kind: 'bl', cx: layout.x, cy: layout.y + layout.height },
    { kind: 'br', cx: layout.x + layout.width, cy: layout.y + layout.height },
  ];

  for (const corner of corners) {
    if (
      Math.abs(touchX - corner.cx) <= HANDLE_RADIUS &&
      Math.abs(touchY - corner.cy) <= HANDLE_RADIUS
    ) {
      return corner.kind;
    }
  }

  if (
    touchX >= layout.x &&
    touchX <= layout.x + layout.width &&
    touchY >= layout.y &&
    touchY <= layout.y + layout.height
  ) {
    return 'move';
  }

  return 'none';
}

export function layoutFromNorm(
  crop: NormalizedCrop,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
): LayoutRect {
  'worklet';
  return {
    x: imgX + crop.x * imgW,
    y: imgY + crop.y * imgH,
    width: crop.w * imgW,
    height: crop.h * imgH,
  };
}
