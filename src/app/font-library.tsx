import {
  Inter_400Regular,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { Lato_400Regular } from '@expo-google-fonts/lato';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat';
import { NotoSansBengali_400Regular } from '@expo-google-fonts/noto-sans-bengali';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari';
import { NotoSansGujarati_400Regular } from '@expo-google-fonts/noto-sans-gujarati';
import { NotoSansGurmukhi_400Regular } from '@expo-google-fonts/noto-sans-gurmukhi';
import { NotoSansKannada_400Regular } from '@expo-google-fonts/noto-sans-kannada';
import { NotoSansMalayalam_400Regular } from '@expo-google-fonts/noto-sans-malayalam';
import { NotoSansTamil_400Regular } from '@expo-google-fonts/noto-sans-tamil';
import { NotoSansTelugu_400Regular } from '@expo-google-fonts/noto-sans-telugu';
import { OpenSans_400Regular } from '@expo-google-fonts/open-sans';
import { Oswald_500Medium } from '@expo-google-fonts/oswald';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { Roboto_400Regular } from '@expo-google-fonts/roboto';
import { useFonts } from 'expo-font';
import { router, useLocalSearchParams } from 'expo-router';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { editorBridge } from '@/constants/editor-bridge';
import { FONT_CATEGORIES, FONT_LIBRARY } from '@/constants/font-library';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, cardShadow } from '@/constants/ui';

export default function FontLibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const [selectedId, setSelectedId] = useState('system');
  const [category, setCategory] = useState<(typeof FONT_CATEGORIES)[number]>('All');

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Roboto_400Regular,
    OpenSans_400Regular,
    Lato_400Regular,
    Montserrat_600SemiBold,
    PlayfairDisplay_700Bold,
    Oswald_500Medium,
    NotoSansDevanagari_400Regular,
    NotoSansTamil_400Regular,
    NotoSansBengali_400Regular,
    NotoSansTelugu_400Regular,
    NotoSansKannada_400Regular,
    NotoSansMalayalam_400Regular,
    NotoSansGujarati_400Regular,
    NotoSansGurmukhi_400Regular,
  });

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
          Browsing fonts. To apply one, select a text element in the editor and open Font from its
          properties.
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
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {item}
              </Text>
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
          alignItems: 'center',
        }}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
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
                { width: contentWidth },
                active && styles.cardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.cardHead}>
                <Text style={styles.fontName}>{item.name}</Text>
                <Text style={styles.fontCategory}>{item.category}</Text>
              </View>
              <Text
                style={[
                  styles.sample,
                  item.family ? { fontFamily: item.family } : null,
                ]}>
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
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseHint: {
    color: Palette.muted,
    fontSize: 12.5,
    lineHeight: 17,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#E8ECF1',
  },
  chipActive: {
    backgroundColor: Palette.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556473',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    marginBottom: Spacing.two,
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
    fontWeight: '700',
    color: Palette.ink,
  },
  fontCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.muted,
  },
  sample: {
    fontSize: 16,
    color: '#1E293B',
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.7,
  },
});
