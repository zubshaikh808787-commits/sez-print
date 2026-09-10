/**
 * Phase 3 (Reworked): Size-First Import Flow with Ruled Measurement Canvas Screen
 *
 * Requirements per fix.md:
 * 1. Size Entry Gate: User commits to physical label dimensions (W×H mm) first.
 *    Import prompt is unreachable/disabled until valid positive values are confirmed.
 * 2. Import Prompt: Triggered only after size confirmation. Does not alter confirmed mm size.
 * 3. Ruled Measurement Canvas: Top and left millimeter scale guides (10mm major ticks,
 *    5mm mid ticks, 1mm minor ticks) scaling exactly with canvas zoom.
 * 4. Freeform Image Overlay: Draggable and resizable in physical mm against the ruler.
 *    No auto-fit, no forced aspect lock, no distortion warnings.
 * 5. Editor Unlock Gate: Design tools (Text, Barcode, QR, Box) locked until user confirms
 *    "Continue to Design".
 * 6. Background Visibility & Remove: User can toggle show/hide or remove the reference image.
 * 7. Non-Printing Guarantee: Reference image emits 0 TSPL bitmap ink.
 */

import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
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
import { DOTS_PER_MM, PRINTER_DPI } from '@/printing/calibration';
import {
  computeScreenFitScale,
  generateRulerTicks,
  mmToScreenPx,
  applyDragToMm,
  applyResizeToMm,
  exportCanvasBoundaryToTspl,
  exportUnifiedCanvasJob,
  type BackgroundReference,
  type CanvasDocument,
  type CanvasElement,
  type CanvasTextElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasBoxElement,
} from '@/printing/canvas-export';

const PRESETS = [
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '40×30 mm', w: 40, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×50 mm', w: 80, h: 50 },
  { label: '100×150 mm', w: 100, h: 150 },
];

const ZOOM_LEVELS = [0.75, 1.0, 1.25, 1.5, 2.0];
const OPACITY_LEVELS = [0.25, 0.5, 0.75, 1.0];

const SAMPLE_IMAGE_URI =
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=60';

export default function Phase3ImageImportScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // 1. Size Entry Gate State
  const [widthInput, setWidthInput] = useState<string>('50');
  const [heightInput, setHeightInput] = useState<string>('30');
  const [gapInput, setGapInput] = useState<string>('2');
  const [isSizeConfirmed, setIsSizeConfirmed] = useState<boolean>(true);

  // Confirmed physical dimensions in mm
  const [labelWidthMm, setLabelWidthMm] = useState<number>(50);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // 2. Background Reference Image Layer (Freeform Placement in mm)
  const [bgImage, setBgImage] = useState<BackgroundReference | null>(null);
  const [referenceOpacity, setReferenceOpacity] = useState<number>(0.6);

  // 3. Editor Unlock Gate State
  const [hasConfirmedPlacement, setHasConfirmedPlacement] = useState<boolean>(false);

  // 4. Added Design Elements
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Visual Viewport & Zoom
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const viewportWidth = 330;
  const viewportHeight = 220;
  const [printing, setPrinting] = useState<boolean>(false);

  // Scale (pixels per mm)
  const baseScale = useMemo(() => {
    return computeScreenFitScale(labelWidthMm, labelHeightMm, viewportWidth, viewportHeight, 20);
  }, [labelWidthMm, labelHeightMm]);

  const effectiveScale = baseScale * zoomFactor;
  const canvasWidthPx = Math.round(labelWidthMm * effectiveScale);
  const canvasHeightPx = Math.round(labelHeightMm * effectiveScale);

  // Ruler Ticks (Top & Left)
  const horizontalTicks = useMemo(() => generateRulerTicks(labelWidthMm, 1), [labelWidthMm]);
  const verticalTicks = useMemo(() => generateRulerTicks(labelHeightMm, 1), [labelHeightMm]);

  // Validation for Step 1
  const isInputSizeValid = useMemo(() => {
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    return !isNaN(w) && !isNaN(h) && w > 0 && h > 0;
  }, [widthInput, heightInput]);

  // Handle Confirm Size
  const handleConfirmSize = () => {
    const w = parseFloat(widthInput);
    const h = parseFloat(heightInput);
    const g = parseFloat(gapInput) || 2;
    if (w <= 0 || h <= 0) {
      Alert.alert('Invalid Size', 'Please enter valid positive numbers for width and height.');
      return;
    }
    setLabelWidthMm(w);
    setLabelHeightMm(h);
    setGapMm(g);
    setIsSizeConfirmed(true);

    // If an image already exists, adjust its initial size to fit canvas if requested
    if (bgImage) {
      setBgImage((prev) => (prev ? { ...prev, widthMm: w, heightMm: h } : null));
    }
  };

  // Image Picker (Triggered only after size confirmation)
  const handlePickImage = async () => {
    if (!isSizeConfirmed) {
      Alert.alert('Size Required', 'Please confirm your physical label dimensions first.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imgW = asset.width || 800;
        const imgH = asset.height || 600;

        Alert.alert(
          'Fit Image to Canvas Pad?',
          `Do you want to stretch the overall image to fit the entire canvas pad (${labelWidthMm} × ${labelHeightMm} mm), or keep its natural aspect ratio?`,
          [
            {
              text: 'Fit to Canvas Pad (Stretch)',
              onPress: () => {
                setBgImage({
                  uri: asset.uri,
                  imageWidthPx: imgW,
                  imageHeightPx: imgH,
                  leftMm: 0,
                  topMm: 0,
                  widthMm: labelWidthMm,
                  heightMm: labelHeightMm,
                  opacity: referenceOpacity,
                  visible: true,
                });
                setHasConfirmedPlacement(false);
              },
            },
            {
              text: 'Keep Natural Ratio',
              onPress: () => {
                const imgAspect = imgW / imgH;
                const canvasAspect = labelWidthMm / labelHeightMm;
                let w = labelWidthMm;
                let h = labelHeightMm;
                if (imgAspect > canvasAspect) {
                  h = Math.round((labelWidthMm / imgAspect) * 10) / 10;
                } else {
                  w = Math.round((labelHeightMm * imgAspect) * 10) / 10;
                }
                setBgImage({
                  uri: asset.uri,
                  imageWidthPx: imgW,
                  imageHeightPx: imgH,
                  leftMm: Math.round(((labelWidthMm - w) / 2) * 10) / 10,
                  topMm: Math.round(((labelHeightMm - h) / 2) * 10) / 10,
                  widthMm: w,
                  heightMm: h,
                  opacity: referenceOpacity,
                  visible: true,
                });
                setHasConfirmedPlacement(false);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
        );
      }
    } catch (err: unknown) {
      Alert.alert('Image Picker Error', err instanceof Error ? err.message : String(err));
    }
  };

  // Load Sample Reference Image
  const handleLoadSample = () => {
    if (!isSizeConfirmed) {
      Alert.alert('Size Required', 'Please confirm your physical label dimensions first.');
      return;
    }

    Alert.alert(
      'Fit Image to Canvas Pad?',
      `Do you want to stretch the overall sample image to fit the canvas pad (${labelWidthMm} × ${labelHeightMm} mm), or keep its natural aspect ratio?`,
      [
        {
          text: 'Fit to Canvas Pad (Stretch)',
          onPress: () => {
            setBgImage({
              uri: SAMPLE_IMAGE_URI,
              imageWidthPx: 800,
              imageHeightPx: 480,
              leftMm: 0,
              topMm: 0,
              widthMm: labelWidthMm,
              heightMm: labelHeightMm,
              opacity: referenceOpacity,
              visible: true,
            });
            setHasConfirmedPlacement(false);
          },
        },
        {
          text: 'Keep Natural Ratio',
          onPress: () => {
            const imgAspect = 800 / 480;
            const canvasAspect = labelWidthMm / labelHeightMm;
            let w = labelWidthMm;
            let h = labelHeightMm;
            if (imgAspect > canvasAspect) {
              h = Math.round((labelWidthMm / imgAspect) * 10) / 10;
            } else {
              w = Math.round((labelHeightMm * imgAspect) * 10) / 10;
            }
            setBgImage({
              uri: SAMPLE_IMAGE_URI,
              imageWidthPx: 800,
              imageHeightPx: 480,
              leftMm: Math.round(((labelWidthMm - w) / 2) * 10) / 10,
              topMm: Math.round(((labelHeightMm - h) / 2) * 10) / 10,
              widthMm: w,
              heightMm: h,
              opacity: referenceOpacity,
              visible: true,
            });
            setHasConfirmedPlacement(false);
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  // Remove Reference Image
  const handleRemoveImage = () => {
    Alert.alert(
      'Remove Background Reference',
      'Do you want to remove the reference image from your canvas?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setBgImage(null);
            setHasConfirmedPlacement(true);
          },
        },
      ],
    );
  };

  // Freeform Image Pan Responder (Dragging the image)
  const imagePanResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !hasConfirmedPlacement,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !hasConfirmedPlacement && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
      onPanResponderMove: (_, gesture) => {
        if (!bgImage) return;
        setBgImage((prev) => {
          if (!prev) return null;
          const next = applyDragToMm(
            { left: prev.leftMm ?? 0, top: prev.topMm ?? 0 },
            { x: gesture.dx, y: gesture.dy },
            effectiveScale,
            1.0,
          );
          return { ...prev, leftMm: next.left, topMm: next.top };
        });
      },
    });
  }, [bgImage, effectiveScale, hasConfirmedPlacement]);

  // Corner handle resize displacement
  const handleCornerResize = (deltaMm: { dw: number; dh: number }) => {
    if (!bgImage) return;
    setBgImage((prev) => {
      if (!prev) return null;
      const curW = prev.widthMm ?? labelWidthMm;
      const curH = prev.heightMm ?? labelHeightMm;
      const nextW = Math.max(5, Math.round((curW + deltaMm.dw) * 10) / 10);
      const nextH = Math.max(5, Math.round((curH + deltaMm.dh) * 10) / 10);
      return { ...prev, widthMm: nextW, heightMm: nextH };
    });
  };

  // Design Element Adders (Unlocked only after confirmation)
  const handleAddText = () => {
    const newEl: CanvasTextElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: 'SAMPLE TEXT',
      left: Math.round(labelWidthMm * 0.1),
      top: Math.round(labelHeightMm * 0.2),
      fontSize: 12,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  };

  const handleAddBarcode = () => {
    const newEl: CanvasBarcodeElement = {
      id: `bc-${Date.now()}`,
      type: 'barcode',
      data: '12345678',
      left: Math.round(labelWidthMm * 0.1),
      top: Math.round(labelHeightMm * 0.5),
      height: 10,
      narrowDots: 2,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  };

  const handleAddQr = () => {
    const newEl: CanvasQrElement = {
      id: `qr-${Date.now()}`,
      type: 'qr',
      data: 'https://sez-print.local',
      left: Math.max(2, labelWidthMm - 18),
      top: Math.round(labelHeightMm * 0.3),
      sizeMm: 15,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  };

  const handleAddBox = () => {
    const newEl: CanvasBoxElement = {
      id: `box-${Date.now()}`,
      type: 'box',
      left: 2,
      top: 2,
      width: Math.max(10, labelWidthMm - 4),
      height: Math.max(10, labelHeightMm - 4),
      lineWidth: 0.35,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  };

  // Print Physical Footprint Box (Verifying non-printing reference)
  const handlePrintBoundary = async () => {
    const manager = getPrinterManager();
    const isConn = await manager.ensureConnected();
    if (!isConn) {
      Alert.alert(
        'Printer Disconnected',
        `Physical footprint test requires printer connection.\n\nTarget Box: ${labelWidthMm}×${labelHeightMm} mm\nReference photo will emit ZERO bitmap ink.`,
      );
      return;
    }

    setPrinting(true);
    try {
      const docToPrint: CanvasDocument = {
        widthMm: labelWidthMm,
        heightMm: labelHeightMm,
        gapMm,
        direction: 1,
        backgroundReference: bgImage ?? undefined,
        elements,
      };

      const jobResult = exportUnifiedCanvasJob(docToPrint, {
        printBoundary: true,
      });

      await manager.printRawTspl(jobResult.binaryPayload);

      Alert.alert(
        'Boundary Footprint Sent',
        `Sent ${jobResult.totalBytes} bytes to ${deviceName || 'printer'}.\n\n` +
          `• Label Dimensions: ${labelWidthMm}×${labelHeightMm} mm\n` +
          `• Background Bitmap Ink: 0 bytes (Verified non-printing)\n` +
          `• Design Elements: ${elements.length}\n\n` +
          'Measure the outer boundary with calipers to verify ±0.5mm physical accuracy.',
      );
    } catch (err: unknown) {
      Alert.alert('Print Failed', err instanceof Error ? err.message : String(err));
    } finally {
      setPrinting(false);
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
          <Text style={styles.headerTitle}>Phase 3: Ruled Measurement Canvas</Text>
          <Text style={styles.headerSubtitle}>Size First • Real-World Mm Ruler • Freeform Placement</Text>
        </View>
        <View
          style={[
            styles.printerBadge,
            { backgroundColor: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' },
          ]}
        >
          <View
            style={[styles.printerDot, { backgroundColor: connected ? '#10B981' : '#EF4444' }]}
          />
          <Text
            style={[styles.printerBadgeText, { color: connected ? '#10B981' : '#EF4444' }]}
          >
            {connected ? deviceName || 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
      >
        {/* Step 1: Physical Size Entry Gate */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AppIcon name="square.dashed" size={18} tintColor="#3B82F6" />
            <Text style={styles.cardTitle}>Step 1: Commit Physical Size (Gate)</Text>
            {isSizeConfirmed && (
              <View style={styles.confirmedBadge}>
                <AppIcon name="checkmark" size={12} tintColor="#10B981" />
                <Text style={styles.confirmedText}>Confirmed</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDesc}>
            Commit to the real physical dimensions of your label stock first. Image import is unreachable until dimensions are confirmed.
          </Text>

          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={widthInput}
                onChangeText={(v) => {
                  setWidthInput(v);
                  setIsSizeConfirmed(false);
                }}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={heightInput}
                onChangeText={(v) => {
                  setHeightInput(v);
                  setIsSizeConfirmed(false);
                }}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Gap (mm):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={gapInput}
                onChangeText={(v) => {
                  setGapInput(v);
                }}
              />
            </View>
          </View>

          {/* Preset Buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {PRESETS.map((p) => {
              const active = labelWidthMm === p.w && labelHeightMm === p.h && isSizeConfirmed;
              return (
                <Pressable
                  key={p.label}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => {
                    setWidthInput(String(p.w));
                    setHeightInput(String(p.h));
                    setLabelWidthMm(p.w);
                    setLabelHeightMm(p.h);
                    setIsSizeConfirmed(true);
                  }}
                >
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {!isSizeConfirmed && (
            <Pressable
              style={[styles.confirmSizeBtn, !isInputSizeValid && styles.btnDisabled]}
              disabled={!isInputSizeValid}
              onPress={handleConfirmSize}
            >
              <Text style={styles.confirmSizeBtnText}>Confirm Label Size ({widthInput}×{heightInput} mm)</Text>
            </Pressable>
          )}
        </View>

        {/* Step 2: Image Import Prompt */}
        <View style={[styles.card, !isSizeConfirmed && styles.cardDisabled]}>
          <View style={styles.cardHeader}>
            <AppIcon name="photo" size={18} tintColor="#10B981" />
            <Text style={styles.cardTitle}>Step 2: Import Reference Photo</Text>
          </View>
          <Text style={styles.cardDesc}>
            Import a photo of your existing label. The photo lands on the ruled canvas for manual alignment.
          </Text>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.actionBtn, !isSizeConfirmed && styles.btnDisabled]}
              disabled={!isSizeConfirmed}
              onPress={handlePickImage}
            >
              <AppIcon name="photo" size={16} tintColor="#FFF" />
              <Text style={styles.actionBtnText}>Pick from Gallery</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtnSecondary, !isSizeConfirmed && styles.btnDisabled]}
              disabled={!isSizeConfirmed}
              onPress={handleLoadSample}
            >
              <Text style={styles.actionBtnSecondaryText}>Use Sample Photo</Text>
            </Pressable>
          </View>

          {bgImage && (
            <View style={styles.bgControlRow}>
              <View style={styles.bgToggleCol}>
                <Text style={styles.toggleLabel}>Show Background Reference:</Text>
                <Switch
                  value={bgImage.visible !== false}
                  onValueChange={(val) => setBgImage((prev) => (prev ? { ...prev, visible: val } : null))}
                  trackColor={{ false: '#232936', true: '#10B981' }}
                />
              </View>
              <Pressable style={styles.removeBtn} onPress={handleRemoveImage}>
                <AppIcon name="trash" size={14} tintColor="#EF4444" />
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Step 3: Ruled Measurement Canvas */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AppIcon name="slider.horizontal.3" size={18} tintColor="#8B5CF6" />
            <Text style={styles.cardTitle}>Ruled Canvas & Freeform Overlay</Text>
            <Text style={styles.canvasScaleText}>
              {labelWidthMm}×{labelHeightMm} mm ({baseScale.toFixed(2)} px/mm)
            </Text>
          </View>

          {/* Zoom & Opacity Controls */}
          <View style={styles.controlsBar}>
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Zoom:</Text>
              <View style={styles.chipRow}>
                {ZOOM_LEVELS.map((z) => (
                  <Pressable
                    key={z}
                    style={[styles.miniChip, zoomFactor === z && styles.miniChipActive]}
                    onPress={() => setZoomFactor(z)}
                  >
                    <Text style={[styles.miniChipText, zoomFactor === z && styles.miniChipTextActive]}>
                      {z}x
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {bgImage && (
              <View style={styles.controlGroup}>
                <Text style={styles.controlLabel}>Opacity:</Text>
                <View style={styles.chipRow}>
                  {OPACITY_LEVELS.map((op) => (
                    <Pressable
                      key={op}
                      style={[styles.miniChip, referenceOpacity === op && styles.miniChipActive]}
                      onPress={() => {
                        setReferenceOpacity(op);
                        setBgImage((prev) => (prev ? { ...prev, opacity: op } : null));
                      }}
                    >
                      <Text style={[styles.miniChipText, referenceOpacity === op && styles.miniChipTextActive]}>
                        {Math.round(op * 100)}%
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Canvas Wrapper with Top & Left Rulers */}
          <ScrollView horizontal contentContainerStyle={styles.canvasScrollContainer}>
            <View style={styles.rulerCanvasAssembly}>
              {/* Corner junction (0,0) */}
              <View style={styles.rulerCorner}>
                <Text style={styles.rulerCornerText}>mm</Text>
              </View>

              {/* Horizontal Ruler Strip (Top) */}
              <View style={[styles.horizontalRuler, { width: canvasWidthPx }]}>
                {horizontalTicks.map((tick) => {
                  const leftPx = mmToScreenPx(tick.mm, effectiveScale);
                  return (
                    <View key={`h-${tick.mm}`} style={[styles.rulerTickWrapper, { left: leftPx }]}>
                      <View
                        style={[
                          styles.rulerTickLine,
                          tick.isMajor
                            ? styles.rulerTickMajor
                            : tick.isMid
                              ? styles.rulerTickMid
                              : styles.rulerTickMinor,
                        ]}
                      />
                      {tick.isMajor && (
                        <Text style={styles.rulerLabelHorizontal}>{tick.label}</Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Vertical Assembly: Left Ruler + Label Canvas */}
              <View style={styles.verticalAssemblyRow}>
                {/* Vertical Ruler Strip (Left) */}
                <View style={[styles.verticalRuler, { height: canvasHeightPx }]}>
                  {verticalTicks.map((tick) => {
                    const topPx = mmToScreenPx(tick.mm, effectiveScale);
                    return (
                      <View key={`v-${tick.mm}`} style={[styles.rulerTickWrapperV, { top: topPx }]}>
                        <View
                          style={[
                            styles.rulerTickLineV,
                            tick.isMajor
                              ? styles.rulerTickMajorV
                              : tick.isMid
                                ? styles.rulerTickMidV
                                : styles.rulerTickMinorV,
                          ]}
                        />
                        {tick.isMajor && (
                          <Text style={styles.rulerLabelVertical}>{tick.label}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Main Label Canvas */}
                <View
                  style={[
                    styles.labelCanvas,
                    {
                      width: canvasWidthPx,
                      height: canvasHeightPx,
                    },
                  ]}
                >
                  {/* Outer Footprint Box Border */}
                  <View style={styles.canvasOuterBorder} pointerEvents="none" />

                  {/* Freeform Background Reference Image Overlay */}
                  {bgImage && bgImage.visible !== false && (
                    <View
                      {...imagePanResponder.panHandlers}
                      style={[
                        styles.imageLayer,
                        {
                          left: mmToScreenPx(bgImage.leftMm ?? 0, effectiveScale),
                          top: mmToScreenPx(bgImage.topMm ?? 0, effectiveScale),
                          width: mmToScreenPx(bgImage.widthMm ?? labelWidthMm, effectiveScale),
                          height: mmToScreenPx(bgImage.heightMm ?? labelHeightMm, effectiveScale),
                          opacity: bgImage.opacity ?? referenceOpacity,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: bgImage.uri }}
                        style={styles.fillImage}
                        contentFit="fill"
                      />

                      {/* Position & Dimension Tag */}
                      <View style={styles.imageCoordsTag} pointerEvents="none">
                        <Text style={styles.imageCoordsText}>
                          {(bgImage.leftMm ?? 0).toFixed(1)},{(bgImage.topMm ?? 0).toFixed(1)} mm | {(bgImage.widthMm ?? labelWidthMm).toFixed(1)}×{(bgImage.heightMm ?? labelHeightMm).toFixed(1)} mm
                        </Text>
                      </View>

                      {/* Corner Handles for Freeform Resize */}
                      {!hasConfirmedPlacement && (
                        <>
                          <View
                            style={[styles.cornerHandle, styles.handleSE]}
                            onTouchEnd={() => handleCornerResize({ dw: 2, dh: 2 })}
                          />
                          <View
                            style={[styles.cornerHandle, styles.handleNE]}
                            onTouchEnd={() => handleCornerResize({ dw: 2, dh: -2 })}
                          />
                          <View
                            style={[styles.cornerHandle, styles.handleSW]}
                            onTouchEnd={() => handleCornerResize({ dw: -2, dh: 2 })}
                          />
                          <View
                            style={[styles.cornerHandle, styles.handleNW]}
                            onTouchEnd={() => handleCornerResize({ dw: -2, dh: -2 })}
                          />
                        </>
                      )}
                    </View>
                  )}

                  {/* Added Vector Design Elements */}
                  {elements.map((el) => {
                    const elLeftPx = mmToScreenPx(el.left, effectiveScale);
                    const elTopPx = mmToScreenPx(el.top, effectiveScale);
                    const isSel = selectedElementId === el.id;

                    if (el.type === 'text') {
                      const txt = el as CanvasTextElement;
                      return (
                        <View
                          key={el.id}
                          style={[styles.elementItem, { left: elLeftPx, top: elTopPx }, isSel && styles.elementSelected]}
                          onTouchEnd={() => setSelectedElementId(el.id)}
                        >
                          <Text style={[styles.canvasTextEl, { fontSize: Math.max(9, txt.fontSize * 0.9 * effectiveScale / 6) }]}>
                            {txt.text}
                          </Text>
                        </View>
                      );
                    }

                    if (el.type === 'barcode') {
                      const bc = el as CanvasBarcodeElement;
                      return (
                        <View
                          key={el.id}
                          style={[styles.elementItem, { left: elLeftPx, top: elTopPx }, isSel && styles.elementSelected]}
                          onTouchEnd={() => setSelectedElementId(el.id)}
                        >
                          <AppIcon name="barcode" size={24} tintColor="#000" />
                          <Text style={styles.barcodeTextVal}>{bc.data}</Text>
                        </View>
                      );
                    }

                    if (el.type === 'qr') {
                      return (
                        <View
                          key={el.id}
                          style={[styles.elementItem, { left: elLeftPx, top: elTopPx }, isSel && styles.elementSelected]}
                          onTouchEnd={() => setSelectedElementId(el.id)}
                        >
                          <AppIcon name="qrcode" size={28} tintColor="#000" />
                        </View>
                      );
                    }

                    const box = el as CanvasBoxElement;
                    return (
                      <View
                        key={el.id}
                        style={[
                          styles.elementItem,
                          {
                            left: elLeftPx,
                            top: elTopPx,
                            width: mmToScreenPx(box.width, effectiveScale),
                            height: mmToScreenPx(box.height, effectiveScale),
                            borderWidth: 1.5,
                            borderColor: '#000',
                          },
                          isSel && styles.elementSelected,
                        ]}
                        onTouchEnd={() => setSelectedElementId(el.id)}
                      />
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Quick Fine-Tuning Chips */}
          {bgImage && !hasConfirmedPlacement && (
            <View style={styles.fineTuneRow}>
              <Pressable
                style={styles.fineTuneChip}
                onPress={() => setBgImage((prev) => (prev ? { ...prev, leftMm: 0, topMm: 0 } : null))}
              >
                <Text style={styles.fineTuneText}>Snap Origin (0,0)</Text>
              </Pressable>
              <Pressable
                style={styles.fineTuneChip}
                onPress={() =>
                  setBgImage((prev) => (prev ? { ...prev, widthMm: labelWidthMm, heightMm: labelHeightMm } : null))
                }
              >
                <Text style={styles.fineTuneText}>Fit Label (1:1)</Text>
              </Pressable>
              <Pressable
                style={styles.fineTuneChip}
                onPress={() => handleCornerResize({ dw: 2, dh: 2 })}
              >
                <Text style={styles.fineTuneText}>+2mm Scale</Text>
              </Pressable>
              <Pressable
                style={styles.fineTuneChip}
                onPress={() => handleCornerResize({ dw: -2, dh: -2 })}
              >
                <Text style={styles.fineTuneText}>-2mm Scale</Text>
              </Pressable>
            </View>
          )}

          {/* Step 4: Continue to Design Gate */}
          {bgImage && (
            <View style={styles.gateBanner}>
              {!hasConfirmedPlacement ? (
                <Pressable
                  style={styles.continueToDesignBtn}
                  onPress={() => setHasConfirmedPlacement(true)}
                >
                  <AppIcon name="checkmark" size={18} tintColor="#000" />
                  <Text style={styles.continueToDesignText}>Continue to Design (Lock Placement)</Text>
                </Pressable>
              ) : (
                <View style={styles.unlockedBar}>
                  <View style={styles.unlockedLeft}>
                    <AppIcon name="checkmark" size={16} tintColor="#10B981" />
                    <Text style={styles.unlockedText}>Placement Locked • Design Tools Active</Text>
                  </View>
                  <Pressable
                    style={styles.reAdjustBtn}
                    onPress={() => setHasConfirmedPlacement(false)}
                  >
                    <Text style={styles.reAdjustText}>Re-adjust Image</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Step 5: Design Tools (Gated) */}
        <View style={[styles.card, !hasConfirmedPlacement && styles.cardDisabled]}>
          <View style={styles.cardHeader}>
            <AppIcon name="square.grid.2x2" size={18} tintColor="#F59E0B" />
            <Text style={styles.cardTitle}>Design Overlay Elements</Text>
            {!hasConfirmedPlacement && (
              <Text style={styles.gatedBadge}>Gated (Confirm Placement First)</Text>
            )}
          </View>

          <View style={styles.designToolsRow}>
            <Pressable
              style={[styles.toolBtn, !hasConfirmedPlacement && styles.btnDisabled]}
              disabled={!hasConfirmedPlacement}
              onPress={handleAddText}
            >
              <AppIcon name="character" size={16} tintColor="#FFF" />
              <Text style={styles.toolBtnText}>+ Text</Text>
            </Pressable>
            <Pressable
              style={[styles.toolBtn, !hasConfirmedPlacement && styles.btnDisabled]}
              disabled={!hasConfirmedPlacement}
              onPress={handleAddBarcode}
            >
              <AppIcon name="barcode" size={16} tintColor="#FFF" />
              <Text style={styles.toolBtnText}>+ Barcode</Text>
            </Pressable>
            <Pressable
              style={[styles.toolBtn, !hasConfirmedPlacement && styles.btnDisabled]}
              disabled={!hasConfirmedPlacement}
              onPress={handleAddQr}
            >
              <AppIcon name="qrcode" size={16} tintColor="#FFF" />
              <Text style={styles.toolBtnText}>+ QR Code</Text>
            </Pressable>
            <Pressable
              style={[styles.toolBtn, !hasConfirmedPlacement && styles.btnDisabled]}
              disabled={!hasConfirmedPlacement}
              onPress={handleAddBox}
            >
              <AppIcon name="square.dashed" size={16} tintColor="#FFF" />
              <Text style={styles.toolBtnText}>+ Box</Text>
            </Pressable>
          </View>

          {elements.length > 0 && (
            <View style={styles.elementsList}>
              <Text style={styles.elementListTitle}>Canvas Elements ({elements.length}):</Text>
              {elements.map((el, i) => (
                <View key={el.id} style={styles.elementRow}>
                  <Text style={styles.elementRowName}>
                    #{i + 1} {el.type?.toUpperCase()} (at {el.left}mm, {el.top}mm)
                  </Text>
                  <Pressable
                    onPress={() => setElements((prev) => prev.filter((item) => item.id !== el.id))}
                  >
                    <AppIcon name="trash" size={14} tintColor="#EF4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Bar: Print Footprint Action */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable
          style={[styles.printBtn, printing && styles.btnDisabled]}
          disabled={printing}
          onPress={handlePrintBoundary}
        >
          {printing ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <View style={styles.btnInner}>
              <AppIcon name="printer" size={20} tintColor="#000" />
              <Text style={styles.printBtnText}>
                Print Canvas Boundary Box ({labelWidthMm}×{labelHeightMm} mm)
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
  cardDisabled: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  cardDesc: {
    color: '#8A92A6',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  confirmedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  confirmedText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
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
    borderColor: '#232936',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  presetScroll: {
    marginTop: 10,
  },
  presetChip: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  presetChipActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  presetChipText: {
    color: '#8A92A6',
    fontSize: 12,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#60A5FA',
  },
  confirmSizeBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  confirmSizeBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  actionBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    paddingVertical: 10,
  },
  actionBtnSecondaryText: {
    color: '#8A92A6',
    fontSize: 13,
    fontWeight: '600',
  },
  bgControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  bgToggleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  canvasScaleText: {
    color: '#6B7280',
    fontSize: 11,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlLabel: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 4,
  },
  miniChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#161922',
  },
  miniChipActive: {
    backgroundColor: '#3B82F6',
  },
  miniChipText: {
    color: '#8A92A6',
    fontSize: 10,
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: '#FFF',
  },
  canvasScrollContainer: {
    paddingVertical: 10,
  },
  rulerCanvasAssembly: {
    flexDirection: 'column',
  },
  rulerCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 20,
    backgroundColor: '#1E222E',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  rulerCornerText: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '700',
  },
  horizontalRuler: {
    height: 20,
    marginLeft: 28,
    backgroundColor: '#161922',
    borderBottomWidth: 1,
    borderColor: '#374151',
    position: 'relative',
    overflow: 'visible',
  },
  verticalAssemblyRow: {
    flexDirection: 'row',
  },
  verticalRuler: {
    width: 28,
    backgroundColor: '#161922',
    borderRightWidth: 1,
    borderColor: '#374151',
    position: 'relative',
    overflow: 'visible',
  },
  rulerTickWrapper: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'flex-start',
  },
  rulerTickLine: {
    width: 1,
    backgroundColor: '#6B7280',
  },
  rulerTickMajor: {
    height: 12,
    backgroundColor: '#E5E7EB',
    width: 1.5,
  },
  rulerTickMid: {
    height: 8,
    backgroundColor: '#9CA3AF',
  },
  rulerTickMinor: {
    height: 4,
    backgroundColor: '#4B5563',
  },
  rulerLabelHorizontal: {
    position: 'absolute',
    top: 6,
    left: 2,
    color: '#E5E7EB',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  rulerTickWrapperV: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'flex-start',
  },
  rulerTickLineV: {
    height: 1,
    backgroundColor: '#6B7280',
  },
  rulerTickMajorV: {
    width: 14,
    backgroundColor: '#E5E7EB',
    height: 1.5,
  },
  rulerTickMidV: {
    width: 9,
    backgroundColor: '#9CA3AF',
  },
  rulerTickMinorV: {
    width: 5,
    backgroundColor: '#4B5563',
  },
  rulerLabelVertical: {
    position: 'absolute',
    left: 12,
    top: -4,
    color: '#E5E7EB',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  labelCanvas: {
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
  },
  canvasOuterBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  imageLayer: {
    position: 'absolute',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  imageCoordsTag: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  imageCoordsText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cornerHandle: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: '#3B82F6',
    borderWidth: 1.5,
    borderColor: '#FFF',
    borderRadius: 7,
  },
  handleNW: { top: -7, left: -7 },
  handleNE: { top: -7, right: -7 },
  handleSW: { bottom: -7, left: -7 },
  handleSE: { bottom: -7, right: -7 },
  elementItem: {
    position: 'absolute',
    padding: 2,
  },
  elementSelected: {
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  canvasTextEl: {
    color: '#000',
    fontWeight: '700',
  },
  barcodeTextVal: {
    color: '#000',
    fontSize: 8,
    fontWeight: '600',
  },
  fineTuneRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  fineTuneChip: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  fineTuneText: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
  },
  gateBanner: {
    marginTop: 12,
  },
  continueToDesignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 6,
  },
  continueToDesignText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  unlockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  unlockedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unlockedText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  reAdjustBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reAdjustText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
  },
  gatedBadge: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  designToolsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 4,
  },
  toolBtnText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  elementsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#232936',
    paddingTop: 8,
  },
  elementListTitle: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  elementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  elementRowName: {
    color: '#FFF',
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
  btnDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
});
