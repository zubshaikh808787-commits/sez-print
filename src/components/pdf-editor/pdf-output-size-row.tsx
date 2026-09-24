import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette } from '@/constants/ui';
import { OUTPUT_SIZE_PRESETS, type OutputSize } from '@/lib/pdf-editor/session';

export function PdfOutputSizeRow({
  value,
  onChange,
}: {
  value: OutputSize;
  onChange: (next: OutputSize) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Output size</Text>
      <View style={styles.chips}>
        <Chip
          label="Custom"
          selected={value.kind === 'custom'}
          onPress={() => onChange({ kind: 'custom', widthMm: value.widthMm, heightMm: value.heightMm })}
        />
        {OUTPUT_SIZE_PRESETS.map((p) => (
          <Chip
            key={p.kind}
            label={p.label}
            selected={value.kind === p.kind}
            onPress={() => onChange({ kind: p.kind, widthMm: p.widthMm, heightMm: p.heightMm })}
          />
        ))}
      </View>
      {value.kind === 'custom' ? (
        <View style={styles.customRow}>
          <LabeledNum
            label="Width mm"
            value={value.widthMm}
            onChange={(widthMm) => onChange({ kind: 'custom', widthMm, heightMm: value.heightMm })}
          />
          <LabeledNum
            label="Height mm"
            value={value.heightMm}
            onChange={(heightMm) => onChange({ kind: 'custom', widthMm: value.widthMm, heightMm })}
          />
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function LabeledNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        value={String(value)}
        onChangeText={(t) => {
          const n = Number.parseFloat(t);
          if (Number.isFinite(n) && n > 0) onChange(Math.round(n * 10) / 10);
        }}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: Palette.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '48%',
  },
  chipOn: { borderColor: Palette.accent, backgroundColor: '#E7F7F9' },
  chipText: { fontSize: 11, color: Palette.actionText },
  chipTextOn: { color: Palette.accent, fontWeight: '600' },
  customRow: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 11, color: Palette.muted },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Palette.ink,
    backgroundColor: Palette.card,
  },
});
