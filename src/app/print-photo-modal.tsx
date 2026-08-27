import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrintDirectlyIcon, UseFrameIcon } from '@/components/home-icons';
import { Palette, Type } from '@/constants/ui';

export default function PrintPhotoModal() {
  const insets = useSafeAreaInsets();

  const handleUseFrame = () => {
    router.replace('/photo-frames');
  };

  const handlePrintDirectly = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.95,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        router.replace({
          pathname: '/print-photo',
          params: {
            mode: 'direct',
            imageUri: asset.uri,
          },
        });
      }
    } catch {
      Alert.alert('Notice', 'Unable to open photo library.');
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Please select print mode</Text>
          <View style={styles.divider} />

          <View style={styles.options}>
            <Pressable
              onPress={handleUseFrame}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconContainer}>
                <UseFrameIcon color="#214668" size={38} />
              </View>
              <Text style={styles.optionLabel}>Use frame</Text>
            </Pressable>

            <Pressable
              onPress={() => void handlePrintDirectly()}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconContainer}>
                <PrintDirectlyIcon color="#17A6B8" size={38} />
              </View>
              <Text style={styles.optionLabel}>Print directly</Text>
            </Pressable>
          </View>
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
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    ...Type.caption,
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    textAlign: 'center',
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
