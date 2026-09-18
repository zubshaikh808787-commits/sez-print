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
  isLikelyDevName,
  isLikelyLabelXName,
  type BluetoothCapabilities,
  type DiscoveredPrinter,
} from '@/lib/printer/printer-manager';
import {
  PRINTER_MODEL_LIST,
  SEZNIK_PRINTER_MODELS,
  type SeznikPrinterModelId,
} from '@/constants/printer-models';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

const ANDROID_BLUETOOTH_SETTINGS = 'android.settings.BLUETOOTH_SETTINGS';

async function openPhoneBluetoothSettings() {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent(ANDROID_BLUETOOTH_SETTINGS);
      return;
    }
    if (Platform.OS === 'ios') {
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
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const setSelectedPrinterModel = usePrinterStore((s) => s.setSelectedPrinterModel);
  const lastDeviceForModel = usePrinterStore((s) => s.lastDeviceForModel);
  const devCommandSet = usePrinterStore((s) => s.devCommandSet);
  const setDevCommandSet = usePrinterStore((s) => s.setDevCommandSet);

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

  const activeModelMeta = SEZNIK_PRINTER_MODELS[selectedModel] || SEZNIK_PRINTER_MODELS.td404;

  const refreshCaps = useCallback(() => {
    const mgr = getPrinterManager();
    const nextCaps = mgr.getCapabilities();
    const on = mgr.isBluetoothEnabled();
    setCaps(nextCaps);
    setBluetoothOn(on);
    return { caps: nextCaps, bluetoothOn: on };
  }, []);

  const startScan = useCallback(async (targetModel = selectedModel) => {
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
      const result = await getPrinterManager().startModelScan(targetModel, (device) => {
        if (!mountedRef.current) return;
        setDevices((prev) => {
          const key = device.id.toUpperCase();
          const idx = prev.findIndex((d) => d.id.toUpperCase() === key);
          if (idx === -1) return [...prev, device];
          const next = [...prev];
          const existing = next[idx];

          const nameToCheck = device.name || existing.name;
          const isLabelX = isLikelyLabelXName(nameToCheck);
          const isJosh = !isLabelX && isLikelyJoshName(nameToCheck);
          const isTez = !isLabelX && !isJosh && isLikelyTezName(nameToCheck);
          const isShakti = !isLabelX && !isJosh && !isTez && isLikelyShaktiName(nameToCheck);
          const isTd = !isLabelX && !isJosh && !isTez && !isShakti && isLikelyTd404Name(nameToCheck);
          const isDev = !isLabelX && !isJosh && !isTez && !isShakti && !isTd && isLikelyDevName(nameToCheck);

          let finalTransport = device.transport;
          let finalSdkId = device.sdkId;
          let finalLikelyLabelX = (device as any).likelyLabelX;
          let finalLikelyJosh = device.likelyJosh;
          let finalLikelyTez = (device as any).likelyTez;
          let finalLikelyShakti = (device as any).likelyShakti;
          let finalLikelyTd404 = device.likelyTd404;
          let finalLikelyDev = (device as any).likelyDev;

          if (isLabelX) {
            finalTransport = 'labelx-spp';
            finalSdkId = 'labelx';
            finalLikelyLabelX = true;
            finalLikelyJosh = false;
            finalLikelyDev = false;
            finalLikelyTd404 = false;
          } else if (isJosh) {
            finalTransport = 'josh-lpapi';
            finalSdkId = 'josh';
            finalLikelyJosh = true;
            finalLikelyDev = false;
            finalLikelyTd404 = false;
          } else if (isTez || isShakti) {
            finalTransport = 'tez-spp';
            finalSdkId = 'tez';
            finalLikelyTez = isTez;
            finalLikelyShakti = isShakti;
            finalLikelyDev = false;
            finalLikelyTd404 = false;
          } else if (isTd) {
            finalTransport = 'bluetooth-spp';
            finalSdkId = 'td404';
            finalLikelyTd404 = true;
            finalLikelyDev = false;
            finalLikelyJosh = false;
          } else if (isDev) {
            finalTransport = 'dev-spp';
            finalSdkId = 'dev';
            finalLikelyDev = true;
            finalLikelyTd404 = false;
            finalLikelyJosh = false;
          } else {
            const SPECIFIC_SDKS = new Set(['td404', 'josh', 'tez', 'dev', 'labelx']);
            if (SPECIFIC_SDKS.has(existing.sdkId ?? '') && !SPECIFIC_SDKS.has(device.sdkId ?? '')) {
              finalTransport = existing.transport;
              finalSdkId = existing.sdkId;
              finalLikelyLabelX = (existing as any).likelyLabelX;
              finalLikelyTd404 = existing.likelyTd404;
              finalLikelyJosh = existing.likelyJosh;
              finalLikelyTez = (existing as any).likelyTez;
              finalLikelyShakti = (existing as any).likelyShakti;
              finalLikelyDev = (existing as any).likelyDev;
            }
          }

          next[idx] = {
            ...next[idx],
            ...device,
            name: device.name || existing.name,
            transport: finalTransport,
            sdkId: finalSdkId,
            likelyLabelX: finalLikelyLabelX,
            likelyTd404: finalLikelyTd404,
            likelyJosh: finalLikelyJosh,
            likelyTez: finalLikelyTez,
            likelyShakti: finalLikelyShakti,
            likelyDev: finalLikelyDev,
            bonded: Boolean(existing.bonded || device.bonded),
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
            `No ${activeModelMeta.shortName} Bluetooth printers found.`;
          setNativeHint(detail);
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        const message =
          error instanceof Error ? error.message : `Could not scan for ${activeModelMeta.shortName} printers.`;
        setNativeHint(message);
        refreshCaps();
        if (!isBluetoothOffError(error)) {
          Alert.alert('Bluetooth Scan Failed', message);
        }
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, [refreshCaps, selectedModel, activeModelMeta.shortName]);

  const handleModelChange = (modelId: SeznikPrinterModelId) => {
    if (modelId === selectedModel) return;
    setSelectedPrinterModel(modelId);
    setDevices([]);
    setNativeHint(null);
    setScanErrors([]);
    void startScan(modelId);
  };

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
    void startScan(selectedModel).catch(() => {});
    return () => {
      mountedRef.current = false;
      appSub.remove();
      getPrinterManager().stopScan();
    };
  }, []);

  const paired = useMemo(
    () => devices.filter((d) => d.bonded),
    [devices],
  );
  const nearby = useMemo(
    () => devices.filter((d) => !d.bonded).sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
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
      const targetModel: SeznikPrinterModelId =
        device.sdkId && device.sdkId !== 'generic'
          ? (device.sdkId as SeznikPrinterModelId)
          : (device as any).likelyLabelX
            ? 'labelx'
            : (device as any).likelyDev
              ? 'dev'
              : (device as any).likelyTez || (device as any).likelyShakti
                ? 'tez'
                : device.likelyJosh
                  ? 'josh'
                  : device.likelyTd404
                    ? 'td404'
                    : selectedModel;

      console.info(
        `[PRINTER-CONNECT] Connecting model ${targetModel} to ${device.id} (${device.name ?? 'unknown'})`,
      );
      await getPrinterManager().connectModel(
        targetModel,
        device.id,
        device.name,
      );
      if (mountedRef.current) {
        Alert.alert(
          'Connected!',
          `${device.name ?? activeModelMeta.shortName} connected successfully. Would you like to print a test label?`,
          [
            {
              text: 'Print Test Label',
              onPress: () => void handleTestPrint(),
            },
            {
              text: 'Done',
              style: 'cancel',
            },
          ],
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          'Connection Failed',
          error instanceof Error ? error.message : `Could not connect to ${activeModelMeta.shortName} printer.`,
        );
      }
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleMacConnect = async () => {
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
    setConnectingId('mac');
    try {
      console.info(`[PRINTER-CONNECT] Manual MAC connect for ${selectedModel}: ${mac}`);
      await getPrinterManager().connectModel(selectedModel, mac, activeModelMeta.shortName);
      if (mountedRef.current) {
        Alert.alert(
          'Connected!',
          `${activeModelMeta.shortName} printer linked successfully. Would you like to print a test label?`,
          [
            {
              text: 'Print Test Label',
              onPress: () => void handleTestPrint(),
            },
            {
              text: 'Done',
              style: 'cancel',
            },
          ],
        );
      }
    } catch (error) {
      Alert.alert(
        'MAC Connect Failed',
        error instanceof Error ? error.message : `Could not connect to ${activeModelMeta.shortName} printer.`,
      );
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleLabelXMacConnect = () => handleMacConnect();
  const handleDevMacConnect = () => handleMacConnect();
  const handleJoshMacConnect = () => handleMacConnect();
  const handleTezMacConnect = () => handleMacConnect();

  const handleCalibrateDev = async () => {
    setCalibrating(true);
    try {
      const ok = await getPrinterManager().calibrateDev(0); // 0 = GAP
      if (ok) {
        Alert.alert('Calibration Complete', 'SEZNIK DEV label sensor calibrated successfully.');
      } else {
        Alert.alert('Calibration Finished', 'Sensor calibration command was executed.');
      }
    } catch (error) {
      Alert.alert(
        'Calibration Failed',
        error instanceof Error ? error.message : 'Could not calibrate DEV printer.',
      );
    } finally {
      setCalibrating(false);
    }
  };

  const handleCalibrateTez = async () => {
    setCalibrating(true);
    try {
      const paper = useSettingsStore.getState().defaults.paperType;
      const tezPaper = paper === 'Receipt' ? 1 : paper === 'Black mark' ? 2 : 0;
      const paperLabel = paper === 'Receipt' ? 'continuous' : paper === 'Black mark' ? 'black mark' : 'gap/label';
      const ok = await getPrinterManager().calibrateTez(tezPaper);
      if (ok) {
        Alert.alert(
          'Calibration Complete',
          `Paper sensor learned ${paperLabel} stock. Keep Paper type on the print screen set to ${paper}. Then reprint.`,
        );
      } else {
        Alert.alert('Calibration Finished', `Sensor calibration for ${paperLabel} paper was sent.`);
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

  const lastDeviceForActiveModel = lastDeviceForModel[selectedModel];

  const handleReconnectLast = async () => {
    if (!lastDeviceForActiveModel) return;
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(BLUETOOTH_OFF_MESSAGE);
      Alert.alert('Bluetooth is off', BLUETOOTH_OFF_MESSAGE);
      return;
    }
    setConnectingId(lastDeviceForActiveModel.id);
    try {
      await getPrinterManager().connectModel(
        selectedModel,
        lastDeviceForActiveModel.id,
        lastDeviceForActiveModel.name,
      );
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
      const testName = `Sez Print ${activeModelMeta.shortName}`;
      await getPrinterManager().printTestLabel(testName);
      Alert.alert('Test Print Sent', `Check ${activeModelMeta.shortName} for a sample label.`);
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
    const isLabelX =
      device.transport === 'labelx-spp' ||
      (device as any).likelyLabelX ||
      isLikelyLabelXName(device.name);
    const isDev =
      device.transport === 'dev-spp' ||
      (device as any).likelyDev ||
      isLikelyDevName(device.name);
    const isTez =
      device.transport === 'tez-spp' ||
      (device as any).likelyTez ||
      isLikelyTezName(device.name);
    const isShakti = (device as any).likelyShakti || isLikelyShaktiName(device.name);
    const isJosh =
      device.transport === 'josh-lpapi' ||
      device.likelyJosh ||
      isLikelyJoshName(device.name);
    const td404 =
      device.transport === 'bluetooth-spp' ||
      device.likelyTd404 ||
      isLikelyTd404Name(device.name);

    const isThisModel =
      (selectedModel === 'td404' && td404) ||
      (selectedModel === 'josh' && isJosh) ||
      (selectedModel === 'dev' && isDev) ||
      (selectedModel === 'tez' && (isTez || isShakti)) ||
      (selectedModel === 'labelx' && isLabelX);

    const iconTint = isLabelX
      ? '#0891B2'
      : isDev
        ? '#2563EB'
        : isTez
          ? '#059669'
          : isShakti
            ? '#D97706'
            : isJosh
              ? '#7C3AED'
              : activeModelMeta.badgeTextColor;

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
            {isLabelX ? (
              <View style={[styles.badge, { backgroundColor: '#ECFEFF', borderColor: '#A5F3FC' }]}>
                <Text style={[styles.badgeText, { color: '#0891B2' }]}>LABEL X</Text>
              </View>
            ) : isDev ? (
              <View style={[styles.badge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={[styles.badgeText, { color: '#2563EB' }]}>SEZNIK DEV</Text>
              </View>
            ) : isTez ? (
              <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.badgeText, { color: '#059669' }]}>TEZ</Text>
              </View>
            ) : isShakti ? (
              <View style={[styles.badge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Text style={[styles.badgeText, { color: '#D97706' }]}>SHAKTI</Text>
              </View>
            ) : isJosh ? (
              <View style={[styles.badge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                <Text style={[styles.badgeText, { color: '#7C3AED' }]}>JOSH</Text>
              </View>
            ) : td404 ? (
              <View style={[styles.badge, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                <Text style={[styles.badgeText, { color: '#0284C7' }]}>
                  {device.name?.toLowerCase().includes('tejas')
                    ? 'TEJAS'
                    : device.name?.toLowerCase().includes('rudra')
                      ? 'RUDRA'
                      : 'TD-404'}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: activeModelMeta.badgeColor, borderColor: activeModelMeta.badgeBorderColor },
                ]}>
                <Text style={[styles.badgeText, { color: activeModelMeta.badgeTextColor }]}>
                  {activeModelMeta.shortName}
                </Text>
              </View>
            )}
            {device.bonded ? (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeMutedText}>Paired</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.deviceMeta}>
            {device.transport === 'labelx-spp'
              ? 'LABEL X OEM'
              : device.transport === 'dev-spp'
              ? 'SEZNIK DEV'
              : device.transport === 'tez-spp'
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
            {isThisModel ? ' · Optimized match' : ''}
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
          {/* PRINTER MODEL SELECTOR TABS */}
          <View style={styles.modelTabsContainer}>
            <Text style={styles.selectorHeading}>Select Label Printer Model</Text>
            <View style={styles.modelTabsRow}>
              {PRINTER_MODEL_LIST.map((model) => {
                const isSelected = model.id === selectedModel;
                return (
                  <Pressable
                    key={model.id}
                    onPress={() => handleModelChange(model.id)}
                    style={({ pressed }) => [
                      styles.modelTab,
                      isSelected && {
                        backgroundColor: model.badgeColor,
                        borderColor: model.badgeBorderColor,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.modelTabText,
                        isSelected && {
                          color: model.badgeTextColor,
                          fontWeight: '700',
                        },
                      ]}>
                      {model.shortName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ACTIVE MODEL INFO CARD */}
          <View
            style={[
              styles.modelBannerCard,
              { backgroundColor: activeModelMeta.badgeColor, borderColor: activeModelMeta.badgeBorderColor },
            ]}>
            <View style={styles.modelBannerHeader}>
              <View style={styles.modelBannerLeft}>
                <Text style={[styles.modelBannerTitle, { color: activeModelMeta.badgeTextColor }]}>
                  {activeModelMeta.name}
                </Text>
                <Text style={styles.modelBannerSub}>{activeModelMeta.tagline}</Text>
              </View>
              <View
                style={[
                  styles.driverPill,
                  { backgroundColor: '#FFFFFF', borderColor: activeModelMeta.badgeBorderColor },
                ]}>
                <Text style={[styles.driverPillText, { color: activeModelMeta.badgeTextColor }]}>
                  {activeModelMeta.driver}
                </Text>
              </View>
            </View>
            {activeModelMeta.warningNotice ? (
              <View style={styles.modelNoticeBox}>
                <AppIcon name="info.circle.fill" tintColor={activeModelMeta.badgeTextColor} size={14} />
                <Text style={[styles.modelNoticeText, { color: activeModelMeta.badgeTextColor }]}>
                  {activeModelMeta.warningNotice}
                </Text>
              </View>
            ) : null}
          </View>

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
                That installs the development build with all label printer bridges.
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

          {/* SCAN ACTION CARD */}
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{activeModelMeta.shortName} Bluetooth Scan</Text>
            <Text style={styles.heroBody}>
              Dedicated scan for {activeModelMeta.name}. Tap Connect as soon as your device appears.
            </Text>
            <Pressable
              onPress={() => void startScan(selectedModel).catch(() => {})}
              disabled={connectingId !== null || !caps.canScan || !bluetoothOn}
              style={({ pressed }) => [
                styles.connectBtn,
                { backgroundColor: activeModelMeta.badgeTextColor },
                (connectingId !== null || !caps.canScan || !bluetoothOn) && styles.connectBtnDisabled,
                pressed && styles.pressed,
              ]}>
              {scanning ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <AppIcon name="antenna.radiowaves.left.and.right" tintColor="#FFFFFF" size={18} />
              )}
              <Text style={styles.connectBtnText}>
                {scanning ? `Scanning for ${activeModelMeta.shortName}…` : `Scan for ${activeModelMeta.shortName}`}
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
              </>
            ) : null}
            {nativeHint ? <Text style={styles.warnText}>{nativeHint}</Text> : null}
            {scanErrors.length > 0 ? (
              <Text style={styles.warnText}>{scanErrors.join(' · ')}</Text>
            ) : null}
          </View>

          {/* CONNECTED PRINTER STATUS CARD */}
          {status === 'connected' ? (
            <View style={[styles.card, styles.connectedCard]}>
              <View style={styles.connectedRow}>
                <AppIcon name="printer.fill" tintColor="#2E9E63" size={24} />
                <View style={styles.connectedInfo}>
                  <Text style={styles.connectedName}>{deviceName ?? deviceId}</Text>
                  <Text style={styles.connectedStatus}>
                    Connected · {activeModelMeta.name}
                    {transport ? ` (${transport})` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  style={({ pressed }) => [styles.disconnectBtn, pressed && styles.pressed]}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </Pressable>
              </View>

              {/* DEV DUAL COMMAND SET TOGGLE */}
              {selectedModel === 'dev' ? (
                <View style={{ marginTop: 12, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Palette.muted, marginBottom: 6 }}>
                    Command Engine (2-in-1 Dual Mode):
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => setDevCommandSet('tspl')}
                      style={[
                        { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                        devCommandSet === 'tspl'
                          ? { backgroundColor: Palette.accent, borderColor: Palette.accent }
                          : { backgroundColor: Palette.card, borderColor: Palette.hairline },
                      ]}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: devCommandSet === 'tspl' ? '#fff' : Palette.ink }}>
                        TSPL (Label Stock)
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDevCommandSet('escpos')}
                      style={[
                        { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                        devCommandSet === 'escpos'
                          ? { backgroundColor: Palette.accent, borderColor: Palette.accent }
                          : { backgroundColor: Palette.card, borderColor: Palette.hairline },
                      ]}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: devCommandSet === 'escpos' ? '#fff' : Palette.ink }}>
                        ESC/POS (Graphic)
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* TEST PRINT */}
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
                  <Text style={styles.connectBtnText}>Test Print ({activeModelMeta.shortName})</Text>
                )}
              </Pressable>

              {/* CALIBRATION BUTTONS */}
              {selectedModel === 'dev' ? (
                <Pressable
                  onPress={() => void handleCalibrateDev()}
                  disabled={calibrating}
                  style={({ pressed }) => [
                    styles.testBtn,
                    { backgroundColor: '#0284C7', marginTop: 8 },
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

              {selectedModel === 'tez' ? (
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

          {/* LAST PAIRED FOR ACTIVE MODEL */}
          {status !== 'connected' && lastDeviceForActiveModel ? (
            <Pressable
              onPress={() => void handleReconnectLast()}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <Text style={styles.sectionTitleInline}>Last {activeModelMeta.shortName} Printer</Text>
              <Text style={styles.deviceName}>
                {lastDeviceForActiveModel.name || lastDeviceForActiveModel.id}
              </Text>
              <Text style={styles.connectLink}>Reconnect</Text>
            </Pressable>
          ) : null}

          {/* PAIRED DEVICES LIST */}
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Paired {activeModelMeta.shortName} ({paired.length})</Text>
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
                    ? `Loading paired ${activeModelMeta.shortName} devices…`
                    : `No paired ${activeModelMeta.shortName} printers yet. Pair in Android Bluetooth settings, then rescan.`}
              </Text>
            ) : (
              paired.map((d, i) => renderDevice(d, i, paired.length))
            )}
          </View>

          {/* NEARBY DEVICES LIST */}
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>Nearby {activeModelMeta.shortName} ({nearby.length})</Text>
            {!scanning && caps.canScan && bluetoothOn ? (
              <Pressable
                onPress={() => void startScan(selectedModel).catch(() => {})}
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
                    ? `Searching nearby ${activeModelMeta.shortName}…`
                    : `No nearby ${activeModelMeta.shortName} printers found. Ensure the printer is powered on and in range.`}
              </Text>
            ) : (
              nearby.map((d, i) => renderDevice(d, i, nearby.length))
            )}
          </View>

          {/* DIRECT MAC CONNECT */}
          <View style={styles.card}>
            <Text style={styles.sectionTitleInline}>Connect {activeModelMeta.shortName} by MAC</Text>
            <Text style={styles.heroBody}>
              Android Settings → Bluetooth → pair printer → copy MAC, then connect directly:
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
                { backgroundColor: activeModelMeta.badgeTextColor, borderColor: activeModelMeta.badgeTextColor },
                connectingId !== null && styles.connectBtnDisabled,
                pressed && styles.pressed,
              ]}>
              {connectingId === 'mac' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.wifiBtnText, { color: '#FFFFFF' }]}>
                  Connect to {activeModelMeta.shortName}
                </Text>
              )}
            </Pressable>
          </View>

          {/* WI-FI LAN CONNECT */}
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

          {/* DIAGNOSTICS LINK */}
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
                  Inspect stage-by-stage pipeline timing, queue depth & error logs
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
  modelTabsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...cardShadow,
  },
  selectorHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modelTabsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modelTab: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modelTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  modelBannerCard: {
    borderRadius: 12,
    padding: Spacing.three,
    borderWidth: 1,
    gap: 8,
  },
  modelBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelBannerLeft: {
    flex: 1,
    marginRight: 8,
  },
  modelBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modelBannerSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  driverPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  driverPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  modelNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  modelNoticeText: {
    fontSize: 11.5,
    fontWeight: '500',
    flex: 1,
  },
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeMuted: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
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

