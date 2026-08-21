import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, Type } from '@/constants/ui';

const TABS = ['All', 'Excel', 'PDF', 'CSV', 'Remote Data'] as const;

function EmptyIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={styles.boxBack} />
      <View style={styles.boxFront} />
      <View style={styles.boxFlapLeft} />
      <View style={styles.boxFlapRight} />
      <View style={styles.plane}>
        <View style={styles.planeBody} />
        <View style={styles.planeWing} />
      </View>
      <View style={styles.trail}>
        <View style={[styles.trailDot, { opacity: 0.35 }]} />
        <View style={[styles.trailDot, { opacity: 0.55 }]} />
        <View style={[styles.trailDot, { opacity: 0.75 }]} />
      </View>
    </View>
  );
}

export default function DataFileScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('All');

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <Text style={styles.headerTitle}>Data File</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {tab}
              </Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorSpacer} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        <View style={styles.emptyWrap}>
          <EmptyIllustration />
          <Text style={styles.emptyText}>No data file was found</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}>
          <Text style={styles.importBtnText}>Import File</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
  },
  headerSpacer: {
    width: 36,
  },
  tabBar: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
  },
  tabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tabIndicator: {
    marginTop: 8,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  tabIndicatorSpacer: {
    marginTop: 8,
    height: 3,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 28,
    maxWidth: MaxContentWidth,
  },
  illustration: {
    width: 160,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxBack: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#B8DDF5',
    borderRadius: 4,
  },
  boxFront: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#9ECAE8',
    borderTopWidth: 2,
    borderTopColor: '#7FB8DC',
    borderRadius: 4,
  },
  boxFlapLeft: {
    position: 'absolute',
    bottom: 68,
    left: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '-24deg' }],
    borderTopLeftRadius: 3,
  },
  boxFlapRight: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '24deg' }],
    borderTopRightRadius: 3,
  },
  plane: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 34,
    height: 34,
    transform: [{ rotate: '-18deg' }],
  },
  planeBody: {
    position: 'absolute',
    top: 14,
    left: 0,
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  planeWing: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#8EC5E8',
  },
  trail: {
    position: 'absolute',
    top: 24,
    right: 52,
    flexDirection: 'row',
    gap: 5,
    transform: [{ rotate: '-18deg' }],
  },
  trailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  emptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: Spacing.two,
    backgroundColor: '#F4F5F7',
  },
  importBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  importBtnText: {
    color: '#FFFFFF',
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
});
