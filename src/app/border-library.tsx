import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderPreview } from '@/components/border-preview';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { BORDER_CATEGORIES, BORDER_LIBRARY } from '@/constants/border-library';
import { editorBridge } from '@/constants/editor-bridge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, cardShadow } from '@/constants/ui';

export default function BorderLibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const [selectedId, setSelectedId] = useState(BORDER_LIBRARY[0].id);
  const [category, setCategory] = useState<(typeof BORDER_CATEGORIES)[number]>('All');

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);
  const tileWidth = Math.floor((contentWidth - Spacing.two) / 2);

  const filteredBorders = useMemo(() => {
    if (category === 'All') return BORDER_LIBRARY;
    return BORDER_LIBRARY.filter((item) => item.category === category);
  }, [category]);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Border" />

      {!fromEdit ? (
        <Text style={[styles.browseHint, { width: contentWidth }]}>
          Browsing borders. To apply one, open Border from the editor toolbar.
        </Text>
      ) : null}

      <View style={[styles.chipRow, { width: contentWidth }]}>
        {BORDER_CATEGORIES.map((item) => {
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
        data={filteredBorders}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: Spacing.two, justifyContent: 'center' }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          alignItems: 'center',
          gap: Spacing.two,
        }}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              onPress={() => {
                setSelectedId(item.id);
                if (fromEdit) {
                  editorBridge.borderResult = item.id;
                  router.back();
                }
              }}
              style={({ pressed }) => [
                styles.card,
                { width: tileWidth },
                active && styles.cardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.previewBox}>
                <BorderPreview styleId={item.id} />
              </View>
              <Text style={styles.borderName}>{item.name}</Text>
              <Text style={styles.borderCategory}>{item.category}</Text>
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
    padding: Spacing.two,
    ...cardShadow,
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: Palette.accent,
  },
  previewBox: {
    height: 88,
    backgroundColor: '#EEF1F5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  borderName: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.ink,
  },
  borderCategory: {
    marginTop: 2,
    fontSize: 11,
    color: Palette.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});
