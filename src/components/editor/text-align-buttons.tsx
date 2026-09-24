import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import type { TextAlign } from '@/components/editor/types';

const ACCENT = '#48C3C7';

type AlignKind = TextAlign;

export function AlignGlyph({ kind, color, size = 18 }: { kind: AlignKind; color: string; size?: number }) {
  if (kind === 'spacing') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 18">
        <Line x1="2" y1="9" x2="16" y2="9" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Line x1="4" y1="6" x2="4" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Line x1="14" y1="6" x2="14" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </Svg>
    );
  }

  const widths = kind === 'justify' ? [12, 12, 12, 12] : kind === 'center' ? [8, 12, 10, 12] : [12, 9, 11, 7];
  const xStart = kind === 'right' ? 16 : kind === 'center' ? 9 : 2;
  const ys = [3.5, 7.5, 11.5, 15.5];

  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      {widths.map((width, index) => {
        const y = ys[index];
        const x1 = kind === 'right' ? xStart - width : kind === 'center' ? xStart - width / 2 : xStart;
        const x2 = x1 + width;
        return (
          <Line
            key={index}
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

type TextAlignButtonsProps = {
  align: TextAlign;
  onChange: (align: TextAlign) => void;
  options?: readonly AlignKind[];
};

const DEFAULT_OPTIONS: readonly AlignKind[] = ['left', 'center', 'right', 'justify', 'spacing'];

export function TextAlignButtons({
  align,
  onChange,
  options = DEFAULT_OPTIONS,
}: TextAlignButtonsProps) {
  return (
    <View style={styles.row}>
      {options.map((value) => {
        const active = align === value;
        const color = active ? '#FFFFFF' : '#556473';
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            hitSlop={4}
            style={[styles.btn, active && styles.btnActive]}>
            <AlignGlyph kind={value} color={color} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: { backgroundColor: ACCENT },
});
