import { AppIcon, type AppIconName } from '@/components/app-icon';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatInt,
  formatMm,
  type ContentType,
  type QrCodeShape,
  type QrEncodeMode,
  type QrErrorLevel,
  type QrcodeElementState,
  type QrcodePropertyTab,
  type QrZoneSize,
  type Rotation,
} from '@/components/editor/types';

const ACCENT = '#48C3C7';
const TABS: QrcodePropertyTab[] = ['Regular', 'Position', 'Content', 'Encoding'];
type IconName = AppIconName;

const CODE_SHAPE_NOTE =
  "When set to 'Rectangle', the encoding takes precedence over the rectangular style. If the content does not support a rectangular style, it will appear as 'Square'.";

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

function NavRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.navRight}>
        <Text style={styles.navValue} numberOfLines={1}>
          {value || ' '}
        </Text>
        <AppIcon name="chevron.right" tintColor="#A0AEC0" size={14} />
      </View>
    </Pressable>
  );
}

function PanelNote({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

function ContentTypeSection({
  state,
  patch,
  onColumnNamePress,
}: {
  state: QrcodeElementState;
  patch: (updates: Partial<QrcodeElementState>) => void;
  onColumnNamePress?: () => void;
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
        <View style={styles.contentRow}>
          <Text style={styles.rowLabel}>Content</Text>
          <View style={styles.contentRight}>
            {state.content ? (
              <Text style={styles.contentValue} numberOfLines={1}>
                {state.content}
              </Text>
            ) : null}
            <AppIcon name="qrcode.viewfinder" tintColor={ACCENT} size={22} />
          </View>
        </View>
      )}
    </>
  );
}

function EncodingSections({
  state,
  patch,
}: {
  state: QrcodeElementState;
  patch: (updates: Partial<QrcodeElementState>) => void;
}) {
  const handleEncodeModeChange = (encodeMode: QrEncodeMode) => {
    const updates: Partial<QrcodeElementState> = { encodeMode };
    if (encodeMode === 'PDF417' && state.width === 12) {
      updates.width = 17.14;
    }
    if (encodeMode === 'QRCode' && state.width === 17.14) {
      updates.width = 12;
    }
    patch(updates);
  };

  return (
    <>
      <SegmentRow
        label="Encode Mode"
        options={['QRCode', 'PDF417', 'DataMatrix'] as const}
        selected={state.encodeMode}
        onSelect={handleEncodeModeChange}
      />
      {state.encodeMode === 'QRCode' && (
        <>
          <Divider />
          <SegmentRow
            label="Error Level"
            options={['L', 'M', 'Q', 'H'] as const}
            selected={state.errorLevel}
            onSelect={(errorLevel: QrErrorLevel) => patch({ errorLevel })}
          />
          <Divider />
          <SegmentRow
            label="Zone Size"
            options={['0', '2', '4'] as const}
            selected={state.zoneSize}
            onSelect={(zoneSize: QrZoneSize) => patch({ zoneSize })}
          />
        </>
      )}
    </>
  );
}

type QrcodePropertyPanelProps = {
  activeTab: QrcodePropertyTab;
  onTabChange: (tab: QrcodePropertyTab) => void;
  state: QrcodeElementState;
  patch: (updates: Partial<QrcodeElementState>) => void;
  onColumnNamePress?: () => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function QrcodePropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  onColumnNamePress,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: QrcodePropertyPanelProps) {
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
      <Divider />
      <StepperRow
        label="Height"
        value={formatMm(state.height)}
        onMinus={() => patch({ height: Math.max(1, state.height - 0.1) })}
        onPlus={() => patch({ height: state.height + 0.1 })}
      />
    </>
  );

  const positionSection = (
    <>
      <SegmentRow
        label="Rotation Angle"
        options={['0°', '90°', '180°', '270°'] as const}
        selected={`${state.rotation}°`}
        onSelect={(value) => patch({ rotation: parseInt(value, 10) as Rotation })}
      />
      <Divider />
      {dimensionSteppers}
    </>
  );

  const toggleColorSection = (
    <>
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
    </>
  );

  const regularTabContent = (() => {
    if (state.encodeMode === 'QRCode') {
      return (
        <>
          <ContentTypeSection state={state} patch={patch} onColumnNamePress={onColumnNamePress} />
          <SectionGap />
          <EncodingSections state={state} patch={patch} />
          <SectionGap />
          <GraySection>{positionSection}</GraySection>
          <SectionGap />
          <GraySection>
            <ToggleRow
              label="Lock Movement"
              value={state.lockMovement}
              onValueChange={(lockMovement) => patch({ lockMovement })}
            />
          </GraySection>
        </>
      );
    }

    if (state.encodeMode === 'PDF417') {
      return (
        <>
          <EncodingSections state={state} patch={patch} />
          <SectionGap />
          <GraySection>{positionSection}</GraySection>
          <SectionGap />
          <GraySection>{toggleColorSection}</GraySection>
        </>
      );
    }

    return (
      <>
        <SegmentRow
          label="Code Shape"
          options={['Auto', 'Square', 'Rectangle'] as const}
          selected={state.codeShape}
          onSelect={(codeShape: QrCodeShape) => patch({ codeShape })}
        />
        <PanelNote>{CODE_SHAPE_NOTE}</PanelNote>
        <SectionGap />
        <GraySection>{positionSection}</GraySection>
        <SectionGap />
        <GraySection>{toggleColorSection}</GraySection>
      </>
    );
  })();

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
        {activeTab === 'Regular' && regularTabContent}

        {activeTab === 'Position' && (
          <PositionControls
            left={state.left}
            top={state.top}
            width={state.width}
            height={elementHeightMm}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            onPatch={patch}
          />
        )}

        {activeTab === 'Content' && (
          <ContentTypeSection state={state} patch={patch} onColumnNamePress={onColumnNamePress} />
        )}

        {activeTab === 'Encoding' && <EncodingSections state={state} patch={patch} />}
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
  stepperSymbol: { fontSize: 18, lineHeight: 20, color: '#64748B', fontWeight: '500' },
  stepperSymbolActive: { color: '#FFFFFF' },
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
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, maxWidth: '55%' },
  navValue: { fontSize: 14, color: '#7E8B98', flexShrink: 1, textAlign: 'right' },
  contentRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentRight: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '62%' },
  contentValue: { fontSize: 14, color: '#64748B', fontWeight: '500', flexShrink: 1 },
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
