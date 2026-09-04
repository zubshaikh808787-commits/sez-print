import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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
import { Image } from 'expo-image';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { Palette } from '@/constants/ui';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { buildJewelryTemplateElements } from '@/constants/jewelry-template-elements';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { TEMPLATES, type TemplateItem } from '@/app/(tabs)/template';
import {
  createLabelDocument,
  createUpsConfig,
  generateId,
  type LabelElement,
} from '@/lib/label-document';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

const ACCENT = '#48C3C7';
const DEFAULT_TAG_W = JEWELRY_DIECUT.tagWidthMm;
const DEFAULT_TAG_H = JEWELRY_DIECUT.tagHeightMm;
const UPS_COLUMNS = JEWELRY_DIECUT.columns;
const UPS_GAP = JEWELRY_DIECUT.gapMm;

const SIZE_PRESETS = [
  { label: '14 × 96 mm (Jewellery Tag)', width: JEWELRY_DIECUT.tagWidthMm, height: JEWELRY_DIECUT.tagHeightMm },
  { label: '54 × 96 mm (3-Up Sheet)', width: JEWELRY_DIECUT.sheetWidthMm, height: JEWELRY_DIECUT.sheetHeightMm },
  { label: '40 × 30 mm', width: 40, height: 30 },
  { label: '50 × 25 mm', width: 50, height: 25 },
];

export default function JewelleryLabelScreen() {
  const insets = useSafeAreaInsets();
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const defaults = useSettingsStore((s) => s.defaults);

  // Filter all jewelry templates from the Industry catalog
  const jewelryTemplates = useMemo(
    () => TEMPLATES.filter((t) => t.category.toLowerCase() === 'jewelry'),
    [],
  );

  const handleSelectTemplate = (tpl: TemplateItem) => {
    if (tpl.previewType === JEWELRY_DIECUT_PREVIEW_SINGLE) {
      // 3-Up UPS document with 3 tabs
      const seedElements = buildJewelryTemplateElements(tpl.previewType, DEFAULT_TAG_W, DEFAULT_TAG_H);
      const ups = createUpsConfig({
        columns: UPS_COLUMNS,
        columnSpacingMm: UPS_GAP,
        batchEdit: false,
        seedElements,
      });
      const doc = createLabelDocument({
        name: tpl.nameLine2 ? `${tpl.name} ${tpl.nameLine2}` : tpl.name,
        widthMm: DEFAULT_TAG_W,
        heightMm: DEFAULT_TAG_H,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: ups.panels[0] ?? seedElements,
        background: { type: 'color', color: '#FFFFFF' },
      });
      doc.ups = ups;
      doc.templatePreviewType = JEWELRY_DIECUT_PREVIEW_SINGLE;
      doc.templateCategory = 'jewelry';
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    // Direct template creation
    const doc = createIndustryTemplateDocument({
      name: tpl.nameLine2 ? `${tpl.name} ${tpl.nameLine2}` : tpl.name,
      category: tpl.category,
      widthMm: tpl.width,
      heightMm: tpl.height,
      previewType: tpl.previewType,
    });
    upsertDocument(doc);
    router.replace({ pathname: '/edit', params: { labelId: doc.id } });
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // Direct to dedicated sizing page with single-canvas mode
    router.replace({
      pathname: '/new-label-setup',
      params: {
        importImageUri: asset.uri,
        importImageWidth: String(asset.width || 0),
        importImageHeight: String(asset.height || 0),
        defaultWidth: String(DEFAULT_TAG_W),
        defaultHeight: String(DEFAULT_TAG_H),
        isSingleCanvas: 'true',
        isJewelleryTag: 'true',
      },
    });
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
        <Text style={styles.title}>Jewellery Label</Text>
        <Text style={styles.subtitle}>
          Select a pre-built jewellery template or import an image
        </Text>

        {/* Option 1: Existing Templates & Labels */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionBadge, { backgroundColor: '#3B82F6' }]}>
            <Text style={styles.sectionBadgeText}>1</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Existing Templates & Labels</Text>
            <Text style={styles.sectionSubtitle}>
              {jewelryTemplates.length} jewellery tags, sheets & dumbells
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.templateScroll}
          contentContainerStyle={styles.templateScrollContent}
        >
          {jewelryTemplates.map((tpl) => (
            <Pressable
              key={tpl.id}
              onPress={() => handleSelectTemplate(tpl)}
              style={({ pressed }) => [styles.templateCard, pressed && styles.pressed]}
            >
              <View style={styles.templatePreview}>
                <LabelPreview
                  document={createIndustryTemplateDocument({
                    name: tpl.name,
                    category: tpl.category,
                    widthMm: tpl.width,
                    heightMm: tpl.height,
                    previewType: tpl.previewType,
                  })}
                  width={84}
                  maxHeight={115}
                />
              </View>
              <Text numberOfLines={2} style={styles.templateName}>
                {tpl.name}
              </Text>
              <Text style={styles.templateDim}>{tpl.dimensions} mm</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Option 2: Import Image */}
        <View style={[styles.sectionHeader, { marginTop: 4 }]}>
          <View style={[styles.sectionBadge, { backgroundColor: '#8B5CF6' }]}>
            <Text style={styles.sectionBadgeText}>2</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Import Image</Text>
            <Text style={styles.sectionSubtitle}>
              Upload a photo with custom sizing for single-canvas editing
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handlePickImage}
          style={({ pressed }) => [styles.importButton, pressed && styles.pressed]}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#8B5CF6' }]}>
            <AppIcon name="photo" tintColor="#FFFFFF" size={24} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Choose Image from Gallery</Text>
            <Text style={styles.optionDetail}>
              Pick, crop & set label size before editing on a single canvas
            </Text>
          </View>
          <AppIcon name="chevron.right" tintColor="#94A3B8" size={18} />
        </Pressable>

        {/* Cancel Button */}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    marginHorizontal: 10,
    backgroundColor: Palette.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 16,
    maxHeight: '90%',
    gap: 10,
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: Palette.ink,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 12.5,
    color: Palette.muted,
    marginBottom: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  sectionBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.ink,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    color: Palette.muted,
  },
  templateScroll: {
    maxHeight: 180,
  },
  templateScrollContent: {
    gap: 10,
    paddingVertical: 4,
    paddingRight: 6,
  },
  templateCard: {
    width: 92,
    alignItems: 'center',
    gap: 4,
  },
  templatePreview: {
    width: 88,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  templateName: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.ink,
    textAlign: 'center',
    lineHeight: 14,
  },
  templateDim: {
    fontSize: 10,
    color: Palette.muted,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontSize: 14.5, fontWeight: '600', color: Palette.ink },
  optionDetail: { fontSize: 11.5, color: Palette.muted },
  cancel: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  pressed: { opacity: 0.7 },

  // Sizing Setup Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sizingModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalThumbWrap: {
    height: 90,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalThumb: {
    width: '100%',
    height: '100%',
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  presetText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
  },
  presetTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dimRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dimCol: {
    flex: 1,
    gap: 4,
  },
  inputStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  stepBtn: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
  },
  dimInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    height: 38,
    padding: 0,
  },
  fitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fitChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  fitText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  fitTextActive: {
    color: '#FFFFFF',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalConfirmBtn: {
    backgroundColor: ACCENT,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
