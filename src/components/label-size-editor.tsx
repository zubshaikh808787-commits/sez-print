import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette } from '@/constants/ui';
import {
  fromMm,
  LABEL_SIZE_PRESETS,
  matchingPresetId,
  MAX_LABEL_MM,
  MIN_LABEL_MM,
  parseSizeInput,
  toMm,
  validateLabelSize,
  type LabelUnit,
} from '@/lib/label-geometry';

const UNITS: LabelUnit[] = ['mm', 'cm', 'in'];

function formatField(mm: number, unit: LabelUnit): string {
  const v = fromMm(mm, unit);
  if (unit === 'in') return String(Math.round(v * 100) / 100);
  if (unit === 'cm') return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

type LabelSizeEditorProps = {
  widthMm: number;
  heightMm: number;
  onChange: (widthMm: number, heightMm: number) => void;
};

export function LabelSizeEditor({ widthMm, heightMm, onChange }: LabelSizeEditorProps) {
  const [unit, setUnit] = useState<LabelUnit>('mm');
  const [widthText, setWidthText] = useState(() => formatField(widthMm, 'mm'));
  const [heightText, setHeightText] = useState(() => formatField(heightMm, 'mm'));
  const presetId = matchingPresetId(widthMm, heightMm);

  const error = useMemo(() => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    if (w == null || h == null) return 'Enter a valid width and height.';
    return validateLabelSize(toMm(w, unit), toMm(h, unit));
  }, [widthText, heightText, unit]);

  const applyMm = (nextW: number, nextH: number) => {
    onChange(nextW, nextH);
    setWidthText(formatField(nextW, unit));
    setHeightText(formatField(nextH, unit));
  };

  const applyFromInputs = (nextWidthText: string, nextHeightText: string, nextUnit: LabelUnit) => {
    const w = parseSizeInput(nextWidthText);
    const h = parseSizeInput(nextHeightText);
    if (w == null || h == null) return;
    const width = toMm(w, nextUnit);
    const height = toMm(h, nextUnit);
    if (validateLabelSize(width, height)) return;
    onChange(width, height);
  };

  const switchUnit = (next: LabelUnit) => {
    setUnit(next);
    setWidthText(formatField(widthMm, next));
    setHeightText(formatField(heightMm, next));
  };

  return (
    <View style={styles.root}>
      <Text style={styles.hint}>
        Screen preview fits millimetres into the editor. Print uses 8 dots/mm (203 DPI).
      </Text>
      <View style={styles.unitRow}>
        {UNITS.map((item) => (
          <Pressable
            key={item}
            onPress={() => switchUnit(item)}
            style={[styles.unitChip, unit === item && styles.unitChipOn]}>
            <Text style={[styles.unitChipText, unit === item && styles.unitChipTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
        {LABEL_SIZE_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => applyMm(preset.widthMm, preset.heightMm)}
            style={[styles.presetChip, presetId === preset.id && styles.presetChipOn]}>
            <Text style={[styles.presetText, presetId === preset.id && styles.presetTextOn]}>{preset.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setWidthText(formatField(widthMm, unit));
            setHeightText(formatField(heightMm, unit));
          }}
          style={[styles.presetChip, presetId === 'custom' && styles.presetChipOn]}>
          <Text style={[styles.presetText, presetId === 'custom' && styles.presetTextOn]}>Custom</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.inputs}>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>Width ({unit})</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            keyboardType="decimal-pad"
            value={widthText}
            onChangeText={(text) => {
              setWidthText(text);
              applyFromInputs(text, heightText, unit);
            }}
          />
        </View>
        <Text style={styles.times}>×</Text>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>Height ({unit})</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            keyboardType="decimal-pad"
            value={heightText}
            onChangeText={(text) => {
              setHeightText(text);
              applyFromInputs(widthText, text, unit);
            }}
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : (
        <Text style={styles.bounds}>
          Allowed range: {MIN_LABEL_MM}–{MAX_LABEL_MM} mm
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  hint: { fontSize: 12, color: '#64748B', lineHeight: 16 },
  unitRow: { flexDirection: 'row', gap: 8 },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EEF2F6',
  },
  unitChipOn: { backgroundColor: Palette.accent },
  unitChipText: { fontSize: 13, fontWeight: '500', color: Palette.ink },
  unitChipTextOn: { color: '#FFFFFF' },
  presetRow: { gap: 8, paddingVertical: 4 },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  presetChipOn: { backgroundColor: '#D7F1F5' },
  presetText: { fontSize: 12, color: Palette.ink },
  presetTextOn: { fontWeight: '600', color: Palette.accent },
  inputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#F8FAFC',
    color: Palette.ink,
  },
  inputError: { borderColor: '#DC2626' },
  times: { fontSize: 18, color: '#94A3B8', paddingBottom: 10 },
  error: { fontSize: 12, color: '#DC2626' },
  bounds: { fontSize: 12, color: '#94A3B8' },
});
