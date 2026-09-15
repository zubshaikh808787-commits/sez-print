/**
 * Img to Label — Full UI Screen
 *
 * Flow: Image Import → Label Size → Editor/Preview → Print
 *
 * Uses the existing print pipeline: decodeGalleryImage → renderImgToLabel → printArtworkJob
 */

import { AppIcon } from '@/components/app-icon';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';
import {
  clampLabelMm,
  fromMm,
  parseSizeInput,
  toMm,
  validateLabelSize,
  type LabelSizeMm,
  type LabelUnit,
} from '@/lib/label-geometry';
import {
  IMG_TO_LABEL_PRESETS,
  formatPrintSize,
  type PrintSizePreset,
} from '@/lib/print-sizes';
import {
  renderImgToLabel,
  calcPreviewScale,
  defaultImgToLabelConfig,
  resolveOrientation,
  calcPrintCanvas,
  finalizeImgToLabelForPrint,
  type FitMode,
  type Orientation,
  type HAlign,
  type VAlign,
  type ImgToLabelConfig,
} from '@/lib/img-to-label-engine';
import { formatPrintPixels } from '@/lib/unit-conversion';
import { decodeGalleryImage } from '@/lib/printer/gallery-decode';
import { grayToPngBase64, type GrayRaster } from '@/lib/printer/escpos';
import { formatPrintFailure, printJobSizeError } from '@/lib/printer/print-job';
import { calcLabelImageThreshold } from '@/lib/printer/print-quality';
import { printArtworkJob } from '@/lib/printer/universal-bridge';
import { getPrinterManager, PrintTimingLogger } from '@/lib/printer/printer-manager';
import { logPrintTrace } from '@/printing';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

// ─── Constants ─────────────────────────────────────────────────────────────

type Step = 'import' | 'size' | 'edit' | 'print';

const FIT_MODES: FitMode[] = ['contain', 'cover', 'stretch'];
const FIT_LABELS: Record<FitMode, string> = {
  contain: 'Fit',
  cover: 'Fill',
  stretch: 'Stretch',
};
const ORIENTATIONS: Orientation[] = ['portrait', 'landscape', 'auto'];
const ORI_LABELS: Record<Orientation, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  auto: 'Auto',
};
const ROTATIONS = [0, 90, 180, 270] as const;
const H_ALIGNS: HAlign[] = ['left', 'center', 'right'];
const V_ALIGNS: VAlign[] = ['top', 'center', 'bottom'];

const PAPER_TYPES = ['Label', 'Cardstock', 'Receipt', 'Black mark'] as const;

// ─── Sub-components ────────────────────────────────────────────────────────

function ChipGroup<T extends string>({
  options,
  labels,
  selected,
  onSelect,
}: {
  options: readonly T[];
  labels?: Record<T, string>;
  selected: T;
  onSelect: (v: T) => void;
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
              {labels ? labels[option] : option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          style={({ pressed }) => [
            styles.stepCircle,
            minusDisabled && styles.stepCircleMuted,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepGlyph, minusDisabled && styles.stepGlyphMuted]}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          disabled={plusDisabled}
          onPress={onPlus}
          style={({ pressed }) => [
            styles.stepCircle,
            styles.stepCircleAccent,
            plusDisabled && styles.stepCircleMuted,
            pressed && !plusDisabled && styles.pressed,
          ]}>
          <Text style={styles.stepGlyphAccent}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Size Selector Modal ───────────────────────────────────────────────────

function ImgToLabelSizeSelector({
  visible,
  onCancel,
  onSelect,
}: {
  visible: boolean;
  onCancel: () => void;
  onSelect: (size: LabelSizeMm) => void;
}) {
  const insets = useSafeAreaInsets();
  const [customOpen, setCustomOpen] = useState(false);
  const [unit, setUnit] = useState<LabelUnit>('mm');
  const [widthText, setWidthText] = useState('100.00');
  const [heightText, setHeightText] = useState('150.00');

  const customError = useMemo(() => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    if (!w || !h) return 'Enter valid width and height.';
    const wMm = toMm(w, unit);
    const hMm = toMm(h, unit);
    return validateLabelSize(wMm, hMm);
  }, [widthText, heightText, unit]);

  const handleCustomApply = () => {
    const w = parseSizeInput(widthText);
    const h = parseSizeInput(heightText);
    if (!w || !h) return;
    const clamped = clampLabelMm(toMm(w, unit), toMm(h, unit));
    onSelect(clamped);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContent}>
          <Pressable onPress={() => {}}>
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Label Size</Text>

              <ScrollView
                style={styles.presetList}
                showsVerticalScrollIndicator={false}>
                {IMG_TO_LABEL_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.id}
                    onPress={() => onSelect({ widthMm: preset.widthMm, heightMm: preset.heightMm })}
                    android_ripple={androidRipple}
                    style={({ pressed }) => [
                      styles.presetRow,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.presetLabel}>{preset.label}</Text>
                    {preset.detail ? (
                      <Text style={styles.presetDetail}>{preset.detail}</Text>
                    ) : null}
                  </Pressable>
                ))}

                {/* Custom size */}
                <Pressable
                  onPress={() => setCustomOpen(!customOpen)}
                  style={({ pressed }) => [
                    styles.presetRow,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.presetLabel, { color: Palette.accent }]}>
                    Custom Size
                  </Text>
                </Pressable>

                {customOpen && (
                  <View style={styles.customSection}>
                    <View style={styles.customUnitRow}>
                      {(['mm', 'cm', 'in'] as LabelUnit[]).map((u) => (
                        <Pressable
                          key={u}
                          onPress={() => {
                            const w = parseSizeInput(widthText);
                            const h = parseSizeInput(heightText);
                            if (w && h) {
                              const wMm = toMm(w, unit);
                              const hMm = toMm(h, unit);
                              setWidthText(fromMm(wMm, u).toFixed(2));
                              setHeightText(fromMm(hMm, u).toFixed(2));
                            }
                            setUnit(u);
                          }}
                          style={[styles.unitChip, u === unit && styles.unitChipActive]}>
                          <Text style={[styles.unitText, u === unit && styles.unitTextActive]}>
                            {u}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.customInputRow}>
                      <View style={styles.customField}>
                        <Text style={styles.customFieldLabel}>Width</Text>
                        <TextInput
                          style={styles.customInput}
                          value={widthText}
                          onChangeText={setWidthText}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                      </View>
                      <Text style={styles.customX}>×</Text>
                      <View style={styles.customField}>
                        <Text style={styles.customFieldLabel}>Height</Text>
                        <TextInput
                          style={styles.customInput}
                          value={heightText}
                          onChangeText={setHeightText}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                      </View>
                    </View>

                    {customError && (
                      <Text style={styles.errorText}>{customError}</Text>
                    )}

                    <Pressable
                      disabled={!!customError}
                      onPress={handleCustomApply}
                      style={({ pressed }) => [
                        styles.applyBtn,
                        !!customError && styles.applyBtnDisabled,
                        pressed && !customError && styles.pressed,
                      ]}>
                      <Text style={styles.applyBtnText}>Apply</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export default function ImgToLabelScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth);

  const defaults = useSettingsStore((s) => s.defaults);
  const printingSettings = useSettingsStore((s) => s.printing);
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const addHistoryEntry = usePrinterStore((s) => s.addHistoryEntry);
  const connected = status === 'connected';

  // ─── State ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('import');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imagePixels, setImagePixels] = useState<{ width: number; height: number } | null>(null);
  const [labelSize, setLabelSize] = useState<LabelSizeMm>({
    widthMm: defaults.labelWidth,
    heightMm: defaults.labelHeight,
  });
  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>('contain');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [hAlign, setHAlign] = useState<HAlign>('center');
  const [vAlign, setVAlign] = useState<VAlign>('center');
  const [copies, setCopies] = useState(1);
  const [gapLength, setGapLength] = useState(3);
  const [paperType, setPaperType] = useState<(typeof PAPER_TYPES)[number]>('Label');
  const [darkness, setDarkness] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [sourceGray, setSourceGray] = useState<GrayRaster | null>(null);
  const [hOffset, setHOffset] = useState(0);
  const [vOffset, setVOffset] = useState(0);
  const [trimBorder, setTrimBorder] = useState(true);
  const [safeMarginMm, setSafeMarginMm] = useState(0);
  const [decoding, setDecoding] = useState(false);

  // ─── Image Pick ────────────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setImageUri(asset.uri);
      setSourceGray(null);
      if (asset.width && asset.height) {
        setImagePixels({ width: asset.width, height: asset.height });
      } else {
        // Fallback: get size from RNImage
        RNImage.getSize(
          asset.uri,
          (w, h) => setImagePixels({ width: w, height: h }),
          () => Alert.alert('Error', 'Unable to load this image.\nPlease try another image.'),
        );
      }
      setStep('size');
    } catch {
      Alert.alert('Error', 'Unable to load this image.\nPlease try another image.');
    }
  }, []);

  // Auto-pick on first mount
  useEffect(() => {
    if (!imageUri) {
      pickImage();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!imageUri) {
      setSourceGray(null);
      setDecoding(false);
      return;
    }
    let cancelled = false;
    setDecoding(true);
    decodeGalleryImage(imageUri)
      .then((decoded) => {
        if (!cancelled) setSourceGray(decoded.gray);
      })
      .catch(() => {
        if (!cancelled) setSourceGray(null);
      })
      .finally(() => {
        if (!cancelled) setDecoding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  // ─── Derived values ────────────────────────────────────────────────────
  const dpi = getPrinterManager().getPrintDpi();
  const oriented = useMemo(
    () =>
      resolveOrientation(
        labelSize.widthMm,
        labelSize.heightMm,
        orientation,
        imagePixels?.width,
        imagePixels?.height,
      ),
    [labelSize, orientation, imagePixels],
  );
  const printCanvas = useMemo(
    () => calcPrintCanvas(oriented.widthMm, oriented.heightMm, dpi),
    [oriented, dpi],
  );

  const renderConfig = useMemo(
    (): ImgToLabelConfig => ({
      widthMm: oriented.widthMm,
      heightMm: oriented.heightMm,
      dpi,
      fitMode,
      orientation: 'portrait',
      imageRotationDeg: rotation,
      hAlign,
      vAlign,
      trimBorder,
      safeMarginMm,
    }),
    [oriented, dpi, fitMode, rotation, hAlign, vAlign, trimBorder, safeMarginMm],
  );

  const printThreshold = useMemo(
    () => calcLabelImageThreshold(defaults.grayThreshold, darkness),
    [defaults.grayThreshold, darkness],
  );

  const printPreview = useMemo(() => {
    if (!sourceGray) return null;
    const rendered = renderImgToLabel(sourceGray, renderConfig);
    return finalizeImgToLabelForPrint(rendered, { threshold: printThreshold, dither: false });
  }, [sourceGray, renderConfig, printThreshold]);

  const previewDataUri = useMemo(() => {
    if (!printPreview) return null;
    const base64 = grayToPngBase64(printPreview.gray);
    return `data:image/png;base64,${base64}`;
  }, [printPreview]);

  const previewPadding = 48;
  const maxPreviewW = contentWidth - previewPadding * 2;
  const maxPreviewH = 300;
  const preview = useMemo(
    () => calcPreviewScale(oriented.widthMm, oriented.heightMm, maxPreviewW, maxPreviewH),
    [oriented, maxPreviewW, maxPreviewH],
  );
  const previewInnerInset = useMemo(() => {
    if (safeMarginMm <= 0) return 0;
    const marginRatio = safeMarginMm / Math.max(oriented.widthMm, oriented.heightMm);
    return Math.max(2, Math.round(preview.previewWidth * marginRatio));
  }, [safeMarginMm, oriented, preview.previewWidth]);

  // ─── Size Selection ────────────────────────────────────────────────────
  const handleSizeSelect = (size: LabelSizeMm) => {
    setLabelSize(size);
    setSizeSheetOpen(false);
    setStep('edit');
  };

  // ─── Print ─────────────────────────────────────────────────────────────
  const handlePrint = useCallback(async () => {
    if (!imageUri) {
      Alert.alert('No Image', 'Please import an image first.');
      return;
    }

    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert('Printer Not Connected', 'Connect your printer before printing.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Connect', onPress: () => router.push('/printer-connect') },
      ]);
      return;
    }

    const sizeError = printJobSizeError(oriented.widthMm, oriented.heightMm);
    if (sizeError) {
      Alert.alert('Unsupported Size', sizeError);
      return;
    }

    setPrinting(true);
    const timer = new PrintTimingLogger();

    try {
      timer.start('decode');
      const jobDpi = manager.getPrintDpi();
      await manager.ensureConnected();
      let gray = sourceGray;
      if (!gray) {
        const decoded = await decodeGalleryImage(imageUri);
        gray = decoded.gray;
      }
      timer.end('decode');

      logPrintTrace('IMG_TO_LABEL_CONFIG', {
        widthMm: oriented.widthMm,
        heightMm: oriented.heightMm,
        dpi: jobDpi,
        fitMode,
        orientation,
        rotation,
        hAlign,
        vAlign,
        trimBorder,
        safeMarginMm,
        sourceW: gray.width,
        sourceH: gray.height,
      });

      timer.start('render');
      const rendered = renderImgToLabel(gray, renderConfig);
      const result = finalizeImgToLabelForPrint(rendered, {
        threshold: printThreshold,
        dither: false,
      });

      logPrintTrace('IMG_TO_LABEL_RENDER', {
        resultWidthPx: result.widthPx,
        resultHeightPx: result.heightPx,
        resultWidthMm: result.widthMm,
        resultHeightMm: result.heightMm,
        fitMode: result.fitMode,
        dpi: result.dpi,
        threshold: printThreshold,
      });
      timer.end('render');

      timer.start('encode+send');
      const media =
        paperType === 'Receipt'
          ? 'continuous'
          : paperType === 'Black mark'
            ? 'bline'
            : 'gap';

      const threshold = printThreshold;
      const printed = await printArtworkJob({
        widthMm: result.widthMm,
        heightMm: result.heightMm,
        gray: result.gray,
        fit: 'original',
        dither: false,
        threshold,
        flipY: false,
        copies,
        gapMm: gapLength,
        mediaType: media,
        density: darkness,
        speed: speed ?? 6,
        offsetXmm: hOffset,
        offsetYmm: vOffset,
        preparedGeometry: result.geometry,
      });

      logPrintTrace('IMG_TO_LABEL_PRINTED', {
        expectedW: result.widthPx,
        expectedH: result.heightPx,
        actualW: printed.widthDots,
        actualH: printed.heightDots,
        match:
          printed.widthDots === result.widthPx && printed.heightDots === result.heightPx ? 1 : 0,
      });
      timer.end('encode+send');
      timer.dump('IMG TO LABEL');
      manager.setLastPrintTiming(timer.getEntries());

      if (printingSettings.recordHistory) {
        addHistoryEntry({
          labelName: `Img to Label ${Math.round(oriented.widthMm)}×${Math.round(oriented.heightMm)}`,
          copies,
          source: 'img-to-label',
        });
      }

      Alert.alert('Print Sent', `Job sent to ${deviceName ?? 'the printer'}.`);
      if (printingSettings.returnPrevious) router.back();
    } catch (error) {
      const message = formatPrintFailure(error);
      if (message) Alert.alert('Print Failed', message);
      else Alert.alert('Print Failed', 'Unable to prepare the label for printing.\nPlease try again.');
    } finally {
      setPrinting(false);
    }
  }, [
    imageUri,
    oriented,
    fitMode,
    orientation,
    rotation,
    hAlign,
    vAlign,
    hOffset,
    vOffset,
    trimBorder,
    safeMarginMm,
    printThreshold,
    renderConfig,
    sourceGray,
    copies,
    gapLength,
    paperType,
    darkness,
    speed,
    printingSettings.recordHistory,
    printingSettings.returnPrevious,
    addHistoryEntry,
    deviceName,
  ]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>Img to Label</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}>

        {/* ─── Step 1: Import ──────────────────────────────────────── */}
        {step === 'import' && (
          <View style={styles.card}>
            <SectionHeader title="Import Image" subtitle="Select an image from your device" />
            <Pressable
              onPress={pickImage}
              style={({ pressed }) => [styles.importArea, pressed && styles.pressed]}>
              <AppIcon name="photo.on.rectangle" tintColor={Palette.accent} size={40} />
              <Text style={styles.importText}>Tap to select image</Text>
              <Text style={styles.importHint}>PNG, JPG, JPEG</Text>
            </Pressable>
          </View>
        )}

        {/* ─── Step 2: Size ────────────────────────────────────────── */}
        {step === 'size' && imageUri && (
          <View style={styles.card}>
            <SectionHeader title="Select Label Size" />

            {/* Image thumbnail */}
            <View style={styles.thumbnailWrap}>
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbnail}
                contentFit="contain"
              />
              {imagePixels && (
                <Text style={styles.imageDimText}>
                  {imagePixels.width} × {imagePixels.height} px
                </Text>
              )}
            </View>

            {/* Size presets */}
            <Text style={styles.labelLabel}>Label Size</Text>
            <Pressable
              onPress={() => setSizeSheetOpen(true)}
              style={({ pressed }) => [styles.sizeButton, pressed && styles.pressed]}>
              <Text style={styles.sizeButtonText}>
                {formatPrintSize(labelSize.widthMm, labelSize.heightMm)}
              </Text>
              <AppIcon name="chevron.right" tintColor={Palette.muted} size={14} />
            </Pressable>

            <Pressable
              onPress={() => {
                setSizeSheetOpen(false);
                setStep('edit');
              }}
              style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}>
              <Text style={styles.continueBtnText}>Continue</Text>
            </Pressable>
          </View>
        )}

        {/* ─── Step 3: Edit / Preview ──────────────────────────────── */}
        {(step === 'edit' || step === 'print') && imageUri && (
          <>
            {/* Preview canvas */}
            <View style={styles.card}>
              <SectionHeader
                title={step === 'print' ? 'Print Preview' : 'Label Editor'}
                subtitle={`${formatPrintSize(oriented.widthMm, oriented.heightMm)} • ${formatPrintPixels(printCanvas.widthPx, printCanvas.heightPx, dpi)}`}
              />

              {printPreview && (
                <View style={styles.previewBadgeRow}>
                  <View style={styles.previewBadge}>
                    <Text style={styles.previewBadgeText}>Print-accurate preview</Text>
                  </View>
                  <Text style={styles.previewBadgeHint}>
                    B&W preview · threshold {printThreshold} @ {dpi} DPI
                  </Text>
                </View>
              )}

              <View style={[styles.previewContainer, { height: preview.previewHeight + 32 }]}>
                <View
                  style={[
                    styles.previewFrame,
                    {
                      width: preview.previewWidth + 8,
                      height: preview.previewHeight + 8,
                    },
                  ]}>
                  <View
                    style={[
                      styles.previewCanvas,
                      {
                        width: preview.previewWidth,
                        height: preview.previewHeight,
                      },
                    ]}>
                    {decoding || !previewDataUri ? (
                      <View style={styles.previewLoading}>
                        <ActivityIndicator color={Palette.accent} size="small" />
                        <Text style={styles.previewLoadingText}>
                          {decoding ? 'Preparing print preview…' : 'Rendering preview…'}
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: previewDataUri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="fill"
                      />
                    )}
                    {previewInnerInset > 0 && (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.previewSafeMargin,
                          {
                            top: previewInnerInset,
                            left: previewInnerInset,
                            right: previewInnerInset,
                            bottom: previewInnerInset,
                          },
                        ]}
                      />
                    )}
                  </View>
                </View>
              </View>

              {/* Fit mode */}
              {step === 'edit' && (
                <>
                  <Text style={styles.labelLabel}>Image Cleanup</Text>
                  <Pressable
                    onPress={() => setTrimBorder((v) => !v)}
                    style={({ pressed }) => [
                      styles.toggleRow,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.toggleLabel}>Trim photo borders</Text>
                    <View style={[styles.togglePill, trimBorder && styles.togglePillOn]}>
                      <Text style={[styles.togglePillText, trimBorder && styles.togglePillTextOn]}>
                        {trimBorder ? 'On' : 'Off'}
                      </Text>
                    </View>
                  </Pressable>

                  <StepperRow
                    label="Safe margin (mm)"
                    value={safeMarginMm.toFixed(1)}
                    onMinus={() =>
                      setSafeMarginMm(Math.max(0, Math.round((safeMarginMm - 0.5) * 10) / 10))
                    }
                    onPlus={() =>
                      setSafeMarginMm(Math.min(5, Math.round((safeMarginMm + 0.5) * 10) / 10))
                    }
                    minusDisabled={safeMarginMm <= 0}
                    plusDisabled={safeMarginMm >= 5}
                  />

                  <Text style={styles.labelLabel}>Scaling Mode</Text>
                  <ChipGroup
                    options={FIT_MODES}
                    labels={FIT_LABELS}
                    selected={fitMode}
                    onSelect={setFitMode}
                  />

                  {/* Orientation */}
                  <Text style={styles.labelLabel}>Orientation</Text>
                  <ChipGroup
                    options={ORIENTATIONS}
                    labels={ORI_LABELS}
                    selected={orientation}
                    onSelect={setOrientation}
                  />

                  {/* Rotation */}
                  <Text style={styles.labelLabel}>Image Rotation</Text>
                  <ChipGroup
                    options={ROTATIONS.map(String) as unknown as readonly string[]}
                    selected={String(rotation)}
                    onSelect={(v) => setRotation(Number(v) as 0 | 90 | 180 | 270)}
                    labels={{
                      '0': '0°',
                      '90': '90°',
                      '180': '180°',
                      '270': '270°',
                    } as any}
                  />

                  {/* Alignment */}
                  <Text style={styles.labelLabel}>Alignment</Text>
                  <View style={styles.alignmentGrid}>
                    <View style={styles.alignRow}>
                      <Text style={styles.alignLabel}>Horizontal</Text>
                      <ChipGroup
                        options={H_ALIGNS}
                        selected={hAlign}
                        onSelect={setHAlign}
                      />
                    </View>
                    <View style={styles.alignRow}>
                      <Text style={styles.alignLabel}>Vertical</Text>
                      <ChipGroup
                        options={V_ALIGNS}
                        selected={vAlign}
                        onSelect={setVAlign}
                      />
                    </View>
                  </View>

                  {/* Change image / size */}
                  <View style={styles.editActions}>
                    <Pressable
                      onPress={pickImage}
                      style={({ pressed }) => [styles.editActionBtn, pressed && styles.pressed]}>
                      <AppIcon name="photo" tintColor={Palette.accent} size={16} />
                      <Text style={styles.editActionText}>Change Image</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSizeSheetOpen(true)}
                      style={({ pressed }) => [styles.editActionBtn, pressed && styles.pressed]}>
                      <AppIcon name="ruler" tintColor={Palette.accent} size={16} />
                      <Text style={styles.editActionText}>Change Size</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>

            {/* Print controls */}
            {step === 'edit' && (
              <View style={styles.card}>
                <SectionHeader title="Print Settings" />

                <StepperRow
                  label="Copies"
                  value={String(copies)}
                  onMinus={() => setCopies(Math.max(1, copies - 1))}
                  onPlus={() => setCopies(Math.min(99, copies + 1))}
                  minusDisabled={copies <= 1}
                  plusDisabled={copies >= 99}
                />

                <StepperRow
                  label="Darkness"
                  value={darkness == null ? 'Auto' : String(darkness)}
                  onMinus={() => {
                    if (darkness == null) setDarkness(8);
                    else if (darkness > 0) setDarkness(darkness - 1);
                    else setDarkness(null);
                  }}
                  onPlus={() => {
                    if (darkness == null) setDarkness(9);
                    else if (darkness < 15) setDarkness(darkness + 1);
                  }}
                  minusDisabled={darkness != null && darkness <= 0}
                  plusDisabled={darkness != null && darkness >= 15}
                />

                <StepperRow
                  label="Gap (mm)"
                  value={String(gapLength)}
                  onMinus={() => setGapLength(Math.max(0, gapLength - 1))}
                  onPlus={() => setGapLength(Math.min(10, gapLength + 1))}
                  minusDisabled={gapLength <= 0}
                  plusDisabled={gapLength >= 10}
                />

                <StepperRow
                  label="H Offset (mm)"
                  value={hOffset.toFixed(2)}
                  onMinus={() => setHOffset(Math.max(-10, Math.round((hOffset - 0.5) * 100) / 100))}
                  onPlus={() => setHOffset(Math.min(10, Math.round((hOffset + 0.5) * 100) / 100))}
                  minusDisabled={hOffset <= -10}
                  plusDisabled={hOffset >= 10}
                />

                <StepperRow
                  label="V Offset (mm)"
                  value={vOffset.toFixed(2)}
                  onMinus={() => setVOffset(Math.max(-10, Math.round((vOffset - 0.5) * 100) / 100))}
                  onPlus={() => setVOffset(Math.min(10, Math.round((vOffset + 0.5) * 100) / 100))}
                  minusDisabled={vOffset <= -10}
                  plusDisabled={vOffset >= 10}
                />

                <Text style={styles.labelLabel}>Media Type</Text>
                <ChipGroup
                  options={PAPER_TYPES}
                  selected={paperType}
                  onSelect={setPaperType}
                />

                {/* Printer info */}
                <View style={styles.printerInfo}>
                  <Text style={styles.printerLabel}>
                    Printer: {connected ? (deviceName ?? 'Connected') : 'Not connected'}
                  </Text>
                  <Text style={styles.printerLabel}>DPI: {dpi}</Text>
                  <Text style={styles.printerLabel}>
                    Output: {printCanvas.widthPx} × {printCanvas.heightPx} px
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {step === 'edit' && (
          <View style={styles.bottomActions}>
            <Pressable
              onPress={() => setStep('size')}
              style={({ pressed }) => [styles.bottomSecondary, pressed && styles.pressed]}>
              <Text style={styles.bottomSecondaryText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handlePrint}
              disabled={printing || !imageUri || decoding || !printPreview}
              style={({ pressed }) => [
                styles.bottomPrimary,
                (printing || !imageUri || decoding || !printPreview) && styles.bottomPrimaryDisabled,
                pressed && !printing && styles.pressed,
              ]}>
              {printing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <AppIcon name="printer" tintColor="#FFFFFF" size={18} />
                  <Text style={styles.bottomPrimaryText}>Print</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {step === 'size' && (
          <View style={styles.bottomActions}>
            <Pressable
              onPress={() => setStep('import')}
              style={({ pressed }) => [styles.bottomSecondary, pressed && styles.pressed]}>
              <Text style={styles.bottomSecondaryText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep('edit')}
              style={({ pressed }) => [styles.bottomPrimary, pressed && styles.pressed]}>
              <Text style={styles.bottomPrimaryText}>Continue</Text>
            </Pressable>
          </View>
        )}

        {step === 'import' && (
          <View style={styles.bottomActions}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.bottomSecondary, pressed && styles.pressed]}>
              <Text style={styles.bottomSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={pickImage}
              style={({ pressed }) => [styles.bottomPrimary, pressed && styles.pressed]}>
              <AppIcon name="photo" tintColor="#FFFFFF" size={18} />
              <Text style={styles.bottomPrimaryText}>Select Image</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Size selector modal */}
      <ImgToLabelSizeSelector
        visible={sizeSheetOpen}
        onCancel={() => setSizeSheetOpen(false)}
        onSelect={handleSizeSelect}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
  },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    alignItems: 'center',
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: 16,
    ...cardShadow,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Palette.ink,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: Palette.muted,
    marginTop: 2,
  },

  // Import
  importArea: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#F4F6F9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  importText: {
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  importHint: {
    fontSize: 12,
    color: Palette.muted,
  },

  // Thumbnail
  thumbnailWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    backgroundColor: '#F4F6F9',
  },
  imageDimText: {
    fontSize: 11.5,
    color: Palette.muted,
    marginTop: 6,
  },

  // Size
  labelLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
    marginTop: 12,
    marginBottom: 6,
  },
  sizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F6F9',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  sizeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  continueBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Preview
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  previewBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  previewBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
  },
  previewBadgeHint: {
    fontSize: 11,
    color: Palette.muted,
  },
  previewFrame: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCanvas: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 2,
    overflow: 'hidden',
  },
  previewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
  },
  previewLoadingText: {
    fontSize: 12,
    color: Palette.muted,
  },
  previewSafeMargin: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    borderRadius: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F4F6F9',
    marginBottom: 4,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  togglePill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  togglePillOn: {
    backgroundColor: Palette.accent,
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.muted,
  },
  togglePillTextOn: {
    color: '#FFFFFF',
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  chipActive: {
    backgroundColor: Palette.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Palette.ink,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  // Alignment
  alignmentGrid: {
    gap: 8,
  },
  alignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alignLabel: {
    fontSize: 12,
    color: Palette.muted,
    width: 70,
  },

  // Edit actions
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  editActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: Palette.accent,
  },

  // Stepper
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleAccent: {
    backgroundColor: Palette.accent,
  },
  stepCircleMuted: {
    backgroundColor: '#E8EAED',
  },
  stepGlyph: {
    fontSize: 18,
    fontWeight: '600',
    color: Palette.ink,
    lineHeight: 20,
  },
  stepGlyphMuted: {
    color: Palette.muted,
  },
  stepGlyphAccent: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  stepValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Palette.accent,
    minWidth: 28,
    textAlign: 'center',
  },

  // Printer info
  printerInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F5',
    gap: 4,
  },
  printerLabel: {
    fontSize: 12.5,
    color: Palette.muted,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
    ...cardShadow,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
  },
  bottomSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },
  bottomSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
  },
  bottomPrimary: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Palette.accent,
  },
  bottomPrimaryDisabled: {
    opacity: 0.5,
  },
  bottomPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Palette.ink,
    marginBottom: 12,
  },
  presetList: {
    maxHeight: 400,
  },
  presetRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  presetDetail: {
    fontSize: 12,
    color: Palette.muted,
    marginTop: 2,
  },

  // Custom size
  customSection: {
    paddingVertical: 12,
    gap: 10,
  },
  customUnitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  unitChipActive: {
    backgroundColor: Palette.accent,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
  },
  unitTextActive: {
    color: '#FFFFFF',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customField: {
    flex: 1,
  },
  customFieldLabel: {
    fontSize: 12,
    color: Palette.muted,
    marginBottom: 4,
  },
  customInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  customX: {
    fontSize: 16,
    color: Palette.muted,
    marginTop: 18,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  applyBtn: {
    backgroundColor: Palette.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  pressed: {
    opacity: 0.7,
  },
});
