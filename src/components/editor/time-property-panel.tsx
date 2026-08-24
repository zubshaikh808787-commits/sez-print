import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  applyTimeOffsets,
  formatLiveDate,
  formatLiveTime,
  formatMm,
  formatOffset,
  formatPt,
  type Rotation,
  type TextAlign,
  type TimeElementState,
  type TimePropertyTab,
} from '@/components/editor/types';

const ACCENT = '#48C3C7';
const TABS: TimePropertyTab[] = ['Regular', 'Position', 'Format', 'Font'];
type IconName = SymbolViewProps['name'];

function Divider() {
  return <View style={styles.divider} />;
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

function GraySection({ children }: { children: ReactNode }) {
  return <View style={styles.graySection}>{children}</View>;
}

function useLiveDateTime(state: TimeElementState) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const adjusted = applyTimeOffsets(now, state);
    return {
      dateDisplay: formatLiveDate(adjusted),
      timeDisplay: formatLiveTime(adjusted),
    };
  }, [now, state.offsetDay, state.offsetHour, state.offsetMinute, state.offsetSecond]);
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
  minusDisabled,
}: {
  label: string;
  value: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
}) {
  return (
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
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowLabel}>{label}</Text>
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

function NavRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.navRight}>
        <Text style={styles.navValue}>{value}</Text>
        <SymbolView name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
      </View>
    </Pressable>
  );
}

function StyleButtons({
  state,
  patch,
}: {
  state: TimeElementState;
  patch: (updates: Partial<TimeElementState>) => void;
}) {
  const items = [
    { key: 'bold', label: 'B', style: styles.boldGlyph, active: state.bold, field: 'bold' as const },
    { key: 'italic', label: 'I', style: styles.italicGlyph, active: state.italic, field: 'italic' as const },
    {
      key: 'underline',
      label: 'U',
      style: styles.underlineGlyph,
      active: state.underline,
      field: 'underline' as const,
    },
    {
      key: 'strike',
      label: 'S',
      style: styles.strikeGlyph,
      active: state.strikethrough,
      field: 'strikethrough' as const,
    },
  ];
  return (
    <View style={styles.styleRow}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => patch({ [item.field]: !item.active })}
          style={[styles.styleBtn, item.active && styles.styleBtnActive]}>
          <Text style={[styles.styleBtnText, item.style, item.active && styles.styleBtnTextActive]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function AlignButtons({
  state,
  patch,
}: {
  state: TimeElementState;
  patch: (updates: Partial<TimeElementState>) => void;
}) {
  const icons: { icon: IconName; align: TextAlign }[] = [
    { icon: 'text.alignleft', align: 'left' },
    { icon: 'text.aligncenter', align: 'center' },
    { icon: 'text.alignright', align: 'right' },
    { icon: 'text.justify', align: 'justify' },
    { icon: 'arrow.left.and.right', align: 'spacing' },
  ];
  return (
    <View style={styles.alignRow}>
      {icons.map(({ icon, align }) => (
        <Pressable
          key={align}
          onPress={() => patch({ align })}
          style={[styles.alignBtn, state.align === align && styles.alignBtnActive]}>
          <SymbolView name={icon} tintColor={state.align === align ? '#FFFFFF' : '#556473'} size={16} />
        </Pressable>
      ))}
    </View>
  );
}

function FontSlider({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const min = 6;
  const max = 72;
  const ratio = (value - min) / (max - min);
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.sliderTicks}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Pressable
            key={i}
            style={styles.sliderTickHit}
            onPress={() => onChange(min + ((max - min) * i) / 4)}
          />
        ))}
      </View>
    </View>
  );
}

function ColorRow({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.colorRow}>
      <Text style={styles.rowLabel}>Drawing Color</Text>
      <View style={styles.colorGroup}>
        {DRAWING_COLORS.map((color, index) => {
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
  );
}

function PanelNote({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

function FormatSection({
  state,
  patch,
  dateDisplay,
  timeDisplay,
}: {
  state: TimeElementState;
  patch: (updates: Partial<TimeElementState>) => void;
  dateDisplay: string;
  timeDisplay: string;
}) {
  return (
    <>
      <NavRow label="Date Display" value={dateDisplay} />
      <Divider />
      <NavRow label="Time Display" value={timeDisplay} />
      <Divider />
      <StepperRow
        label="Offset (Day)"
        value={formatOffset(state.offsetDay, 'Day')}
        onMinus={() => patch({ offsetDay: state.offsetDay - 1 })}
        onPlus={() => patch({ offsetDay: state.offsetDay + 1 })}
      />
      <Divider />
      <StepperRow
        label="Offset (Hour)"
        value={formatOffset(state.offsetHour, 'Hour')}
        onMinus={() => patch({ offsetHour: state.offsetHour - 1 })}
        onPlus={() => patch({ offsetHour: state.offsetHour + 1 })}
      />
      <Divider />
      <StepperRow
        label="Offset (Minute)"
        value={formatOffset(state.offsetMinute, 'Minute')}
        onMinus={() => patch({ offsetMinute: state.offsetMinute - 1 })}
        onPlus={() => patch({ offsetMinute: state.offsetMinute + 1 })}
      />
      <Divider />
      <StepperRow
        label="Offset (Second)"
        value={formatOffset(state.offsetSecond, 'Second')}
        onMinus={() => patch({ offsetSecond: state.offsetSecond - 1 })}
        onPlus={() => patch({ offsetSecond: state.offsetSecond + 1 })}
      />
    </>
  );
}

function FontSection({
  state,
  patch,
}: {
  state: TimeElementState;
  patch: (updates: Partial<TimeElementState>) => void;
}) {
  return (
    <>
      <NavRow label="Font" value={state.fontFamily} onPress={() => router.push({ pathname: '/font-library', params: { from: 'edit' } })} />
      <Divider />
      <StepperRow
        label="Font Size"
        value={formatPt(state.fontSize)}
        onMinus={() => patch({ fontSize: Math.max(6, state.fontSize - 0.5) })}
        onPlus={() => patch({ fontSize: Math.min(72, state.fontSize + 0.5) })}
      />
      <Divider />
      <View style={styles.block}>
        <Text style={styles.rowLabel}>Font Size</Text>
        <FontSlider value={state.fontSize} onChange={(fontSize) => patch({ fontSize })} />
      </View>
      <Divider />
      <View style={styles.block}>
        <Text style={styles.rowLabel}>Font Style</Text>
        <StyleButtons state={state} patch={patch} />
      </View>
      <Divider />
      <View style={styles.block}>
        <Text style={styles.rowLabel}>Hor Alignment</Text>
        <AlignButtons state={state} patch={patch} />
      </View>
    </>
  );
}

type TimePropertyPanelProps = {
  activeTab: TimePropertyTab;
  onTabChange: (tab: TimePropertyTab) => void;
  state: TimeElementState;
  patch: (updates: Partial<TimeElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function TimePropertyPanel({
  activeTab, onTabChange, state, patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: TimePropertyPanelProps) {
  const { dateDisplay, timeDisplay } = useLiveDateTime(state);

  const formatSection = (
    <FormatSection
      state={state}
      patch={patch}
      dateDisplay={dateDisplay}
      timeDisplay={timeDisplay}
    />
  );

  const fontSection = <FontSection state={state} patch={patch} />;

  const positionSection = (
    <>
      <SegmentRow
        label="Rotation Angle"
        options={['0°', '90°', '180°', '270°'] as const}
        selected={`${state.rotation}°`}
        onSelect={(value) => patch({ rotation: parseInt(value, 10) as Rotation })}
      />
      <Divider />
      <StepperRow
        label="Left"
        value={formatMm(state.left)}
        onMinus={() => patch({ left: Math.max(0, state.left - 0.1) })}
        onPlus={() => patch({ left: state.left + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Top"
        value={formatMm(state.top)}
        onMinus={() => patch({ top: Math.max(0, state.top - 0.1) })}
        onPlus={() => patch({ top: state.top + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Width"
        value={formatMm(state.width)}
        onMinus={() => patch({ width: Math.max(1, state.width - 0.1) })}
        onPlus={() => patch({ width: state.width + 0.1 })}
      />
    </>
  );

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Pressable key={tab} onPress={() => onTabChange(tab)} style={styles.tabItem}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabSpacer} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            {formatSection}
            <SectionGap />
            {fontSection}
            <SectionGap />
            <GraySection>{positionSection}</GraySection>
            <SectionGap />
            <GraySection>
              <ToggleRow
                label="Lock Movement"
                value={state.lockMovement}
                onValueChange={(lockMovement) => patch({ lockMovement })}
              />
              <Divider />
              <ToggleRow
                label="Need Printing"
                value={state.needPrinting}
                onValueChange={(needPrinting) => patch({ needPrinting })}
              />
              <Divider />
              <ToggleRow
                label="Anti-Color"
                value={state.antiColor}
                onValueChange={(antiColor) => patch({ antiColor })}
              />
              <Divider />
              <ColorRow
                selectedIndex={state.drawingColorIndex}
                onSelect={(drawingColorIndex) => patch({ drawingColorIndex })}
              />
              <PanelNote>
                This color only acts on the preview effect, does not affect the printing effect.
              </PanelNote>
            </GraySection>
          </>
        )}

        {activeTab === 'Position' && (
          <PositionControls
            left={state.left}
            top={state.top}
            width={state.width}
            height={elementHeightMm}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            textAlign={state.align}
            onPatch={patch}
          />
        )}

        {activeTab === 'Format' && formatSection}

        {activeTab === 'Font' && fontSection}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#FFFFFF' },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E8ED' },
  tabContent: { paddingHorizontal: 2 },
  tabItem: { paddingHorizontal: 14, paddingTop: 10, alignItems: 'center' },
  tabText: { fontSize: 14, color: '#7E8B98', fontWeight: '500' },
  tabTextActive: { color: ACCENT, fontWeight: '600' },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  tabSpacer: { marginTop: 8, height: 3 },
  body: { flex: 1, backgroundColor: '#FFFFFF' },
  bodyContent: { paddingBottom: 24 },
  block: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2C3E50',
    lineHeight: 20,
    includeFontPadding: false,
    ...Platform.select({ android: { textAlignVertical: 'center' as const }, default: {} }),
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E4E8ED', marginLeft: 16 },
  sectionGap: { height: 8, backgroundColor: '#EEF1F5' },
  graySection: { backgroundColor: '#EEF1F5' },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segmentChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentChipActive: { backgroundColor: ACCENT },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#556473', textAlign: 'center' },
  segmentTextActive: { color: '#FFFFFF' },
  stepperRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: { borderColor: ACCENT, backgroundColor: ACCENT },
  stepperCircleDisabled: { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  stepperSymbol: { fontSize: 18, lineHeight: 20, color: '#64748B', fontWeight: '500' },
  stepperSymbolActive: { color: '#FFFFFF' },
  stepperSymbolDisabled: { color: '#CBD5E1' },
  stepperValue: { minWidth: 72, textAlign: 'center', fontSize: 14, fontWeight: '600', color: ACCENT },
  toggleRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '58%' },
  navValue: { fontSize: 14, color: '#7E8B98', flexShrink: 1, textAlign: 'right' },
  styleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  styleBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleBtnActive: { backgroundColor: ACCENT },
  styleBtnText: { fontSize: 16, fontWeight: '600', color: '#556473' },
  styleBtnTextActive: { color: '#FFFFFF' },
  boldGlyph: { fontWeight: '700' },
  italicGlyph: { fontStyle: 'italic' },
  underlineGlyph: { textDecorationLine: 'underline' },
  strikeGlyph: { textDecorationLine: 'line-through' },
  alignRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  alignBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignBtnActive: { backgroundColor: ACCENT },
  sliderBlock: { marginTop: 10, paddingBottom: 4 },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: ACCENT,
  },
  sliderTicks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  sliderTickHit: { flex: 1 },
  colorRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  colorGroup: { flexDirection: 'row', gap: 8 },
  colorOuter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  colorOuterActive: { borderWidth: 2, borderColor: ACCENT },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  colorDotWhite: { borderWidth: 1, borderColor: '#CBD5E1' },
  note: { marginTop: 8, marginHorizontal: 16, fontSize: 13, lineHeight: 20, color: '#8A97A4' },
  positionWrap: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  padColumn: { alignItems: 'center', gap: 6 },
  padMiddleRow: { flexDirection: 'row', gap: 6 },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: '#E8ECF1' },
  alignGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridBtn: {
    width: '22%',
    minWidth: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  positionActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
});
