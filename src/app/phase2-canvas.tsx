/**
 * Phase 2 — Canvas Foundation Screen
 *
 * Requirements:
 * 1. User can input label width/height in mm.
 * 2. Canvas renders a rectangle at that size, scaled to fit screen (screen px = mm × scale, with visual zoom factor).
 * 3. Box element draggable and resizable on screen.
 * 4. Stored state is strictly physical millimetres. Screen px is derived for rendering.
 * 5. Wired directly to Phase 1 TSPL builder for instant on-device printing and inspection.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import { Spacing } from '@/constants/theme';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { PRINTER_DPI, DOTS_PER_MM } from '@/printing/calibration';
import {
  exportCanvasToTspl,
  mmToScreenPx,
  computeScreenFitScale,
  type CanvasBoxElement,
  type CanvasDocument,
} from '@/printing/canvas-export';

const PRESET_LABEL_SIZES = [
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '40×30 mm', w: 40, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×50 mm', w: 80, h: 50 },
  { label: '100×150 mm', w: 100, h: 150 },
];

const ZOOM_LEVELS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function Phase2CanvasScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Label physical dimensions (mm)
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // Text inputs for direct mm typing
  const [widthInput, setWidthInput] = useState<string>('50');
  const [heightInput, setHeightInput] = useState<string>('30');
  const [gapInput, setGapInput] = useState<string>('2');

  // Zoom factor (purely visual transform)
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);

  // Single Box element — true state stored strictly in mm
  const [box, setBox] = useState<CanvasBoxElement>({
    id: 'box-phase2',
    type: 'box',
    left: 5,
    top: 5,
    width: 40,
    height: 20,
    lineWidth: 0.35,
  });

  const [printing, setPrinting] = useState<boolean>(false);

  // Viewport layout width for contain-fitting
  const [viewportWidth, setViewportWidth] = useState<number>(340);
  const viewportHeight = 220;

  // Base contain-fit scale (screen px per mm)
  const baseScale = useMemo(() => {
    return computeScreenFitScale(labelWidthMm, labelHeightMm, viewportWidth, viewportHeight, 16);
  }, [labelWidthMm, labelHeightMm, viewportWidth]);

  // Screen canvas dimensions
  const canvasWidthPx = Math.round(labelWidthMm * baseScale);
  const canvasHeightPx = Math.round(labelHeightMm * baseScale);

  // Derived screen px for the box (effective scale includes zoom)
  const boxLeftPx = Math.round(box.left * baseScale);
  const boxTopPx = Math.round(box.top * baseScale);
  const boxWidthPx = Math.max(10, Math.round(box.width * baseScale));
  const boxHeightPx = Math.max(10, Math.round(box.height * baseScale));
  const strokeWidthPx = Math.max(1, Math.round((box.lineWidth ?? 0.35) * baseScale));

  // Derived printer dots (at PRINTER_DPI 304)
  const boxX0Dots = Math.round(box.left * DOTS_PER_MM);
  const boxY0Dots = Math.round(box.top * DOTS_PER_MM);
  const boxX1Dots = Math.round((box.left + box.width) * DOTS_PER_MM);
  const boxY1Dots = Math.round((box.top + box.height) * DOTS_PER_MM);
  const strokeDots = Math.max(1, Math.round((box.lineWidth ?? 0.35) * DOTS_PER_MM));

  // References for drag/resize gesture tracking
  const dragStartRef = useRef<{ left: number; top: number }>({ left: 5, top: 5 });
  const resizeStartRef = useRef<{ width: number; height: number }>({ width: 40, height: 20 });

  // PanResponder for dragging the box on screen
  const dragPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = { left: box.left, top: box.top };
        },
        onPanResponderMove: (_e, gestureState) => {
          const effectiveScale = baseScale * zoomFactor;
          if (effectiveScale <= 0) return;
          const deltaLeftMm = gestureState.dx / effectiveScale;
          const deltaTopMm = gestureState.dy / effectiveScale;

          const maxLeft = Math.max(0, labelWidthMm - box.width);
          const maxTop = Math.max(0, labelHeightMm - box.height);

          const nextLeft = Math.max(0, Math.min(maxLeft, dragStartRef.current.left + deltaLeftMm));
          const nextTop = Math.max(0, Math.min(maxTop, dragStartRef.current.top + deltaTopMm));

          setBox((prev) => ({
            ...prev,
            left: Math.round(nextLeft * 10) / 10,
            top: Math.round(nextTop * 10) / 10,
          }));
        },
      }),
    [baseScale, zoomFactor, labelWidthMm, labelHeightMm, box.width, box.height, box.left, box.top],
  );

  // PanResponder for resizing the box via bottom-right handle
  const resizePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          resizeStartRef.current = { width: box.width, height: box.height };
        },
        onPanResponderMove: (_e, gestureState) => {
          const effectiveScale = baseScale * zoomFactor;
          if (effectiveScale <= 0) return;
          const deltaWMm = gestureState.dx / effectiveScale;
          const deltaHMm = gestureState.dy / effectiveScale;

          const maxW = Math.max(2, labelWidthMm - box.left);
          const maxH = Math.max(2, labelHeightMm - box.top);

          const nextW = Math.max(2, Math.min(maxW, resizeStartRef.current.width + deltaWMm));
          const nextH = Math.max(2, Math.min(maxH, resizeStartRef.current.height + deltaHMm));

          setBox((prev) => ({
            ...prev,
            width: Math.round(nextW * 10) / 10,
            height: Math.round(nextH * 10) / 10,
          }));
        },
      }),
    [baseScale, zoomFactor, labelWidthMm, labelHeightMm, box.left, box.top, box.width, box.height],
  );

  // Generate TSPL payload via Phase 1 TsplBuilder
  const tsplPayload = useMemo(() => {
    const doc: CanvasDocument = {
      widthMm: labelWidthMm,
      heightMm: labelHeightMm,
      gapMm,
      direction: 1,
      elements: [box],
    };
    return exportCanvasToTspl(doc);
  }, [labelWidthMm, labelHeightMm, gapMm, box]);

  // Apply label size inputs
  const handleApplyLabelSize = useCallback(() => {
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    const g = parseFloat(gapInput);

    if (isNaN(w) || w < 10 || w > 150 || isNaN(h) || h < 10 || h > 200) {
      Alert.alert('Invalid Label Size', 'Width must be 10-150 mm and height must be 10-200 mm.');
      return;
    }

    const nextW = Math.round(w * 10) / 10;
    const nextH = Math.round(h * 10) / 10;
    const nextG = isNaN(g) ? 2 : Math.max(0, Math.min(10, g));

    setLabelWidthMm(nextW);
    setLabelHeightMm(nextH);
    setGapMm(nextG);

    // Adjust box so it stays within new label bounds
    setBox((prev) => {
      const bw = Math.min(prev.width, nextW);
      const bh = Math.min(prev.height, nextH);
      const bl = Math.min(prev.left, nextW - bw);
      const bt = Math.min(prev.top, nextH - bh);
      return {
        ...prev,
        width: Math.round(bw * 10) / 10,
        height: Math.round(bh * 10) / 10,
        left: Math.round(bl * 10) / 10,
        top: Math.round(bt * 10) / 10,
      };
    });
  }, [widthInput, heightInput, gapInput]);

  const handleSelectPreset = (w: number, h: number) => {
    setWidthInput(String(w));
    setHeightInput(String(h));
    setLabelWidthMm(w);
    setLabelHeightMm(h);
    setBox((prev) => ({
      ...prev,
      width: Math.min(prev.width, w - 4),
      height: Math.min(prev.height, h - 4),
      left: Math.min(prev.left, w - (prev.width || 10)),
      top: Math.min(prev.top, h - (prev.height || 10)),
    }));
  };

  // Center box on label
  const handleCenterBox = () => {
    const nextLeft = Math.max(0, (labelWidthMm - box.width) / 2);
    const nextTop = Math.max(0, (labelHeightMm - box.height) / 2);
    setBox((prev) => ({
      ...prev,
      left: Math.round(nextLeft * 10) / 10,
      top: Math.round(nextTop * 10) / 10,
    }));
  };

  // Print directly via printer manager
  const handlePrint = async () => {
    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect to your thermal printer via Bluetooth or Wi-Fi to execute physical test prints.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Connect', onPress: () => router.push('/printer-connect') },
        ],
      );
      return;
    }

    try {
      setPrinting(true);
      await manager.printRawTspl(tsplPayload);
      Alert.alert(
        'Print Sent',
        `Phase 2 TSPL box command sent successfully!\n\nTarget Box Size: ${box.width} × ${box.height} mm\nTarget Position: (${box.left}, ${box.top}) mm\n\nVerify with ruler / calipers (±0.5mm).`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Print Error', `Failed to send TSPL: ${msg}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <AppIcon name="chevron.left" size={24} tintColor="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Phase 2 — Canvas Foundation</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Connection status */}
        <View style={[styles.statusBadge, connected ? styles.statusConnected : styles.statusDisconnected]}>
          <Text style={styles.statusText}>
            {connected ? `Connected: ${deviceName ?? 'Printer'}` : 'Printer Not Connected'}
          </Text>
        </View>

        {/* Section 1: Label Dimensions (mm) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Label Size (mm)</Text>
          <Text style={styles.cardDesc}>
            Ground-truth dimensions live in physical millimetres.
          </Text>

          {/* Presets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {PRESET_LABEL_SIZES.map((p) => {
                const isActive = labelWidthMm === p.w && labelHeightMm === p.h;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => handleSelectPreset(p.w, p.h)}
                    style={[styles.sizeChip, isActive && styles.sizeChipActive]}>
                    <Text style={[styles.sizeChipText, isActive && styles.sizeChipTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Direct mm inputs */}
          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm)</Text>
              <TextInput
                value={widthInput}
                onChangeText={setWidthInput}
                keyboardType="numeric"
                style={styles.textInput}
                placeholder="50"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm)</Text>
              <TextInput
                value={heightInput}
                onChangeText={setHeightInput}
                keyboardType="numeric"
                style={styles.textInput}
                placeholder="30"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Gap (mm)</Text>
              <TextInput
                value={gapInput}
                onChangeText={setGapInput}
                keyboardType="numeric"
                style={styles.textInput}
                placeholder="2"
              />
            </View>
            <Pressable onPress={handleApplyLabelSize} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>

        {/* Section 2: Visual Canvas & Viewport Zoom */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>2. Screen Canvas (mm-driven)</Text>
            {/* Zoom selector */}
            <View style={styles.zoomRow}>
              <Text style={styles.zoomLabel}>Zoom: </Text>
              {ZOOM_LEVELS.map((z) => (
                <Pressable
                  key={z}
                  onPress={() => setZoomFactor(z)}
                  style={[styles.zoomChip, zoomFactor === z && styles.zoomChipActive]}>
                  <Text style={[styles.zoomChipText, zoomFactor === z && styles.zoomChipTextActive]}>
                    {z}x
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={styles.cardDesc}>
            Base scale: {baseScale.toFixed(2)} px/mm | Zoom: {zoomFactor}x | Effective: {(baseScale * zoomFactor).toFixed(2)} px/mm
          </Text>

          {/* Interactive Canvas Artboard Container */}
          <View
            style={styles.canvasContainer}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 50) setViewportWidth(w);
            }}>
            <View
              style={[
                styles.artboard,
                {
                  width: canvasWidthPx * zoomFactor,
                  height: canvasHeightPx * zoomFactor,
                },
              ]}>
              {/* Outer label boundary */}
              <Svg
                width={canvasWidthPx * zoomFactor}
                height={canvasHeightPx * zoomFactor}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none">
                <Rect
                  x={1}
                  y={1}
                  width={canvasWidthPx * zoomFactor - 2}
                  height={canvasHeightPx * zoomFactor - 2}
                  stroke="#CBD5E1"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  fill="#FFFFFF"
                />
              </Svg>

              {/* Draggable Box Element */}
              <View
                {...dragPanResponder.panHandlers}
                style={[
                  styles.boxElement,
                  {
                    left: boxLeftPx * zoomFactor,
                    top: boxTopPx * zoomFactor,
                    width: boxWidthPx * zoomFactor,
                    height: boxHeightPx * zoomFactor,
                    borderWidth: Math.max(1, strokeWidthPx * zoomFactor),
                  },
                ]}>
                <View style={styles.boxLabelBadge}>
                  <Text style={styles.boxBadgeText}>
                    {box.width}×{box.height} mm
                  </Text>
                </View>

                {/* Resize Handle (bottom-right) */}
                <View {...resizePanResponder.panHandlers} style={styles.resizeHandle}>
                  <View style={styles.handleKnob} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={handleCenterBox} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Center Box</Text>
            </Pressable>
            <Text style={styles.hintText}>
              Drag box to reposition • Drag blue handle to resize
            </Text>
          </View>
        </View>

        {/* Section 3: Coordinate Systems Inspector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>3. Triple-Coordinate Inspection</Text>
          <Text style={styles.cardDesc}>
            Shows exact translation between physical mm, screen px, and printer dots.
          </Text>

          <View style={styles.coordGrid}>
            <View style={styles.coordCol}>
              <Text style={styles.coordHeader}>Ground-Truth (mm)</Text>
              <Text style={styles.coordItem}>Left: {box.left.toFixed(2)} mm</Text>
              <Text style={styles.coordItem}>Top: {box.top.toFixed(2)} mm</Text>
              <Text style={styles.coordItem}>Width: {box.width.toFixed(2)} mm</Text>
              <Text style={styles.coordItem}>Height: {box.height.toFixed(2)} mm</Text>
              <Text style={styles.coordItem}>Stroke: {box.lineWidth} mm</Text>
            </View>

            <View style={styles.coordCol}>
              <Text style={styles.coordHeader}>Screen Render (px)</Text>
              <Text style={styles.coordItem}>X: {(boxLeftPx * zoomFactor).toFixed(1)} px</Text>
              <Text style={styles.coordItem}>Y: {(boxTopPx * zoomFactor).toFixed(1)} px</Text>
              <Text style={styles.coordItem}>W: {(boxWidthPx * zoomFactor).toFixed(1)} px</Text>
              <Text style={styles.coordItem}>H: {(boxHeightPx * zoomFactor).toFixed(1)} px</Text>
              <Text style={styles.coordItem}>Scale: {(baseScale * zoomFactor).toFixed(2)} px/mm</Text>
            </View>

            <View style={styles.coordCol}>
              <Text style={styles.coordHeader}>Printer Dots (304 DPI)</Text>
              <Text style={styles.coordItem}>x0: {boxX0Dots} dots</Text>
              <Text style={styles.coordItem}>y0: {boxY0Dots} dots</Text>
              <Text style={styles.coordItem}>x1: {boxX1Dots} dots</Text>
              <Text style={styles.coordItem}>y1: {boxY1Dots} dots</Text>
              <Text style={styles.coordItem}>Thick: {strokeDots} dots</Text>
            </View>
          </View>
        </View>

        {/* Section 4: Live TSPL Script Preview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>4. Live Generated TSPL</Text>
          <Text style={styles.cardDesc}>
            Built via Phase 1 TsplBuilder with physical mm inputs.
          </Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{tsplPayload.trim()}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Print Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          disabled={printing}
          onPress={handlePrint}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>
              Print Phase 2 Box via TSPL ({box.width}×{box.height} mm)
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
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
  scrollContent: { padding: 16, gap: 16 },

  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusConnected: { backgroundColor: '#DCFCE7' },
  statusDisconnected: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748B', marginBottom: 12 },

  chipScroll: { marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 8 },
  sizeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sizeChipActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  sizeChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  sizeChipTextActive: { color: '#FFFFFF' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 4 },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  applyBtn: {
    height: 38,
    paddingHorizontal: 14,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  zoomChip: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  zoomChipActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  zoomChipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  zoomChipTextActive: { color: '#FFFFFF' },

  canvasContainer: {
    minHeight: 220,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'hidden',
  },
  artboard: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  boxElement: {
    position: 'absolute',
    borderColor: '#0F172A',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  boxLabelBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  boxBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  resizeHandle: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleKnob: {
    width: 14,
    height: 14,
    backgroundColor: Palette.accent,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 7,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  secondaryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  hintText: { fontSize: 11, color: '#64748B', flex: 1, textAlign: 'right', marginLeft: 8 },

  coordGrid: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coordCol: { flex: 1 },
  coordHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.accent,
    marginBottom: 6,
  },
  coordItem: { fontSize: 10, color: '#334155', marginBottom: 2, fontFamily: 'monospace' },

  codeBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },

  footer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  printBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
