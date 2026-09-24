import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/ui';

const ANGLES = [0, 90, 180, 270] as const;

export function PdfRotateTool({
  value,
  onChange,
}: {
  value: number;
  onChange: (deg: number) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>Applies to the currently viewed page only.</Text>
      <View style={styles.row}>
        {ANGLES.map((d) => (
          <Pressable key={d} onPress={() => onChange(d)} style={[styles.btn, value === d && styles.btnOn]}>
            <Text style={[styles.btnText, value === d && styles.btnTextOn]}>{d}°</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  help: { fontSize: 12, color: Palette.muted },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  btnOn: { borderColor: Palette.accent, backgroundColor: '#E7F7F9' },
  btnText: { fontSize: 14, color: Palette.ink, fontWeight: '600' },
  btnTextOn: { color: Palette.accent },
});
