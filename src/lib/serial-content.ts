import type { LineSpacing } from '@/components/editor/types';

/** Increment trailing digits in serial strings (e.g. 015 → 016) per page/copy. */
export function applySerialOffset(content: string, step: number, pageIndex: number): string {
  if (!content || step === 0 || pageIndex === 0) return content;
  const match = content.match(/^(\D*)(\d+)(\D*)$/);
  if (!match) return content;
  const [, prefix, digits, suffix] = match;
  const next = parseInt(digits, 10) + step * pageIndex;
  return `${prefix}${String(next).padStart(digits.length, '0')}${suffix}`;
}

export function lineSpacingMultiplier(spacing: LineSpacing): number {
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
