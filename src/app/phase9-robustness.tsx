/**
 * Phase 9 — Robustness, Multi-DPI, Media Sensors, Batch Printing & Caliper Calibration
 *
 * Ground-truth architecture principle:
 * Physical millimeters (mm) remain the absolute source of truth.
 * Supports:
 * 1. Multi-DPI: 203, 300, 304, 600 DPI without rounding intermediate dots/mm.
 * 2. Media Sensors: Transmissive GAP, Reflective BLACK MARK (BLINE), Continuous roll.
 * 3. Batch Printing: Atomic TSPL multi-label stream with sequential variable data merge ({seq}, {seq:001}).
 * 4. Pre-Flight Diagnostics: Actionable warnings & errors before sending bytes to printhead.
 * 5. Caliper Micro-Recalibration: Fine scale tuning (Sx, Sy) calculated directly from physical caliper measurements.
 */

import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import {
  computeDotsPerMm,
  calculateCalibrationAdjustment,
  exportBatchCanvasJob,
  validateCanvasPrintJob,
  type SupportedDpi,
  type MediaSensorType,
  type CanvasDocument,
  type CanvasTextElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasBoxElement,
} from '@/printing/index';

const DPI_OPTIONS: Array<{ dpi: SupportedDpi; label: string; desc: string }> = [
  { dpi: 203, label: '203 DPI', desc: '8 dots/mm (Standard Shipping)' },
  { dpi: 300, label: '300 DPI', desc: '11.81 dots/mm (Industrial Standard)' },
  { dpi: 304, label: '304 DPI', desc: '12 dots/mm (Desktop High-Res)' },
  { dpi: 600, label: '600 DPI', desc: '23.62 dots/mm (Micro Electronics)' },
];

export default function Phase9RobustnessScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // 1. DPI Selection
  const [selectedDpi, setSelectedDpi] = useState<SupportedDpi>(304);

  // 2. Media Sensor Selection
  const [sensorType, setSensorType] = useState<MediaSensorType>('gap');
  const [gapMm, setGapMm] = useState<number>(2);
  const [blackMarkHeightMm, setBlackMarkHeightMm] = useState<number>(3);

  // 3. Label Physical Dimensions
  const [widthMm, setWidthMm] = useState<number>(50);
  const [heightMm, setHeightMm] = useState<number>(30);

  // 4. Batch Configuration
  const [batchCount, setBatchCount] = useState<number>(3);
  const [startSequence, setStartSequence] = useState<number>(1);
  const [stepSequence, setStepSequence] = useState<number>(1);
  const [padDigits, setPadDigits] = useState<number>(3);

  // 5. Caliper Micro-Recalibration
  const [enableCaliperTuning, setEnableCaliperTuning] = useState<boolean>(false);
  const [measuredWidthMm, setMeasuredWidthMm] = useState<string>('49.4');
  const [measuredHeightMm, setMeasuredHeightMm] = useState<string>('30.2');

  // UI state
  const [activeTab, setActiveTab] = useState<'batch' | 'caliper' | 'preflight' | 'tspl'>('batch');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Calculate Caliper Adjustment Factors
  const caliperAdjustment = useMemo(() => {
    const measW = parseFloat(measuredWidthMm) || widthMm;
    const measH = parseFloat(measuredHeightMm) || heightMm;
    return calculateCalibrationAdjustment(widthMm, measW, heightMm, measH, selectedDpi);
  }, [widthMm, heightMm, measuredWidthMm, measuredHeightMm, selectedDpi]);

  const calibrationScale = useMemo(() => {
    if (!enableCaliperTuning) return undefined;
    return {
      scaleX: caliperAdjustment.scaleFactorX,
      scaleY: caliperAdjustment.scaleFactorY,
    };
  }, [enableCaliperTuning, caliperAdjustment]);

  // Construct Sample Document with Placeholders
  const doc: CanvasDocument = useMemo(() => {
    return {
      widthMm,
      heightMm,
      gapMm,
      elements: [
        {
          id: 'outer-box',
          type: 'box',
          left: 1.5,
          top: 1.5,
          width: Math.max(10, widthMm - 3),
          height: Math.max(10, heightMm - 3),
          lineWidth: 0.35,
        } as CanvasBoxElement,
        {
          id: 'title-text',
          type: 'text',
          text: 'ITEM #{seq:001}',
          left: 3.5,
          top: 3.5,
          fontSize: 12,
        } as CanvasTextElement,
        {
          id: 'serial-barcode',
          type: 'barcode',
          data: 'SN{seq:001}',
          left: 3.5,
          top: 10,
          height: 8,
          narrowDots: 2,
        } as CanvasBarcodeElement,
        {
          id: 'tracking-qr',
          type: 'qr',
          data: 'https://trace.io/lot/{seq:001}',
          left: Math.max(10, widthMm - 18),
          top: 9,
          sizeMm: 13,
        } as CanvasQrElement,
        {
          id: 'meta-footer',
          type: 'text',
          text: `${selectedDpi} DPI | ${sensorType.toUpperCase()}`,
          left: 3.5,
          top: Math.max(5, heightMm - 6),
          fontSize: 7,
        } as CanvasTextElement,
      ],
    };
  }, [widthMm, heightMm, gapMm, selectedDpi, sensorType]);

  // Pre-flight Validation
  const validationReport = useMemo(() => {
    return validateCanvasPrintJob(doc);
  }, [doc]);

  // Export Batch TSPL Stream
  const batchResult = useMemo(() => {
    try {
      return exportBatchCanvasJob(doc, batchCount, {
        dpi: selectedDpi,
        sensorType,
        blackMarkHeightMm,
        startSequence,
        stepSequence,
        padDigits,
        calibrationScale,
      });
    } catch (e) {
      return {
        tsplAscii: `Error generating job: ${String(e)}`,
        binaryPayload: new Uint8Array(),
        labelCount: 0,
        totalBytes: 0,
      };
    }
  }, [
    doc,
    batchCount,
    selectedDpi,
    sensorType,
    blackMarkHeightMm,
    startSequence,
    stepSequence,
    padDigits,
    calibrationScale,
  ]);

  // Handle Direct Print
  const handlePrintBatch = async () => {
    if (!validationReport.isValid) {
      Alert.alert(
        'Pre-Flight Validation Failed',
        'Please resolve the validation errors before printing.',
      );
      return;
    }

    if (!connected) {
      Alert.alert(
        'Printer Disconnected',
        `Generated ${batchResult.labelCount} sequential labels (${batchResult.totalBytes} bytes).\n\nConnect to a thermal printer in the Connect tab to output physically.`,
      );
      return;
    }

    setIsPrinting(true);
    try {
      const pm = getPrinterManager();
      await pm.printRawTspl(batchResult.binaryPayload);
      Alert.alert(
        'Batch Sent Successfully',
        `Dispatched ${batchResult.labelCount} labels to ${deviceName || 'printer'}.`,
      );
    } catch (err: unknown) {
      Alert.alert('Print Failed', err instanceof Error ? err.message : String(err));
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <AppIcon name="chevron.left" size={24} tintColor="#FFF" />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Phase 9: Robustness Engine</Text>
          <Text style={styles.headerSubtitle}>Multi-DPI • Sensors • Batch Merge • Caliper</Text>
        </View>
        <View
          style={[
            styles.printerBadge,
            { backgroundColor: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' },
          ]}
        >
          <View
            style={[
              styles.printerDot,
              { backgroundColor: connected ? '#10B981' : '#EF4444' },
            ]}
          />
          <Text
            style={[
              styles.printerBadgeText,
              { color: connected ? '#10B981' : '#EF4444' },
            ]}
          >
            {connected ? deviceName || 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
      >
        {/* 1. DPI Engine Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AppIcon name="gearshape" size={18} tintColor="#3B82F6" />
            <Text style={styles.cardTitle}>Printer Hardware Resolution (DPI)</Text>
          </View>
          <Text style={styles.cardDesc}>
            Thermal printheads use unrounded floating dots/mm (dpi / 25.4) to eliminate cumulative stepping drift.
          </Text>

          <View style={styles.dpiGrid}>
            {DPI_OPTIONS.map((item) => {
              const isSel = selectedDpi === item.dpi;
              return (
                <Pressable
                  key={item.dpi}
                  style={[styles.dpiBtn, isSel && styles.dpiBtnActive]}
                  onPress={() => setSelectedDpi(item.dpi)}
                >
                  <Text style={[styles.dpiLabel, isSel && styles.dpiLabelActive]}>{item.label}</Text>
                  <Text style={[styles.dpiDesc, isSel && styles.dpiDescActive]}>{item.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.infoBanner}>
            <AppIcon name="info.circle" size={16} tintColor="#8A92A6" />
            <Text style={styles.infoBannerText}>
              Active dots/mm: <Text style={styles.boldText}>{computeDotsPerMm(selectedDpi).toFixed(4)} dots/mm</Text>
            </Text>
          </View>
        </View>

        {/* 2. Media Sensor Control */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AppIcon name="slider.horizontal.3" size={18} tintColor="#10B981" />
            <Text style={styles.cardTitle}>Media Sensor Command</Text>
          </View>

          <View style={styles.segmentRow}>
            {(['gap', 'blackmark', 'continuous'] as MediaSensorType[]).map((type) => {
              const isSel = sensorType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.segmentBtn, isSel && styles.segmentBtnActive]}
                  onPress={() => setSensorType(type)}
                >
                  <Text style={[styles.segmentText, isSel && styles.segmentTextActive]}>
                    {type === 'gap' ? 'Gap Sensor' : type === 'blackmark' ? 'Black Mark' : 'Continuous'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {sensorType === 'gap' && (
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Gap Height (mm):</Text>
              <TextInput
                style={styles.paramInput}
                keyboardType="numeric"
                value={String(gapMm)}
                onChangeText={(v) => setGapMm(parseFloat(v) || 2)}
              />
              <Text style={styles.paramHint}>→ TSPL: GAP {gapMm} mm, 0 mm</Text>
            </View>
          )}

          {sensorType === 'blackmark' && (
            <View style={styles.paramRow}>
              <Text style={styles.paramLabel}>Mark Height (mm):</Text>
              <TextInput
                style={styles.paramInput}
                keyboardType="numeric"
                value={String(blackMarkHeightMm)}
                onChangeText={(v) => setBlackMarkHeightMm(parseFloat(v) || 3)}
              />
              <Text style={styles.paramHint}>→ TSPL: BLINE {blackMarkHeightMm} mm, 0 mm</Text>
            </View>
          )}

          {sensorType === 'continuous' && (
            <View style={styles.paramRow}>
              <Text style={styles.paramHint}>Continuous Roll → TSPL: GAP 0 mm, 0 mm</Text>
            </View>
          )}
        </View>

        {/* Navigation Tabs */}
        <View style={styles.tabsRow}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'batch' && styles.tabBtnActive]}
            onPress={() => setActiveTab('batch')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'batch' && styles.tabBtnTextActive]}>
              Batch Sequence
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === 'caliper' && styles.tabBtnActive]}
            onPress={() => setActiveTab('caliper')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'caliper' && styles.tabBtnTextActive]}>
              Caliper Tuning
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === 'preflight' && styles.tabBtnActive]}
            onPress={() => setActiveTab('preflight')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'preflight' && styles.tabBtnTextActive]}>
              Pre-Flight ({validationReport.errors.length + validationReport.warnings.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === 'tspl' && styles.tabBtnActive]}
            onPress={() => setActiveTab('tspl')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'tspl' && styles.tabBtnTextActive]}>
              Raw TSPL
            </Text>
          </Pressable>
        </View>

        {/* Tab 1: Batch Sequence Studio */}
        {activeTab === 'batch' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <AppIcon name="list.number" size={18} tintColor="#8B5CF6" />
              <Text style={styles.cardTitle}>Batch Sequential Data Merge</Text>
            </View>

            <View style={styles.grid2Col}>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Batch Count:</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={String(batchCount)}
                  onChangeText={(v) => setBatchCount(Math.max(1, Math.min(20, parseInt(v, 10) || 1)))}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Start Number:</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={String(startSequence)}
                  onChangeText={(v) => setStartSequence(parseInt(v, 10) || 1)}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Step Increment:</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={String(stepSequence)}
                  onChangeText={(v) => setStepSequence(parseInt(v, 10) || 1)}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Zero Padding:</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={String(padDigits)}
                  onChangeText={(v) => setPadDigits(parseInt(v, 10) || 0)}
                />
              </View>
            </View>

            <Text style={styles.sectionHeader}>Sequential Data Merge Preview</Text>
            <View style={styles.sequencePreviewList}>
              {Array.from({ length: Math.min(batchCount, 5) }).map((_, idx) => {
                const seq = startSequence + idx * stepSequence;
                const formatted = String(seq).padStart(padDigits, '0');
                return (
                  <View key={idx} style={styles.seqItemCard}>
                    <View style={styles.seqBadge}>
                      <Text style={styles.seqBadgeText}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.seqDetails}>
                      <Text style={styles.seqTitle}>Title: ITEM #{formatted}</Text>
                      <Text style={styles.seqSub}>Barcode: SN{formatted} • QR: .../lot/{formatted}</Text>
                    </View>
                  </View>
                );
              })}
              {batchCount > 5 && (
                <Text style={styles.seqMoreText}>... and {batchCount - 5} more sequential labels</Text>
              )}
            </View>
          </View>
        )}

        {/* Tab 2: Caliper Micro-Recalibration Flow */}
        {activeTab === 'caliper' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <AppIcon name="square.dashed" size={18} tintColor="#F59E0B" />
              <Text style={styles.cardTitle}>Physical Caliper Re-Calibration</Text>
            </View>
            <Text style={styles.cardDesc}>
              Measure your printed label with digital calipers. Enter measured dimensions to compute micro-step tuning factors (Sx, Sy) that correct platen roller slip.
            </Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Apply Caliper Tuning to Stream:</Text>
              <Switch
                value={enableCaliperTuning}
                onValueChange={setEnableCaliperTuning}
                trackColor={{ false: '#232936', true: '#10B981' }}
              />
            </View>

            <View style={styles.grid2Col}>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Nominal Width (mm):</Text>
                <TextInput
                  style={[styles.paramInput, styles.readOnlyInput]}
                  editable={false}
                  value={`${widthMm} mm`}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Caliper Measured (mm):</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={measuredWidthMm}
                  onChangeText={setMeasuredWidthMm}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Nominal Height (mm):</Text>
                <TextInput
                  style={[styles.paramInput, styles.readOnlyInput]}
                  editable={false}
                  value={`${heightMm} mm`}
                />
              </View>
              <View style={styles.colItem}>
                <Text style={styles.paramLabel}>Caliper Measured (mm):</Text>
                <TextInput
                  style={styles.paramInput}
                  keyboardType="numeric"
                  value={measuredHeightMm}
                  onChangeText={setMeasuredHeightMm}
                />
              </View>
            </View>

            <View style={styles.caliperFactorCard}>
              <Text style={styles.caliperFactorTitle}>Computed Adjustment Factors:</Text>
              <View style={styles.factorRow}>
                <Text style={styles.factorLabel}>Scale Factor X (Sx):</Text>
                <Text style={styles.factorValue}>
                  {caliperAdjustment.scaleFactorX.toFixed(4)}{' '}
                  <Text style={styles.factorPct}>
                    ({((caliperAdjustment.scaleFactorX - 1) * 100).toFixed(2)}%)
                  </Text>
                </Text>
              </View>
              <View style={styles.factorRow}>
                <Text style={styles.factorLabel}>Scale Factor Y (Sy):</Text>
                <Text style={styles.factorValue}>
                  {caliperAdjustment.scaleFactorY.toFixed(4)}{' '}
                  <Text style={styles.factorPct}>
                    ({((caliperAdjustment.scaleFactorY - 1) * 100).toFixed(2)}%)
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tab 3: Pre-Flight Validation Diagnostics */}
        {activeTab === 'preflight' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <AppIcon
                name={validationReport.isValid ? 'checkmark' : 'info.circle'}
                size={18}
                tintColor={validationReport.isValid ? '#10B981' : '#EF4444'}
              />
              <Text style={styles.cardTitle}>
                Pre-Flight Print Status:{' '}
                <Text style={{ color: validationReport.isValid ? '#10B981' : '#EF4444' }}>
                  {validationReport.isValid ? 'PASSED' : 'ACTION REQUIRED'}
                </Text>
              </Text>
            </View>

            {validationReport.errors.length === 0 && validationReport.warnings.length === 0 && (
              <View style={styles.cleanPassCard}>
                <AppIcon name="checkmark" size={24} tintColor="#10B981" />
                <Text style={styles.cleanPassText}>
                  All physical bounds, barcode scannability, and head width checks passed cleanly.
                </Text>
              </View>
            )}

            {validationReport.errors.map((err, i) => (
              <View key={`err-${i}`} style={styles.issueCardError}>
                <View style={styles.issueHeader}>
                  <Text style={styles.issueTagError}>ERROR: {err.code}</Text>
                </View>
                <Text style={styles.issueMsg}>{err.message}</Text>
                {err.suggestedFix && (
                  <Text style={styles.issueFix}>Fix: {err.suggestedFix}</Text>
                )}
              </View>
            ))}

            {validationReport.warnings.map((warn, i) => (
              <View key={`warn-${i}`} style={styles.issueCardWarn}>
                <View style={styles.issueHeader}>
                  <Text style={styles.issueTagWarn}>WARNING: {warn.code}</Text>
                </View>
                <Text style={styles.issueMsg}>{warn.message}</Text>
                {warn.suggestedFix && (
                  <Text style={styles.issueFix}>Fix: {warn.suggestedFix}</Text>
                )}
              </View>
            ))}

            <Text style={styles.sectionHeader}>Quick Diagnostic Presets</Text>
            <View style={styles.diagnosticPresets}>
              <Pressable
                style={styles.diagBtn}
                onPress={() => {
                  setWidthMm(115);
                }}
              >
                <Text style={styles.diagBtnText}>Test Oversized (115mm)</Text>
              </Pressable>
              <Pressable
                style={styles.diagBtn}
                onPress={() => {
                  setWidthMm(50);
                  setHeightMm(30);
                }}
              >
                <Text style={styles.diagBtnText}>Reset Normal (50x30mm)</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Tab 4: Raw TSPL Inspector */}
        {activeTab === 'tspl' && (
          <View style={styles.card}>
            <View style={styles.terminalBox}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDots}>
                  <View style={[styles.terminalDot, { backgroundColor: '#EF4444' }]} />
                  <View style={[styles.terminalDot, { backgroundColor: '#F59E0B' }]} />
                  <View style={[styles.terminalDot, { backgroundColor: '#10B981' }]} />
                </View>
                <Text style={styles.terminalTitle}>
                  TSPL Batch Stream ({batchResult.labelCount} labels • {batchResult.totalBytes} bytes)
                </Text>
              </View>
              <ScrollView style={styles.terminalScroll} nestedScrollEnabled>
                <Text style={styles.terminalCode}>{batchResult.tsplAscii}</Text>
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar: Action Buttons */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable
          style={[styles.printBtn, (!validationReport.isValid || isPrinting) && styles.printBtnDisabled]}
          onPress={handlePrintBatch}
          disabled={!validationReport.isValid || isPrinting}
        >
          {isPrinting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <View style={styles.btnInner}>
              <AppIcon name="printer" size={20} tintColor="#000" />
              <Text style={styles.printBtnText}>
                Print Batch ({batchResult.labelCount} Labels)
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B0D13',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2430',
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8A92A6',
    fontSize: 11,
    marginTop: 2,
  },
  printerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  printerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  printerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#232936',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cardDesc: {
    color: '#8A92A6',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  dpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dpiBtn: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    padding: 10,
  },
  dpiBtnActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  dpiLabel: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  dpiLabelActive: {
    color: '#60A5FA',
  },
  dpiDesc: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
  dpiDescActive: {
    color: '#93C5FD',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  infoBannerText: {
    color: '#8A92A6',
    fontSize: 11,
  },
  boldText: {
    color: '#FFF',
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 3,
    gap: 4,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#1F2430',
  },
  segmentText: {
    color: '#8A92A6',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#10B981',
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  paramLabel: {
    color: '#8A92A6',
    fontSize: 12,
  },
  paramInput: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFF',
    fontSize: 13,
    minWidth: 50,
    textAlign: 'center',
  },
  paramHint: {
    color: '#10B981',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#232936',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: '#232936',
  },
  tabBtnText: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#FFF',
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  colItem: {
    flex: 1,
    minWidth: '45%',
    gap: 4,
  },
  readOnlyInput: {
    color: '#6B7280',
    backgroundColor: '#13161F',
  },
  sectionHeader: {
    color: '#8A92A6',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sequencePreviewList: {
    gap: 8,
  },
  seqItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1F2430',
    gap: 10,
  },
  seqBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  seqBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  seqDetails: {
    flex: 1,
  },
  seqTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  seqSub: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  seqMoreText: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  switchLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  caliperFactorCard: {
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  caliperFactorTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  factorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  factorLabel: {
    color: '#8A92A6',
    fontSize: 12,
  },
  factorValue: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  factorPct: {
    color: '#10B981',
    fontWeight: 'normal',
  },
  cleanPassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  cleanPassText: {
    flex: 1,
    color: '#10B981',
    fontSize: 12,
    lineHeight: 16,
  },
  issueCardError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
    marginBottom: 8,
  },
  issueCardWarn: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    marginBottom: 8,
  },
  issueHeader: {
    marginBottom: 3,
  },
  issueTagError: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  issueTagWarn: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },
  issueMsg: {
    color: '#E5E7EB',
    fontSize: 12,
    lineHeight: 16,
  },
  issueFix: {
    color: '#8A92A6',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  diagnosticPresets: {
    flexDirection: 'row',
    gap: 8,
  },
  diagBtn: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  diagBtnText: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
  },
  terminalBox: {
    backgroundColor: '#0A0C10',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#232936',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161922',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#232936',
    gap: 10,
  },
  terminalDots: {
    flexDirection: 'row',
    gap: 6,
  },
  terminalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  terminalTitle: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
  },
  terminalScroll: {
    padding: 12,
    maxHeight: 220,
  },
  terminalCode: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#10B981',
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#161922',
    borderTopWidth: 1,
    borderTopColor: '#232936',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  printBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
