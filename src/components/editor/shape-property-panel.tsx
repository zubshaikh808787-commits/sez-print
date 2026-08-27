import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PositionControls } from '@/components/editor/position-controls';
import {
  DRAWING_COLORS,
  formatMm,
  type FigureShape,
  type Rotation,
  type ShapeElementState,
  type ShapePropertyTab,
} from '@/components/editor/types';

const ACCENT = '#48C3C7';
const TABS: ShapePropertyTab[] = ['Regular', 'Position', 'Style'];

const FIGURE_SHAPES: FigureShape[] = ['rectangle', 'roundedRectangle', 'oval', 'circle'];

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

function FigureShapePreview({ shape, active }: { shape: FigureShape; active?: boolean }) {
  const borderColor = active ? '#FFFFFF' : '#556473';
  const common = {
    borderWidth: 2,
    borderColor,
    backgroundColor: 'transparent' as const,
  };

  if (shape === 'circle') {
    return <View style={[styles.shapeCircle, common]} />;
  }
  if (shape === 'oval') {
    return <View style={[styles.shapeOval, common]} />;
  }
  if (shape === 'roundedRectangle') {
    return <View style={[styles.shapeRoundedRect, common, { borderRadius: 4 }]} />;
  }
  return <View style={[styles.shapeRect, common]} />;
}

function FigureShapeRow({
  selected,
  onSelect,
}: {
  selected: FigureShape;
  onSelect: (shape: FigureShape) => void;
}) {
  return (
    <View style={styles.figureShapeBlock}>
      <Text style={styles.rowLabel}>Figure Shape</Text>
      <View style={styles.figureShapeRow}>
        {FIGURE_SHAPES.map((shape) => {
          const active = shape === selected;
          return (
            <Pressable
              key={shape}
              onPress={() => onSelect(shape)}
              style={[styles.figureShapeBtn, active && styles.figureShapeBtnActive]}>
              <FigureShapePreview shape={shape} active={active} />
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

function DimensionSteppers({
  state,
  patch,
}: {
  state: ShapeElementState;
  patch: (updates: Partial<ShapeElementState>) => void;
}) {
  return (
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
        onMinus={() => patch({ width: Math.max(0.1, state.width - 0.1) })}
        onPlus={() => patch({ width: state.width + 0.1 })}
      />
      <Divider />
      <StepperRow
        label="Height"
        value={formatMm(state.height)}
        onMinus={() => patch({ height: Math.max(0.1, state.height - 0.1) })}
        onPlus={() => patch({ height: state.height + 0.1 })}
      />
    </>
  );
}

function StyleSection({
  state,
  patch,
}: {
  state: ShapeElementState;
  patch: (updates: Partial<ShapeElementState>) => void;
}) {
  const showRoundRadius = state.figureShape === 'roundedRectangle';

  return (
    <>
      <FigureShapeRow
        selected={state.figureShape}
        onSelect={(figureShape) => patch({ figureShape })}
      />
      <Divider />
      <ToggleRow label="Fill" value={state.fill} onValueChange={(fill) => patch({ fill })} />
      <Divider />
      <StepperRow
        label="Line Width"
        value={formatMm(state.lineWidth)}
        onMinus={() => patch({ lineWidth: Math.max(0.1, state.lineWidth - 0.05) })}
        onPlus={() => patch({ lineWidth: state.lineWidth + 0.05 })}
      />
      {showRoundRadius && (
        <>
          <Divider />
          <StepperRow
            label="Round Radius"
            value={formatMm(state.roundRadius)}
            onMinus={() => patch({ roundRadius: Math.max(0.1, state.roundRadius - 0.05) })}
            onPlus={() => patch({ roundRadius: state.roundRadius + 0.05 })}
          />
        </>
      )}
    </>
  );
}

type ShapePropertyPanelProps = {
  activeTab: ShapePropertyTab;
  onTabChange: (tab: ShapePropertyTab) => void;
  state: ShapeElementState;
  patch: (updates: Partial<ShapeElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function ShapePropertyPanel({
  activeTab, onTabChange, state, patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: ShapePropertyPanelProps) {
  const styleSection = <StyleSection state={state} patch={patch} />;

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
            {styleSection}
            <SectionGap />
            <GraySection>
              <SegmentRow
                label="Rotation Angle"
                options={['0°', '90°', '180°', '270°'] as const}
                selected={`${state.rotation}°`}
                onSelect={(value) => patch({ rotation: parseInt(value, 10) as Rotation })}
              />
              <Divider />
              <DimensionSteppers state={state} patch={patch} />
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
            onPatch={patch}
          />
        )}

        {activeTab === 'Style' && styleSection}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#FFFFFF' },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E8ED' },
  tabContent: { paddingHorizontal: 8 },
  tabItem: { paddingHorizontal: 22, paddingTop: 10, alignItems: 'center' },
  tabText: { fontSize: 14, color: '#7E8B98', fontWeight: '500' },
  tabTextActive: { color: ACCENT, fontWeight: '600' },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 36,
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
  figureShapeBlock: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  figureShapeRow: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  figureShapeBtn: {
    width: 44,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  figureShapeBtnActive: { backgroundColor: ACCENT },
  shapeRect: { width: 24, height: 16, borderRadius: 1 },
  shapeRoundedRect: { width: 24, height: 16 },
  shapeOval: { width: 26, height: 16, borderRadius: 8 },
  shapeCircle: { width: 18, height: 18, borderRadius: 9 },
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
