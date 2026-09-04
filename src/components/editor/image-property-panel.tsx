import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

import { AppIcon } from '@/components/app-icon';
import { PositionControls } from '@/components/editor/position-controls';
import { formatMm, type Rotation } from '@/components/editor/types';
import type { ImageElementState } from '@/lib/label-document';

const ACCENT = '#48C3C7';
const TABS = ['Regular', 'Position', 'Rotate'] as const;
export type ImagePropertyTab = (typeof TABS)[number];

function Divider() {
  return <View style={styles.divider} />;
}

function SectionGap() {
  return <View style={styles.sectionGap} />;
}

function GraySection({ children }: { children: React.ReactNode }) {
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
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperRight}>
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

export type ImagePropertyPanelProps = {
  activeTab: ImagePropertyTab;
  onTabChange: (tab: ImagePropertyTab) => void;
  state: ImageElementState;
  patch: (updates: Partial<ImageElementState>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  elementHeightMm: number;
};

export function ImagePropertyPanel({
  activeTab,
  onTabChange,
  state,
  patch,
  labelWidthMm,
  labelHeightMm,
  elementHeightMm,
}: ImagePropertyPanelProps) {
  const currentRotation = state.rotation ?? 0;
  const isAspectLocked = state.aspectRatioLocked ?? true;
  const currentAspect = state.width > 0 && state.height > 0 ? state.width / state.height : 1;

  const handleRotate90 = useCallback(() => {
    const next = ((currentRotation + 90) % 360) as Rotation;
    patch({ rotation: next });
  }, [currentRotation, patch]);

  const handleCropImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    patch({ uri: asset.uri });
  }, [patch]);

  const handleReplaceImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    patch({ uri: asset.uri });
  }, [patch]);

  const handleFlipH = useCallback(() => {
    patch({ flipH: !state.flipH });
  }, [state.flipH, patch]);

  const handleFlipV = useCallback(() => {
    patch({ flipV: !state.flipV });
  }, [state.flipV, patch]);

  const handleFitToWidth = useCallback(() => {
    const newW = labelWidthMm;
    const newH = isAspectLocked ? Math.round((newW / currentAspect) * 10) / 10 : state.height;
    patch({
      width: newW,
      height: Math.min(newH, labelHeightMm),
      left: 0,
    });
  }, [labelWidthMm, labelHeightMm, isAspectLocked, currentAspect, state.height, patch]);

  const handleCenter = useCallback(() => {
    patch({
      left: Math.max(0, Math.round(((labelWidthMm - state.width) / 2) * 10) / 10),
      top: Math.max(0, Math.round(((labelHeightMm - state.height) / 2) * 10) / 10),
    });
  }, [labelWidthMm, labelHeightMm, state.width, state.height, patch]);

  const handleWidthChange = useCallback(
    (delta: number) => {
      const nextW = Math.max(1, Math.round((state.width + delta) * 10) / 10);
      if (isAspectLocked) {
        const nextH = Math.max(1, Math.round((nextW / currentAspect) * 10) / 10);
        patch({ width: nextW, height: nextH });
      } else {
        patch({ width: nextW });
      }
    },
    [state.width, isAspectLocked, currentAspect, patch],
  );

  const handleHeightChange = useCallback(
    (delta: number) => {
      const nextH = Math.max(1, Math.round((state.height + delta) * 10) / 10);
      if (isAspectLocked) {
        const nextW = Math.max(1, Math.round((nextH * currentAspect) * 10) / 10);
        patch({ width: nextW, height: nextH });
      } else {
        patch({ height: nextH });
      }
    },
    [state.height, isAspectLocked, currentAspect, patch],
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

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}>
        {activeTab === 'Regular' && (
          <>
            {/* Quick Actions: Preview, Crop, Replace, 90° Rotate */}
            <GraySection>
              <View style={styles.previewRow}>
                {state.uri ? (
                  <View style={styles.thumbWrapper}>
                    <Image
                      source={{ uri: state.uri }}
                      style={[
                        styles.thumb,
                        {
                          transform: [
                            { rotate: `${currentRotation}deg` },
                            { scaleX: state.flipH ? -1 : 1 },
                            { scaleY: state.flipV ? -1 : 1 },
                          ],
                        },
                      ]}
                      contentFit={state.contentFit ?? 'contain'}
                    />
                  </View>
                ) : null}
                <View style={styles.quickActionCol}>
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={handleCropImage}
                      style={({ pressed }) => [styles.actionButton, styles.cropButton, pressed && styles.pressed]}>
                      <AppIcon name="crop" tintColor="#FFFFFF" size={15} />
                      <Text style={styles.cropButtonText}>Crop</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleReplaceImage}
                      style={({ pressed }) => [styles.actionButton, styles.replaceButton, pressed && styles.pressed]}>
                      <AppIcon name="photo" tintColor="#374151" size={15} />
                      <Text style={styles.replaceButtonText}>Replace</Text>
                    </Pressable>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={handleRotate90}
                      style={({ pressed }) => [styles.actionButton, styles.rotateButton, pressed && styles.pressed]}>
                      <AppIcon name="arrow.clockwise" tintColor="#374151" size={15} />
                      <Text style={styles.rotateButtonText}>Rotate 90°</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCenter}
                      style={({ pressed }) => [styles.actionButton, styles.centerButton, pressed && styles.pressed]}>
                      <AppIcon name="target" tintColor="#374151" size={15} />
                      <Text style={styles.centerButtonText}>Center</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </GraySection>

            <SectionGap />

            {/* Mirror / Flip Controls */}
            <GraySection>
              <Text style={styles.rowLabel}>Mirror & Orientation</Text>
              <View style={[styles.segmentRow, { marginTop: 6 }]}>
                <Pressable
                  onPress={handleFlipH}
                  style={[styles.segmentChip, state.flipH && styles.segmentChipActive]}>
                  <Text style={[styles.segmentText, state.flipH && styles.segmentTextActive]}>
                    Flip Horizontal
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleFlipV}
                  style={[styles.segmentChip, state.flipV && styles.segmentChipActive]}>
                  <Text style={[styles.segmentText, state.flipV && styles.segmentTextActive]}>
                    Flip Vertical
                  </Text>
                </Pressable>
              </View>
            </GraySection>

            <SectionGap />

            {/* Fit Mode & Sizing Tools */}
            <GraySection>
              <SegmentRow
                label="Content Fit"
                options={['fill', 'contain', 'cover'] as const}
                selected={state.contentFit ?? 'fill'}
                onSelect={(val) => patch({ contentFit: val })}
              />
              <Divider />
              <View style={styles.quickFitRow}>
                <Pressable
                  onPress={handleFitToWidth}
                  style={({ pressed }) => [styles.toolChip, pressed && styles.pressed]}>
                  <AppIcon name="arrow.left.and.right" tintColor={ACCENT} size={15} />
                  <Text style={styles.toolChipText}>Fit Label Width</Text>
                </Pressable>
                <Pressable
                  onPress={handleCenter}
                  style={({ pressed }) => [styles.toolChip, pressed && styles.pressed]}>
                  <AppIcon name="align.horizontal.center" tintColor={ACCENT} size={15} />
                  <Text style={styles.toolChipText}>Center on Tag</Text>
                </Pressable>
              </View>
              <Divider />
              <ToggleRow
                label="Lock Aspect Ratio"
                value={isAspectLocked}
                onValueChange={(locked) => patch({ aspectRatioLocked: locked })}
              />
              <Divider />
              <StepperRow
                label="Width"
                value={formatMm(state.width)}
                onMinus={() => handleWidthChange(-0.5)}
                onPlus={() => handleWidthChange(0.5)}
              />
              <Divider />
              <StepperRow
                label="Height"
                value={formatMm(state.height)}
                onMinus={() => handleHeightChange(-0.5)}
                onPlus={() => handleHeightChange(0.5)}
              />
            </GraySection>

            <SectionGap />

            {/* Color & Thermal Printing Mode */}
            <GraySection>
              <SegmentRow
                label="Color Mode"
                options={['Original', 'B & W'] as const}
                selected={state.colorMode === 'B & W' ? 'B & W' : 'Original'}
                onSelect={(val) => patch({ colorMode: val })}
              />
              {state.colorMode === 'B & W' ? (
                <>
                  <Divider />
                  <StepperRow
                    label="Gray Threshold"
                    value={String(state.grayThreshold ?? 128)}
                    onMinus={() => patch({ grayThreshold: Math.max(10, (state.grayThreshold ?? 128) - 10) })}
                    onPlus={() => patch({ grayThreshold: Math.min(250, (state.grayThreshold ?? 128) + 10) })}
                  />
                </>
              ) : null}
              <Divider />
              <ToggleRow
                label="Invert Colors (Anti-Color)"
                value={state.antiColor}
                onValueChange={(antiColor) => patch({ antiColor })}
              />
            </GraySection>

            <SectionGap />

            {/* Lock Movement & Printing */}
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

        {activeTab === 'Rotate' && (
          <GraySection>
            <SegmentRow
              label="Rotation Preset"
              options={['0°', '90°', '180°', '270°'] as const}
              selected={`${currentRotation}°`}
              onSelect={(value) => patch({ rotation: parseInt(value, 10) as Rotation })}
            />
            <Divider />
            <StepperRow
              label="Adjust Angle (+/- 5°)"
              value={`${currentRotation}°`}
              onMinus={() => {
                const next = ((currentRotation - 5 + 360) % 360) as Rotation;
                patch({ rotation: next });
              }}
              onPlus={() => {
                const next = ((currentRotation + 5) % 360) as Rotation;
                patch({ rotation: next });
              }}
            />
            <Divider />
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => patch({ rotation: 0 })}
                style={({ pressed }) => [styles.actionButton, styles.replaceButton, pressed && styles.pressed]}>
                <Text style={styles.replaceButtonText}>Reset to 0°</Text>
              </Pressable>
              <Pressable
                onPress={handleRotate90}
                style={({ pressed }) => [styles.actionButton, styles.cropButton, pressed && styles.pressed]}>
                <AppIcon name="arrow.clockwise" tintColor="#FFFFFF" size={15} />
                <Text style={styles.cropButtonText}>Rotate +90°</Text>
              </Pressable>
            </View>
          </GraySection>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  tabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    maxHeight: 44,
  },
  tabContent: {
    paddingHorizontal: 16,
    gap: 20,
    alignItems: 'center',
  },
  tabItem: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: ACCENT,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: ACCENT,
    borderRadius: 1.5,
  },
  tabSpacer: {
    height: 2.5,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  graySection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  sectionGap: {
    height: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEF2F6',
    marginVertical: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbWrapper: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 58,
    height: 58,
  },
  quickActionCol: {
    flex: 1,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cropButton: {
    backgroundColor: ACCENT,
  },
  cropButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  rotateButton: {
    backgroundColor: '#EEF2F6',
  },
  rotateButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  replaceButton: {
    backgroundColor: '#EEF2F6',
  },
  replaceButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  centerButton: {
    backgroundColor: '#EEF2F6',
  },
  centerButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  block: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#4B5563',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickFitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  toolChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleActive: {
    backgroundColor: ACCENT,
  },
  stepperSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
  },
  stepperSymbolActive: {
    color: '#FFFFFF',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    minWidth: 48,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.75,
  },
});
