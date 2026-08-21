import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette, Type } from '@/constants/ui';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent'] as const;

function StepperRow({
  label,
  value,
  valueColor,
  onMinus,
  onPlus,
  minusDisabled,
  bordered,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.stepperRow, bordered && styles.stepperRowBorder]}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stepperCircle,
            minusDisabled && styles.stepperCircleDisabled,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        <Pressable
          onPress={onPlus}
          hitSlop={6}
          style={({ pressed }) => [styles.stepperCircle, styles.stepperCircleActive, pressed && styles.pressed]}>
          <Text style={[styles.stepperSymbol, styles.stepperSymbolActive]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LabelPreview({ width }: { width: number }) {
  const cardWidth = Math.min(width - 48, MaxContentWidth - 48);
  const cardHeight = Math.round(cardWidth / 2);

  return (
    <View style={[styles.previewCard, { width: cardWidth, height: cardHeight }]}>
      <View style={[styles.blob, styles.blobTopLeft]} />
      <View style={[styles.blob, styles.blobTopRight]} />
      <View style={[styles.blob, styles.blobCenter]} />
      <Text style={styles.previewStar}>✦</Text>
    </View>
  );
}

export default function PrintScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [copies, setCopies] = useState(1);
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>('0°');
  const [paperType, setPaperType] = useState<(typeof PAPER_TYPES)[number]>('Label');

  const footerHeight = 72 + insets.bottom;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <View style={styles.connection}>
          <Text numberOfLines={1} style={styles.connectionText}>
            Unconnected
          </Text>
          <SymbolView name="link" tintColor="#FFFFFF" size={14} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: footerHeight + Spacing.three }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.previewArea}>
          <LabelPreview width={width} />
          <View style={styles.zoomControls}>
            <Pressable hitSlop={6} style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable hitSlop={6} style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.referenceNote}>Reference only. Depends on the actual print effect.</Text>

        <View style={styles.settingsWrap}>
          <View style={styles.settingsCard}>
            <StepperRow
              label="Number of Copies"
              value={String(copies)}
              valueColor={Palette.accent}
              minusDisabled={copies <= 1}
              onMinus={() => setCopies((n) => Math.max(1, n - 1))}
              onPlus={() => setCopies((n) => n + 1)}
            />
          </View>

          <View style={styles.settingsCard}>
            <StepperRow label="Print Darkness" value="Auto" minusDisabled bordered />
            <StepperRow label="Print Speed" value="Auto" minusDisabled />
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.groupLabel}>Orientation</Text>
            <ChipGroup options={ORIENTATIONS} selected={orientation} onSelect={setOrientation} />

            <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>Paper Type</Text>
            <ChipGroup options={PAPER_TYPES} selected={paperType} onSelect={setPaperType} />

            <StepperRow label="Gap Length" value="3.00 mm" minusDisabled bordered />
            <StepperRow label="Horizontal Offset" value="0.00 mm" minusDisabled bordered />
            <StepperRow label="Vertical Offset" value="0.00 mm" minusDisabled />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
          <SymbolView name="gearshape.fill" tintColor="#FFFFFF" size={24} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.printBtn, pressed && styles.pressed]}
          onPress={() => router.back()}>
          <Text style={styles.printBtnText}>Print</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    backgroundColor: Palette.header,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.danger,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  connectionText: {
    color: '#FFFFFF',
    ...Type.badge,
  },
  scroll: {
    flex: 1,
  },
  previewArea: {
    backgroundColor: '#AEB4BC',
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    position: 'relative',
  },
  previewCard: {
    borderRadius: 10,
    backgroundColor: Palette.preview,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    opacity: 0.92,
    borderRadius: 999,
  },
  blobTopLeft: {
    width: 42,
    height: 42,
    top: '18%',
    left: '8%',
  },
  blobTopRight: {
    width: 36,
    height: 36,
    top: '16%',
    right: '10%',
  },
  blobCenter: {
    width: 44,
    height: 44,
    top: '48%',
    left: '42%',
  },
  previewStar: {
    position: 'absolute',
    right: '26%',
    top: '40%',
    color: '#FFFFFF',
    fontSize: 14,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#525860',
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 24,
  },
  referenceNote: {
    textAlign: 'center',
    color: '#9AA3AD',
    ...Type.caption,
    paddingVertical: 14,
    backgroundColor: '#F4F5F7',
  },
  settingsWrap: {
    paddingHorizontal: 12,
    gap: 10,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  settingsCard: {
    backgroundColor: Palette.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  stepperRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEEF1',
  },
  stepperLabel: {
    ...Type.body,
    color: Palette.ink,
    flex: 1,
    paddingRight: 8,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: {
    borderColor: Palette.disabled,
  },
  stepperCircleActive: {
    backgroundColor: 'transparent',
  },
  stepperSymbol: {
    fontSize: 18,
    fontWeight: '400',
    color: Palette.accent,
    lineHeight: 20,
  },
  stepperSymbolDisabled: {
    color: Palette.disabled,
  },
  stepperSymbolActive: {
    color: Palette.accent,
  },
  stepperValue: {
    ...Type.bodyMedium,
    color: Palette.ink,
    minWidth: 68,
    textAlign: 'center',
  },
  groupLabel: {
    ...Type.bodyMedium,
    color: Palette.ink,
    paddingTop: 14,
    paddingBottom: 10,
  },
  groupLabelSpaced: {
    paddingTop: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECEEF1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipActive: {
    backgroundColor: Palette.accent,
  },
  chipText: {
    ...Type.chip,
    color: '#7A8490',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    backgroundColor: '#F4F5F7',
  },
  gearBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#5CB85C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtn: {
    flex: 1,
    height: 52,
    backgroundColor: Palette.accent,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: {
    color: '#FFFFFF',
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
});
