import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  DRAWING_COLORS,
  formatMm,
  normalizeRotation,
  type ContentType,
} from '@/components/editor/types';
import { elementContentValue } from '@/lib/editor/selection';
import { elementSizeMm, type LabelElement } from '@/lib/label-document';

const ACCENT = '#48C3C7';

export type MultiSelectPropertyPanelProps = {
  primary: LabelElement;
  selectedElements: LabelElement[];
  labelWidthMm: number;
  labelHeightMm: number;
  onPatchPrimary: (updates: Record<string, unknown>) => void;
  onPatchAllSelected: (updates: Record<string, unknown>) => void;
};

function Divider() {
  return <View style={styles.divider} />;
}

function SegmentRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={[styles.segmentChip, active && styles.segmentChipActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable onPress={onMinus} style={styles.stepperCircle}>
          <Text style={styles.stepperSymbol}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={onPlus} style={[styles.stepperCircle, styles.stepperCircleActive]}>
          <Text style={[styles.stepperSymbol, styles.stepperSymbolActive]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  mixed,
  onValueChange,
}: {
  label: string;
  value: boolean;
  mixed?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowLabel}>{label}{mixed ? ' (mixed)' : ''}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D1D5DB', true: ACCENT }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#D1D5DB"
      />
    </View>
  );
}

function ColorRow({
  selectedIndex,
  mixed,
  onSelect,
}: {
  selectedIndex: number;
  mixed?: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.colorRow}>
      <Text style={styles.rowLabel}>Drawing Color{mixed ? ' (mixed)' : ''}</Text>
      <View style={styles.colorGroup}>
        {DRAWING_COLORS.map((color, index) => {
          const active = !mixed && index === selectedIndex;
          return (
            <Pressable
              key={`${color}-${index}`}
              onPress={() => onSelect(index)}
              style={[styles.colorOuter, active && styles.colorOuterActive]}>
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  color === '#FFFFFF' && styles.colorDotWhite,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function readContentType(el: LabelElement): ContentType {
  if ('contentType' in el && el.contentType) {
    return el.contentType as ContentType;
  }
  return 'Manual';
}

function readDrawingColorIndex(el: LabelElement): number {
  if ('drawingColorIndex' in el && typeof el.drawingColorIndex === 'number') {
    return el.drawingColorIndex;
  }
  return 0;
}

export function MultiSelectPropertyPanel({
  primary,
  selectedElements,
  labelWidthMm,
  labelHeightMm,
  onPatchPrimary,
  onPatchAllSelected,
}: MultiSelectPropertyPanelProps) {
  const size = elementSizeMm(primary);
  const content = elementContentValue(primary);
  const contentType = readContentType(primary);
  const rotation = normalizeRotation(primary.rotation ?? 0);

  const allLocked = selectedElements.every((el) => el.lockMovement);
  const allPrinting = selectedElements.every((el) => el.needPrinting !== false);
  const lockMixed = !allLocked && selectedElements.some((el) => el.lockMovement);
  const printMixed = !allPrinting && selectedElements.some((el) => el.needPrinting === false);

  const colorIndices = selectedElements.map(readDrawingColorIndex);
  const colorMixed = new Set(colorIndices).size > 1;
  const colorIndex = colorIndices[0] ?? 0;

  const rotationValues = selectedElements.map((el) => normalizeRotation(el.rotation ?? 0));
  const rotationMixed = new Set(rotationValues).size > 1;
  const displayRotation = rotationMixed ? rotation : rotationValues[0] ?? 0;

  return (
    <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
      <SegmentRow
        label="Content Type"
        options={['Manual', 'Degrees', 'Data Source'] as const}
        selected={contentType}
        onSelect={(value) => onPatchPrimary({ contentType: value })}
      />
      <Divider />
      <View style={styles.contentRow}>
        <Text style={styles.rowLabel}>Content</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/scan', params: { from: 'edit' } })}
          hitSlop={8}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <AppIcon name="barcode.viewfinder" tintColor={ACCENT} size={22} />
        </Pressable>
      </View>
      <TextInput
        style={styles.contentInput}
        value={content}
        onChangeText={(value) => {
          if (primary.type === 'text' || primary.type === 'arctext') {
            onPatchPrimary({ text: value });
          } else {
            onPatchPrimary({ content: value });
          }
        }}
        placeholder="Enter value"
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Divider />
      <SegmentRow
        label={`Rotation Angle (${displayRotation}°)`}
        options={['0°', '90°', '180°', '270°'] as const}
        selected={`${displayRotation}°`}
        onSelect={(value) =>
          onPatchAllSelected({ rotation: normalizeRotation(parseInt(value, 10)) })
        }
      />
      {rotationMixed ? (
        <Text style={styles.mixedHint}>Selection has mixed rotation values; applying sets all.</Text>
      ) : null}
      <View style={styles.sectionGap} />
      <StepperRow
        label="Left"
        value={formatMm(primary.left)}
        onMinus={() => onPatchPrimary({ left: Math.max(0, primary.left - 0.1) })}
        onPlus={() => onPatchPrimary({ left: primary.left + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Top"
        value={formatMm(primary.top)}
        onMinus={() => onPatchPrimary({ top: Math.max(0, primary.top - 0.1) })}
        onPlus={() => onPatchPrimary({ top: primary.top + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Width"
        value={formatMm(size.width)}
        onMinus={() => onPatchPrimary({ width: Math.max(0.5, size.width - 0.1) })}
        onPlus={() => onPatchPrimary({ width: size.width + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Height"
        value={formatMm(size.height)}
        onMinus={() => onPatchPrimary({ height: Math.max(0.5, size.height - 0.1) })}
        onPlus={() => onPatchPrimary({ height: size.height + 0.1 })}
      />
      <View style={styles.sectionGap} />
      <ToggleRow
        label="Lock Movement"
        value={allLocked}
        mixed={lockMixed}
        onValueChange={(lockMovement) => onPatchAllSelected({ lockMovement })}
      />
      <Divider />
      <ToggleRow
        label="Need Printing"
        value={allPrinting}
        mixed={printMixed}
        onValueChange={(needPrinting) => onPatchAllSelected({ needPrinting })}
      />
      <Divider />
      <ColorRow
        selectedIndex={colorIndex}
        mixed={colorMixed}
        onSelect={(drawingColorIndex) => onPatchAllSelected({ drawingColorIndex })}
      />
      <Text style={styles.panelNote}>
        Position and content edits apply to the primary selected element. Rotation, lock, printing, and color apply to all selected.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  bodyContent: { paddingBottom: 24 },
  block: { paddingHorizontal: 16, paddingVertical: 10 },
  rowLabel: { fontSize: 14, color: '#475569', marginBottom: 8 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  segmentChipActive: { backgroundColor: ACCENT },
  segmentText: { fontSize: 13, color: '#475569' },
  segmentTextActive: { color: '#FFFFFF', fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  contentInput: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: { backgroundColor: ACCENT },
  stepperSymbol: { fontSize: 18, color: '#64748B', lineHeight: 20 },
  stepperSymbolActive: { color: '#FFFFFF' },
  stepperValue: { fontSize: 14, color: '#1E293B', minWidth: 72, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  colorRow: { paddingHorizontal: 16, paddingVertical: 10 },
  colorGroup: { flexDirection: 'row', gap: 10, marginTop: 4 },
  colorOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: { borderWidth: 2, borderColor: ACCENT },
  colorDot: { width: 22, height: 22, borderRadius: 11 },
  colorDotWhite: { borderWidth: 1, borderColor: '#CBD5E1' },
  sectionGap: { height: 8 },
  mixedHint: { fontSize: 12, color: '#94A3B8', paddingHorizontal: 16, marginTop: -4 },
  panelNote: { fontSize: 12, color: '#94A3B8', paddingHorizontal: 16, paddingTop: 12 },
  pressed: { opacity: 0.6 },
});
