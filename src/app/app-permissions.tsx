import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

import {
  SettingsCard,
  SettingsNote,
  SettingsScreenShell,
  SettingsStatusRow,
} from '@/components/settings-ui';

function loadSpeechModule() {
  try {
    // Lazy require so Expo Go doesn't crash at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition') as typeof import('expo-speech-recognition');
    return mod.ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

export default function AppPermissionsScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [photoPermission, requestPhotoPermission] = ImagePicker.useMediaLibraryPermissions();
  const [speechGranted, setSpeechGranted] = useState(false);
  const [bluetoothGranted, setBluetoothGranted] = useState(Platform.OS !== 'android');

  const refreshStatuses = useCallback(async () => {
    const speechModule = loadSpeechModule();
    if (speechModule) {
      const speech = await speechModule.getPermissionsAsync().catch(() => null);
      setSpeechGranted(speech?.granted ?? false);
    }

    if (Platform.OS === 'android' && (Platform.Version as number) >= 31) {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ).catch(() => false);
      setBluetoothGranted(granted);
    }
  }, []);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const openSettingsFallback = (granted: boolean, canAskAgain: boolean, request: () => void) => {
    if (granted) {
      void Linking.openSettings();
      return;
    }
    if (canAskAgain) request();
    else void Linking.openSettings();
  };

  const handleBluetooth = async () => {
    if (Platform.OS !== 'android') {
      void Linking.openSettings();
      return;
    }
    if ((Platform.Version as number) < 31) {
      Alert.alert('Bluetooth', 'Bluetooth permissions are granted at install time on this device.');
      return;
    }
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]).catch(() => null);
    const granted =
      results != null &&
      Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    setBluetoothGranted(granted);
    if (!granted) void Linking.openSettings();
  };

  const handleSpeech = async () => {
    if (speechGranted) {
      void Linking.openSettings();
      return;
    }
    const speechModule = loadSpeechModule();
    if (!speechModule) {
      Alert.alert('Unavailable', 'Speech recognition requires a development build.');
      return;
    }
    const result = await speechModule.requestPermissionsAsync().catch(() => null);
    setSpeechGranted(result?.granted ?? false);
    if (result && !result.granted && !result.canAskAgain) void Linking.openSettings();
  };

  return (
    <SettingsScreenShell title="App Permissions">
      <SettingsCard>
        <SettingsStatusRow label="Network" enabled onPress={() => void Linking.openSettings()} />
      </SettingsCard>

      <SettingsCard>
        <SettingsStatusRow
          label="Bluetooth"
          enabled={bluetoothGranted}
          onPress={() => void handleBluetooth()}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsStatusRow
          label="Camera"
          enabled={cameraPermission?.granted ?? false}
          onPress={() =>
            openSettingsFallback(
              cameraPermission?.granted ?? false,
              cameraPermission?.canAskAgain ?? true,
              () => void requestCameraPermission(),
            )
          }
          showDivider
        />
        <SettingsStatusRow
          label="Photo"
          enabled={photoPermission?.granted ?? false}
          onPress={() =>
            openSettingsFallback(
              photoPermission?.granted ?? false,
              photoPermission?.canAskAgain ?? true,
              () => void requestPhotoPermission(),
            )
          }
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsStatusRow
          label="Microphone"
          enabled={speechGranted}
          onPress={() => void handleSpeech()}
          showDivider
        />
        <SettingsStatusRow
          label="Voice Recognition"
          enabled={speechGranted}
          onPress={() => void handleSpeech()}
        />
      </SettingsCard>

      <SettingsNote>
        Tap a permission to request it, or open the system settings when it has already been
        decided.
      </SettingsNote>
    </SettingsScreenShell>
  );
}
