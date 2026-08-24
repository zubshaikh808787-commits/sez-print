import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipartTile } from '@/components/clipart-tile';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import {
  CLIPART_PILLS,
  CLIPART_SIDEBAR,
  allClipartCount,
  getClipartSections,
  type ClipartItem,
  type ClipartPill,
  type ClipartSidebar,
} from '@/constants/clipart-library';
import { editorBridge } from '@/constants/editor-bridge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';

export default function ClipartScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';

  const handleSelect = (item: ClipartItem) => {
    editorBridge.clipartResult = {
      id: item.id,
    };
    if (fromEdit) {
      router.back();
      return;
    }
    router.push('/edit');
  };
  const [selectedPill, setSelectedPill] = useState<ClipartPill>('Animal');
  const [selectedSidebar, setSelectedSidebar] = useState<ClipartSidebar>('Commercial Retail');

  const layoutWidth = Math.min(width, MaxContentWidth);
  const tileWidth = Math.floor((layoutWidth - 112 - Spacing.three * 2 - 8) / 3);

  const sections = useMemo(
    () => getClipartSections(selectedSidebar, selectedPill),
    [selectedSidebar, selectedPill]
  );

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Clipart" />

      <View style={[styles.topBar, { width: layoutWidth }]}>
        <Text style={styles.cartoonTab}>B&W Stickers · {allClipartCount()} icons</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {CLIPART_PILLS.map((pill) => {
            const active = pill === selectedPill;
            return (
              <Pressable
                key={pill}
                onPress={() => setSelectedPill(pill)}
                style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {pill}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.body, { width: layoutWidth }]}>
        <View style={styles.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {CLIPART_SIDEBAR.map((item) => {
              const active = item === selectedSidebar;
              return (
                <Pressable
                  key={item}
                  onPress={() => setSelectedSidebar(item)}
                  style={[styles.sidebarItem, active && styles.sidebarItemActive]}>
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[styles.sidebarText, active && styles.sidebarTextActive]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.three }}
          showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.grid}>
                {section.icons.map((icon) => (
                  <Pressable
                    key={icon.id}
                    style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.6 }]}
                    onPress={() => handleSelect(icon)}>
                    <ClipartTile item={icon} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E6EC',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  cartoonTab: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.accent,
    marginBottom: Spacing.two,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: Palette.accent,
    alignSelf: 'flex-start',
    marginLeft: Spacing.one,
  },
  pillRow: {
    gap: 8,
    paddingHorizontal: Spacing.one,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#EEF1F5',
  },
  pillActive: {
    backgroundColor: Palette.accent,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556473',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 108,
    backgroundColor: '#F5F7FA',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E2E6EC',
  },
  sidebarItem: {
    minHeight: 42,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemActive: {
    backgroundColor: '#FFFFFF',
  },
  sidebarText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#556473',
    textAlign: 'center',
  },
  sidebarTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  section: {
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.two,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97A4',
    marginBottom: Spacing.one,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
