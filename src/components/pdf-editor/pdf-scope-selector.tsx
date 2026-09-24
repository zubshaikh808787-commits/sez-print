import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette } from '@/constants/ui';
import type { PageScope } from '@/lib/pdf-editor/session';

export function PdfScopeSelector({
  scope,
  pageCount,
  rangeError,
  onChange,
}: {
  scope: PageScope;
  pageCount: number;
  rangeError?: string;
  onChange: (scope: PageScope) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Apply to</Text>
      <View style={styles.row}>
        <Seg label="This page" on={scope.mode === 'this'} onPress={() => onChange({ mode: 'this' })} />
        <Seg label="All pages" on={scope.mode === 'all'} onPress={() => onChange({ mode: 'all' })} />
        <Seg
          label="Custom range"
          on={scope.mode === 'range'}
          onPress={() =>
            onChange({
              mode: 'range',
              start: scope.mode === 'range' ? scope.start : 1,
              end: scope.mode === 'range' ? scope.end : pageCount,
            })
          }
        />
      </View>
      {scope.mode === 'range' ? (
        <View style={styles.rangeRow}>
          <TextInput
            keyboardType="number-pad"
            value={String(scope.start)}
            onChangeText={(t) => onChange({ mode: 'range', start: Number(t) || 0, end: scope.end })}
            style={styles.input}
          />
          <Text style={styles.to}>to</Text>
          <TextInput
            keyboardType="number-pad"
            value={String(scope.end)}
            onChangeText={(t) => onChange({ mode: 'range', start: scope.start, end: Number(t) || 0 })}
            style={styles.input}
          />
          <Text style={styles.hint}>of {pageCount}</Text>
        </View>
      ) : null}
      {rangeError ? <Text style={styles.err}>{rangeError}</Text> : null}
    </View>
  );
}

function Seg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, on && styles.segOn]}>
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  label: { fontSize: 12, color: Palette.muted, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  seg: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  segOn: { borderColor: Palette.accent, backgroundColor: '#E7F7F9' },
  segText: { fontSize: 12, color: Palette.actionText },
  segTextOn: { color: Palette.accent, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 56,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: Palette.ink,
  },
  to: { color: Palette.muted },
  hint: { color: Palette.muted, fontSize: 12 },
  err: { color: Palette.danger, fontSize: 12 },
});
