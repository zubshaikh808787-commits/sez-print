import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editorBridge } from '@/constants/editor-bridge';
import { isScanEmptyError, payloadFromBarcodeResult, SCAN_CODE_TYPES } from '@/lib/scan-codes';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_FRAME_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.72), 280);
const CORNER_COLOR = '#A3E635'; // Lime green matching screenshot
const CORNER_LENGTH = 28;
const CORNER_THICKNESS = 4.5;

/** SVG-less clean lightbulb icon */
function LightbulbIcon({ active = false, size = 38 }: { active?: boolean; size?: number }) {
  const color = active ? '#FFD600' : '#FFFFFF';
  return (
    <View style={[styles.bulbContainer, { width: size, height: size }]}>
      {/* Bulb head */}
      <View
        style={[
          styles.bulbHead,
          {
            borderColor: color,
            backgroundColor: active ? 'rgba(255, 214, 0, 0.25)' : 'transparent',
          },
        ]}
      />
      {/* Bulb base */}
      <View style={[styles.bulbBase, { borderColor: color }]} />
      <View style={[styles.bulbThread, { backgroundColor: color }]} />
      {/* Glow rays if active */}
      {active && (
        <>
          <View style={[styles.glowRay, styles.glowTop, { backgroundColor: color }]} />
          <View style={[styles.glowRay, styles.glowLeft, { backgroundColor: color }]} />
          <View style={[styles.glowRay, styles.glowRight, { backgroundColor: color }]} />
        </>
      )}
    </View>
  );
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const returnToEdit = fromParam === 'edit';
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ type: string; data: string } | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [scanCooldown, setScanCooldown] = useState(false);

  // Animated laser scan bar
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startScanAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startScanAnimation();
  }, [scanLineAnim]);

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_FRAME_SIZE - 6],
  });

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanCooldown || scannedResult) return;
    const payload = payloadFromBarcodeResult(result);
    if (!payload) return;
    setScanCooldown(true);
    setScannedResult(payload);
  };

  const handlePhotoPick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (res.canceled || !res.assets?.[0]?.uri) return;

      const results = await scanFromURLAsync(res.assets[0].uri, SCAN_CODE_TYPES);
      const payload = results.map(payloadFromBarcodeResult).find(Boolean);
      if (payload) {
        setScannedResult(payload);
        return;
      }
      Alert.alert(
        'Nothing Detected',
        'No barcode or QR code was found in this photo. Try a closer, sharper photo of just the code, or enter it manually.',
      );
    } catch (error) {
      if (isScanEmptyError(error)) {
        Alert.alert(
          'Nothing Detected',
          'No barcode or QR code was found in this photo. Try a closer, sharper photo of just the code, or enter it manually.',
        );
        return;
      }
      Alert.alert('Error', 'Unable to read this photo. Try another image, or enter the code manually.');
    }
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) {
      Alert.alert('Required', 'Please enter a barcode number or text');
      return;
    }
    const val = manualInput.trim();
    setManualModalVisible(false);
    setManualInput('');
    setScannedResult({ type: 'MANUAL', data: val });
  };

  const handleScanAgain = () => {
    setScannedResult(null);
    setTimeout(() => {
      setScanCooldown(false);
    }, 800);
  };

  const handleUseInEditor = () => {
    if (!scannedResult) return;

    editorBridge.scanResult = scannedResult;
    setScannedResult(null);

    if (returnToEdit) {
      router.back();
      return;
    }

    router.replace('/edit');
  };

  const handlePrintScanned = () => {
    if (!scannedResult) return;

    const payload = scannedResult;
    setScannedResult(null);
    router.replace({
      pathname: '/print',
      params: {
        scanType: payload.type,
        scanData: payload.data,
      },
    });
  };

  // Permission Request State
  if (!permission) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.permissionText}>Initializing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Scan</Text>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Text style={styles.cameraEmoji}>📷</Text>
          </View>
          <Text style={styles.permissionHeading}>Camera Permission Needed</Text>
          <Text style={styles.permissionSub}>
            Please enable camera access so Sez Print can scan barcodes, QR codes, and label tags.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.btnPressed]}
            onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Allow Camera Access</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.btnPressed]}
            onPress={() => setManualModalVisible(true)}>
            <Text style={styles.secondaryButtonText}>Enter Barcode Manually</Text>
          </Pressable>
        </View>

        {/* Manual Modal Fallback */}
        <Modal
          visible={manualModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setManualModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Enter Barcode Manually</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter barcode or serial number"
                placeholderTextColor="#8E97A1"
                value={manualInput}
                onChangeText={setManualInput}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setManualModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalSubmitBtn]}
                  onPress={handleManualSubmit}>
                  <Text style={styles.modalSubmitText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  const topMaskHeight = Math.max((SCREEN_HEIGHT - SCAN_FRAME_SIZE) / 2 - 40, insets.top + 70);

  return (
    <View style={styles.container}>
      {/* Real Camera View */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: SCAN_CODE_TYPES,
        }}
        onBarcodeScanned={scannedResult ? undefined : handleBarcodeScanned}
      />

      {/* Dark Mask Surrounding Scan Viewfinder */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top Dark Mask */}
        <View style={[styles.maskDark, { height: topMaskHeight }]} />

        {/* Middle Row */}
        <View style={{ flexDirection: 'row', height: SCAN_FRAME_SIZE }}>
          <View style={[styles.maskDark, { flex: 1 }]} />
          {/* Central Cutout Frame */}
          <View style={styles.scanBox}>
            {/* 4 Lime-Green Corner Brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Animated Green Scanning Laser Line */}
            <Animated.View
              style={[
                styles.scanLaser,
                {
                  transform: [{ translateY }],
                },
              ]}
            />
          </View>
          <View style={[styles.maskDark, { flex: 1 }]} />
        </View>

        {/* Bottom Dark Mask */}
        <View style={[styles.maskDark, styles.maskBottom]}>
          {/* "If not recognized, enter manually" Button */}
          <Pressable
            style={({ pressed }) => [styles.manualEntryBtn, pressed && styles.btnPressed]}
            onPress={() => setManualModalVisible(true)}>
            <Text style={styles.manualEntryText}>If not recognized, enter manually</Text>
          </Pressable>
        </View>
      </View>

      {/* Top Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Scan</Text>
        <Pressable onPress={handlePhotoPick} hitSlop={14} style={styles.photoButton}>
          <Text style={styles.photoText}>Photo</Text>
        </Pressable>
      </View>

      {/* Bottom Torch / Flashlight Section */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 26 }]}>
        <Pressable
          style={({ pressed }) => [styles.torchButton, pressed && styles.btnPressed]}
          onPress={() => setTorch((prev) => !prev)}>
          <LightbulbIcon active={torch} size={36} />
          <Text style={[styles.torchText, torch && styles.torchTextActive]}>
            {torch ? 'Touch to Turn Off' : 'Touch and Light Up'}
          </Text>
        </Pressable>
      </View>

      {/* Manual Entry Modal */}
      <Modal
        visible={manualModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Barcode Manually</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 8901234567890"
              placeholderTextColor="#8E97A1"
              value={manualInput}
              onChangeText={setManualInput}
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => {
                  setManualModalVisible(false);
                  setManualInput('');
                }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSubmitBtn]} onPress={handleManualSubmit}>
                <Text style={styles.modalSubmitText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Scan Result Modal */}
      <Modal
        visible={!!scannedResult}
        transparent
        animationType="slide"
        onRequestClose={handleScanAgain}>
        <View style={styles.resultBackdrop}>
          <View style={[styles.resultCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.resultHeader}>
              <View style={styles.successBadge}>
                <Text style={styles.successCheck}>✓</Text>
              </View>
              <Text style={styles.resultHeading}>Label Scanned</Text>
              <Text style={styles.resultTypeTag}>{scannedResult?.type?.toUpperCase() ?? 'CODE'}</Text>
            </View>

            <View style={styles.resultContentBox}>
              <Text style={styles.resultLabel}>Scanned Content:</Text>
              <Text style={styles.resultDataText} numberOfLines={3} selectable>
                {scannedResult?.data}
              </Text>
            </View>

            <View style={styles.resultActions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.primaryActionBtn, pressed && styles.btnPressed]}
                onPress={handleUseInEditor}>
                <Text style={styles.primaryActionText}>
                  {returnToEdit ? 'Use in Label Editor' : 'Open in Label Editor'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.secondaryActionBtn, pressed && styles.btnPressed]}
                onPress={handlePrintScanned}>
                <Text style={styles.secondaryActionText}>Print Label</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.cancelActionBtn, pressed && styles.btnPressed]}
                onPress={handleScanAgain}>
                <Text style={styles.cancelActionText}>Scan Another</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  maskDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  maskBottom: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#101419',
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cameraEmoji: {
    fontSize: 40,
  },
  permissionHeading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  permissionSub: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#17A6B8',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
  },
  photoButton: {
    minWidth: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  photoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  headerRightPlaceholder: {
    width: 44,
  },
  scanBox: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  // Lime green corner brackets
  corner: {
    position: 'absolute',
    width: CORNER_LENGTH,
    height: CORNER_LENGTH,
    borderColor: CORNER_COLOR,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 3,
  },
  // Sweeping laser
  scanLaser: {
    width: '100%',
    height: 2.5,
    backgroundColor: '#A3E635',
    shadowColor: '#A3E635',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  manualEntryBtn: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  manualEntryText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  torchText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  torchTextActive: {
    color: '#FFD600',
    fontWeight: '600',
  },
  // Lightbulb Icon Graphics
  bulbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bulbHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  bulbBase: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    marginTop: -2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  bulbThread: {
    width: 6,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
  glowRay: {
    position: 'absolute',
    borderRadius: 1,
  },
  glowTop: {
    top: 0,
    width: 2,
    height: 5,
  },
  glowLeft: {
    left: 2,
    top: 14,
    width: 5,
    height: 2,
  },
  glowRight: {
    right: 2,
    top: 14,
    width: 5,
    height: 2,
  },
  // Manual Entry Dialog
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSubmitBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Result Modal
  resultBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successCheck: {
    color: '#16A34A',
    fontSize: 24,
    fontWeight: '700',
  },
  resultHeading: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  resultTypeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#17A6B8',
    backgroundColor: '#E0F7FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  resultContentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 20,
  },
  resultLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  resultDataText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  resultActions: {
    gap: 10,
  },
  actionBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtn: {
    backgroundColor: '#17A6B8',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  secondaryActionText: {
    color: '#0284C7',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelActionBtn: {
    backgroundColor: '#F1F5F9',
  },
  cancelActionText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '500',
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
