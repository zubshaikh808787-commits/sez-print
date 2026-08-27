import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { editorBridge } from '@/constants/editor-bridge';
import { FONT_CATEGORIES, FONT_LIBRARY } from '@/constants/font-library';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, cardShadow } from '@/constants/ui';
import { useFonts } from 'expo-font';
import { APP_FONT_MAP } from '@/lib/app-fonts';

export default function FontLibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const [selectedId, setSelectedId] = useState('system');
  const [category, setCategory] = useState<(typeof FONT_CATEGORIES)[number]>('All');

  // Fonts are also loaded in root layout; keep a local hook so previews are ready if root is slow.
  const [fontsLoaded] = useFonts(APP_FONT_MAP);

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  const filteredFonts = useMemo(() => {
    if (category === 'All') return FONT_LIBRARY;
    return FONT_LIBRARY.filter((font) => font.category === category);
  }, [category]);

  if (!fontsLoaded) {
    return (
      <View style={styles.root}>
        <SettingsStackHeader title="Font" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Font" />

      {!fromEdit ? (
        <Text style={[styles.browseHint, { width: contentWidth }]}>
          Browse fonts below. Open Font from a text element in the editor to apply one.
        </Text>
      ) : null}

      <View style={[styles.chipRow, { width: contentWidth }]}>
        {FONT_CATEGORIES.map((item) => {
          const active = item === category;
          return (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filteredFonts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          width: contentWidth,
          alignSelf: 'center',
          gap: Spacing.two,
        }}
        renderItem={({ item }) => {
          const active = selectedId === item.id;
          return (
            <Pressable
              onPress={() => {
                setSelectedId(item.id);
                if (fromEdit) {
                  editorBridge.fontResult = item.name;
                  router.back();
                }
              }}
              style={({ pressed }) => [
                styles.card,
                active && styles.cardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.cardHead}>
                <Text style={styles.fontName}>{item.name}</Text>
                <Text style={styles.fontCategory}>{item.category}</Text>
              </View>
              <Text style={[styles.sample, item.family ? { fontFamily: item.family } : null]}>
                {item.sample}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  browseHint: {
    alignSelf: 'center',
    color: Palette.muted,
    fontSize: 13,
    fontWeight: '400',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    lineHeight: 18,
  },
  chipRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  chip: {
    backgroundColor: '#E8ECF1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: Palette.accent },
  chipText: { fontSize: 12, fontWeight: '500', color: Palette.ink },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    ...cardShadow,
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: Palette.accent,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fontName: {
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  fontCategory: {
    fontSize: 11,
    fontWeight: '500',
    color: Palette.muted,
  },
  sample: {
    fontSize: 16,
    color: '#1E293B',
    lineHeight: 22,
    fontWeight: '400',
  },
  pressed: {
    opacity: 0.7,
  },
});
