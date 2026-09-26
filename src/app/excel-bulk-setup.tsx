import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import {
  createBulkLabelDocument,
  type BulkColumnMapping,
  type BulkSlotKind,
} from '@/lib/bulk-labels';
import { clampLabelMm } from '@/lib/label-geometry';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

const KINDS: BulkSlotKind[] = ['text', 'barcode', 'qrcode'];

function kindLabel(kind: BulkSlotKind): string {
  if (kind === 'barcode') return 'Barcode';
  if (kind === 'qrcode') return 'QR Code';
  return 'Text';
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function paramMm(value: string | string[] | undefined, fallback: number): number {
  const raw = firstParam(value);
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ExcelBulkSetupScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    excelFileId?: string | string[];
    widthMm?: string | string[];
    heightMm?: string | string[];
  }>();
  const excelFileId = firstParam(params.excelFileId);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const setActiveSheetIndex = useDataStore((s) => s.setActiveSheetIndex);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const defaults = useSettingsStore((s) => s.defaults);

  const file = excelFiles.find((f) => f.id === excelFileId) ?? null;
  const [sheetIndex, setSheetIndex] = useState(file?.activeSheetIndex ?? 0);
  const sheet = file ? file.sheets[sheetIndex] ?? file.sheets[0] ?? null : null;

  const labelSize = clampLabelMm(
    paramMm(params.widthMm, defaults.labelWidth),
    paramMm(params.heightMm, defaults.labelHeight),
  );

  const [mappings, setMappings] = useState<BulkColumnMapping[]>(() =>
    (sheet?.columns ?? []).map((_, columnIndex) => ({
      columnIndex,
      include: true,
      kind: 'text' as BulkSlotKind,
    })),
  );

  const columnCount = sheet?.columns.length ?? 0;
  const syncedMappings = useMemo(() => {
    if (mappings.length === columnCount) return mappings;
    return Array.from({ length: columnCount }, (_, columnIndex) => {
      const prev = mappings.find((m) => m.columnIndex === columnIndex);
      return prev ?? { columnIndex, include: true, kind: 'text' as BulkSlotKind };
    });
  }, [columnCount, mappings]);

  const includedCount = syncedMappings.filter((m) => m.include).length;
  const canConfirm = Boolean(file && sheet && includedCount > 0 && sheet.rows.length > 0);

  const patchMapping = (columnIndex: number, patch: Partial<BulkColumnMapping>) => {
    setMappings((prev) => {
      const base =
        prev.length === columnCount
          ? prev
          : Array.from({ length: columnCount }, (_, i) => {
              const existing = prev.find((m) => m.columnIndex === i);
              return existing ?? { columnIndex: i, include: true, kind: 'text' as BulkSlotKind };
            });
      return base.map((m) => (m.columnIndex === columnIndex ? { ...m, ...patch } : m));
    });
  };

  const handleConfirm = () => {
    if (!file || !sheet) return;
    if (includedCount === 0) {
      Alert.alert('Select columns', 'Include at least one column to build labels.');
      return;
    }
    if (sheet.rows.length === 0) {
      Alert.alert('Empty sheet', 'This sheet has no data rows.');
      return;
    }
    const doc = createBulkLabelDocument({
      name: `${file.name} · ${sheet.rows.length} labels`,
      widthMm: labelSize.widthMm,
      heightMm: labelSize.heightMm,
      orientation: defaults.orientation,
      paperType: defaults.paperType,
      excelFileId: file.id,
      sheetIndex,
      sheet,
      mappings: syncedMappings,
      barcodeEncodeMode: defaults.barcodeEncodeMode,
      qrErrorLevel: defaults.qrErrorLevel,
    });
    if (!doc) {
      Alert.alert('Unable to create labels', 'Include at least one column.');
      return;
    }
    setActiveSheetIndex(file.id, sheetIndex);
    upsertDocument(doc);
    router.replace({ pathname: '/edit', params: { labelId: doc.id } });
  };

  if (!file || !sheet) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Excel labels</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.empty}>This file is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Excel labels</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 88 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.fileName} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={styles.meta}>
          {sheet.rows.length} rows · {sheet.columns.length} columns · {labelSize.widthMm} ×{' '}
          {labelSize.heightMm} mm
        </Text>

        {file.sheets.length > 1 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sheet</Text>
            <View style={styles.chipRow}>
              {file.sheets.map((item, index) => {
                const active = index === sheetIndex;
                return (
                  <Pressable
                    key={`${item.name}-${index}`}
                    onPress={() => {
                      setSheetIndex(index);
                      setMappings(
                        item.columns.map((_, columnIndex) => ({
                          columnIndex,
                          include: true,
                          kind: 'text',
                        })),
                      );
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Columns</Text>
          <Text style={styles.hint}>
            Include a column and choose how its cell is shown on each label.
          </Text>
          {sheet.columns.map((name, columnIndex) => {
            const mapping = syncedMappings[columnIndex] ?? {
              columnIndex,
              include: true,
              kind: 'text' as BulkSlotKind,
            };
            return (
              <View key={`${name}-${columnIndex}`} style={styles.columnRow}>
                <Pressable
                  onPress={() => patchMapping(columnIndex, { include: !mapping.include })}
                  hitSlop={8}
                  style={styles.checkHit}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: mapping.include }}>
                  <View style={[styles.checkbox, mapping.include && styles.checkboxOn]}>
                    {mapping.include ? (
                      <AppIcon name="checkmark" tintColor="#FFFFFF" size={14} />
                    ) : null}
                  </View>
                </Pressable>
                <Text style={styles.columnName} numberOfLines={1}>
                  {name}
                </Text>
                <View style={styles.kindRow}>
                  {KINDS.map((kind) => {
                    const active = mapping.kind === kind;
                    return (
                      <Pressable
                        key={kind}
                        disabled={!mapping.include}
                        onPress={() => patchMapping(columnIndex, { kind })}
                        style={({ pressed }) => [
                          styles.kindChip,
                          active && styles.kindChipActive,
                          !mapping.include && styles.kindChipDisabled,
                          pressed && mapping.include && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.kindChipText,
                            active && styles.kindChipTextActive,
                            !mapping.include && styles.kindChipTextDisabled,
                          ]}>
                          {kindLabel(kind)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          disabled={!canConfirm}
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmBtn,
            !canConfirm && styles.confirmBtnDisabled,
            pressed && canConfirm && styles.pressed,
          ]}>
          <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]}>
            Create labels
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSpacer: { width: 36 },
  body: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  bodyContent: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  fileName: { fontSize: 17, fontWeight: '700', color: Palette.ink },
  meta: { fontSize: 13, color: Palette.muted, marginTop: -8 },
  empty: { padding: Spacing.four, color: Palette.muted, textAlign: 'center' },
  section: {
    backgroundColor: Palette.card,
    borderRadius: 10,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
  hint: { fontSize: 13, lineHeight: 18, color: Palette.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Palette.cardTop,
  },
  chipActive: { backgroundColor: Palette.accent },
  chipText: { fontSize: 13, color: Palette.ink, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  columnRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.two,
    gap: 8,
  },
  checkHit: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Palette.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  columnName: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Palette.cardTop,
  },
  kindChipActive: { backgroundColor: Palette.header },
  kindChipDisabled: { opacity: 0.45 },
  kindChipText: { fontSize: 12, fontWeight: '600', color: Palette.ink },
  kindChipTextActive: { color: '#FFFFFF' },
  kindChipTextDisabled: { color: Palette.muted },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    backgroundColor: Palette.screen,
  },
  confirmBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#C5CDD4' },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  confirmTextDisabled: { color: '#F4F6F8' },
  pressed: { opacity: 0.7 },
});
