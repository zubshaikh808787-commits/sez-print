import { type AutoWrapping, type LineSpacing } from '@/components/editor/types';

/**
 * Convert typography points to millimetres.
 * Self-contained worklet function to avoid circular imports.
 */
export function ptToMm(pt: number): number {
  'worklet';
  return (pt * 25.4) / 72;
}

/**
 * Convert millimetres to typography points.
 */
export function mmToPt(mm: number): number {
  'worklet';
  return (mm * 72) / 25.4;
}

/**
 * Line spacing multiplier helper.
 */
export function lineSpacingMultiplier(spacing?: LineSpacing): number {
  'worklet';
  switch (spacing) {
    case '1.5':
      return 1.5;
    case '2.0':
      return 2.0;
    case 'Custom':
      return 1.75;
    default:
      return 1.0;
  }
}

/**
 * Character width estimation in em units relative to font size (1.0 em = 1 font size unit).
 * Calibrated against standard system / sans-serif fonts (Roboto, Inter, San Francisco, Arial).
 */
export function charWidthEm(ch: string, bold = false): number {
  'worklet';
  const code = ch.charCodeAt(0);

  // CJK / Full-width ideographs (Chinese, Japanese, Korean, full-width forms)
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60)
  ) {
    return 1.0;
  }

  let baseWidth: number;

  switch (ch) {
    // Wide uppercase
    case 'W':
    case 'M':
      baseWidth = 0.85;
      break;
    // Medium-wide uppercase
    case 'Q':
    case 'O':
    case 'C':
    case 'G':
    case 'D':
    case 'U':
      baseWidth = 0.7;
      break;
    // Standard uppercase
    case 'A':
    case 'B':
    case 'E':
    case 'F':
    case 'H':
    case 'K':
    case 'N':
    case 'P':
    case 'R':
    case 'S':
    case 'T':
    case 'V':
    case 'X':
    case 'Y':
    case 'Z':
      baseWidth = 0.6;
      break;
    // Narrow uppercase
    case 'I':
    case 'J':
    case 'L':
      baseWidth = 0.35;
      break;

    // Wide lowercase
    case 'w':
    case 'm':
      baseWidth = 0.8;
      break;
    // Standard lowercase
    case 'a':
    case 'b':
    case 'c':
    case 'd':
    case 'e':
    case 'g':
    case 'h':
    case 'k':
    case 'n':
    case 'o':
    case 'p':
    case 'q':
    case 'u':
    case 'v':
    case 'x':
    case 'y':
    case 'z':
      baseWidth = 0.52;
      break;
    // Narrow lowercase
    case 'f':
    case 'r':
    case 't':
      baseWidth = 0.35;
      break;
    case 'i':
    case 'j':
    case 'l':
      baseWidth = 0.25;
      break;

    // Digits
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      baseWidth = 0.55;
      break;

    // Space
    case ' ':
      baseWidth = 0.28;
      break;

    // Narrow punctuation
    case '.':
    case ',':
    case ':':
    case ';':
    case '!':
    case "'":
    case '|':
    case '`':
      baseWidth = 0.25;
      break;

    // Medium punctuation
    case '-':
    case '(':
    case ')':
    case '[':
    case ']':
    case '{':
    case '}':
    case '/':
    case '\\':
    case '?':
      baseWidth = 0.35;
      break;

    // Wide punctuation & math
    case '"':
    case '*':
    case '+':
    case '=':
    case '<':
    case '>':
    case '~':
    case '^':
    case '_':
      baseWidth = 0.55;
      break;

    case '@':
    case '#':
    case '%':
    case '&':
    case '$':
      baseWidth = 0.78;
      break;

    default:
      baseWidth = 0.55;
      break;
  }

  return bold ? baseWidth * 1.05 : baseWidth;
}

/**
 * Measure total physical width in millimetres of a single-line string at a given font size.
 */
export function measureTextWidthMm(
  text: string,
  fontSizePt: number,
  charSpacingMm = 0,
  bold = false,
): number {
  'worklet';
  if (!text || text.length === 0) return 0;
  const emToMm = ptToMm(fontSizePt);
  let totalMm = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    totalMm += charWidthEm(ch, bold) * emToMm + charSpacingMm;
  }
  return totalMm;
}

export type ComputeWrappedLinesParams = {
  text: string;
  fontSize: number;
  widthMm: number;
  autoWrapping?: AutoWrapping;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
};

/**
 * Compute the wrapped line segments for text content given width constraints and wrapping mode.
 */
export function computeWrappedLines({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
}: ComputeWrappedLinesParams): string[] {
  'worklet';
  if (!text || text.length === 0) return [''];

  if (verticalDisplay) {
    const chars = text.split('');
    return chars.length > 0 ? chars : [''];
  }

  if (autoWrapping === 'Close') {
    const lines = text.split('\n');
    return lines.length > 0 ? lines : [''];
  }

  const safeWidthMm = Math.max(0.5, widthMm);
  const paragraphs = text.split('\n');
  const result: string[] = [];

  if (autoWrapping === 'Char') {
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      if (para.length === 0) {
        result.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const ch = para.charAt(i);
        const testLine = currentLine + ch;
        if (currentLine.length > 0 && measureTextWidthMm(testLine, fontSize, charSpacing, bold) > safeWidthMm) {
          result.push(currentLine);
          currentLine = ch;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine.length > 0) {
        result.push(currentLine);
      }
    }
    return result.length > 0 ? result : [''];
  }

  // AutoWrapping === 'Word' (default)
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p];
    if (para.length === 0) {
      result.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const candidate = currentLine.length > 0 ? currentLine + ' ' + word : word;

      if (measureTextWidthMm(candidate, fontSize, charSpacing, bold) <= safeWidthMm) {
        currentLine = candidate;
      } else {
        if (currentLine.length > 0) {
          result.push(currentLine);
          currentLine = '';
        }

        // Check if individual word exceeds available width on its own
        if (measureTextWidthMm(word, fontSize, charSpacing, bold) <= safeWidthMm) {
          currentLine = word;
        } else {
          // Word is too long to fit in one line, break mid-word
          let partial = '';
          for (let c = 0; c < word.length; c++) {
            const ch = word.charAt(c);
            const testPartial = partial + ch;
            if (partial.length > 0 && measureTextWidthMm(testPartial, fontSize, charSpacing, bold) > safeWidthMm) {
              result.push(partial);
              partial = ch;
            } else {
              partial = testPartial;
            }
          }
          currentLine = partial;
        }
      }
    }

    if (currentLine.length > 0 || para.length === 0) {
      result.push(currentLine);
    }
  }

  return result.length > 0 ? result : [''];
}

export type ComputeTextElementHeightParams = {
  text: string;
  fontSize: number;
  widthMm: number;
  autoWrapping?: AutoWrapping;
  lineSpacing?: LineSpacing;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
};

/**
 * Compute the rendered & physical height in mm of a text element based on wrapped lines.
 */
export function computeTextElementHeightMm({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  lineSpacing = '1.0',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
}: ComputeTextElementHeightParams): number {
  'worklet';
  const lines = computeWrappedLines({
    text,
    fontSize,
    widthMm,
    autoWrapping,
    charSpacing,
    bold,
    verticalDisplay,
  });

  const mult = lineSpacingMultiplier(lineSpacing);
  const perLineMm = ptToMm(fontSize) * 1.25 * mult;
  return Math.max(2.4, perLineMm * Math.max(1, lines.length));
}
