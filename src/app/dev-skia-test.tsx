/**
 * Dev Skia Canvas Test Screen
 *
 * Scaffolding test harness to mount and visually verify <SkiaCanvas>
 * during Phase 1 (Tasks 1.1–1.3) before it is permanently mounted into edit.tsx in Task 1.4.
 *
 * Route: /dev-skia-test
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SkiaCanvas, type SkiaTransformCommitPayload } from '@/components/editor/skia-canvas';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { mmToPx } from '@/lib/label-coordinate-system';

const INITIAL_DOC: LabelDocument = {
  id: 'dev-skia-test-doc',
  name: 'Skia Test Label',
  widthMm: 57,
  heightMm: 30,
  orientation: 0,
  paperType: 'Label',
  groupId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  mediaShape: 'rectangle',
  templatePreviewType: 'generic',
  elements: [
    {
      id: 'el-text-1',
      type: 'text',
      text: 'SAMPLE TEXT',
      fontSize: 14,
      fontFamily: 'Default',
      bold: true,
      italic: false,
      underline: false,
      strikethrough: false,
      align: 'left',
      rotation: 0,
      left: 3,
      top: 3,
      width: 28,
      height: 6,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
      drawingColorIndex: 1,
      contentType: 'Manual',
      columnNameContent: '',
      charSpacing: 0,
      lineSpacing: '1.0',
      autoWrapping: 'Word',
      verticalDisplay: false,
      autoTextHeight: true,
    },
    {
      id: 'el-barcode-1',
      type: 'barcode',
      encodeMode: 'CODE-128',
      content: '12345678',
      columnNameContent: '',
      contentType: 'Manual',
      textFlag: 'Bottom',
      fontSize: 10,
      fontFamily: 'Default',
      align: 'left',
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      rotation: 0,
      left: 3,
      top: 11,
      width: 32,
      height: 15,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
      drawingColorIndex: 1,
    },
    {
      id: 'el-shape-1',
      type: 'shape',
      figureShape: 'rectangle',
      lineWidth: 1,
      roundRadius: 1.5,
      fill: false,
      fillColor: '#E2E8F0',
      drawingColorIndex: 1,
      rotation: 0,
      left: 38,
      top: 3,
      width: 16,
      height: 11,
      lockMovement: false,
      needPrinting: true,
    },
    {
      id: 'el-qr-1',
      type: 'qrcode',
      encodeMode: 'QRCode',
      content: 'https://example.com',
      columnNameContent: '',
      contentType: 'Manual',
      errorLevel: 'M',
      zoneSize: '2',
      codeShape: 'Auto',
      degreesOffset: 1,
      rotation: 0,
      left: 39,
      top: 15,
      width: 13,
      height: 13,
      lockMovement: false,
      needPrinting: true,
      antiColor: false,
      drawingColorIndex: 1,
    },
  ],
};

export default function DevSkiaTestScreen() {
  const router = useRouter();
  const [doc, setDoc] = useState<LabelDocument>(INITIAL_DOC);
  const [selectedIds, setSelectedIds] = useState<string[]>(['el-barcode-1']);
  const [zoom, setZoom] = useState(1);

  const pxPerMM = 6; // ~342px width for 57mm
  const canvasWidthPx = mmToPx(doc.widthMm, pxPerMM);
  const canvasHeightPx = mmToPx(doc.heightMm, pxPerMM);

  const handleSelect = useCallback((id: string) => {
    setSelectedIds([id]);
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleTransformEnd = useCallback((payload: SkiaTransformCommitPayload) => {
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        if (el.id !== payload.id) return el;
        return {
          ...el,
          left: payload.leftMm,
          top: payload.topMm,
          width: payload.widthMm,
          height: payload.heightMm,
          rotation: payload.rotation,
          ...(payload.fontSize ? { fontSize: payload.fontSize } : {}),
        };
      }),
    }));
  }, []);

  const handleQuickRotate = useCallback((id: string) => {
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        if (el.id !== id) return el;
        const currentRot = el.rotation || 0;
        return {
          ...el,
          rotation: (currentRot + 45) % 360,
        };
      }),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setDoc(INITIAL_DOC);
    setSelectedIds(['el-barcode-1']);
  }, []);

  const selectedElement = useMemo(
    () => doc.elements.find((el) => selectedIds.includes(el.id)),
    [doc.elements, selectedIds],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Dev Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Skia Canvas Test Harness</Text>
          <Text style={styles.headerSubtitle}>Phase 1 Tasks 1.1–1.3 Verification Screen</Text>
        </View>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Selected: <Text style={styles.boldText}>{selectedElement ? `${selectedElement.type} (${selectedElement.id})` : 'None'}</Text>
          {selectedElement ? ` — ${selectedElement.width.toFixed(2)} × ${(selectedElement.height || 0).toFixed(2)} mm (rot: ${selectedElement.rotation}°)` : ''}
        </Text>
        {selectedElement && (
          <TouchableOpacity
            style={styles.rotateButton}
            onPress={() => handleQuickRotate(selectedElement.id)}>
            <Ionicons name="reload" size={14} color="#FFFFFF" />
            <Text style={styles.rotateButtonText}>+45°</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Canvas Mount Area */}
      <View style={styles.canvasContainer}>
        <View
          style={[
            styles.canvasCard,
            {
              width: canvasWidthPx + 24,
              height: canvasHeightPx + 24,
            },
          ]}>
          <SkiaCanvas
            document={doc}
            canvasWidthPx={canvasWidthPx}
            canvasHeightPx={canvasHeightPx}
            pxPerMM={pxPerMM}
            padZoom={zoom}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onDeselectAll={handleDeselectAll}
            onOpenPanel={() => {}}
            onEditText={() => {}}
            onTransformEnd={handleTransformEnd}
            onQuickRotate={handleQuickRotate}
          />
        </View>
      </View>

      {/* Element Selector Controls */}
      <View style={styles.footerControls}>
        <Text style={styles.footerLabel}>Select Element to Test:</Text>
        <View style={styles.chipRow}>
          {doc.elements.map((el) => {
            const isSel = selectedIds.includes(el.id);
            return (
              <TouchableOpacity
                key={el.id}
                style={[styles.chip, isSel && styles.chipActive]}
                onPress={() => handleSelect(el.id)}>
                <Text style={[styles.chipText, isSel && styles.chipTextActive]}>
                  {el.type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  boldText: {
    fontWeight: '700',
    color: '#F8FAFC',
  },
  rotateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  rotateButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  canvasContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  canvasCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  footerControls: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#54C8C8',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  chipTextActive: {
    color: '#0F172A',
  },
});
