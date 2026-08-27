import { type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';

export function SettingsScreenShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title={title} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingTop: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}>
        <View style={{ width: contentWidth, maxWidth: MaxContentWidth, gap: Spacing.three }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SettingsDivider() {
  return <View style={styles.divider} />;
}

export function SettingsNavRow({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.navRow, pressed && onPress && styles.pressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
    </Pressable>
  );
}

export function SettingsToggleRow({
  label,
  value,
  onValueChange,
  showDivider,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.switchWrap}>
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: '#D1D5DB', true: '#48C3C7' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D1D5DB"
          />
        </View>
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsValueRow({
  label,
  value,
  onPress,
  showDivider,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.valueRow, pressed && onPress && styles.pressed]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.valueRight}>
          <Text style={styles.valueText}>{value}</Text>
          <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
        </View>
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsStatusRow({
  label,
  enabled,
  onPress,
  showDivider,
}: {
  label: string;
  enabled: boolean;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.valueRow, pressed && onPress && styles.pressed]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.valueRight}>
          <Text style={[styles.statusText, enabled ? styles.statusEnabled : styles.statusDisabled]}>
            {enabled ? 'Enabled' : 'Not Enabled'}
          </Text>
          <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
        </View>
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsRadioRow({
  label,
  value,
  selected,
  onPress,
  showDivider,
}: {
  label: string;
  value: string;
  selected: boolean;
  onPress: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.radioRow, pressed && styles.pressed]}>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected ? <View style={styles.radioInner} /> : null}
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.cacheValue}>{value}</Text>
        <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
      </Pressable>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsToggleGroup({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  description?: string;
}) {
  return (
    <View style={styles.toggleGroup}>
      <SettingsCard>
        <SettingsToggleRow label={label} value={value} onValueChange={onValueChange} />
      </SettingsCard>
      {description ? <SettingsNote>{description}</SettingsNote> : null}
    </View>
  );
}

export function SettingsNote({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function SettingsSectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function SettingsSegmentGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
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

export function SettingsSegmentRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
  showDivider,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <View style={styles.segmentBlock}>
        <Text style={styles.rowLabel}>{label}</Text>
        <SettingsSegmentGroup options={options} selected={selected} onSelect={onSelect} />
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsColorRow({
  label,
  colors,
  selectedIndex,
  onSelect,
  showDivider,
}: {
  label: string;
  colors: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <View style={styles.colorRow}>
        <Text style={[styles.rowLabel, styles.colorLabel]}>{label}</Text>
        <View style={styles.colorGroup}>
          {colors.map((color, index) => {
            const active = index === selectedIndex;
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
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsStepperRow({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  showDivider,
}: {
  label: string;
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
  showDivider?: boolean;
}) {
  return (
    <>
      <View style={styles.stepperRow}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.stepperControls}>
          <Pressable
            disabled={minusDisabled}
            onPress={onMinus}
            style={[styles.stepperCircle, minusDisabled && styles.stepperCircleDisabled]}>
            <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{value}</Text>
          <Pressable onPress={onPlus} style={styles.stepperCircle}>
            <Text style={styles.stepperSymbol}>+</Text>
          </Pressable>
        </View>
      </View>
      {showDivider ? <SettingsDivider /> : null}
    </>
  );
}

export function SettingsActionCard({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 10,
    overflow: 'hidden',
    ...cardShadow,
  },
  navRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
    lineHeight: 20,
    paddingRight: 16,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  switchWrap: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  valueRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
    lineHeight: 20,
    paddingRight: 12,
    includeFontPadding: false,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  valueRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueText: {
    fontSize: 14,
    color: '#64748B',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusEnabled: {
    color: '#22C55E',
  },
  statusDisabled: {
    color: '#EF5350',
  },
  cacheValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF5350',
    marginRight: 4,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: Palette.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E8ED',
    marginLeft: 16,
  },
  note: {
    marginTop: 8,
    marginBottom: 0,
    paddingHorizontal: 4,
    fontSize: 13,
    lineHeight: 20,
    color: '#8A97A4',
  },
  toggleGroup: {
    gap: 8,
  },
  sectionLabel: {
    marginTop: Spacing.one,
    marginBottom: -4,
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97A4',
    letterSpacing: 0.4,
  },
  segmentWrap: {
    paddingBottom: 0,
  },
  segmentBlock: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingBottom: 14,
  },
  segmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentChipActive: {
    backgroundColor: Palette.accent,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556473',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  colorRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorLabel: {
    flex: 1,
    paddingRight: 8,
  },
  colorGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  colorOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: {
    borderWidth: 2,
    borderColor: Palette.accent,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorDotWhite: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperRow: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: {
    borderColor: '#CBD5E1',
  },
  stepperSymbol: {
    fontSize: 18,
    color: Palette.accent,
    lineHeight: 20,
  },
  stepperSymbolDisabled: {
    color: '#CBD5E1',
  },
  stepperValue: {
    minWidth: 42,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Palette.accent,
  },
  actionCard: {
    backgroundColor: Palette.card,
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    ...cardShadow,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
  },
  actionTextDanger: {
    color: '#EF5350',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
