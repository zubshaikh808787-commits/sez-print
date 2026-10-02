/**
 * SerialLabelScreen / serial-label.tsx
 *
 * Comprehensive Serial Label Generator with:
 * - Label Dimensions & Stock Preset selector (50x30, 40x30, 60x40, 70x50, 100x150, 30x20, Custom)
 * - Sequence rules (Prefix, Start, End, Step, Zero-Padding)
 * - Header / Title text customization with one-tap suggestions
 * - Barcode & 2D QR Code symbology options (CODE128, CODE39, EAN13, UPCA, QR, Text-Only)
 * - Live interactive preview carousel
 * - Seamless "Edit on Canvas" (/edit) workflow with full drag, resize, typography, shapes & graphics
 * - Direct Batch Print (/print) with progress monitoring
 */

import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { usePrinterStore } from '@/stores/printer-store';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  generateSerialLabelsFromSample,
  validateRange,
  parseSequenceFromText,
  GeneratedLabel,
  LabelTemplate,
  SequenceRuleConfig,
  BarcodeSymbology,
} from '@/lib/printer/SerialLabelEngine';
import { createSerialLabelDocument } from '@/lib/bulk-labels';
import { Palette, Type } from '@/constants/ui';
import type { PaperType } from '@/lib/label-document';

type SizePreset = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
};

const SIZE_PRESETS: SizePreset[] = [
  { id: '50x30', name: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: '40x30', name: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { id: '60x40', name: '60 × 40 mm', widthMm: 60, heightMm: 40 },
  { id: '70x50', name: '70 × 50 mm', widthMm: 70, heightMm: 50 },
  { id: '100x150', name: '100 × 150 mm', widthMm: 100, heightMm: 150 },
  { id: '30x20', name: '30 × 20 mm', widthMm: 30, heightMm: 20 },
  { id: 'custom', name: 'Custom Size', widthMm: 50, heightMm: 30 },
];

const HEADER_PRESETS = [
  'ASSET TAG',
  'INVENTORY',
  'PROPERTY OF',
  'QC PASSED',
  'SERIAL NO.',
  'BATCH NO.',
  'CAUTION',
];

type SymbologyOption = 'CODE128' | 'CODE39' | 'EAN13' | 'UPCA' | 'QRCODE' | 'NONE';

function encodeTsplSerialLabel(
  text: string,
  barcodeValue: string,
  widthMm = 50,
  heightMm = 30,
  headerText?: string,
): Uint8Array {
  const lines: string[] = [
    `SIZE ${widthMm} mm,${heightMm} mm`,
    `GAP 2 mm,0 mm`,
    `DIRECTION 1`,
    `CLS`,
  ];

  let currentY = 25;
  if (headerText && headerText.trim().length > 0) {
    lines.push(`TEXT 30,${currentY},"3",0,1,1,"${headerText.trim()}"`);
    currentY += 35;
  }

  if (barcodeValue) {
    lines.push(`BARCODE 30,${currentY},"128",45,1,0,2,4,"${barcodeValue}"`);
    currentY += 55;
  }

  lines.push(`TEXT 30,${currentY},"3",0,1,1,"${text}"`);
  lines.push(`PRINT 1`);
  lines.push(``);

  const raw = lines.join('\r\n');
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buf[i] = raw.charCodeAt(i) & 0xff;
  }
  return buf;
}

function LivePreviewCard({
  item,
  widthMm,
  heightMm,
  headerText,
  hasHeader,
  symbology,
}: {
  item: GeneratedLabel;
  widthMm: string;
  heightMm: string;
  headerText: string;
  hasHeader: boolean;
  symbology: SymbologyOption;
}) {
  const w = parseFloat(widthMm) || 50;
  const h = parseFloat(heightMm) || 30;
  const aspectRatio = Math.max(0.6, Math.min(2.5, w / Math.max(h, 1)));

  return (
    <View style={[styles.previewCard, { width: 145, minHeight: 120 / aspectRatio }]}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewIndex}>#{item.index + 1}</Text>
        <Text style={styles.previewDim}>
          {widthMm}×{heightMm}mm
        </Text>
      </View>

      {hasHeader && headerText.trim().length > 0 ? (
        <Text style={styles.cardHeaderText} numberOfLines={1}>
          {headerText.trim()}
        </Text>
      ) : null}

      {symbology === 'QRCODE' ? (
        <View style={styles.qrBox}>
          <View style={styles.qrCornerTl} />
          <View style={styles.qrCornerTr} />
          <View style={styles.qrCornerBl} />
          <View style={styles.qrCornerBr} />
          <Text style={styles.qrBars}>■ □ ■ ■ □</Text>
          <Text style={styles.qrBars}>□ ■ □ ■ ■</Text>
          <Text style={styles.qrBars}>■ ■ □ □ ■</Text>
        </View>
      ) : symbology !== 'NONE' ? (
        <View style={styles.barcodeBox}>
          <Text style={styles.barcodeBars}>||| | |||| | || ||| |</Text>
          <Text style={styles.barcodeText}>{item.barcodeValue}</Text>
        </View>
      ) : null}

      <Text style={styles.previewText} numberOfLines={1}>
        {item.text}
      </Text>
    </View>
  );
}

export default function SerialLabelScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const deviceId = usePrinterStore((s) => s.deviceId);
  const isConnected =
    status === 'connected' ||
    status === 'printing' ||
    Boolean(deviceId) ||
    getPrinterManager().isConnected;
  const connectedName =
    deviceName || (getPrinterManager().isConnected ? 'Connected Printer' : 'Thermal Printer');

  // Form State
  const [sampleText, setSampleText] = useState('SN-001');
  const [endNumber, setEndNumber] = useState('20');
  const [step, setStep] = useState('1');
  const [paddingOption, setPaddingOption] = useState<'auto' | 'none' | '2' | '3' | '4' | '5'>('auto');

  // Label Dimensions
  const [selectedPreset, setSelectedPreset] = useState<string>('50x30');
  const [widthMm, setWidthMm] = useState('50');
  const [heightMm, setHeightMm] = useState('30');
  const [paperType, setPaperType] = useState<PaperType>('Label');

  // Header / Title
  const [hasHeader, setHasHeader] = useState(true);
  const [headerText, setHeaderText] = useState('ASSET MANAGEMENT');

  // Barcode / Symbology
  const [symbology, setSymbology] = useState<SymbologyOption>('CODE128');

  // Results & Printing State
  const [generated, setGenerated] = useState<GeneratedLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState({ current: 0, total: 0, label: '' });
  const cancelPrintRef = useRef(false);

  const startNumberMatch = sampleText.match(/(\d+)(\D*)$/);
  const startNumber = startNumberMatch ? parseInt(startNumberMatch[1], 10) : NaN;

  const textPadding = useMemo(() => {
    if (paddingOption === 'none') return 0;
    if (paddingOption === 'auto') return undefined;
    return parseInt(paddingOption, 10);
  }, [paddingOption]);

  const rangeError = useMemo(() => {
    if (!startNumberMatch || isNaN(startNumber)) {
      return 'Sample label needs a number, e.g. "SN-001" or "Desk1".';
    }
    const end = Number(endNumber);
    if (isNaN(end)) return 'End number must be a valid number.';
    const cfg: SequenceRuleConfig = {
      startNumber,
      endNumber: end,
      step: Number(step) || 1,
      textPadding,
      barcodeSymbology: symbology === 'QRCODE' || symbology === 'NONE' ? 'CODE128' : symbology,
    };
    return validateRange(cfg);
  }, [sampleText, endNumber, step, textPadding, symbology, startNumberMatch, startNumber]);

  // Compute live sequence for preview
  const liveLabels = useMemo(() => {
    if (rangeError || isNaN(startNumber)) return [];
    try {
      const template: LabelTemplate = {
        fields: {},
        textFieldKey: 'text',
        barcodeFieldKey: 'barcode',
      };
      const cfg: SequenceRuleConfig = {
        startNumber,
        endNumber: Number(endNumber),
        step: Number(step) || 1,
        textPadding,
        barcodeSymbology: symbology === 'QRCODE' || symbology === 'NONE' ? 'CODE128' : symbology,
      };
      return generateSerialLabelsFromSample(sampleText, template, cfg);
    } catch {
      return [];
    }
  }, [sampleText, endNumber, step, textPadding, symbology, startNumber, rangeError]);

  const previewLabels = generated.length > 0 ? generated : liveLabels;

  function handleSelectPreset(preset: SizePreset) {
    setSelectedPreset(preset.id);
    if (preset.id !== 'custom') {
      setWidthMm(String(preset.widthMm));
      setHeightMm(String(preset.heightMm));
    }
  }

  function handleOpenInCanvas() {
    setError(null);
    if (rangeError) {
      Alert.alert('Invalid Sequence', rangeError);
      return;
    }

    try {
      const w = parseFloat(widthMm) || 50;
      const h = parseFloat(heightMm) || 30;

      const doc = createSerialLabelDocument({
        name: `${hasHeader && headerText.trim() ? headerText.trim() : 'Serial Labels'} (${previewLabels[0]?.text ?? 'SN-001'}…${previewLabels[previewLabels.length - 1]?.text ?? 'End'})`,
        widthMm: w,
        heightMm: h,
        orientation: 0,
        paperType,
        headerText: hasHeader ? headerText : undefined,
        samplePattern: sampleText,
        startNumber,
        endNumber: Number(endNumber),
        step: Number(step) || 1,
        zeroPadding: textPadding,
        includeBarcode: symbology !== 'NONE',
        barcodeSymbology: symbology,
      });

      // Navigate directly to the Canvas Editor (/edit) with the newly created serial document!
      router.push({
        pathname: '/edit',
        params: { labelId: doc.id },
      });
    } catch (e: any) {
      setError(e.message);
      Alert.alert('Creation Failed', e.message);
    }
  }

  async function handleQuickBatchPrint() {
    const isConn =
      usePrinterStore.getState().status === 'connected' ||
      usePrinterStore.getState().status === 'printing' ||
      Boolean(usePrinterStore.getState().deviceId) ||
      getPrinterManager().isConnected;

    if (!isConn) {
      Alert.alert(
        'Printer Not Connected',
        'Connect your thermal printer (TD-404, Josh, Tez, Dev, LabelX) before printing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect Printer', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    const labelsToPrint = previewLabels;
    if (labelsToPrint.length === 0) {
      Alert.alert('No Labels', 'Please configure a valid sequence first.');
      return;
    }

    Alert.alert(
      'Confirm Batch Print',
      `Print ${labelsToPrint.length} sequential labels from "${labelsToPrint[0].text}" to "${labelsToPrint[labelsToPrint.length - 1].text}" on ${connectedName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Printing',
          onPress: () => void executeBatchPrint(labelsToPrint),
        },
      ],
    );
  }

  async function executeBatchPrint(labels: GeneratedLabel[]) {
    const pm = getPrinterManager();
    const w = parseFloat(widthMm) || 50;
    const h = parseFloat(heightMm) || 30;

    cancelPrintRef.current = false;
    setIsPrinting(true);
    setPrintProgress({ current: 0, total: labels.length, label: labels[0]?.text || '' });

    let successCount = 0;

    try {
      for (let i = 0; i < labels.length; i++) {
        if (cancelPrintRef.current) {
          console.info('[SERIAL-PRINT] Batch cancelled by user at label index', i);
          break;
        }

        const item = labels[i];
        setPrintProgress({
          current: i + 1,
          total: labels.length,
          label: item.text,
        });

        if (pm.usesTd404CommandSet) {
          const bytes = encodeTsplSerialLabel(
            item.text,
            item.barcodeValue,
            w,
            h,
            hasHeader ? headerText : undefined,
          );
          await pm.print(bytes);
        } else {
          // Universal printer dispatch
          const printContent = hasHeader && headerText.trim()
            ? `${headerText.trim()}\n${item.text}\n${item.barcodeValue}`
            : `${item.text}\n${item.barcodeValue}`;
          await pm.printTestLabel(printContent);
        }

        successCount++;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      if (!cancelPrintRef.current) {
        Alert.alert(
          'Batch Complete! 🎉',
          `Successfully sent ${successCount} serial labels to ${connectedName}.`,
        );
      } else {
        Alert.alert('Printing Stopped', `Stopped after printing ${successCount} labels.`);
      }
    } catch (err: any) {
      Alert.alert(
        'Print Error',
        err instanceof Error ? err.message : 'An error occurred during batch printing.',
      );
    } finally {
      setIsPrinting(false);
    }
  }

  const previewSlice =
    previewLabels.length > 8
      ? [...previewLabels.slice(0, 4), ...previewLabels.slice(-4)]
      : previewLabels;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.navHeader}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Serial Labels</Text>
        <Pressable hitSlop={12} onPress={() => router.push('/printer-connect')} style={styles.connectIconBtn}>
          <AppIcon
            name="antenna.radiowaves.left.and.right"
            tintColor={isConnected ? '#22C55E' : '#FFFFFF'}
            size={20}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Printer Status Banner */}
        <Pressable
          onPress={() => router.push('/printer-connect')}
          style={[styles.statusBanner, isConnected ? styles.statusBannerOnline : styles.statusBannerOffline]}
        >
          <View style={styles.statusLeft}>
            <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {isConnected ? `Printer: ${connectedName}` : 'No Printer Connected'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isConnected ? 'Ready for serial sequence printing' : 'Tap to scan and connect thermal printer'}
              </Text>
            </View>
          </View>
          <AppIcon name="chevron.right" tintColor="#64748B" size={16} />
        </Pressable>

        {/* Section 1: Label Dimensions & Stock */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <AppIcon name="slider.horizontal.3" tintColor={Palette.accent} size={18} />
            <Text style={styles.cardTitle}>Label Size & Dimensions</Text>
          </View>

          <Text style={styles.subLabel}>Stock Presets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {SIZE_PRESETS.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => handleSelectPreset(preset)}
                >
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Width (mm)</Text>
              <TextInput
                style={styles.input}
                value={widthMm}
                onChangeText={(v) => {
                  setSelectedPreset('custom');
                  setWidthMm(v);
                }}
                keyboardType="numeric"
                placeholder="50"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Height (mm)</Text>
              <TextInput
                style={styles.input}
                value={heightMm}
                onChangeText={(v) => {
                  setSelectedPreset('custom');
                  setHeightMm(v);
                }}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <Text style={styles.label}>Paper Type</Text>
          <View style={styles.chipsRow}>
            {(['Label', 'Receipt', 'Black mark', 'Transparent', 'Cardstock'] as PaperType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, paperType === type && styles.chipActive]}
                onPress={() => setPaperType(type)}
              >
                <Text style={paperType === type ? styles.chipTextActive : styles.chipText}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 2: Header / Title */}
        <View style={styles.card}>
          <View style={styles.cardHeaderBetween}>
            <View style={styles.cardHeaderRow}>
              <AppIcon name="character" tintColor={Palette.accent} size={18} />
              <Text style={styles.cardTitle}>Label Header / Title</Text>
            </View>
            <Switch
              value={hasHeader}
              onValueChange={setHasHeader}
              trackColor={{ false: '#CBD5E1', true: Palette.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {hasHeader ? (
            <View style={styles.headerForm}>
              <Text style={styles.label}>Header Text</Text>
              <TextInput
                style={styles.input}
                value={headerText}
                onChangeText={setHeaderText}
                placeholder="e.g. PROPERTY OF ACME CORP"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.subLabel}>Suggestions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                {HEADER_PRESETS.map((txt) => (
                  <TouchableOpacity
                    key={txt}
                    style={[styles.suggestionChip, headerText === txt && styles.suggestionChipActive]}
                    onPress={() => setHeaderText(txt)}
                  >
                    <Text
                      style={[
                        styles.suggestionChipText,
                        headerText === txt && styles.suggestionChipTextActive,
                      ]}
                    >
                      {txt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <Text style={styles.hintText}>
              Labels will be generated without a top header text banner.
            </Text>
          )}
        </View>

        {/* Section 3: Sequence & Numbering Rules */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <AppIcon name="list.number" tintColor={Palette.accent} size={18} />
            <Text style={styles.cardTitle}>Sequence & Numbering</Text>
          </View>

          <Text style={styles.label}>Sample Pattern / Prefix</Text>
          <TextInput
            style={styles.input}
            value={sampleText}
            onChangeText={setSampleText}
            placeholder="e.g. SN-001 or Desk1"
            placeholderTextColor="#94A3B8"
          />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>End Number</Text>
              <TextInput
                style={styles.input}
                value={endNumber}
                onChangeText={setEndNumber}
                keyboardType="numeric"
                placeholder="20"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Step (+ / -)</Text>
              <TextInput
                style={styles.input}
                value={step}
                onChangeText={setStep}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <Text style={styles.label}>Zero-Padding</Text>
          <View style={styles.chipsRow}>
            {(
              [
                { id: 'auto', label: 'Auto' },
                { id: 'none', label: 'None (1, 2…)' },
                { id: '2', label: '2 Digits (01)' },
                { id: '3', label: '3 Digits (001)' },
                { id: '4', label: '4 Digits (0001)' },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.chip, paddingOption === opt.id && styles.chipActive]}
                onPress={() => setPaddingOption(opt.id)}
              >
                <Text style={paddingOption === opt.id ? styles.chipTextActive : styles.chipText}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {rangeError || error ? (
            <Text style={styles.errorText}>{error ?? rangeError}</Text>
          ) : (
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>
                ✨ {previewLabels.length} Sequential Labels: {previewLabels[0]?.text ?? 'Start'} →{' '}
                {previewLabels[previewLabels.length - 1]?.text ?? 'End'}
              </Text>
            </View>
          )}
        </View>

        {/* Section 4: Barcode & Symbology */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <AppIcon name="barcode" tintColor={Palette.accent} size={18} />
            <Text style={styles.cardTitle}>Barcode & Symbology</Text>
          </View>

          <View style={styles.chipsRow}>
            {(
              [
                { id: 'CODE128', label: 'CODE-128 (Standard)' },
                { id: 'CODE39', label: 'CODE-39' },
                { id: 'EAN13', label: 'EAN-13' },
                { id: 'UPCA', label: 'UPC-A' },
                { id: 'QRCODE', label: 'QR Code' },
                { id: 'NONE', label: 'None (Text Only)' },
              ] as const
            ).map((item) => {
              const active = symbology === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSymbology(item.id)}
                >
                  <Text style={active ? styles.chipTextActive : styles.chipText}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 5: Live Sequence Preview */}
        {previewLabels.length > 0 && (
          <View style={styles.previewContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.previewHeading}>Live Label Sequence Preview</Text>
              <Text style={styles.previewSubheading}>
                {previewLabels[0]?.text} … {previewLabels[previewLabels.length - 1]?.text} (
                {previewLabels.length} labels)
              </Text>
            </View>

            <FlatList
              horizontal
              data={previewSlice}
              keyExtractor={(item) => String(item.index)}
              renderItem={({ item }) => (
                <LivePreviewCard
                  item={item}
                  widthMm={widthMm}
                  heightMm={heightMm}
                  headerText={headerText}
                  hasHeader={hasHeader}
                  symbology={symbology}
                />
              )}
              style={styles.previewList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Primary Action: Edit on Canvas */}
        <TouchableOpacity
          style={[styles.actionPrimaryBtn, !!rangeError && styles.btnDisabled]}
          onPress={handleOpenInCanvas}
          disabled={!!rangeError}
        >
          <View style={styles.actionBtnIcon}>
            <AppIcon name="square.and.pencil" tintColor="#FFFFFF" size={20} />
          </View>
          <View style={styles.actionBtnTextCol}>
            <Text style={styles.actionPrimaryText}>Edit on Canvas</Text>
            <Text style={styles.actionPrimarySubtext}>
              Custom sizing, drag & drop, fonts, shapes, clipart & print
            </Text>
          </View>
          <AppIcon name="chevron.right" tintColor="#FFFFFF" size={18} />
        </TouchableOpacity>

        {/* Secondary Action: Direct Batch Print */}
        <TouchableOpacity
          style={[styles.actionSecondaryBtn, !!rangeError && styles.btnDisabled]}
          onPress={handleQuickBatchPrint}
          disabled={!!rangeError}
        >
          <AppIcon name="printer.fill" tintColor="#FFFFFF" size={18} />
          <Text style={styles.actionSecondaryText}>
            Quick Print Batch ({previewLabels.length} Labels)
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Printing Modal */}
      <Modal visible={isPrinting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color={Palette.accent} />
            <Text style={styles.modalHeading}>Printing Serial Labels</Text>
            <Text style={styles.modalProgressText}>
              Label {printProgress.current} of {printProgress.total}
            </Text>
            <Text style={styles.modalCurrentLabel}>"{printProgress.label}"</Text>

            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(
                      (printProgress.current / Math.max(1, printProgress.total)) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                cancelPrintRef.current = true;
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Palette.header,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 70 },
  backText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  connectIconBtn: { width: 70, alignItems: 'flex-end', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusBannerOnline: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusBannerOffline: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: '#16A34A' },
  dotOffline: { backgroundColor: '#E11D48' },
  statusTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  statusSubtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 10, marginBottom: 5 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 8, marginBottom: 4 },
  hintText: { fontSize: 12, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
  },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  presetScroll: { flexDirection: 'row', marginVertical: 4 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  presetChipActive: {
    backgroundColor: Palette.accent,
    borderColor: Palette.accent,
  },
  presetChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  presetChipTextActive: { color: '#FFFFFF' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  headerForm: { marginTop: 4 },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  suggestionChipActive: { backgroundColor: '#214668', borderColor: '#214668' },
  suggestionChipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  suggestionChipTextActive: { color: '#FFFFFF' },
  summaryBadge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  summaryBadgeText: { color: '#16A34A', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#EF4444', marginTop: 10, fontSize: 13, fontWeight: '600' },
  previewContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resultsHeader: { marginBottom: 10 },
  previewHeading: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  previewSubheading: { fontSize: 12, color: '#64748B', marginTop: 2 },
  previewList: { paddingVertical: 4 },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  previewIndex: { fontSize: 9, color: '#64748B', fontWeight: '700' },
  previewDim: { fontSize: 9, color: '#94A3B8' },
  cardHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
  },
  barcodeBox: {
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F8FAFC',
    padding: 4,
    borderRadius: 4,
    marginVertical: 4,
  },
  barcodeBars: { fontSize: 11, letterSpacing: 1.5, color: '#0F172A', fontWeight: '900' },
  barcodeText: { fontSize: 8, color: '#475569', marginTop: 1, fontWeight: '600' },
  qrBox: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    marginVertical: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
  },
  qrBars: { fontSize: 9, letterSpacing: 2, color: '#0F172A', fontWeight: '900', lineHeight: 10 },
  qrCornerTl: { position: 'absolute', top: 2, left: 2, width: 4, height: 4, borderWidth: 1, borderColor: '#000' },
  qrCornerTr: { position: 'absolute', top: 2, right: 2, width: 4, height: 4, borderWidth: 1, borderColor: '#000' },
  qrCornerBl: { position: 'absolute', bottom: 2, left: 2, width: 4, height: 4, borderWidth: 1, borderColor: '#000' },
  qrCornerBr: { position: 'absolute', bottom: 2, right: 2, width: 4, height: 4, borderWidth: 1, borderColor: '#000' },
  previewText: { fontWeight: '800', fontSize: 13, color: '#0F172A', marginTop: 4, textAlign: 'center' },
  actionPrimaryBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: Palette.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  actionBtnIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionBtnTextCol: { flex: 1 },
  actionPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  actionPrimarySubtext: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  actionSecondaryBtn: {
    backgroundColor: Palette.header,
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  actionSecondaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  modalHeading: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 14, marginBottom: 6 },
  modalProgressText: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  modalCurrentLabel: { fontSize: 16, fontWeight: '700', color: Palette.accent, marginTop: 4, marginBottom: 16 },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: { height: '100%', backgroundColor: Palette.accent },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  cancelBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
});
