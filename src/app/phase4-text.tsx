/**
 * Phase 4 — Text Elements Screen
 *
 * Requirements:
 * 1. Add text element type: position (mm), font size, content, editable.
 * 2. Ensure font size in canvas preview visually matches the font size TSPL prints.
 * 3. Text element mm position/size stored in physical mm data model.
 * 4. Caliper cap-height agreement between screen preview and paper within ±0.5 mm.
 * 5. Full end-to-end TSPL printing via PrinterManager.
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
import { DOTS_PER_MM } from '@/printing/calibration';
import {
  computeScreenFitScale,
  resolveTsplFont,
  exportCanvasToTspl,
  type CanvasTextElement,
  type CanvasDocument,
} from '@/printing/canvas-export';

const PRESET_SIZES = [
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '40×30 mm', w: 40, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×50 mm', w: 80, h: 50 },
  { label: '100×150 mm', w: 100, h: 150 },
];

const FONT_PRESETS = [
  { pt: 8, label: '8 pt (1.67 mm)' },
  { pt: 10, label: '10 pt (2.01 mm)' },
  { pt: 12, label: '12 pt (2.01 mm)' },
  { pt: 14, label: '14 pt (2.67 mm)' },
  { pt: 18, label: '18 pt (4.01 mm)' },
  { pt: 24, label: '24 pt (5.35 mm)' },
  { pt: 36, label: '36 pt (8.02 mm)' },
];

const ZOOM_LEVELS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function Phase4TextScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Label dimensions (mm)
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // Text inputs
  const [widthInput, setWidthInput] = useState<string>('50');
  const [heightInput, setHeightInput] = useState<string>('30');
  const [gapInput, setGapInput] = useState<string>('2');

  // Zoom factor
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [viewportWidth, setViewportWidth] = useState<number>(340);
  const viewportHeight = 220;

  // Multiple text elements — true state in physical mm
  const [elements, setElements] = useState<CanvasTextElement[]>([
    { id: 't1', type: 'text', text: 'SAMPLE PRODUCT', left: 4, top: 4, fontSize: 18 },
    { id: 't2', type: 'text', text: 'SKU: 7788-ABC', left: 4, top: 12, fontSize: 12 },
    { id: 't3', type: 'text', text: '$29.99', left: 4, top: 19, fontSize: 24 },
  ]);

  const [selectedId, setSelectedId] = useState<string>('t1');
  const [includeBorder, setIncludeBorder] = useState<boolean>(true);
  const [printing, setPrinting] = useState<boolean>(false);

  // Selected element
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) || elements[0],
    [elements, selectedId],
  );

  // Scale (screen px per mm)
  const baseScale = useMemo(() => {
    return computeScreenFitScale(labelWidthMm, labelHeightMm, viewportWidth, viewportHeight, 16);
  }, [labelWidthMm, labelHeightMm, viewportWidth]);

  const canvasWidthPx = Math.round(labelWidthMm * baseScale);
  const canvasHeightPx = Math.round(labelHeightMm * baseScale);

  // Gesture tracking refs
  const dragStartRef = useRef<{ id: string; left: number; top: number }>({ id: '', left: 0, top: 0 });

  // PanResponder factory for dragging an element
  const createTextPanResponder = (el: CanvasTextElement) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setSelectedId(el.id);
        dragStartRef.current = { id: el.id, left: el.left, top: el.top };
      },
      onPanResponderMove: (_e, gestureState) => {
        const effectiveScale = baseScale * zoomFactor;
        if (effectiveScale <= 0) return;
        const deltaLeft = gestureState.dx / effectiveScale;
        const deltaTop = gestureState.dy / effectiveScale;

        const maxLeft = Math.max(0, labelWidthMm - 5);
        const maxTop = Math.max(0, labelHeightMm - 3);

        const nextLeft = Math.max(0, Math.min(maxLeft, dragStartRef.current.left + deltaLeft));
        const nextTop = Math.max(0, Math.min(maxTop, dragStartRef.current.top + deltaTop));

        setElements((prev) =>
          prev.map((item) =>
            item.id === el.id
              ? {
                  ...item,
                  left: Math.round(nextLeft * 10) / 10,
                  top: Math.round(nextTop * 10) / 10,
                }
              : item,
          ),
        );
      },
    });

  // Selected element editors
  const handleUpdateText = (text: string) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement?.id ? { ...el, text } : el)),
    );
  };

  const handleUpdateFontSize = (fontSize: number) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement?.id ? { ...el, fontSize } : el)),
    );
  };

  const handleUpdatePos = (field: 'left' | 'top', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setElements((prev) =>
        prev.map((el) => (el.id === selectedElement?.id ? { ...el, [field]: num } : el)),
      );
    }
  };

  const handleAddText = () => {
    const newId = `t_${Date.now().toString(36)}`;
    const newEl: CanvasTextElement = {
      id: newId,
      type: 'text',
      text: 'New Text',
      left: 4,
      top: Math.min(labelHeightMm - 6, 4 + elements.length * 6),
      fontSize: 12,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newId);
  };

  const handleDeleteSelected = () => {
    if (elements.length <= 1) {
      Alert.alert('Cannot Delete', 'At least one text element must remain.');
      return;
    }
    setElements((prev) => prev.filter((el) => el.id !== selectedElement?.id));
    setSelectedId(elements.find((el) => el.id !== selectedElement?.id)?.id || '');
  };

  // Preset dimension handler
  const handleSelectPreset = (w: number, h: number) => {
    setWidthInput(String(w));
    setHeightInput(String(h));
    setLabelWidthMm(w);
    setLabelHeightMm(h);
  };

  const handleApplyDimensions = () => {
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    const g = parseFloat(gapInput);
    if (!isNaN(w) && w >= 10 && w <= 200 && !isNaN(h) && h >= 10 && h <= 250) {
      setLabelWidthMm(w);
      setLabelHeightMm(h);
      if (!isNaN(g)) setGapMm(g);
    }
  };

  // Generate TSPL payload
  const tsplPayload = useMemo(() => {
    const doc: CanvasDocument = {
      widthMm: labelWidthMm,
      heightMm: labelHeightMm,
      gapMm,
      direction: 1,
      elements: [
        ...(includeBorder
          ? [
              {
                id: 'border-box',
                type: 'box' as const,
                left: 1,
                top: 1,
                width: labelWidthMm - 2,
                height: labelHeightMm - 2,
                lineWidth: 0.35,
              },
            ]
          : []),
        ...elements,
      ],
    };
    return exportCanvasToTspl(doc);
  }, [labelWidthMm, labelHeightMm, gapMm, elements, includeBorder]);

  // Print via printer manager
  const handlePrint = async () => {
    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Connect your thermal printer via Bluetooth or Wi-Fi before executing physical test prints.',
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
        'Text Label Printed',
        `Phase 4 TSPL text label sent successfully!\n\nCheck calipers on physical print:\n- Measure baseline positions against preview\n- Verify letter cap-heights within ±0.5 mm.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Print Error', msg);
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
        <Text style={styles.headerTitle}>Phase 4 — Text Elements</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status Badge */}
        <View style={[styles.statusBadge, connected ? styles.statusConnected : styles.statusDisconnected]}>
          <Text style={styles.statusText}>
            {connected ? `Connected: ${deviceName ?? 'Printer'}` : 'Printer Not Connected'}
          </Text>
        </View>

        {/* Section 1: Label Dimensions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Label Size (mm)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {PRESET_SIZES.map((p) => {
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

          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm)</Text>
              <TextInput
                value={widthInput}
                onChangeText={setWidthInput}
                keyboardType="numeric"
                style={styles.textInput}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm)</Text>
              <TextInput
                value={heightInput}
                onChangeText={setHeightInput}
                keyboardType="numeric"
                style={styles.textInput}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Gap (mm)</Text>
              <TextInput
                value={gapInput}
                onChangeText={setGapInput}
                keyboardType="numeric"
                style={styles.textInput}
              />
            </View>
            <Pressable onPress={handleApplyDimensions} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>

        {/* Section 2: Selected Text Element Editor */}
        {selectedElement ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>2. Edit Text: "{selectedElement.text}"</Text>
              <Pressable onPress={handleDeleteSelected} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>

            {/* Text content input */}
            <Text style={styles.inputLabel}>Text Content</Text>
            <TextInput
              value={selectedElement.text}
              onChangeText={handleUpdateText}
              style={[styles.textInput, { marginBottom: 10 }]}
              placeholder="Enter text..."
            />

            {/* Font Size Selector */}
            <Text style={styles.inputLabel}>Font Size (TSPL Hardware Mapping)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <View style={styles.chipRow}>
                {FONT_PRESETS.map((f) => {
                  const isActive = selectedElement.fontSize === f.pt;
                  return (
                    <Pressable
                      key={f.pt}
                      onPress={() => handleUpdateFontSize(f.pt)}
                      style={[styles.fontChip, isActive && styles.fontChipActive]}>
                      <Text style={[styles.fontChipText, isActive && styles.fontChipTextActive]}>
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Font specs badge */}
            {(() => {
              const res = resolveTsplFont(selectedElement.fontSize);
              return (
                <View style={styles.fontSpecsBadge}>
                  <Text style={styles.fontSpecsText}>
                    TSPL Font "{res.font}" • Multiplier {res.xMulti}x{res.yMulti} • Cap Height: {res.capHeightMm.toFixed(2)} mm ({res.dotsHeight} dots)
                  </Text>
                </View>
              );
            })()}

            {/* Coordinate inputs */}
            <View style={[styles.inputRow, { marginTop: 10 }]}>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>Left (mm)</Text>
                <TextInput
                  value={String(selectedElement.left)}
                  onChangeText={(v) => handleUpdatePos('left', v)}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>Top (mm)</Text>
                <TextInput
                  value={String(selectedElement.top)}
                  onChangeText={(v) => handleUpdatePos('top', v)}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
              </View>
              <Pressable onPress={handleAddText} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add Line</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Section 3: Screen Canvas Preview */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>3. Canvas Preview</Text>
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
            Scale: {baseScale.toFixed(2)} px/mm | Visual cap-heights match physical TSPL fonts.
          </Text>

          {/* Artboard */}
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
              {/* Outer border indicator */}
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
                  stroke="#94A3B8"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  fill="#FFFFFF"
                />
              </Svg>

              {/* Render each text element */}
              {elements.map((el) => {
                const isSelected = el.id === selectedElement?.id;
                const fontRes = resolveTsplFont(el.fontSize);
                // Rendered CSS font size calibrated so capital letter height matches capHeightMm * scale * zoom
                const renderFontSize = Math.max(
                  8,
                  Math.round(fontRes.capHeightMm * baseScale * zoomFactor * 1.35),
                );
                const xPx = el.left * baseScale * zoomFactor;
                const yPx = el.top * baseScale * zoomFactor;
                const panResponder = createTextPanResponder(el);

                return (
                  <View
                    key={el.id}
                    {...panResponder.panHandlers}
                    style={[
                      styles.textItemWrap,
                      {
                        left: xPx,
                        top: yPx,
                      },
                      isSelected && styles.textItemSelected,
                    ]}>
                    <Text
                      style={[
                        styles.renderedText,
                        {
                          fontSize: renderFontSize,
                          lineHeight: renderFontSize * 1.15,
                        },
                      ]}>
                      {el.text}
                    </Text>
                    {isSelected ? (
                      <View style={styles.textSelectBadge}>
                        <Text style={styles.textSelectBadgeText}>
                          {fontRes.capHeightMm}mm
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          <Text style={styles.hintText}>
            Tap text to select • Drag text directly on canvas to reposition
          </Text>
        </View>

        {/* Section 4: Resolution & Coordinates Table */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>4. Font Resolution & Dot Coordinates</Text>
          <View style={styles.tableWrap}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeadCell, { flex: 2 }]}>Element / Text</Text>
              <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Position</Text>
              <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>TSPL Font</Text>
              <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>Cap Height</Text>
            </View>
            {elements.map((el) => {
              const res = resolveTsplFont(el.fontSize);
              const xDots = Math.round(el.left * DOTS_PER_MM);
              const yDots = Math.round(el.top * DOTS_PER_MM);
              return (
                <View key={el.id} style={styles.tableDataRow}>
                  <Text style={[styles.tableDataCell, { flex: 2, fontWeight: '600' }]} numberOfLines={1}>
                    {el.text}
                  </Text>
                  <Text style={[styles.tableDataCell, { flex: 1.2 }]}>
                    {el.left},{el.top} mm{'\n'}({xDots},{yDots} d)
                  </Text>
                  <Text style={[styles.tableDataCell, { flex: 1.5 }]}>
                    Font "{res.font}" ({res.xMulti}×{res.yMulti})
                  </Text>
                  <Text style={[styles.tableDataCell, { flex: 1.2, color: Palette.accent, fontWeight: '700' }]}>
                    {res.capHeightMm.toFixed(2)} mm
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Section 5: Live TSPL Script Preview */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>5. Live TSPL Script</Text>
            <Pressable onPress={() => setIncludeBorder((p) => !p)} style={styles.toggleBorderBtn}>
              <Text style={styles.toggleBorderText}>
                {includeBorder ? 'Hide Outer Border' : 'Include Outer Border'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{tsplPayload.trim()}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Print Action */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable
          disabled={printing}
          onPress={handlePrint}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>
              Print Phase 4 Text Label via TSPL ({elements.length} Text Lines)
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
    marginBottom: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748B', marginBottom: 12 },

  chipScroll: { marginBottom: 10 },
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

  fontChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  fontChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  fontChipText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  fontChipTextActive: { color: '#FFFFFF' },

  fontSpecsBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  fontSpecsText: { fontSize: 11, color: '#475569', fontWeight: '500' },

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

  deleteBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  deleteBtnText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },

  addBtn: {
    height: 38,
    paddingHorizontal: 12,
    backgroundColor: Palette.accent,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

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
    overflow: 'hidden',
  },
  textItemWrap: {
    position: 'absolute',
    padding: 2,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 4,
  },
  textItemSelected: {
    borderColor: Palette.accent,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  renderedText: {
    color: '#0F172A',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  textSelectBadge: {
    position: 'absolute',
    right: -4,
    top: -12,
    backgroundColor: Palette.accent,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  textSelectBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },

  hintText: { fontSize: 11, color: '#64748B', marginTop: 8, textAlign: 'center' },

  tableWrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  tableHeadCell: { fontSize: 11, fontWeight: '700', color: '#475569' },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  tableDataCell: { fontSize: 11, color: '#1E293B', fontFamily: 'monospace' },

  toggleBorderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  toggleBorderText: { fontSize: 11, color: '#475569', fontWeight: '600' },

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
