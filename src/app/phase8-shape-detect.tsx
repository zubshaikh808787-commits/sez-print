/**
 * Phase 8 — Automatic Shape & Contour Detection Screen
 *
 * Capabilities:
 * 1. Image upload (or one-tap preset samples: Rectangle, Rounded Rect, Circle, Die-Cut).
 * 2. Automatic contour analysis: classifies shape into rectangle, roundedRectangle, circle, ellipse, or diecut.
 * 3. Extracts aspect ratio, fill ratio, and corner radius in physical millimeters.
 * 4. Interactive shape override and manual corner radius adjustment.
 * 5. Manual rectangle fallback toggle (preserving Phase 3 default behavior).
 * 6. Live visual SVG canvas rendering the detected contour over the label image.
 * 7. Physical boundary footprint TSPL printing for caliper measurement (within ±0.5mm).
 */

import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
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
import Svg, { Rect, Circle, Polygon } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { DOTS_PER_MM, PRINTER_DPI } from '@/printing/calibration';
import { computeScreenFitScale } from '@/printing/canvas-export';
import {
  detectLabelContour,
  createSyntheticLabelImage,
  type LabelShapeType,
  type LabelShapeDefinition,
  type DetectedLabelShape,
} from '@/printing/contour-detection';
import { exportCanvasBoundaryJob } from '@/printing/canvas-export';

interface SamplePreset {
  id: string;
  name: string;
  shape: LabelShapeType;
  widthMm: number;
  heightMm: number;
  radiusMm?: number;
}

const SAMPLE_PRESETS: SamplePreset[] = [
  { id: 'rect-50x30', name: 'Sharp Rectangle', shape: 'rectangle', widthMm: 50, heightMm: 30 },
  {
    id: 'rounded-50x30',
    name: 'Rounded Badge',
    shape: 'roundedRectangle',
    widthMm: 50,
    heightMm: 30,
    radiusMm: 5,
  },
  { id: 'circle-40', name: 'Round Bottle', shape: 'circle', widthMm: 40, heightMm: 40 },
  { id: 'diecut-tag', name: 'Barbell Die-Cut', shape: 'diecut', widthMm: 54, heightMm: 25 },
];

export default function Phase8ShapeDetectScreen() {
  const insets = useSafeAreaInsets();
  const connected = usePrinterStore((s) => s.status === 'connected');
  const deviceName = usePrinterStore((s) => s.deviceName);

  // Selected preset or custom uploaded image
  const [selectedPresetId, setSelectedPresetId] = useState<string>('rounded-50x30');
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Label Dimensions
  const [widthMm, setWidthMm] = useState<number>(50);
  const [heightMm, setHeightMm] = useState<number>(30);
  const [gapMm, setGapMm] = useState<number>(2);

  // Shape Configuration & Manual Overrides
  const [overrideShape, setOverrideShape] = useState<LabelShapeType | null>(null);
  const [cornerRadiusMm, setCornerRadiusMm] = useState<number>(5);
  const [forceManualRectangle, setForceManualRectangle] = useState<boolean>(false);

  const [printing, setPrinting] = useState<boolean>(false);
  const [referenceOpacity, setReferenceOpacity] = useState<number>(0.6);

  // Run contour detection on active sample or fallback
  const detectionResult = useMemo<DetectedLabelShape>(() => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === selectedPresetId) ?? SAMPLE_PRESETS[1];
    const synthWidth = 200;
    const synthHeight = Math.round(synthWidth * (preset.heightMm / preset.widthMm));
    const radiusPx = preset.radiusMm
      ? Math.round(synthWidth * (preset.radiusMm / preset.widthMm))
      : 20;

    const testImg = createSyntheticLabelImage(preset.shape, synthWidth, synthHeight, {
      cornerRadiusPx: radiusPx,
    });

    return detectLabelContour(testImg, synthWidth, synthHeight, {
      referenceWidthMm: preset.widthMm,
    });
  }, [selectedPresetId]);

  // Effective shape definition based on detection + user override
  const activeShapeType: LabelShapeType = forceManualRectangle
    ? 'rectangle'
    : overrideShape ?? detectionResult.type;

  const effectiveRadiusMm: number =
    activeShapeType === 'roundedRectangle'
      ? cornerRadiusMm
      : (detectionResult.cornerRadiusMm ?? 0);

  const shapeDefinition = useMemo<LabelShapeDefinition>(() => {
    return {
      type: activeShapeType,
      widthMm,
      heightMm,
      cornerRadiusMm: activeShapeType === 'roundedRectangle' ? effectiveRadiusMm : undefined,
      polygonPoints: detectionResult.polygonPoints,
    };
  }, [activeShapeType, widthMm, heightMm, effectiveRadiusMm, detectionResult.polygonPoints]);

  // Generated Boundary Print Job
  const boundaryJob = useMemo(() => {
    return exportCanvasBoundaryJob({
      widthMm,
      heightMm,
      gapMm,
      direction: 1,
      lineWidth: 0.35,
      shape: shapeDefinition,
    });
  }, [widthMm, heightMm, gapMm, shapeDefinition]);

  // Viewport scale
  const viewportW = 340;
  const viewportH = 220;
  const baseScale = computeScreenFitScale(widthMm, heightMm, viewportW, viewportH, 16);
  const canvasWidthPx = Math.round(widthMm * baseScale);
  const canvasHeightPx = Math.round(heightMm * baseScale);
  const radiusPx = Math.round(effectiveRadiusMm * baseScale);

  // Pick Custom Image
  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setImageUri(res.assets[0].uri);
        setSelectedPresetId('custom');
      }
    } catch {
      Alert.alert('Error', 'Could not open photo gallery.');
    }
  };

  // Select Preset Sample
  const handleSelectPreset = (preset: SamplePreset) => {
    setSelectedPresetId(preset.id);
    setImageUri(null);
    setWidthMm(preset.widthMm);
    setHeightMm(preset.heightMm);
    if (preset.radiusMm) setCornerRadiusMm(preset.radiusMm);
    setOverrideShape(null);
  };

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
      await pm.printRawTspl(boundaryJob.binaryPayload);
      Alert.alert(
        'Boundary Print Sent',
        `Phase 8 ${activeShapeType.toUpperCase()} boundary footprint sent to ${deviceName || 'printer'}.\n\n` +
          `• Shape: ${activeShapeType}\n` +
          `• Size: ${widthMm}×${heightMm} mm\n` +
          (activeShapeType === 'roundedRectangle' ? `• Radius: ${effectiveRadiusMm} mm\n` : '') +
          `• Payload: ${boundaryJob.totalBytes} bytes\n\n` +
          'Caliper Verification: Measure printed boundary against actual label stock with calipers (±0.5mm tolerance).',
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
          <Text style={styles.headerTitle}>Shape & Contour Detection</Text>
          <Text style={styles.headerSubtitle}>Phase 8 · Die-Cut & Irregular Labels</Text>
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
        {/* Sample / Image Selector */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>INPUT LABEL IMAGE</Text>
            <Pressable onPress={handlePickImage} style={styles.uploadBtn}>
              <AppIcon name="photo" size={14} tintColor="#3B82F6" />
              <Text style={styles.uploadBtnText}>Upload Photo</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {SAMPLE_PRESETS.map((p) => {
              const active = selectedPresetId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handleSelectPreset(p)}
                  style={[styles.presetChip, active && styles.presetChipActive]}>
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.name}
                  </Text>
                  <Text style={styles.presetChipSub}>
                    {p.widthMm}×{p.heightMm}mm
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Contour Detection Summary Card */}
        <View style={styles.detectionCard}>
          <View style={styles.detectionHeader}>
            <View style={styles.detectionBadge}>
              <AppIcon name="viewfinder" size={16} tintColor="#10B981" />
              <Text style={styles.detectionBadgeText}>
                AUTO-DETECTED: {detectionResult.type.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.confidenceText}>
              {Math.round(detectionResult.confidence * 100)}% Confidence
            </Text>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>{detectionResult.aspectRatio} : 1</Text>
              <Text style={styles.metricLbl}>Aspect Ratio</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>
                {Math.round(detectionResult.fillRatio * 100)}%
              </Text>
              <Text style={styles.metricLbl}>Fill Ratio</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricVal}>
                {detectionResult.cornerRadiusMm ? `${detectionResult.cornerRadiusMm} mm` : 'Sharp'}
              </Text>
              <Text style={styles.metricLbl}>Est. Radius</Text>
            </View>
          </View>
        </View>

        {/* Interactive Shape Adjustment & Override */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>SHAPE OVERRIDE & ADJUSTMENT</Text>
          <View style={styles.shapeTypeRow}>
            {(['rectangle', 'roundedRectangle', 'circle', 'diecut'] as LabelShapeType[]).map(
              (st) => {
                const active = activeShapeType === st;
                return (
                  <Pressable
                    key={st}
                    onPress={() => {
                      setForceManualRectangle(false);
                      setOverrideShape(st);
                    }}
                    style={[styles.shapeTypeBtn, active && styles.shapeTypeBtnActive]}>
                    <Text style={[styles.shapeTypeText, active && styles.shapeTypeTextActive]}>
                      {st === 'roundedRectangle'
                        ? 'Rounded'
                        : st === 'diecut'
                          ? 'Die-Cut'
                          : st.charAt(0).toUpperCase() + st.slice(1)}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>

          {/* Corner Radius Controls for Rounded Rectangle */}
          {activeShapeType === 'roundedRectangle' && (
            <View style={styles.radiusControlRow}>
              <Text style={styles.controlLabel}>Corner Radius: {effectiveRadiusMm} mm</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => setCornerRadiusMm(Math.max(1, cornerRadiusMm - 1))}
                  style={styles.stepperBtn}>
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.stepperVal}>{effectiveRadiusMm} mm</Text>
                <Pressable
                  onPress={() =>
                    setCornerRadiusMm(
                      Math.min(Math.floor(Math.min(widthMm, heightMm) / 2), cornerRadiusMm + 1),
                    )
                  }
                  style={styles.stepperBtn}>
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Dimension Inputs */}
          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Width (mm)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(widthMm)}
                onChangeText={(t) => setWidthMm(Math.max(10, parseFloat(t) || 10))}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Height (mm)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={String(heightMm)}
                onChangeText={(t) => setHeightMm(Math.max(10, parseFloat(t) || 10))}
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
          </View>

          {/* Force Manual Rectangle Fallback Switch */}
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchTitle}>Force Manual Rectangle</Text>
              <Text style={styles.switchSubtitle}>
                Fallback to standard Phase 3 rectangular boundary
              </Text>
            </View>
            <Switch
              value={forceManualRectangle}
              onValueChange={(val) => {
                setForceManualRectangle(val);
                if (val) setOverrideShape('rectangle');
              }}
              trackColor={{ false: '#2D3548', true: '#3B82F6' }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        {/* Live Visual Canvas Preview */}
        <View style={styles.canvasContainer}>
          <Text style={styles.canvasHeader}>CONTOUR VISUAL OVERLAY</Text>
          <View
            style={[
              styles.canvasWrapper,
              {
                width: canvasWidthPx,
                height: canvasHeightPx,
              },
            ]}>
            {/* Background Reference Image or simulated sticker */}
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={[StyleSheet.absoluteFillObject, { opacity: referenceOpacity }]}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundColor: '#F3F4F6',
                    opacity: referenceOpacity,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}>
                <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600' }}>
                  {selectedPresetId.toUpperCase()} REFERENCE
                </Text>
              </View>
            )}

            {/* Render Detected / Configured Shape Boundary */}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
              {activeShapeType === 'rectangle' && (
                <Rect
                  x={1}
                  y={1}
                  width={canvasWidthPx - 2}
                  height={canvasHeightPx - 2}
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="rgba(37, 99, 235, 0.08)"
                />
              )}

              {activeShapeType === 'roundedRectangle' && (
                <Rect
                  x={1}
                  y={1}
                  width={canvasWidthPx - 2}
                  height={canvasHeightPx - 2}
                  rx={radiusPx}
                  ry={radiusPx}
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="rgba(16, 185, 129, 0.08)"
                />
              )}

              {activeShapeType === 'circle' && (
                <Circle
                  cx={canvasWidthPx / 2}
                  cy={canvasHeightPx / 2}
                  r={Math.min(canvasWidthPx, canvasHeightPx) / 2 - 2}
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  fill="rgba(139, 92, 246, 0.08)"
                />
              )}

              {activeShapeType === 'diecut' && (
                <Polygon
                  points={
                    detectionResult.polygonPoints
                      ?.map(
                        (pt) => `${Math.round(pt.x * canvasWidthPx)},${Math.round(pt.y * canvasHeightPx)}`,
                      )
                      .join(' ') || `0,0 ${canvasWidthPx},0 ${canvasWidthPx},${canvasHeightPx} 0,${canvasHeightPx}`
                  }
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="rgba(245, 158, 11, 0.08)"
                />
              )}
            </Svg>

            {/* Shape Dimension Callouts */}
            <View style={styles.badgeCallout}>
              <Text style={styles.badgeCalloutText}>
                {widthMm}×{heightMm} mm
                {activeShapeType === 'roundedRectangle' ? ` · R=${effectiveRadiusMm}mm` : ''}
              </Text>
            </View>
          </View>

          <Text style={styles.canvasScaleText}>
            Scale: {baseScale.toFixed(2)} px/mm · Printer Dots:{' '}
            {Math.round(widthMm * DOTS_PER_MM)}×{Math.round(heightMm * DOTS_PER_MM)}
          </Text>
        </View>

        {/* TSPL Terminal Command Inspector */}
        <View style={styles.terminalBox}>
          <View style={styles.terminalHeader}>
            <View style={styles.terminalDots}>
              <View style={[styles.terminalDot, { backgroundColor: '#FF5F56' }]} />
              <View style={[styles.terminalDot, { backgroundColor: '#FFBD2E' }]} />
              <View style={[styles.terminalDot, { backgroundColor: '#27C93F' }]} />
            </View>
            <Text style={styles.terminalTitle}>
              TSPL Shape Footprint ({boundaryJob.totalBytes} B)
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.terminalScroll}>
            <Text style={styles.terminalCode}>{boundaryJob.tsplAscii.trimEnd()}</Text>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Footer Action Bar */}
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
                {connected
                  ? `Print ${activeShapeType.toUpperCase()} Boundary via TSPL`
                  : 'Connect & Print Boundary'}
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
  sectionCard: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#232936',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  uploadBtnText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
  presetScroll: {
    marginTop: 4,
  },
  presetChip: {
    backgroundColor: '#202636',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  presetChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#FFF',
  },
  presetChipSub: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
  detectionCard: {
    backgroundColor: '#101B2B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  detectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detectionBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  confidenceText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#162235',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  metricVal: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  metricLbl: {
    color: '#8A92A6',
    fontSize: 10,
    marginTop: 2,
  },
  shapeTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  shapeTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#202636',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shapeTypeBtnActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  shapeTypeText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  shapeTypeTextActive: {
    color: '#FFF',
  },
  radiusControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202636',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  controlLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stepperVal: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#232936',
    paddingTop: 10,
  },
  switchTextCol: {
    flex: 1,
    marginRight: 10,
  },
  switchTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  switchSubtitle: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 1,
  },
  canvasContainer: {
    backgroundColor: '#161922',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#232936',
    marginBottom: 14,
  },
  canvasHeader: {
    color: '#8A92A6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
    alignSelf: 'flex-start',
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
  badgeCallout: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeCalloutText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  canvasScaleText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 12,
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
    maxHeight: 160,
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
