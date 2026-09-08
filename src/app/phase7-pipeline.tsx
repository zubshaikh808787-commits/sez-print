/**
 * Phase 7 — Full End-to-End Print Pipeline Screen
 *
 * Capabilities:
 * 1. Multi-size label support (50x30 mm, 60x40 mm, 80x50 mm, or custom mm dimensions).
 * 2. 1-bit monochrome raster buffer background (Checkerboard, Border frame, Solid ink, or None).
 * 3. Overlay vector elements (boundary box, text, Code 128 barcode, QR code).
 * 4. Atomic TSPL package generation (SIZE -> GAP -> DIRECTION -> CLS -> BITMAP -> OVERLAYS -> PRINT).
 * 5. Full TSPL wire-inspector with payload size, dot metrics, and ASCII command viewer.
 * 6. Direct physical dispatch to Bluetooth/Wi-Fi thermal printers via PrinterManager.
 */

import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { DOTS_PER_MM, PRINTER_DPI } from '@/printing/calibration';
import { barcodeBarsForMode } from '@/lib/barcode-code128';
import {
  computeScreenFitScale,
  resolveTsplFont,
  tsplFontHeightMm,
  calculateCode128WidthMm,
  resolveQrCellWidth,
  calculateQrFootprintMm,
  validateScannability,
  exportUnifiedCanvasJob,
  createMonochromePatternRaster,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasTextElement,
  type CanvasBoxElement,
  type CanvasElement,
  type CanvasDocument,
  type CanvasBitmapRaster,
} from '@/printing/canvas-export';

const PRESET_SIZES = [
  { label: '50×30 mm', w: 50, h: 30, gap: 2 },
  { label: '60×40 mm', w: 60, h: 40, gap: 3 },
  { label: '80×50 mm', w: 80, h: 50, gap: 2 },
];

type RasterPattern = 'none' | 'checker' | 'border' | 'solid';

export default function Phase7PipelineScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Label Geometry
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);
  const [copies, setCopies] = useState<number>(1);
  const [printBoundary, setPrintBoundary] = useState<boolean>(true);

  // Raster Background
  const [rasterPattern, setRasterPattern] = useState<RasterPattern>('checker');

  // UI States
  const [printing, setPrinting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'inspector' | 'elements'>('preview');

  // Compute adaptive elements based on current label dimensions
  const elements = useMemo<CanvasElement[]>(() => {
    const isNarrow = labelHeightMm <= 30;
    const qrSize = Math.max(8, Math.min(18, labelHeightMm - 8));
    const barcodeHeight = Math.max(5, Math.min(10, labelHeightMm - 18));

    return [
      {
        id: 'title-text',
        type: 'text',
        text: 'SEZ PRINT ENGINE',
        left: 4,
        top: 3,
        fontSize: isNarrow ? 12 : 14,
      },
      {
        id: 'meta-text',
        type: 'text',
        text: `${labelWidthMm}×${labelHeightMm}mm @ 304 DPI`,
        left: 4,
        top: isNarrow ? 7.5 : 8.5,
        fontSize: 8,
      },
      {
        id: 'code128-barcode',
        type: 'barcode',
        data: 'SP-7001-OK',
        left: 4,
        top: isNarrow ? 13 : 15,
        height: barcodeHeight,
        narrowDots: 2,
        readable: 1,
      },
      {
        id: 'qr-element',
        type: 'qr',
        data: `https://sez-print.app/verify/${labelWidthMm}x${labelHeightMm}`,
        left: Math.max(4, labelWidthMm - qrSize - 4),
        top: 3,
        sizeMm: qrSize,
      },
    ];
  }, [labelWidthMm, labelHeightMm]);

  // Generate 1bpp raster bitmap if selected
  const bitmapRaster = useMemo<CanvasBitmapRaster | undefined>(() => {
    if (rasterPattern === 'none') return undefined;
    const wDots = Math.round(labelWidthMm * DOTS_PER_MM);
    const hDots = Math.round(labelHeightMm * DOTS_PER_MM);
    return createMonochromePatternRaster(wDots, hDots, rasterPattern, 0, 0);
  }, [labelWidthMm, labelHeightMm, rasterPattern]);

  // Build Canvas Document
  const canvasDoc = useMemo<CanvasDocument>(() => {
    return {
      widthMm: labelWidthMm,
      heightMm: labelHeightMm,
      gapMm,
      direction: 1,
      elements,
    };
  }, [labelWidthMm, labelHeightMm, gapMm, elements]);

  // Export Unified Job Result
  const jobResult = useMemo(() => {
    return exportUnifiedCanvasJob(canvasDoc, {
      bitmap: bitmapRaster,
      copies,
      printBoundary,
    });
  }, [canvasDoc, bitmapRaster, copies, printBoundary]);

  // Viewport scale
  const viewportWidthPx = 340;
  const viewportHeightPx = 220;
  const baseScale = computeScreenFitScale(
    labelWidthMm,
    labelHeightMm,
    viewportWidthPx,
    viewportHeightPx,
    16,
  );

  const canvasWidthPx = labelWidthMm * baseScale;
  const canvasHeightPx = labelHeightMm * baseScale;

  // Print Handler
  const handlePrint = async () => {
    if (!connected) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect to your thermal label printer in the connection screen before printing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    setPrinting(true);
    try {
      const pm = getPrinterManager();
      await pm.printRawTspl(jobResult.binaryPayload);
      Alert.alert(
        'Print Job Sent',
        `Atomic Phase 7 label job sent to ${deviceName || 'printer'}.\n\n` +
          `• Label: ${labelWidthMm}×${labelHeightMm} mm\n` +
          `• Raster: ${bitmapRaster ? `${bitmapRaster.widthDots}×${bitmapRaster.heightDots} dots` : 'None'}\n` +
          `• Payload: ${jobResult.totalBytes} bytes\n\n` +
          'Caliper Verification: Confirm outer boundaries match mm specs exactly.',
      );
    } catch (err: unknown) {
      Alert.alert('Print Error', err instanceof Error ? err.message : String(err));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <AppIcon name="chevron.left" size={24} tintColor="#FFFFFF" />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>End-to-End Pipeline</Text>
          <Text style={styles.headerSubtitle}>Phase 7 · Universal Label Engine</Text>
        </View>
        <View
          style={[
            styles.connDot,
            { backgroundColor: connected ? '#10B981' : '#232936' },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        {/* Status & Printer Banner */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <AppIcon
                name={connected ? 'printer.fill' : 'printer'}
                size={18}
                tintColor={connected ? '#10B981' : '#8A92A6'}
              />
              <Text style={styles.statusDevice}>
                {connected ? (deviceName ?? 'Thermal Printer Connected') : 'No Printer Connected'}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {PRINTER_DPI} DPI · {DOTS_PER_MM.toFixed(2)} d/mm
              </Text>
            </View>
          </View>
        </View>

        {/* Size Presets & Custom Inputs */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>LABEL GEOMETRY (MILLIMETERS)</Text>
          <View style={styles.presetRow}>
            {PRESET_SIZES.map((p) => {
              const active = labelWidthMm === p.w && labelHeightMm === p.h;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => {
                    setLabelWidthMm(p.w);
                    setLabelHeightMm(p.h);
                    setGapMm(p.gap);
                  }}
                  style={[styles.presetBtn, active && styles.presetBtnActive]}>
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(labelWidthMm)}
                onChangeText={(t) => setLabelWidthMm(Math.max(10, parseFloat(t) || 10))}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(labelHeightMm)}
                onChangeText={(t) => setLabelHeightMm(Math.max(10, parseFloat(t) || 10))}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Gap (mm)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(gapMm)}
                onChangeText={(t) => setGapMm(Math.max(0, parseFloat(t) || 0))}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Copies</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(copies)}
                onChangeText={(t) => setCopies(Math.max(1, parseInt(t, 10) || 1))}
              />
            </View>
          </View>
        </View>

        {/* Raster Pattern & Options */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>BACKGROUND 1-BIT RASTER</Text>
          <View style={styles.presetRow}>
            {(['none', 'checker', 'border', 'solid'] as RasterPattern[]).map((pattern) => {
              const active = rasterPattern === pattern;
              return (
                <Pressable
                  key={pattern}
                  onPress={() => setRasterPattern(pattern)}
                  style={[styles.patternBtn, active && styles.patternBtnActive]}>
                  <Text style={[styles.patternText, active && styles.patternTextActive]}>
                    {pattern === 'none'
                      ? 'No Raster'
                      : pattern === 'checker'
                        ? 'Checker'
                        : pattern === 'border'
                          ? 'Border'
                          : 'Solid Ink'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setPrintBoundary(!printBoundary)}
            style={styles.checkboxRow}>
            <View style={[styles.checkbox, printBoundary && styles.checkboxActive]}>
              {printBoundary && <AppIcon name="checkmark" size={14} tintColor="#000" />}
            </View>
            <Text style={styles.checkboxLabel}>Print 0.35mm Caliper Boundary Box</Text>
          </Pressable>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('preview')}
            style={[styles.tabBtn, activeTab === 'preview' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'preview' && styles.tabTextActive]}>
              Visual Preview
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('inspector')}
            style={[styles.tabBtn, activeTab === 'inspector' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'inspector' && styles.tabTextActive]}>
              TSPL Wire ({jobResult.totalBytes} B)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('elements')}
            style={[styles.tabBtn, activeTab === 'elements' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, activeTab === 'elements' && styles.tabTextActive]}>
              Elements ({elements.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab 1: Visual Preview */}
        {activeTab === 'preview' && (
          <View style={styles.canvasContainer}>
            <View
              style={[
                styles.canvasWrapper,
                {
                  width: canvasWidthPx,
                  height: canvasHeightPx,
                },
              ]}>
              {/* Optional Background Raster Simulation */}
              {rasterPattern !== 'none' && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      opacity: 0.12,
                      backgroundColor: rasterPattern === 'solid' ? '#000' : 'transparent',
                    },
                  ]}>
                  {rasterPattern === 'checker' && (
                    <Svg width="100%" height="100%">
                      {Array.from({ length: 12 }).map((_, r) =>
                        Array.from({ length: 20 }).map((__, c) =>
                          (r + c) % 2 === 0 ? (
                            <Rect
                              key={`${r}-${c}`}
                              x={c * 16}
                              y={r * 16}
                              width={16}
                              height={16}
                              fill="#000"
                            />
                          ) : null,
                        ),
                      )}
                    </Svg>
                  )}
                  {rasterPattern === 'border' && (
                    <View
                      style={[
                        StyleSheet.absoluteFillObject,
                        { borderWidth: 4, borderColor: '#000' },
                      ]}
                    />
                  )}
                </View>
              )}

              {/* Boundary Box */}
              {printBoundary && (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { borderWidth: 1, borderColor: '#111' },
                  ]}
                />
              )}

              {/* Render Vector Overlay Elements */}
              {elements.map((el) => {
                const elLeftPx = el.left * baseScale;
                const elTopPx = el.top * baseScale;

                if (el.type === 'text') {
                  const txt = el as CanvasTextElement;
                  const fontRes = resolveTsplFont(txt.fontSize);
                  const fontHeightPx = fontRes.capHeightMm * baseScale;
                  return (
                    <View
                      key={txt.id}
                      style={[
                        styles.canvasElement,
                        { left: elLeftPx, top: elTopPx },
                      ]}>
                      <Text
                        style={[
                          styles.canvasText,
                          {
                            fontSize: Math.max(8, Math.round(fontHeightPx * 1.35)),
                            lineHeight: Math.max(10, Math.round(fontHeightPx * 1.4)),
                          },
                        ]}>
                        {txt.text}
                      </Text>
                    </View>
                  );
                }

                if (el.type === 'barcode') {
                  const bc = el as CanvasBarcodeElement;
                  const bcHeightPx = bc.height * baseScale;
                  const bars = barcodeBarsForMode(bc.data, '128') ?? [];
                  const narrowPx = 2 * (baseScale / DOTS_PER_MM);

                  return (
                    <View
                      key={bc.id}
                      style={[
                        styles.canvasElement,
                        { left: elLeftPx, top: elTopPx, height: bcHeightPx },
                      ]}>
                      <Svg
                        width={bars.length * narrowPx}
                        height={bcHeightPx - 10}>
                        {bars.map((isBar, idx) =>
                          isBar ? (
                            <Rect
                              key={idx}
                              x={idx * narrowPx}
                              y={0}
                              width={narrowPx}
                              height={bcHeightPx - 10}
                              fill="#000"
                            />
                          ) : null,
                        )}
                      </Svg>
                      {bc.readable === 1 && (
                        <Text style={styles.barcodeReadable}>{bc.data}</Text>
                      )}
                    </View>
                  );
                }

                if (el.type === 'qr') {
                  const qr = el as CanvasQrElement;
                  const qrSizePx = qr.sizeMm * baseScale;
                  return (
                    <View
                      key={qr.id}
                      style={[
                        styles.canvasElement,
                        { left: elLeftPx, top: elTopPx },
                      ]}>
                      <QRCode
                        value={qr.data}
                        size={Math.max(20, Math.round(qrSizePx))}
                        color="#000"
                        backgroundColor="transparent"
                      />
                    </View>
                  );
                }

                return null;
              })}
            </View>
            <Text style={styles.scaleInfo}>
              Scale: {baseScale.toFixed(2)} px/mm · Physical: {labelWidthMm}×{labelHeightMm} mm
            </Text>
          </View>
        )}

        {/* Tab 2: TSPL Inspector */}
        {activeTab === 'inspector' && (
          <View style={styles.inspectorContainer}>
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>{jobResult.totalBytes} B</Text>
                <Text style={styles.metricLbl}>Total Payload</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>
                  {Math.round(labelWidthMm * DOTS_PER_MM)} × {Math.round(labelHeightMm * DOTS_PER_MM)}
                </Text>
                <Text style={styles.metricLbl}>Total Dots (304DPI)</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>
                  {bitmapRaster ? `${bitmapRaster.data.length} B` : 'None'}
                </Text>
                <Text style={styles.metricLbl}>Raster Buffer</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>DIRECTION 1</Text>
                <Text style={styles.metricLbl}>Orientation</Text>
              </View>
            </View>

            <View style={styles.terminalBox}>
              <View style={styles.terminalHeader}>
                <View style={styles.terminalDots}>
                  <View style={[styles.terminalDot, { backgroundColor: '#FF5F56' }]} />
                  <View style={[styles.terminalDot, { backgroundColor: '#FFBD2E' }]} />
                  <View style={[styles.terminalDot, { backgroundColor: '#27C93F' }]} />
                </View>
                <Text style={styles.terminalTitle}>TSPL Command Stream</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.terminalScroll}>
                <Text style={styles.terminalCode}>{jobResult.tsplAscii}</Text>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Tab 3: Elements List */}
        {activeTab === 'elements' && (
          <View style={styles.elementsContainer}>
            {elements.map((el, i) => {
              let details = '';
              let scannable = true;

              if (el.type === 'text') {
                const t = el as CanvasTextElement;
                const fontRes = resolveTsplFont(t.fontSize);
                details = `Font ${fontRes.font} (${t.fontSize}pt), ${fontRes.capHeightMm}mm cap-height`;
              } else if (el.type === 'barcode') {
                const b = el as CanvasBarcodeElement;
                const res = validateScannability(b, labelWidthMm, labelHeightMm);
                scannable = res.isScannable;
                details = `Code 128, H:${b.height}mm, W:~${res.calculatedWidthMm}mm`;
              } else if (el.type === 'qr') {
                const q = el as CanvasQrElement;
                const res = validateScannability(q, labelWidthMm, labelHeightMm);
                scannable = res.isScannable;
                details = `QR ${q.sizeMm}mm (~${res.calculatedWidthMm}mm footprint)`;
              }

              return (
                <View key={el.id} style={styles.elementCard}>
                  <View style={styles.elementHeader}>
                    <Text style={styles.elementIndex}>#{i + 1}</Text>
                    <Text style={styles.elementType}>{(el.type ?? 'box').toUpperCase()}</Text>
                    <View
                      style={[
                        styles.scanBadge,
                        { backgroundColor: scannable ? '#0D331A' : '#3D1515' },
                      ]}>
                      <Text
                        style={[
                          styles.scanBadgeText,
                          { color: scannable ? '#10B981' : '#EF4444' },
                        ]}>
                        {scannable ? 'VALID' : 'WARNING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.elementPos}>
                    Position: ({el.left}mm, {el.top}mm)
                  </Text>
                  <Text style={styles.elementDetail}>{details}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <Pressable
          onPress={handlePrint}
          disabled={printing}
          style={({ pressed }) => [
            styles.printBtn,
            pressed && styles.printBtnPressed,
            printing && styles.printBtnDisabled,
          ]}>
          {printing ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <View style={styles.btnInner}>
              <AppIcon name="printer.fill" size={20} tintColor="#000" />
              <Text style={styles.printBtnText}>
                {connected ? `Print ${copies}× Full Label Job` : 'Connect & Print Label'}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2330',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E2330',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8A92A6',
    fontSize: 12,
  },
  connDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scrollContent: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#232936',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDevice: {
    color: '#E1E4EA',
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: '#202636',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#232936',
  },
  sectionLabel: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#202636',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetBtnActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  presetText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  presetTextActive: {
    color: '#FFF',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    color: '#8A92A6',
    fontSize: 11,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#2D3548',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  patternBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#202636',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  patternBtnActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  patternText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  patternTextActive: {
    color: '#FFF',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkboxLabel: {
    color: '#D1D5DB',
    fontSize: 12,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#161922',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
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
    backgroundColor: '#202636',
  },
  tabText: {
    color: '#8A92A6',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFF',
  },
  canvasContainer: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#232936',
    minHeight: 250,
  },
  canvasWrapper: {
    backgroundColor: '#FFF',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  canvasElement: {
    position: 'absolute',
  },
  canvasText: {
    color: '#000',
    fontWeight: '700',
  },
  barcodeReadable: {
    color: '#000',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.5,
  },
  scaleInfo: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 12,
  },
  inspectorContainer: {
    gap: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#161922',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#232936',
  },
  metricVal: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '700',
  },
  metricLbl: {
    color: '#8A92A6',
    fontSize: 10,
    marginTop: 2,
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
    maxHeight: 240,
  },
  terminalCode: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#10B981',
    lineHeight: 16,
  },
  elementsContainer: {
    gap: 8,
  },
  elementCard: {
    backgroundColor: '#161922',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#232936',
  },
  elementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  elementIndex: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  elementType: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  scanBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scanBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  elementPos: {
    color: '#8A92A6',
    fontSize: 11,
    marginBottom: 2,
  },
  elementDetail: {
    color: '#D1D5DB',
    fontSize: 12,
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
  printBtnPressed: {
    opacity: 0.85,
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
