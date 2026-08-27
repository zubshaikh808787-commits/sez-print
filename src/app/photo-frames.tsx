import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoFramePreview } from '@/components/photo-frame-preview';
import { PHOTO_FRAMES } from '@/constants/photo-frames';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, cardShadow } from '@/constants/ui';

export default function PhotoFramesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');

  const contentWidth = Math.min(width, MaxContentWidth);
  const cardWidth = Math.min(contentWidth - 24, 400);
  const previewWidth = Math.min(cardWidth - 48, 220);

  const frames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHOTO_FRAMES;
    return PHOTO_FRAMES.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        `${f.widthMm}x${f.heightMm}`.includes(q.replace(/\s/g, '')),
    );
  }, [query]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <View style={styles.searchPill}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Template"
            placeholderTextColor="#8EA9C2"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          <AppIcon name="magnifyingglass" tintColor="#214668" size={16} />
        </View>
      </View>

      <FlatList
        data={frames}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 14,
          paddingBottom: insets.bottom + 24,
          alignItems: 'center',
          gap: 14,
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/print-photo',
                params: { mode: 'frame', frameId: item.id },
              })
            }
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth },
              pressed && styles.pressed,
            ]}>
            <View style={styles.cardHeader}>
              <Text numberOfLines={1} style={styles.cardTitle}>
                {item.name}
              </Text>
              <Text style={styles.cardDims}>
                {item.widthMm} x {item.heightMm}
              </Text>
            </View>
            <View style={styles.previewWrap}>
              <PhotoFramePreview frame={item} width={previewWidth} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No frames match your search.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EFF2F7' },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 4 },
  searchPill: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: Palette.ink,
    paddingVertical: 0,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  cardHeader: {
    backgroundColor: '#20A4B8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  cardDims: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  previewWrap: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  empty: {
    marginTop: 40,
    textAlign: 'center',
    color: Palette.muted,
    fontSize: 14,
    fontWeight: '400',
  },
  pressed: { opacity: 0.85 },
});
