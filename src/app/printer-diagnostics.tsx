/**
 * Printer Diagnostics Screen.
 * Displays connection state, transport details, last print timing breakdown,
 * and provides debug actions for troubleshooting printing/Bluetooth issues.
 */

import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
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

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import {
  getPrinterManager,
  type DiagnosticInfo,
  type PrintTimingEntry,
} from '@/lib/printer/printer-manager';
import { encodeTscTextSample } from '@/lib/printer/tsc';
import { usePrinterStore } from '@/stores/printer-store';

function DiagRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, mono && styles.mono]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function TimingBar({ entry, maxMs }: { entry: PrintTimingEntry; maxMs: number }) {
  const pct = maxMs > 0 ? Math.min(100, (entry.durationMs / maxMs) * 100) : 0;
  return (
    <View style={styles.timingRow}>
      <Text style={styles.timingLabel}>{entry.stage}</Text>
      <View style={styles.timingBarBg}>
        <View style={[styles.timingBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.timingMs}>{entry.durationMs}ms</Text>
    </View>
  );
}

export default function PrinterDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const [diag, setDiag] = useState<DiagnosticInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  }, []);

  const refresh = useCallback(() => {
    setDiag(getPrinterManager().getDiagnostics());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh, status]);

  const handleTestConnection = async () => {
    setBusy('test-conn');
    try {
      log('Testing connection health...');
      const healthy = getPrinterManager().isConnectionHealthy();
      log(healthy ? '✅ Connection is healthy' : '❌ Connection is NOT healthy');
      if (!healthy) {
        log('Attempting ensureConnected()...');
        const result = await getPrinterManager().ensureConnected();
        log(
          result.alreadyConnected
            ? '✅ Already connected'
            : `✅ Reconnected in ${result.reconnectMs}ms`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`❌ ${msg}`);
      Alert.alert('Test Failed', msg);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleTestPrint = async () => {
    setBusy('test-print');
    try {
      log('Sending test print...');
      const t0 = Date.now();
      await getPrinterManager().printTestLabel('Sez Print Diagnostics');
      const elapsed = Date.now() - t0;
      log(`✅ Test print sent in ${elapsed}ms`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`❌ ${msg}`);
      Alert.alert('Test Print Failed', msg);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleSmallPayload = async () => {
    setBusy('small');
    try {
      log('Sending small TSPL payload (~120 bytes)...');
      const t0 = Date.now();
      const bytes = encodeTscTextSample({ text: 'DIAG', widthMm: 30, heightMm: 15 });
      await getPrinterManager().print(bytes);
      const elapsed = Date.now() - t0;
      log(`✅ Small payload sent in ${elapsed}ms (${bytes.length} bytes)`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`❌ ${msg}`);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleConnect = async () => {
    setBusy('connect');
    try {
      log('Reconnecting to last device...');
      const t0 = Date.now();
      const ok = await getPrinterManager().reconnectLastDevice();
      const elapsed = Date.now() - t0;
      log(ok ? `✅ Connected in ${elapsed}ms` : `❌ Reconnect failed (${elapsed}ms)`);
    } catch (error) {
      log(`❌ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    try {
      log('Disconnecting...');
      await getPrinterManager().disconnect();
      log('✅ Disconnected');
    } catch (error) {
      log(`❌ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const timingEntries = diag?.lastPrintTimingMs ?? [];
  const maxTimingMs = timingEntries.reduce((m, e) => Math.max(m, e.durationMs), 1);
  const totalTimingMs = timingEntries.reduce((s, e) => s + e.durationMs, 0);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Printer Diagnostics" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {/* Connection Info */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connection</Text>
            <DiagRow label="State" value={diag?.connectionState ?? 'unknown'} />
            <DiagRow label="Transport" value={diag?.activeTransport ?? 'none'} />
            <DiagRow label="Device" value={diag?.deviceName ?? diag?.deviceId ?? 'none'} />
            <DiagRow label="Store Status" value={status} />
          </View>

          {/* Bluetooth Details */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bluetooth Details</Text>
            <DiagRow label="BLE MTU" value={diag?.bleNegotiatedMtu ? `${diag.bleNegotiatedMtu}` : 'N/A'} />
            <DiagRow label="Chunk Size" value={`${diag?.bleChunkSize ?? 'N/A'} bytes`} />
            <DiagRow
              label="Service UUID"
              value={diag?.bleServiceUuid ?? 'N/A (SPP)'}
              mono
            />
            <DiagRow
              label="Char UUID"
              value={diag?.bleCharacteristicUuid ?? 'N/A (SPP)'}
              mono
            />
            <DiagRow
              label="Write Mode"
              value={
                diag?.bleWriteWithResponse == null
                  ? 'N/A (SPP stream)'
                  : diag.bleWriteWithResponse
                    ? 'With Response'
                    : 'Without Response'
              }
            />
          </View>

          {/* Print Queue */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Print Queue</Text>
            <DiagRow label="Queue Depth" value={String(diag?.printQueueLength ?? 0)} />
            <DiagRow label="Last Retry Count" value={String(diag?.retryCount ?? 0)} />
            <DiagRow label="Last Error" value={diag?.lastError ?? 'none'} />
          </View>

          {/* Timing Breakdown */}
          {timingEntries.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Last Print Timing ({totalTimingMs}ms total)
              </Text>
              {timingEntries.map((entry, i) => (
                <TimingBar key={`${entry.stage}-${i}`} entry={entry} maxMs={maxTimingMs} />
              ))}
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionGrid}>
              <ActionButton
                label="Connect"
                icon="link"
                busy={busy === 'connect'}
                disabled={busy !== null}
                onPress={handleConnect}
              />
              <ActionButton
                label="Disconnect"
                icon="xmark"
                busy={busy === 'disconnect'}
                disabled={busy !== null}
                onPress={handleDisconnect}
                danger
              />
              <ActionButton
                label="Test Conn"
                icon="bolt.fill"
                busy={busy === 'test-conn'}
                disabled={busy !== null}
                onPress={handleTestConnection}
              />
              <ActionButton
                label="Test Print"
                icon="printer"
                busy={busy === 'test-print'}
                disabled={busy !== null}
                onPress={handleTestPrint}
              />
              <ActionButton
                label="Small Payload"
                icon="doc.plaintext"
                busy={busy === 'small'}
                disabled={busy !== null}
                onPress={handleSmallPayload}
              />
              <ActionButton
                label="Clear Logs"
                icon="trash"
                busy={false}
                disabled={false}
                onPress={() => setLogs([])}
                danger
              />
            </View>
          </View>

          {/* Log */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Log ({logs.length})</Text>
            {logs.length === 0 ? (
              <Text style={styles.emptyLog}>No log entries yet. Use the actions above.</Text>
            ) : (
              logs.map((line, i) => (
                <Text key={i} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  busy,
  disabled,
  onPress,
  danger,
}: {
  label: string;
  icon: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        danger && styles.actionBtnDanger,
        (pressed || disabled) && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <AppIcon name={icon} tintColor="#FFFFFF" size={16} />
      )}
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.three,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A97A4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEF',
  },
  diagLabel: {
    fontSize: 13.5,
    color: Palette.muted,
    flex: 1,
  },
  diagValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Palette.ink,
    flex: 1,
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  timingLabel: {
    fontSize: 11.5,
    color: Palette.muted,
    width: 100,
  },
  timingBarBg: {
    flex: 1,
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  timingBarFill: {
    height: '100%',
    backgroundColor: Palette.accent,
    borderRadius: 6,
  },
  timingMs: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Palette.ink,
    width: 52,
    textAlign: 'right',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 100,
    justifyContent: 'center',
  },
  actionBtnDanger: {
    backgroundColor: '#DC2626',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyLog: {
    color: Palette.muted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: Palette.ink,
    lineHeight: 16,
    paddingVertical: 1,
  },
  pressed: { opacity: 0.65 },
});
