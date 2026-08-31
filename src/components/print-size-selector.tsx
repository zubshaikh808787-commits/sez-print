import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/ui';
import {
  fromMm,
  parseSizeInput,
  toMm,
  validateLabelSize,
  type LabelSizeMm,
  type LabelUnit,
} from '@/lib/label-geometry';
import {
  PRINT_SIZE_PRESETS,
  formatPrintSize,
  type PrintSizePreset,
} from '@/lib/print-sizes';
import { useSettingsStore } from '@/stores/settings-store';

type PrintSizeSelectorProps = {
  visible: boolean;
  /** Current label content size — shown for context; custom entry is paper/page size. */
  initialWidthMm: number;
  initialHeightMm: number;
  onCancel: () => void;
  onSelect: (size: LabelSizeMm, preset: PrintSizePreset | null) => void;
};

function formatField(mm: number, unit: LabelUnit): string {
  const v = fromMm(mm, unit);
  if (unit === 'in') return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 10) / 10);
}

export function PrintSizeSelector({
  visible,
  initialWidthMm,
  initialHeightMm,
  onCancel,
  onSelect,
}: PrintSizeSelectorProps) {
  const insets = useSafeAreaInsets();
  const printing = useSettingsStore((s) => s.printing);
  const patchPrinting = useSettingsStore((s) => s.patchPrinting);

  const savedPaperW = printing.customPaperWidthMm ?? 210;
  const savedPaperH = printing.customPaperHeightMm ?? 297;

  const [unit, setUnit] = useState<LabelUnit>('mm');
  const [customOpen, setCustomOpen] = useState(false);
  const [widthText, setWidthText] = useState(() => formatField(savedPaperW, 'mm'));
  const [heightText, setHeightText] = useState(() => formatField(savedPaperH, 'mm'));

  useEffect(() => {
    if (!visible) return;
    setWidthText(formatField(savedPaperW, unit));
    setHeightText(formatField(savedPaperH, unit));
  }, [visible, savedPaperW, savedPaperH, unit]);

  const customError = useMemo(() => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    if (w == null || h == null) return 'Enter a valid width and height.';
    return validateLabelSize(toMm(w, unit), toMm(h, unit));
  }, [widthText, heightText, unit]);

  const switchUnit = (next: LabelUnit) => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    const widthMm = w != null ? toMm(w, unit) : savedPaperW;
    const heightMm = h != null ? toMm(h, unit) : savedPaperH;
    setUnit(next);
    setWidthText(formatField(widthMm, next));
    setHeightText(formatField(heightMm, next));
  };

  const confirmCustom = () => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    if (w == null || h == null || customError) return;
    const size = { widthMm: toMm(w, unit), heightMm: toMm(h, unit) };
    patchPrinting({
      customPaperWidthMm: size.widthMm,
      customPaperHeightMm: size.heightMm,
    });
    onSelect(size, null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.title}>Select print size</Text>
          <Text style={styles.subtitle}>
            Label content is {formatPrintSize(initialWidthMm, initialHeightMm)}. Choose This label
            size to match the editor. Other presets scale the design uniformly to fit that paper.
            Custom paper tiles when both sides are larger than the label.
          </Text>
          <ScrollView
            style={styles.list}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() =>
                onSelect({ widthMm: initialWidthMm, heightMm: initialHeightMm }, null)
              }
              style={({ pressed }) => [styles.row, styles.currentRow, pressed && styles.pressed]}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>This label size</Text>
                <Text style={styles.rowDetail}>Match the editor preview exactly (recommended)</Text>
              </View>
              <Text style={styles.rowMeta}>
                {formatPrintSize(initialWidthMm, initialHeightMm)}
              </Text>
            </Pressable>

            {PRINT_SIZE_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() =>
                  onSelect({ widthMm: preset.widthMm, heightMm: preset.heightMm }, preset)
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{preset.label}</Text>
                  {preset.detail ? <Text style={styles.rowDetail}>{preset.detail}</Text> : null}
                </View>
                <Text style={styles.rowMeta}>{formatPrintSize(preset.widthMm, preset.heightMm)}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setCustomOpen((open) => !open)}
              style={({ pressed }) => [styles.row, styles.customRow, pressed && styles.pressed]}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Custom Paper Size</Text>
                <Text style={styles.rowDetail}>
                  Last used {formatPrintSize(savedPaperW, savedPaperH)} — tiles when both sides are
                  larger than the label
                </Text>
              </View>
              <Text style={styles.rowMeta}>{customOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {customOpen ? (
              <View style={styles.customBox}>
                <View style={styles.unitRow}>
                  {(['mm', 'in'] as const).map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => switchUnit(item)}
                      style={[styles.unitChip, unit === item && styles.unitChipOn]}>
                      <Text style={[styles.unitChipText, unit === item && styles.unitChipTextOn]}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.inputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Paper width ({unit})</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={widthText}
                      onChangeText={setWidthText}
                    />
                  </View>
                  <Text style={styles.times}>×</Text>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Paper height ({unit})</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={heightText}
                      onChangeText={setHeightText}
                    />
                  </View>
                </View>
                {customError ? <Text style={styles.error}>{customError}</Text> : null}
                <Pressable
                  disabled={Boolean(customError)}
                  onPress={confirmCustom}
                  style={({ pressed }) => [
                    styles.applyBtn,
                    Boolean(customError) && styles.applyBtnDisabled,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.applyText}>Use custom paper size</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    marginHorizontal: 10,
    backgroundColor: Palette.card,
    borderRadius: 16,
    maxHeight: '82%',
    paddingTop: 16,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Palette.ink,
    paddingHorizontal: 16,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 12,
    color: Palette.muted,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    lineHeight: 16,
  },
  list: { paddingHorizontal: 8 },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F7F9FC',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customRow: { backgroundColor: '#EEF8FA', marginTop: 4 },
  currentRow: { backgroundColor: '#E6F6F8', borderWidth: 1, borderColor: '#B6E4EA' },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Palette.ink },
  rowDetail: { fontSize: 12, color: Palette.muted, marginTop: 2 },
  rowMeta: { fontSize: 12, color: Palette.muted, fontWeight: '500' },
  customBox: { paddingHorizontal: 8, paddingBottom: 8, gap: 10 },
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
  inputs: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputCol: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 12, color: Palette.muted },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#D6DEE8',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Palette.ink,
    backgroundColor: '#FFFFFF',
  },
  times: { fontSize: 18, color: Palette.muted, paddingBottom: 10 },
  error: { fontSize: 12, color: Palette.danger },
  applyBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnDisabled: { opacity: 0.45 },
  applyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cancel: {
    marginTop: 8,
    marginHorizontal: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '500', color: '#007AFF' },
  pressed: { opacity: 0.7 },
});
