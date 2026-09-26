import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelSizeEditor } from '@/components/label-size-editor';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { pickExcelWorkbook } from '@/lib/excel-import';
import { clampLabelMm, validateLabelSize } from '@/lib/label-geometry';
import { useDataStore } from '@/stores/data-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Dashboard Print Excel: label size, then the file picker, then column mapping.
 */
export default function ExcelPrintScreen() {
  const insets = useSafeAreaInsets();
  const defaults = useSettingsStore((s) => s.defaults);
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const [widthMm, setWidthMm] = useState(defaults.labelWidth);
  const [heightMm, setHeightMm] = useState(defaults.labelHeight);
  const [picking, setPicking] = useState(false);

  const continueToFile = async () => {
    if (picking) return;
    const size = clampLabelMm(widthMm, heightMm);
    const error = validateLabelSize(size.widthMm, size.heightMm);
    if (error) {
      Alert.alert('Invalid size', error);
      return;
    }

    setPicking(true);
    try {
      const picked = await pickExcelWorkbook();
      if (!picked.ok) {
        if (picked.reason === 'cancelled') return;
        Alert.alert(
          picked.reason === 'invalid' ? 'Invalid File' : 'Empty File',
          picked.reason === 'invalid'
            ? 'Please choose an Excel workbook (.xlsx / .xls) or CSV file.'
            : 'No data rows were found in this file.',
        );
        return;
      }

      const entry = addExcelFile({
        name: picked.name,
        uri: picked.uri,
        sheets: picked.sheets,
        activeSheetIndex: 0,
      });
      router.replace({
        pathname: '/excel-bulk-setup',
        params: {
          excelFileId: entry.id,
          widthMm: String(size.widthMm),
          heightMm: String(size.heightMm),
        },
      });
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          disabled={picking}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Label size</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.lede}>
            Choose the label size. The Excel file opens next, then you map each column.
          </Text>
          <View style={styles.card}>
            <LabelSizeEditor
              widthMm={widthMm}
              heightMm={heightMm}
              onChange={(nextWidth, nextHeight) => {
                setWidthMm(nextWidth);
                setHeightMm(nextHeight);
              }}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
          <Pressable
            disabled={picking}
            onPress={() => void continueToFile()}
            style={({ pressed }) => [
              styles.continueBtn,
              picking && styles.continueBtnDisabled,
              pressed && !picking && styles.pressed,
            ]}>
            {picking ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSpacer: { width: 36 },
  body: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  lede: { fontSize: 14, lineHeight: 20, color: Palette.muted },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 10,
    padding: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    backgroundColor: Palette.screen,
  },
  continueBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: { opacity: 0.7 },
  continueText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
