import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
  BLUETOOTH_OFF_MESSAGE,
  isBluetoothOffError,
} from '@/lib/printer/bluetooth-guard';
import {
  getPrinterManager,
  isLikelyTd404Name,
  isLikelyJoshName,
  isLikelyTezName,
  isLikelyShaktiName,
  type BluetoothCapabilities,
  type DiscoveredPrinter,
} from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

const ANDROID_BLUETOOTH_SETTINGS = 'android.settings.BLUETOOTH_SETTINGS';

async function openPhoneBluetoothSettings() {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent(ANDROID_BLUETOOTH_SETTINGS);
      return;
    }
    if (Platform.OS === 'ios') {
      // Apple does not allow a third-party app to open the Bluetooth pane.
      await Linking.openURL('app-settings:');
      return;
    }
    Alert.alert(
      'Unavailable',
      'Bluetooth settings can only be opened from the Android or iOS app.',
    );
  } catch (error) {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Could Not Open Settings',
        error instanceof Error
          ? error.message
          : 'Open Bluetooth from the phone Settings app, then return here to scan.',
      );
    }
  }
}

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
  const [calibrating, setCalibrating] = useState(false);
  const [wifiIp, setWifiIp] = useState('');
  const [wifiBusy, setWifiBusy] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [nativeHint, setNativeHint] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [macInput, setMacInput] = useState('');
  const [caps, setCaps] = useState<BluetoothCapabilities>(() =>
    getPrinterManager().getCapabilities(),
  );
  const [bluetoothOn, setBluetoothOn] = useState(() => getPrinterManager().isBluetoothEnabled());
  const mountedRef = useRef(true);

  const refreshCaps = useCallback(() => {
    const mgr = getPrinterManager();
    const nextCaps = mgr.getCapabilities();
    const on = mgr.isBluetoothEnabled();
    setCaps(nextCaps);
    setBluetoothOn(on);
    return { caps: nextCaps, bluetoothOn: on };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshCaps();
    void backendHealth().then((ok) => {
      if (mountedRef.current) setBackendOk(ok);
    });
    const appSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !mountedRef.current) return;
      const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
      if (on && nextCaps.canScan) {
        setNativeHint(null);
      } else if (!on && nextCaps.canScan) {
        setNativeHint(BLUETOOTH_OFF_MESSAGE);
      }
    });
    return () => {
      mountedRef.current = false;
      appSub.remove();
      getPrinterManager().stopScan();
    };
  }, [refreshCaps]);

  const startScan = useCallback(async () => {
    const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
    if (!nextCaps.canScan) {
      setNativeHint(nextCaps.reason);
      return;
    }
    if (!on) {
      setDevices([]);
      setScanning(false);
      setScanErrors([]);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setDevices([]);
    setScanning(true);
    setNativeHint(null);
    setScanErrors([]);
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
        if (result.errors.some((entry) => isBluetoothOffError(entry))) {
          setBluetoothOn(false);
        }
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
        refreshCaps();
        if (!isBluetoothOffError(error)) {
          Alert.alert('Bluetooth Scan Failed', message);
        }
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, [refreshCaps]);

  useEffect(() => {
    const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
    if (!nextCaps.canScan) {
      setNativeHint(nextCaps.reason);
      return;
    }
    if (!on) {
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      return;
    }
    void startScan().catch(() => {});
  }, [startScan, refreshCaps]);

  const paired = useMemo(
    () =>
      devices
        .filter((d) => d.bonded)
        .sort((a, b) => {
          const aTd = a.likelyTd404 || isLikelyTd404Name(a.name);
          const bTd = b.likelyTd404 || isLikelyTd404Name(b.name);
          const aMatch = aTd || a.likelyJosh || isLikelyJoshName(a.name);
          const bMatch = bTd || b.likelyJosh || isLikelyJoshName(b.name);
          return Number(bMatch) - Number(aMatch);
        }),
    [devices],
  );
  const nearby = useMemo(
    () =>
      devices
        .filter((d) => !d.bonded)
        .sort((a, b) => {
          const aTd = a.likelyTd404 || isLikelyTd404Name(a.name);
          const bTd = b.likelyTd404 || isLikelyTd404Name(b.name);
          const aMatch = aTd || a.likelyJosh || isLikelyJoshName(a.name);
          const bMatch = bTd || b.likelyJosh || isLikelyJoshName(b.name);
          const aScore = (aMatch ? 2 : 0) + (a.rssi ?? -999);
          const bScore = (bMatch ? 2 : 0) + (b.rssi ?? -999);
          return bScore - aScore;
        }),
    [devices],
  );

  const handleConnect = async (device: DiscoveredPrinter) => {
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setConnectingId(device.id);
    try {
      const isTd404 = device.likelyTd404 || isLikelyTd404Name(device.name);
      const isJosh = !isTd404 && (device.transport === 'josh-lpapi' || device.likelyJosh || isLikelyJoshName(device.name));
      const transport = isJosh
        ? 'josh-lpapi'
        : (device.transport === 'wifi' ? 'wifi' : 'bluetooth-spp');

      console.info(
        isJosh
          ? `[JOSH-CONN-P1:IDENTIFY] User selected device: ${device.id} (${device.name ?? 'unknown'}) -> routing to JOSH LPAPI`
          : `[CONN-P1:IDENTIFY] User selected device: ${device.id} (${device.name ?? 'unknown'}) -> routing to classic BT SPP`,
      );
      await getPrinterManager().connect(
        device.id,
        device.name,
        transport,
      );
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
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
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

  const handleJoshMacConnect = async () => {
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setConnectingId('mac-josh');
    try {
      console.info(`[JOSH-CONN-P1:IDENTIFY] Manual MAC connect entered: ${macInput}`);
      await getPrinterManager().connectJoshByMac(macInput, 'JOSH');
      Alert.alert('Connected', 'JOSH printer linked over LPAPI.');
    } catch (error) {
      Alert.alert(
        'JOSH Connect Failed',
        error instanceof Error ? error.message : 'Could not connect to JOSH printer.',
      );
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleTezMacConnect = async () => {
    const mac = macInput.trim().toUpperCase();
    if (!mac) {
      Alert.alert('MAC required', 'Enter a Bluetooth MAC like AA:BB:CC:DD:EE:FF');
      return;
    }
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setConnectingId('mac-tez');
    try {
      console.info(`[TEZ-CONN] Manual MAC connect entered: ${mac}`);
      await getPrinterManager().connectTezByMac(mac, 'TEZ');
      Alert.alert('Connected', `TEZ/SHAKTI printer ${mac} linked over OEM PrintSDK.`);
    } catch (error) {
      Alert.alert(
        'TEZ Connect Failed',
        error instanceof Error ? error.message : 'Could not connect to TEZ/SHAKTI printer.',
      );
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleCalibrateTez = async () => {
    setCalibrating(true);
    try {
      const ok = await getPrinterManager().calibrateTez(0); // 0 = GAP
      if (ok) {
        Alert.alert('Calibration Complete', 'Printer paper sensor calibrated successfully.');
      } else {
        Alert.alert('Calibration Finished', 'Sensor calibration command was executed.');
      }
    } catch (error) {
      Alert.alert(
        'Calibration Failed',
        error instanceof Error ? error.message : 'Could not calibrate printer.',
      );
    } finally {
      setCalibrating(false);
    }
  };

  const handleReconnectLast = async () => {
    if (!lastDeviceId) return;
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setConnectingId(lastDeviceId);
    try {
      const isTd = isLikelyTd404Name(lastDeviceName);
      const isTez = !isTd && (transport === 'tez-spp' || isLikelyTezName(lastDeviceName) || isLikelyShaktiName(lastDeviceName));
      const isJosh = !isTd && !isTez && (transport === 'josh-lpapi' || isLikelyJoshName(lastDeviceName));
      if (isTez || isJosh) {
        const ok = await getPrinterManager().reconnectLastDevice();
        if (!ok) throw new Error('Could not reconnect to printer.');
      } else {
        await getPrinterManager().connect(lastDeviceId, lastDeviceName, 'bluetooth-spp');
      }
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
    try {
      await getPrinterManager().disconnect();
    } catch (error) {
      Alert.alert(
        'Disconnect Failed',
        error instanceof Error ? error.message : 'Could not disconnect.',
      );
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const isTez = getPrinterManager().isTez;
      const isJosh = !isTez && getPrinterManager().isJosh;
      console.info(
        isTez
          ? '[TEZ-PRINT-P1:PREFLIGHT] Test print button tapped (routing: TEZ PrintSDK)'
          : isJosh
            ? '[JOSH-PRINT-P1:PREFLIGHT] Test print button tapped (routing: JOSH LPAPI)'
            : '[PRINT-P1:PREFLIGHT] Test print button tapped (routing: TD-404 / ESCPOS)',
      );
      const testName = isTez ? 'Sez Print TEZ' : isJosh ? 'Sez Print JOSH' : 'Sez Print TD-404';
      await getPrinterManager().printTestLabel(testName);
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

  const showBluetoothSettings =
    Platform.OS !== 'web' &&
    status !== 'connected' &&
    (!bluetoothOn ||
      paired.length === 0 ||
      scanErrors.length > 0 ||
      Boolean(nativeHint) ||
      !caps.canScan);

  const bluetoothSettingsLabel =
    Platform.OS === 'ios' ? 'Open Settings' : 'Open Bluetooth Settings';

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
    const isTez = device.likelyTez || isLikelyTezName(device.name);
    const isShakti = device.likelyShakti || isLikelyShaktiName(device.name);
    const td404 = !isTez && !isShakti && (device.likelyTd404 || isLikelyTd404Name(device.name));
    const isJosh = !isTez && !isShakti && !td404 && (device.likelyJosh || isLikelyJoshName(device.name) || device.transport === 'josh-lpapi');
    const iconTint = isTez
      ? '#8B5CF6'
      : isShakti
        ? '#F59E0B'
        : isJosh
          ? '#10B981'
          : td404
            ? Palette.accent
            : Palette.ink;

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
        <AppIcon name="printer" tintColor={iconTint} size={20} />
        <View style={styles.deviceInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.deviceName}>{device.name ?? 'Unknown device'}</Text>
            {isTez ? (
              <View style={[styles.badge, { backgroundColor: '#8B5CF6' }]}>
                <Text style={styles.badgeText}>TEZ</Text>
              </View>
            ) : isShakti ? (
              <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.badgeText}>SHAKTI</Text>
              </View>
            ) : isJosh ? (
              <View style={[styles.badge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.badgeText}>JOSH</Text>
              </View>
            ) : td404 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {device.name?.toLowerCase().includes('tejas')
                    ? 'TEJAS'
                    : device.name?.toLowerCase().includes('rudra')
                      ? 'RUDRA'
                      : 'TD-404'}
                </Text>
              </View>
            ) : null}
            {device.bonded ? (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeMutedText}>Paired</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.deviceMeta}>
            {device.transport === 'tez-spp'
              ? 'TEZ YX'
              : device.transport === 'josh-lpapi'
                ? 'JOSH LPAPI'
                : device.transport === 'bluetooth-spp'
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
              {showBluetoothSettings ? (
                <Pressable
                  onPress={() => void openPhoneBluetoothSettings()}
                  style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}>
                  <AppIcon name="link" tintColor={Palette.accent} size={16} />
                  <Text style={styles.settingsBtnText}>{bluetoothSettingsLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {caps.canScan && !bluetoothOn ? (
            <View style={styles.blockerCard}>
              <Text style={styles.blockerTitle}>Bluetooth is off</Text>
              <Text style={styles.blockerBody}>
                Turn Bluetooth on to scan or connect a printer. No scan or reconnect runs while it
                is off. Wi‑Fi printers below still work.
              </Text>
              <Pressable
                onPress={() => void openPhoneBluetoothSettings()}
                style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}>
                <AppIcon name="link" tintColor={Palette.accent} size={16} />
                <Text style={styles.settingsBtnText}>{bluetoothSettingsLabel}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>TD-404 Bluetooth</Text>
            <Text style={styles.heroBody}>
              Scan lists paired printers first (fast), then nearby devices for a few seconds. Tap Connect as soon as your printer appears.
            </Text>
            <Pressable
              onPress={() => void startScan().catch(() => {})}
              disabled={connectingId !== null || !caps.canScan || !bluetoothOn}
              style={({ pressed }) => [
                styles.connectBtn,
                (connectingId !== null || !caps.canScan || !bluetoothOn) && styles.connectBtnDisabled,
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
            {showBluetoothSettings && caps.canScan ? (
              <>
                <Pressable
                  onPress={() => void openPhoneBluetoothSettings()}
                  style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}>
                  <AppIcon name="link" tintColor={Palette.accent} size={16} />
                  <Text style={styles.settingsBtnText}>{bluetoothSettingsLabel}</Text>
                </Pressable>
                {Platform.OS === 'ios' ? (
                  <Text style={styles.settingsHint}>
                    Opens this app’s Settings. From there, go to Bluetooth to turn it on or pair
                    the printer.
                  </Text>
                ) : (
                  <Text style={styles.settingsHint}>
                    Opens the phone’s Bluetooth settings so you can turn Bluetooth on or pair the
                    printer, then come back and scan.
                  </Text>
                )}
              </>
            ) : null}
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
              {transport === 'tez-spp' || getPrinterManager().isTez ? (
                <Pressable
                  onPress={() => void handleCalibrateTez()}
                  disabled={calibrating}
                  style={({ pressed }) => [
                    styles.testBtn,
                    { backgroundColor: '#8B5CF6', marginTop: 8 },
                    calibrating && styles.connectBtnDisabled,
                    pressed && styles.pressed,
                  ]}>
                  {calibrating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.connectBtnText}>Calibrate Paper Sensor</Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.push('/printer-diagnostics')}
                style={({ pressed }) => [styles.diagQuickBtn, pressed && styles.pressed]}>
                <AppIcon name="waveform.path.ecg" tintColor={Palette.accent} size={15} />
                <Text style={styles.diagQuickBtnText}>View Latency & Connection Diagnostics</Text>
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
                  : !bluetoothOn
                    ? 'Turn Bluetooth on to list paired printers.'
                  : scanning
                    ? 'Loading paired Bluetooth devices…'
                    : 'No paired printers yet. Pair the printer in Android Bluetooth settings, then rescan.'}
              </Text>
            ) : (
              paired.map((d, i) => renderDevice(d, i, paired.length))
            )}
          </View>

          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Nearby devices ({nearby.length})</Text>
            {!scanning && caps.canScan && bluetoothOn ? (
              <Pressable
                onPress={() => void startScan().catch(() => {})}
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
                  : !bluetoothOn
                    ? 'Turn Bluetooth on to search nearby printers.'
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
              Android Settings → Bluetooth → pair printer → copy MAC, then connect here (dev build).
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
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => void handleMacConnect()}
                disabled={connectingId !== null}
                style={({ pressed }) => [
                  styles.wifiBtn,
                  { flex: 1 },
                  connectingId !== null && styles.connectBtnDisabled,
                  pressed && styles.pressed,
                ]}>
                {connectingId === 'mac' ? (
                  <ActivityIndicator color={Palette.accent} />
                ) : (
                  <Text style={styles.wifiBtnText}>TD-404</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => void handleTezMacConnect()}
                disabled={connectingId !== null}
                style={({ pressed }) => [
                  styles.wifiBtn,
                  { flex: 1, backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
                  connectingId !== null && styles.connectBtnDisabled,
                  pressed && styles.pressed,
                ]}>
                {connectingId === 'mac-tez' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.wifiBtnText, { color: '#FFFFFF' }]}>TEZ YX</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => void handleJoshMacConnect()}
                disabled={connectingId !== null}
                style={({ pressed }) => [
                  styles.wifiBtn,
                  { flex: 1, backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
                  connectingId !== null && styles.connectBtnDisabled,
                  pressed && styles.pressed,
                ]}>
                {connectingId === 'mac-josh' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.wifiBtnText, { color: '#FFFFFF' }]}>JOSH</Text>
                )}
              </Pressable>
            </View>
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

          <Pressable
            onPress={() => router.push('/printer-diagnostics')}
            style={({ pressed }) => [styles.card, styles.diagCard, pressed && styles.pressed]}>
            <View style={styles.diagCardLeft}>
              <View style={styles.diagIconWrap}>
                <AppIcon name="waveform.path.ecg" tintColor={Palette.accent} size={20} />
              </View>
              <View style={styles.diagCardTextWrap}>
                <Text style={styles.diagCardTitle}>Diagnostics & Latency Log</Text>
                <Text style={styles.diagCardSub}>
                  Inspect stage-by-stage pipeline timing, BLE MTU, queue depth & error logs
                </Text>
              </View>
              <AppIcon name="chevron.right" tintColor="#94A3B8" size={16} />
            </View>
          </Pressable>
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
  settingsBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  settingsBtnText: { color: Palette.accent, fontSize: 14, fontWeight: '600' },
  settingsHint: { color: Palette.muted, fontSize: 12.5, lineHeight: 18 },
  diagQuickBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  diagQuickBtnText: {
    color: Palette.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  diagCard: {
    paddingVertical: 14,
  },
  diagCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  diagIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagCardTextWrap: {
    flex: 1,
  },
  diagCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
    marginBottom: 2,
  },
  diagCardSub: {
    fontSize: 12,
    color: Palette.muted,
    lineHeight: 16,
  },
  pressed: { opacity: 0.65 },
});
