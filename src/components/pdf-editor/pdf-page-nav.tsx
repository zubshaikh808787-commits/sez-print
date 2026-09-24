import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/ui';
import { AppIcon } from '@/components/app-icon';

export function PdfPageNav({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const n = total < 1 ? 0 : index + 1;
  return (
    <View style={styles.row}>
      <Pressable onPress={onPrev} disabled={index <= 0} hitSlop={10} style={styles.arrow}>
        <AppIcon name="chevron.left" size={22} tintColor={index <= 0 ? Palette.disabled : Palette.ink} />
      </Pressable>
      <Text style={styles.counter}>
        {n} / {total}
      </Text>
      <Pressable onPress={onNext} disabled={index >= total - 1} hitSlop={10} style={styles.arrow}>
        <AppIcon
          name="chevron.right"
          size={22}
          tintColor={index >= total - 1 ? Palette.disabled : Palette.ink}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  arrow: { padding: 8 },
  counter: { fontSize: 15, fontWeight: '600', color: Palette.ink, minWidth: 72, textAlign: 'center' },
});
