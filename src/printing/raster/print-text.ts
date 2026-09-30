/**
 * Print-time text normalization and per-glyph font fallback.
 * Keyboard emoji often append U+FE0F (variation selector), which has no glyph
 * in Latin fonts and renders as a solid missing-glyph bar beside the emoji.
 */

/** Code points removed before raster — invisible modifiers, not drawable ink. */
const STRIP_CODEPOINTS = new Set([
  0xfe0f, // variation selector-16 (emoji presentation)
  0xfe0e, // variation selector-15 (text presentation)
  0x200b, // zero width space
  0x200c, // zero width non-joiner
  0x2060, // word joiner
  0xfeff, // zero width no-break space / BOM
]);

export function normalizePrintText(text: string): string {
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp == null || STRIP_CODEPOINTS.has(cp)) continue;
    out += char;
  }
  return out;
}

export type PrintFontGlyphProbe = {
  measureText: (text: string) => { width: number };
  hasGlyph: (char: string) => boolean;
};

export function printFontGlyphProbe(font: {
  getGlyphIDs?: (str: string, numCodePoints?: number) => number[];
  measureText: (text: string) => { width: number };
}): PrintFontGlyphProbe {
  return {
    measureText: (t) => font.measureText(t),
    hasGlyph: (char) => {
      if (!font.getGlyphIDs) return true;
      const ids = font.getGlyphIDs(char, 1);
      return ids.length > 0 && ids[0] !== 0;
    },
  };
}

export type PrintTextSegment = {
  text: string;
  useEmoji: boolean;
};

/** Group consecutive characters that share the same font (primary vs emoji). */
export function segmentPrintText(
  text: string,
  primary: PrintFontGlyphProbe,
  emoji: PrintFontGlyphProbe | null,
): PrintTextSegment[] {
  const normalized = normalizePrintText(text);
  const segments: PrintTextSegment[] = [];
  let run = '';
  let runEmoji = false;

  const flush = () => {
    if (run.length === 0) return;
    segments.push({ text: run, useEmoji: runEmoji });
    run = '';
  };

  for (const char of normalized) {
    const useEmoji = !primary.hasGlyph(char) && emoji != null && emoji.hasGlyph(char);
    if (run.length > 0 && useEmoji !== runEmoji) flush();
    runEmoji = useEmoji;
    if (primary.hasGlyph(char) || useEmoji) {
      run += char;
    }
  }
  flush();
  return segments;
}

export function measurePrintTextWidth(
  text: string,
  primary: PrintFontGlyphProbe,
  emoji: PrintFontGlyphProbe | null,
): number {
  let w = 0;
  for (const seg of segmentPrintText(text, primary, emoji)) {
    const font = seg.useEmoji && emoji ? emoji : primary;
    w += font.measureText(seg.text).width;
  }
  return w;
}
