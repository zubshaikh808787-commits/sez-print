import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeType,
} from 'expo-camera';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editorBridge, type OcrResultType } from '@/constants/editor-bridge';
import { Palette } from '@/constants/ui';
import { recognizeTextFromImage } from '@/lib/text-recognition';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.62), 260);

const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'code128',
  'code39',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
];

const QR_TYPES: BarcodeType[] = ['qr', 'aztec', 'datamatrix', 'pdf417'];

type OcrStep = 'capture' | 'identify';

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: OcrResultType;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioRow} hitSlop={6}>
      <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={[styles.radioLabel, selected && styles.radioLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export default function OcrScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const returnToEdit = fromParam === 'edit';

  const cameraRef = useRef<CameraView>(null);
  const previewInputRef = useRef<TextInput>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<OcrStep>('capture');
  const [torch, setTorch] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognitionType, setRecognitionType] = useState<OcrResultType>('Text');
  const [previewText, setPreviewText] = useState('');
  const [identifying, setIdentifying] = useState(false);

  const goBack = useCallback(() => {
    if (step === 'identify') {
      setStep('capture');
      setPreviewText('');
      return;
    }
    router.back();
  }, [step]);

  const openIdentifyStep = (uri: string) => {
    setImageUri(uri);
    setPreviewText('');
    setRecognitionType('Text');
    setStep('identify');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;

    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        openIdentifyStep(photo.uri);
      }
    } catch {
      Alert.alert('Capture Failed', 'Unable to take a photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleGalleryPick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        openIdentifyStep(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Unable to open photo library.');
    }
  };

  const handleClear = () => {
    setImageUri(null);
    setPreviewText('');
    setStep('capture');
  };

  const handleChooseType = () => {
    Alert.alert('Choose Type', 'Select what you want to identify in the photo.', [
      { text: 'Text', onPress: () => setRecognitionType('Text') },
      { text: 'Barcode', onPress: () => setRecognitionType('Barcode') },
      { text: 'QRCode', onPress: () => setRecognitionType('QRCode') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleIdentify = async () => {
    if (!imageUri) {
      Alert.alert('No Image', 'Capture or choose a photo first.');
      return;
    }

    setIdentifying(true);
    try {
      if (recognitionType === 'QRCode') {
        const results = await scanFromURLAsync(imageUri, QR_TYPES);
        if (results[0]?.data) {
          setPreviewText(results[0].data);
        } else {
          Alert.alert('Not Found', 'No QR code was detected in this photo.');
        }
        return;
      }

      if (recognitionType === 'Barcode') {
        const results = await scanFromURLAsync(imageUri, BARCODE_TYPES);
        if (results[0]?.data) {
          setPreviewText(results[0].data);
        } else {
          Alert.alert('Not Found', 'No barcode was detected in this photo.');
        }
        return;
      }

      const recognized = await recognizeTextFromImage(imageUri);
      if (recognized) {
        setRecognitionType('Text');
        setPreviewText(recognized);
        return;
      }

      const codeResults = await scanFromURLAsync(imageUri, [...QR_TYPES, ...BARCODE_TYPES]);
      if (codeResults[0]?.data) {
        const isQr = QR_TYPES.includes(codeResults[0].type as BarcodeType);
        setRecognitionType(isQr ? 'QRCode' : 'Barcode');
        setPreviewText(codeResults[0].data);
        return;
      }

      previewInputRef.current?.focus();
      Alert.alert(
        'Enter Text',
        'No text or code was found automatically. Type or edit the text you see in the photo inside the preview field below. (Full text OCR requires a development build.)',
      );
    } catch {
      Alert.alert('Identify Failed', 'Unable to analyze this image. Please try another photo.');
    } finally {
      setIdentifying(false);
    }
  };

  const handleConfirm = () => {
    const value = previewText.trim();
    if (!value) {
      Alert.alert('Required', 'Identify content first or enter text in the preview field.');
      return;
    }

    editorBridge.ocrResult = {
      type: recognitionType,
      data: value,
    };

    if (returnToEdit) {
      router.back();
      return;
    }

    router.replace('/edit');
  };

  if (!permission) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted && step === 'capture') {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
            <SymbolView name="chevron.left" tintColor="#FFFFFF" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>OCR</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={styles.permissionBody}>
          <Text style={styles.permissionTitle}>Camera Permission Needed</Text>
          <Text style={styles.permissionSub}>
            Allow camera access to capture label text, barcodes, and QR codes for OCR.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.permissionBtn, pressed && styles.pressed]}
            onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.permissionSecondaryBtn, pressed && styles.pressed]}
            onPress={handleGalleryPick}>
            <Text style={styles.permissionSecondaryText}>Choose Photo Instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'capture') {
    return (
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setCameraReady(true)}
        />

        <View style={[styles.header, styles.captureHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
            <SymbolView name="chevron.left" tintColor="#FFFFFF" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>OCR</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={[styles.captureControls, { paddingBottom: insets.bottom + 28 }]}>
          <Pressable
            onPress={() => setTorch((prev) => !prev)}
            style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
            hitSlop={10}>
            <SymbolView
              name={torch ? 'flashlight.on.fill' : 'flashlight.off.fill'}
              tintColor="#FFFFFF"
              size={28}
            />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={!cameraReady || capturing}
            style={({ pressed }) => [styles.shutterOuter, pressed && styles.pressed]}>
            {capturing ? (
              <ActivityIndicator color={Palette.header} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>

          <Pressable
            onPress={handleGalleryPick}
            style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
            hitSlop={10}>
            <SymbolView name="photo.on.rectangle" tintColor="#FFFFFF" size={28} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.headerSide}>
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>OCR</Text>
        <Pressable onPress={handleConfirm} hitSlop={10} style={[styles.headerSide, styles.headerSideRight]}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>

      <View style={styles.identifyBlueSection}>
        <View style={styles.imageFrame}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.previewPlaceholder} />
          )}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleIdentify}
            disabled={identifying}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            {identifying ? (
              <ActivityIndicator size="small" color={Palette.accent} />
            ) : (
              <Text style={styles.actionIdentifyText}>Identify</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionClearText}>Clear</Text>
          </Pressable>

          <Pressable
            onPress={handleChooseType}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionIdentifyText}>Choose Type</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.identifyWhiteSection, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.typeRow}>
          <RadioOption
            label="Text"
            selected={recognitionType === 'Text'}
            onPress={() => setRecognitionType('Text')}
          />
          <RadioOption
            label="Barcode"
            selected={recognitionType === 'Barcode'}
            onPress={() => setRecognitionType('Barcode')}
          />
          <RadioOption
            label="QRCode"
            selected={recognitionType === 'QRCode'}
            onPress={() => setRecognitionType('QRCode')}
          />
        </View>

        <TextInput
          ref={previewInputRef}
          style={styles.previewInput}
          value={previewText}
          onChangeText={setPreviewText}
          placeholder=""
          placeholderTextColor="#A4B0BC"
          multiline
          textAlignVertical="center"
        />

        <Text style={styles.effectPreviewLabel}>Effect Preview</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.header,
  },
  centered: {
    flex: 1,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: Palette.header,
    zIndex: 10,
  },
  captureHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(33, 70, 104, 0.35)',
  },
  headerSide: {
    width: 72,
    height: 40,
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
  },
  permissionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  permissionBtn: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionSecondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionSecondaryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '500',
  },
  captureControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    zIndex: 10,
  },
  captureSideBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  identifyBlueSection: {
    backgroundColor: Palette.header,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
    alignItems: 'center',
  },
  imageFrame: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  actionBtn: {
    minWidth: 88,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionIdentifyText: {
    color: Palette.accent,
    fontSize: 16,
    fontWeight: '500',
  },
  actionClearText: {
    color: Palette.danger,
    fontSize: 16,
    fontWeight: '500',
  },
  identifyWhiteSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#B8C0C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: Palette.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.accent,
  },
  radioLabel: {
    fontSize: 15,
    color: '#556473',
    fontWeight: '500',
  },
  radioLabelActive: {
    color: Palette.accent,
    fontWeight: '600',
  },
  previewInput: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2C3E50',
    marginBottom: 14,
  },
  effectPreviewLabel: {
    textAlign: 'center',
    color: '#7E8B98',
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
});
