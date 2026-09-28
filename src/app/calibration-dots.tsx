/**
 * On-device calibration payload. Headless raster assertions always run.
 * PNG dry-run runs when the rebuilt native module accepts dryRun.
 * Route: /calibration-dots
 */

import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { resolveBuildTime, resolveGitSha } from '@/lib/build-identity';
import { printCaptureLayout, printCaptureOptionsForSize, waitForNextPaint } from '@/lib/printer/print-job';
import { printTd404PngLabel } from 'td404-printer';
import {
  CALIBRATION_DPI,
  assertCalibrationPage,
  createCalibrationLabel,
  dullnessReport,
  formatAssertions,
  formatDullness,
} from '@/printing/raster/calibration-label';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';
import { TD404_HEADLESS_SKIA_PRINT } from '@/printing/raster/td404-headless-flag';
import { unpackWireMono1bppToGray, decodeBase64ToBytes } from '@/printing/raster/tspl-wire';

const { doc, regions } = createCalibrationLabel();

export default function CalibrationDotsScreen() {
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const capture = printCaptureLayout(doc.widthMm, doc.heightMm, CALIBRATION_DPI).content;
  const density = PixelRatio.get() || 1;
  const layout = { widthPx: capture.widthPx / density, heightPx: capture.heightPx / density };
  const shotOptions = printCaptureOptionsForSize(capture.widthPx, capture.heightPx);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const timed = rasterizeDocumentToBitmapTimed(doc, CALIBRATION_DPI, {
        threshold: 160,
        backend: 'dot-buffer',
      });
      const headless = assertCalibrationPage(
        timed.gray,
        timed.result.widthDots,
        timed.result.heightDots,
        regions,
      );
      const dull = dullnessReport(doc, regions);
      let pngSection = 'PNG dry-run: not run';
      try {
        await waitForNextPaint();
        await waitForNextPaint();
        const png = await captureRef(shotRef, shotOptions);
        const result = await printTd404PngLabel({
          pngBase64: png,
          widthMm: doc.widthMm,
          heightMm: doc.heightMm,
          dpi: CALIBRATION_DPI,
          threshold: 160,
          dryRun: true,
          gitSha: resolveGitSha(),
          buildTime: resolveBuildTime(),
        });
        if (result?.wireBmpBase64 && result.widthDots && result.heightDots && result.bytesPerRow) {
          const gray = unpackWireMono1bppToGray(
            decodeBase64ToBytes(result.wireBmpBase64),
            result.widthDots,
            result.heightDots,
            result.bytesPerRow,
          );
          const pngAssert = assertCalibrationPage(gray, result.widthDots, result.heightDots, regions);
          pngSection = `PNG dry-run ${result.widthDots}x${result.heightDots} jobBytes=${result.jobBase64?.length ?? 0}\n${formatAssertions(pngAssert)}`;
        } else {
          pngSection = 'PNG dry-run unavailable. Rebuild the Android binary so dryRun is present.';
        }
      } catch (err) {
        pngSection = `PNG dry-run failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      const text = [
        `flag TD404_HEADLESS_SKIA_PRINT=${TD404_HEADLESS_SKIA_PRINT}`,
        `headless ${timed.result.widthDots}x${timed.result.heightDots}`,
        formatAssertions(headless),
        '--- dullness (report only) ---',
        formatDullness(dull),
        '--- live PNG path ---',
        pngSection,
      ].join('\n');
      setReport(text);
      const path = `${FileSystem.documentDirectory}calibration-dots.txt`;
      await FileSystem.writeAsStringAsync(path, text);
      console.info('[CALIBRATION]\n' + text);
    } finally {
      setRunning(false);
    }
  }, [shotOptions]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={22} weight="semibold" />
        </Pressable>
        <Text style={styles.title}>Calibration dots</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sub}>
          50×30 fixture. Headless assertions and dullness run on device. PNG dry-run uses the live screenshot path and does not print.
        </Text>
        <View style={styles.hidden} collapsable={false}>
          <ViewShot ref={shotRef} options={shotOptions} style={{ width: layout.widthPx, height: layout.heightPx, backgroundColor: '#FFFFFF' }}>
            <LabelPreview
              document={doc}
              exactWidthPx={layout.widthPx}
              exactHeightPx={layout.heightPx}
              printDpi={CALIBRATION_DPI}
              showArtboardBorder={false}
              hideNonPrinting
            />
          </ViewShot>
        </View>
        <Pressable onPress={run} disabled={running} style={[styles.btn, running && styles.btnOff]}>
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Run calibration</Text>}
        </Pressable>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  back: { padding: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  body: { padding: 16, gap: 12 },
  sub: { color: '#334155', fontSize: 14, lineHeight: 20 },
  hidden: { position: 'absolute', top: -10000, left: 0 },
  btn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  report: { fontFamily: 'monospace', fontSize: 11, color: '#0F172A' },
});
