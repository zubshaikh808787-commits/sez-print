/**
 * Calibration Print Screen.
 * Prints a test label with ruler marks at known mm intervals so users can
 * physically verify DPI correctness and printhead centering with a real ruler.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import ViewShot, { captureRef } from 'react-native-view-shot';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Palette } from '@/constants/ui';
import { Spacing } from '@/constants/theme';
import { fitLabelSize } from '@/lib/label-geometry';
import {
  encodeConnectedPrinterJob,
  PRINT_CAPTURE_OPTIONS,
  printCaptureLayout,
  printCaptureOptionsForSize,
  rasterizePngForPrint,
  sendIsolatedPrintCopies,
  tryNativeSdkPngPrint,
  waitForNextPaint,
  formatPrintFailure,
} from '@/lib/printer/print-job';
import { getPrinterManager, PrintTimingLogger } from '@/lib/printer/printer-manager';
import {
  computePrintheadCenteringOffset,
  formatPrintSpecDiagnostics,
  createPrintSpec,
  mmToDots,
} from '@/lib/printer/print-spec';
import { usePrinterStore } from '@/stores/printer-store';

const GRID_STEP_MM = 5;
const DEFAULT_WIDTH_MM = 50;
const DEFAULT_HEIGHT_MM = 30;

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
          <React.Fragment key={`h${mm}`}>
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
          </React.Fragment>
        );
      })}

      {/* Vertical ruler marks (left + right edges) */}
      {vTicks.map((mm) => {
        const y = mm * pxPerMm;
        const isMajor = mm % 10 === 0;
        const len = isMajor ? tickLength * 1.5 : tickLength;
        return (
          <React.Fragment key={`v${mm}`}>
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
          </React.Fragment>
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
  { label: '4×6 in (101.6×152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  { label: '50×50 mm', widthMm: 50, heightMm: 50 },
  { label: '50×30 mm', widthMm: 50, heightMm: 30 },
  { label: '100×150 mm', widthMm: 100, heightMm: 150 },
  { label: '100×100 mm', widthMm: 100, heightMm: 100 },
  { label: '76×130 mm', widthMm: 76, heightMm: 130 },
  { label: '57×30 mm', widthMm: 57, heightMm: 30 },
  { label: '100×155 mm', widthMm: 100, heightMm: 155 },
];

export default function CalibrationPrintScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const connected = status === 'connected';

  const [printing, setPrinting] = useState(false);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState(0);
  const shotRef = useRef<ViewShot>(null);

  const activeSize = CALIBRATION_SIZES[selectedSizeIndex] ?? CALIBRATION_SIZES[0];
  const widthMm = activeSize.widthMm;
  const heightMm = activeSize.heightMm;

  const manager = getPrinterManager();
  const profile = manager.getActivePrinterProfile();
  const dpi = profile.dpi;

  const captureSize = useMemo(
    () => printCaptureLayout(widthMm, heightMm, dpi).content,
    [widthMm, heightMm, dpi],
  );

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
    const timer = new PrintTimingLogger();
    try {
      timer.start('capture+verify');
      const [connectionResult, base64] = await Promise.all([
        manager.ensureConnected().catch((err) => ({ error: err })),
        captureRef(shotRef, printCaptureOptionsForSize(
          captureSize.widthPx,
          captureSize.heightPx,
        )),
      ]);
      timer.end('capture+verify');

      if (connectionResult && 'error' in connectionResult) {
        throw connectionResult.error;
      }
      if (!base64) throw new Error('Could not capture calibration grid.');

      console.info(formatPrintSpecDiagnostics(spec));

      timer.start('sdkFastPrint');
      const usedNative = await tryNativeSdkPngPrint({
        pngBase64: base64,
        widthMm,
        heightMm,
        gapMm: 2,
        copies: 1,
        density: 8,
        speed: 6,
        vOffsetMm: 0,
        hOffsetMm: 0,
        media: 'gap',
        orientation: 0,
        dpi: manager.getPrintDpi(),
      });
      timer.end('sdkFastPrint');

      if (!usedNative) {
        timer.start('rasterize');
        const bits = rasterizePngForPrint(base64, {
          widthMm,
          heightMm,
          orientation: 0,
          threshold: 128,
          dither: false,
          hOffsetMm: 0,
        });
        timer.end('rasterize');

        timer.start('encode');
        const bytes = encodeConnectedPrinterJob(bits, {
          widthMm,
          heightMm,
          gapMm: 2,
          copies: 1,
          density: null,
          speed: 6,
          vOffsetMm: 0,
        });
        timer.end('encode');

        timer.start('transmit');
        await sendIsolatedPrintCopies(bytes, 1);
        timer.end('transmit');
      }

      timer.dump('CALIBRATION PRINT');
      manager.setLastPrintTiming(timer.getEntries());

      Alert.alert(
        'Calibration Printed',
        `Printed ${widthMm}×${heightMm}mm calibration grid.\n\n` +
          '• Measure ruler ticks with a physical ruler.\n' +
          '• Each tick = 5mm, bold ticks = 10mm.\n' +
          '• If marks are consistently off, DPI setting is wrong.\n' +
          '• If content is shifted to one side, centering offset needs adjustment.',
      );
    } catch (error) {
      const message = formatPrintFailure(error);
      if (message) Alert.alert('Print Failed', message);
    } finally {
      setPrinting(false);
    }
  }, [manager, spec, widthMm, heightMm, captureSize]);

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

        {/* Off-screen print artboard at exact printer dots */}
        <View style={styles.offscreen}>
          <ViewShot ref={shotRef} options={PRINT_CAPTURE_OPTIONS} style={{
            width: captureSize.widthPx,
            height: captureSize.heightPx,
            backgroundColor: '#FFFFFF',
          }}>
            <CalibrationGrid
              widthMm={widthMm}
              heightMm={heightMm}
              widthPx={captureSize.widthPx}
              heightPx={captureSize.heightPx}
            />
          </ViewShot>
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

        <Text style={styles.helpText}>
          Print this calibration grid and measure the ruler marks with a physical ruler.{'\n\n'}
          Each small tick = 5mm. Bold ticks = 10mm. Numbers show mm from the edge.{'\n\n'}
          If marks are consistently off by a fixed ratio, the DPI value for this printer model
          is wrong \u2014 adjust it in the printer profile.{'\n\n'}
          If content is shifted to one side, the printhead centering offset needs tuning.
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
          disabled={printing}
          onPress={handlePrint}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>Print Calibration Grid</Text>
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
  printBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    minWidth: 220,
    alignItems: 'center',
  },
  printBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
