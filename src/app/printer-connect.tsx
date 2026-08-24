import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { getPrinterManager, type DiscoveredPrinter } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

export default function PrinterConnectScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceId = usePrinterStore((s) => s.deviceId);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const lastDeviceName = usePrinterStore((s) => s.lastDeviceName);

  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      getPrinterManager().stopScan();
    };
  }, []);

  const startScan = useCallback(async () => {
    setDevices([]);
    setScanning(true);
    try {
      await getPrinterManager().startScan((device) => {
        if (!mountedRef.current) return;
        setDevices((prev) =>
          prev.some((d) => d.id === device.id) ? prev : [...prev, device],
        );
      });
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          'Bluetooth Unavailable',
          error instanceof Error ? error.message : 'Could not start scanning for printers.',
        );
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, []);

  useEffect(() => {
    void startScan();
  }, [startScan]);

  const handleConnect = async (device: DiscoveredPrinter) => {
    setConnectingId(device.id);
    try {
      await getPrinterManager().connect(device.id, device.name);
      if (mountedRef.current) router.back();
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

  const handleDisconnect = async () => {
    await getPrinterManager().disconnect();
  };

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Connect Printer" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {status === 'connected' ? (
            <View style={[styles.card, styles.connectedCard]}>
              <View style={styles.connectedRow}>
                <SymbolView name="printer.fill" tintColor="#2E9E63" size={24} />
                <View style={styles.connectedInfo}>
                  <Text style={styles.connectedName}>{deviceName ?? deviceId}</Text>
                  <Text style={styles.connectedStatus}>Connected</Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  style={({ pressed }) => [styles.disconnectBtn, pressed && styles.pressed]}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Available Printers</Text>
            {scanning ? (
              <ActivityIndicator size="small" color={Palette.accent} />
            ) : (
              <Pressable
                onPress={() => void startScan()}
                style={({ pressed }) => [styles.rescanBtn, pressed && styles.pressed]}>
                <SymbolView name="arrow.clockwise" tintColor={Palette.accent} size={15} />
                <Text style={styles.rescanText}>Rescan</Text>
              </Pressable>
            )}
          </View>

          {devices.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                {scanning
                  ? 'Searching for Bluetooth printers…'
                  : Platform.OS === 'web'
                  ? 'Bluetooth printing is not available on web.'
                  : 'No printers found. Make sure your printer is on and in range, then rescan.'}
              </Text>
              {lastDeviceName ? (
                <Text style={styles.lastDeviceText}>Last used: {lastDeviceName}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.card}>
              {devices.map((device, index) => (
                <Pressable
                  key={device.id}
                  onPress={() => void handleConnect(device)}
                  disabled={connectingId !== null}
                  style={({ pressed }) => [
                    styles.deviceRow,
                    index < devices.length - 1 && styles.deviceRowBorder,
                    pressed && styles.pressed,
                  ]}>
                  <SymbolView name="printer" tintColor={Palette.ink} size={20} />
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{device.name ?? 'Unknown device'}</Text>
                    <Text style={styles.deviceMeta}>
                      {device.id}
                      {device.rssi != null ? ` · ${device.rssi} dBm` : ''}
                    </Text>
                  </View>
                  {connectingId === device.id ? (
                    <ActivityIndicator size="small" color={Palette.accent} />
                  ) : (
                    <SymbolView name="chevron.right" tintColor="#A0AEC0" size={14} />
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.hint}>
            Generic ESC/POS thermal printers over Bluetooth LE are supported. A development build
            is required — Bluetooth is unavailable in Expo Go.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.three,
    ...cardShadow,
  },
  connectedCard: {
    borderWidth: 1,
    borderColor: '#BBE5CD',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedInfo: {
    flex: 1,
  },
  connectedName: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
  },
  connectedStatus: {
    fontSize: 12.5,
    color: '#2E9E63',
    marginTop: 1,
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  disconnectText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A97A4',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rescanText: {
    color: Palette.accent,
    fontSize: 13.5,
    fontWeight: '600',
  },
  emptyText: {
    color: Palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  lastDeviceText: {
    color: '#94A3B8',
    fontSize: 12.5,
    marginTop: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  deviceRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEF',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  deviceMeta: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  hint: {
    color: '#94A3B8',
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.65,
  },
});
