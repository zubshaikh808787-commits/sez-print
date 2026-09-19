/**
 * SerialLabelScreen / serial-label.tsx
 *
 * Screen for the "Serial Labels" feature.
 * Generates sequences of labels & barcodes from a single sample + range,
 * previews them, and prints the batch directly to connected thermal printers (TD-404, Josh, Tez, Dev, LabelX).
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { usePrinterStore } from '@/stores/printer-store';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  generateSerialLabelsFromSample,
  validateRange,
  GeneratedLabel,
  LabelTemplate,
  SequenceRuleConfig,
  BarcodeSymbology,
} from '@/lib/printer/SerialLabelEngine';

function encodeTsplSerialLabel(
  text: string,
  barcodeValue: string,
  widthMm = 50,
  heightMm = 30,
): Uint8Array {
  const lines = [
    `SIZE ${widthMm} mm,${heightMm} mm`,
    `GAP 2 mm,0 mm`,
    `DIRECTION 1`,
    `CLS`,
    `TEXT 30,25,"3",0,1,1,"${text}"`,
    `BARCODE 30,75,"128",45,1,0,2,4,"${barcodeValue}"`,
    `PRINT 1`,
    ``,
  ].join('\r\n');
  const buf = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    buf[i] = lines.charCodeAt(i) & 0xff;
  }
  return buf;
}

function LabelPreview({
  item,
  widthMm,
  heightMm,
}: {
  item: GeneratedLabel;
  widthMm: string;
  heightMm: string;
}) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewIndex}>#{item.index + 1}</Text>
        <Text style={styles.previewDim}>
          {widthMm}×{heightMm}mm
        </Text>
      </View>
      <Text style={styles.previewText}>{item.text}</Text>
      <View style={styles.barcodeBox}>
        <Text style={styles.barcodeBars}>||| | |||| | || ||| |</Text>
        <Text style={styles.barcodeText}>{item.barcodeValue}</Text>
      </View>
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
  const connectedName = deviceName || (getPrinterManager().isConnected ? 'Connected Printer' : 'Thermal Printer');

  const [sampleText, setSampleText] = useState('Desk1');
  const [endNumber, setEndNumber] = useState('20');
  const [step, setStep] = useState('1');
  const [padding, setPadding] = useState(''); // blank = auto infer
  const [widthMm, setWidthMm] = useState('50');
  const [heightMm, setHeightMm] = useState('30');
  const [barcodeSymbology, setBarcodeSymbology] = useState<BarcodeSymbology>('CODE128');
  const [generated, setGenerated] = useState<GeneratedLabel[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Printing state
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState({ current: 0, total: 0, label: '' });
  const cancelPrintRef = useRef(false);

  const template: LabelTemplate = {
    fields: {},
    textFieldKey: 'displayText',
    barcodeFieldKey: 'barcodeValue',
  };

  const startNumberMatch = sampleText.match(/(\d+)(\D*)$/);
  const startNumber = startNumberMatch ? parseInt(startNumberMatch[1], 10) : NaN;

  const rangeError = useMemo(() => {
    if (!startNumberMatch) return 'Sample label needs a number, e.g. "Desk1" or "SN-001".';
    const cfg: SequenceRuleConfig = {
      startNumber,
      endNumber: Number(endNumber),
      step: Number(step) || 1,
      textPadding: padding ? Number(padding) : undefined,
      barcodeSymbology,
    };
    return validateRange(cfg);
  }, [sampleText, endNumber, step, padding, barcodeSymbology, startNumberMatch, startNumber]);

  function handlePreview() {
    setError(null);
    try {
      const cfg: SequenceRuleConfig = {
        startNumber,
        endNumber: Number(endNumber),
        step: Number(step) || 1,
        textPadding: padding ? Number(padding) : undefined,
        barcodeSymbology,
      };
      const labels = generateSerialLabelsFromSample(sampleText, template, cfg);
      setGenerated(labels);
    } catch (e: any) {
      setError(e.message);
      setGenerated([]);
    }
  }

  async function handleGenerateAndPrint() {
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

    let labelsToPrint = generated;
    if (labelsToPrint.length === 0) {
      try {
        const cfg: SequenceRuleConfig = {
          startNumber,
          endNumber: Number(endNumber),
          step: Number(step) || 1,
          textPadding: padding ? Number(padding) : undefined,
          barcodeSymbology,
        };
        labelsToPrint = generateSerialLabelsFromSample(sampleText, template, cfg);
        setGenerated(labelsToPrint);
      } catch (e: any) {
        Alert.alert('Error', e.message);
        return;
      }
    }

    Alert.alert(
      'Confirm Batch Print',
      `Print ${labelsToPrint.length} sequential labels from "${labelsToPrint[0].text}" to "${labelsToPrint[labelsToPrint.length - 1].text}"?`,
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
          const bytes = encodeTsplSerialLabel(item.text, item.barcodeValue, w, h);
          await pm.print(bytes);
        } else {
          // Universal driver dispatch for Josh, Tez, Dev, LabelX, Wi-Fi
          await pm.printTestLabel(`${item.text}\n${item.barcodeValue}`);
        }

        successCount++;

        // Brief delay between labels to allow hardware buffers to breathe
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
    generated.length > 8
      ? [...generated.slice(0, 4), ...generated.slice(-4)]
      : generated;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.navHeader}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Serial Labels</Text>
        <Pressable hitSlop={12} onPress={() => router.push('/printer-connect')} style={styles.connectIconBtn}>
          <AppIcon name="antenna.radiowaves.left.and.right" tintColor="#2563EB" size={20} />
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
            <View>
              <Text style={styles.statusTitle}>
                {isConnected ? `Printer: ${connectedName}` : 'No Printer Connected'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isConnected ? 'Ready for serial batch printing' : 'Tap to scan and connect Bluetooth printer'}
              </Text>
            </View>
          </View>
          <AppIcon name="chevron.right" tintColor="#64748B" size={16} />
        </Pressable>

        {/* Title & Description */}
        <Text style={styles.heading}>Serial Label Generator</Text>
        <Text style={styles.subheading}>
          Generate sequential numbers and barcodes automatically from a single sample label.
        </Text>

        {/* Configuration Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sequence Configuration</Text>

          <Text style={styles.label}>Sample Label Pattern</Text>
          <TextInput
            style={styles.input}
            value={sampleText}
            onChangeText={setSampleText}
            placeholder="e.g. Desk1 or SN-001"
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
              <Text style={styles.label}>Step</Text>
              <TextInput
                style={styles.input}
                value={step}
                onChangeText={setStep}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Zero-Pad</Text>
              <TextInput
                style={styles.input}
                value={padding}
                onChangeText={setPadding}
                keyboardType="numeric"
                placeholder="auto"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Width (mm)</Text>
              <TextInput
                style={styles.input}
                value={widthMm}
                onChangeText={setWidthMm}
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
                onChangeText={setHeightMm}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <Text style={styles.label}>Barcode Symbology</Text>
          <View style={styles.chipsRow}>
            {(['CODE128', 'CODE39', 'EAN13', 'UPCA'] as BarcodeSymbology[]).map((sym) => (
              <TouchableOpacity
                key={sym}
                style={[styles.chip, barcodeSymbology === sym && styles.chipActive]}
                onPress={() => setBarcodeSymbology(sym)}
              >
                <Text style={barcodeSymbology === sym ? styles.chipTextActive : styles.chipText}>
                  {sym}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(rangeError || error) && (
            <Text style={styles.error}>{error ?? rangeError}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, !!rangeError && styles.btnDisabled]}
            onPress={handlePreview}
            disabled={!!rangeError}
          >
            <Text style={styles.buttonText}>Preview Sequence</Text>
          </TouchableOpacity>
        </View>

        {/* Results & Action */}
        {generated.length > 0 && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.previewCount}>
                ✨ {generated.length} labels ready to print
              </Text>
              <Text style={styles.previewRange}>
                {generated[0].text} → {generated[generated.length - 1].text}
              </Text>
            </View>

            <FlatList
              horizontal
              data={previewSlice}
              keyExtractor={(item) => String(item.index)}
              renderItem={({ item }) => (
                <LabelPreview item={item} widthMm={widthMm} heightMm={heightMm} />
              )}
              style={styles.previewList}
              showsHorizontalScrollIndicator={false}
            />

            <TouchableOpacity style={styles.button} onPress={handleGenerateAndPrint}>
              <AppIcon name="printer.fill" tintColor="#FFFFFF" size={18} />
              <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                Print Batch ({generated.length} Labels)
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Printing Modal */}
      <Modal visible={isPrinting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color="#2563EB" />
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
  root: { flex: 1, backgroundColor: '#F1F5F9' },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText: { fontSize: 16, color: '#0F172A', fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  connectIconBtn: { width: 60, alignItems: 'flex-end', justifyContent: 'center' },
  scrollContent: { padding: 16 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusBannerOnline: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusBannerOffline: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: '#16A34A' },
  dotOffline: { backgroundColor: '#E11D48' },
  statusTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  statusSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  heading: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  subheading: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  error: { color: '#EF4444', marginTop: 10, fontSize: 13, fontWeight: '500' },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 16,
  },
  secondaryButton: { backgroundColor: '#0F172A' },
  btnDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  resultsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 20,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewCount: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  previewRange: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  previewList: { marginBottom: 8 },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginRight: 10,
    minWidth: 130,
    alignItems: 'center',
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
    marginBottom: 8,
  },
  previewIndex: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  previewDim: { fontSize: 10, color: '#94A3B8' },
  previewText: { fontWeight: '700', fontSize: 16, color: '#0F172A', marginBottom: 8 },
  barcodeBox: { alignItems: 'center', width: '100%', backgroundColor: '#F8FAFC', padding: 6, borderRadius: 6 },
  barcodeBars: { fontSize: 12, letterSpacing: 2, color: '#0F172A', fontWeight: '900' },
  barcodeText: { fontSize: 10, color: '#475569', marginTop: 2, fontWeight: '600' },
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
  modalCurrentLabel: { fontSize: 16, fontWeight: '700', color: '#2563EB', marginTop: 4, marginBottom: 16 },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: { height: '100%', backgroundColor: '#2563EB' },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  cancelBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
});
