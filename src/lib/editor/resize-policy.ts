/**
 * Phase 5 resize policy — millimetres only.
 *
 * The RN transformer shows at most two edge anchors (middle-right, bottom-center).
 * Each element type has an explicit behavior (not “reuse image and hope”).
 *
 * Rotation stays on the editing pad / 90° control for aspect-locked types so the
 * selection chrome is just two arrows + a 1px outline.
 */

import { elementSizeMm, type ElementType, type LabelElement } from '@/lib/label-document';
import { finiteMm, MAX_ELEMENT_MM, MIN_ELEMENT_MM, roundMm, type CanvasBounds } from '@/lib/editor/engine';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';

/** Spec 5.2: proportional types cannot collapse below ~5mm. */
export const RESIZE_MIN_PROPORTIONAL_MM = 5;

export type ResizeAnchor = 'e' | 's';
export type ResizeBehavior = 'aspect' | 'square' | 'width' | 'height';

export type ResizePolicy = {
  anchors: ResizeAnchor[];
  behavior: Partial<Record<ResizeAnchor, ResizeBehavior>>;
  /** On-canvas rotate stem. False when rotation lives on the editing pad. */
  rotateHandle: boolean;
  minMm: number;
  /** Why this type resizes this way (Task 5.4). */
  comment: string;
};

export type MmBox = { left: number; top: number; width: number; height: number };

export function aspectRatioOf(element: LabelElement): number {
  if (element.type === 'qrcode') return 1;
  if (element.type === 'image' && typeof element.originalAspect === 'number' && element.originalAspect > 0) {
    return element.originalAspect;
  }
  const size = elementSizeMm(element);
  if (!(size.height > 0)) return 1;
  return size.width / size.height;
}

export function resizePolicyFor(element: LabelElement): ResizePolicy {
  const type: ElementType = element.type;
  switch (type) {
    case 'image':
    case 'clipart':
    case 'signature': {
      const locked = element.type === 'image' ? element.aspectRatioLocked !== false : true;
      return {
        anchors: ['e', 's'],
        behavior: locked ? { e: 'aspect', s: 'aspect' } : { e: 'width', s: 'height' },
        rotateHandle: false,
        minMm: RESIZE_MIN_PROPORTIONAL_MM,
        comment:
          'Image/clipart/signature: two edge handles. Default aspect-lock so photos never stretch; unlock on the image panel to resize axes independently. Rotate via the editing pad.',
      };
    }
    case 'qrcode':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'square', s: 'square' },
        rotateHandle: false,
        minMm: RESIZE_MIN_PROPORTIONAL_MM,
        comment: 'QR must stay square (width = height), not merely a similar aspect.',
      };
    case 'barcode':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'width', s: 'height' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Barcode: two independent single-axis handles (e = width only, s = height only) matching canvas.md §3.1.',
      };
    case 'text':
    case 'degrees': {
      const autoTextHeight = 'autoTextHeight' in element ? element.autoTextHeight !== false : true;
      const autoWrapping = 'autoWrapping' in element ? element.autoWrapping : 'Word';
      const isAutoHeight = autoTextHeight && autoWrapping !== 'Close';
      if (!isAutoHeight) {
        return {
          anchors: ['e', 's'],
          behavior: { e: 'width', s: 'height' },
          rotateHandle: false,
          minMm: MIN_ELEMENT_MM,
          comment: 'Text/degrees with auto-wrapping off / fixed height allows independent width and height resizing.',
        };
      }
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Text/degrees: width only (wrap width). Vertical handle is hidden while auto wrapping is active; height is resized only by font size setting and wrapped lines.',
      };
    }
    case 'time':
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Time: width only (wrap width). No vertical resizing; height is resized only by font size setting.',
      };
    case 'line':
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: 0.1,
        comment: 'Line: length only. Stroke thickness is a property, not a drag axis.',
      };
    case 'shape':
    case 'arctext':
    case 'table':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'width', s: 'height' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Shape/arc-text/table: independent width and height. Not photos, so aspect is not forced.',
      };
    case 'border':
      return {
        anchors: [],
        behavior: {},
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Border is locked to the label; no resize handles.',
      };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function finiteAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return aspect;
}

/**
 * `boundBoxFunc` in millimetres: opposite edge stays put (right handle → left
 * edge + vertical centre; bottom handle → top edge + horizontal centre).
 */
export function boundBoxMm(opts: {
  anchor: ResizeAnchor;
  behavior: ResizeBehavior;
  start: MmBox;
  proposed: { width: number; height: number };
  aspect: number;
  minMm: number;
  canvas: CanvasBounds;
}): MmBox {
  const aspect = finiteAspect(opts.aspect);
  const minMm = Math.max(0.1, finiteMm(opts.minMm, MIN_ELEMENT_MM));
  const maxW = Math.max(minMm, finiteMm(opts.canvas.widthMm, minMm));
  const maxH = Math.max(minMm, finiteMm(opts.canvas.heightMm, minMm));
  const start = {
    left: finiteMm(opts.start.left),
    top: finiteMm(opts.start.top),
    width: Math.max(minMm, finiteMm(opts.start.width, minMm)),
    height: Math.max(minMm, finiteMm(opts.start.height, minMm)),
  };

  const proposedW = Math.max(minMm, finiteMm(opts.proposed.width, start.width));
  const proposedH = Math.max(minMm, finiteMm(opts.proposed.height, start.height));

  if (opts.behavior === 'width' && opts.anchor === 'e') {
    const clamped = clampToLabelBounds(
      { left: start.left, top: start.top, width: proposedW, height: start.height },
      opts.canvas,
      { anchor: 'e', minMm },
    );
    return {
      left: clamped.left,
      top: clamped.top,
      width: clamped.width,
      height: clamped.height,
    };
  }

  if (opts.behavior === 'height' && opts.anchor === 's') {
    const clamped = clampToLabelBounds(
      { left: start.left, top: start.top, width: start.width, height: proposedH },
      opts.canvas,
      { anchor: 's', minMm },
    );
    return {
      left: clamped.left,
      top: clamped.top,
      width: clamped.width,
      height: clamped.height,
    };
  }

  let width = start.width;
  let height = start.height;
  let left = start.left;
  let top = start.top;

  if (opts.behavior === 'square') {
    const driving = opts.anchor === 'e' ? proposedW : proposedH;
    const maxSide = Math.min(maxW - start.left, maxH - start.top, MAX_ELEMENT_MM);
    const side = clamp(driving, minMm, Math.max(minMm, maxSide));
    width = side;
    height = side;
  } else if (opts.behavior === 'aspect') {
    if (opts.anchor === 'e') {
      const maxAvailW = Math.max(minMm, Math.min(maxW - start.left, (maxH - start.top) * aspect));
      width = clamp(proposedW, minMm, Math.min(maxAvailW, MAX_ELEMENT_MM));
      height = width / aspect;
    } else {
      const maxAvailH = Math.max(minMm, Math.min(maxH - start.top, (maxW - start.left) / aspect));
      height = clamp(proposedH, minMm, Math.min(maxAvailH, MAX_ELEMENT_MM));
      width = height * aspect;
    }
  }

  left = start.left;
  top = start.top;

  return {
    left: roundMm(left),
    top: roundMm(top),
    width: roundMm(width),
    height: roundMm(height),
  };
}
