/**
 * Phase 6 — Element Manipulation & Editing UX Screen
 *
 * Requirements:
 * 1. Smooth, tactile, soft-touch element selection, drag-move, and corner resize.
 * 2. Visual handles on active selection: 4 corner resize handles + rotate button.
 * 3. 90° rotation cycling (0° -> 90° -> 180° -> 270°).
 * 4. Layer re-ordering: Bring to Front, Send to Back, Move Forward, Move Backward.
 * 5. Full Undo / Redo history state stack in millimeters.
 * 6. Optional snap-to-grid in mm (Off, 0.5 mm, 1.0 mm) with visual grid overlay.
 * 7. End-to-end TSPL printing with zero layout distortion.
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
import Svg, { Rect, Line } from 'react-native-svg';
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
  snapToGridMm,
  getElementFootprintMm,
  moveElementInCanvas,
  resizeElementInCanvas,
  rotateElementInCanvas,
  reorderElementInCanvas,
  deleteElementInCanvas,
  CanvasHistoryManager,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasTextElement,
  type CanvasBoxElement,
  type CanvasElement,
  type CanvasDocument,
  type ResizeHandle,
} from '@/printing/canvas-export';

const PRESET_SIZES = [
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×50 mm', w: 80, h: 50 },
];

const SNAP_OPTIONS = [
  { label: 'Off', val: 0 },
  { label: '0.5 mm', val: 0.5 },
  { label: '1.0 mm', val: 1.0 },
];

const ZOOM_LEVELS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function Phase6EditorScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Label Geometry (mm)
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // Dimension text inputs
  const [widthInput, setWidthInput] = useState<string>('50');
  const [heightInput, setHeightInput] = useState<string>('30');

  // Viewport and Zoom
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [viewportWidth, setViewportWidth] = useState<number>(340);
  const viewportHeight = 220;

  // Snap & Grid Settings
  const [snapGridMm, setSnapGridMm] = useState<number>(1.0);
  const [showGridLines, setShowGridLines] = useState<boolean>(true);

  // Initial Elements
  const initialElements: CanvasElement[] = [
    {
      id: 'box-outline',
      type: 'box',
      left: 2,
      top: 2,
      width: 46,
      height: 26,
      lineWidth: 0.35,
    },
    {
      id: 'title-txt',
      type: 'text',
      text: 'INSPECTION PASSED',
      left: 4,
      top: 4,
      fontSize: 12,
    },
    {
      id: 'qc-barcode',
      type: 'barcode',
      data: 'QC-2026-X1',
      left: 4,
      top: 10,
      height: 9,
      narrowDots: 2,
      readable: 1,
    },
    {
      id: 'verify-qr',
      type: 'qr',
      data: 'https://sez-print.local/qc/2026',
      left: 32,
      top: 10,
      sizeMm: 12,
      eccLevel: 'M',
    },
  ];

  // History Manager
  const historyRef = useRef<CanvasHistoryManager<CanvasElement[]>>(
    new CanvasHistoryManager<CanvasElement[]>(initialElements, 30),
  );

  const [elements, setElements] = useState<CanvasElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string>('qc-barcode');
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);

  const updateWithHistory = (newElements: CanvasElement[]) => {
    historyRef.current.push(newElements);
    setElements(newElements);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  };

  const handleUndo = () => {
    const prior = historyRef.current.undo();
    if (prior) {
      setElements(prior);
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
      if (!prior.some((e) => e.id === selectedId)) {
        setSelectedId(prior[0]?.id || '');
      }
    }
  };

  const handleRedo = () => {
    const next = historyRef.current.redo();
    if (next) {
      setElements(next);
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    }
  };

  // Viewport scale
  const baseScale = useMemo(() => {
    return computeScreenFitScale(labelWidthMm, labelHeightMm, viewportWidth, viewportHeight, 16);
  }, [labelWidthMm, labelHeightMm, viewportWidth]);

  const effectiveScale = baseScale * zoomFactor;

  // Selected element
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) || elements[0],
    [elements, selectedId],
  );

  const selectedFootprint = useMemo(() => {
    if (!selectedElement) return { widthMm: 0, heightMm: 0 };
    return getElementFootprintMm(selectedElement);
  }, [selectedElement]);

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

  // Gesture refs for smooth dragging without jump
  const panStartRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  const createDragResponder = (el: CanvasElement) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setSelectedId(el.id);
        panStartRef.current = { left: el.left, top: el.top };
      },
      onPanResponderMove: (_, gesture) => {
        const deltaMmX = gesture.dx / effectiveScale;
        const deltaMmY = gesture.dy / effectiveScale;

        const targetLeft = panStartRef.current.left + deltaMmX;
        const targetTop = panStartRef.current.top + deltaMmY;

        const nextElements = moveElementInCanvas(
          elements,
          el.id,
          targetLeft,
          targetTop,
          labelWidthMm,
          labelHeightMm,
          snapGridMm,
        );
        setElements(nextElements);
      },
      onPanResponderRelease: () => {
        historyRef.current.push(elements);
        setCanUndo(historyRef.current.canUndo());
        setCanRedo(historyRef.current.canRedo());
      },
    });

  // Corner Resize Gesture
  const resizeStartRef = useRef<{
    width: number;
    height: number;
    left: number;
    top: number;
  }>({ width: 0, height: 0, left: 0, top: 0 });

  const createResizeResponder = (el: CanvasElement, handle: ResizeHandle) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const fp = getElementFootprintMm(el);
        resizeStartRef.current = {
          width: fp.widthMm,
          height: fp.heightMm,
          left: el.left,
          top: el.top,
        };
      },
      onPanResponderMove: (_, gesture) => {
        const deltaMmX = gesture.dx / effectiveScale;
        const deltaMmY = gesture.dy / effectiveScale;

        const nextElements = resizeElementInCanvas(
          elements,
          el.id,
          handle,
          deltaMmX,
          deltaMmY,
          labelWidthMm,
          labelHeightMm,
          snapGridMm,
        );
        setElements(nextElements);
      },
      onPanResponderRelease: () => {
        historyRef.current.push(elements);
        setCanUndo(historyRef.current.canUndo());
        setCanRedo(historyRef.current.canRedo());
      },
    });

  // Manipulation operations
  const handleRotate = () => {
    if (!selectedElement) return;
    const rotated = rotateElementInCanvas(elements, selectedElement.id);
    updateWithHistory(rotated);
  };

  const handleReorder = (action: 'bringToFront' | 'sendToBack' | 'moveForward' | 'moveBackward') => {
    if (!selectedElement) return;
    const reordered = reorderElementInCanvas(elements, selectedElement.id, action);
    updateWithHistory(reordered);
  };

  const handleDelete = () => {
    if (!selectedElement) return;
    if (elements.length <= 1) {
      Alert.alert('Cannot Delete', 'At least one element must remain.');
      return;
    }
    const remaining = deleteElementInCanvas(elements, selectedElement.id);
    updateWithHistory(remaining);
    setSelectedId(remaining[0]?.id || '');
  };

  // Add element creators
  const handleAddBox = () => {
    const newId = `box_${Date.now().toString(36)}`;
    const newBox: CanvasBoxElement = {
      id: newId,
      type: 'box',
      left: 6,
      top: 6,
      width: 20,
      height: 12,
      lineWidth: 0.35,
    };
    updateWithHistory([...elements, newBox]);
    setSelectedId(newId);
  };

  const handleAddText = () => {
    const newId = `txt_${Date.now().toString(36)}`;
    const newTxt: CanvasTextElement = {
      id: newId,
      type: 'text',
      text: 'Sample Text',
      left: 6,
      top: 6,
      fontSize: 12,
    };
    updateWithHistory([...elements, newTxt]);
    setSelectedId(newId);
  };

  const handleAddBarcode = () => {
    const newId = `bc_${Date.now().toString(36)}`;
    const newBc: CanvasBarcodeElement = {
      id: newId,
      type: 'barcode',
      data: 'PART-1029',
      left: 6,
      top: 8,
      height: 10,
      narrowDots: 2,
      readable: 1,
    };
    updateWithHistory([...elements, newBc]);
    setSelectedId(newId);
  };

  const handleAddQr = () => {
    const newId = `qr_${Date.now().toString(36)}`;
    const newQr: CanvasQrElement = {
      id: newId,
      type: 'qr',
      data: 'https://sez-print.local',
      left: 6,
      top: 8,
      sizeMm: 12,
      eccLevel: 'M',
    };
    updateWithHistory([...elements, newQr]);
    setSelectedId(newId);
  };

  // Preset Dimensions
  const handleSelectPreset = (w: number, h: number) => {
    setWidthInput(String(w));
    setHeightInput(String(h));
    setLabelWidthMm(w);
    setLabelHeightMm(h);
  };

  const handleApplyDimensions = () => {
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    if (!isNaN(w) && w >= 10 && w <= 200 && !isNaN(h) && h >= 10 && h <= 250) {
      setLabelWidthMm(w);
      setLabelHeightMm(h);
    }
  };

  // Generate TSPL payload
  const tsplPayload = useMemo(() => {
    const doc: CanvasDocument = {
      widthMm: labelWidthMm,
      heightMm: labelHeightMm,
      gapMm,
      direction: 1,
      elements,
    };
    return exportCanvasToTspl(doc, { copies: 1, printBoundary: true });
  }, [labelWidthMm, labelHeightMm, gapMm, elements]);

  // Direct print handler
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
        `Phase 6 manipulated label sent to ${deviceName || 'printer'}.\n\nCaliper Verification:\n1. Verify element positions match screen layout.\n2. Confirm snap-to-grid spacing within ±0.5mm.`,
      );
    } catch (err: unknown) {
      Alert.alert('Print Error', err instanceof Error ? err.message : String(err));
    } finally {
      setPrinting(false);
    }
  };

  // Generate grid line coordinates
  const gridLines = useMemo(() => {
    if (!showGridLines || snapGridMm <= 0) return null;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const stepPx = snapGridMm * effectiveScale;
    const artWidthPx = labelWidthMm * effectiveScale;
    const artHeightPx = labelHeightMm * effectiveScale;

    // Vertical lines
    for (let x = stepPx; x < artWidthPx; x += stepPx) {
      lines.push({ x1: x, y1: 0, x2: x, y2: artHeightPx });
    }
    // Horizontal lines
    for (let y = stepPx; y < artHeightPx; y += stepPx) {
      lines.push({ x1: 0, y1: y, x2: artWidthPx, y2: y });
    }
    return lines;
  }, [showGridLines, snapGridMm, effectiveScale, labelWidthMm, labelHeightMm]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <AppIcon name="chevron.left" size={22} tintColor="#FFFFFF" />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Phase 6: Interactive Editor</Text>
          <Text style={styles.headerSubtitle}>Selection, Drag-Move, Resize, Z-Order & Undo</Text>
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

      {/* Top Toolbar: Undo, Redo, Snap, Grid Toggle */}
      <View style={styles.actionBar}>
        <View style={styles.undoRedoGroup}>
          <Pressable
            style={[styles.actionIconBtn, !canUndo && styles.actionIconBtnDisabled]}
            onPress={handleUndo}
            disabled={!canUndo}>
            <AppIcon name="arrow.uturn.backward" size={16} tintColor={canUndo ? '#0F172A' : '#94A3B8'} />
            <Text style={[styles.actionBtnText, !canUndo && { color: '#94A3B8' }]}>Undo</Text>
          </Pressable>

          <Pressable
            style={[styles.actionIconBtn, !canRedo && styles.actionIconBtnDisabled]}
            onPress={handleRedo}
            disabled={!canRedo}>
            <AppIcon name="arrow.uturn.forward" size={16} tintColor={canRedo ? '#0F172A' : '#94A3B8'} />
            <Text style={[styles.actionBtnText, !canRedo && { color: '#94A3B8' }]}>Redo</Text>
          </Pressable>
        </View>

        {/* Snap chips */}
        <View style={styles.snapGroup}>
          <Text style={styles.snapLabel}>Snap:</Text>
          {SNAP_OPTIONS.map((opt) => {
            const active = snapGridMm === opt.val;
            return (
              <Pressable
                key={opt.label}
                style={[styles.snapChip, active && styles.snapChipActive]}
                onPress={() => setSnapGridMm(opt.val)}>
                <Text style={[styles.snapChipText, active && styles.snapChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Grid lines toggle */}
        <Pressable
          style={[styles.gridToggleBtn, showGridLines && styles.gridToggleBtnActive]}
          onPress={() => setShowGridLines(!showGridLines)}>
          <Text style={[styles.gridToggleText, showGridLines && styles.gridToggleTextActive]}>
            Grid {showGridLines ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Label Size Presets */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Label Size (mm)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
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
          </View>
        </View>

        {/* Zoom Selector */}
        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>Zoom:</Text>
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
          <Pressable
            style={[
              styles.artboard,
              {
                width: labelWidthMm * effectiveScale,
                height: labelHeightMm * effectiveScale,
              },
            ]}
            onPress={() => setSelectedId('')}>
            {/* Visual Grid Lines */}
            {gridLines && (
              <Svg
                style={StyleSheet.absoluteFill}
                width={labelWidthMm * effectiveScale}
                height={labelHeightMm * effectiveScale}
                pointerEvents="none">
                {gridLines.map((line, idx) => (
                  <Line
                    key={idx}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#E2E8F0"
                    strokeWidth={0.75}
                  />
                ))}
              </Svg>
            )}

            {/* Outer border footprint */}
            <View
              style={[
                styles.boundaryBox,
                {
                  width: labelWidthMm * effectiveScale,
                  height: labelHeightMm * effectiveScale,
                },
              ]}
              pointerEvents="none"
            />

            {/* Elements Layer Stack */}
            {elements.map((el) => {
              const isSelected = el.id === selectedId;
              const fp = getElementFootprintMm(el);
              const elLeftPx = el.left * effectiveScale;
              const elTopPx = el.top * effectiveScale;
              const elWidthPx = fp.widthMm * effectiveScale;
              const elHeightPx = fp.heightMm * effectiveScale;
              const rotation = (el.rotation as number) ?? 0;

              return (
                <View
                  key={el.id}
                  style={[
                    styles.elementContainer,
                    {
                      left: elLeftPx,
                      top: elTopPx,
                      width: elWidthPx,
                      height: elHeightPx,
                      transform: [{ rotate: `${rotation}deg` }],
                    },
                  ]}>
                  {/* Element Content Body with Drag Gestures */}
                  <View
                    {...createDragResponder(el).panHandlers}
                    style={[
                      styles.elementBody,
                      isSelected && styles.elementBodySelected,
                    ]}>
                    {/* Render Text */}
                    {el.type === 'text' && (
                      <Text
                        style={{
                          fontSize: Math.max(
                            8,
                            Math.round(tsplFontHeightMm(el.fontSize) * effectiveScale * 1.35),
                          ),
                          fontWeight: '700',
                          color: '#111827',
                          includeFontPadding: false,
                        }}>
                        {el.text}
                      </Text>
                    )}

                    {/* Render Box */}
                    {(!el.type || el.type === 'box' || el.type === 'shape') && (
                      <View
                        style={[
                          styles.boxShape,
                          {
                            width: elWidthPx,
                            height: elHeightPx,
                            borderWidth: Math.max(1, ((el.lineWidth as number) ?? 0.35) * effectiveScale),
                          },
                        ]}
                      />
                    )}

                    {/* Render Barcode */}
                    {el.type === 'barcode' && (
                      <View style={styles.barcodeArea}>
                        {barcodeBarsForMode('CODE-128', el.data) ? (
                          <Svg width={elWidthPx} height={Math.max(4, elHeightPx - 10)}>
                            {barcodeBarsForMode('CODE-128', el.data)!.map((bar, i) => (
                              <Rect
                                key={i}
                                x={bar.x * elWidthPx}
                                y={0}
                                width={Math.max(1, bar.width * elWidthPx)}
                                height={Math.max(4, elHeightPx - 10)}
                                fill="#111827"
                              />
                            ))}
                          </Svg>
                        ) : (
                          <Text style={styles.fallbackText}>Invalid Barcode</Text>
                        )}
                        {el.readable !== 0 && (
                          <Text
                            style={[
                              styles.barcodeLabelText,
                              { fontSize: Math.max(7, Math.round(9 * zoomFactor)) },
                            ]}
                            numberOfLines={1}>
                            {el.data}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Render QR Code */}
                    {el.type === 'qr' && (
                      <QRCode
                        value={el.data || 'https://sez-print.local'}
                        size={Math.max(10, elWidthPx)}
                        color="#111827"
                        backgroundColor="transparent"
                        ecl={el.eccLevel ?? 'M'}
                      />
                    )}
                  </View>

                  {/* Corner Resize Handles for Active Selection */}
                  {isSelected && (
                    <>
                      {/* SE (Bottom-Right) Handle */}
                      <View
                        {...createResizeResponder(el, 'se').panHandlers}
                        style={[styles.resizeHandle, styles.handleSE]}
                      />
                      {/* SW (Bottom-Left) Handle */}
                      <View
                        {...createResizeResponder(el, 'sw').panHandlers}
                        style={[styles.resizeHandle, styles.handleSW]}
                      />
                      {/* NE (Top-Right) Handle */}
                      <View
                        {...createResizeResponder(el, 'ne').panHandlers}
                        style={[styles.resizeHandle, styles.handleNE]}
                      />
                      {/* NW (Top-Left) Handle */}
                      <View
                        {...createResizeResponder(el, 'nw').panHandlers}
                        style={[styles.resizeHandle, styles.handleNW]}
                      />
                    </>
                  )}
                </View>
              );
            })}
          </Pressable>
        </View>

        {/* Add Elements Toolbar */}
        <View style={styles.toolbarRow}>
          <Pressable style={styles.toolbarBtn} onPress={handleAddBox}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ Box</Text>
          </Pressable>
          <Pressable style={styles.toolbarBtn} onPress={handleAddText}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ Text</Text>
          </Pressable>
          <Pressable style={styles.toolbarBtn} onPress={handleAddBarcode}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ Barcode</Text>
          </Pressable>
          <Pressable style={styles.toolbarBtn} onPress={handleAddQr}>
            <AppIcon name="plus" size={16} tintColor="#2563EB" />
            <Text style={styles.toolbarBtnText}>+ QR Code</Text>
          </Pressable>
        </View>

        {/* Element Manipulation & Layer Controls */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              Selected: {selectedElement?.type ? selectedElement.type.toUpperCase() : 'ELEMENT'} ({selectedElement?.id})
            </Text>
            <View style={styles.rotBadge}>
              <Text style={styles.rotBadgeText}>
                {String(selectedElement?.rotation ?? 0)}° ROT
              </Text>
            </View>
          </View>

          {/* Action Row: Rotate, Front, Back, Up, Down, Delete */}
          <View style={styles.manipulationRow}>
            <Pressable style={styles.manipBtn} onPress={handleRotate}>
              <AppIcon name="arrow.clockwise" size={16} tintColor="#0F172A" />
              <Text style={styles.manipBtnText}>Rotate 90°</Text>
            </Pressable>
            <Pressable style={styles.manipBtn} onPress={() => handleReorder('bringToFront')}>
              <Text style={styles.manipBtnText}>Front</Text>
            </Pressable>
            <Pressable style={styles.manipBtn} onPress={() => handleReorder('sendToBack')}>
              <Text style={styles.manipBtnText}>Back</Text>
            </Pressable>
            <Pressable style={styles.manipBtn} onPress={() => handleReorder('moveForward')}>
              <Text style={styles.manipBtnText}>+1 Up</Text>
            </Pressable>
            <Pressable style={styles.manipBtn} onPress={() => handleReorder('moveBackward')}>
              <Text style={styles.manipBtnText}>-1 Down</Text>
            </Pressable>
            <Pressable style={[styles.manipBtn, styles.deleteManipBtn]} onPress={handleDelete}>
              <AppIcon name="trash" size={16} tintColor="#DC2626" />
              <Text style={[styles.manipBtnText, { color: '#DC2626' }]}>Delete</Text>
            </Pressable>
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
                    ? `Scannable: ${scannability.calculatedWidthMm} × ${scannability.calculatedHeightMm} mm`
                    : 'Scannability Alert'}
                </Text>
                {scannability.warnings.map((w, i) => (
                  <Text key={i} style={styles.scannabilityWarningText}>
                    • {w}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Triple-Inspector */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCell}>
              <Text style={styles.metricHeader}>Physical mm</Text>
              <Text style={styles.metricVal}>X: {selectedElement?.left.toFixed(1)} mm</Text>
              <Text style={styles.metricVal}>Y: {selectedElement?.top.toFixed(1)} mm</Text>
              <Text style={styles.metricVal}>
                {selectedFootprint.widthMm.toFixed(1)} × {selectedFootprint.heightMm.toFixed(1)} mm
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
                {Math.round(selectedFootprint.widthMm * effectiveScale)} ×{' '}
                {Math.round(selectedFootprint.heightMm * effectiveScale)} px
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
                {Math.round(selectedFootprint.widthMm * DOTS_PER_MM)} ×{' '}
                {Math.round(selectedFootprint.heightMm * DOTS_PER_MM)} dots
              </Text>
            </View>
          </View>
        </View>

        {/* Live TSPL Stream */}
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
                <Text style={styles.printBtnText}>Print Phase 6 via TSPL</Text>
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  undoRedoGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  actionIconBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  snapGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snapLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  snapChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  snapChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  snapChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  snapChipTextActive: {
    color: '#FFFFFF',
  },
  gridToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  gridToggleBtnActive: {
    backgroundColor: '#0F172A',
  },
  gridToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  gridToggleTextActive: {
    color: '#FFFFFF',
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
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rotBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
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
  elementContainer: {
    position: 'absolute',
  },
  elementBody: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementBodySelected: {
    borderWidth: 1.5,
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
  },
  resizeHandle: {
    position: 'absolute',
    width: 12,
    height: 12,
    backgroundColor: '#2563EB',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  handleNW: { top: -6, left: -6 },
  handleNE: { top: -6, right: -6 },
  handleSW: { bottom: -6, left: -6 },
  handleSE: { bottom: -6, right: -6 },
  boxShape: {
    borderColor: '#111827',
  },
  barcodeArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  barcodeLabelText: {
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
  fallbackText: {
    fontSize: 9,
    color: '#DC2626',
    fontWeight: '600',
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
  manipulationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  manipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  deleteManipBtn: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FECACA',
  },
  manipBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
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
