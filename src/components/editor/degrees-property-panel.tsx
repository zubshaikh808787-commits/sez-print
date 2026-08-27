import { router } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatInt,
  formatMm,
  formatPt,
  type AutoWrapping,
  type ContentType,
  type DegreesElementState,
  type LineSpacing,
  type PropertyTab,
  type Rotation,
  type TextAlign,
} from '@/components/editor/types';

const ACCENT = '#48C3C7';
const TABS: PropertyTab[] = ['Regular', 'Position', 'Content', 'Paragraph', 'Font'];
type IconName = AppIconName;

function Divider() {
  return <View style={styles.divider} />;
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

function GraySection({ children }: { children: ReactNode }) {
  return <View style={styles.graySection}>{children}</View>;
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
        <Text style={styles.navValue} numberOfLines={1}>
          {value || ' '}
        </Text>
        <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
      </View>
    </Pressable>
  );
}

function ContentValueRow({ value }: { value: string }) {
  return (
    <View style={styles.contentRow}>
      <Text style={styles.rowLabel}>Content</Text>
      <View style={styles.contentRight}>
        <Text style={styles.contentValue}>{value}</Text>
        <AppIcon name="viewfinder" tintColor={ACCENT} size={22} />
      </View>
    </View>
  );
}

function StyleButtons({
  state,
  patch,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
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
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
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
          <AppIcon name={icon} tintColor={state.align === align ? '#FFFFFF' : '#556473'} size={16} />
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

function ContentSection({
  state,
  patch,
  onColumnNamePress,
  contentInputRef,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  onColumnNamePress?: () => void;
  contentInputRef?: React.RefObject<TextInput | null>;
}) {
  return (
    <>
      <SegmentRow
        label="Content Type"
        options={['Manual', 'Degrees', 'Data Source'] as const}
        selected={state.contentType}
        onSelect={(contentType: ContentType) => patch({ contentType })}
      />
      {state.contentType === 'Degrees' && (
        <>
          <Divider />
          <StepperRow
            label="Degrees Offset"
            value={formatInt(state.degreesOffset)}
            onMinus={() => patch({ degreesOffset: Math.max(0, state.degreesOffset - 1) })}
            onPlus={() => patch({ degreesOffset: state.degreesOffset + 1 })}
          />
        </>
      )}
      <Divider />
      {state.contentType === 'Data Source' ? (
        <NavRow label="Content" value={state.columnNameContent} onPress={onColumnNamePress} />
      ) : (
        <>
          <View style={styles.contentRow}>
            <Text style={styles.rowLabel}>Content</Text>
            <Pressable onPress={() => router.push('/scan')} hitSlop={8}>
              <AppIcon name="viewfinder" tintColor={ACCENT} size={22} />
            </Pressable>
          </View>
          <TextInput
            ref={contentInputRef}
            style={styles.contentInput}
            value={state.content}
            onChangeText={(content) => patch({ content })}
            multiline
            placeholder="Enter serial / degrees content"
            placeholderTextColor="#94A3B8"
          />
        </>
      )}
    </>
  );
}

function ParagraphSection({
  state,
  patch,
  showNote = true,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  showNote?: boolean;
}) {
  return (
    <>
      <StepperRow
        label="Char Spacing"
        value={formatMm(state.charSpacing)}
        onMinus={() => patch({ charSpacing: Math.max(0, state.charSpacing - 0.05) })}
        onPlus={() => patch({ charSpacing: state.charSpacing + 0.05 })}
        minusDisabled={state.charSpacing <= 0}
      />
      <Divider />
      <SegmentRow
        label="Line Spacing"
        options={['1.0', '1.5', '2.0', 'Custom'] as const}
        selected={state.lineSpacing}
        onSelect={(lineSpacing: LineSpacing) => patch({ lineSpacing })}
      />
      <Divider />
      <SegmentRow
        label="Auto Wrapping"
        options={['Close', 'Char', 'Word'] as const}
        selected={state.autoWrapping}
        onSelect={(autoWrapping: AutoWrapping) => patch({ autoWrapping })}
      />
      <Divider />
      <ToggleRow
        label="Vertical Display"
        value={state.verticalDisplay}
        onValueChange={(verticalDisplay) => patch({ verticalDisplay })}
      />
      <Divider />
      <ToggleRow
        label="Auto Text Height"
        value={state.autoTextHeight}
        onValueChange={(autoTextHeight) => patch({ autoTextHeight })}
      />
      {showNote && (
        <PanelNote>
          After &apos;Auto Calculate Height&apos; turn off, if the height is too low, the text will be reduced to
          fit the height.
        </PanelNote>
      )}
    </>
  );
}

function FontSection({
  state,
  patch,
  includeAlignment = true,
}: {
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  includeAlignment?: boolean;
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
      {includeAlignment && (
        <>
          <Divider />
          <View style={styles.block}>
            <Text style={styles.rowLabel}>Hor Alignment</Text>
            <AlignButtons state={state} patch={patch} />
          </View>
        </>
      )}
    </>
  );
}

type DegreesPropertyPanelProps = {
  activeTab: PropertyTab;
  onTabChange: (tab: PropertyTab) => void;
  state: DegreesElementState;
  patch: (updates: Partial<DegreesElementState>) => void;
  onColumnNamePress?: () => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
  contentFocusRequest?: number;
};

export function DegreesPropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  onColumnNamePress,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
  contentFocusRequest = 0,
}: DegreesPropertyPanelProps) {
  const contentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (contentFocusRequest > 0 && activeTab === 'Content') {
      requestAnimationFrame(() => contentInputRef.current?.focus());
    }
  }, [activeTab, contentFocusRequest]);

  const contentSection = (
    <ContentSection
      state={state}
      patch={patch}
      onColumnNamePress={onColumnNamePress}
      contentInputRef={contentInputRef}
    />
  );
  const paragraphSection = <ParagraphSection state={state} patch={patch} />;
  const fontSection = <FontSection state={state} patch={patch} />;

  const dimensionSteppers = (
    <>
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
            {contentSection}
            <SectionGap />
            {paragraphSection}
            <SectionGap />
            {fontSection}
            <SectionGap />
            <GraySection>
              <SegmentRow
                label="Rotation Angle"
                options={['0°', '90°', '180°', '270°'] as const}
                selected={`${state.rotation}°`}
                onSelect={(value) => patch({ rotation: parseInt(value, 10) as Rotation })}
              />
              <Divider />
              {dimensionSteppers}
            </GraySection>
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

        {activeTab === 'Content' && contentSection}

        {activeTab === 'Paragraph' && (
          <>
            <ParagraphSection state={state} patch={patch} showNote={false} />
            <View style={styles.noteWrap}>
              <PanelNote>
                After &apos;Auto Calculate Height&apos; turn off, if the height is too low, the text will be reduced
                to fit the height.
              </PanelNote>
            </View>
          </>
        )}

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
    minWidth: 32,
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
  contentRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contentValue: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  contentInput: {
    marginHorizontal: 16,
    marginBottom: 16,
    minHeight: 88,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },
  navRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%' },
  navValue: { fontSize: 14, color: '#64748B' },
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
  styleBtnText: { fontSize: 16, color: '#556473', fontWeight: '600' },
  styleBtnTextActive: { color: '#FFFFFF' },
  boldGlyph: { fontWeight: '800' },
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
  sliderBlock: { marginTop: 10, position: 'relative' },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'visible',
    position: 'relative',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: ACCENT, borderRadius: 2 },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sliderTicks: { flexDirection: 'row', marginTop: 4 },
  sliderTickHit: { flex: 1, height: 24 },
  colorRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorGroup: { flexDirection: 'row', gap: 8 },
  colorOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOuterActive: { borderWidth: 2, borderColor: ACCENT },
  colorDot: { width: 22, height: 22, borderRadius: 11 },
  colorDotWhite: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBD5E1' },
  note: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 17,
    color: '#7E8B98',
  },
  noteWrap: { backgroundColor: '#EEF1F5' },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
    backgroundColor: '#EEF1F5',
  },
  padColumn: { alignItems: 'center', gap: 6 },
  padMiddleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: '#FFFFFF' },
  alignGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gridBtn: {
    width: '22%',
    aspectRatio: 1,
    minWidth: 44,
    maxWidth: 52,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    backgroundColor: '#EEF1F5',
  },
  positionActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
