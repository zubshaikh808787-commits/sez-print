import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, Palette } from '@/constants/ui';

export function SettingsStackHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
        <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  spacer: {
    width: 36,
  },
  pressed: {
    opacity: 0.65,
  },
});
