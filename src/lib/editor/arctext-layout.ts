import { charWidthEm } from '@/lib/text-metrics';

export type ArcCharLayout = {
  char: string;
  x: number;
  y: number;
  rotationDeg: number;
};

export type ArcTextLayoutResult = {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  effectiveFontSizePx: number;
  characters: ArcCharLayout[];
};

export type ComputeArcTextLayoutParams = {
  text: string;
  widthPx: number;
  heightPx: number;
  nominalFontSizePx: number;
  lineWidthMm?: number;
  scale?: number;
  bold?: boolean;
};

/**
 * Computes polar vector coordinates and tangent rotations for text curved along
 * a circular arc with an inscribed circular guide line.
 */
export function computeArcTextLayout({
  text,
  widthPx,
  heightPx,
  nominalFontSizePx,
  lineWidthMm = 0.25,
  scale = 1,
  bold = false,
}: ComputeArcTextLayoutParams): ArcTextLayoutResult {
  const diameter = Math.min(widthPx, heightPx);
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const strokeWidth = Math.max(0.75, (lineWidthMm || 0.25) * scale);
  const radius = Math.max(2, (diameter - strokeWidth) / 2 - 1);

  if (!text || text.length === 0 || radius <= 4) {
    return {
      cx,
      cy,
      radius,
      strokeWidth,
      effectiveFontSizePx: nominalFontSizePx,
      characters: [],
    };
  }

  // Baseline radius hugs inside the circular guide line
  let effectiveFontSizePx = nominalFontSizePx;
  let baselineRadius = Math.max(2, radius - effectiveFontSizePx * 0.95 - strokeWidth / 2 - 1);

  // Maximum angular span allowed (350 degrees to leave breathing room at bottom)
  const maxAllowedAngleRad = (350 * Math.PI) / 180;

  const calcTotalAngle = (fontSize: number, r: number) => {
    let total = 0;
    const letterSpacing = fontSize * 0.05;
    for (let i = 0; i < text.length; i++) {
      const w = charWidthEm(text[i], bold) * fontSize + letterSpacing;
      total += w / r;
    }
    return total;
  };

  let totalAngle = calcTotalAngle(effectiveFontSizePx, baselineRadius);

  // Auto-shrink font size to fit if text exceeds max allowable circumference (Task Decision: Option A)
  if (totalAngle > maxAllowedAngleRad && totalAngle > 0) {
    const scaleFactor = maxAllowedAngleRad / totalAngle;
    effectiveFontSizePx = Math.max(3 * scale, nominalFontSizePx * scaleFactor);
    baselineRadius = Math.max(2, radius - effectiveFontSizePx * 0.95 - strokeWidth / 2 - 1);
    totalAngle = calcTotalAngle(effectiveFontSizePx, baselineRadius);
  }

  // Symmetrically center text at the 12 o'clock peak (angle = -PI / 2)
  let currentAngle = -Math.PI / 2 - totalAngle / 2;
  const letterSpacing = effectiveFontSizePx * 0.05;
  const characters: ArcCharLayout[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth = charWidthEm(char, bold) * effectiveFontSizePx + letterSpacing;
    const deltaAngle = charWidth / baselineRadius;
    const midAngle = currentAngle + deltaAngle / 2;

    const x = cx + baselineRadius * Math.cos(midAngle);
    const y = cy + baselineRadius * Math.sin(midAngle);
    const rotationDeg = (midAngle * 180) / Math.PI + 90;

    characters.push({
      char,
      x,
      y,
      rotationDeg,
    });

    currentAngle += deltaAngle;
  }

  return {
    cx,
    cy,
    radius,
    strokeWidth,
    effectiveFontSizePx,
    characters,
  };
}
