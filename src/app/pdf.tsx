import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { loadAndRenderPdf, printPdfToThermal, type RenderedPdfPage } from '@/lib/pdf-printer';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { useDataStore, type PdfFile } from '@/stores/data-store';
import { usePrinterStore } from '@/stores/printer-store';

/** 3D Box & Paper Plane Empty State Illustration matching Screenshot 1 */
function EmptyPdfIllustration() {
  return (
    <View style={styles.illustrationContainer}>
      {/* Paper Plane Flying */}
      <View style={styles.planeWrapper}>
        <View style={styles.planeWingTop} />
        <View style={styles.planeBody} />
        <View style={styles.planeWingBottom} />
      </View>

      {/* Flight Trail Dots */}
      <View style={styles.trailContainer}>
        <View style={[styles.trailDot, { opacity: 0.25, transform: [{ scale: 0.7 }] }]} />
        <View style={[styles.trailDot, { opacity: 0.45, transform: [{ scale: 0.85 }] }]} />
        <View style={[styles.trailDot, { opacity: 0.7 }]} />
      </View>

      {/* 3D Isometric Cardboard Box */}
      <View style={styles.boxWrapper}>
        {/* Soft shadow base */}
        <View style={styles.boxShadow} />

        {/* Left Side Wall */}
        <View style={styles.boxSideLeft} />

        {/* Right Side Wall */}
        <View style={styles.boxSideRight} />

        {/* Left Flap */}
        <View style={styles.boxFlapLeft} />

        {/* Right Flap */}
        <View style={styles.boxFlapRight} />

        {/* Inner Box Depths */}
        <View style={styles.boxInterior} />
      </View>
    </View>
  );
}

export default function PdfScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const pdfFiles = useDataStore((s) => s.pdfFiles);
  const addPdfFile = useDataStore((s) => s.addPdfFile);
  const removePdfFile = useDataStore((s) => s.removePdfFile);

  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const connected = status === 'connected';

  // Modal & Printing State
  const [selectedPdf, setSelectedPdf] = useState<{ name: string; uri: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderedPages, setRenderedPages] = useState<RenderedPdfPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [printScope, setPrintScope] = useState<'current' | 'all'>('all');
  const [copies, setCopies] = useState(1);
  const [darkness, setDarkness] = useState<number>(10);
  const [mediaType, setMediaType] = useState<'gap' | 'continuous'>('gap');
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number } | null>(null);

  const directPrintPdf = useCallback(
    async (doc: { name: string; uri: string }) => {
      setSelectedPdf(doc);
      setModalVisible(true);
      setRendering(true);
      setPrinting(true);
      setPrintProgress(null);
      try {
        const result = await loadAndRenderPdf(doc.uri);
        setRenderedPages(result.pages);
        setRendering(false);

        const manager = getPrinterManager();
        if (!manager.isConnected) {
          setPrinting(false);
          Alert.alert(
            'Printer Not Connected',
            'Please connect your thermal printer before printing.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Connect',
                onPress: () => {
                  setModalVisible(false);
                  router.push('/printer-connect');
                },
              },
            ],
          );
          return;
        }

        // Directly print to the connected thermal printer without dialogs!
        const printResult = await printPdfToThermal(result.pages, {
          pageSelection: 'all',
          copies,
          density: darkness,
          mediaType,
          docName: doc.name,
          onProgress: (current, total) => {
            setPrintProgress({ current, total });
          },
        });

        Alert.alert(
          'Print Successful',
          `Directly printed ${printResult.pagesPrinted} page${printResult.pagesPrinted > 1 ? 's' : ''} of "${doc.name}" to ${deviceName || 'thermal printer'}.`,
          [{ text: 'OK', onPress: () => setModalVisible(false) }],
        );
      } catch (err) {
        setRendering(false);
        setPrinting(false);
        const msg = formatPrintFailure(err);
        Alert.alert('Print Error', msg, [
          { text: 'OK', onPress: () => setModalVisible(false) },
        ]);
      } finally {
        setPrinting(false);
        setPrintProgress(null);
      }
    },
    [copies, darkness, mediaType, deviceName],
  );

  const openPdfPrintModal = useCallback(async (doc: { name: string; uri: string }) => {
    setSelectedPdf(doc);
    setModalVisible(true);
    setRendering(true);
    setCurrentPageIndex(0);
    setPrintScope('all');
    setRenderedPages([]);
    try {
      const result = await loadAndRenderPdf(doc.uri);
      setRenderedPages(result.pages);
      setRendering(false);
    } catch (err) {
      setRendering(false);
      const msg = err instanceof Error ? err.message : 'Failed to render PDF for printing.';
      Alert.alert('PDF Render Error', msg, [
        { text: 'OK', onPress: () => setModalVisible(false) },
      ]);
    }
  }, []);

  const handleImportPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        addPdfFile({ name: file.name, uri: file.uri, sizeBytes: file.size ?? 0 });

        const manager = getPrinterManager();
        if (manager.isConnected) {
          // DIRECT PRINT: Printer is connected, print immediately to the thermal printer!
          await directPrintPdf({ name: file.name, uri: file.uri });
        } else {
          // If printer is not connected yet, open modal with connection banner
          await openPdfPrintModal({ name: file.name, uri: file.uri });
        }
      }
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const handlePrintToThermal = async () => {
    if (printing || renderedPages.length === 0) return;
    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect your thermal printer (TD-404, Tez, Dev, Josh) before printing.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect',
            onPress: () => {
              setModalVisible(false);
              router.push('/printer-connect');
            },
          },
        ],
      );
      return;
    }

    setPrinting(true);
    setPrintProgress(null);

    try {
      const selection = printScope === 'current' ? currentPageIndex : 'all';
      const result = await printPdfToThermal(renderedPages, {
        pageSelection: selection,
        copies,
        density: darkness,
        mediaType,
        docName: selectedPdf?.name ?? 'PDF Document',
        onProgress: (current, total) => {
          setPrintProgress({ current, total });
        },
      });

      Alert.alert(
        'Print Successful',
        `Printed ${result.pagesPrinted} page${result.pagesPrinted > 1 ? 's' : ''} (${copies} cop${copies > 1 ? 'ies' : 'y'}) to ${deviceName || 'thermal printer'}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setModalVisible(false);
            },
          },
        ],
      );
    } catch (err) {
      const msg = formatPrintFailure(err);
      Alert.alert('Print Failed', msg);
    } finally {
      setPrinting(false);
      setPrintProgress(null);
    }
  };

  const handleDeleteFile = (id: string, name: string) => {
    Alert.alert('Delete File', `Are you sure you want to remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removePdfFile(id),
      },
    ]);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const currentPage = renderedPages[currentPageIndex] ?? null;
  const modalPreviewWidth = Math.min(screenWidth - 64, 320);
  const modalPreviewHeight =
    currentPage && currentPage.widthMm > 0
      ? Math.min(
          Math.round((modalPreviewWidth * currentPage.heightMm) / currentPage.widthMm),
          Math.round(screenHeight * 0.36),
        )
      : 220;

  return (
    <View style={styles.root}>
      {/* Top Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>

        <Text style={styles.headerTitle}>PDF</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content Area */}
      <View style={styles.body}>
        {pdfFiles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyPdfIllustration />
            <Text style={styles.emptyText}>No data file was found</Text>
          </View>
        ) : (
          <FlatList
            data={pdfFiles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.fileListContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.fileCard}>
                <View style={styles.pdfIconWrap}>
                  <Text style={styles.pdfIconText}>PDF</Text>
                </View>

                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {formatFileSize(item.sizeBytes)} •{' '}
                    {new Date(item.importedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={styles.fileActions}>
                  <Pressable
                    onPress={() => {
                      const manager = getPrinterManager();
                      if (manager.isConnected) {
                        directPrintPdf({ name: item.name, uri: item.uri });
                      } else {
                        openPdfPrintModal({ name: item.name, uri: item.uri });
                      }
                    }}
                    style={({ pressed }) => [styles.printActionBtn, pressed && styles.pressed]}>
                    <Text style={styles.printActionText}>Print</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openPdfPrintModal({ name: item.name, uri: item.uri })}
                    hitSlop={8}
                    style={({ pressed }) => [styles.previewActionBtn, pressed && styles.pressed]}>
                    <AppIcon name="eye" tintColor="#64748B" size={16} />
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeleteFile(item.id, item.name)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteActionBtn, pressed && styles.pressed]}>
                    <Text style={styles.deleteActionText}>✕</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom Import File Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={handleImportPdf}
          style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}>
          <Text style={styles.importBtnText}>Import File</Text>
        </Pressable>
      </View>

      {/* PDF Thermal Print In-Place Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!printing) setModalVisible(false);
        }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.two }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalPdfIcon}>
                  <Text style={styles.modalPdfIconText}>PDF</Text>
                </View>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {selectedPdf?.name ?? 'PDF Document'}
                  </Text>
                  <Text style={styles.modalSub}>
                    {renderedPages.length > 0
                      ? `${renderedPages.length} Page${renderedPages.length > 1 ? 's' : ''} Ready`
                      : rendering
                      ? 'Rendering pages…'
                      : 'Preparing document'}
                  </Text>
                </View>
              </View>

              <Pressable
                disabled={printing}
                onPress={() => setModalVisible(false)}
                hitSlop={12}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Printer Connection Status Banner */}
            <Pressable
              onPress={() => {
                if (!connected) {
                  setModalVisible(false);
                  router.push('/printer-connect');
                }
              }}
              style={[
                styles.printerStatusBanner,
                connected ? styles.printerBannerConnected : styles.printerBannerDisconnected,
              ]}>
              <View
                style={[
                  styles.statusIndicatorDot,
                  connected ? styles.dotConnected : styles.dotDisconnected,
                ]}
              />
              <Text style={styles.printerStatusText} numberOfLines={1}>
                {connected
                  ? `Thermal Printer: ${deviceName ?? 'Connected'}`
                  : 'Printer Disconnected — Tap to Connect'}
              </Text>
              <AppIcon
                name={connected ? 'checkmark' : 'chevron.right'}
                tintColor={connected ? '#10B981' : '#F59E0B'}
                size={16}
              />
            </Pressable>

            {/* Scrollable Preview & Settings */}
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}>
              {/* Preview Area */}
              <View style={styles.previewContainer}>
                {rendering ? (
                  <View style={styles.previewLoadingBox}>
                    <ActivityIndicator size="large" color="#17A6B8" />
                    <Text style={styles.previewLoadingText}>
                      Rendering PDF at printer resolution…
                    </Text>
                  </View>
                ) : currentPage ? (
                  <View style={styles.previewBox}>
                    <Image
                      source={{ uri: `data:image/png;base64,${currentPage.base64}` }}
                      style={{
                        width: modalPreviewWidth,
                        height: modalPreviewHeight,
                      }}
                      contentFit="contain"
                    />
                    <View style={styles.dimPill}>
                      <Text style={styles.dimPillText}>
                        {currentPage.widthMm.toFixed(0)} × {currentPage.heightMm.toFixed(0)} mm
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.previewLoadingBox}>
                    <Text style={styles.previewErrorText}>No pages available to display.</Text>
                  </View>
                )}
              </View>

              {/* Multi-page Navigation */}
              {renderedPages.length > 1 && (
                <View style={styles.pageNavRow}>
                  <Pressable
                    disabled={currentPageIndex <= 0 || printing}
                    onPress={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                    style={({ pressed }) => [
                      styles.pageStepBtn,
                      (currentPageIndex <= 0 || printing) && styles.btnDisabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.pageStepBtnText}>‹ Prev</Text>
                  </Pressable>

                  <Text style={styles.pageNavIndicator}>
                    Page {currentPageIndex + 1} of {renderedPages.length}
                  </Text>

                  <Pressable
                    disabled={currentPageIndex >= renderedPages.length - 1 || printing}
                    onPress={() =>
                      setCurrentPageIndex((p) => Math.min(renderedPages.length - 1, p + 1))
                    }
                    style={({ pressed }) => [
                      styles.pageStepBtn,
                      (currentPageIndex >= renderedPages.length - 1 || printing) &&
                        styles.btnDisabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.pageStepBtnText}>Next ›</Text>
                  </Pressable>
                </View>
              )}

              {/* Print Scope Selector (if multi-page) */}
              {renderedPages.length > 1 && (
                <View style={styles.scopeRow}>
                  <Pressable
                    disabled={printing}
                    onPress={() => setPrintScope('all')}
                    style={[styles.scopeChip, printScope === 'all' && styles.scopeChipActive]}>
                    <Text
                      style={[
                        styles.scopeChipText,
                        printScope === 'all' && styles.scopeChipTextActive,
                      ]}>
                      Print All ({renderedPages.length} pages)
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={printing}
                    onPress={() => setPrintScope('current')}
                    style={[
                      styles.scopeChip,
                      printScope === 'current' && styles.scopeChipActive,
                    ]}>
                    <Text
                      style={[
                        styles.scopeChipText,
                        printScope === 'current' && styles.scopeChipTextActive,
                      ]}>
                      Print Page {currentPageIndex + 1} Only
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Settings: Copies & Density */}
              <View style={styles.settingsCard}>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Copies</Text>
                  <View style={styles.stepperGroup}>
                    <Pressable
                      disabled={copies <= 1 || printing}
                      onPress={() => setCopies((c) => Math.max(1, c - 1))}
                      style={({ pressed }) => [
                        styles.stepperBtn,
                        copies <= 1 && styles.btnDisabled,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.stepperBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValText}>{copies}</Text>
                    <Pressable
                      disabled={printing}
                      onPress={() => setCopies((c) => Math.min(99, c + 1))}
                      style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}>
                      <Text style={styles.stepperBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.settingDivider} />

                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Print Darkness</Text>
                  <View style={styles.densityGroup}>
                    {[
                      { label: 'Normal', val: 10 },
                      { label: 'Dark', val: 12 },
                      { label: 'Very Dark', val: 14 },
                    ].map((opt) => (
                      <Pressable
                        key={opt.val}
                        disabled={printing}
                        onPress={() => setDarkness(opt.val)}
                        style={[
                          styles.densityChip,
                          darkness === opt.val && styles.densityChipActive,
                        ]}>
                        <Text
                          style={[
                            styles.densityChipText,
                            darkness === opt.val && styles.densityChipTextActive,
                          ]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Bottom Print CTA */}
            <View style={styles.modalFooter}>
              <Pressable
                disabled={printing || rendering || renderedPages.length === 0}
                onPress={handlePrintToThermal}
                style={({ pressed }) => [
                  styles.printCtaBtn,
                  (printing || rendering || renderedPages.length === 0) && styles.btnDisabled,
                  pressed && styles.pressed,
                ]}>
                {printing ? (
                  <View style={styles.ctaLoadingRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.printCtaText}>
                      {printProgress
                        ? `Printing ${printProgress.current} of ${printProgress.total}…`
                        : 'Sending to Thermal Printer…'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.ctaLoadingRow}>
                    <AppIcon name="printer.fill" tintColor="#FFFFFF" size={18} />
                    <Text style={styles.printCtaText}>
                      {printScope === 'all' && renderedPages.length > 1
                        ? `Print All ${renderedPages.length} Pages`
                        : `Print Page ${currentPageIndex + 1}`}
                    </Text>
                  </View>
                )}
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
    backgroundColor: '#EFF2F7',
  },
  header: {
    backgroundColor: '#214668',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two + 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: 24,
  },
  illustrationContainer: {
    width: 180,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Paper Airplane & Trail
  planeWrapper: {
    position: 'absolute',
    top: 14,
    right: 28,
    width: 26,
    height: 26,
    transform: [{ rotate: '-18deg' }],
  },
  planeWingTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 0,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#B0C9DE',
  },
  planeBody: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 4,
    backgroundColor: '#9CBAD2',
    borderRadius: 2,
  },
  planeWingBottom: {
    position: 'absolute',
    bottom: 2,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#CADCEB',
  },
  trailContainer: {
    position: 'absolute',
    top: 36,
    right: 64,
    flexDirection: 'row',
    gap: 6,
    transform: [{ rotate: '-22deg' }],
  },
  trailDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#A8C4DC',
  },
  // 3D Cardboard Box
  boxWrapper: {
    position: 'absolute',
    bottom: 20,
    width: 120,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxShadow: {
    position: 'absolute',
    bottom: -6,
    width: 110,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(180, 200, 220, 0.35)',
  },
  boxInterior: {
    position: 'absolute',
    top: 10,
    width: 80,
    height: 24,
    backgroundColor: '#95B8D5',
    transform: [{ rotate: '-5deg' }, { skewX: '-15deg' }],
    borderRadius: 2,
  },
  boxSideLeft: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    width: 50,
    height: 54,
    backgroundColor: '#B6D6EE',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 4,
    transform: [{ skewY: '14deg' }],
  },
  boxSideRight: {
    position: 'absolute',
    bottom: 0,
    right: 10,
    width: 54,
    height: 54,
    backgroundColor: '#CADFF1',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 4,
    transform: [{ skewY: '-14deg' }],
  },
  boxFlapLeft: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 44,
    height: 22,
    backgroundColor: '#D7E9F7',
    borderTopLeftRadius: 4,
    transform: [{ skewX: '-28deg' }, { rotate: '-12deg' }],
  },
  boxFlapRight: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 44,
    height: 22,
    backgroundColor: '#E2F0FA',
    borderTopRightRadius: 4,
    transform: [{ skewX: '28deg' }, { rotate: '12deg' }],
  },
  emptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  // File List
  fileListContainer: {
    padding: Spacing.three,
    gap: 12,
  },
  fileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfIconText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printActionBtn: {
    backgroundColor: '#17A6B8',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  printActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  previewActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#94A3B8',
    fontSize: 16,
  },
  // Bottom Footer
  footer: {
    paddingHorizontal: 28,
    paddingTop: Spacing.two,
  },
  importBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#17A6B8',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#17A6B8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },

  // Modal Overlay & Container
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 31, 51, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  modalPdfIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPdfIconText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },

  // Printer Status Banner
  printerStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  printerBannerConnected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  printerBannerDisconnected: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotConnected: {
    backgroundColor: '#10B981',
  },
  dotDisconnected: {
    backgroundColor: '#F59E0B',
  },
  printerStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },

  // Scroll Area
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingVertical: 8,
    gap: 12,
  },

  // Preview Box
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dimPill: {
    marginTop: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dimPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  previewLoadingBox: {
    height: 180,
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  previewLoadingText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  previewErrorText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },

  // Page Navigation Row
  pageNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
  },
  pageStepBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pageStepBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  pageNavIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },

  // Scope Selector
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scopeChipActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  scopeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  scopeChipTextActive: {
    color: '#0369A1',
    fontWeight: '700',
  },

  // Settings Card
  settingsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 19,
  },
  stepperValText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    minWidth: 20,
    textAlign: 'center',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  densityGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  densityChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  densityChipActive: {
    backgroundColor: '#17A6B8',
    borderColor: '#17A6B8',
  },
  densityChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  densityChipTextActive: {
    color: '#FFFFFF',
  },

  // Bottom Print CTA
  modalFooter: {
    paddingTop: 12,
  },
  printCtaBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#17A6B8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17A6B8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
