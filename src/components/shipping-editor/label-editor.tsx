/**
 * Interactive Shipping Label Editor.
 * Includes drag-and-drop field repositioning, snap-to-grid, live safe-zone overlay,
 * zoom controls, field inspector, PDF vector export, and direct thermal printing.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { AppIcon } from '@/components/app-icon';
import { LabelSizePicker } from '@/components/shipping-editor/label-size-picker';
import { ShippingLabelCanvas } from '@/components/shipping-editor/shipping-label-canvas';
import { renderLabelToPDF, shareLabelPDF } from '@/lib/shipping-editor/pdf-export';
import {
  DEFAULT_SHIPPING_ORDER_DATA,
  LabelDpi,
  LabelSizePreset,
  ShippingField,
  ShippingOrderData,
  ShippingTemplate,
  STANDARD_LABEL_SIZES,
  STARTER_SHIPPING_TEMPLATES,
  TEMPLATE_STANDARD_4X6,
} from '@/lib/shipping-editor/types';
import {
  calculatePrintGeometry,
  formatPrintGeometryDiagnostics,
} from '@/lib/printer/print-geometry';
import {
  encodeConnectedPrinterJob,
  PRINT_CAPTURE_OPTIONS,
  rasterizePngForPrint,
} from '@/lib/printer/print-job';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

type LabelEditorProps = {
  initialTemplate?: ShippingTemplate;
  initialOrderData?: ShippingOrderData;
  onSaveTemplate?: (template: ShippingTemplate) => void;
};

export function LabelEditor({
  initialTemplate = TEMPLATE_STANDARD_4X6,
  initialOrderData = DEFAULT_SHIPPING_ORDER_DATA,
  onSaveTemplate,
}: LabelEditorProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [template, setTemplate] = useState<ShippingTemplate>(
    JSON.parse(JSON.stringify(initialTemplate)),
  );
  const [orderData, setOrderData] = useState<ShippingOrderData>(initialOrderData);
  const [sizePreset, setSizePreset] = useState<LabelSizePreset>(
    STANDARD_LABEL_SIZES[template.labelSize] || STANDARD_LABEL_SIZES['4x6'],
  );
  const [dpi, setDpi] = useState<LabelDpi>(() => {
    const d = getPrinterManager().getPrintDpi();
    return (d >= 300 ? 300 : 203) as LabelDpi;
  });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Overlays & Guides
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Modals & States
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [dataModalVisible, setDataModalVisible] = useState(false);

  const printerStatus = usePrinterStore((s) => s.status);
  const connectedDeviceName = usePrinterStore((s) => s.deviceName);

  // Canvas display width (bounded to screen)
  const baseCanvasWidth = Math.min(screenWidth - 32, 420);
  const canvasWidthPx = Math.round(baseCanvasWidth * zoomLevel);

  // Selected Field
  const selectedField = useMemo(
    () => template.fields.find((f) => f.id === selectedFieldId) || null,
    [template.fields, selectedFieldId],
  );

  // Reset to starter template
  const handleResetToTemplate = () => {
    Alert.alert(
      'Reset Template',
      'Discard all changes and reset to the original template layout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const starter =
              STARTER_SHIPPING_TEMPLATES.find((t) => t.templateId === template.templateId) ||
              STARTER_SHIPPING_TEMPLATES[0];
            setTemplate(JSON.parse(JSON.stringify(starter)));
            setSelectedFieldId(null);
          },
        },
      ],
    );
  };

  // Update a field's properties
  const updateField = (fieldId: string, patch: Partial<ShippingField>) => {
    setTemplate((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? ({ ...f, ...patch } as ShippingField) : f)),
    }));
  };

  // Move field with snap-to-grid
  const moveField = (fieldId: string, dxPct: number, dyPct: number) => {
    setTemplate((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => {
        if (f.id !== fieldId) return f;
        let newX = Math.max(0, Math.min(100 - f.width, f.x + dxPct));
        let newY = Math.max(0, Math.min(100 - f.height, f.y + dyPct));

        // Snap to 2% grid
        if (showGrid) {
          newX = Math.round(newX / 2) * 2;
          newY = Math.round(newY / 2) * 2;
        }

        return { ...f, x: newX, y: newY } as ShippingField;
      }),
    }));
  };

  // Export to Vector PDF
  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      const pdf = await renderLabelToPDF(template, orderData, sizePreset);
      await shareLabelPDF(pdf.uri);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not generate PDF.';
      Alert.alert('Export Failed', msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const printShotRef = useRef<ViewShot>(null);

  // Direct Thermal Print
  const handleDirectPrint = async () => {
    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert(
        'Printer Not Connected',
        'Connect a thermal printer via Bluetooth or Wi‑Fi to print directly.',
      );
      return;
    }

    const widthMm = template.customWidthMm || sizePreset.widthMm;
    const heightMm = template.customHeightMm || sizePreset.heightMm;
    const activeDpi = manager.getPrintDpi();
    const geometry = calculatePrintGeometry(widthMm, heightMm, activeDpi);

    console.info(formatPrintGeometryDiagnostics(geometry, 'Shipping Label'));

    setPrinting(true);
    try {
      if (!printShotRef.current) {
        throw new Error('Print canvas is not ready.');
      }

      const base64 = await captureRef(printShotRef, PRINT_CAPTURE_OPTIONS);
      if (!base64) {
        throw new Error('Failed to capture label bitmap.');
      }

      const bits = rasterizePngForPrint(base64, {
        widthMm: geometry.labelWidthMm,
        heightMm: geometry.labelHeightMm,
        orientation: 0,
        threshold: 128,
        dither: false,
        hOffsetMm: 0,
      });

      const bytes = encodeConnectedPrinterJob(bits, {
        widthMm: geometry.labelWidthMm,
        heightMm: geometry.labelHeightMm,
        gapMm: 2,
        copies: 1,
        density: 8,
        speed: 5,
        vOffsetMm: 0,
        media: 'gap',
      });

      console.info('[shipping-editor] Transmitting WYSIWYG bitmap:', bytes.length, 'bytes');
      await manager.print(bytes);
      Alert.alert('Print Sent', 'Shipping label was transmitted to printer.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send label to printer.';
      Alert.alert('Print Failed', msg);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Controls Bar */}
      <View style={styles.topBar}>
        <LabelSizePicker
          selectedPreset={sizePreset}
          dpi={dpi}
          onSelectPreset={(p) => {
            setSizePreset(p);
            setTemplate((prev) => ({ ...prev, labelSize: p.id }));
          }}
          onChangeDpi={setDpi}
          onCustomSize={(w, h) => {
            setSizePreset({
              id: 'custom',
              name: 'Custom',
              detail: `${w} × ${h} mm`,
              widthIn: w / 25.4,
              heightIn: h / 25.4,
              widthMm: w,
              heightMm: h,
              safeMarginMm: 2,
              px203: { width: Math.round((w / 25.4) * 203), height: Math.round((h / 25.4) * 203) },
              px300: { width: Math.round((w / 25.4) * 300), height: Math.round((h / 25.4) * 300) },
            });
            setTemplate((prev) => ({
              ...prev,
              labelSize: 'custom',
              customWidthMm: w,
              customHeightMm: h,
            }));
          }}
        />

        {/* Toolbar Action Icons */}
        <View style={styles.toolRow}>
          {/* Safe Zone Toggle */}
          <Pressable
            onPress={() => setShowSafeZone((v) => !v)}
            style={[styles.toolBtn, showSafeZone && styles.toolBtnActive]}>
            <AppIcon
              name="square.dashed"
              tintColor={showSafeZone ? '#2563EB' : '#64748B'}
              size={16}
            />
            <Text style={[styles.toolBtnText, showSafeZone && styles.toolBtnTextActive]}>
              Safe Margin
            </Text>
          </Pressable>

          {/* Grid Toggle */}
          <Pressable
            onPress={() => setShowGrid((v) => !v)}
            style={[styles.toolBtn, showGrid && styles.toolBtnActive]}>
            <AppIcon
              name="square.grid.3x3"
              tintColor={showGrid ? '#2563EB' : '#64748B'}
              size={16}
            />
            <Text style={[styles.toolBtnText, showGrid && styles.toolBtnTextActive]}>Grid</Text>
          </Pressable>

          {/* Zoom Controls */}
          <View style={styles.zoomGroup}>
            <Pressable
              onPress={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
              style={styles.zoomBtn}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <Text style={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</Text>
            <Pressable
              onPress={() => setZoomLevel((z) => Math.min(1.6, z + 0.15))}
              style={styles.zoomBtn}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>

          {/* Reset Template */}
          <Pressable onPress={handleResetToTemplate} style={styles.toolBtn}>
            <AppIcon name="arrow.counterclockwise" tintColor="#DC2626" size={16} />
          </Pressable>
        </View>
      </View>

      {/* Main Canvas Workspace */}
      <ScrollView
        style={styles.workspace}
        contentContainerStyle={styles.workspaceContent}
        showsVerticalScrollIndicator={false}>
        <ShippingLabelCanvas
          template={template}
          orderData={orderData}
          sizePreset={sizePreset}
          canvasWidthPx={canvasWidthPx}
          selectedFieldId={selectedFieldId}
          onSelectField={(id) => setSelectedFieldId((cur) => (cur === id ? null : id))}
          showSafeZone={showSafeZone}
          showGrid={showGrid}
          showRulers={showRulers}
        />
      </ScrollView>

      {/* 1:1 Hardware Dot Print Artboard (captured at true printer DPI without screen scaling) */}
      <View
        style={{
          position: 'absolute',
          left: -9999,
          top: -9999,
          opacity: 0,
          pointerEvents: 'none',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
        }}>
        <ViewShot
          ref={printShotRef}
          options={PRINT_CAPTURE_OPTIONS}
          style={{
            width: calculatePrintGeometry(
              template.customWidthMm || sizePreset.widthMm,
              template.customHeightMm || sizePreset.heightMm,
              dpi,
            ).widthDots,
            height: calculatePrintGeometry(
              template.customWidthMm || sizePreset.widthMm,
              template.customHeightMm || sizePreset.heightMm,
              dpi,
            ).heightDots,
            backgroundColor: '#FFFFFF',
          }}>
          <ShippingLabelCanvas
            template={template}
            orderData={orderData}
            sizePreset={sizePreset}
            canvasWidthPx={
              calculatePrintGeometry(
                template.customWidthMm || sizePreset.widthMm,
                template.customHeightMm || sizePreset.heightMm,
                dpi,
              ).widthDots
            }
            showSafeZone={false}
            showGrid={false}
            showRulers={false}
          />
        </ViewShot>
      </View>

      {/* Field Inspector Drawer (when a field is selected) */}
      {selectedField && (
        <View style={styles.inspector}>
          <View style={styles.inspectorHeader}>
            <Text style={styles.inspectorTitle}>
              Field: {selectedField.label || selectedField.id}
            </Text>
            <Pressable onPress={() => setSelectedFieldId(null)} hitSlop={10}>
              <AppIcon name="xmark" tintColor="#64748B" size={14} />
            </Pressable>
          </View>

          {/* Quick Alignment / Position controls */}
          <View style={styles.inspectorRow}>
            <Text style={styles.inspectorLabel}>Position (X/Y %):</Text>
            <View style={styles.stepperGroup}>
              <Pressable
                onPress={() => moveField(selectedField.id, -2, 0)}
                style={styles.stepperBtn}>
                <Text style={styles.stepperGlyph}>◀</Text>
              </Pressable>
              <Pressable
                onPress={() => moveField(selectedField.id, 2, 0)}
                style={styles.stepperBtn}>
                <Text style={styles.stepperGlyph}>▶</Text>
              </Pressable>
              <Pressable
                onPress={() => moveField(selectedField.id, 0, -2)}
                style={styles.stepperBtn}>
                <Text style={styles.stepperGlyph}>▲</Text>
              </Pressable>
              <Pressable
                onPress={() => moveField(selectedField.id, 0, 2)}
                style={styles.stepperBtn}>
                <Text style={styles.stepperGlyph}>▼</Text>
              </Pressable>
            </View>
          </View>

          {/* Custom Text input for text blocks */}
          {selectedField.type === 'text-block' && (
            <View style={styles.inputBox}>
              <Text style={styles.inspectorLabel}>Custom Text Content:</Text>
              <TextInput
                value={selectedField.customContent || ''}
                onChangeText={(txt) => updateField(selectedField.id, { customContent: txt })}
                placeholder="Override field content..."
                style={styles.inspectorInput}
              />
            </View>
          )}
        </View>
      )}

      {/* Bottom Export & Print Actions Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          onPress={() => setDataModalVisible(true)}
          style={({ pressed }) => [styles.secBtn, pressed && styles.pressed]}>
          <AppIcon name="person.crop.circle" tintColor="#0F172A" size={16} />
          <Text style={styles.secBtnText}>Order Data</Text>
        </Pressable>

        <Pressable
          onPress={handleExportPDF}
          disabled={exportingPdf}
          style={({ pressed }) => [styles.secBtn, pressed && styles.pressed]}>
          {exportingPdf ? (
            <ActivityIndicator size="small" color="#0F172A" />
          ) : (
            <>
              <AppIcon name="arrow.down.doc" tintColor="#0F172A" size={16} />
              <Text style={styles.secBtnText}>Export PDF</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={handleDirectPrint}
          disabled={printing}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          {printing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <AppIcon name="printer.fill" tintColor="#FFFFFF" size={16} />
              <Text style={styles.primaryBtnText}>Print Label</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Order Data Editor Modal */}
      <Modal
        visible={dataModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDataModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setDataModalVisible(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Order Data</Text>
              <Pressable onPress={() => setDataModalVisible(false)} hitSlop={12}>
                <AppIcon name="xmark" tintColor="#64748B" size={16} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <DataFieldRow
                label="Sender Address"
                value={orderData.senderAddress}
                onChange={(t) => setOrderData((d) => ({ ...d, senderAddress: t }))}
                multiline
              />
              <DataFieldRow
                label="Recipient Address"
                value={orderData.recipientAddress}
                onChange={(t) => setOrderData((d) => ({ ...d, recipientAddress: t }))}
                multiline
              />
              <DataFieldRow
                label="Weight"
                value={orderData.weight}
                onChange={(t) => setOrderData((d) => ({ ...d, weight: t }))}
              />
              <DataFieldRow
                label="Dimensions"
                value={orderData.dimension}
                onChange={(t) => setOrderData((d) => ({ ...d, dimension: t }))}
              />
              <DataFieldRow
                label="Shipping Date"
                value={orderData.shipDate}
                onChange={(t) => setOrderData((d) => ({ ...d, shipDate: t }))}
              />
              <DataFieldRow
                label="Tracking Number / Barcode"
                value={orderData.trackingNumber}
                onChange={(t) => setOrderData((d) => ({ ...d, trackingNumber: t }))}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DataFieldRow({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        style={[styles.dataInput, multiline && { height: 60 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  toolBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  toolBtnTextActive: {
    color: '#2563EB',
  },
  zoomGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  zoomBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  zoomText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  zoomLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    minWidth: 32,
    textAlign: 'center',
  },
  workspace: {
    flex: 1,
  },
  workspaceContent: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspector: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inspectorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  inspectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inspectorLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  stepperGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 10,
    color: '#334155',
  },
  inputBox: {
    marginTop: 4,
  },
  inspectorInput: {
    height: 32,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    marginTop: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  secBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  secBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  dataRow: {
    marginBottom: 12,
  },
  dataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  dataInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
  },
  pressed: {
    opacity: 0.75,
  },
});
