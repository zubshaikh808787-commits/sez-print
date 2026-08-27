import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, Type } from '@/constants/ui';
import { parseExcelFile } from '@/lib/excel';
import { useDataStore, type ImportedExcelFile } from '@/stores/data-store';

const TABS = ['All', 'Excel', 'PDF', 'CSV', 'Remote Data'] as const;

interface ImportedDataFile {
  id: string;
  name: string;
  type: 'Excel' | 'PDF' | 'CSV' | 'Other';
  size?: number;
  uri: string;
  importedAt: string;
  excel?: ImportedExcelFile;
}

function EmptyIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={styles.boxBack} />
      <View style={styles.boxFront} />
      <View style={styles.boxFlapLeft} />
      <View style={styles.boxFlapRight} />
      <View style={styles.plane}>
        <View style={styles.planeBody} />
        <View style={styles.planeWing} />
      </View>
      <View style={styles.trail}>
        <View style={[styles.trailDot, { opacity: 0.35 }]} />
        <View style={[styles.trailDot, { opacity: 0.55 }]} />
        <View style={[styles.trailDot, { opacity: 0.75 }]} />
      </View>
    </View>
  );
}

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'text/comma-separated-values',
  'public.spreadsheet',
  'public.composite-content',
];

function inferFileType(name: string): ImportedDataFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return 'Excel';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'csv') return 'CSV';
  return 'Other';
}

function ExcelSpreadsheetPreview({ file }: { file: ImportedExcelFile }) {
  const sheet = file.sheets[file.activeSheetIndex] ?? file.sheets[0];
  if (!sheet) return null;
  const previewColumns = sheet.columns.slice(0, 4);
  const previewRows = sheet.rows.slice(0, 3).map((row) => row.slice(0, 4));

  return (
    <View style={styles.excelPreview}>
      <View style={styles.excelToolbar}>
        <View style={styles.excelBadge}>
          <Text style={styles.excelBadgeText}>EXCEL</Text>
        </View>
        <Text style={styles.excelFileName} numberOfLines={1}>
          {sheet.name} · {sheet.rows.length} row{sheet.rows.length === 1 ? '' : 's'} ·{' '}
          {sheet.columns.length} col{sheet.columns.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.excelGrid}>
        <View style={styles.excelRow}>
          {previewColumns.map((cell, cellIndex) => (
            <View
              key={`h-${cellIndex}`}
              style={[
                styles.excelCell,
                styles.excelHeaderCell,
                cellIndex === previewColumns.length - 1 && styles.excelCellLast,
              ]}>
              <Text style={[styles.excelCellText, styles.excelHeaderCellText]} numberOfLines={1}>
                {cell}
              </Text>
            </View>
          ))}
        </View>
        {previewRows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.excelRow}>
            {previewColumns.map((_, cellIndex) => (
              <View
                key={`cell-${rowIndex}-${cellIndex}`}
                style={[
                  styles.excelCell,
                  cellIndex === previewColumns.length - 1 && styles.excelCellLast,
                ]}>
                <Text style={styles.excelCellText} numberOfLines={1}>
                  {row[cellIndex] ?? ''}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function DataFileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string | string[] }>();
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;
  const initialTab = (paramType as (typeof TABS)[number]) || 'Excel';
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(
    TABS.includes(initialTab) ? initialTab : 'Excel'
  );

  const excelFiles = useDataStore((s) => s.excelFiles);
  const pdfFiles = useDataStore((s) => s.pdfFiles);
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const addPdfFile = useDataStore((s) => s.addPdfFile);
  const removeExcelFile = useDataStore((s) => s.removeExcelFile);
  const removePdfFile = useDataStore((s) => s.removePdfFile);
  const remoteLinks = useDataStore((s) => s.remoteLinks);
  const addRemoteLink = useDataStore((s) => s.addRemoteLink);
  const removeRemoteLink = useDataStore((s) => s.removeRemoteLink);
  const setActiveExcelFile = useDataStore((s) => s.setActiveExcelFile);
  const [importing, setImporting] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const files = useMemo<ImportedDataFile[]>(() => {
    const excel: ImportedDataFile[] = excelFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel',
      uri: f.uri,
      importedAt: new Date(f.importedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      excel: f,
    }));
    const pdf: ImportedDataFile[] = pdfFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'PDF',
      size: f.sizeBytes,
      uri: f.uri,
      importedAt: new Date(f.importedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));
    return [...excel, ...pdf].sort((a, b) => (a.id < b.id ? 1 : -1));
  }, [excelFiles, pdfFiles]);

  const handleImportFile = async () => {
    if (importing) return;
    try {
      const mimeTypes =
        activeTab === 'Excel'
          ? EXCEL_MIME_TYPES
          : activeTab === 'PDF'
          ? ['application/pdf']
          : activeTab === 'CSV'
          ? ['text/csv', 'text/comma-separated-values']
          : ['*/*'];

      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const file = result.assets[0];
      const fileType = inferFileType(file.name);

      if (activeTab === 'Excel' && fileType !== 'Excel' && fileType !== 'CSV') {
        Alert.alert('Invalid File', 'Please choose an Excel workbook (.xlsx / .xls) or CSV file.');
        return;
      }

      if (activeTab === 'PDF' && fileType !== 'PDF') {
        Alert.alert('Invalid File', 'Please choose a PDF document.');
        return;
      }

      if (activeTab === 'CSV' && fileType !== 'CSV') {
        Alert.alert('Invalid File', 'Please choose a CSV file.');
        return;
      }

      if (fileType === 'PDF') {
        addPdfFile({ name: file.name, uri: file.uri, sizeBytes: file.size ?? 0 });
        Alert.alert('File Imported', `"${file.name}" was imported successfully.`);
        return;
      }

      setImporting(true);
      try {
        const sheets = await parseExcelFile(file.uri, file.name);
        if (sheets.length === 0) {
          Alert.alert('Empty File', 'No data rows were found in this file.');
          return;
        }
        const entry = addExcelFile({
          name: file.name,
          uri: file.uri,
          sheets,
          activeSheetIndex: 0,
        });
        const sheet = sheets[0];
        Alert.alert(
          'File Imported',
          `"${file.name}" parsed: ${sheet.rows.length} rows, ${sheet.columns.length} columns. It is now the active data source for data-bound labels.`,
          [
            { text: 'OK' },
            {
              text: 'Print',
              onPress: () =>
                router.push({
                  pathname: '/print',
                  params: { docName: file.name, docType: 'Excel', excelFileId: entry.id },
                }),
            },
          ],
        );
      } finally {
        setImporting(false);
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    }
  };

  const filteredFiles = files.filter((f) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Remote Data') return false;
    if (activeTab === 'Excel') return f.type === 'Excel' || f.type === 'CSV';
    return f.type === activeTab;
  });

  const handleCreateLink = () => {
    setLinkName('');
    setLinkUrl('');
    setShowLinkModal(true);
  };

  const confirmCreateLink = () => {
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name) {
      Alert.alert('Name Required', 'Enter a name for this data link.');
      return;
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid URL', 'Enter a valid http:// or https:// URL.');
      return;
    }
    addRemoteLink({ name, url });
    setShowLinkModal(false);
    Alert.alert('Link Saved', `"${name}" was added to Remote Data.`);
  };

  const openRemoteLink = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Unavailable', 'Could not open this link on your device.'),
    );
  };

  const handleFooterPress = () => {
    if (activeTab === 'Remote Data') {
      handleCreateLink();
      return;
    }
    handleImportFile();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <Text style={styles.headerTitle}>Data File</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => [styles.tabItem, active && styles.tabItemActive, pressed && styles.pressed]}>
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}>
                {tab}
              </Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorSpacer} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>
        {activeTab === 'Remote Data' ? (
          remoteLinks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyIllustration />
              <Text style={styles.emptyText}>No remote data links yet</Text>
              <Text style={styles.emptyHint}>
                Save a URL to a shared spreadsheet or CSV hosted online for quick access.
              </Text>
            </View>
          ) : (
            <FlatList
              data={remoteLinks}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.fileItemCard}>
                  <View style={[styles.badgeIcon, styles.badgeCsv]}>
                    <Text style={styles.badgeText}>URL</Text>
                  </View>
                  <Pressable
                    style={styles.fileDetails}
                    onPress={() => openRemoteLink(item.url)}>
                    <Text style={styles.fileTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.fileSub} numberOfLines={1}>
                      {item.url}
                    </Text>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    style={({ pressed }) => [pressed && styles.pressed]}
                    onPress={() =>
                      Alert.alert('Remove Link', `Remove "${item.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeRemoteLink(item.id),
                        },
                      ])
                    }>
                    <AppIcon name="trash" tintColor="#DC2626" size={18} />
                  </Pressable>
                </View>
              )}
            />
          )
        ) : filteredFiles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyIllustration />
            <Text style={styles.emptyText}>No data file was found</Text>
            {activeTab === 'Excel' ? (
              <Text style={styles.emptyHint}>
                Import an Excel workbook (.xlsx / .xls) to print labels — same flow as Print Excel
              </Text>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredFiles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.fileItemCard}>
                <View
                  style={[
                    styles.badgeIcon,
                    item.type === 'Excel'
                      ? styles.badgeExcel
                      : item.type === 'PDF'
                      ? styles.badgePdf
                      : styles.badgeCsv,
                  ]}>
                  <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
                </View>

                <View style={styles.fileDetails}>
                  <Text style={styles.fileTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileSub}>
                    {formatSize(item.size)} • {item.importedAt}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.actionPrintBtn, pressed && styles.pressed]}
                  onPress={() => {
                    if (item.excel) setActiveExcelFile(item.excel.id);
                    router.push({
                      pathname: '/print',
                      params: {
                        docName: item.name,
                        docUri: item.uri,
                        docType: item.excel ? 'Excel' : item.type,
                        excelFileId: item.excel?.id,
                      },
                    });
                  }}>
                  <Text style={styles.actionPrintText}>Print</Text>
                </Pressable>

                <Pressable
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                  onPress={() =>
                    Alert.alert('Remove File', `Remove "${item.name}" from the list?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          item.excel ? removeExcelFile(item.id) : removePdfFile(item.id),
                      },
                    ])
                  }>
                  <AppIcon name="trash" tintColor="#DC2626" size={18} />
                </Pressable>

                {item.excel ? <ExcelSpreadsheetPreview file={item.excel} /> : null}
              </View>
            )}
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={handleFooterPress}
          style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}>
          <Text style={styles.importBtnText}>
            {activeTab === 'Remote Data' ? 'Create Link' : 'Import File'}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Create Data Link</Text>
            <TextInput
              style={styles.modalInput}
              value={linkName}
              onChangeText={setLinkName}
              placeholder="Link name"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://example.com/data.csv"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="url"
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setShowLinkModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSaveBtn]} onPress={confirmCreateLink}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
  },
  headerSpacer: {
    width: 36,
  },
  tabBarScroll: {
    backgroundColor: Palette.header,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: 6,
    paddingBottom: 10,
    alignItems: 'flex-end',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 56,
  },
  tabItemActive: {},
  tabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12.5,
    fontWeight: '400',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tabIndicator: {
    marginTop: 8,
    width: '100%',
    minWidth: 28,
    maxWidth: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  tabIndicatorSpacer: {
    marginTop: 8,
    height: 3,
  },
  body: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  illustration: {
    width: 160,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxBack: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#B8DDF5',
    borderRadius: 4,
  },
  boxFront: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#9ECAE8',
    borderTopWidth: 2,
    borderTopColor: '#7FB8DC',
    borderRadius: 4,
  },
  boxFlapLeft: {
    position: 'absolute',
    bottom: 68,
    left: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '-24deg' }],
    borderTopLeftRadius: 3,
  },
  boxFlapRight: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '24deg' }],
    borderTopRightRadius: 3,
  },
  plane: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 34,
    height: 34,
    transform: [{ rotate: '-18deg' }],
  },
  planeBody: {
    position: 'absolute',
    top: 14,
    left: 0,
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  planeWing: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#8EC5E8',
  },
  trail: {
    position: 'absolute',
    top: 24,
    right: 52,
    flexDirection: 'row',
    gap: 5,
    transform: [{ rotate: '-18deg' }],
  },
  trailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  emptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyHint: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  excelPreview: {
    width: '100%',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#D7E3D9',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  excelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF7EE',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D7E3D9',
  },
  excelBadge: {
    backgroundColor: '#22C55E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  excelBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  excelFileName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#14532D',
  },
  excelGrid: {
    backgroundColor: '#FFFFFF',
  },
  excelRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  excelCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E2E8F0',
  },
  excelCellLast: {
    borderRightWidth: 0,
  },
  excelHeaderCell: {
    backgroundColor: '#F8FAFC',
  },
  excelCellText: {
    fontSize: 10,
    color: '#334155',
  },
  excelHeaderCellText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  fileItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeExcel: {
    backgroundColor: '#DCFCE7',
  },
  badgePdf: {
    backgroundColor: '#FEE2E2',
  },
  badgeCsv: {
    backgroundColor: '#E0F2FE',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  fileDetails: {
    flex: 1,
    minWidth: 0,
  },
  fileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  fileSub: {
    fontSize: 12,
    color: '#64748B',
  },
  actionPrintBtn: {
    backgroundColor: Palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  actionPrintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: Spacing.two,
    backgroundColor: '#F4F5F7',
  },
  importBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  importBtnText: {
    color: '#FFFFFF',
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSaveBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
