import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { LabelPreview } from '@/components/label-preview';
import { PrintSizeSelector } from '@/components/print-size-selector';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette, Type } from '@/constants/ui';
import { dataPageCount, resolveDocumentData } from '@/lib/data-binding';
import {
  composeUpsDocument,
  createLabelDocument,
  generateId,
  mmToPt,
  type LabelDocument,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import {
  PRINT_CAPTURE_OPTIONS,
  encodeConnectedPrinterJob,
  formatPrintFailure,
  orientedPrintSize,
  printCaptureLayout,
  printCaptureOptionsForSize,
  printJobSizeError,
  rasterizePngForPrint,
  sendIsolatedPrintCopies,
  tryNativeSdkPngPrint,
  waitForNextPaint,
} from '@/lib/printer/print-job';
import { getPrinterManager, PrintTimingLogger } from '@/lib/printer/printer-manager';
import { useDataStore, type ExcelSheet } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore, type PrintHistoryEntry } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

import { fitLabelSize, printMediaSizeMm, type LabelSizeMm } from '@/lib/label-geometry';
import { applyPrintSize, formatPrintSize, type PrintSizePreset } from '@/lib/print-sizes';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent', 'Black mark'] as const;

function buildScanDocument(
  scanType: string,
  scanData: string,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const isQr = /qr|aztec|datamatrix|pdf417/i.test(scanType);
  const elements: LabelDocument['elements'] = [];

  if (isQr) {
    const size = Math.min(widthMm, heightMm) * 0.62;
    elements.push({
      ...DEFAULT_QRCODE_STATE,
      id: generateId(),
      type: 'qrcode',
      content: scanData,
      left: (widthMm - size) / 2,
      top: heightMm * 0.06,
      width: size,
      height: size,
    });
    elements.push({
      ...DEFAULT_ELEMENT_STATE,
      id: generateId(),
      type: 'text',
      text: scanData,
      fontSize: mmToPt(heightMm * 0.1),
      align: 'center',
      left: widthMm * 0.05,
      top: heightMm * 0.74,
      width: widthMm * 0.9,
    });
  } else {
    elements.push({
      ...DEFAULT_BARCODE_STATE,
      id: generateId(),
      type: 'barcode',
      content: scanData,
      left: widthMm * 0.05,
      top: heightMm * 0.2,
      width: widthMm * 0.9,
      height: heightMm * 0.55,
    });
  }

  return createLabelDocument({
    name: 'Scanned Code',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function buildPhotoDocument(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  mode: string | undefined,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const framed = mode === 'frame';
  const pad = framed ? Math.max(1.5, widthMm * 0.06) : 0;
  const boxW = widthMm - pad * 2;
  const boxH = heightMm - pad * 2;
  const ratio = imageWidth > 0 && imageHeight > 0 ? imageHeight / imageWidth : 1;

  // Contain-fit the photo inside the label box.
  let w = boxW;
  let h = boxW * ratio;
  if (h > boxH) {
    h = boxH;
    w = boxH / ratio;
  }

  const elements: LabelDocument['elements'] = [
    {
      id: generateId(),
      type: 'image',
      uri: imageUri,
      rotation: 0,
      left: pad + (boxW - w) / 2,
      top: pad + (boxH - h) / 2,
      width: w,
      height: h,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
    },
  ];

  return createLabelDocument({
    name: framed ? 'Photo Frame' : 'Photo',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function buildExcelRowDocument(
  sheet: ExcelSheet,
  rowIndex: number,
  name: string,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const row = sheet.rows[rowIndex] ?? [];
  const count = Math.min(sheet.columns.length, 4);
  const lineH = heightMm / (count + 0.5);
  const elements: LabelDocument['elements'] = [];

  for (let i = 0; i < count; i++) {
    elements.push({
      ...DEFAULT_ELEMENT_STATE,
      id: generateId(),
      type: 'text',
      text: `${sheet.columns[i]}: ${row[i] ?? ''}`,
      fontSize: mmToPt(lineH * 0.5),
      left: widthMm * 0.05,
      top: lineH * (i + 0.25),
      width: widthMm * 0.9,
    });
  }

  return createLabelDocument({
    name,
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

function StepperRow({
  label,
  value,
  valueColor,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  bordered,
}: {
  label: string;
  value: string;
  valueColor?: string;
  onMinus?: () => void;
  onPlus?: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.stepperRow, bordered && styles.stepperRowBorder]}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stepperCircle,
            minusDisabled && styles.stepperCircleDisabled,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        <Pressable
          disabled={plusDisabled}
          onPress={onPlus}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stepperCircle,
            plusDisabled && styles.stepperCircleDisabled,
            pressed && !plusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, plusDisabled && styles.stepperSymbolDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PrintScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    labelId?: string;
    imageUri?: string;
    imageWidth?: string;
    imageHeight?: string;
    mode?: string;
    docName?: string;
    docUri?: string;
    docType?: string;
    excelFileId?: string;
    scanType?: string;
    scanData?: string;
  }>();

  const getDocument = useLabelStore((s) => s.getDocument);
  const defaults = useSettingsStore((s) => s.defaults);
  const printingSettings = useSettingsStore((s) => s.printing);
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const addHistoryEntry = usePrinterStore((s) => s.addHistoryEntry);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const activeExcelFileId = useDataStore((s) => s.activeExcelFileId);

  const [copies, setCopies] = useState(1);
  const [darkness, setDarkness] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>('0°');
  const [paperType, setPaperType] = useState<PaperType>(defaults.paperType);
  const [gapLength, setGapLength] = useState(3);
  const [hOffset, setHOffset] = useState(0);
  const [vOffset, setVOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
  const [printSize, setPrintSize] = useState<LabelSizeMm | null>(null);
  const [printPreset, setPrintPreset] = useState<PrintSizePreset | null>(null);
  const printingLockRef = useRef(false);
  const upsGapInitialized = useRef(false);

  const shotRef = useRef<ViewShot>(null);

  const excelSheet = useMemo<ExcelSheet | null>(() => {
    const fileId = params.excelFileId ?? activeExcelFileId;
    const file = excelFiles.find((f) => f.id === fileId) ?? null;
    return file ? file.sheets[file.activeSheetIndex] ?? file.sheets[0] ?? null : null;
  }, [params.excelFileId, activeExcelFileId, excelFiles]);

  /** Base document (page-independent). Null for PDF documents, which show a card. */
  const baseDocument = useMemo<LabelDocument | null>(() => {
    let doc: LabelDocument | null = null;
    if (params.labelId) doc = getDocument(params.labelId) ?? null;
    else if (params.scanData) {
      doc = buildScanDocument(
        params.scanType ?? '',
        params.scanData,
        defaults.labelWidth,
        defaults.labelHeight,
      );
    } else if (params.imageUri) {
      doc = buildPhotoDocument(
        params.imageUri,
        Number(params.imageWidth) || 0,
        Number(params.imageHeight) || 0,
        params.mode,
        defaults.labelWidth,
        defaults.labelHeight,
      );
    }
    // N-up labels are edited panel-by-panel; flatten for preview/print.
    return doc?.ups ? composeUpsDocument(doc) : doc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.labelId,
    params.scanData,
    params.scanType,
    params.imageUri,
    params.imageWidth,
    params.imageHeight,
    params.mode,
    getDocument,
    defaults.labelWidth,
    defaults.labelHeight,
  ]);

  const isExcelJob = params.docType === 'Excel' && excelSheet !== null;
  const isPdfJob = params.docType === 'PDF';

  const pageCount = useMemo(() => {
    if (isExcelJob && excelSheet) return Math.max(1, excelSheet.rows.length);
    if (baseDocument && excelSheet && printingSettings.autoPages) {
      return dataPageCount(baseDocument, excelSheet);
    }
    return 1;
  }, [isExcelJob, excelSheet, baseDocument, printingSettings.autoPages]);

  const buildPageDocument = useCallback(
    (page: number): LabelDocument | null => {
      if (isExcelJob && excelSheet) {
        return buildExcelRowDocument(
          excelSheet,
          page,
          params.docName ?? 'Data Label',
          defaults.labelWidth,
          defaults.labelHeight,
        );
      }
      if (baseDocument && excelSheet && pageCount > 1) {
        return resolveDocumentData(baseDocument, excelSheet, page);
      }
      return baseDocument;
    },
    [isExcelJob, excelSheet, params.docName, defaults.labelWidth, defaults.labelHeight, baseDocument, pageCount],
  );

  const previewDocument = useMemo(
    () => buildPageDocument(Math.min(pageIndex, pageCount - 1)),
    [buildPageDocument, pageIndex, pageCount],
  );

  const displayDocument = useMemo(() => {
    if (!previewDocument || !printSize) return previewDocument;
    return applyPrintSize(previewDocument, printPreset, printSize);
  }, [previewDocument, printSize, printPreset]);

  /** Native printer-dot artboard for capture — true mm→dots (8-dot pad applied after). */
  const printCaptureSize = useMemo(() => {
    const doc = displayDocument ?? previewDocument;
    if (!doc) return { widthPx: 8, heightPx: 8 };
    return printCaptureLayout(doc.widthMm, doc.heightMm, getPrinterManager().getPrintDpi()).content;
  }, [displayDocument, previewDocument]);

  /** Live store ups config (compose strips it from the print document). */
  const upsSource = useMemo(() => {
    if (!params.labelId) return null;
    return getDocument(params.labelId)?.ups ?? null;
  }, [params.labelId, getDocument]);

  // Stick 2-up media: default feed gap to 2 mm (user can go negative for calibration).
  useEffect(() => {
    if (!upsSource || upsGapInitialized.current) return;
    upsGapInitialized.current = true;
    setGapLength(2);
  }, [upsSource]);

  useEffect(() => {
    if (!previewDocument || printSize) return;
    // Lock to integer media mm so SIZE / capture / preview stay in sync (4×6 → 102×152).
    const media = printMediaSizeMm(previewDocument.widthMm, previewDocument.heightMm);
    setPrintSize(media);
  }, [previewDocument, printSize]);

  // Keep print size locked to the composed strip for ups jobs (exact mm, no rescale).
  useEffect(() => {
    if (!upsSource || !previewDocument) return;
    setPrintSize({ widthMm: previewDocument.widthMm, heightMm: previewDocument.heightMm });
    setPrintPreset(null);
  }, [upsSource, previewDocument?.widthMm, previewDocument?.heightMm, previewDocument]);

  const connected = status === 'connected';
  const footerHeight = 72 + insets.bottom;

  // Bound the preview to 42 % of the screen height so tall documents
  // (A4 portrait, long receipts) never overflow the preview area.
  const maxPreviewHeight = Math.round(height * 0.42);
  const baseCardWidth = Math.min(width - 48, MaxContentWidth - 48);
  const activeDoc = displayDocument ?? previewDocument;
  const { widthPx: cardWidth, heightPx: cardHeight } = fitLabelSize(
    activeDoc?.widthMm ?? 80,
    activeDoc?.heightMm ?? 44,
    Math.round(baseCardWidth * zoom),
    Math.round(maxPreviewHeight * zoom),
  );
  const previewAreaMinHeight = maxPreviewHeight + 56; // 28 px padding each side

  const historySource: PrintHistoryEntry['source'] = params.labelId
    ? 'label'
    : params.scanData
    ? 'scan'
    : params.imageUri
    ? 'photo'
    : isExcelJob
    ? 'excel'
    : isPdfJob
    ? 'pdf'
    : 'label';

  const jobName =
    previewDocument?.name ?? params.docName ?? (isPdfJob ? 'PDF Document' : 'Label');

  const handlePrint = useCallback(async () => {
    if (printingLockRef.current) return;
    // PDFs can't be rasterized for a thermal printer here; hand them to the OS
    // print dialog (AirPrint / Android print services) instead.
    if (isPdfJob && params.docUri) {
      try {
        const Print = await import('expo-print');
        await Print.printAsync({ uri: params.docUri });
        if (printingSettings.recordHistory) {
          addHistoryEntry({
            labelName: jobName,
            copies: 1,
            documentId: undefined,
            source: 'pdf',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        // User dismissing the dialog is not an error worth surfacing.
        if (!/cancel|dismiss/i.test(message)) {
          Alert.alert('Print Failed', message || 'Could not open the system print dialog.');
        }
      }
      return;
    }

    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Connect your TD-404 (Bluetooth or Wi‑Fi) before printing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    const widthMm = (displayDocument ?? previewDocument)?.widthMm ?? defaults.labelWidth;
    const heightMm = (displayDocument ?? previewDocument)?.heightMm ?? defaults.labelHeight;
    const orientationDeg = parseInt(orientation.replace('°', ''), 10) as LabelOrientation;
    const paper = orientedPrintSize(widthMm, heightMm, orientationDeg);
    const sizeError = printJobSizeError(paper.widthMm, paper.heightMm);
    if (sizeError) {
      Alert.alert('Unsupported Size', sizeError);
      return;
    }

    setPrinting(true);
    printingLockRef.current = true;
    const timer = new PrintTimingLogger();

    try {
      const dither = defaults.colorMode === 'Halftone';
      const threshold = Math.min(
        250,
        Math.max(10, defaults.grayThreshold + (darkness != null ? (darkness - 8) * 10 : 0)),
      );

      for (let page = 0; page < pageCount; page++) {
        const pageStart = Date.now();
        if (pageCount > 1) {
          setPageIndex(page);
          timer.start('pageWaitForPaint');
          await waitForNextPaint();
          timer.end('pageWaitForPaint');
        }

        // KEY OPTIMIZATION: Run connection verification IN PARALLEL with ViewShot capture.
        // When connection is healthy (common case), ensureConnected() returns in <1ms
        // while the expensive ViewShot capture runs concurrently.
        timer.start('capture+verify');
        const captureTarget = printCaptureLayout(widthMm, heightMm, manager.getPrintDpi()).content;
        const [connectionResult, base64] = await Promise.all([
          manager.ensureConnected().catch((err) => {
            // Let the error surface after capture is done.
            return { error: err };
          }),
          captureRef(shotRef, printCaptureOptionsForSize(
            captureTarget.widthPx,
            captureTarget.heightPx,
          )),
        ]);
        timer.end('capture+verify');

        // Check if connection verification failed.
        if (connectionResult && 'error' in connectionResult) {
          throw connectionResult.error;
        }

        const tCapture1 = Date.now();
        console.info('[print] ViewShot capture+verify:', tCapture1 - pageStart, 'ms |', Math.round((base64?.length ?? 0) / 1024), 'KB base64');
        if (!base64) {
          throw new Error('Could not capture the label for printing.');
        }

        const media =
          paperType === 'Receipt'
            ? 'continuous'
            : paperType === 'Black mark'
              ? 'bline'
              : 'gap';
        const wantsBline =
          media === 'bline' ||
          /black\s*mark/i.test(jobName) ||
          (displayDocument ?? previewDocument)?.elements.some(
            (el) =>
              (el.type === 'text' || el.type === 'degrees') &&
              /black\s*mark/i.test(
                'text' in el ? String(el.text) : 'content' in el ? String(el.content) : '',
              ),
          );

        // SDK fast path: native LabelCommand (same as Ninestar demo) — skips JS rasterize.
        timer.start('sdkFastPrint');
        const usedNative = await tryNativeSdkPngPrint({
          pngBase64: base64,
          widthMm: paper.widthMm,
          heightMm: paper.heightMm,
          gapMm: gapLength,
          copies,
          density: darkness,
          speed: speed ?? 6,
          vOffsetMm: vOffset,
          hOffsetMm: hOffset,
          media: wantsBline ? 'bline' : media,
          orientation: orientationDeg,
          dpi: manager.getPrintDpi(),
        });
        timer.end('sdkFastPrint');

        if (!usedNative) {
          timer.start('rasterize');
          const bits = rasterizePngForPrint(base64, {
            widthMm,
            heightMm,
            orientation: orientationDeg,
            threshold,
            dither,
            hOffsetMm: hOffset,
          });
          timer.end('rasterize');

          timer.start('encode');
          const bytes = encodeConnectedPrinterJob(bits, {
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: gapLength,
            copies: 1,
            density: darkness,
            speed: speed ?? 6,
            vOffsetMm: vOffset,
            hOffsetMm: hOffset,
            media: wantsBline ? 'bline' : media,
          });
          timer.end('encode');

          timer.start('transmit');
          await sendIsolatedPrintCopies(bytes, copies);
          timer.end('transmit');

          console.info(
            '[print] page', page + 1, 'total:', Date.now() - pageStart, 'ms |',
            'data:', bytes.length, 'bytes (JS path)',
          );
        } else {
          console.info(
            '[print] page', page + 1, 'total:', Date.now() - pageStart, 'ms | SDK LabelCommand path',
          );
        }
      }

      // Store timing for diagnostics screen.
      timer.dump('PRINT JOB');
      manager.setLastPrintTiming(timer.getEntries());

      if (printingSettings.recordHistory) {
        addHistoryEntry({
          labelName: jobName,
          copies: copies * pageCount,
          documentId: params.labelId,
          source: historySource,
        });
      }

      Alert.alert('Print Sent', `${jobName} was sent to ${deviceName ?? 'the printer'}.`);
      if (printingSettings.returnPrevious) router.back();
    } catch (error) {
      const message = formatPrintFailure(error);
      if (message) Alert.alert('Print Failed', message);
    } finally {
      printingLockRef.current = false;
      setPrinting(false);
    }
  }, [
    isPdfJob,
    params.docUri,
    previewDocument,
    displayDocument,
    defaults.labelWidth,
    defaults.labelHeight,
    defaults.colorMode,
    defaults.grayThreshold,
    orientation,
    darkness,
    speed,
    pageCount,
    hOffset,
    vOffset,
    gapLength,
    copies,
    paperType,
    printingSettings.recordHistory,
    printingSettings.returnPrevious,
    addHistoryEntry,
    jobName,
    params.labelId,
    historySource,
    deviceName,
  ]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/printer-connect')}
          style={({ pressed }) => [
            styles.connection,
            connected && styles.connectionConnected,
            pressed && styles.pressed,
          ]}>
          <Text numberOfLines={1} style={styles.connectionText}>
            {connected
              ? deviceName ?? 'Connected'
              : status === 'connecting'
              ? 'Connecting…'
              : 'Unconnected'}
          </Text>
          <AppIcon name="link" tintColor="#FFFFFF" size={14} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: footerHeight + Spacing.three }}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.previewArea, { minHeight: previewAreaMinHeight }]}>
          <View style={styles.previewShadow}>
            {(displayDocument ?? previewDocument) ? (
              <LabelPreview
                document={(displayDocument ?? previewDocument)!}
                width={cardWidth}
                maxHeight={cardHeight}
                showArtboardBorder={false}
              />
            ) : params.imageUri ? (
              <View style={[styles.previewCard, { width: cardWidth, height: cardHeight }]}>
                <Image
                  source={{ uri: params.imageUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View
                style={[styles.previewCard, styles.docPreviewCard, { width: cardWidth, height: cardHeight }]}>
                <View style={styles.docBadgeLarge}>
                  <Text style={styles.docBadgeLargeText}>{params.docType ?? 'PDF'}</Text>
                </View>
                <Text style={styles.docPreviewTitle} numberOfLines={2}>
                  {params.docName ?? 'Document'}
                </Text>
                <Text style={styles.docPreviewSub}>
                  {isPdfJob
                    ? 'Prints via the system print dialog'
                    : 'Document Ready for Print'}
                </Text>
              </View>
            )}
          </View>

          {/* Dedicated 1:1 Hardware Dot Print Artboard (captured at true printer DPI) */}
          {(displayDocument ?? previewDocument) ? (
            <View style={styles.printCaptureNative}>
              <ViewShot
                ref={shotRef}
                options={PRINT_CAPTURE_OPTIONS}
                style={{
                  width: printCaptureSize.widthPx,
                  height: printCaptureSize.heightPx,
                  backgroundColor: '#FFFFFF',
                }}>
                <LabelPreview
                  document={(displayDocument ?? previewDocument)!}
                  exactWidthPx={printCaptureSize.widthPx}
                  exactHeightPx={printCaptureSize.heightPx}
                  showArtboardBorder={false}
                />
              </ViewShot>
            </View>
          ) : null}

          {/* Actual print-size badge — shows the real mm / in dimensions that will be sent to the printer. */}
          {activeDoc ? (
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeBadgeText}>
                {formatPrintSize(activeDoc.widthMm, activeDoc.heightMm)}
              </Text>
            </View>
          ) : null}

          {pageCount > 1 ? (
            <View style={styles.pageNav}>
              <Pressable
                hitSlop={12}
                disabled={pageIndex <= 0}
                onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
                style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
                <AppIcon
                  name="chevron.left"
                  tintColor={pageIndex <= 0 ? '#7C848E' : '#FFFFFF'}
                  size={16}
                />
              </Pressable>
              <Text style={styles.pageNavText}>
                Row {pageIndex + 1} / {pageCount}
              </Text>
              <Pressable
                hitSlop={12}
                disabled={pageIndex >= pageCount - 1}
                onPress={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
                <AppIcon
                  name="chevron.right"
                  tintColor={pageIndex >= pageCount - 1 ? '#7C848E' : '#FFFFFF'}
                  size={16}
                />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.zoomControls}>
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable
              hitSlop={6}
              onPress={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.referenceNote}>Reference only. Depends on the actual print effect.</Text>

        <View style={styles.settingsWrap}>
          <View style={styles.settingsCard}>
            <StepperRow
              label="Number of Copies"
              value={String(copies)}
              valueColor={Palette.accent}
              minusDisabled={copies <= 1}
              onMinus={() => setCopies((n) => Math.max(1, n - 1))}
              onPlus={() => setCopies((n) => n + 1)}
            />
          </View>

          <View style={styles.settingsCard}>
            <StepperRow
              label="Print Darkness"
              value={darkness == null ? 'Auto' : String(darkness)}
              minusDisabled={darkness == null}
              plusDisabled={darkness != null && darkness >= 15}
              onMinus={() => setDarkness((d) => (d == null || d <= 1 ? null : d - 1))}
              onPlus={() => setDarkness((d) => (d == null ? 8 : Math.min(15, d + 1)))}
              bordered
            />
            <StepperRow
              label="Print Speed"
              value={speed == null ? 'Auto' : String(speed)}
              minusDisabled={speed == null}
              plusDisabled={speed != null && speed >= 5}
              onMinus={() => setSpeed((s) => (s == null || s <= 1 ? null : s - 1))}
              onPlus={() => setSpeed((s) => (s == null ? 3 : Math.min(5, s + 1)))}
            />
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.groupLabel}>Orientation</Text>
            <ChipGroup options={ORIENTATIONS} selected={orientation} onSelect={setOrientation} />

            <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>Paper Type</Text>
            <ChipGroup options={PAPER_TYPES} selected={paperType} onSelect={setPaperType} />

            <StepperRow
              label="Gap Length"
              value={`${gapLength.toFixed(2)} mm`}
              minusDisabled={gapLength <= -10}
              onMinus={() => setGapLength((v) => Math.max(-10, Math.round((v - 0.5) * 100) / 100))}
              onPlus={() => setGapLength((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
              bordered
            />
            <StepperRow
              label="Horizontal Offset"
              value={`${hOffset.toFixed(2)} mm`}
              minusDisabled={hOffset <= -10}
              onMinus={() => setHOffset((v) => Math.max(-10, Math.round((v - 0.5) * 100) / 100))}
              onPlus={() => setHOffset((v) => Math.min(10, Math.round((v + 0.5) * 100) / 100))}
              bordered
            />
            <StepperRow
              label="Vertical Offset"
              value={`${vOffset.toFixed(2)} mm`}
              minusDisabled={vOffset <= 0}
              onMinus={() => setVOffset((v) => Math.max(0, Math.round((v - 0.5) * 100) / 100))}
              onPlus={() => setVOffset((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          onPress={() => router.push('/printing-settings')}
          style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
          <AppIcon name="gearshape.fill" tintColor="#FFFFFF" size={24} />
        </Pressable>
        {/* Size picker — opens sheet to choose a different paper/label size. */}
        <Pressable
          disabled={printing || isPdfJob}
          onPress={() => setSizeSheetOpen(true)}
          style={({ pressed }) => [styles.sizeBtn, (pressed || isPdfJob) && styles.pressed]}>
          <AppIcon name="rectangle.dashed" tintColor="#FFFFFF" size={18} />
          <Text style={styles.sizeBtnText} numberOfLines={1}>
            {activeDoc
              ? `${Math.round(activeDoc.widthMm)}×${Math.round(activeDoc.heightMm)}mm`
              : 'Size'}
          </Text>
        </Pressable>
        {/* Print button — prints the active label at its selected/previewed dimensions */}
        <Pressable
          disabled={printing}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}
          onPress={() => {
            void handlePrint();
          }}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>Print</Text>
          )}
        </Pressable>
      </View>

      <PrintSizeSelector
        visible={sizeSheetOpen}
        initialWidthMm={previewDocument?.widthMm ?? defaults.labelWidth}
        initialHeightMm={previewDocument?.heightMm ?? defaults.labelHeight}
        onCancel={() => setSizeSheetOpen(false)}
        onSelect={(size, preset) => {
          const media = printMediaSizeMm(size.widthMm, size.heightMm);
          setPrintSize(media);
          setPrintPreset(preset);
          setSizeSheetOpen(false);
        }}
      />
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
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.danger,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    maxWidth: 220,
  },
  connectionConnected: {
    backgroundColor: '#2E9E63',
  },
  connectionText: {
    color: '#FFFFFF',
    ...Type.badge,
  },
  scroll: {
    flex: 1,
  },
  previewArea: {
    backgroundColor: '#AEB4BC',
    // minHeight is set inline from previewAreaMinHeight (dynamic).
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    position: 'relative',
  },
  previewShadow: {
    borderRadius: 6,
    // Subtle drop-shadow so the label lifts off the grey stage.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  sizeBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sizeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  printCapture: {
    backgroundColor: '#FFFFFF',
  },
  printCaptureNative: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: -999,
    opacity: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  previewCard: {
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  docPreviewCard: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docBadgeLarge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  docBadgeLargeText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
  docPreviewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  docPreviewSub: {
    fontSize: 12,
    color: '#64748B',
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    backgroundColor: '#525860',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pageNavText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  pageNavBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#525860',
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 24,
  },
  referenceNote: {
    textAlign: 'center',
    color: '#9AA3AD',
    ...Type.caption,
    paddingVertical: 14,
    backgroundColor: '#F4F5F7',
  },
  settingsWrap: {
    paddingHorizontal: 12,
    gap: 10,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  settingsCard: {
    backgroundColor: Palette.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  stepperRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEEF1',
  },
  stepperLabel: {
    ...Type.body,
    color: Palette.ink,
    flex: 1,
    paddingRight: 8,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: {
    borderColor: Palette.disabled,
  },
  stepperSymbol: {
    fontSize: 18,
    fontWeight: '400',
    color: Palette.accent,
    lineHeight: 20,
  },
  stepperSymbolDisabled: {
    color: Palette.disabled,
  },
  stepperValue: {
    ...Type.bodyMedium,
    color: Palette.ink,
    minWidth: 68,
    textAlign: 'center',
  },
  groupLabel: {
    ...Type.bodyMedium,
    color: Palette.ink,
    paddingTop: 14,
    paddingBottom: 10,
  },
  groupLabelSpaced: {
    paddingTop: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECEEF1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipActive: {
    backgroundColor: Palette.accent,
  },
  chipText: {
    ...Type.chip,
    color: '#7A8490',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    backgroundColor: '#F4F5F7',
  },
  gearBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#5CB85C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#525860',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 6,
  },
  sizeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  printBtn: {
    flex: 1,
    height: 52,
    backgroundColor: Palette.accent,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: {
    color: '#FFFFFF',
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
});
