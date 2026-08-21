import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { Palette, Type } from '@/constants/ui';

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
        <SymbolView name={icon} tintColor="#FFFFFF" size={30} pointerEvents="none" />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ShareModal() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Please select the mode of sharing</Text>
          <View style={styles.divider} />

          <View style={styles.options}>
            <ShareOption
              icon="square.grid.2x2"
              label="Share Template"
              color="#3498DB"
              onPress={() => router.back()}
            />
            <ShareOption
              icon="photo"
              label="Share Image"
              color="#8BC34A"
              onPress={() => router.back()}
            />
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
