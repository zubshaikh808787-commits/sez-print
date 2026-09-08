/**
 * Calibration Print Screen.
 * Prints a millimetre-true proof (no screenshot) so physical size can be measured.
 */

import { Fragment, useCallback, useState } from 'react';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Palette } from '@/constants/ui';
import { Spacing } from '@/constants/theme';
import { fitLabelSize } from '@/lib/label-geometry';
import { formatPrintFailure } from '@/lib/printer/print-job';
import { printPhysicalProofJob } from '@/lib/printer/universal-bridge';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  computePrintheadCenteringOffset,
  createPrintSpec,
  mmToDots,
} from '@/lib/printer/print-spec';
import { usePrinterStore } from '@/stores/printer-store';
import { generateCalibrationTspl, PRINTER_DPI, DOTS_PER_MM } from '@/printing/calibration';

const GRID_STEP_MM = 5;

function CalibrationGrid({
  widthMm,
  heightMm,
  widthPx,
  heightPx,
}: {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
}) {
  const pxPerMm = widthPx / widthMm;
  const tickLength = Math.max(4, pxPerMm * 2);
  const fontSize = Math.max(6, Math.min(12, pxPerMm * 2));

  const hTicks: number[] = [];
  for (let mm = 0; mm <= widthMm; mm += GRID_STEP_MM) hTicks.push(mm);
  const vTicks: number[] = [];
  for (let mm = 0; mm <= heightMm; mm += GRID_STEP_MM) vTicks.push(mm);

  return (
    <Svg width={widthPx} height={heightPx}>
      {/* Border rectangle at exact label edges */}
      <Rect
        x={1}
        y={1}
        width={widthPx - 2}
        height={heightPx - 2}
        stroke="#000000"
        strokeWidth={2}
        fill="none"
      />

      {/* Horizontal ruler marks (top + bottom edges) */}
      {hTicks.map((mm) => {
        const x = mm * pxPerMm;
        const isMajor = mm % 10 === 0;
        const len = isMajor ? tickLength * 1.5 : tickLength;
        return (
          <Fragment key={`h${mm}`}>
            <Line x1={x} y1={0} x2={x} y2={len} stroke="#000" strokeWidth={1} />
            <Line x1={x} y1={heightPx} x2={x} y2={heightPx - len} stroke="#000" strokeWidth={1} />
            {isMajor && mm > 0 && mm < widthMm ? (
              <SvgText
                x={x}
                y={len + fontSize}
                fontSize={fontSize}
                textAnchor="middle"
                fill="#000">
                {mm}
              </SvgText>
            ) : null}
          </Fragment>
        );
      })}

      {/* Vertical ruler marks (left + right edges) */}
      {vTicks.map((mm) => {
        const y = mm * pxPerMm;
        const isMajor = mm % 10 === 0;
        const len = isMajor ? tickLength * 1.5 : tickLength;
        return (
          <Fragment key={`v${mm}`}>
            <Line x1={0} y1={y} x2={len} y2={y} stroke="#000" strokeWidth={1} />
            <Line x1={widthPx} y1={y} x2={widthPx - len} y2={y} stroke="#000" strokeWidth={1} />
            {isMajor && mm > 0 && mm < heightMm ? (
              <SvgText
                x={len + 2}
                y={y + fontSize * 0.35}
                fontSize={fontSize}
                fill="#000">
                {mm}
              </SvgText>
            ) : null}
          </Fragment>
        );
      })}

      {/* Center crosshair */}
      <Line
        x1={widthPx / 2 - tickLength * 2}
        y1={heightPx / 2}
        x2={widthPx / 2 + tickLength * 2}
        y2={heightPx / 2}
        stroke="#000"
        strokeWidth={1}
      />
      <Line
        x1={widthPx / 2}
        y1={heightPx / 2 - tickLength * 2}
        x2={widthPx / 2}
        y2={heightPx / 2 + tickLength * 2}
        stroke="#000"
        strokeWidth={1}
      />

      {/* Size label in center */}
      <SvgText
        x={widthPx / 2}
        y={heightPx / 2 + tickLength * 2 + fontSize + 2}
        fontSize={fontSize}
        textAnchor="middle"
        fill="#000">
        {`${widthMm}\u00d7${heightMm}mm`}
      </SvgText>
    </Svg>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const CALIBRATION_SIZES = [
  { label: '50×25 mm (geometry proof)', widthMm: 50, heightMm: 25 },
  { label: '50×30 mm', widthMm: 50, heightMm: 30 },
  { label: '50×50 mm', widthMm: 50, heightMm: 50 },
  { label: '4×6 in (101.6×152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  { label: '100×150 mm', widthMm: 100, heightMm: 150 },
  { label: '100×100 mm', widthMm: 100, heightMm: 100 },
  { label: '76×130 mm', widthMm: 76, heightMm: 130 },
  { label: '57×30 mm', widthMm: 57, heightMm: 30 },
];

export default function CalibrationPrintScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const connected = status === 'connected';

  const [printing, setPrinting] = useState(false);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState(0);
  const [lastReport, setLastReport] = useState<string | null>(null);

  const activeSize = CALIBRATION_SIZES[selectedSizeIndex] ?? CALIBRATION_SIZES[0];
  const widthMm = activeSize.widthMm;
  const heightMm = activeSize.heightMm;

  const manager = getPrinterManager();
  const profile = manager.getActivePrinterProfile();
  const dpi = profile.dpi;

  const previewFit = fitLabelSize(widthMm, heightMm, 280, 180);
  const labelWidthDots = mmToDots(widthMm, dpi);
  const centeringOffset = computePrintheadCenteringOffset(labelWidthDots, profile);

  const spec = createPrintSpec({ widthMm, heightMm, dpi, profile });

  const handlePrint = useCallback(async () => {
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Connect your printer via Bluetooth or Wi\u2011Fi first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    setPrinting(true);
    try {
      await manager.ensureConnected();
      const report = await printPhysicalProofJob(widthMm, heightMm);
      const summary = [
        `Requested: ${report.requestedWidthMm} × ${report.requestedHeightMm} mm`,
        `Printer: ${report.printerModel}`,
        `DPI: ${report.dpiX} × ${report.dpiY} (${report.dotsPerMmX} dpm)`,
        `Expected dots: ${report.expectedWidthDots} × ${report.expectedHeightDots}`,
        `Actual bitmap: ${report.actualWidthDots} × ${report.actualHeightDots}`,
        `Bytes per row: ${report.bytesPerRow}`,
        `Bitmap bytes: ${report.bitmapByteCount}`,
        `Encoded: ${report.sizeCommand}`,
        `${report.bitmapCommand}`,
        `Raw print data: ${report.rawByteLength} bytes`,
        '',
        'Physical measurement: measure this print with a ruler.',
        'Software success is not physical success.',
      ].join('\n');
      setLastReport(summary);
      console.info('[PRINT-TRACE] PROOF_REPORT\n' + summary);
      Alert.alert('Proof sent — measure it', summary);
    } catch (error) {
      const message = formatPrintFailure(error);
      if (message) Alert.alert('Print Failed', message);
    } finally {
      setPrinting(false);
    }
  }, [manager, widthMm, heightMm]);

  const handlePrintPhase0RawBox = useCallback(async () => {
    if (!manager.isConnected) {
      Alert.alert('Printer Not Connected', 'Please connect to your printer in Settings → Printers first.');
      return;
    }

    const boxW = widthMm >= 80 ? 80 : 40;
    const boxH = widthMm >= 80 ? 15 : 20;

    setPrinting(true);
    try {
      await manager.ensureConnected();
      const res = generateCalibrationTspl({
        labelWidthMm: widthMm,
        labelHeightMm: heightMm,
        boxWidthMm: boxW,
        boxHeightMm: boxH,
        gapMm: 2,
        thicknessMm: 0.35,
      });
      await manager.printRawTspl(res.tspl);
      const summary = [
        'Phase 0 Raw TSPL Sent:',
        res.tspl.trim(),
        '',
        `Target Box: ${boxW} × ${boxH} mm`,
        `DPI: ${PRINTER_DPI} (DOTS_PER_MM: ${DOTS_PER_MM.toFixed(4)})`,
        `Box Dots: ${res.dots.boxWidthDots} × ${res.dots.boxHeightDots}`,
        '',
        'Physical Verification Step:',
        `Measure the printed box with calipers/ruler.`,
        `Target: ${boxW}mm × ${boxH}mm (Must be within ±0.5mm).`,
      ].join('\n');
      setLastReport(summary);
      Alert.alert('Phase 0 Box Sent — Measure It', summary);
    } catch (error) {
      const message = formatPrintFailure(error);
      if (message) Alert.alert('Print Failed', message);
    } finally {
      setPrinting(false);
    }
  }, [manager, widthMm, heightMm]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Calibration Print</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120, padding: 16 }}>
        {/* Label Size Selector Chips */}
        <Text style={styles.sectionTitle}>Select Label Size to Test</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}>
          {CALIBRATION_SIZES.map((item, index) => {
            const selected = index === selectedSizeIndex;
            return (
              <Pressable
                key={item.label}
                onPress={() => setSelectedSizeIndex(index)}
                style={[styles.sizeChip, selected && styles.sizeChipActive]}>
                <Text style={[styles.sizeChipText, selected && styles.sizeChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Preview */}
        <View style={styles.previewWrap}>
          <View style={{ backgroundColor: '#FFFFFF', padding: 2 }}>
            <CalibrationGrid
              widthMm={widthMm}
              heightMm={heightMm}
              widthPx={previewFit.widthPx}
              heightPx={previewFit.heightPx}
            />
          </View>
        </View>

        {/* Diagnostics card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Active Printer Profile</Text>
          <InfoRow label="Profile" value={profile.name} />
          <InfoRow label="DPI" value={`${dpi}`} />
          <InfoRow label="Printhead" value={`${profile.printheadWidthMm}mm / ${profile.printheadWidthDots} dots`} />
          <InfoRow label="Alignment" value={profile.alignment} />
          <InfoRow label="Command" value={profile.commandLanguage.toUpperCase()} />
          <InfoRow label="Centering Offset" value={`${centeringOffset} dots`} />
          <InfoRow label="Label Size" value={`${widthMm}\u00d7${heightMm}mm`} />
          <InfoRow label="Label Dots" value={`${spec.widthDots}\u00d7${spec.heightDots}`} />
          <InfoRow label="Raster Width" value={`${spec.rasterWidthDots} dots (${spec.bytesPerRow} bytes/row)`} />
          <InfoRow label="BITMAP Offset" value={`x=${spec.xOffsetDots}, y=${spec.yOffsetDots}`} />
        </View>

        {lastReport ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Last proof (software values)</Text>
            <Text style={styles.reportText}>{lastReport}</Text>
          </View>
        ) : null}

        <Text style={styles.helpText}>
          This print is rasterized from millimetres at the printer DPI. It is not a screenshot.{'\n\n'}
          On 50×25 mm: outer border, 10 mm square, 20 mm line, center cross.{'\n\n'}
          Measure those marks with a ruler. If software dots match the formula but the
          ruler disagrees, the printer DPI setting or media is wrong — not the document.{'\n\n'}
          Confirm Printer Resolution in Printing Settings matches the physical head
          (203 = 8 dots/mm, 304 = 12 dots/mm).
        </Text>

        {/* Connection status */}
        <View style={[styles.statusBadge, connected ? styles.statusConnected : styles.statusDisconnected]}>
          <Text style={styles.statusText}>
            {connected ? `Connected: ${deviceName ?? 'Printer'}` : 'Not Connected'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          onPress={() => router.push('/phase9-robustness')}
          style={({ pressed }) => [styles.phase9Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 9 Robustness & Batch Engine</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase8-shape-detect')}
          style={({ pressed }) => [styles.phase8Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 8 Shape & Contour Detection</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase7-pipeline')}
          style={({ pressed }) => [styles.phase7Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 7 End-to-End Pipeline</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase6-editor')}
          style={({ pressed }) => [styles.phase6Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 6 Interactive Editor</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase5-barcode-qr')}
          style={({ pressed }) => [styles.phase5Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 5 Barcode & QR Screen</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase4-text')}
          style={({ pressed }) => [styles.phase4Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 4 Text Elements Playground</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase3-image-import')}
          style={({ pressed }) => [styles.phase3Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 3 Image Reference</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/phase2-canvas')}
          style={({ pressed }) => [styles.phase2Btn, pressed && styles.pressed]}>
          <Text style={styles.printBtnText}>Open Phase 2 Canvas Playground</Text>
        </Pressable>

        <Pressable
          disabled={printing}
          onPress={handlePrintPhase0RawBox}
          style={({ pressed }) => [styles.phase0Btn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>
              Print Phase 0 Raw TSPL Box ({widthMm >= 80 ? '80×15' : '40×20'} mm)
            </Text>
          )}
        </Pressable>

        <Pressable
          disabled={printing}
          onPress={handlePrint}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printSecondaryBtnText}>Print Full Ruler Proof</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.header,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  scroll: { flex: 1 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  chipScroll: { marginBottom: 14 },
  chipRow: { gap: 8 },
  sizeChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sizeChipActive: {
    backgroundColor: Palette.accent,
    borderColor: Palette.accent,
  },
  sizeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  sizeChipTextActive: {
    color: '#FFFFFF',
  },
  previewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C5CDD6',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  offscreen: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: -999,
    opacity: 1,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, color: '#111827', fontWeight: '500', fontVariant: ['tabular-nums'] },
  reportText: {
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  helpText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 16,
  },
  statusBadge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusConnected: { backgroundColor: '#D1FAE5' },
  statusDisconnected: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.header,
    paddingTop: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  phase9Btn: {
    backgroundColor: '#059669',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase8Btn: {
    backgroundColor: '#9333EA',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase7Btn: {
    backgroundColor: '#2563EB',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase6Btn: {
    backgroundColor: '#4F46E5',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase5Btn: {
    backgroundColor: '#059669',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase4Btn: {
    backgroundColor: '#D97706',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase3Btn: {
    backgroundColor: '#7C3AED',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase2Btn: {
    backgroundColor: '#0F766E',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  phase0Btn: {
    backgroundColor: '#2563EB',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  printBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  printBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  printSecondaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
