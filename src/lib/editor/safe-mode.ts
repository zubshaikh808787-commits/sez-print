import { elementSizeMm, type LabelElement } from '@/lib/label-document';

/** Pull a box fully onto the label. Larger than the label stays pinned at the origin. */
export function fullyInsideLabelMm(
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidthMm: number,
  canvasHeightMm: number,
): { left: number; top: number } {
  'worklet';
  const maxLeft = Math.max(0, canvasWidthMm - Math.max(0, width));
  const maxTop = Math.max(0, canvasHeightMm - Math.max(0, height));
  return {
    left: Math.min(maxLeft, Math.max(0, left)),
    top: Math.min(maxTop, Math.max(0, top)),
  };
}

export type MmBox = { left: number; top: number; width: number; height: number };

function overlapBoxes(elements: LabelElement[]): MmBox[] {
  return elements
    .filter((el) => el.visible !== false && el.type !== 'border' && el.needPrinting !== false)
    .map((el) => {
      const size = elementSizeMm(el);
      return { left: el.left, top: el.top, width: size.width, height: size.height };
    });
}

function intersectionBox(a: MmBox, b: MmBox): MmBox | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function unionBoxes(a: MmBox, b: MmBox): MmBox {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return { left, top, width: right - left, height: bottom - top };
}

function clusterOverlapRegions(hits: MmBox[]): MmBox[] {
  const clusters = [...hits];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (intersectionBox(clusters[i], clusters[j])) {
          clusters[i] = unionBoxes(clusters[i], clusters[j]);
          clusters.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return clusters;
}

/** Distinct overlap zones (one per separate pile of intersecting elements). */
export function labelOverlapRegionsMm(elements: LabelElement[]): MmBox[] {
  const boxes = overlapBoxes(elements);
  const hits: MmBox[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const hit = intersectionBox(boxes[i], boxes[j]);
      if (hit) hits.push(hit);
    }
  }
  return clusterOverlapRegions(hits);
}

/** @deprecated Use labelOverlapRegionsMm — kept for single-region callers. */
export function labelOverlapRegionMm(elements: LabelElement[]): MmBox | null {
  const regions = labelOverlapRegionsMm(elements);
  return regions[0] ?? null;
}

/** True when two visible, non-border elements share area. Edge contact does not count. */
export function labelElementsOverlap(elements: LabelElement[]): boolean {
  return labelOverlapRegionsMm(elements).length > 0;
}

const OVERLAP_BANNER_SIZE_PX = { width: 122, height: 28 };

/** Place the overlap warning near the overlap region, clamped inside the artboard. */
export function overlapBannerPositionPx(
  regionMm: MmBox,
  pxPerMM: number,
  artboardWidthPx: number,
  artboardHeightPx: number,
  rulerSizePx: number,
): { top: number; left: number } {
  const regionLeftPx = regionMm.left * pxPerMM;
  const regionTopPx = regionMm.top * pxPerMM;
  const regionWidthPx = regionMm.width * pxPerMM;
  const regionHeightPx = regionMm.height * pxPerMM;
  const pad = 4;

  let left =
    regionLeftPx + regionWidthPx / 2 - OVERLAP_BANNER_SIZE_PX.width / 2;
  let top =
    regionTopPx + regionHeightPx / 2 - OVERLAP_BANNER_SIZE_PX.height / 2;

  left = Math.max(pad, Math.min(artboardWidthPx - OVERLAP_BANNER_SIZE_PX.width - pad, left));
  top = Math.max(pad, Math.min(artboardHeightPx - OVERLAP_BANNER_SIZE_PX.height - pad, top));

  return {
    top: rulerSizePx + top,
    left: rulerSizePx + left,
  };
}

/** Place overlap warnings near each overlap region, clamped inside the artboard. */
export function overlapBannerPositionsPx(
  regionsMm: MmBox[],
  pxPerMM: number,
  artboardWidthPx: number,
  artboardHeightPx: number,
  rulerSizePx: number,
): { top: number; left: number }[] {
  return regionsMm.map((region) =>
    overlapBannerPositionPx(region, pxPerMM, artboardWidthPx, artboardHeightPx, rulerSizePx),
  );
}
