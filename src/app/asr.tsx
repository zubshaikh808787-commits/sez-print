import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editorBridge, type OcrResultType } from '@/constants/editor-bridge';
import { createAsrSpeechEngine } from '@/lib/asr-speech';
import { Palette } from '@/constants/ui';

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

function formatPreview(text: string, type: OcrResultType) {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (type === 'Barcode') {
    const digits = trimmed.replace(/\D/g, '');
    return digits || trimmed;
  }

  return trimmed;
}

export default function AsrScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const returnToEdit = fromParam === 'edit';

  const [recognitionType, setRecognitionType] = useState<OcrResultType>('Text');
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const speechRef = useRef<ReturnType<typeof createAsrSpeechEngine> | null>(null);

  useEffect(() => {
    const engine = createAsrSpeechEngine({
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        setInterimText('');
      },
      onResult: (spoken, isFinal) => {
        if (isFinal) {
          setTranscript((prev) => (prev ? `${prev} ${spoken}` : spoken).trim());
          setInterimText('');
          return;
        }
        setInterimText(spoken);
      },
      onError: (message) => {
        setListening(false);
        setInterimText('');
        Alert.alert('Speech Error', message);
      },
    });

    speechRef.current = engine;
    setSpeechAvailable(engine.available);

    return () => {
      engine.dispose();
      speechRef.current = null;
    };
  }, []);

  const displayText = useMemo(() => {
    if (!interimText) return transcript;
    if (!transcript) return interimText;
    return `${transcript} ${interimText}`.trim();
  }, [interimText, transcript]);

  const previewText = useMemo(
    () => formatPreview(displayText, recognitionType),
    [displayText, recognitionType],
  );

  const handleSpeakStart = async () => {
    const engine = speechRef.current;
    if (!engine) return;

    try {
      await engine.start();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : speechAvailable
          ? 'Unable to start speech recognition.'
          : 'Speech recognition is unavailable in Expo Go. Type in the transcription box instead.';
      Alert.alert('Speech Unavailable', message);
    }
  };

  const handleSpeakEnd = () => {
    speechRef.current?.stop();
  };

  const handleClear = () => {
    speechRef.current?.abort();
    setTranscript('');
    setInterimText('');
  };

  const handleChooseType = () => {
    Alert.alert('Choose Type', 'Select how the spoken content should be applied to your label.', [
      { text: 'Text', onPress: () => setRecognitionType('Text') },
      { text: 'Barcode', onPress: () => setRecognitionType('Barcode') },
      { text: 'QRCode', onPress: () => setRecognitionType('QRCode') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleConfirm = () => {
    const value = previewText.trim();
    if (!value) {
      Alert.alert('Required', 'Hold to Speak or type content in the transcription box first.');
      return;
    }

    editorBridge.asrResult = {
      type: recognitionType,
      data: value,
    };

    if (returnToEdit) {
      router.back();
      return;
    }

    router.replace('/edit');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>ASR</Text>
        <Pressable onPress={handleConfirm} hitSlop={10} style={[styles.headerSide, styles.headerSideRight]}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.transcriptSection}>
        <View style={styles.transcriptCard}>
          <ScrollView
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptScrollContent}
            keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.transcriptInput}
              value={displayText}
              onChangeText={(value) => {
                setTranscript(value);
                setInterimText('');
              }}
              placeholder={listening ? 'Listening…' : 'Hold to Speak or type here'}
              placeholderTextColor="#A4B0BC"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.actionRow}>
            <Pressable
              onPressIn={handleSpeakStart}
              onPressOut={handleSpeakEnd}
              style={({ pressed }) => [styles.actionBtn, (pressed || listening) && styles.pressed]}>
              <Text style={[styles.actionSpeakText, listening && styles.actionSpeakTextActive]}>
                {listening ? 'Listening…' : 'Hold to Speak'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
              <Text style={styles.actionClearText}>Clear</Text>
            </Pressable>

            <Pressable
              onPress={handleChooseType}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
              <Text style={styles.actionSpeakText}>Choose Type</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
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

        <View style={styles.previewBox}>
          <Text style={styles.previewText} numberOfLines={3}>
            {previewText}
          </Text>
        </View>

        <Text style={styles.effectPreviewLabel}>Effect Preview</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.header,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: Palette.header,
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
  transcriptSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  transcriptCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  transcriptInput: {
    flex: 1,
    minHeight: 220,
    fontSize: 16,
    lineHeight: 22,
    color: '#2C3E50',
    padding: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E8ED',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  actionBtn: {
    minWidth: 92,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionSpeakText: {
    color: Palette.accent,
    fontSize: 16,
    fontWeight: '500',
  },
  actionSpeakTextActive: {
    fontWeight: '700',
  },
  actionClearText: {
    color: Palette.danger,
    fontSize: 16,
    fontWeight: '500',
  },
  bottomSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 18,
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
  previewBox: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    marginBottom: 14,
  },
  previewText: {
    fontSize: 15,
    color: '#2C3E50',
    lineHeight: 20,
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
