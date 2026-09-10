import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelSizeEditor } from '@/components/label-size-editor';
import { CABLE_FLAG_DIECUT } from '@/constants/cable-flag-diecut';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { useTranslation } from '@/lib/i18n';
import {
    createLabelDocument,
    createUpsConfig,
    generateId,
    type LabelElement,
} from '@/lib/label-document';
import { clampLabelMm, validateLabelSize } from '@/lib/label-geometry';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Image } from 'expo-image';

const SETUP_PRESETS = [
  { label: '14 × 96 mm (Jewellery Tag)', width: JEWELRY_DIECUT.tagWidthMm, height: JEWELRY_DIECUT.tagHeightMm },
  { label: '54 × 96 mm (3-Up Sheet)', width: JEWELRY_DIECUT.sheetWidthMm, height: JEWELRY_DIECUT.sheetHeightMm },
  { label: '50 × 70 mm (Cable Flag)', width: CABLE_FLAG_DIECUT.tagWidthMm, height: CABLE_FLAG_DIECUT.tagHeightMm },
  { label: '100 × 70 mm (Cable Flag 2-Up)', width: CABLE_FLAG_DIECUT.sheetWidthMm, height: CABLE_FLAG_DIECUT.sheetHeightMm },
  { label: '50 × 30 mm (Retail)', width: 50, height: 30 },
  { label: '40 × 30 mm (Price Tag)', width: 40, height: 30 },
  { label: '57 × 30 mm (Receipt)', width: 57, height: 30 },
  { label: '50 × 50 mm (Square)', width: 50, height: 50 },
];

export default function NewLabelSetupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    isClone?: string;
    isTwoUps?: string;
    isJewellery3Up?: string;
    cloneFromId?: string;
    cloneName?: string;
    cloneWidth?: string;
    cloneHeight?: string;
    focusSize?: string;
    importImageUri?: string;
    importImageWidth?: string;
    importImageHeight?: string;
    defaultWidth?: string;
    defaultHeight?: string;
    isSingleCanvas?: string;
    isJewelleryTag?: string;
  }>();
  const isImportImage = Boolean(params.importImageUri);
  const isSingleCanvas = params.isSingleCanvas === 'true' || isImportImage;
  const isTwoUps = !isSingleCanvas && (params.isTwoUps === 'true' || params.isClone === 'true');
  const isJewellery3Up = !isSingleCanvas && params.isJewellery3Up === 'true';
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const [labelName, setLabelName] = useState(
    isImportImage
      ? params.isJewelleryTag === 'true'
        ? 'Jewellery Image Label'
        : 'Imported Image Label'
      : isJewellery3Up
        ? 'Jewellery Label'
        : isTwoUps
          ? params.cloneName
            ? `${params.cloneName} · 2ups`
            : '2ups label'
          : 'Default label',
  );
  const [labelWidth, setLabelWidth] = useState(
    params.defaultWidth
      ? parseFloat(params.defaultWidth)
      : isJewellery3Up
        ? JEWELRY_DIECUT.tagWidthMm
        : params.cloneWidth
          ? parseFloat(params.cloneWidth)
          : isImportImage
            ? JEWELRY_DIECUT.tagWidthMm
            : 57,
  );
  const [labelHeight, setLabelHeight] = useState(
    params.defaultHeight
      ? parseFloat(params.defaultHeight)
      : isJewellery3Up
        ? JEWELRY_DIECUT.tagHeightMm
        : params.cloneHeight
          ? parseFloat(params.cloneHeight)
          : isImportImage
            ? JEWELRY_DIECUT.tagHeightMm
            : 30,
  );
  const [columns, setColumns] = useState(
    isSingleCanvas ? 1 : isJewellery3Up ? JEWELRY_DIECUT.columns : isTwoUps ? 2 : 1,
  );
  // Stick 2-up: labels sit flush (0 mm). Jewellery 3-up: 3 mm gaps.
  const [columnSpacing, setColumnSpacing] = useState(isJewellery3Up ? JEWELRY_DIECUT.gapMm : isTwoUps ? 0 : 1);
  const [batchEdit, setBatchEdit] = useState(false);

  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [sizeModalVisible, setSizeModalVisible] = useState(params.focusSize === '1');
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    if (params.focusSize === '1') setSizeModalVisible(true);
  }, [params.focusSize]);

  const handleCreateLabel = () => {
    const size = clampLabelMm(labelWidth, labelHeight);
    const error = validateLabelSize(size.widthMm, size.heightMm);
    if (error) {
      Alert.alert('Invalid size', error);
      return;
    }

    if (params.importImageUri) {
      const imgId = generateId();
      const assetW = parseFloat(params.importImageWidth || '0') || 1;
      const assetH = parseFloat(params.importImageHeight || '0') || 1;
      const ratio = assetH / assetW;
      const maxBodyH = size.widthMm <= 15 ? JEWELRY_DIECUT.bodyHeightMm : size.heightMm - 2;
      const imgH = Math.min(Math.round(size.widthMm * ratio * 10) / 10, maxBodyH);

      const imgElement: LabelElement = {
        id: imgId,
        type: 'image',
        uri: params.importImageUri,
        rotation: 0,
        left: 0,
        top: 0,
        width: size.widthMm,
        height: Math.max(5, imgH),
        lockMovement: false,
        needPrinting: true,
        antiColor: false,
        contentFit: 'contain',
        aspectRatioLocked: true,
      };

      // SINGLE CANVAS: user edits on one clean permanent canvas
      const doc = createLabelDocument({
        name: labelName,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: [imgElement],
        background: { type: 'color', color: '#FFFFFF' },
      });
      if (params.isJewelleryTag === 'true' || size.widthMm <= 15) {
        doc.templateCategory = 'jewelry';
        doc.templatePreviewType = JEWELRY_DIECUT_PREVIEW_SINGLE;
      }
      upsertDocument(doc);
      router.replace({
        pathname: '/edit',
        params: {
          labelId: doc.id,
          selectedElementId: imgId,
          autoOpenPanel: 'true',
        },
      });
      return;
    }

    let seedElements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        seedElements = JSON.parse(JSON.stringify(source.elements)) as LabelElement[];
      }
    }

    if (columns > 1) {
      const ups = createUpsConfig({
        columns,
        columnSpacingMm: columnSpacing,
        batchEdit,
        seedElements,
      });
      const doc = createLabelDocument({
        name: labelName,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: ups.panels[0] ?? [],
        background: { type: 'color', color: '#FFFFFF' },
      });
      doc.ups = ups;
      doc.templateCategory = 'Multi-UP';
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    router.replace({
      pathname: '/edit',
      params: {
        labelName,
        labelWidth: String(size.widthMm),
        labelHeight: String(size.heightMm),
        orientation: `${defaults.orientation}°`,
        paperType: defaults.paperType,
        ...(params.cloneFromId ? { cloneFromId: params.cloneFromId } : {}),
      },
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {isImportImage ? 'Label Sizing Setup' : isTwoUps ? '2ups label' : t('editor.newLabel')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.previewPad}>
          <View style={styles.previewRow}>
            {Array.from({ length: Math.max(1, columns) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.previewCell,
                  {
                    marginRight: i < columns - 1 ? Math.max(0, columnSpacing * 4) : 0,
                    aspectRatio: isImportImage
                      ? Math.max(0.6, Math.min(2.2, labelWidth / Math.max(labelHeight, 1)))
                      : labelWidth / Math.max(labelHeight, 1),
                    minWidth: isImportImage ? 160 : undefined,
                    minHeight: isImportImage ? 110 : 48,
                  },
                ]}>
                {isImportImage && params.importImageUri ? (
                  <Image
                    source={{ uri: params.importImageUri }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="contain"
                  />
                ) : columns > 1 ? (
                  <Text style={styles.previewCellLabel}>{i + 1}</Text>
                ) : null}
              </View>
            ))}
          </View>
          {columns > 1 ? (
            <Text style={styles.previewHint}>
              Each panel is {labelWidth}×{labelHeight} mm — edit one at a time. Print strip ≈{' '}
              {Math.max(
                labelWidth,
                Math.round((labelWidth * columns + columnSpacing * (columns - 1)) * 10) / 10,
              )}
              ×{labelHeight} mm.
            </Text>
          ) : (
            <Text style={styles.previewHint}>
              Canvas: {labelWidth} × {labelHeight} mm (Single Canvas)
            </Text>
          )}
        </View>

        {/* Quick Size Presets */}
        <View style={styles.presetSection}>
          <Text style={styles.presetHeading}>Size Presets</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetScrollContent}>
            {SETUP_PRESETS.map((p) => {
              const active =
                Math.abs(labelWidth - p.width) < 0.1 && Math.abs(labelHeight - p.height) < 0.1;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => {
                    setLabelWidth(p.width);
                    setLabelHeight(p.height);
                  }}
                  style={[styles.presetChip, active && styles.presetChipActive]}>
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Pressable
          onPress={() => {
            setTempName(labelName);
            setNameModalVisible(true);
          }}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <Text style={styles.fieldLabel}>{t('editor.labelName')}</Text>
          <View style={styles.fieldValueWrap}>
            <Text style={styles.fieldValueText} numberOfLines={1}>
              {labelName}
            </Text>
            <Text style={styles.chevronRight}>›</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSizeModalVisible(true)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <Text style={styles.fieldLabel}>Custom Size (Width × Height)</Text>
          <View style={styles.fieldValueWrap}>
            <Text style={styles.fieldValueText}>
              {labelWidth} × {labelHeight} mm
              {columns > 1 ? ' (each)' : ''}
            </Text>
            <Text style={styles.chevronRight}>›</Text>
          </View>
        </Pressable>

        {!isSingleCanvas && (
          <>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>{columns > 1 ? 'Labels across' : t('editor.columns')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setColumns((c) => Math.max(1, c - 1))}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{columns}</Text>
                <Pressable
                  onPress={() => setColumns((c) => Math.min(4, c + 1))}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            {columns > 1 ? (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>{t('editor.columnSpacing')}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setColumnSpacing((s) => Math.max(-4, Math.round((s - 0.5) * 10) / 10))}
                    style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{columnSpacing}</Text>
                  <Pressable
                    onPress={() => setColumnSpacing((s) => Math.min(8, Math.round((s + 0.5) * 10) / 10))}
                    style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {columns > 1 ? (
              <View style={styles.card}>
                <View style={styles.batchRow}>
                  <Text style={styles.fieldLabel}>{t('editor.batchEdit')}</Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert(
                        t('editor.batchEdit'),
                        'When enabled, edits on one label are mirrored to every label in the series.',
                      )
                    }>
                    <Text style={styles.infoHint}>?</Text>
                  </Pressable>
                </View>
                <Switch
                  value={batchEdit}
                  onChange={() => setBatchEdit((b) => !b)}
                  trackColor={{ false: '#D1D5DB', true: Palette.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          onPress={handleCreateLabel}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          <Text style={styles.newButtonText}>
            {isImportImage ? 'Open in Editor' : 'New'}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>{t('editor.labelName')}</Text>
            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
              autoFocus
              placeholderTextColor="#94A3B8"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtn}
                onPress={() => setNameModalVisible(false)}>
                <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtn}
                onPress={() => {
                  if (tempName.trim()) setLabelName(tempName.trim());
                  setNameModalVisible(false);
                }}>
                <Text style={styles.modalOk}>{t('common.confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={sizeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSizeModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sizeModalScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}>
            <View style={styles.modalCard}>
              <Text style={styles.modalHeading}>Customize label size</Text>
              {sizeModalVisible ? (
                <LabelSizeEditor
                  widthMm={labelWidth}
                  heightMm={labelHeight}
                  onChange={(w, h) => {
                    setLabelWidth(w);
                    setLabelHeight(h);
                  }}
                />
              ) : null}
              <Pressable style={styles.modalBtn} onPress={() => setSizeModalVisible(false)}>
                <Text style={styles.modalOk}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
  previewPad: {
    backgroundColor: '#D5DCE4',
    borderRadius: 10,
    minHeight: 140,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewRow: { flexDirection: 'row', alignItems: 'stretch', maxWidth: '100%' },
  previewCell: {
    flex: 1,
    maxWidth: 120,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8D0D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCellLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  previewHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  presetSection: {
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  presetHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  presetScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: Palette.accent,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  presetChipTextActive: {
    color: Palette.accent,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardPressed: { opacity: 0.88 },
  fieldLabel: { color: Palette.ink, fontSize: 15, fontWeight: '500', flexShrink: 1 },
  fieldValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  fieldValueText: { color: '#64748B', fontSize: 14, fontWeight: '400', maxWidth: 160 },
  chevronRight: { color: '#94A3B8', fontSize: 22, fontWeight: '300' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: Palette.ink, fontWeight: '400', lineHeight: 22 },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '500', color: Palette.ink },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  infoHint: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#94A3B8',
    textAlign: 'center',
    fontSize: 11,
    color: '#64748B',
    overflow: 'hidden',
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Palette.screen,
  },
  newButton: {
    backgroundColor: Palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
  },
  sizeModalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  modalHeading: { fontSize: 16, fontWeight: '500', color: Palette.ink },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#F8FAFC',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 6 },
  modalBtn: { paddingVertical: 6 },
  modalCancel: { color: '#64748B', fontSize: 16, fontWeight: '500' },
  modalOk: { color: Palette.accent, fontSize: 16, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
