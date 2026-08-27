import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { backendHealth, getBackendBaseUrl } from '@/lib/printer/backend-api';
import {
  getPrinterManager,
  isLikelyTd404Name,
  type BluetoothCapabilities,
  type DiscoveredPrinter,
} from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

export default function PrinterConnectScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceId = usePrinterStore((s) => s.deviceId);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const transport = usePrinterStore((s) => s.transport);
  const lastDeviceName = usePrinterStore((s) => s.lastDeviceName);
  const lastDeviceId = usePrinterStore((s) => s.lastDeviceId);

  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [wifiIp, setWifiIp] = useState('');
  const [wifiBusy, setWifiBusy] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [nativeHint, setNativeHint] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [macInput, setMacInput] = useState('');
  const [caps, setCaps] = useState<BluetoothCapabilities>(() =>
    getPrinterManager().getCapabilities(),
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setCaps(getPrinterManager().getCapabilities());
    void backendHealth().then((ok) => {
      if (mountedRef.current) setBackendOk(ok);
    });
    return () => {
      mountedRef.current = false;
      getPrinterManager().stopScan();
    };
  }, []);

  const startScan = useCallback(async () => {
    setDevices([]);
    setScanning(true);
    setNativeHint(null);
    setScanErrors([]);
    setCaps(getPrinterManager().getCapabilities());
    try {
      const result = await getPrinterManager().startScan((device) => {
        if (!mountedRef.current) return;
        setDevices((prev) => {
          const key = device.id.toUpperCase();
          const idx = prev.findIndex((d) => d.id.toUpperCase() === key);
          if (idx === -1) return [...prev, device];
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            ...device,
            bonded: Boolean(next[idx].bonded || device.bonded),
          };
          return next;
        });
      });
      if (mountedRef.current) {
        setScanErrors(result.errors);
        if (result.paired + result.nearby === 0) {
          const detail =
            result.errors[0] ||
            getPrinterManager().getLastScanError() ||
            getPrinterManager().getCapabilities().reason ||
            'No Bluetooth printers found.';
          setNativeHint(detail);
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        const message =
          error instanceof Error ? error.message : 'Could not start scanning for printers.';
        setNativeHint(message);
        setCaps(getPrinterManager().getCapabilities());
        Alert.alert('Bluetooth Scan Failed', message);
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (getPrinterManager().getCapabilities().canScan) {
      void startScan();
    } else {
      setNativeHint(getPrinterManager().getCapabilities().reason);
    }
  }, [startScan]);

  const paired = useMemo(
    () =>
      devices
        .filter((d) => d.bonded)
        .sort((a, b) => Number(isLikelyTd404Name(b.name)) - Number(isLikelyTd404Name(a.name))),
    [devices],
  );
  const nearby = useMemo(
    () =>
      devices
        .filter((d) => !d.bonded)
        .sort((a, b) => {
          const aScore = (a.likelyTd404 || isLikelyTd404Name(a.name) ? 2 : 0) + (a.rssi ?? -999);
          const bScore = (b.likelyTd404 || isLikelyTd404Name(b.name) ? 2 : 0) + (b.rssi ?? -999);
          return bScore - aScore;
        }),
    [devices],
  );

  const handleConnect = async (device: DiscoveredPrinter) => {
    setConnectingId(device.id);
    try {
      await getPrinterManager().connect(device.id, device.name, device.transport);
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          'Connection Failed',
          error instanceof Error ? error.message : 'Could not connect to the printer.',
        );
      }
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleMacConnect = async () => {
    setConnectingId('mac');
    try {
      await getPrinterManager().connectByMac(macInput, macInput);
      Alert.alert('Connected', 'Printer linked over classic Bluetooth.');
    } catch (error) {
      Alert.alert(
        'MAC Connect Failed',
        error instanceof Error ? error.message : 'Could not connect.',
      );
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleReconnectLast = async () => {
    if (!lastDeviceId) return;
    setConnectingId(lastDeviceId);
    try {
      await getPrinterManager().connect(lastDeviceId, lastDeviceName, 'bluetooth-spp');
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        error instanceof Error ? error.message : 'Could not reconnect.',
      );
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleDisconnect = async () => {
    await getPrinterManager().disconnect();
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      await getPrinterManager().printTestLabel('Sez Print TD-404');
      Alert.alert('Test Print Sent', 'Check the printer for a sample label.');
    } catch (error) {
      Alert.alert(
        'Test Print Failed',
        error instanceof Error ? error.message : 'Could not send test print.',
      );
    } finally {
      setTesting(false);
    }
  };

  const handleWifiConnect = async () => {
    const ip = wifiIp.trim();
    if (!ip) {
      Alert.alert('Wi‑Fi IP required', 'Enter the printer LAN IP (port 9100).');
      return;
    }
    setWifiBusy(true);
    try {
      await getPrinterManager().connectWifi(ip, 9100, `TD-404 ${ip}`);
      Alert.alert('Connected', `Wi‑Fi printer ${ip}:9100 is ready.`);
    } catch (error) {
      Alert.alert(
        'Wi‑Fi Connect Failed',
        error instanceof Error
          ? `${error.message}\n\nBackend: ${getBackendBaseUrl()}`
          : 'Could not reach printer via backend.',
      );
    } finally {
      setWifiBusy(false);
    }
  };

  const renderDevice = (device: DiscoveredPrinter, index: number, total: number) => {
    const td404 = device.likelyTd404 || isLikelyTd404Name(device.name);
    return (
      <Pressable
        key={device.id}
        onPress={() => void handleConnect(device)}
        disabled={connectingId !== null}
        style={({ pressed }) => [
          styles.deviceRow,
          index < total - 1 && styles.deviceRowBorder,
          pressed && styles.pressed,
        ]}>
        <AppIcon name="printer" tintColor={td404 ? Palette.accent : Palette.ink} size={20} />
        <View style={styles.deviceInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.deviceName}>{device.name ?? 'Unknown device'}</Text>
            {td404 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>TD-404</Text>
              </View>
            ) : null}
            {device.bonded ? (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeMutedText}>Paired</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.deviceMeta}>
            {device.transport === 'bluetooth-spp'
              ? 'Classic BT'
              : device.transport === 'wifi'
                ? 'Wi‑Fi'
                : 'BLE'}
            {' · '}
            {device.id}
            {device.rssi != null ? ` · ${device.rssi} dBm` : ''}
          </Text>
        </View>
        {connectingId === device.id ? (
          <ActivityIndicator size="small" color={Palette.accent} />
        ) : (
          <Text style={styles.connectLink}>Connect</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Connect Printer" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {!caps.canScan ? (
            <View style={styles.blockerCard}>
              <Text style={styles.blockerTitle}>Bluetooth scan blocked</Text>
              <Text style={styles.blockerBody}>
                {caps.reason || 'This runtime cannot access Bluetooth printer scanning.'}
              </Text>
              <Text style={styles.blockerBody}>
                Fix: stop Expo Go, then run{'\n'}
                <Text style={styles.code}>npx expo run:android</Text>
                {'\n'}
                That installs a development build with TD-404 classic Bluetooth (SPP).
              </Text>
              <Text style={styles.diagLine}>
                Runtime: {caps.isWeb ? 'web' : caps.isExpoGo ? 'Expo Go' : caps.platform}
                {' · '}SPP {caps.classicSppAvailable ? 'yes' : 'no'}
                {' · '}BLE {caps.bleAvailable ? 'yes' : 'no'}
              </Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>TD-404 Bluetooth</Text>
            <Text style={styles.heroBody}>
              Scan lists paired printers first (fast), then nearby devices for a few seconds. Tap Connect as soon as your printer appears.
            </Text>
            <Pressable
              onPress={() => void startScan()}
              disabled={connectingId !== null || !caps.canScan}
              style={({ pressed }) => [
                styles.connectBtn,
                (connectingId !== null || !caps.canScan) && styles.connectBtnDisabled,
                pressed && styles.pressed,
              ]}>
              {scanning ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <AppIcon name="antenna.radiowaves.left.and.right" tintColor="#FFFFFF" size={18} />
              )}
              <Text style={styles.connectBtnText}>
                {scanning ? 'Scanning…' : 'Scan Paired & Nearby'}
              </Text>
            </Pressable>
            {nativeHint ? <Text style={styles.warnText}>{nativeHint}</Text> : null}
            {scanErrors.length > 0 ? (
              <Text style={styles.warnText}>{scanErrors.join(' · ')}</Text>
            ) : null}
          </View>

          {status === 'connected' ? (
            <View style={[styles.card, styles.connectedCard]}>
              <View style={styles.connectedRow}>
                <AppIcon name="printer.fill" tintColor="#2E9E63" size={24} />
                <View style={styles.connectedInfo}>
                  <Text style={styles.connectedName}>{deviceName ?? deviceId}</Text>
                  <Text style={styles.connectedStatus}>
                    Connected
                    {transport ? ` · ${transport}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  style={({ pressed }) => [styles.disconnectBtn, pressed && styles.pressed]}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => void handleTestPrint()}
                disabled={testing}
                style={({ pressed }) => [
                  styles.testBtn,
                  testing && styles.connectBtnDisabled,
                  pressed && styles.pressed,
                ]}>
                {testing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.connectBtnText}>Test Print</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {status !== 'connected' && lastDeviceId ? (
            <Pressable
              onPress={() => void handleReconnectLast()}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <Text style={styles.sectionTitleInline}>Last printer</Text>
              <Text style={styles.deviceName}>{lastDeviceName ?? lastDeviceId}</Text>
              <Text style={styles.connectLink}>Reconnect</Text>
            </Pressable>
          ) : null}

          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Paired devices ({paired.length})</Text>
            {scanning ? <ActivityIndicator size="small" color={Palette.accent} /> : null}
          </View>
          <View style={styles.card}>
            {paired.length === 0 ? (
              <Text style={styles.emptyText}>
                {!caps.canScan
                  ? 'Build the Android app to list printers paired in system Bluetooth.'
                  : scanning
                    ? 'Loading paired Bluetooth devices…'
                    : 'No paired printers yet. Pair the TD-404 in Android Bluetooth settings, then rescan.'}
              </Text>
            ) : (
              paired.map((d, i) => renderDevice(d, i, paired.length))
            )}
          </View>

          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Nearby devices ({nearby.length})</Text>
            {!scanning && caps.canScan ? (
              <Pressable
                onPress={() => void startScan()}
                style={({ pressed }) => [styles.rescanBtn, pressed && styles.pressed]}>
                <AppIcon name="arrow.clockwise" tintColor={Palette.accent} size={15} />
                <Text style={styles.rescanText}>Rescan</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.card}>
            {nearby.length === 0 ? (
              <Text style={styles.emptyText}>
                {!caps.canScan
                  ? 'Nearby scan requires the development build.'
                  : scanning
                    ? 'Searching nearby…'
                    : 'No nearby printers found. Keep the printer on and in range.'}
              </Text>
            ) : (
              nearby.map((d, i) => renderDevice(d, i, nearby.length))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitleInline}>Connect by MAC</Text>
            <Text style={styles.heroBody}>
              Android Settings → Bluetooth → TD-404 → copy MAC, then connect here (dev build).
            </Text>
            <TextInput
              value={macInput}
              onChangeText={setMacInput}
              placeholder="AA:BB:CC:DD:EE:FF"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              onPress={() => void handleMacConnect()}
              disabled={connectingId !== null}
              style={({ pressed }) => [
                styles.wifiBtn,
                connectingId !== null && styles.connectBtnDisabled,
                pressed && styles.pressed,
              ]}>
              {connectingId === 'mac' ? (
                <ActivityIndicator color={Palette.accent} />
              ) : (
                <Text style={styles.wifiBtnText}>Connect MAC (Classic SPP)</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitleInline}>Wi‑Fi (via backend)</Text>
            <Text style={styles.heroBody}>
              Works without Bluetooth. Backend{' '}
              {backendOk == null ? '…' : backendOk ? 'online' : 'offline'} · {getBackendBaseUrl()}
            </Text>
            <TextInput
              value={wifiIp}
              onChangeText={setWifiIp}
              placeholder="192.168.1.50"
              placeholderTextColor="#94A3B8"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              style={styles.input}
            />
            <Pressable
              onPress={() => void handleWifiConnect()}
              disabled={wifiBusy}
              style={({ pressed }) => [
                styles.wifiBtn,
                wifiBusy && styles.connectBtnDisabled,
                pressed && styles.pressed,
              ]}>
              {wifiBusy ? (
                <ActivityIndicator color={Palette.accent} />
              ) : (
                <Text style={styles.wifiBtnText}>Connect Wi‑Fi Printer :9100</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
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
  blockerCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#FDBA74',
    gap: 8,
  },
  blockerTitle: { fontSize: 16, fontWeight: '600', color: '#9A3412' },
  blockerBody: { fontSize: 13.5, lineHeight: 19, color: '#9A3412' },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontWeight: '700',
  },
  diagLine: { marginTop: 4, fontSize: 12, color: '#C2410C' },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.three,
    gap: 12,
    ...cardShadow,
  },
  heroTitle: { fontSize: 17, fontWeight: '600', color: Palette.ink },
  heroBody: { fontSize: 13.5, lineHeight: 19, color: Palette.muted },
  connectBtn: {
    marginTop: 4,
    backgroundColor: Palette.accent,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  testBtn: {
    marginTop: 12,
    backgroundColor: '#2E9E63',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnDisabled: { opacity: 0.75 },
  connectBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  warnText: { color: '#B45309', fontSize: 12.5, lineHeight: 18 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: Spacing.three, ...cardShadow },
  connectedCard: { borderWidth: 1, borderColor: '#BBE5CD' },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectedInfo: { flex: 1 },
  connectedName: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  connectedStatus: { fontSize: 12.5, color: '#2E9E63', marginTop: 1 },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  disconnectText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A97A4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitleInline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A97A4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rescanText: { color: Palette.accent, fontSize: 13.5, fontWeight: '600' },
  emptyText: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  deviceRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEF',
  },
  deviceInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deviceName: { fontSize: 15, fontWeight: '500', color: Palette.ink },
  badge: {
    backgroundColor: '#E8F3FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: Palette.accent, fontSize: 11, fontWeight: '600' },
  badgeMuted: { backgroundColor: '#F1F5F9' },
  badgeMutedText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  deviceMeta: { fontSize: 11.5, color: '#94A3B8', marginTop: 1 },
  connectLink: { color: Palette.accent, fontSize: 13.5, fontWeight: '600' },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Palette.ink,
  },
  wifiBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wifiBtnText: { color: Palette.accent, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.65 },
});
