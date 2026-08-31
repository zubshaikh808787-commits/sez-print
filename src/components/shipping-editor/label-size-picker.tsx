/**
 * Shipping Label Size Picker Component.
 * Allows users to choose standard presets (4x6, 4x4, 3x2, 2x1, A6) or enter custom dimensions.
 */

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Palette, cardShadow } from '@/constants/ui';
import {
  LabelDpi,
  LabelSizePreset,
  MM_PER_INCH,
  StandardLabelSizeId,
  STANDARD_LABEL_SIZES,
} from '@/lib/shipping-editor/types';

type LabelSizePickerProps = {
  selectedPreset: LabelSizePreset;
  dpi: LabelDpi;
  onSelectPreset: (preset: LabelSizePreset) => void;
  onChangeDpi: (dpi: LabelDpi) => void;
  onCustomSize: (widthMm: number, heightMm: number) => void;
};

export function LabelSizePicker({
  selectedPreset,
  dpi,
  onSelectPreset,
  onChangeDpi,
  onCustomSize,
}: LabelSizePickerProps) {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [customW, setCustomW] = useState(String(selectedPreset.widthMm));
  const [customH, setCustomH] = useState(String(selectedPreset.heightMm));
  const [customUnit, setCustomUnit] = useState<'mm' | 'in'>('mm');

  const presetList = Object.values(STANDARD_LABEL_SIZES);

  const applyCustom = () => {
    let w = parseFloat(customW);
    let h = parseFloat(customH);
    if (!Number.isFinite(w) || w <= 0) w = 100;
    if (!Number.isFinite(h) || h <= 0) h = 150;

    if (customUnit === 'in') {
      w = w * MM_PER_INCH;
      h = h * MM_PER_INCH;
    }

    onCustomSize(w, h);
    setModalVisible(false);
  };

  return (
    <>
      {/* Trigger Bar */}
      <Pressable
        style={({ pressed }) => [styles.triggerBar, pressed && styles.pressed]}
        onPress={() => setModalVisible(true)}>
        <View style={styles.triggerLeft}>
          <AppIcon name="doc.plaintext" tintColor="#2563EB" size={18} />
          <View style={styles.triggerInfo}>
            <Text style={styles.triggerTitle}>{selectedPreset.name}</Text>
            <Text style={styles.triggerSubtitle}>
              {selectedPreset.widthMm.toFixed(1)} × {selectedPreset.heightMm.toFixed(1)} mm ({dpi} DPI)
            </Text>
          </View>
        </View>
        <AppIcon name="chevron.down" tintColor="#64748B" size={14} />
      </Pressable>

      {/* Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Label Size</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}>
                <AppIcon name="xmark" tintColor="#64748B" size={16} />
              </Pressable>
            </View>

            {/* DPI Selector */}
            <View style={styles.dpiRow}>
              <Text style={styles.dpiLabel}>Target Printer DPI:</Text>
              <View style={styles.dpiToggle}>
                <Pressable
                  onPress={() => onChangeDpi(203)}
                  style={[styles.dpiChip, dpi === 203 && styles.dpiChipActive]}>
                  <Text style={[styles.dpiText, dpi === 203 && styles.dpiTextActive]}>203 DPI</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChangeDpi(300)}
                  style={[styles.dpiChip, dpi === 300 && styles.dpiChipActive]}>
                  <Text style={[styles.dpiText, dpi === 300 && styles.dpiTextActive]}>300 DPI</Text>
                </Pressable>
              </View>
            </View>

            {/* Preset Options */}
            <ScrollView style={styles.presetList} showsVerticalScrollIndicator={false}>
              {presetList.map((preset) => {
                const isSelected = selectedPreset.id === preset.id;
                const pxDims = dpi === 203 ? preset.px203 : preset.px300;

                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      if (preset.id === 'custom') {
                        setCustomW(String(selectedPreset.widthMm));
                        setCustomH(String(selectedPreset.heightMm));
                      } else {
                        onSelectPreset(preset);
                        setModalVisible(false);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.presetItem,
                      isSelected && styles.presetItemActive,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.presetLeft}>
                      <Text style={[styles.presetName, isSelected && styles.presetTextActive]}>
                        {preset.name}
                      </Text>
                      <Text style={styles.presetDetail}>
                        {preset.detail} · {preset.widthMm.toFixed(1)} × {preset.heightMm.toFixed(1)} mm
                      </Text>
                      <Text style={styles.presetPx}>
                        {pxDims.width} × {pxDims.height} px @ {dpi} DPI
                      </Text>
                    </View>
                    {isSelected && (
                      <AppIcon name="checkmark.circle.fill" tintColor="#2563EB" size={20} />
                    )}
                  </Pressable>
                );
              })}

              {/* Custom Size Editor Box */}
              <View style={styles.customBox}>
                <Text style={styles.customTitle}>Custom Label Dimensions</Text>
                <View style={styles.unitToggleRow}>
                  <Pressable
                    onPress={() => setCustomUnit('mm')}
                    style={[styles.unitBtn, customUnit === 'mm' && styles.unitBtnActive]}>
                    <Text style={[styles.unitBtnText, customUnit === 'mm' && styles.unitBtnTextActive]}>
                      Millimeters (mm)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setCustomUnit('in')}
                    style={[styles.unitBtn, customUnit === 'in' && styles.unitBtnActive]}>
                    <Text style={[styles.unitBtnText, customUnit === 'in' && styles.unitBtnTextActive]}>
                      Inches (in)
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.customInputsRow}>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Width ({customUnit})</Text>
                    <TextInput
                      value={customW}
                      onChangeText={setCustomW}
                      keyboardType="decimal-pad"
                      style={styles.textInput}
                    />
                  </View>
                  <View style={styles.inputField}>
                    <Text style={styles.inputLabel}>Height ({customUnit})</Text>
                    <TextInput
                      value={customH}
                      onChangeText={setCustomH}
                      keyboardType="decimal-pad"
                      style={styles.textInput}
                    />
                  </View>
                </View>

                <Pressable
                  onPress={applyCustom}
                  style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}>
                  <Text style={styles.applyBtnText}>Apply Custom Size</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  triggerInfo: {},
  triggerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  triggerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeButton: {
    padding: 6,
  },
  dpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  dpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dpiToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  dpiChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  dpiChipActive: {
    backgroundColor: '#2563EB',
  },
  dpiText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  dpiTextActive: {
    color: '#FFFFFF',
  },
  presetList: {
    maxHeight: 400,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  presetItemActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  presetLeft: {
    flex: 1,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  presetTextActive: {
    color: '#2563EB',
  },
  presetDetail: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  presetPx: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  customBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
  },
  customTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  unitToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
  },
  unitBtnActive: {
    backgroundColor: '#0F172A',
  },
  unitBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  unitBtnTextActive: {
    color: '#FFFFFF',
  },
  customInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  inputField: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  textInput: {
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  applyBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
