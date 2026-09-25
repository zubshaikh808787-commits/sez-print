/**
 * 1000-run dot-buffer confirmation — no printer.
 * Route: /dot-buffer-1k
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
import { runDotBuffer1kConfirmation } from '@/printing/raster/dot-buffer-1k-confirmation';

export default function DotBuffer1kScreen() {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSummary(null);
    setStatus('Running 1000-run dot-buffer confirmation…');
    try {
      console.warn('[DOT-1K] screen mounted, starting');
      const result = await runDotBuffer1kConfirmation();
      const csvPath = `${FileSystem.documentDirectory}dot-buffer-1k.csv`;
      await FileSystem.writeAsStringAsync(csvPath, result.csv);
      const totals = result.rows.map((r) => r.totalMs).sort((a, b) => a - b);
      const median = totals[Math.floor(totals.length / 2)] ?? 0;
      const p95 = totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))] ?? 0;
      const heaps = result.rows.map((r) => r.heapBytes).filter((h): h is number => h !== null);
      const decodeRows = result.rows.filter((r) => r.decodeChecked);
      const decodeFail = decodeRows.filter((r) => r.decodePass === false).length;
      const lines = [
        `device=${result.device.model ?? 'unknown'} | ${result.device.os}`,
        `backend=${result.backend} n=${result.rows.length} warmup_discarded=${result.warmupDiscarded}`,
        `overall median=${median.toFixed(3)} p95=${p95.toFixed(3)} min=${(totals[0] ?? 0).toFixed(3)} max=${(totals[totals.length - 1] ?? 0).toFixed(3)}`,
        `heap first=${heaps[0] ?? 'n/a'} last=${heaps[heaps.length - 1] ?? 'n/a'}`,
        `decode checked=${decodeRows.length} fail=${decodeFail}`,
        `csv written ${csvPath}`,
      ];
      const text = lines.join('\n');
      setSummary(text);
      for (const line of lines) console.warn(`[DOT-1K] ${line}`);
      console.info(`[DOT-1K] report written to ${csvPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[DOT-1K] failed', err);
    } finally {
      setRunning(false);
      setStatus('Done');
    }
  }, []);

  useEffect(() => {
    console.warn('[DOT-1K] screen mounted');
    if (autoRan.current) return;
    autoRan.current = true;
    run();
  }, [run]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor="#0F172A" size={22} weight="semibold" />
        </Pressable>
        <Text style={styles.title}>Dot-buffer 1000-run</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {running ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Palette.accent} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : (
          <Text style={styles.statusText}>{status}</Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {summary ? <Text selectable style={styles.mono}>{summary}</Text> : null}
      </ScrollView>
    </View>
  );
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 14, color: '#334155' },
  error: { color: '#DC2626', fontSize: 14 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#1E293B', lineHeight: 16 },
});
