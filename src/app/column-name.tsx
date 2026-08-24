import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editorBridge } from '@/constants/editor-bridge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { useDataStore } from '@/stores/data-store';

const SAMPLE_COLUMNS = ['Name', 'Price', 'SKU', 'Barcode', 'Quantity', 'Date'];

export default function ColumnNameScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ value?: string }>();
  const [draft, setDraft] = useState(params.value ?? '');

  const excelFiles = useDataStore((s) => s.excelFiles);
  const activeExcelFileId = useDataStore((s) => s.activeExcelFileId);
  const activeFile = excelFiles.find((f) => f.id === activeExcelFileId) ?? excelFiles[0] ?? null;
  const activeSheet = activeFile
    ? activeFile.sheets[activeFile.activeSheetIndex] ?? activeFile.sheets[0]
    : null;
  const columns = activeSheet && activeSheet.columns.length > 0 ? activeSheet.columns : SAMPLE_COLUMNS;

  const appendColumn = (column: string) => {
    setDraft((prev) => (prev ? `${prev}${column}` : column));
  };

  const handleConfirm = () => {
    editorBridge.columnNameResult = draft;
    router.back();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Text style={styles.title}>Column Name</Text>
        <Pressable
          onPress={handleConfirm}
          hitSlop={8}
          style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + Spacing.four }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inputBox}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            style={styles.input}
            placeholder=""
            placeholderTextColor="#A0AEC0"
          />
        </View>

        <Text style={styles.helpText}>
          You can select one or more column names from the list below and manually fill in fixed
          content to achieve the advanced effect of combining multiple keywords.
        </Text>

        {activeFile ? (
          <Text style={styles.sourceText}>
            Data source: {activeFile.name}
            {activeSheet ? ` · ${activeSheet.name}` : ''}
          </Text>
        ) : (
          <Text style={styles.sourceText}>
            No Excel file imported — showing sample columns. Import one from the Excel tool.
          </Text>
        )}

        <View style={styles.columnList}>
          {columns.map((item) => (
            <Pressable
              key={item}
              onPress={() => appendColumn(item)}
              style={({ pressed }) => [styles.columnRow, pressed && styles.pressed]}>
              <Text style={styles.columnText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EEF1F5',
  },
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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  confirmBtn: {
    minWidth: 72,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  bodyContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  inputBox: {
    minHeight: 120,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#2C3E50',
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#8A97A4',
    textAlign: 'center',
  },
  sourceText: {
    fontSize: 12.5,
    color: Palette.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
  columnList: {
    marginTop: Spacing.one,
  },
  columnRow: {
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8DEE6',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  columnText: {
    fontSize: 15,
    color: '#2C3E50',
  },
  pressed: {
    opacity: 0.65,
  },
});
