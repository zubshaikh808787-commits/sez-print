/**
 * Phase 6 lean interaction chrome.
 *
 * Visual pixels only. Element millimetres, jewelry 54×96, and cable 50×73
 * print sizes are never stored or derived here.
 */

/** Transformer / ghost outline. Not the old 1.5–2px highlight box. */
export const CHROME_STROKE_PX = 1;

/** Brand-accent teal, light enough to read as a hairline (not heavy blue). */
export const CHROME_STROKE_LIGHT = 'rgba(23, 166, 184, 0.85)';

/** Higher-luminance teal so the same 1px line holds on a dark label fill. */
export const CHROME_STROKE_DARK = 'rgba(153, 246, 228, 0.92)';

export const CHROME_HANDLE_COLOR = '#64748B';

/** Task 6.1: no drop shadow on the transformer border or anchors. */
export const CHROME_HAS_SHADOW = false;

/** Task 6.2: dragged node reads as lifted, not boxed. */
export const DRAG_LIFT_OPACITY = 0.85;

export const PALETTE_GHOST_MAX_EDGE_PX = 44;
export const PALETTE_GHOST_MIN_EDGE_PX = 20;
export const PALETTE_GHOST_LINE_THICKNESS_PX = 8;
export const PALETTE_GHOST_FILL = 'rgba(23, 166, 184, 0.12)';
export const PALETTE_GHOST_OPACITY = 0.72;

export const SNAP_GUIDE_COLOR = 'rgba(23, 166, 184, 0.65)';
export const SNAP_GUIDE_STROKE_PX = 1;

export type ChromeBackground = 'light' | 'dark';

export function chromeStrokeForBackground(kind: ChromeBackground): string {
  return kind === 'dark' ? CHROME_STROKE_DARK : CHROME_STROKE_LIGHT;
}

/** Relative luminance 0–1 from a #rgb / #rrggbb fill. Non-hex → light artboard. */
export function fillLuminance(hex: string): number {
  const raw = hex.trim().replace('#', '');
  const six =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(six)) return 1;
  const r = parseInt(six.slice(0, 2), 16) / 255;
  const g = parseInt(six.slice(2, 4), 16) / 255;
  const b = parseInt(six.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function chromeStrokeForFill(hex: string): string {
  return chromeStrokeForBackground(fillLuminance(hex) < 0.45 ? 'dark' : 'light');
}

export function dragOpacity(baseOpacity: number): number {
  const base = Number.isFinite(baseOpacity) ? Math.min(1, Math.max(0, baseOpacity)) : 1;
  return Math.round(base * DRAG_LIFT_OPACITY * 100) / 100;
}

/**
 * Small icon-sized preview. Never the placed element's on-canvas pixel size —
 * that reads as a bold opaque rectangle (the native drag ghost we are avoiding).
 */
export function paletteGhostSizePx(
  widthMm: number,
  heightMm: number,
): { widthPx: number; heightPx: number } {
  const w = Math.max(0.1, Number.isFinite(widthMm) ? widthMm : 0.1);
  const h = Math.max(0.1, Number.isFinite(heightMm) ? heightMm : 0.1);
  if (h <= 1.5 && w >= h * 4) {
    return { widthPx: PALETTE_GHOST_MAX_EDGE_PX, heightPx: PALETTE_GHOST_LINE_THICKNESS_PX };
  }
  const aspect = w / h;
  if (aspect >= 1) {
    return {
      widthPx: PALETTE_GHOST_MAX_EDGE_PX,
      heightPx: Math.max(
        PALETTE_GHOST_MIN_EDGE_PX,
        Math.round((PALETTE_GHOST_MAX_EDGE_PX / aspect) * 10) / 10,
      ),
    };
  }
  return {
    widthPx: Math.max(
      PALETTE_GHOST_MIN_EDGE_PX,
      Math.round(PALETTE_GHOST_MAX_EDGE_PX * aspect * 10) / 10,
    ),
    heightPx: PALETTE_GHOST_MAX_EDGE_PX,
  };
}
