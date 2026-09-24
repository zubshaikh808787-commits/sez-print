import { elementSizeMm, type LabelElement } from '@/lib/label-document';

const ADSORBABLE_TYPES = new Set<LabelElement['type']>(['image', 'clipart']);

/** Center logo fraction of the QR quiet zone (WePrint-style picture adsorption). */
const LOGO_FRACTION = 0.22;
const PROXIMITY_FACTOR = 0.75;

export function applyPictureAdsorption(
  element: LabelElement,
  elements: LabelElement[],
  enabled: boolean,
): { left: number; top: number; width: number; height: number } | null {
  if (!enabled || !ADSORBABLE_TYPES.has(element.type)) return null;

  const size = elementSizeMm(element);
  const cx = element.left + size.width / 2;
  const cy = element.top + size.height / 2;

  let nearest: { qr: LabelElement; distance: number } | null = null;
  for (const candidate of elements) {
    if (candidate.type !== 'qrcode' || candidate.id === element.id) continue;
    const qrSize = elementSizeMm(candidate);
    const qcx = candidate.left + qrSize.width / 2;
    const qcy = candidate.top + qrSize.height / 2;
    const distance = Math.hypot(cx - qcx, cy - qcy);
    const threshold = Math.max(qrSize.width, qrSize.height) * PROXIMITY_FACTOR;
    if (distance <= threshold && (!nearest || distance < nearest.distance)) {
      nearest = { qr: candidate, distance };
    }
  }
  if (!nearest) return null;

  const qrSize = elementSizeMm(nearest.qr);
  const logoMax = Math.min(qrSize.width, qrSize.height) * LOGO_FRACTION;
  const aspect = size.width / Math.max(size.height, 0.01);
  let width = logoMax;
  let height = logoMax;
  if (aspect >= 1) {
    height = logoMax / aspect;
  } else {
    width = logoMax * aspect;
  }
  return {
    left: nearest.qr.left + (qrSize.width - width) / 2,
    top: nearest.qr.top + (qrSize.height - height) / 2,
    width,
    height,
  };
}
