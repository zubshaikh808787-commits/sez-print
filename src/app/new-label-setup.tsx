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
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { useTranslation } from '@/lib/i18n';
import { clampLabelMm, validateLabelSize } from '@/lib/label-geometry';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

function previewTypeForColumns(columns: number): string {
  if (columns >= 4) return 'four-ups-20x15';
  if (columns === 3) return 'three-ups-30x20';
  if (columns === 2) return 'two-ups-30x20';
  return '';
}

export default function NewLabelSetupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    isClone?: string;
    cloneFromId?: string;
    cloneName?: string;
    cloneWidth?: string;
    cloneHeight?: string;
    focusSize?: string;
  }>();
  const isClone = params.isClone === 'true';
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const [labelName, setLabelName] = useState(
    isClone ? `${params.cloneName ?? 'Label'} Copy` : 'Default label',
  );
  const [labelWidth, setLabelWidth] = useState(
    isClone && params.cloneWidth ? parseFloat(params.cloneWidth) : 57,
  );
  const [labelHeight, setLabelHeight] = useState(
    isClone && params.cloneHeight ? parseFloat(params.cloneHeight) : 30,
  );
  const [columns, setColumns] = useState(1);
  const [columnSpacing, setColumnSpacing] = useState(1);
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

    if (columns > 1) {
      const previewType = previewTypeForColumns(columns);
      const doc = createIndustryTemplateDocument({
        name: labelName,
        category: 'Multi-UP',
        widthMm: size.widthMm * columns + columnSpacing * Math.max(0, columns - 1),
        heightMm: size.heightMm,
        previewType,
      });
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
        ...(isClone && params.cloneFromId ? { cloneFromId: params.cloneFromId } : {}),
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
        <Text style={styles.headerTitle}>{isClone ? 'Label Clone' : t('editor.newLabel')}</Text>
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
                    marginRight: i < columns - 1 ? Math.max(4, columnSpacing * 4) : 0,
                    aspectRatio: labelWidth / Math.max(labelHeight, 1),
                  },
                ]}
              />
            ))}
          </View>
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
          <Text style={styles.fieldLabel}>Set label size</Text>
          <View style={styles.fieldValueWrap}>
            <Text style={styles.fieldValueText}>
              {labelWidth}×{labelHeight} mm
            </Text>
            <Text style={styles.chevronRight}>›</Text>
          </View>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('editor.columns')}</Text>
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

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('editor.columnSpacing')}</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setColumnSpacing((s) => Math.max(0, Math.round((s - 0.5) * 10) / 10))}
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

        <View style={styles.card}>
          <View style={styles.batchRow}>
            <Text style={styles.fieldLabel}>{t('editor.batchEdit')}</Text>
            <Pressable
              hitSlop={8}
              onPress={() =>
                Alert.alert(
                  t('editor.batchEdit'),
                  'When enabled, edits apply across all columns of a multi-up label.',
                )
              }>
              <Text style={styles.infoHint}>?</Text>
            </Pressable>
          </View>
          <Switch
            value={batchEdit}
            onValueChange={setBatchEdit}
            trackColor={{ false: '#D1D5DB', true: Palette.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          onPress={handleCreateLabel}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          <Text style={styles.newButtonText}>New</Text>
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
