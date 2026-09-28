/**
 * On-device ground-truth: dry-run PNG-path TSPL vs headless mono TSPL.
 * Route: /ground-truth-parity  (dev build, no printer)
 */

import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { resolveBuildTime, resolveGitSha } from '@/lib/build-identity';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { printCaptureLayout, printCaptureOptionsForSize, waitForNextPaint } from '@/lib/printer/print-job';
import { printTd404MonoLabel, printTd404PngLabel } from 'td404-printer';
import {
  boxDownscaleGray,
  decodeBase64ToBytes,
  thresholdGray,
  unpackWireMono1bppToGray,
} from '@/printing/raster/tspl-wire';
import {
  diffDocumentRegions,
  isolateDocument,
  rnTextFontProbe,
  textInkOffsets,
} from '@/printing/raster/ground-truth-parity';
import { packGrayToMono1bpp } from '@/printing/raster/bit-packer';
import {
  createPhase4FrozenDocument,
  packedPageDots,
  rasterizeDocumentToBitmapTimed,
} from '@/printing/raster/skia-rasterizer';
import { getTextDrawLog } from '@/printing/raster/skia-surface';
import { useLabelStore } from '@/stores/label-store';

const DPI = 304;
const THRESHOLD = 160;
const ISOLATE_TYPES: LabelElement['type'][] = ['text', 'barcode', 'qrcode', 'border'];

function pickDocument(): LabelDocument {
  const docs = useLabelStore.getState().documents;
  if (docs.length > 0) {
    return [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  return createPhase4FrozenDocument();
}

async function dryRunPng(pngBase64: string, doc: LabelDocument) {
  const result = await printTd404PngLabel({
    pngBase64,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    dpi: DPI,
    threshold: THRESHOLD,
    dryRun: true,
    gitSha: resolveGitSha(),
    buildTime: resolveBuildTime(),
  });
  if (!result?.wireBmpBase64 || !result.bytesPerRow || !result.heightDots || !result.widthDots) {
    throw new Error(
      result
        ? 'Dry-run PNG result missing wire bitmap. Rebuild the Android binary.'
        : 'printPngLabel unavailable. Rebuild the Android binary.',
    );
  }
  const wire = decodeBase64ToBytes(result.wireBmpBase64);
  const gray = unpackWireMono1bppToGray(wire, result.widthDots, result.heightDots, result.bytesPerRow);
  return { result, gray, width: result.widthDots, height: result.heightDots };
}

async function dryRunMono(doc: LabelDocument, threshold = THRESHOLD, dotScale = 1) {
  const timed = rasterizeDocumentToBitmapTimed(doc, DPI, { threshold, dotScale });
  const bitmap = timed.result;
  let gray = timed.gray;
  let width = bitmap.widthDots;
  let height = bitmap.heightDots;
  let bytesPerRow = bitmap.bytesPerRow;
  let monoBytes = bitmap.mono1bppBuffer;
  if (dotScale > 1) {
    gray = boxDownscaleGray(timed.gray, bitmap.widthDots, bitmap.heightDots, dotScale);
    const packed = packedPageDots(doc.widthMm, doc.heightMm, DPI);
    width = packed.packedW;
    height = packed.packedH;
    const packedBits = packGrayToMono1bpp(thresholdGray(gray, threshold), width, height, threshold);
    monoBytes = packedBits.mono1bppBuffer;
    bytesPerRow = packedBits.bytesPerRow;
    gray = thresholdGray(gray, threshold);
  }
  const result = await printTd404MonoLabel({
    monoBytes,
    widthDots: width,
    heightDots: height,
    bytesPerRow,
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    dpi: DPI,
    dryRun: true,
    gitSha: resolveGitSha(),
    buildTime: resolveBuildTime(),
  });
  if (!result?.wireBmpBase64) {
    throw new Error(
      result
        ? 'Dry-run mono result missing wire bitmap. Rebuild the Android binary.'
        : 'printMonoLabel unavailable. Rebuild the Android binary.',
    );
  }
  const wire = decodeBase64ToBytes(result.wireBmpBase64);
  const unpacked = unpackWireMono1bppToGray(
    wire,
    result.widthDots ?? width,
    result.heightDots ?? height,
    result.bytesPerRow ?? bytesPerRow,
  );
  return { result, gray: unpacked, timed, skiaFonts: getTextDrawLog(), width, height };
}

function formatRegions(rows: DiffRegion[]): string {
  return rows.map((r) => `${r.kind}:${r.id} ${r.percent.toFixed(3)}% (${r.differing}/${r.pixels})`).join('\n');
}

export default function GroundTruthParityScreen() {
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseDoc = pickDocument();
  const [shotDoc, setShotDoc] = useState(baseDoc);
  const capture = printCaptureLayout(shotDoc.widthMm, shotDoc.heightMm, DPI).content;
  const captureDensity = PixelRatio.get() || 1;
  const captureLayout = {
    widthPx: capture.widthPx / captureDensity,
    heightPx: capture.heightPx / captureDensity,
  };
  const captureOptions = printCaptureOptionsForSize(capture.widthPx, capture.heightPx);

  const capturePng = useCallback(async (labelDoc: LabelDocument) => {
    setShotDoc(labelDoc);
    await new Promise((r) => setTimeout(r, 80));
    await waitForNextPaint();
    await waitForNextPaint();
    const dots = printCaptureLayout(labelDoc.widthMm, labelDoc.heightMm, DPI).content;
    return captureRef(shotRef, printCaptureOptionsForSize(dots.widthPx, dots.heightPx));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const doc = baseDoc;
      const pngBase64 = await capturePng(doc);
      const png = await dryRunPng(pngBase64, doc);
      const mono = await dryRunMono(doc);
      if (png.width !== mono.width || png.height !== mono.height) {
        throw new Error(`Grid mismatch PNG ${png.width}x${png.height} vs mono ${mono.width}x${mono.height}`);
      }
      const regions = diffDocumentRegions(png.gray, mono.gray, png.width, png.height, doc, DPI);
      const fontsRn = doc.elements
        .filter((el): el is Extract<LabelElement, { type: 'text' }> => el.type === 'text')
        .map((el) => rnTextFontProbe(el, DPI));
      const ink = textInkOffsets(png.gray, mono.gray, png.width, png.height, doc, DPI);

      const isolates: Record<string, string> = {};
      for (const type of ISOLATE_TYPES) {
        const isolated = isolateDocument(doc, type);
        if (!isolated) continue;
        const iPngB64 = await capturePng(isolated);
        const iPng = await dryRunPng(iPngB64, isolated);
        const iMono = await dryRunMono(isolated);
        isolates[type] = formatRegions(
          diffDocumentRegions(iPng.gray, iMono.gray, iPng.width, iPng.height, isolated, DPI),
        );
      }
      await capturePng(doc);

      const sweep: { threshold: number; percent: number }[] = [];
      for (const t of [80, 120, 140, 160, 180, 200, 240]) {
        const s = await dryRunMono(doc, t, 1);
        const full = diffDocumentRegions(png.gray, s.gray, png.width, png.height, doc, DPI)[0];
        sweep.push({ threshold: t, percent: full.percent });
      }

      const superMono = await dryRunMono(doc, THRESHOLD, 3);
      const superFull = diffDocumentRegions(png.gray, superMono.gray, png.width, png.height, doc, DPI)[0];

      const packed = packedPageDots(doc.widthMm, doc.heightMm, DPI);
      const lines = [
        `gitSha=${resolveGitSha()}`,
        `buildTime=${resolveBuildTime()}`,
        `expo=${Constants.nativeAppVersion}+${Constants.nativeBuildVersion}`,
        `doc=${doc.name} ${doc.widthMm}x${doc.heightMm}mm elements=${doc.elements.map((e) => e.type).join(',')}`,
        `source=${useLabelStore.getState().documents.length ? 'label-store-newest' : 'frozen-fixture'}`,
        `grid PNG=${png.width}x${png.height} packedExpect=${packed.packedW}x${packed.packedH}`,
        `png jobBytes=${png.result.jobBytes} dryRun=${png.result.dryRun} git=${png.result.gitSha}`,
        `mono jobBytes=${mono.result.jobBytes} dryRun=${mono.result.dryRun} backend=${mono.timed.backend}`,
        '',
        '=== full label PNG-path vs headless ===',
        formatRegions(regions),
        '',
        '=== RN text (print-dot scale) ===',
        JSON.stringify(fontsRn, null, 2),
        '',
        '=== Skia/dot-buffer text draws ===',
        JSON.stringify(mono.skiaFonts, null, 2),
        '',
        '=== text ink bbox offsets (mono - png) dots ===',
        JSON.stringify(ink, null, 2),
        '',
        '=== isolate both paths (single-type documents) ===',
        ...Object.entries(isolates).map(([k, v]) => `-- ${k} --\n${v}`),
        '',
        '=== threshold sweep (headless pack vs PNG@160) ===',
        sweep.map((s) => `t=${s.threshold} full=${s.percent.toFixed(3)}%`).join('\n'),
        '',
        `=== supersample 3x downscale threshold 160 vs PNG ===`,
        `full=${superFull.percent.toFixed(3)}%`,
        '',
        'Acceptance for later fixes: this PNG-path payload, not the host editor model.',
        'Flag TD404_HEADLESS_SKIA_PRINT remains false. time still aborts. No speed claims.',
      ];
      const text = lines.join('\n');
      setReport(text);
      console.info(`[GROUND-TRUTH]\n${text}`);
      const path = `${FileSystem.documentDirectory}ground-truth-parity.txt`;
      await FileSystem.writeAsStringAsync(path, text);
      console.info(`[GROUND-TRUTH] wrote ${path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[GROUND-TRUTH]', err);
    } finally {
      setRunning(false);
    }
  }, [baseDoc, capturePng]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={22} weight="semibold" />
        </Pressable>
        <Text style={styles.title}>Ground-truth TSPL diff</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sub}>
          Dry-run printPngLabel vs printMonoLabel (no socket). Uses newest saved label, else frozen 50×30.
          Rebuild Android so dryRun is in the native module.
        </Text>
        <Text style={styles.meta}>
          {baseDoc.name} · {baseDoc.widthMm}×{baseDoc.heightMm} mm · git {resolveGitSha()}
        </Text>
        <View style={styles.hiddenCapture}>
          <ViewShot
            ref={shotRef}
            options={captureOptions}
            style={{ width: captureLayout.widthPx, height: captureLayout.heightPx, backgroundColor: '#FFFFFF' }}>
            <LabelPreview
              document={shotDoc}
              exactWidthPx={captureLayout.widthPx}
              exactHeightPx={captureLayout.heightPx}
              printDpi={DPI}
              showArtboardBorder={false}
              hideNonPrinting
            />
          </ViewShot>
        </View>
        <Pressable onPress={run} disabled={running} style={[styles.btn, running && styles.btnOff]}>
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Run dry-run diff</Text>}
        </Pressable>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {report ? (
          <Text selectable style={styles.report}>
            {report}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  backBtn: { padding: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  body: { padding: 16, paddingBottom: 48 },
  sub: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 8 },
  meta: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  hiddenCapture: { position: 'absolute', left: -4000, top: 0 },
  btn: {
    backgroundColor: '#0F766E',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnOff: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '700' },
  err: { color: '#B91C1C', marginBottom: 12 },
  report: { fontFamily: 'Courier', fontSize: 11, color: '#0F172A', lineHeight: 15 },
});
