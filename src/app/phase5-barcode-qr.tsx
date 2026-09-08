/**
 * Phase 5 — Barcode & QR Code Elements Screen
 *
 * Requirements:
 * 1. Add scannable 1D barcode (Code 128) and 2D QR Code elements.
 * 2. Position + size in physical mm, using Phase 1's drawBarcode/drawQrCode.
 * 3. Real-time scannability analysis (undersized warning, overflow detection).
 * 4. Caliper size parity between screen preview and paper within ±0.5 mm.
 * 5. Full end-to-end TSPL printing via PrinterManager.
 */

import { useMemo, useRef, useState } from 'react';
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
import QRCode from 'react-native-qrcode-svg';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { DOTS_PER_MM } from '@/printing/calibration';
import { barcodeBarsForMode } from '@/lib/barcode-code128';
import {
  computeScreenFitScale,
  resolveTsplFont,
  tsplFontHeightMm,
  calculateCode128WidthMm,
  resolveQrCellWidth,
  calculateQrFootprintMm,
  validateScannability,
  exportCanvasToTspl,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasTextElement,
  type CanvasElement,
  type CanvasDocument,
} from '@/printing/canvas-export';

const PRESET_SIZES = [
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×50 mm', w: 80, h: 50 },
  { label: '100×70 mm', w: 100, h: 70 },
];

const QR_SIZE_PRESETS = [10, 12, 14, 16, 20];
const BARCODE_HEIGHT_PRESETS = [6, 8, 10, 12, 15];
const ZOOM_LEVELS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function Phase5BarcodeQrScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Label geometry (mm)
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // Input states
  const [widthInput, setWidthInput] = useState<string>('50');
  const [heightInput, setHeightInput] = useState<string>('30');
  const [gapInput, setGapInput] = useState<string>('2');

  // Zoom & Viewport
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [viewportWidth, setViewportWidth] = useState<number>(340);
  const viewportHeight = 220;

  // Canvas elements state (strictly stored in mm)
  const [elements, setElements] = useState<CanvasElement[]>([
    {
      id: 'title-1',
      type: 'text',
      text: 'INVENTORY ASSET',
      left: 4,
      top: 3,
      fontSize: 12,
    },
    {
      id: 'bc-1',
      type: 'barcode',
      data: 'SP-10045',
      left: 4,
      top: 8.5,
      height: 10,
      narrowDots: 2,
      readable: 1,
    },
    {
      id: 'qr-1',
      type: 'qr',
      data: 'https://sez-print.local/verify',
      left: 31,
      top: 8.5,
      sizeMm: 14,
      eccLevel: 'M',
    },
    {
      id: 'footer-1',
      type: 'text',
      text: '304 DPI CALIBRATED TSPL',
      left: 4,
      top: 24,
      fontSize: 8,
    },
  ]);

  const [selectedId, setSelectedId] = useState<string>('bc-1');
  const [includeBorder, setIncludeBorder] = useState<boolean>(true);
  const [printing, setPrinting] = useState<boolean>(false);

  // Selected element
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) || elements[0],
    [elements, selectedId],
  );

  // Viewport scale
  const baseScale = useMemo(() => {
    return computeScreenFitScale(labelWidthMm, labelHeightMm, viewportWidth, viewportHeight, 16);
  }, [labelWidthMm, labelHeightMm, viewportWidth]);

  const effectiveScale = baseScale * zoomFactor;

  // Selected element dimensions in mm
  const selectedDimensions = useMemo(() => {
    if (!selectedElement) return { w: 0, h: 0 };
    if (selectedElement.type === 'barcode') {
      const bc = selectedElement as CanvasBarcodeElement;
      const w = bc.width ?? calculateCode128WidthMm(bc.data, bc.narrowDots ?? 2);
      const h = bc.height ?? 10;
      return { w, h };
    }
    if (selectedElement.type === 'qr') {
      const qr = selectedElement as CanvasQrElement;
      const cellDots = qr.cellWidthDots ?? resolveQrCellWidth(qr.sizeMm, qr.data.length);
      const footprint = calculateQrFootprintMm(cellDots, qr.data.length);
      return { w: footprint, h: footprint };
    }
    if (selectedElement.type === 'text') {
      const txt = selectedElement as CanvasTextElement;
      const capH = tsplFontHeightMm(txt.fontSize);
      const approxW = txt.text.length * (capH * 0.65);
      return { w: Math.max(10, approxW), h: Math.max(4, capH * 1.5) };
    }
    return { w: 10, h: 10 };
  }, [selectedElement]);

  // Scannability check on selected element
  const scannability = useMemo(() => {
    if (!selectedElement) return null;
    if (selectedElement.type === 'barcode' || selectedElement.type === 'qr') {
      return validateScannability(
        selectedElement as CanvasBarcodeElement | CanvasQrElement,
        labelWidthMm,
        labelHeightMm,
      );
    }
    return null;
  }, [selectedElement, labelWidthMm, labelHeightMm]);

  // Drag pan responder
  const panStartRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  const createPanResponder = (el: CanvasElement) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setSelectedId(el.id);
        panStartRef.current = { left: el.left, top: el.top };
      },
      onPanResponderMove: (_, gesture) => {
        const deltaMmX = gesture.dx / effectiveScale;
        const deltaMmY = gesture.dy / effectiveScale;

        let elW = 10;
        let elH = 10;
        if (el.type === 'barcode') {
          const bc = el as CanvasBarcodeElement;
          elW = bc.width ?? calculateCode128WidthMm(bc.data, bc.narrowDots ?? 2);
          elH = bc.height ?? 10;
        } else if (el.type === 'qr') {
          const qr = el as CanvasQrElement;
          const cellDots = qr.cellWidthDots ?? resolveQrCellWidth(qr.sizeMm, qr.data.length);
          elW = calculateQrFootprintMm(cellDots, qr.data.length);
          elH = elW;
        }

        const maxLeft = Math.max(0, labelWidthMm - elW);
        const maxTop = Math.max(0, labelHeightMm - elH);

        const nextLeft = Math.min(Math.max(0, panStartRef.current.left + deltaMmX), maxLeft);
        const nextTop = Math.min(Math.max(0, panStartRef.current.top + deltaMmY), maxTop);

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

  // Updates for selected element
  const handleUpdateData = (data: string) => {
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== selectedElement?.id) return el;
        if (el.type === 'barcode' || el.type === 'qr') {
          return { ...el, data };
        }
        if (el.type === 'text') {
          return { ...el, text: data };
        }
        return el;
      }),
    );
  };

  const handleUpdateBarcodeHeight = (height: number) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement?.id && el.type === 'barcode' ? { ...el, height } : el)),
    );
  };

  const handleUpdateQrSize = (sizeMm: number) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement?.id && el.type === 'qr' ? { ...el, sizeMm } : el)),
    );
  };

  const handleUpdateQrEcc = (eccLevel: 'L' | 'M' | 'Q' | 'H') => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement?.id && el.type === 'qr' ? { ...el, eccLevel } : el)),
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

  const handleAddBarcode = () => {
    const newId = `bc_${Date.now().toString(36)}`;
    const newEl: CanvasBarcodeElement = {
      id: newId,
      type: 'barcode',
      data: 'SP-10045',
      left: 4,
      top: Math.min(labelHeightMm - 12, 10),
      height: 10,
      narrowDots: 2,
      readable: 1,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newId);
  };

  const handleAddQr = () => {
    const newId = `qr_${Date.now().toString(36)}`;
    const newEl: CanvasQrElement = {
      id: newId,
      type: 'qr',
      data: 'https://sez-print.local',
      left: Math.max(4, labelWidthMm - 18),
      top: Math.min(labelHeightMm - 16, 10),
      sizeMm: 14,
      eccLevel: 'M',
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newId);
  };

  const handleAddText = () => {
    const newId = `t_${Date.now().toString(36)}`;
    const newEl: CanvasTextElement = {
      id: newId,
      type: 'text',
      text: 'Item Title',
      left: 4,
      top: 4,
      fontSize: 12,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newId);
  };

  const handleDeleteSelected = () => {
    if (elements.length <= 1) {
      Alert.alert('Cannot Delete', 'At least one element must remain.');
      return;
    }
    setElements((prev) => prev.filter((el) => el.id !== selectedElement?.id));
    setSelectedId(elements.find((el) => el.id !== selectedElement?.id)?.id || '');
  };

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
                left: 0,
                top: 0,
                width: labelWidthMm,
                height: labelHeightMm,
                lineWidth: 0.35,
              },
            ]
          : []),
        ...elements,
      ],
    };
    return exportCanvasToTspl(doc, { copies: 1 });
  }, [labelWidthMm, labelHeightMm, gapMm, elements, includeBorder]);

  // Print button handler
  const handlePrint = async () => {
    if (!connected) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect to your thermal label printer in the connection screen before printing.',
        [{ text: 'OK' }],
      );
      return;
    }

    setPrinting(true);
    try {
      const pm = getPrinterManager();
      await pm.printRawTspl(tsplPayload);
      Alert.alert(
        'Print Job Sent',
        `Phase 5 Barcode & QR Code label sent to ${deviceName || 'printer'}.\n\nCaliper Verification:\n1. Scan Code 128 with handheld scanner.\n2. Scan QR with mobile camera.\n3. Verify footprints match ±0.5mm.`,
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
          <AppIcon name="chevron.left" size={22} tintColor="#FFFFFF" />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Phase 5: Barcode & QR</Text>
          <Text style={styles.headerSubtitle}>Code 128 & QR in Physical Millimeters</Text>
        </View>
        <View
          style={[
            styles.connPill,
            { backgroundColor: connected ? '#DCFCE7' : '#FEE2E2' },
          ]}>
          <View
            style={[
              styles.connDot,
              { backgroundColor: connected ? '#15803D' : '#DC2626' },
            ]}
          />
          <Text
            style={[
              styles.connText,
              { color: connected ? '#15803D' : '#DC2626' },
            ]}>
            {connected ? 'Ready' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Dimension & Presets */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Label Size (mm)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {PRESET_SIZES.map((p) => {
              const active = labelWidthMm === p.w && labelHeightMm === p.h;
              return (
                <Pressable
                  key={p.label}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => handleSelectPreset(p.w, p.h)}>
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.row}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm)</Text>
              <TextInput
                style={styles.input}
                value={widthInput}
                onChangeText={setWidthInput}
                onEndEditing={handleApplyDimensions}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm)</Text>
              <TextInput
                style={styles.input}
                value={heightInput}
                onChangeText={setHeightInput}
                onEndEditing={handleApplyDimensions}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Gap (mm)</Text>
              <TextInput
                style={styles.input}
                value={gapInput}
                onChangeText={setGapInput}
                onEndEditing={handleApplyDimensions}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Zoom selector */}
        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>Screen Zoom:</Text>
          {ZOOM_LEVELS.map((z) => (
            <Pressable
              key={z}
              style={[styles.zoomBtn, zoomFactor === z && styles.zoomBtnActive]}
              onPress={() => setZoomFactor(z)}>
              <Text style={[styles.zoomBtnText, zoomFactor === z && styles.zoomBtnTextActive]}>
                {z}x
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Canvas Artboard Viewport */}
        <View
          style={styles.canvasContainer}
          onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}>
          <View
            style={[
              styles.artboard,
              {
                width: labelWidthMm * effectiveScale,
                height: labelHeightMm * effectiveScale,
              },
            ]}>
            {/* Outer border footprint */}
            {includeBorder && (
              <View
                style={[
                  styles.boundaryBox,
                  {
                    width: labelWidthMm * effectiveScale,
                    height: labelHeightMm * effectiveScale,
                  },
                ]}
              />
            )}

            {/* Elements */}
            {elements.map((el) => {
              const isSelected = el.id === selectedId;
              const elLeftPx = el.left * effectiveScale;
              const elTopPx = el.top * effectiveScale;

              // Render text element
              if (el.type === 'text') {
                const fontRes = resolveTsplFont(el.fontSize);
                const capHeightMm = fontRes.capHeightMm;
                const screenFontSize = Math.round(capHeightMm * effectiveScale * 1.35);

                return (
                  <View
                    key={el.id}
                    {...createPanResponder(el).panHandlers}
                    style={[
                      styles.elementWrapper,
                      {
                        left: elLeftPx,
                        top: elTopPx,
                      },
                      isSelected && styles.elementSelected,
                    ]}>
                    <Text
                      style={{
                        fontSize: Math.max(8, screenFontSize),
                        fontWeight: '700',
                        color: '#111827',
                        includeFontPadding: false,
                      }}>
                      {el.text}
                    </Text>
                    {isSelected && <View style={styles.selectionDot} />}
                  </View>
                );
              }

              // Render barcode element (Code 128)
              if (el.type === 'barcode') {
                const bc = el as CanvasBarcodeElement;
                const bcWidthMm = bc.width ?? calculateCode128WidthMm(bc.data, bc.narrowDots ?? 2);
                const bcHeightMm = bc.height ?? 10;
                const bcWidthPx = bcWidthMm * effectiveScale;
                const bcHeightPx = bcHeightMm * effectiveScale;

                const bars = barcodeBarsForMode('CODE-128', bc.data);
                const labelH = bc.readable !== 0 ? Math.max(10, 10 * zoomFactor) : 0;
                const barAreaHeight = Math.max(4, bcHeightPx - labelH);

                return (
                  <View
                    key={el.id}
                    {...createPanResponder(el).panHandlers}
                    style={[
                      styles.elementWrapper,
                      {
                        left: elLeftPx,
                        top: elTopPx,
                        width: bcWidthPx,
                        height: bcHeightPx,
                      },
                      isSelected && styles.elementSelected,
                    ]}>
                    {bars ? (
                      <Svg width={bcWidthPx} height={barAreaHeight}>
                        {bars.map((bar, i) => (
                          <Rect
                            key={i}
                            x={bar.x * bcWidthPx}
                            y={0}
                            width={Math.max(1, bar.width * bcWidthPx)}
                            height={barAreaHeight}
                            fill="#111827"
                          />
                        ))}
                      </Svg>
                    ) : (
                      <View style={styles.barcodeFallback}>
                        <Text style={styles.fallbackText}>Invalid Barcode</Text>
                      </View>
                    )}
                    {bc.readable !== 0 && (
                      <Text
                        style={[
                          styles.barcodeLabelText,
                          { fontSize: Math.max(7, Math.round(9 * zoomFactor)) },
                        ]}
                        numberOfLines={1}>
                        {bc.data}
                      </Text>
                    )}
                    {isSelected && <View style={styles.selectionDot} />}
                  </View>
                );
              }

              // Render QR Code element
              if (el.type === 'qr') {
                const qr = el as CanvasQrElement;
                const cellDots = qr.cellWidthDots ?? resolveQrCellWidth(qr.sizeMm, qr.data.length);
                const footprintMm = calculateQrFootprintMm(cellDots, qr.data.length);
                const qrSizePx = footprintMm * effectiveScale;

                return (
                  <View
                    key={el.id}
                    {...createPanResponder(el).panHandlers}
                    style={[
                      styles.elementWrapper,
                      {
                        left: elLeftPx,
                        top: elTopPx,
                        width: qrSizePx,
                        height: qrSizePx,
                      },
                      isSelected && styles.elementSelected,
                    ]}>
                    <QRCode
                      value={qr.data || 'https://sez-print.local'}
                      size={Math.max(10, qrSizePx)}
                      color="#111827"
                      backgroundColor="transparent"
                      ecl={qr.eccLevel ?? 'M'}
                    />
                    {isSelected && <View style={styles.selectionDot} />}
                  </View>
                );
              }

              return null;
            })}
          </View>
        </View>

        {/* Element Toolbar */}
        <View style={styles.toolbarRow}>
          <Pressable style={styles.toolbarBtn} onPress={handleAddBarcode}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ Barcode</Text>
          </Pressable>
          <Pressable style={styles.toolbarBtn} onPress={handleAddQr}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ QR Code</Text>
          </Pressable>
          <Pressable style={styles.toolbarBtn} onPress={handleAddText}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ Text</Text>
          </Pressable>
          <Pressable style={[styles.toolbarBtn, styles.deleteBtn]} onPress={handleDeleteSelected}>
            <AppIcon name="trash" size={16} tintColor="#DC2626" />
            <Text style={[styles.toolbarBtnText, { color: '#DC2626' }]}>Delete</Text>
          </Pressable>
        </View>

        {/* Selected Element Property Panel */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              Selected: {selectedElement?.type ? selectedElement.type.toUpperCase() : 'ELEMENT'} ({selectedElement?.id})
            </Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{selectedElement?.type ?? 'element'}</Text>
            </View>
          </View>

          {/* Scannability Alert Banner */}
          {scannability && (
            <View
              style={[
                styles.scannabilityBanner,
                {
                  backgroundColor: scannability.isScannable ? '#ECFDF5' : '#FEF2F2',
                  borderColor: scannability.isScannable ? '#A7F3D0' : '#FECACA',
                },
              ]}>
              <AppIcon
                name={scannability.isScannable ? 'checkmark.circle' : 'exclamationmark.triangle'}
                size={18}
                tintColor={scannability.isScannable ? '#059669' : '#DC2626'}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.scannabilityTitle,
                    { color: scannability.isScannable ? '#065F46' : '#991B1B' },
                  ]}>
                  {scannability.isScannable
                    ? `Scannable Footprint: ${scannability.calculatedWidthMm} × ${scannability.calculatedHeightMm} mm`
                    : 'Scannability Warning'}
                </Text>
                {scannability.warnings.map((w, idx) => (
                  <Text key={idx} style={styles.scannabilityWarningText}>
                    • {w}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Data input */}
          <Text style={styles.propLabel}>
            {selectedElement?.type === 'text' ? 'Text Content' : 'Encoded Data String'}
          </Text>
          <TextInput
            style={styles.dataInput}
            value={
              selectedElement?.type === 'text'
                ? (selectedElement as CanvasTextElement).text
                : (selectedElement as CanvasBarcodeElement | CanvasQrElement)?.data || ''
            }
            onChangeText={handleUpdateData}
            placeholder="Type content..."
            autoCapitalize="none"
          />

          {/* Barcode specific controls */}
          {selectedElement?.type === 'barcode' && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.propLabel}>Barcode Height (mm):</Text>
              <View style={styles.chipRow}>
                {BARCODE_HEIGHT_PRESETS.map((h) => {
                  const bc = selectedElement as CanvasBarcodeElement;
                  const active = bc.height === h;
                  return (
                    <Pressable
                      key={h}
                      style={[styles.propChip, active && styles.propChipActive]}
                      onPress={() => handleUpdateBarcodeHeight(h)}>
                      <Text style={[styles.propChipText, active && styles.propChipTextActive]}>
                        {h} mm
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* QR specific controls */}
          {selectedElement?.type === 'qr' && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.propLabel}>Requested QR Size (mm):</Text>
              <View style={styles.chipRow}>
                {QR_SIZE_PRESETS.map((s) => {
                  const qr = selectedElement as CanvasQrElement;
                  const active = qr.sizeMm === s;
                  return (
                    <Pressable
                      key={s}
                      style={[styles.propChip, active && styles.propChipActive]}
                      onPress={() => handleUpdateQrSize(s)}>
                      <Text style={[styles.propChipText, active && styles.propChipTextActive]}>
                        {s} mm
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.propLabel, { marginTop: 10 }]}>Error Correction (ECC):</Text>
              <View style={styles.chipRow}>
                {(['L', 'M', 'Q', 'H'] as const).map((lvl) => {
                  const qr = selectedElement as CanvasQrElement;
                  const active = (qr.eccLevel ?? 'M') === lvl;
                  return (
                    <Pressable
                      key={lvl}
                      style={[styles.propChip, active && styles.propChipActive]}
                      onPress={() => handleUpdateQrEcc(lvl)}>
                      <Text style={[styles.propChipText, active && styles.propChipTextActive]}>
                        Level {lvl}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Position in mm */}
          <View style={[styles.row, { marginTop: 14 }]}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Left X (mm)</Text>
              <TextInput
                style={styles.input}
                value={String(selectedElement?.left ?? 0)}
                onChangeText={(v) => handleUpdatePos('left', v)}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Top Y (mm)</Text>
              <TextInput
                style={styles.input}
                value={String(selectedElement?.top ?? 0)}
                onChangeText={(v) => handleUpdatePos('top', v)}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Live Coordinate Inspector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Triple-Inspector & Hardware Metrics</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricHeader}>Physical mm</Text>
              <Text style={styles.metricVal}>
                X: {selectedElement?.left.toFixed(1)} mm
              </Text>
              <Text style={styles.metricVal}>
                Y: {selectedElement?.top.toFixed(1)} mm
              </Text>
              <Text style={styles.metricVal}>
                {selectedDimensions.w.toFixed(1)} × {selectedDimensions.h.toFixed(1)} mm
              </Text>
            </View>

            <View style={styles.metricCell}>
              <Text style={styles.metricHeader}>Screen px ({zoomFactor}x)</Text>
              <Text style={styles.metricVal}>
                X: {Math.round((selectedElement?.left ?? 0) * effectiveScale)} px
              </Text>
              <Text style={styles.metricVal}>
                Y: {Math.round((selectedElement?.top ?? 0) * effectiveScale)} px
              </Text>
              <Text style={styles.metricVal}>
                {Math.round(selectedDimensions.w * effectiveScale)} ×{' '}
                {Math.round(selectedDimensions.h * effectiveScale)} px
              </Text>
            </View>

            <View style={styles.metricCell}>
              <Text style={styles.metricHeader}>Printer Dots (304 DPI)</Text>
              <Text style={styles.metricVal}>
                X: {Math.round((selectedElement?.left ?? 0) * DOTS_PER_MM)} dots
              </Text>
              <Text style={styles.metricVal}>
                Y: {Math.round((selectedElement?.top ?? 0) * DOTS_PER_MM)} dots
              </Text>
              <Text style={styles.metricVal}>
                {Math.round(selectedDimensions.w * DOTS_PER_MM)} ×{' '}
                {Math.round(selectedDimensions.h * DOTS_PER_MM)} dots
              </Text>
            </View>
          </View>
        </View>

        {/* Generated TSPL script */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Generated TSPL Script</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{tsplPayload}</Text>
          </View>
        </View>

        {/* Print Button */}
        <View style={styles.actionContainer}>
          <Pressable
            style={[styles.printBtn, printing && styles.printBtnDisabled]}
            onPress={handlePrint}
            disabled={printing}>
            {printing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <AppIcon name="printer" size={20} tintColor="#FFFFFF" />
                <Text style={styles.printBtnText}>Print Phase 5 via TSPL</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: Palette.header,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
    textTransform: 'uppercase',
  },
  presetScroll: {
    marginBottom: 12,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  zoomLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  zoomBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  zoomBtnActive: {
    backgroundColor: '#0F172A',
  },
  zoomBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  zoomBtnTextActive: {
    color: '#FFFFFF',
  },
  canvasContainer: {
    height: 240,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  artboard: {
    backgroundColor: '#FFFFFF',
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  boundaryBox: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  elementWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementSelected: {
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderStyle: 'solid',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
  },
  selectionDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  barcodeFallback: {
    padding: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
  },
  fallbackText: {
    fontSize: 9,
    color: '#DC2626',
    fontWeight: '600',
  },
  barcodeLabelText: {
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  deleteBtn: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  scannabilityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  scannabilityTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  scannabilityWarningText: {
    fontSize: 11,
    color: '#B91C1C',
    lineHeight: 15,
  },
  propLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  dataInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  propChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  propChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  propChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  propChipTextActive: {
    color: '#FFFFFF',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCell: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '600',
    lineHeight: 16,
  },
  codeBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#38BDF8',
    lineHeight: 16,
  },
  actionContainer: {
    marginTop: 8,
  },
  printBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  printBtnDisabled: {
    opacity: 0.6,
  },
  printBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
