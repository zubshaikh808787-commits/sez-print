import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { AppIcon } from '@/components/app-icon';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Pressable, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelPreview } from '@/components/label-preview';
import { Spacing } from '@/constants/theme';
import { Palette, Type } from '@/constants/ui';
import { useLabelStore } from '@/stores/label-store';

const CAPTURE_WIDTH = 720;

function ShareOption({
  icon,
  label,
  color,
  onPress,
}: {
  icon: 'square.grid.2x2' | 'photo';
  label: string;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={[styles.optionIcon, { backgroundColor: color }]}>
        <AppIcon name={icon} tintColor="#FFFFFF" size={30} pointerEvents="none" />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ShareModal() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ labelId?: string }>();
  const documents = useLabelStore((s) => s.documents);
  const shotRef = useRef<ViewShot>(null);
  const [busy, setBusy] = useState(false);

  const doc = useMemo(() => {
    if (params.labelId) return documents.find((d) => d.id === params.labelId) ?? null;
    return documents.length > 0
      ? [...documents].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null;
  }, [params.labelId, documents]);

  const safeName = (doc?.name ?? 'label').replace(/[^a-zA-Z0-9-_]+/g, '_');

  const ensureSharingAvailable = async () => {
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
      Alert.alert('Unavailable', 'Sharing is not available on this platform.');
      return false;
    }
    return true;
  };

  const handleShareTemplate = async () => {
    if (!doc || busy) return;
    if (!(await ensureSharingAvailable())) return;
    setBusy(true);
    try {
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.sezlabel.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(doc, null, 2));
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: `Share template "${doc.name}"`,
      });
      router.back();
    } catch (error) {
      Alert.alert('Share Failed', error instanceof Error ? error.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  const handleShareImage = async () => {
    if (!doc || busy) return;
    if (!(await ensureSharingAvailable())) return;
    setBusy(true);
    try {
      const capture = shotRef.current?.capture;
      if (!capture) throw new Error('Could not render the label image.');
      const uri = await capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Share "${doc.name}"`,
      });
      router.back();
    } catch (error) {
      Alert.alert('Share Failed', error instanceof Error ? error.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      {/* Off-screen render target for image capture */}
      {doc ? (
        <View style={styles.captureHost} pointerEvents="none">
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
            <LabelPreview document={doc} width={CAPTURE_WIDTH} />
          </ViewShot>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {doc
              ? `Share "${doc.name}"`
              : 'No label to share — save a label first'}
          </Text>
          <View style={styles.divider} />

          {doc ? (
            <View style={styles.options}>
              <ShareOption
                icon="square.grid.2x2"
                label="Share Template"
                color="#3498DB"
                onPress={() => void handleShareTemplate()}
              />
              <ShareOption
                icon="photo"
                label="Share Image"
                color="#8BC34A"
                onPress={() => void handleShareImage()}
              />
            </View>
          ) : (
            <Text style={styles.emptyHint}>
              Create and save a label in the editor, then come back here to share it.
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  captureHost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: -999,
    opacity: 1,
    pointerEvents: 'none',
  },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
    color: '#8E97A1',
    ...Type.modalTitle,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E6EA',
    marginHorizontal: 16,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 22,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  option: {
    alignItems: 'center',
    width: 120,
    gap: 10,
  },
  optionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    ...Type.caption,
    fontSize: 13,
    color: Palette.ink,
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
    color: '#8E97A1',
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  cancelBtn: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...Type.modalAction,
    color: '#007AFF',
  },
  pressed: {
    opacity: 0.65,
  },
});
