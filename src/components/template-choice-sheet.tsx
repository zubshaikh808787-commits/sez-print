import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { Palette } from '@/constants/ui';
import type { LabelDocument } from '@/lib/label-document';
import { mergeSavedTemplates, useLabelStore } from '@/stores/label-store';

type TemplateChoiceSheetProps = {
  title: string;
  subtitle: string;
  createDetail: string;
  onCreate: () => void;
  /** When set, Select Existing shows these documents instead of saved user templates. */
  existingDocuments?: LabelDocument[];
  onSelectExisting?: (doc: LabelDocument) => void;
};

export function TemplateChoiceSheet({
  title,
  subtitle,
  createDetail,
  onCreate,
  existingDocuments,
  onSelectExisting,
}: TemplateChoiceSheetProps) {
  const insets = useSafeAreaInsets();
  const documents = useLabelStore((s) => s.documents);
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const ensureLocalDocument = useLabelStore((s) => s.ensureLocalDocument);
  const [mode, setMode] = useState<'choose' | 'existing'>('choose');

  const saved = useMemo(
    () => mergeSavedTemplates(documents, cloudTemplates),
    [documents, cloudTemplates],
  );
  const templates = existingDocuments ?? saved;

  const openEditor = (doc: LabelDocument) => {
    onSelectExisting?.(doc);
    const local = ensureLocalDocument(doc.id) ?? doc;
    router.replace({ pathname: '/edit', params: { labelId: local.id } });
  };

  const openPrint = (doc: LabelDocument) => {
    onSelectExisting?.(doc);
    const local = ensureLocalDocument(doc.id) ?? doc;
    router.replace({ pathname: '/print', params: { labelId: local.id } });
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
        {mode === 'choose' ? (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <Pressable
              onPress={onCreate}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={[styles.optionIcon, { backgroundColor: '#3B82F6' }]}>
                <AppIcon name="plus.rectangle" tintColor="#FFFFFF" size={26} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Create New Template</Text>
                <Text style={styles.optionDetail}>{createDetail}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setMode('existing')}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={[styles.optionIcon, { backgroundColor: '#17A6B8' }]}>
                <AppIcon name="square.grid.2x2" tintColor="#FFFFFF" size={24} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Select Existing Template</Text>
                <Text style={styles.optionDetail}>
                  {templates.length} saved {templates.length === 1 ? 'template' : 'templates'}
                </Text>
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.listHead}>
              <Pressable onPress={() => setMode('choose')} hitSlop={10}>
                <Text style={styles.backLink}>‹ Back</Text>
              </Pressable>
              <Text style={styles.title}>Saved templates</Text>
              <View style={{ width: 48 }} />
            </View>
            {templates.length === 0 ? (
              <Text style={styles.empty}>No saved templates yet. Create a new one first.</Text>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {templates.map((doc) => (
                  <View key={doc.id} style={styles.templateRow}>
                    <Pressable
                      onPress={() => openEditor(doc)}
                      style={({ pressed }) => [styles.templateMain, pressed && styles.pressed]}>
                      <View style={styles.thumb}>
                        <LabelPreview document={doc} width={72} maxHeight={48} />
                      </View>
                      <View style={styles.optionText}>
                        <Text numberOfLines={1} style={styles.optionTitle}>
                          {doc.name}
                        </Text>
                        <Text style={styles.optionDetail}>
                          {doc.widthMm.toFixed(0)} × {doc.heightMm.toFixed(0)} mm · {doc.paperType}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => openPrint(doc)}
                      style={({ pressed }) => [styles.printBtn, pressed && styles.pressed]}>
                      <AppIcon name="printer" tintColor={Palette.accent} size={20} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        )}
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
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
    maxHeight: '80%',
    gap: 10,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: Palette.ink,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    color: Palette.muted,
    marginBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F9FC',
    borderRadius: 14,
    padding: 12,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  optionDetail: { fontSize: 12, color: Palette.muted },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLink: { color: Palette.accent, fontSize: 15, fontWeight: '500', width: 48 },
  list: { maxHeight: 360 },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3E6EA',
  },
  templateMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    minWidth: 0,
  },
  printBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 76,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    color: Palette.muted,
    fontSize: 13,
    paddingVertical: 24,
  },
  cancel: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: { fontSize: 16, fontWeight: '500', color: '#007AFF' },
  pressed: { opacity: 0.7 },
});
