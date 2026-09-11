/**
 * Phase 8 — Skia prototype (artboard + one image).
 *
 * Production `/edit` stays on RN Views. This screen draws the photo with
 * `@shopify/react-native-skia` and reuses Phase 5 `boundBoxMm` for the two
 * edge handles. Compare FPS here vs `/edit` before any full migration.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { SkiaImageArtboard } from '@/components/editor/skia-image-artboard';
import { Palette } from '@/constants/ui';
import { Spacing } from '@/constants/theme';
import { compareRendererFps, PRODUCTION_RENDERER } from '@/lib/editor/skia-prototype';
import type { MmBox } from '@/lib/editor/resize-policy';

const PHOTO = require('../../assets/images/home/import.jpg');

const STOCK = [
  { label: '50×30', widthMm: 50, heightMm: 30 },
  { label: 'Jewelry 54×96', widthMm: 54, heightMm: 96 },
  { label: 'Cable 50×73', widthMm: 50, heightMm: 73 },
] as const;

const START: MmBox = { left: 4, top: 6, width: 20, height: 10 };

export default function CanvasSkiaPrototypeScreen() {
  const insets = useSafeAreaInsets();
  const [stockIndex, setStockIndex] = useState(0);
  const [image, setImage] = useState<MmBox>(START);
  const stock = STOCK[stockIndex];
  const pxPerMm = useMemo(() => {
    const maxW = 320;
    const maxH = 280;
    return Math.min(maxW / stock.widthMm, maxH / stock.heightMm);
  }, [stock.heightMm, stock.widthMm]);

  const gate = compareRendererFps({ rnViewFps: null, skiaFps: null });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <AppIcon name="chevron.left" size={24} tintColor="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Skia prototype</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lede}>
          Artboard + one image on Skia. Production editor is still{' '}
          <Text style={styles.mono}>{PRODUCTION_RENDERER}</Text>. Rebuild the dev client after
          adding Skia, then compare Perf Monitor FPS here against a busy `/edit` label.
        </Text>
        <View style={styles.chips}>
          {STOCK.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => {
                setStockIndex(index);
                setImage(START);
              }}
              style={[styles.chip, index === stockIndex && styles.chipOn]}>
              <Text style={[styles.chipText, index === stockIndex && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.stage}>
          <SkiaImageArtboard
            widthMm={stock.widthMm}
            heightMm={stock.heightMm}
            pxPerMm={pxPerMm}
            image={image}
            onImageChange={setImage}
            imageSource={PHOTO}
          />
        </View>
        <Text style={styles.mm}>
          Image {image.width.toFixed(2)}×{image.height.toFixed(2)} mm at ({image.left.toFixed(2)},{' '}
          {image.top.toFixed(2)}) · label {stock.widthMm}×{stock.heightMm} mm
        </Text>
        <Text style={styles.note}>{gate.reason}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  body: { padding: Spacing.three, paddingBottom: 40, gap: Spacing.two },
  lede: { color: Palette.ink, fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: 'monospace', color: Palette.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Palette.card,
  },
  chipOn: { borderColor: Palette.accent, backgroundColor: 'rgba(23,166,184,0.08)' },
  chipText: { color: Palette.ink, fontSize: 13 },
  chipTextOn: { color: Palette.accent, fontWeight: '600' },
  stage: { alignItems: 'center', paddingVertical: Spacing.two },
  mm: { color: Palette.muted, fontSize: 12 },
  note: { color: Palette.actionText, fontSize: 13, lineHeight: 18 },
});
