import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PixelRatio,
  Pressable,
  Switch,
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
import {
  JEWELRY_DIECUT,
  JEWELRY_DIECUT_PRINT_PRESET_2UP,
  JEWELRY_DIECUT_PRINT_PRESET_3UP,
  JEWELRY_DIECUT_PRINT_PRESET_SINGLE,
  extractJewelryFirstColumnDocument,
  isJewelryDieCutDocument,
} from '@/constants/jewelry-diecut';
import { SEZNIK_PRINTER_MODELS } from '@/constants/printer-models';
import { canonicalizeJewelryDieCutDocument } from '@/constants/jewelry-template-elements';
import { tsplDirectionForLabel } from '@/constants/shipping-template-elements';
import { resolvePrintQuality } from '@/lib/printer/print-quality';
import {
  CABLE_FLAG_DIECUT,
  CABLE_FLAG_PRINT_PRESET_SINGLE,
  cableFlagPrintDocument,
  isCableFlagDieCutDocument,
} from '@/constants/cable-flag-diecut';
import {
  RAT_TAIL_143_PRINT,
  isRatTail143Document,
  ratTail143PrintPaper,
  refitRatTail143Document,
} from '@/constants/rat-tail-143';
import { dataPageCount, resolveDocumentData } from '@/lib/data-binding';
import { projectBulkDocument, resolveBulkSheet } from '@/lib/bulk-labels';
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
  encodeConnectedPrinterJob,
  formatPrintFailure,
  orientedPrintSize,
  printCaptureLayout,
  printCaptureOptionsForSize,
  printJobSizeError,
  rasterizePngForPrint,
  rotatePngBase64,
  sendIsolatedPrintCopies,
  tryNativeSdkPngPrint,
  waitForNextPaint,
} from '@/lib/printer/print-job';
import { getPrinterManager, PrintTimingLogger } from '@/lib/printer/printer-manager';
import { createPrintSpec } from '@/lib/printer/print-spec';
import { joshEffectiveDpi } from '@/lib/printer/josh-print';
import { logPrintTrace } from '@/printing';
import { resolveGitSha } from '@/lib/build-identity';
import {
  assertHeadlessRasterDocument,
  canHeadlessRasterPrint,
  rasterizeDocumentToBitmapTimed,
} from '@/printing/raster/skia-rasterizer';
import { td404DocumentOffsetClipWarning } from '@/printing/raster/print-border';
import { rasterizeViewShotPngWithStampedBorders } from '@/printing/raster/stamp-viewshot-borders';
import {
  exportCanonicalBitmapIfDev,
  logBorderPrintDiagnostics,
} from '@/printing/raster/border-diagnostics';
import { printBorderCalibrationTest } from '@/lib/printer/border-calibration-print';
import { effectiveHOffsetMm, SIDE_LINER_MAX_MM, sideLinerShiftMm } from '@/lib/printer/side-liner';
import { ensurePrintTypefaces } from '@/printing/raster/print-typeface';
import { useDataStore, type ExcelSheet } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { resolvedPrintOffsets, usePrinterStore, type PrintHistoryEntry } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { resolveLabelSettings } from '@/lib/label-settings';
import { loadAndRenderPdf, printPdfToThermal, type RenderedPdfPage } from '@/lib/pdf-printer';

import { fitLabelSize, printMediaSizeMm, type LabelSizeMm } from '@/lib/label-geometry';
import {
  applyPrintSize,
  formatPrintSize,
  PRINT_SIZE_PRESETS,
  tileDocumentThreeUpDieCut54,
  tileDocumentTwoUpDieCut37,
  type PrintSizePreset,
} from '@/lib/print-sizes';

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
          hitSlop={10}
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
          hitSlop={10}
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
            hitSlop={8}
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
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const addHistoryEntry = usePrinterStore((s) => s.addHistoryEntry);
  const printerDeviceId = usePrinterStore((s) => s.deviceId ?? s.lastDeviceId);
  const printerSdkId = usePrinterStore((s) => s.sdkId);
  const printCalibration = usePrinterStore((s) => s.printCalibration);
  const setPrintCalibration = usePrinterStore((s) => s.setPrintCalibration);
  // A fixed print-head/media-guide offset is a per-unit hardware trait, not
  // something geometry math can solve — key by the physical device so a
  // calibrated offset survives switching label/template and reopening Print.
  const calibrationKey = printerDeviceId ?? printerSdkId ?? 'unknown';
  const savedCalibration = printCalibration[calibrationKey];
  const excelFiles = useDataStore((s) => s.excelFiles);
  const activeExcelFileId = useDataStore((s) => s.activeExcelFileId);

  const activeModelMeta = SEZNIK_PRINTER_MODELS[selectedModel] || SEZNIK_PRINTER_MODELS.td404;

  const excelSheet = useMemo<ExcelSheet | null>(() => {
    const fileId = params.excelFileId ?? activeExcelFileId;
    const file = excelFiles.find((f) => f.id === fileId) ?? null;
    return file ? file.sheets[file.activeSheetIndex] ?? file.sheets[0] ?? null : null;
  }, [params.excelFileId, activeExcelFileId, excelFiles]);

  /** Uncomposed store document — needed for jewellery 3-up detection (compose strips `ups`). */
  const sourceDocument = useMemo<LabelDocument | null>(() => {
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
    return doc;
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

  /** Base document (page-independent). Null for PDF documents, which show a card. */
  const jewelryDieCutJob = isJewelryDieCutDocument(sourceDocument);
  const cableFlagJob = isCableFlagDieCutDocument(sourceDocument);
  const ratTail143Job = isRatTail143Document(sourceDocument);
  const baseDocument = useMemo<LabelDocument | null>(() => {
    if (!sourceDocument) return null;
    // Jewellery 3-up: keep the 14 mm tag. Composing UPS first makes a 48 mm
    // strip with empty side panels, then print lands on the left of the sheet.
    // Cable pair is already the 50 × 73 mm canvas — do not compose/tile to 100 mm.
    if (jewelryDieCutJob || cableFlagJob || ratTail143Job) return sourceDocument;
    return sourceDocument.ups ? composeUpsDocument(sourceDocument) : sourceDocument;
  }, [sourceDocument, jewelryDieCutJob, cableFlagJob, ratTail143Job]);
  // Always use the connected printer's real DPI — a hardcoded 304 blurs 203 DPI
  // Josh/Dev/Tez heads (already fixed for jewelry; cable-flag/rat-tail-143 had the same bug).
  const jewelryJobDpi = null;
  const cableJobDpi = null;
  const ratTailJobDpi = null;

  const defaultPreset = useMemo<PrintSizePreset | null>(() => {
    if (cableFlagJob) {
      return PRINT_SIZE_PRESETS.find((p) => p.id === CABLE_FLAG_PRINT_PRESET_SINGLE) ?? null;
    }
    if (!jewelryDieCutJob) return null;
    return PRINT_SIZE_PRESETS.find((p) => p.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) ?? null;
  }, [cableFlagJob, jewelryDieCutJob]);

  const defaultPrintSize = useMemo<LabelSizeMm>(() => {
    if (!baseDocument) return { widthMm: defaults.labelWidth, heightMm: defaults.labelHeight };
    if (ratTail143Job) return ratTail143PrintPaper();
    if (cableFlagJob) {
      return { widthMm: CABLE_FLAG_DIECUT.widthMm, heightMm: CABLE_FLAG_DIECUT.heightMm };
    }
    if (defaultPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) {
      return { widthMm: JEWELRY_DIECUT.sheetWidthMm, heightMm: JEWELRY_DIECUT.sheetHeightMm };
    }
    return printMediaSizeMm(baseDocument.widthMm, baseDocument.heightMm);
  }, [baseDocument, defaultPreset, defaults.labelWidth, defaults.labelHeight, cableFlagJob, ratTail143Job]);

  const [copies, setCopies] = useState(1);
  const [darkness, setDarkness] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>('0°');
  const [paperType, setPaperType] = useState<PaperType>(defaults.paperType);
  const specialMediaJob = jewelryDieCutJob || cableFlagJob || ratTail143Job;
  const [gapLength, setGapLength] = useState(
    () => (!specialMediaJob ? resolvedPrintOffsets(savedCalibration).gapMm : null) ?? 3,
  );
  const [tearOn, setTearOn] = useState(true);
  const [hCorrection, setHCorrection] = useState(() => resolvedPrintOffsets(savedCalibration).hOffsetMm);
  const [vOffset, setVOffset] = useState(() => resolvedPrintOffsets(savedCalibration).vOffsetMm);
  const [sideLinerLeft, setSideLinerLeft] = useState(
    () => resolvedPrintOffsets(savedCalibration).sideLinerLeftMm,
  );
  const [sideLinerRight, setSideLinerRight] = useState(
    () => resolvedPrintOffsets(savedCalibration).sideLinerRightMm,
  );
  const hOffset = effectiveHOffsetMm(hCorrection, sideLinerLeft, sideLinerRight);

  // Re-sync when the connected printer changes (or persisted calibration
  // finishes loading from AsyncStorage after this screen already mounted).
  useEffect(() => {
    const resync = () => {
      const saved = usePrinterStore.getState().printCalibration[calibrationKey];
      const next = resolvedPrintOffsets(saved);
      setHCorrection(next.hOffsetMm);
      setVOffset(next.vOffsetMm);
      setSideLinerLeft(next.sideLinerLeftMm);
      setSideLinerRight(next.sideLinerRightMm);
      if (next.gapMm != null && !specialMediaJob) setGapLength(next.gapMm);
    };
    resync();
    return usePrinterStore.persist.onFinishHydration(resync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationKey]);

  const stepRollGap = (deltaMm: number) => {
    const next = Math.min(20, Math.max(0, Math.round((gapLength + deltaMm) * 100) / 100));
    setGapLength(next);
    if (calibrationKey !== 'unknown' && !specialMediaJob) {
      setPrintCalibration(calibrationKey, { gapMm: next });
    }
  };

  // Persist calibration per physical printer so a dialed-in offset survives
  // reopening Print — the controls used to always reset to 0mm, making a
  // real, fixed mechanical offset look like an unresolved random shift.
  useEffect(() => {
    if (calibrationKey === 'unknown' || !usePrinterStore.persist.hasHydrated()) return;
    setPrintCalibration(calibrationKey, {
      hOffsetMm: hCorrection,
      vOffsetMm: vOffset,
      sideLinerLeftMm: sideLinerLeft,
      sideLinerRightMm: sideLinerRight,
      gapMm: specialMediaJob ? undefined : gapLength,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hCorrection, vOffset, sideLinerLeft, sideLinerRight, gapLength, calibrationKey, specialMediaJob]);
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
  const [printSize, setPrintSize] = useState<LabelSizeMm>(defaultPrintSize);
  const [printPreset, setPrintPreset] = useState<PrintSizePreset | null>(defaultPreset);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const printingLockRef = useRef(false);
  const upsGapInitialized = useRef(false);
  const labelSettingsInitialized = useRef(false);

  useEffect(() => {
    if (!sourceDocument || labelSettingsInitialized.current) return;
    labelSettingsInitialized.current = true;
    const settings = resolveLabelSettings(sourceDocument);
    const rollGap = resolvedPrintOffsets(usePrinterStore.getState().printCalibration[calibrationKey]).gapMm;
    setGapLength(rollGap != null && !specialMediaJob ? rollGap : settings.gapLengthMm);
    setTearOn(settings.tearOn !== false);
    setDarkness(settings.printDarkness);
    setSpeed(settings.printSpeed);
    setOrientation(`${sourceDocument.orientation}°` as (typeof ORIENTATIONS)[number]);
    setPaperType(sourceDocument.paperType);
  }, [sourceDocument]);

  const shotRef = useRef<ViewShot>(null);

  const isExcelJob = params.docType === 'Excel' && excelSheet !== null;
  const isPdfJob = params.docType === 'PDF';

  const [pdfPages, setPdfPages] = useState<RenderedPdfPage[]>([]);
  const [pdfRendering, setPdfRendering] = useState(false);

  useEffect(() => {
    if (!isPdfJob || !params.docUri) return;
    let active = true;
    setPdfRendering(true);
    loadAndRenderPdf(params.docUri)
      .then((res) => {
        if (active) {
          setPdfPages(res.pages);
          setPdfRendering(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn('[print] Failed to render PDF:', err);
          setPdfRendering(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isPdfJob, params.docUri]);

  const pageCount = useMemo(() => {
    if (isPdfJob) return Math.max(1, pdfPages.length);
    if (baseDocument?.bulk) return Math.max(1, baseDocument.bulk.rowCount);
    if (isExcelJob && excelSheet) return Math.max(1, excelSheet.rows.length);
    if (baseDocument && excelSheet && printingSettings.autoPages) {
      return dataPageCount(baseDocument, excelSheet);
    }
    return 1;
  }, [isPdfJob, pdfPages.length, isExcelJob, excelSheet, baseDocument, printingSettings.autoPages]);

  const buildPageDocument = useCallback(
    (page: number): LabelDocument | null => {
      if (baseDocument?.bulk) {
        const sheet = resolveBulkSheet(excelFiles, baseDocument.bulk);
        if (sheet) return projectBulkDocument(baseDocument, sheet, page);
        return baseDocument;
      }
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
    [
      isExcelJob,
      excelSheet,
      excelFiles,
      params.docName,
      defaults.labelWidth,
      defaults.labelHeight,
      baseDocument,
      pageCount,
    ],
  );

  const previewDocument = useMemo(
    () => buildPageDocument(Math.min(pageIndex, pageCount - 1)),
    [buildPageDocument, pageIndex, pageCount],
  );

  const displayDocument = useMemo(() => {
    if (!previewDocument || !printSize) return previewDocument;
    if (ratTail143Job && previewDocument) {
      return refitRatTail143Document(previewDocument);
    }
    if (cableFlagJob && previewDocument) {
      return cableFlagPrintDocument(previewDocument);
    }
    if (jewelryDieCutJob && sourceDocument) {
      // Freeze author mm positions — no softFit/refit on the print path.
      const frozen = canonicalizeJewelryDieCutDocument(sourceDocument);
      if (printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) {
        return tileDocumentThreeUpDieCut54(frozen);
      }
      if (printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_2UP) {
        return tileDocumentTwoUpDieCut37(frozen);
      }
      // Single Label Tag: crop leftmost 14×96 column (not full sheet SIZE).
      return extractJewelryFirstColumnDocument(frozen);
    }
    return applyPrintSize(previewDocument, printPreset, printSize);
  }, [
    previewDocument,
    printSize,
    printPreset,
    jewelryDieCutJob,
    cableFlagJob,
    ratTail143Job,
    sourceDocument,
  ]);

  const jobDpi = (() => {
    const raw = jewelryJobDpi ?? cableJobDpi ?? ratTailJobDpi ?? getPrinterManager().getPrintDpi();
    return getPrinterManager().isJosh ? joshEffectiveDpi(raw) : raw;
  })();

  /** Printer-dot artboard. TD-404 captures packed BITMAP dots; others use SIZE dots. */
  const printCaptureSize = useMemo(() => {
    const doc = displayDocument ?? previewDocument;
    if (!doc) return { widthPx: 8, heightPx: 8 };
    const layout = printCaptureLayout(doc.widthMm, doc.heightMm, jobDpi);
    return printerSdkId === 'td404' ? layout.canvas : layout.content;
  }, [displayDocument, previewDocument, jobDpi, printerSdkId]);
  const printCaptureLayoutPx = useMemo(() => {
    const density = PixelRatio.get() || 1;
    return {
      widthPx: printCaptureSize.widthPx / density,
      heightPx: printCaptureSize.heightPx / density,
    };
  }, [printCaptureSize.widthPx, printCaptureSize.heightPx]);
  const printCaptureShotOptions = useMemo(
    () => printCaptureOptionsForSize(printCaptureSize.widthPx, printCaptureSize.heightPx),
    [printCaptureSize.widthPx, printCaptureSize.heightPx],
  );
  const captureLayoutPx = useRef<{ w: number; h: number } | null>(null);

  /** Live store ups config (compose strips it from the print document). */
  const upsSource = useMemo(() => {
    if (!params.labelId) return null;
    return getDocument(params.labelId)?.ups ?? null;
  }, [params.labelId, getDocument]);

  // Stick 2-up media: default feed gap to 2 mm. Jewellery 3-up keeps 3 mm.
  useEffect(() => {
    if (!upsSource || upsGapInitialized.current) return;
    if (upsSource.columns === JEWELRY_DIECUT.columns || specialMediaJob) return;
    upsGapInitialized.current = true;
    if (resolvedPrintOffsets(usePrinterStore.getState().printCalibration[calibrationKey]).gapMm != null) return;
    setGapLength(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsSource, specialMediaJob]);

  // Sync print size if a different document ID or dimension is loaded
  const lastDocKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!baseDocument) return;
    const docKey = `${baseDocument.id}_${baseDocument.widthMm}_${baseDocument.heightMm}`;
    if (docKey !== lastDocKeyRef.current) {
      lastDocKeyRef.current = docKey;
      setPrintPreset(defaultPreset);
      setPrintSize(defaultPrintSize);
      if (cableFlagJob) setOrientation('0°');
      if (ratTail143Job) setOrientation('90°');
    }
  }, [baseDocument, defaultPreset, defaultPrintSize, cableFlagJob, ratTail143Job]);

  // The Print preview renders the live vector document model via LabelPreview.
  // Hardware rasterization is executed on-demand during actual print dispatch.
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

  /** Roll media at job time — UI state is authoritative (not a stale closure). */
  const rollMediaNow = () => ({
    gapMm: gapLength,
    hCorrectionMm: hCorrection,
    vOffsetMm: vOffset,
    sideLinerLeftMm: sideLinerLeft,
    sideLinerRightMm: sideLinerRight,
    hOffsetMm: effectiveHOffsetMm(hCorrection, sideLinerLeft, sideLinerRight),
  });

  const printAlignmentTestSheet = useCallback(async () => {
    const page = displayDocument ?? previewDocument;
    if (!page || printingLockRef.current) return;
    const mgr = getPrinterManager();
    if (!mgr.isConnected) {
      Alert.alert('Printer not connected', 'Connect your TD-404 before printing an alignment sheet.');
      return;
    }
    if (!mgr.usesTd404CommandSet) {
      Alert.alert('Not supported', 'Alignment sheets are for TD-404 TSPL printers.');
      return;
    }
    printingLockRef.current = true;
    setPrinting(true);
    try {
      const roll = rollMediaNow();
      const spec = createPrintSpec({
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        dpi: jobDpi,
        profile: mgr.getActivePrinterProfile(),
        gapMm: roll.gapMm,
        calibration: { horizontalOffsetMm: roll.hOffsetMm, verticalOffsetMm: roll.vOffsetMm },
      });
      const { sent } = await printBorderCalibrationTest({
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        dpi: jobDpi,
        gapMm: roll.gapMm,
        hOffsetMm: roll.hOffsetMm,
        vOffsetMm: roll.vOffsetMm,
        direction: tsplDirectionForLabel(page, page.widthMm, page.heightMm),
        printerName: deviceName ?? 'unknown',
      });
      const monoTiming = mgr.getLastTd404MonoLabelTiming();
      const refLine =
        monoTiming?.reference ??
        `${spec.xOffsetDots},${spec.yOffsetDots}`;
      Alert.alert(
        sent ? 'Alignment sheet sent' : 'Not sent',
        sent
          ? `Sent to the printer with H ${roll.hOffsetMm.toFixed(2)} mm, V ${roll.vOffsetMm.toFixed(2)} mm (REFERENCE ${refLine}). Measure the 2 mm border against the die-cut edge — the preview above does not move when you change H/V.`
          : 'The printer did not accept the job.',
      );
    } catch (err) {
      Alert.alert('Alignment sheet failed', err instanceof Error ? err.message : String(err));
    } finally {
      printingLockRef.current = false;
      setPrinting(false);
    }
  }, [
    displayDocument,
    previewDocument,
    jobDpi,
    deviceName,
    hCorrection,
    vOffset,
    sideLinerLeft,
    sideLinerRight,
    gapLength,
  ]);

  const handlePrint = useCallback(async () => {
    if (printingLockRef.current) return;
    printingLockRef.current = true;
    const roll = rollMediaNow();
    const jobH = roll.hOffsetMm;
    const jobV = roll.vOffsetMm;
    const jobGap = roll.gapMm;
    if (isPdfJob) {
      const manager = getPrinterManager();
      if (!manager.isConnected) {
        printingLockRef.current = false;
        Alert.alert(
          'Printer Not Connected',
          'Connect your thermal printer (TD-404, Tez, Dev, Josh) before printing.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Connect', onPress: () => router.push('/printer-connect') },
          ],
        );
        return;
      }

      if (pdfPages.length === 0) {
        printingLockRef.current = false;
        Alert.alert('PDF Not Ready', 'Please wait for the PDF pages to finish rendering.');
        return;
      }

      setPrinting(true);
      try {
        const targetSelection = pageCount > 1 ? pageIndex : 'all';
        await printPdfToThermal(pdfPages, {
          pageSelection: targetSelection,
          copies,
          density: darkness ?? 10,
          speed: speed ?? 3,
          docName: jobName,
        });

        Alert.alert(
          'Print Sent',
          `${jobName} was sent to ${deviceName ?? 'the printer'}.`,
        );
        if (printingSettings.returnPrevious) router.back();
      } catch (error) {
        const message = formatPrintFailure(error);
        if (message) Alert.alert('Print Failed', message);
      } finally {
        printingLockRef.current = false;
        setPrinting(false);
      }
      return;
    }

    const manager = getPrinterManager();
    if (!manager.isConnected) {
      printingLockRef.current = false;
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
    const orientationDeg = (
      ratTail143Job ? RAT_TAIL_143_PRINT.captureOrientation : parseInt(orientation.replace('°', ''), 10)
    ) as LabelOrientation;
    const paper = ratTail143Job
      ? ratTail143PrintPaper()
      : orientedPrintSize(widthMm, heightMm, orientationDeg);
    const sizeError = printJobSizeError(paper.widthMm, paper.heightMm);
    if (sizeError) {
      printingLockRef.current = false;
      Alert.alert('Unsupported Size', sizeError);
      return;
    }

    const clipDoc = displayDocument ?? previewDocument;
    if (manager.usesTd404CommandSet && clipDoc) {
      const clipNote = td404DocumentOffsetClipWarning(clipDoc, jobDpi, jobH, jobV);
      if (clipNote) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert('Border near the label edge', clipNote, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Print anyway', onPress: () => resolve(true) },
          ]);
        });
        if (!proceed) {
          printingLockRef.current = false;
          return;
        }
      }
    }

    useSettingsStore.getState().patchDefaults({ paperType });
    setPrinting(true);
    const timer = new PrintTimingLogger();

    try {
      const dieCutJob = jewelryDieCutJob || cableFlagJob || ratTail143Job;
      const quality = resolvePrintQuality({
        darkness,
        speed,
        grayThreshold: defaults.grayThreshold,
        colorMode: defaults.colorMode,
        dieCut: dieCutJob,
        jewelry: jewelryDieCutJob,
      });
      const { density: printDensity, threshold, speed: printSpeed, dither } = quality;
      const printSpec = createPrintSpec({
        widthMm: paper.widthMm,
        heightMm: paper.heightMm,
        dpi: jobDpi,
        profile: manager.getActivePrinterProfile(),
        calibration: { horizontalOffsetMm: jobH, verticalOffsetMm: jobV },
        gapMm: jobGap,
      });
      console.info(
        `[print] Advanced params → density=${printDensity} speed=${printSpeed} threshold=${threshold} gap=${jobGap}mm hCorrection=${roll.hCorrectionMm}mm linerL/R=${roll.sideLinerLeftMm}/${roll.sideLinerRightMm} hSent=${jobH}mm vSent=${jobV}mm REFERENCE=${printSpec.xOffsetDots},${printSpec.yOffsetDots} darknessUI=${darkness ?? 'Auto'} speedUI=${speed ?? 'Auto'}`,
      );

      for (let page = 0; page < pageCount; page++) {
        const pageStart = Date.now();
        if (pageCount > 1) {
          setPageIndex(page);
          timer.start('pageWaitForPaint');
          await waitForNextPaint();
          timer.end('pageWaitForPaint');
        }

        const pageRaw = buildPageDocument(page);
        const pageDoc =
          pageRaw == null
            ? displayDocument ?? previewDocument
            : applyPrintSize(pageRaw, printPreset, printSize);
        const tsplDirection = tsplDirectionForLabel(pageDoc, paper.widthMm, paper.heightMm);
        const td404HeadlessMono =
          manager.usesTd404CommandSet &&
          orientationDeg === 0 &&
          pageDoc != null &&
          canHeadlessRasterPrint(pageDoc) &&
          Math.abs(pageDoc.widthMm - paper.widthMm) <= 0.2 &&
          Math.abs(pageDoc.heightMm - paper.heightMm) <= 0.2;

        timer.start('capture+verify');
        const captureTarget = printCaptureLayout(widthMm, heightMm, jobDpi).content;
        let captureResolvedAt = 0;
        let base64 = '';
        let rotatedBase64 = '';
        let connectionMs = 0;
        let captureMs = 0;
        if (td404HeadlessMono) {
          const tConn0 = Date.now();
          const connectionResult = await manager.ensureConnected().catch((err) => {
            return { error: err };
          });
          connectionMs = Date.now() - tConn0;
          timer.end('capture+verify');
          if (connectionResult && 'error' in connectionResult) {
            throw connectionResult.error;
          }
        } else {
          const tConn0 = Date.now();
          const capturePacked = async () => {
            const pngBase64 = await captureRef(shotRef, printCaptureShotOptions);
            captureResolvedAt = Date.now();
            return pngBase64;
          };
          const [connectionResult, captured] = await Promise.all([
            manager.ensureConnected().catch((err) => {
              return { error: err };
            }).then((res) => {
              connectionMs = Date.now() - tConn0;
              return res;
            }),
            (async () => {
              const tCap0 = Date.now();
              try {
                const png = await capturePacked().catch(async () => {
                  await waitForNextPaint();
                  return capturePacked();
                });
                captureMs = Date.now() - tCap0;
                return png;
              } catch (err) {
                captureMs = Date.now() - tCap0;
                throw err;
              }
            })(),
          ]);
          timer.end('capture+verify');

          if (connectionResult && 'error' in connectionResult) {
            throw connectionResult.error;
          }

          const tCapture1 = Date.now();
          console.info('[print] ViewShot capture+verify:', tCapture1 - pageStart, 'ms |', Math.round((captured?.length ?? 0) / 1024), 'KB base64', `| connection_ms=${connectionMs} capture_ms=${captureMs}`);
          if (!captured) {
            throw new Error('Could not capture the label for printing.');
          }
          base64 = captured;

          // Rotate once in JS, uniformly for every printer SDK. Native rotation is
          // only correct on TD-404/Josh; Dev/Tez either ignore orientation or apply
          // it incorrectly (see printer-manager.ts). Pre-rotating here and always
          // telling native `orientation: 0` makes all four SDKs share one, tested,
          // lossless rotation path (rotateGray — exact axis transpose, no skew).
          rotatedBase64 = rotatePngBase64(base64, orientationDeg);

          logPrintTrace('EDITOR_CAPTURE', {
            userWidthMm: widthMm,
            userHeightMm: heightMm,
            paperWidthMm: paper.widthMm,
            paperHeightMm: paper.heightMm,
            captureTargetW: captureTarget.widthPx,
            captureTargetH: captureTarget.heightPx,
            pixelRatio: PixelRatio.get(),
            pngBase64Chars: base64.length,
            jobDpi,
            connection_ms: connectionMs,
            capture_ms: captureMs,
            note: 'Packed BITMAP PNG is encoded to TSPL. ViewShot is ink only; millimetres come from PrintGeometry.',
          });
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

        const artworkPhoto = Boolean(params.imageUri) && !params.labelId;

        let usedNative = false;
        if (manager.isLabelX) {
          console.info(
            `[LABELX-PRINT] Label print via Label X LuckPrinter SDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${copies}, media=${media}`,
          );
          timer.start('transmit');
          await manager.printLabelXPngLabelFast({
            pngBase64: ratTail143Job
              ? rotatePngBase64(base64, RAT_TAIL_143_PRINT.captureOrientation)
              : base64,
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: jobGap,
            copies,
            density: printDensity !== undefined && printDensity !== null ? Math.min(2, Math.max(0, Math.floor(printDensity / 5))) : 1,
            speed: printSpeed,
            hOffsetMm: jobH,
            vOffsetMm: jobV,
            media: wantsBline ? 'bline' : media,
            threshold,
            dither,
          });
          usedNative = true;
          timer.end('transmit');
          console.info(
            `[LABELX-PRINT] page ${page + 1} total: ${Date.now() - pageStart} ms | Label X LuckPrinter SDK path`,
          );
        } else if (manager.isTez) {
          console.info(
            `[TEZ-PRINT] Label print via OEM PrintSDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${copies}, media=${media}`,
          );
          timer.start('transmit');
          await manager.printTezPngLabelFast({
            pngBase64: rotatedBase64,
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: jobGap,
            copies,
            density: printDensity,
            speed: printSpeed,
            orientation: 0,
            dpi: jobDpi,
            hOffsetMm: jobH,
            vOffsetMm: jobV,
            media: wantsBline ? 'bline' : media,
            threshold: jewelryDieCutJob ? Math.max(threshold, 168) : threshold,
          });
          usedNative = true;
          timer.end('transmit');
          console.info(
            `[TEZ-PRINT] page ${page + 1} total: ${Date.now() - pageStart} ms | Tez OEM PrintSDK path`,
          );
        } else if (manager.isJosh) {
          console.info(
            `[JOSH-PRINT-P1:PREFLIGHT] Label print dispatching via JOSH LPAPI: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${copies}`,
          );
          timer.start('transmit');
          await manager.printJoshPngLabelFast({
            pngBase64: rotatedBase64,
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: jobGap,
            copies: copies,
            density: printDensity,
            speed: printSpeed,
            orientation: 0,
            dpi: jobDpi,
            hOffsetMm: jobH,
            vOffsetMm: jobV,
            media: wantsBline ? 'bline' : media,
            alignment: manager.isJosh ? 'center' : manager.getActivePrinterProfile().alignment,
          });
          usedNative = true;
          timer.end('transmit');
          console.info(
            `[JOSH-PRINT-P5:FINALIZE] page ${page + 1} total: ${Date.now() - pageStart} ms | JOSH LPAPI SDK path`,
          );
        } else if (manager.isDev) {
          console.info(
            `[DEV-PRINT-P1:PREFLIGHT] Label print dispatching via DEV AutoReplyPrint SDK: page=${page + 1}/${pageCount}, size=${paper.widthMm}x${paper.heightMm}mm, copies=${copies}`,
          );
          timer.start('sdkFastPrint');
          try {
            usedNative = await manager.printDevPngLabelFast({
              pngBase64: rotatedBase64,
              widthMm: paper.widthMm,
              heightMm: paper.heightMm,
              gapMm: jobGap,
              copies,
              density: darkness != null ? printDensity : 14,
              speed: speed != null ? printSpeed : 3,
              threshold,
              vOffsetMm: jobV,
              hOffsetMm: jobH,
              media: wantsBline ? 'bline' : media,
              orientation: 0,
              dpi: jobDpi,
              dither,
            });
            if (usedNative) {
              console.info(
                `[print] page ${page + 1} total: ${Date.now() - pageStart} ms | AutoReplyPrint native fast path (DEV)`,
              );
            }
          } catch (err) {
            console.warn('[print] DEV native print failed:', err);
            throw err;
          }
          timer.end('sdkFastPrint');
        } else if (manager.usesTd404CommandSet) {
          // Native TD-404: headless Skia mono when every layer is rasterizable (dot-perfect
          // positioning); ViewShot PNG only for photos/signatures/tables/etc.
          timer.start('sdkFastPrint');
          try {
            if (td404HeadlessMono && pageDoc) {
              const tPrep0 = Date.now();
              assertHeadlessRasterDocument(pageDoc);
              await ensurePrintTypefaces();
              const docPrepMs = Date.now() - tPrep0;
              const timed = rasterizeDocumentToBitmapTimed(pageDoc, jobDpi, { threshold });
              const bitmap = timed.result;
              logBorderPrintDiagnostics(pageDoc, jobDpi, bitmap, {
                gapMm: jobGap,
                hOffsetMm: jobH,
                vOffsetMm: jobV,
                referenceDots: { x: printSpec.xOffsetDots, y: printSpec.yOffsetDots },
                printerName: deviceName ?? 'unknown',
              }, timed.gray);
              void exportCanonicalBitmapIfDev(
                bitmap,
                `${pageDoc.widthMm}x${pageDoc.heightMm}`,
              );
              const tNative0 = Date.now();
              usedNative = await manager.printMonoLabelFast({
                monoBytes: bitmap.mono1bppBuffer,
                widthDots: bitmap.widthDots,
                heightDots: bitmap.heightDots,
                bytesPerRow: bitmap.bytesPerRow,
                widthMm: pageDoc.widthMm,
                heightMm: pageDoc.heightMm,
                gapMm: jobGap,
                copies,
                density: printDensity,
                speed: printSpeed,
                vOffsetMm: jobV,
                hOffsetMm: jobH,
                media: wantsBline ? 'bline' : media,
                dpi: jobDpi,
                tearOn,
                direction: tsplDirection,
              });
              const nativeCallMs = Date.now() - tNative0;
              if (!usedNative) {
                throw new Error(
                  'NATIVE_MONO_UNAVAILABLE: rebuild the Android binary so printMonoLabel is present.',
                );
              }
              const monoTiming = manager.getLastTd404MonoLabelTiming();
              const rasterizeMs = timed.rasterizeMs;
              const bitpackMs = timed.bitpackMs;
              const totalMs = Date.now() - pageStart;
              const accounted =
                connectionMs + docPrepMs + rasterizeMs + bitpackMs + nativeCallMs;
              const unaccountedMs = Math.max(0, totalMs - accounted);
              console.info(
                `[print] page ${page + 1} total: ${totalMs} ms | TD-404 printMonoLabel (headless) writeMs=${monoTiming?.writeMs ?? '?'} bytesSent=${monoTiming?.bytesSent ?? '?'} connection_ms=${connectionMs} doc_prep_ms=${docPrepMs} native_call_ms=${nativeCallMs} unaccounted_ms=${unaccountedMs.toFixed(1)}`,
              );
              logPrintTrace('PIPELINE', {
                path: 'headless_skia',
                connection_ms: connectionMs,
                doc_prep_ms: docPrepMs,
                rasterize_ms: rasterizeMs,
                bitpack_ms: bitpackMs,
                native_call_ms: nativeCallMs,
                unaccounted_ms: Number(unaccountedMs.toFixed(1)),
                decode_ms: 0,
                transport_write_ms: monoTiming?.writeMs ?? null,
                total_ms: totalMs,
                buffer_bytes: monoTiming?.jobBytes ?? null,
                width_mm: pageDoc.widthMm,
                height_mm: pageDoc.heightMm,
                width_dots: bitmap.widthDots,
                height_dots: bitmap.heightDots,
                bytes_per_row: bitmap.bytesPerRow,
                gate_15ms: rasterizeMs + bitpackMs < 15 ? 'pass' : 'fail',
                note: 'Production headless mono — canvas mm maps 1:1 to packed BITMAP dots (same as calibration/location harness).',
              });
            } else if (pageDoc) {
              const stamped = rasterizeViewShotPngWithStampedBorders(
                rotatedBase64,
                pageDoc,
                jobDpi,
                threshold,
              );
              logBorderPrintDiagnostics(pageDoc, jobDpi, stamped, {
                gapMm: jobGap,
                hOffsetMm: jobH,
                vOffsetMm: jobV,
                referenceDots: { x: printSpec.xOffsetDots, y: printSpec.yOffsetDots },
                printerName: deviceName ?? 'unknown',
              });
              void exportCanonicalBitmapIfDev(
                stamped,
                `${pageDoc.widthMm}x${pageDoc.heightMm}-viewshot`,
              );
              usedNative = await manager.printMonoLabelFast({
                monoBytes: stamped.mono1bppBuffer,
                widthDots: stamped.widthDots,
                heightDots: stamped.heightDots,
                bytesPerRow: stamped.bytesPerRow,
                widthMm: pageDoc.widthMm,
                heightMm: pageDoc.heightMm,
                gapMm: jobGap,
                copies,
                density: printDensity,
                speed: printSpeed,
                vOffsetMm: jobV,
                hOffsetMm: jobH,
                media: wantsBline ? 'bline' : media,
                dpi: jobDpi,
                tearOn,
                direction: tsplDirection,
              });
            } else {
              usedNative = await tryNativeSdkPngPrint({
                pngBase64: rotatedBase64,
                widthMm: paper.widthMm,
                heightMm: paper.heightMm,
                gapMm: jobGap,
                copies,
                density: printDensity,
                speed: printSpeed,
                vOffsetMm: jobV,
                hOffsetMm: jobH,
                media: wantsBline ? 'bline' : media,
                orientation: 0,
                dpi: jobDpi,
                tearOn,
                direction: tsplDirection,
              });
              if (usedNative) {
                console.info(
                  `[print] page ${page + 1} total: ${Date.now() - pageStart} ms | SDK LabelCommand native fast path (TD-404 ViewShot)`,
                );
                const nativeTiming = manager.getLastTd404PngLabelTiming();
                const stored = usePrinterStore.getState().printCalibration[calibrationKey];
                const layoutPx = captureLayoutPx.current;
                logPrintTrace('PIPELINE', {
                  path: 'viewshot',
                  connection_ms: connectionMs,
                  capture_ms: captureResolvedAt > 0 ? captureResolvedAt - pageStart : captureMs,
                  decode_ms: nativeTiming?.decodeMs ?? null,
                  encode_ms: nativeTiming?.encodeMs ?? null,
                  transport_write_ms: nativeTiming?.writeMs ?? null,
                  total_ms: Date.now() - pageStart,
                  timestamp: new Date().toISOString(),
                  git_sha: resolveGitSha(),
                  native_rev: nativeTiming?.nativeRev ?? null,
                  capture_request_px: `${printCaptureSize.widthPx}x${printCaptureSize.heightPx}`,
                  view_layout_px: layoutPx ? `${layoutPx.w}x${layoutPx.h}` : null,
                  cal_stored: stored ? `h ${stored.hOffsetMm}mm v ${stored.vOffsetMm}mm` : 'none',
                  cal_used: `h ${jobH}mm v ${jobV}mm`,
                  ref_requested:
                    nativeTiming?.requestedX != null
                      ? `${nativeTiming.requestedX},${nativeTiming.requestedY}`
                      : null,
                  ref_sent: nativeTiming?.reference ?? null,
                  bitmap_xy:
                    nativeTiming?.bitmapX != null
                      ? `${nativeTiming.bitmapX},${nativeTiming.bitmapY}`
                      : null,
                  png_px:
                    nativeTiming?.pngWidth != null
                      ? `${nativeTiming.pngWidth}x${nativeTiming.pngHeight}`
                      : null,
                  fit: nativeTiming?.fit ?? null,
                  ink_margins:
                    nativeTiming?.marginL != null
                      ? `L${nativeTiming.marginL} R${nativeTiming.marginR} T${nativeTiming.marginT} B${nativeTiming.marginB}`
                      : null,
                  note: 'ViewShot fallback for unsupported layers (image, table, signature, …).',
                });
              }
            }
          } catch (err) {
            if (td404HeadlessMono) {
              console.warn('[print] TD-404 headless mono failed, falling back to ViewShot:', err);
              if (!rotatedBase64) {
                await waitForNextPaint();
                const captured = await captureRef(shotRef, printCaptureShotOptions);
                if (!captured) {
                  throw err instanceof Error ? err : new Error(String(err));
                }
                base64 = captured;
                rotatedBase64 = rotatePngBase64(base64, orientationDeg);
              }
              if (pageDoc) {
                const stamped = rasterizeViewShotPngWithStampedBorders(
                  rotatedBase64,
                  pageDoc,
                  jobDpi,
                  threshold,
                );
                logBorderPrintDiagnostics(pageDoc, jobDpi, stamped, {
                  gapMm: jobGap,
                  hOffsetMm: jobH,
                  vOffsetMm: jobV,
                  referenceDots: { x: printSpec.xOffsetDots, y: printSpec.yOffsetDots },
                  printerName: deviceName ?? 'unknown',
                });
                void exportCanonicalBitmapIfDev(
                  stamped,
                  `${pageDoc.widthMm}x${pageDoc.heightMm}-viewshot-fallback`,
                );
                usedNative = await manager.printMonoLabelFast({
                  monoBytes: stamped.mono1bppBuffer,
                  widthDots: stamped.widthDots,
                  heightDots: stamped.heightDots,
                  bytesPerRow: stamped.bytesPerRow,
                  widthMm: pageDoc.widthMm,
                  heightMm: pageDoc.heightMm,
                  gapMm: jobGap,
                  copies,
                  density: printDensity,
                  speed: printSpeed,
                  vOffsetMm: jobV,
                  hOffsetMm: jobH,
                  media: wantsBline ? 'bline' : media,
                  dpi: jobDpi,
                  tearOn,
                  direction: tsplDirection,
                }).catch(() => false);
              } else {
                usedNative = await tryNativeSdkPngPrint({
                  pngBase64: rotatedBase64,
                  widthMm: paper.widthMm,
                  heightMm: paper.heightMm,
                  gapMm: jobGap,
                  copies,
                  density: printDensity,
                  speed: printSpeed,
                  vOffsetMm: jobV,
                  hOffsetMm: jobH,
                  media: wantsBline ? 'bline' : media,
                  orientation: 0,
                  dpi: jobDpi,
                  tearOn,
                  direction: tsplDirection,
                }).catch(() => false);
              }
              if (!usedNative) {
                throw err instanceof Error ? err : new Error(String(err));
              }
            } else {
              console.warn('[print] Native SDK fast print failed, falling back to JS:', err);
              usedNative = false;
            }
          }
          timer.end('sdkFastPrint');
        }

        if (!td404HeadlessMono && !manager.isLabelX && !manager.isJosh && !manager.isTez && !manager.isDev && !usedNative) {
          timer.start('rasterize');
          const bits = rasterizePngForPrint(rotatedBase64, {
            // `paper` mm is already orientation-swapped to match rotatedBase64's
            // pixel dimensions; passing orientation:0 here would re-derive
            // unswapped dims and mismatch the already-rotated bitmap.
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            orientation: 0,
            threshold,
            dither,
            hOffsetMm: jobH,
            dpi: jobDpi,
            fitArtwork: artworkPhoto,
          });
          timer.end('rasterize');

          timer.start('encode');
          const bytes = encodeConnectedPrinterJob(bits, {
            widthMm: paper.widthMm,
            heightMm: paper.heightMm,
            gapMm: jobGap,
            copies: 1,
            density: printDensity,
            speed: printSpeed,
            vOffsetMm: jobV,
            hOffsetMm: jobH,
            media: wantsBline ? 'bline' : media,
            dpi: jobDpi,
          });
          timer.end('encode');

          timer.start('transmit');
          await sendIsolatedPrintCopies(bytes, copies);
          timer.end('transmit');

          console.info(
            '[print] page', page + 1, 'total:', Date.now() - pageStart, 'ms |',
            'data:', bytes.length, 'bytes (JS path)',
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
    buildPageDocument,
    printPreset,
    printSize,
    jobDpi,
    defaults.labelWidth,
    defaults.labelHeight,
    defaults.colorMode,
    defaults.grayThreshold,
    orientation,
    darkness,
    speed,
    pageCount,
    hCorrection,
    sideLinerLeft,
    sideLinerRight,
    vOffset,
    gapLength,
    tearOn,
    copies,
    paperType,
    printingSettings.recordHistory,
    printingSettings.returnPrevious,
    addHistoryEntry,
    jobName,
    params.labelId,
    params.imageUri,
    historySource,
    deviceName,
    jewelryDieCutJob,
    cableFlagJob,
    ratTail143Job,
    printCaptureShotOptions,
    printCaptureSize.widthPx,
    printCaptureSize.heightPx,
    calibrationKey,
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
              ? `${activeModelMeta.shortName}: ${deviceName ?? 'Connected'}`
              : status === 'connecting'
              ? 'Connecting…'
              : `${activeModelMeta.shortName} · Unconnected`}
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
                hideNonPrinting
              />
            ) : params.imageUri ? (
              <View style={[styles.previewCard, { width: cardWidth, height: cardHeight }]}>
                <Image
                  source={{ uri: params.imageUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
              </View>
            ) : isPdfJob && pdfPages.length > 0 ? (
              <View
                style={[
                  styles.previewCard,
                  {
                    width: cardWidth,
                    height: cardHeight,
                    backgroundColor: '#FFFFFF',
                    padding: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}>
                <Image
                  source={{
                    uri: `data:image/png;base64,${
                      pdfPages[Math.min(pageIndex, pdfPages.length - 1)]?.base64
                    }`,
                  }}
                  style={{ width: '100%', height: '100%' }}
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
                  {pdfRendering ? 'Rendering PDF pages…' : 'Document Ready for Thermal Print'}
                </Text>
              </View>
            )}
          </View>

          {/* Dedicated 1:1 Hardware Dot Print Artboard (captured at SIZE dots, packed UP to BITMAP) */}
          {(displayDocument ?? previewDocument) ? (
            <View
              collapsable={false}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                captureLayoutPx.current = { w: width, h: height };
              }}
              style={[
                styles.printCaptureNative,
                { width: printCaptureLayoutPx.widthPx, height: printCaptureLayoutPx.heightPx },
              ]}>
              <ViewShot
                ref={shotRef}
                options={printCaptureShotOptions}
                style={{
                  width: printCaptureLayoutPx.widthPx,
                  height: printCaptureLayoutPx.heightPx,
                  backgroundColor: '#FFFFFF',
                }}>
                <LabelPreview
                  document={(displayDocument ?? previewDocument)!}
                  exactWidthPx={printCaptureLayoutPx.widthPx}
                  exactHeightPx={printCaptureLayoutPx.heightPx}
                  printDpi={jobDpi}
                  showArtboardBorder={false}
                  hideNonPrinting
                  omitBorders={getPrinterManager().usesTd404CommandSet}
                />
              </ViewShot>
            </View>
          ) : null}

          {/* Actual print-size badge — shows the real mm / in dimensions that will be sent to the printer. */}
          {activeDoc ? (
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeBadgeText}>
                {formatPrintSize(
                  ratTail143Job ? RAT_TAIL_143_PRINT.widthMm : activeDoc.widthMm,
                  ratTail143Job ? RAT_TAIL_143_PRINT.heightMm : activeDoc.heightMm,
                )}
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
                {baseDocument?.bulk ? 'Label' : 'Row'} {pageIndex + 1} / {pageCount}
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
          {/* Main Primary Settings Card (Clean & Simple) */}
          <View style={styles.settingsCard}>
            <StepperRow
              label="Number of Copies"
              value={String(copies)}
              valueColor={Palette.accent}
              minusDisabled={copies <= 1}
              onMinus={() => setCopies((n) => Math.max(1, n - 1))}
              onPlus={() => setCopies((n) => n + 1)}
              bordered
            />

            {jewelryDieCutJob ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Jewelry Print Mode</Text>
                <ChipGroup
                  options={['3-Across (54×96 Sheet)', 'Single Label Tag']}
                  selected={
                    printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP
                      ? '3-Across (54×96 Sheet)'
                      : 'Single Label Tag'
                  }
                  onSelect={(opt) => {
                    if (opt === '3-Across (54×96 Sheet)') {
                      const p =
                        PRINT_SIZE_PRESETS.find((preset) => preset.id === JEWELRY_DIECUT_PRINT_PRESET_3UP) ??
                        null;
                      setPrintPreset(p);
                      setPrintSize({
                        widthMm: JEWELRY_DIECUT.sheetWidthMm,
                        heightMm: JEWELRY_DIECUT.sheetHeightMm,
                      });
                    } else {
                      setPrintPreset(
                        PRINT_SIZE_PRESETS.find((preset) => preset.id === JEWELRY_DIECUT_PRINT_PRESET_SINGLE) ??
                          null,
                      );
                      setPrintSize({
                        widthMm: JEWELRY_DIECUT.tagWidthMm,
                        heightMm: JEWELRY_DIECUT.tagHeightMm,
                      });
                    }
                  }}
                />
                <Text style={styles.helperText}>
                  {printPreset?.id === JEWELRY_DIECUT_PRINT_PRESET_3UP
                    ? 'Prints across all 3 labels on the 54 × 96 mm backing sheet (3 mm gaps).'
                    : `Prints one 14 × 96 mm tag (left column). SIZE 14.00 mm,96.00 mm.`}
                </Text>
              </View>
            ) : null}

            {cableFlagJob ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Cable Label</Text>
                <Text style={styles.helperText}>
                  Prints both P-style flags on one 50 × 73 mm piece (SIZE 50.00 mm,73.00 mm). Each
                  head is 25 mm wide with a left wrap tab. This is not a 100 × 70 mm sheet.
                </Text>
              </View>
            ) : null}

            {ratTail143Job ? (
              <View style={styles.cardSection}>
                <Text style={styles.groupLabel}>Rat Tail Label</Text>
                <Text style={styles.helperText}>
                  Prints 14.3 × 101.6 mm wrap stock (paddle first, empty tail). Barcode and text stay
                  locked on the 63.5 mm body. SIZE is not 101.6 × 14.3 — that lands ink on the strap.
                </Text>
              </View>
            ) : null}

            <View style={styles.cardSection}>
              <Text style={styles.groupLabel}>Paper Type</Text>
              <ChipGroup options={PAPER_TYPES} selected={paperType} onSelect={setPaperType} />
              {jewelryDieCutJob ? (
                <Text style={[styles.helperText, { color: '#0284C7', marginTop: 6 }]}>
                  💡 Clear-liner jewelry rolls with black timing lines on the back require Paper Type set to "Black mark". If prints skip or overlap, run "Calibrate Paper Sensor" in Printer Connect.
                </Text>
              ) : null}
            </View>
          </View>

          {/* Collapsible Advanced Settings (Darkness, Speed, Offsets, Orientation) */}
          <View style={styles.settingsCard}>
            <Pressable
              onPress={() => setShowAdvanced((v) => !v)}
              style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}>
              <View style={styles.advancedHeaderLeft}>
                <AppIcon name="slider.horizontal.3" tintColor="#475569" size={18} />
                <Text style={styles.advancedHeaderTitle}>Advanced Settings</Text>
              </View>
              <View style={styles.advancedHeaderRight}>
                <Text style={styles.advancedStatusText}>
                  {showAdvanced
                    ? 'Hide'
                    : `${orientation} · Darkness ${darkness == null ? 'Auto' : darkness}`}
                </Text>
                <AppIcon
                  name={showAdvanced ? 'chevron.up' : 'chevron.down'}
                  tintColor="#94A3B8"
                  size={14}
                />
              </View>
            </Pressable>

            {showAdvanced ? (
              <View style={styles.advancedBody}>
                <Text style={[styles.groupLabel, { marginTop: 8 }]}>Orientation</Text>
                <ChipGroup
                  options={ORIENTATIONS}
                  selected={orientation}
                  onSelect={(value) => {
                    if (ratTail143Job) return;
                    setOrientation(value);
                  }}
                />

                <StepperRow
                  label="Print Darkness"
                  value={darkness == null ? 'Auto' : String(darkness)}
                  minusDisabled={darkness != null && darkness <= 1}
                  plusDisabled={darkness != null && darkness >= 15}
                  onMinus={() =>
                    setDarkness((d) => {
                      if (d == null) return 7;
                      if (d <= 1) return null;
                      return d - 1;
                    })
                  }
                  onPlus={() => setDarkness((d) => (d == null ? 8 : Math.min(15, d + 1)))}
                  bordered
                />
                <StepperRow
                  label="Print Speed"
                  value={speed == null ? 'Auto' : String(speed)}
                  minusDisabled={speed != null && speed <= 1}
                  plusDisabled={speed != null && speed >= 8}
                  onMinus={() =>
                    setSpeed((s) => {
                      if (s == null) return 2;
                      if (s <= 1) return null;
                      return s - 1;
                    })
                  }
                  onPlus={() => setSpeed((s) => (s == null ? 3 : Math.min(8, s + 1)))}
                  bordered
                />
                <StepperRow
                  label={specialMediaJob ? 'Gap between labels' : 'Gap between labels (saved)'}
                  value={`${gapLength.toFixed(2)} mm`}
                  minusDisabled={gapLength <= 0}
                  plusDisabled={gapLength >= 20}
                  onMinus={() => stepRollGap(-0.1)}
                  onPlus={() => stepRollGap(0.1)}
                  bordered
                />
                <StepperRow
                  label="Left side liner (saved)"
                  value={`${sideLinerLeft.toFixed(2)} mm`}
                  minusDisabled={sideLinerLeft <= 0}
                  plusDisabled={sideLinerLeft >= SIDE_LINER_MAX_MM}
                  onMinus={() => setSideLinerLeft((v) => Math.max(0, Math.round((v - 0.25) * 100) / 100))}
                  onPlus={() =>
                    setSideLinerLeft((v) => Math.min(SIDE_LINER_MAX_MM, Math.round((v + 0.25) * 100) / 100))
                  }
                  bordered
                />
                <StepperRow
                  label="Right side liner (saved)"
                  value={`${sideLinerRight.toFixed(2)} mm`}
                  minusDisabled={sideLinerRight <= 0}
                  plusDisabled={sideLinerRight >= SIDE_LINER_MAX_MM}
                  onMinus={() => setSideLinerRight((v) => Math.max(0, Math.round((v - 0.25) * 100) / 100))}
                  onPlus={() =>
                    setSideLinerRight((v) => Math.min(SIDE_LINER_MAX_MM, Math.round((v + 0.25) * 100) / 100))
                  }
                  bordered
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
                  <Text style={{ color: '#111827', fontSize: 15 }}>Tear-off (SET TEAR)</Text>
                  <Switch
                    value={tearOn}
                    onValueChange={setTearOn}
                    trackColor={{ false: '#D1D5DB', true: '#48C3C7' }}
                  />
                </View>
                <Text style={{ color: '#9CA3AF', fontSize: 12, paddingTop: 8 }}>
                  {(() => {
                    const mgr = getPrinterManager();
                    if (!mgr.usesTd404CommandSet) {
                      return 'Offsets move this printer’s bitmap origin.';
                    }
                    const page = activeDoc;
                    const spec = createPrintSpec({
                      widthMm: page?.widthMm ?? 50,
                      heightMm: page?.heightMm ?? 30,
                      dpi: jobDpi,
                      profile: mgr.getActivePrinterProfile(),
                      calibration: { horizontalOffsetMm: hOffset, verticalOffsetMm: vOffset },
                    });
                    const clipNote = page
                      ? td404DocumentOffsetClipWarning(page, jobDpi, hOffset, vOffset)
                      : null;
                    const liner = sideLinerShiftMm(sideLinerLeft, sideLinerRight);
                    const base = `Border prints exactly where it sits on the canvas. Gap = liner between stickers. Side liner = strip beside the label on this roll; uneven sides shift the print by half the difference (${liner >= 0 ? '+' : ''}${liner.toFixed(2)} mm). H sent = correction ${hCorrection.toFixed(2)} + liner ${liner.toFixed(2)} = ${hOffset.toFixed(2)} mm. REFERENCE ${spec.xOffsetDots},${spec.yOffsetDots}.`;
                    return clipNote ? `${base} ${clipNote}` : base;
                  })()}
                </Text>
                <StepperRow
                  label="Horizontal printer correction (saved)"
                  value={`${hCorrection.toFixed(2)} mm`}
                  minusDisabled={hCorrection <= -10}
                  plusDisabled={hCorrection >= 10}
                  onMinus={() => setHCorrection((v) => Math.max(-10, Math.round((v - 0.25) * 100) / 100))}
                  onPlus={() => setHCorrection((v) => Math.min(10, Math.round((v + 0.25) * 100) / 100))}
                  bordered
                />
                <StepperRow
                  label="Vertical printer correction (saved)"
                  value={`${vOffset.toFixed(2)} mm`}
                  minusDisabled={vOffset <= -10}
                  plusDisabled={vOffset >= 10}
                  onMinus={() => setVOffset((v) => Math.max(-10, Math.round((v - 0.25) * 100) / 100))}
                  onPlus={() => setVOffset((v) => Math.min(10, Math.round((v + 0.25) * 100) / 100))}
                />
                <Text style={{ color: '#111827', fontSize: 14, fontWeight: '600', paddingTop: 12 }}>
                  Sent to printer: H {hOffset.toFixed(2)} mm, V {vOffset.toFixed(2)} mm
                  {(() => {
                    const mgr = getPrinterManager();
                    if (!mgr.usesTd404CommandSet || !activeDoc) return '';
                    const spec = createPrintSpec({
                      widthMm: activeDoc.widthMm,
                      heightMm: activeDoc.heightMm,
                      dpi: jobDpi,
                      profile: mgr.getActivePrinterProfile(),
                      gapMm: gapLength,
                      calibration: { horizontalOffsetMm: hOffset, verticalOffsetMm: vOffset },
                    });
                    return ` (REFERENCE ${spec.xOffsetDots},${spec.yOffsetDots})`;
                  })()}
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 12, paddingTop: 6 }}>
                  H/V apply on the printer (TSPL REFERENCE), not in the preview. Print an alignment sheet to verify on paper.
                </Text>
                {getPrinterManager().usesTd404CommandSet ? (
                  <Pressable
                    disabled={printing || !activeDoc}
                    onPress={() => {
                      Alert.alert(
                        'Print alignment sheet?',
                        'Sends a real test label (2 mm border + rulers) with your current Gap, H, and V — not your design. Use the green Print button for labels.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Print sheet', onPress: () => void printAlignmentTestSheet() },
                        ],
                      );
                    }}
                    style={{
                      marginTop: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: printing ? '#E5E7EB' : '#F3F4F6',
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                    }}
                  >
                    <Text style={{ color: '#111827', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                      Print alignment sheet (rulers)
                    </Text>
                  </Pressable>
                ) : null}
                {__DEV__ ? (
                  <View style={{ paddingTop: 12, gap: 8 }}>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Developer tools — not your label design.
                    </Text>
                    <Pressable
                      disabled={printing || !activeDoc}
                      onPress={() => {
                        Alert.alert(
                          'Print calibration pattern?',
                          'Same as alignment sheet above.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Print test sheet', onPress: () => void printAlignmentTestSheet() },
                          ],
                        );
                      }}
                      style={({ pressed }) => [
                        styles.sizeBtn,
                        { alignSelf: 'flex-start' },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.sizeBtnText}>Print test sheet (rulers)</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          onPress={() => router.push('/printing-settings')}
          hitSlop={8}
          style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
          <AppIcon name="gearshape.fill" tintColor="#FFFFFF" size={24} />
        </Pressable>
        {/* Size picker — opens sheet to choose a different paper/label size. */}
        <Pressable
          disabled={printing || isPdfJob || ratTail143Job || cableFlagJob}
          onPress={() => setSizeSheetOpen(true)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.sizeBtn,
            (pressed || isPdfJob || ratTail143Job || cableFlagJob) && styles.pressed,
          ]}>
          <AppIcon name="rectangle.dashed" tintColor="#FFFFFF" size={18} />
          <Text style={styles.sizeBtnText} numberOfLines={1}>
            {ratTail143Job
              ? `${RAT_TAIL_143_PRINT.widthMm.toFixed(2)}×${RAT_TAIL_143_PRINT.heightMm.toFixed(2)}mm`
              : activeDoc
                ? `${(Math.round(activeDoc.widthMm * 100) / 100).toFixed(2)}×${(Math.round(activeDoc.heightMm * 100) / 100).toFixed(2)}mm`
                : 'Size'}
          </Text>
        </Pressable>
        {/* Print button — prints the active label at its selected/previewed dimensions */}
        <Pressable
          disabled={printing}
          hitSlop={6}
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
    top: -10000,
    left: 0,
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
    paddingVertical: 4,
    ...cardShadow,
  },
  cardSection: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECEEF1',
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  advancedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  advancedHeaderTitle: {
    ...Type.body,
    fontWeight: '600',
    color: Palette.ink,
  },
  advancedHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  advancedStatusText: {
    fontSize: 12,
    color: '#64748B',
  },
  advancedBody: {
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ECEEF1',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 4,
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
