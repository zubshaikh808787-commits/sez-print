import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { DRAWING_COLORS } from '@/components/editor/types';
import { editorBridge } from '@/constants/editor-bridge';
import { patchLabelDocument } from '@/lib/label-settings';
import { useLabelStore } from '@/stores/label-store';

export default function DrawingColorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ labelId?: string | string[]; selected?: string | string[] }>();
  const labelId = Array.isArray(params.labelId) ? params.labelId[0] : params.labelId;
  const selectedParam = Array.isArray(params.selected) ? params.selected[0] : params.selected;
  const selectedIndex = Math.max(0, Math.min(DRAWING_COLORS.length - 1, parseInt(selectedParam ?? '1', 10) || 1));

  const getDocument = useLabelStore((s) => s.getDocument);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const pickColor = useCallback(
    (index: number) => {
      if (!labelId) return;
      const doc = getDocument(labelId) ?? editorBridge.labelSettingsDoc;
      if (!doc) return;
      const next = patchLabelDocument(doc, { settings: { defaultDrawingColorIndex: index } });
      upsertDocument(next);
      editorBridge.labelSettingsDoc = next;
      router.back();
    },
    [getDocument, labelId, upsertDocument],
  );

  useFocusEffect(
    useCallback(() => {
      if (!labelId) return;
      const doc = getDocument(labelId);
      if (doc) editorBridge.labelSettingsDoc = doc;
    }, [getDocument, labelId]),
  );

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="WePrint" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}>
        {DRAWING_COLORS.map((color, index) => {
          const active = index === selectedIndex;
          return (
            <Pressable
              key={`${color}-${index}`}
              onPress={() => pickColor(index)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                color === '#FFFFFF' && styles.swatchWhite,
                active && styles.swatchActive,
              ]}>
              {active ? <Text style={styles.swatchCheck}>✓</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF1F5',
  },
  swatch: {
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchWhite: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: '#48C3C7',
  },
  swatchCheck: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
