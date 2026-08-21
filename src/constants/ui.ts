import { Platform } from 'react-native';

export const Palette = {
  header: '#214668',
  screen: '#EFF2F7',
  card: '#FFFFFF',
  cardTop: '#EFF2F6',
  accent: '#17A6B8',
  danger: '#E84149',
  ink: '#2C3E50',
  muted: '#7E8B98',
  actionText: '#556473',
  preview: '#FAD5DF',
  hairline: '#EAECEF',
  disabled: '#A4B0BC',
} as const;

export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  android: { elevation: 2 },
  default: {},
});

/**
 * Clamp a base size against the device width so layouts stay readable on
 * small phones and don't blow up on tablets. 390 is the iPhone reference width.
 */
export function scaleFont(width: number, size: number, min = 0.85, max = 1.15) {
  const factor = Math.min(Math.max(width / 390, min), max);
  return Math.round(size * factor);
}

/** Typography tuned to match reference screenshots — small, regular weight. */
export const Type = {
  badge: { fontSize: 13, fontWeight: '500' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  chip: { fontSize: 12, fontWeight: '400' as const },
  action: { fontSize: 12, fontWeight: '400' as const },
  button: { fontSize: 16, fontWeight: '500' as const },
  modalTitle: { fontSize: 14, fontWeight: '400' as const },
  modalAction: { fontSize: 17, fontWeight: '500' as const },
} as const;
