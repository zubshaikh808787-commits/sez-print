/**
 * GATE-A on-device benchmark screen — Tasks 4.4 + 4.6.
 * Route: /stage-a-gates (dev build, no printer).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import {
  formatStageAReport,
  logStageAReport,
  runStageADeviceBenchmark,
  type StageADeviceReport,
} from '@/printing/raster/stage-a-device-benchmark';

export default function StageAGatesScreen() {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<StageADeviceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = runStageADeviceBenchmark();
      setReport(result);
      logStageAReport(result);
      const text = formatStageAReport(result);
      const path = `${FileSystem.documentDirectory}gate-a-report.txt`;
      await FileSystem.writeAsStringAsync(path, text);
      console.info(`[GATE-A] report written to ${path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[GATE-A] benchmark failed', err);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    console.warn('[GATE-A] stage-a-gates mounted');
    if (autoRan.current) return;
    autoRan.current = true;
    run();
  }, [run]);

  const summary = report ? summarize(report) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={22} weight="semibold" />
        </Pressable>
        <Text style={styles.title}>GATE-A Device Benchmark</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.subtitle}>Tasks 4.4 / 4.4b / 4.6 + phase profile — frozen 50×30 fixture</Text>

        {running ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Palette.accent} />
            <Text style={styles.statusText}>Running 4.4b + dual-backend profile…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <Text style={styles.mono}>{summary}</Text>
          </View>
        ) : null}

        {report ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Full report</Text>
            <Text selectable style={styles.mono}>{formatStageAReport(report)}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          disabled={running}
          onPress={run}
          style={({ pressed }) => [styles.runBtn, (pressed || running) && styles.runBtnPressed]}>
          <Text style={styles.runBtnText}>{running ? 'Running…' : 'Re-run benchmark'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function summarize(report: StageADeviceReport): string {
  const lines: string[] = [];
  lines.push(`MakeOffscreen API: ${report.probe.apiAvailable ? 'yes' : 'no'}`);
  lines.push(`MakeOffscreen 600×360: ${report.probe.create600x360 ? 'OK' : 'FAIL'}`);
  lines.push(`Rasterizer backend: ${report.probe.rasterizerBackend}`);
  if (report.probe.error) lines.push(`Probe error: ${report.probe.error}`);

  if ('aborted' in report.task44b) {
    lines.push(`Task 4.4b: ABORTED — ${report.task44b.reason}`);
  } else {
    lines.push(
      `Task 4.4b backend=${report.task44b.backend} Code128=${report.task44b.code128 ?? 'null'} QR=${report.task44b.qr ?? 'null'} → ${report.task44b.pass ? 'pass' : 'fail'}`,
    );
  }

  if ('aborted' in report.task44) {
    lines.push(`Task 4.4 skia: ABORTED — ${report.task44.reason}`);
  } else {
    lines.push(
      `Task 4.4 skia total median=${report.task44.totalMedianMs.toFixed(2)}ms p95=${report.task44.totalP95Ms.toFixed(2)}ms readback=${report.task44.readbackMedianMs.toFixed(2)}ms pack=${report.task44.packMedianMs.toFixed(2)}ms → ${report.task44.gate15ms}`,
    );
  }

  if ('aborted' in report.task44Dot) {
    lines.push(`Task 4.4 dot-buffer: ABORTED — ${report.task44Dot.reason}`);
  } else {
    lines.push(
      `Task 4.4 dot-buffer total median=${report.task44Dot.totalMedianMs.toFixed(2)}ms p95=${report.task44Dot.totalP95Ms.toFixed(2)}ms draw=${report.task44Dot.drawMedianMs.toFixed(2)}ms pack=${report.task44Dot.packMedianMs.toFixed(2)}ms → ${report.task44Dot.gate15ms}`,
    );
  }

  if ('aborted' in report.packOnly) {
    lines.push(`Pack-only: ABORTED — ${report.packOnly.reason}`);
  } else {
    lines.push(
      `Pack-only median=${report.packOnly.medianMs.toFixed(2)}ms p95=${report.packOnly.p95Ms.toFixed(2)}ms (${report.packOnly.grayBytes} gray bytes)`,
    );
  }

  if ('aborted' in report.task46) {
    lines.push(`Task 4.6: ABORTED — ${report.task46.reason}`);
  } else {
    lines.push(
      `Task 4.6 heap ${report.task46.firstHeapBytes}→${report.task46.lastHeapBytes} (Δ${report.task46.deltaBytes}) sustainedGrowth=${report.task46.sustainedGrowth} → ${report.task46.gateZeroGrowth}`,
    );
  }

  return lines.join('\n');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 6, marginRight: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  body: { padding: 16, gap: 12 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 14, color: '#334155' },
  error: { color: '#DC2626', fontSize: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#1E293B', lineHeight: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  runBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  runBtnPressed: { opacity: 0.85 },
  runBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
