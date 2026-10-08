/**
 * Location and border payload check. Headless raster always runs.
 * PNG and mono dry-runs use the same createPrintSpec offsets as Print.
 * Route: /location-dots
 */

import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { resolveBuildTime, resolveGitSha } from '@/lib/build-identity';
import type { LabelDocument } from '@/lib/label-document';
import { printCaptureLayout, printCaptureOptionsForSize, waitForNextPaint } from '@/lib/printer/print-job';
import { createPrintSpec } from '@/lib/printer/print-spec';
import { jobPrintOffsets, usePrinterStore } from '@/stores/printer-store';
import { printTd404MonoLabel, printTd404PngLabel } from 'td404-printer';
import {
  LOCATION_DPI,
  borderCases,
  classifyLocation,
  createBorderDocument,
  createLocationLabel,
  formatBorderTable,
  formatDeltaTable,
  measureBorderInk,
  measureLocationPage,
  parseTsplJobHeader,
  reviewHeader,
  type BorderMeasure,
} from '@/printing/raster/location-label';
import {
  classifyPosition,
  formatPositionTable,
  measurePositionPage,
  positionPages,
} from '@/printing/raster/position-label';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';
import { TD404_HEADLESS_SKIA_PRINT } from '@/printing/raster/td404-headless-flag';
import { decodeBase64ToBytes, unpackWireMono1bppToGray } from '@/printing/raster/tspl-wire';

const location = createLocationLabel();
const borders = borderCases().map((c) => ({ spec: c, doc: createBorderDocument(c) }));
const positions = positionPages();

type CaptureItem = { id: string; doc: LabelDocument; kind: 'location' | 'border' | 'position' };

export default function LocationDotsScreen() {
  const insets = useSafeAreaInsets();
  const shotRefs = useRef<Record<string, ViewShot | null>>({});
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const deviceId = usePrinterStore((s) => s.deviceId ?? s.lastDeviceId);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const printCalibration = usePrinterStore((s) => s.printCalibration);
  const calibrationKey = deviceId ?? sdkId ?? 'unknown';
  const saved = jobPrintOffsets(printCalibration[calibrationKey]);
  const hOffsetMm = saved.hOffsetMm;
  const vOffsetMm = saved.vOffsetMm;

  const captures = useMemo<CaptureItem[]>(
    () => [
      { id: 'location', doc: location.doc, kind: 'location' },
      ...positions.map((p) => ({ id: `position-${p.widthMm}`, doc: p.doc, kind: 'position' as const })),
      ...borders.map((b) => ({ id: b.spec.id, doc: b.doc, kind: 'border' as const })),
    ],
    [],
  );

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const spec = createPrintSpec({
        widthMm: location.doc.widthMm,
        heightMm: location.doc.heightMm,
        dpi: LOCATION_DPI,
        gapMm: 2,
        mediaType: 'gap',
        calibration: { horizontalOffsetMm: hOffsetMm, verticalOffsetMm: vOffsetMm },
      });
      const timed = rasterizeDocumentToBitmapTimed(location.doc, LOCATION_DPI, {
        threshold: 160,
        backend: 'dot-buffer',
      });
      const headlessRows = measureLocationPage(
        timed.gray,
        timed.result.widthDots,
        timed.result.heightDots,
        location.doc,
        location.marks,
      );
      const headlessPosition = positions.map((page) => {
        const raster = rasterizeDocumentToBitmapTimed(page.doc, LOCATION_DPI, {
          threshold: 160,
          backend: 'dot-buffer',
        });
        const rows = measurePositionPage(raster.gray, raster.result.widthDots, raster.result.heightDots, page.doc);
        return `${page.widthMm}x${page.heightMm} ${classifyPosition(rows)}\n${formatPositionTable(rows)}`;
      });
      const headlessBorders: BorderMeasure[] = [];
      for (const b of borders) {
        const raster = rasterizeDocumentToBitmapTimed(b.doc, LOCATION_DPI, {
          threshold: 160,
          backend: 'dot-buffer',
        });
        headlessBorders.push(
          measureBorderInk(raster.gray, raster.result.widthDots, raster.result.heightDots, {
            ...b.spec,
            widthMm: b.doc.widthMm,
            heightMm: b.doc.heightMm,
          }),
        );
      }

      let monoHeader = 'mono dry-run: not run';
      try {
        const mono = await printTd404MonoLabel({
          monoBytes: timed.result.mono1bppBuffer,
          widthDots: timed.result.widthDots,
          heightDots: timed.result.heightDots,
          bytesPerRow: timed.result.bytesPerRow,
          widthMm: location.doc.widthMm,
          heightMm: location.doc.heightMm,
          dpi: LOCATION_DPI,
          gapMm: spec.gapMm,
          xDots: spec.xOffsetDots,
          yDots: spec.yOffsetDots,
          dryRun: true,
          gitSha: resolveGitSha(),
          buildTime: resolveBuildTime(),
        });
        if (mono?.jobBase64) {
          monoHeader = parseTsplJobHeader(decodeBase64ToBytes(mono.jobBase64)).join('\n');
        } else {
          monoHeader = 'mono dry-run unavailable. Rebuild the Android binary so dryRun is present.';
        }
      } catch (err) {
        monoHeader = `mono dry-run: ${err instanceof Error ? err.message : String(err)}`;
      }

      await waitForNextPaint();
      await waitForNextPaint();
      const pngSections: string[] = [];
      for (const item of captures) {
        const itemSpec = createPrintSpec({
          widthMm: item.doc.widthMm,
          heightMm: item.doc.heightMm,
          dpi: LOCATION_DPI,
          gapMm: 2,
          mediaType: 'gap',
          calibration: { horizontalOffsetMm: hOffsetMm, verticalOffsetMm: vOffsetMm },
        });
        const capture = printCaptureLayout(item.doc.widthMm, item.doc.heightMm, LOCATION_DPI).content;
        const shot = shotRefs.current[item.id];
        try {
          const png = await captureRef(shot, printCaptureOptionsForSize(capture.widthPx, capture.heightPx));
          const result = await printTd404PngLabel({
            pngBase64: png,
            widthMm: item.doc.widthMm,
            heightMm: item.doc.heightMm,
            dpi: LOCATION_DPI,
            gapMm: itemSpec.gapMm,
            xDots: itemSpec.xOffsetDots,
            yDots: itemSpec.yOffsetDots,
            threshold: 160,
            dryRun: true,
            gitSha: resolveGitSha(),
            buildTime: resolveBuildTime(),
          });
          if (!result?.wireBmpBase64 || !result.widthDots || !result.heightDots || !result.bytesPerRow) {
            pngSections.push(`${item.id}: PNG dry-run unavailable`);
            continue;
          }
          const gray = unpackWireMono1bppToGray(
            decodeBase64ToBytes(result.wireBmpBase64),
            result.widthDots,
            result.heightDots,
            result.bytesPerRow,
          );
          const header = result.jobBase64
            ? parseTsplJobHeader(decodeBase64ToBytes(result.jobBase64)).join(' | ')
            : '';
          if (item.kind === 'location') {
            const rows = measureLocationPage(gray, result.widthDots, result.heightDots, location.doc, location.marks);
            pngSections.push(
              `${item.id} PNG ${result.widthDots}x${result.heightDots} ${classifyLocation(rows)}\n${header}\n${formatDeltaTable(rows)}`,
            );
          } else if (item.kind === 'position') {
            const rows = measurePositionPage(gray, result.widthDots, result.heightDots, item.doc);
            pngSections.push(
              `${item.id} PNG ${result.widthDots}x${result.heightDots} ${classifyPosition(rows)}\n${header}\n${formatPositionTable(rows)}`,
            );
          } else {
            const border = borders.find((b) => b.spec.id === item.id);
            if (!border) continue;
            const measured = measureBorderInk(gray, result.widthDots, result.heightDots, {
              ...border.spec,
              widthMm: item.doc.widthMm,
              heightMm: item.doc.heightMm,
            });
            pngSections.push(`${item.id} PNG\n${header}\n${formatBorderTable([measured])}`);
          }
        } catch (err) {
          pngSections.push(`${item.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const expected = reviewHeader(location.doc.widthMm, location.doc.heightMm, hOffsetMm, vOffsetMm, spec.gapMm);
      const text = [
        `flag TD404_HEADLESS_SKIA_PRINT=${TD404_HEADLESS_SKIA_PRINT}`,
        `stored calibration key=${calibrationKey} hOffsetMm=${hOffsetMm} vOffsetMm=${vOffsetMm}`,
        `createPrintSpec xDots=${spec.xOffsetDots} yDots=${spec.yOffsetDots} centering=0`,
        '--- headless location ---',
        `${timed.result.widthDots}x${timed.result.heightDots} ${classifyLocation(headlessRows)}`,
        formatDeltaTable(headlessRows),
        '--- headless position (not the live screenshot) ---',
        headlessPosition.join('\n'),
        '--- headless borders ---',
        formatBorderTable(headlessBorders),
        '--- header from mono dry-run ---',
        monoHeader,
        '--- header expected from code ---',
        ...expected.header,
        expected.negativeMono,
        '--- live PNG path ---',
        pngSections.join('\n\n') || 'PNG dry-run: not run',
      ].join('\n');
      setReport(text);
      const path = `${FileSystem.documentDirectory}location-dots.txt`;
      await FileSystem.writeAsStringAsync(path, text);
    } finally {
      setRunning(false);
    }
  }, [calibrationKey, captures, hOffsetMm, vOffsetMm]);

  const density = PixelRatio.get() || 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={22} weight="semibold" />
        </Pressable>
        <Text style={styles.title}>Location dots</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sub}>
          {`QR, barcode, text, box, and border at 50, 25, and 57 mm. Dry-run uses the same offsets as Print. Stored h ${hOffsetMm} mm, v ${vOffsetMm} mm.`}
        </Text>
        {captures.map((item) => {
          const capture = printCaptureLayout(item.doc.widthMm, item.doc.heightMm, LOCATION_DPI).content;
          const layout = { widthPx: capture.widthPx / density, heightPx: capture.heightPx / density };
          return (
            <View key={item.id} style={styles.hidden} collapsable={false}>
              <ViewShot
                ref={(node) => {
                  shotRefs.current[item.id] = node;
                }}
                options={printCaptureOptionsForSize(capture.widthPx, capture.heightPx)}
                style={{ width: layout.widthPx, height: layout.heightPx, backgroundColor: '#FFFFFF' }}>
                <LabelPreview
                  document={item.doc}
                  exactWidthPx={layout.widthPx}
                  exactHeightPx={layout.heightPx}
                  printDpi={LOCATION_DPI}
                  showArtboardBorder={false}
                  hideNonPrinting
                />
              </ViewShot>
            </View>
          );
        })}
        <Pressable onPress={run} disabled={running} style={[styles.btn, running && styles.btnOff]}>
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Measure location</Text>}
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
