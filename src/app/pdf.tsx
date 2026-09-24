import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { AppIcon } from '@/components/app-icon';
import { PdfCropTool } from '@/components/pdf-editor/pdf-crop-tool';
import { PdfOutputSizeRow } from '@/components/pdf-editor/pdf-output-size-row';
import { PdfPageNav } from '@/components/pdf-editor/pdf-page-nav';
import { PdfPageViewer } from '@/components/pdf-editor/pdf-page-viewer';
import { PdfRotateTool } from '@/components/pdf-editor/pdf-rotate-tool';
import { PdfSharpnessTool } from '@/components/pdf-editor/pdf-sharpness-tool';
import { PdfToolPanel, type PdfToolId } from '@/components/pdf-editor/pdf-tool-panel';
import { PdfWatermarkTool } from '@/components/pdf-editor/pdf-watermark-tool';
import { Palette } from '@/constants/ui';
import { exportEditedPdf } from '@/lib/pdf-editor/export';
import { copyPdfToCache, loadPdfMetadata } from '@/lib/pdf-editor/load';
import {
  PREVIEW_DPI,
  clearRasterCache,
  prefetchNeighborPages,
  rasterPdfPageCached,
} from '@/lib/pdf-editor/raster';
import {
  cropWindowFitsPage,
  cropWindowPts,
  defaultWatermark,
  resolveScopeIndices,
  type PageScope,
} from '@/lib/pdf-editor/session';
import { downscaleWatermarkTile, previewTileSize } from '@/lib/pdf-editor/watermark-tile';
import { usePdfEditStore } from '@/stores/pdf-edit-store';

/** Standalone PDF Editor screen with Crop, Rotate, Sharpness, and Watermark tools. */
export default function PdfEditorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    docUri?: string;
    docName?: string;
    uri?: string;
    name?: string;
  }>();
  const session = usePdfEditStore((s) => s.session);
  const startSession = usePdfEditStore((s) => s.startSession);
  const resetSession = usePdfEditStore((s) => s.resetSession);
  const setCurrentPage = usePdfEditStore((s) => s.setCurrentPage);
  const setOutputSize = usePdfEditStore((s) => s.setOutputSize);
  const setCrop = usePdfEditStore((s) => s.setCrop);
  const setCropScope = usePdfEditStore((s) => s.setCropScope);
  const setCropOrigin = usePdfEditStore((s) => s.setCropOrigin);
  const setCropRect = usePdfEditStore((s) => s.setCropRect);
  const setRotationForCurrent = usePdfEditStore((s) => s.setRotationForCurrent);
  const setSharpnessForCurrent = usePdfEditStore((s) => s.setSharpnessForCurrent);
  const setWatermark = usePdfEditStore((s) => s.setWatermark);
  const patchWatermark = usePdfEditStore((s) => s.patchWatermark);

  const [tool, setTool] = useState<PdfToolId | null>(null);
  const [pageUri, setPageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      resetSession();
      clearRasterCache();
    };
  }, [resetSession]);

  useEffect(() => {
    const rawUri = params.docUri || params.uri;
    const rawName = params.docName || params.name || 'document.pdf';
    if (!rawUri || session) return;

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const cached = await copyPdfToCache(rawUri, rawName);
        const meta = await loadPdfMetadata(cached);
        if (!cancelled) {
          startSession({
            sourceUri: cached,
            sourceName: rawName,
            pageCount: meta.pageCount,
            pageSizesPt: meta.pageSizesPt,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Could not open this PDF.';
          Alert.alert('PDF', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.docUri, params.uri, params.docName, params.name, session, startSession]);

  useEffect(() => {
    if (!session) {
      setPageUri(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    rasterPdfPageCached(session.sourceUri, session.currentPageIndex, PREVIEW_DPI)
      .then((page) => {
        if (!cancelled) setPageUri(page.uri);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Could not render this page.';
          Alert.alert('PDF', msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    prefetchNeighborPages(session.sourceUri, session.currentPageIndex, session.pageCount, PREVIEW_DPI);
    return () => {
      cancelled = true;
    };
  }, [session?.sourceUri, session?.currentPageIndex, session?.pageCount]);

  const importPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setLoading(true);
      const cached = await copyPdfToCache(file.uri, file.name);
      const meta = await loadPdfMetadata(cached);
      startSession({
        sourceUri: cached,
        sourceName: file.name,
        pageCount: meta.pageCount,
        pageSizesPt: meta.pageSizesPt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open this PDF.';
      Alert.alert('PDF', msg);
    } finally {
      setLoading(false);
    }
  }, [startSession]);

  const exportPdf = useCallback(async () => {
    if (!session || exporting) return;
    setExporting(true);
    setExportProgress('Exporting…');
    try {
      const result = await exportEditedPdf(session, (current, total) => {
        setExportProgress(`Page ${current} / ${total}`);
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: session.sourceName,
        });
      } else {
        Alert.alert('Exported', result.uri);
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Could not write PDF.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting, session]);

  const pageSize = session?.pageSizesPt[session.currentPageIndex] ?? { w: 612, h: 792 };
  const fits = session ? cropWindowFitsPage(pageSize.w, pageSize.h, session.outputSize) : false;
  const defaultOrigin = (() => {
    if (!session) return { x: 0, y: 0 };
    const box = cropWindowPts(pageSize, session.outputSize, { x: 0, y: 0 });
    if (!box.fits) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (pageSize.w - box.w) / 2 / pageSize.w),
      y: Math.max(0, (pageSize.h - box.h) / 2 / pageSize.h),
    };
  })();
  const origin = session?.crop?.originNorm ?? defaultOrigin;
  const cropScope: PageScope = session?.crop?.scope ?? { mode: 'this' };

  const ensureWatermark = () => {
    if (!session?.watermark) setWatermark(defaultWatermark());
  };

  const onPickWmImage = async (uri: string) => {
    if (!session) return;
    const minSide = Math.min(session.outputSize.widthMm, session.outputSize.heightMm);
    const spacing = session.watermark?.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 };
    const tilePx = previewTileSize(minSide, spacing);
    const tile = await downscaleWatermarkTile(uri, tilePx);
    patchWatermark({
      type: 'image',
      image: { sourceUri: uri, tileUri: tile.tileUri, tilePx: tile.tilePx },
    });
  };

  const isCropped = Boolean(
    session?.crop &&
      resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex).includes(
        session.currentPageIndex,
      ),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <AppIcon name="chevron.left" size={22} tintColor="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Print PDF</Text>
        <Pressable
          onPress={exportPdf}
          disabled={!session || exporting}
          style={styles.headerBtn}
          hitSlop={8}>
          <Text style={[styles.export, (!session || exporting) && styles.exportOff]}>Export</Text>
        </Pressable>
      </View>

      {!session ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Import a PDF</Text>
          <Text style={styles.emptyBody}>Crop, rotate, sharpen, and watermark — then export a new PDF. Printing is not part of this editor.</Text>
          <Pressable onPress={importPdf} style={styles.importBtn}>
            <Text style={styles.importText}>Choose PDF</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <PdfPageViewer
            uri={pageUri}
            pageWpt={pageSize.w}
            pageHpt={pageSize.h}
            rotation={session.rotationByPage[session.currentPageIndex] ?? 0}
            outputSize={session.outputSize}
            originNorm={origin}
            sizeNorm={session.crop?.sizeNorm}
            onCropRect={setCropRect}
            cropEnabled={tool === 'crop'}
            isCropped={isCropped}
            watermark={session.watermark}
            watermarkEnabled={tool === 'watermark' && !!session.watermark}
            onStampOffset={(offsetNorm) => {
              const wm = session.watermark ?? defaultWatermark();
              patchWatermark({
                stamp: {
                  anchor: wm.stamp?.anchor ?? 'center',
                  offsetNorm,
                  sizeNorm: wm.stamp?.sizeNorm ?? 0.28,
                },
              });
            }}
            sharpness={session.sharpnessByPage[session.currentPageIndex] ?? 0}
          />
          {loading ? <ActivityIndicator color={Palette.accent} style={{ marginVertical: 8 }} /> : null}
          <PdfPageNav
            index={session.currentPageIndex}
            total={session.pageCount}
            onPrev={() => setCurrentPage(session.currentPageIndex - 1)}
            onNext={() => setCurrentPage(session.currentPageIndex + 1)}
          />
          <PdfOutputSizeRow value={session.outputSize} onChange={setOutputSize} />
          <PdfToolPanel
            active={tool}
            onChange={(id) => {
              const nextTool = tool === id ? null : id;
              setTool(nextTool);
              if (nextTool === 'crop' && !session.crop) {
                setCropRect(defaultOrigin, { w: 0.8, h: 0.8 });
              }
              if (id === 'watermark') ensureWatermark();
            }}>
            {tool === 'crop' ? (
              <PdfCropTool
                scope={cropScope}
                pageCount={session.pageCount}
                fits={fits}
                hasCrop={Boolean(session.crop)}
                onResetCrop={() => setCrop(null)}
                onApplyCrop={() => setTool(null)}
                onScope={(scope) => {
                  setCropScope(scope);
                }}
              />
            ) : null}
            {tool === 'rotate' ? (
              <PdfRotateTool
                value={session.rotationByPage[session.currentPageIndex] ?? 0}
                onChange={setRotationForCurrent}
              />
            ) : null}
            {tool === 'sharpness' ? (
              <PdfSharpnessTool
                value={session.sharpnessByPage[session.currentPageIndex] ?? 0}
                onChange={setSharpnessForCurrent}
              />
            ) : null}
            {tool === 'watermark' && session.watermark ? (
              <PdfWatermarkTool
                value={session.watermark}
                pageCount={session.pageCount}
                onChange={async (next) => {
                  if (
                    next.type === 'image' &&
                    next.layout === 'tiled' &&
                    next.image?.sourceUri
                  ) {
                    const minSide = Math.min(session.outputSize.widthMm, session.outputSize.heightMm);
                    const tilePx = previewTileSize(
                      minSide,
                      next.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 },
                    );
                    const tile = await downscaleWatermarkTile(next.image.sourceUri, tilePx);
                    setWatermark({
                      ...next,
                      image: { ...next.image, tileUri: tile.tileUri, tilePx: tile.tilePx },
                    });
                    return;
                  }
                  setWatermark(next);
                }}
                onPickImage={onPickWmImage}
              />
            ) : null}
          </PdfToolPanel>
          {exportProgress ? <Text style={styles.progress}>{exportProgress}</Text> : null}
          <Pressable onPress={importPdf} style={styles.replace}>
            <Text style={styles.replaceText}>Replace PDF</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.screen },
  header: {
    height: 48,
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerBtn: { minWidth: 64, paddingHorizontal: 8, paddingVertical: 8 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  export: { color: '#fff', fontWeight: '700', textAlign: 'right' },
  exportOff: { opacity: 0.4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Palette.ink },
  emptyBody: { fontSize: 14, color: Palette.muted, textAlign: 'center', lineHeight: 20 },
  importBtn: {
    marginTop: 8,
    backgroundColor: Palette.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  importText: { color: '#fff', fontWeight: '700' },
  progress: { textAlign: 'center', color: Palette.muted, marginTop: 8 },
  replace: { alignSelf: 'center', padding: 16 },
  replaceText: { color: Palette.accent, fontWeight: '600' },
});

