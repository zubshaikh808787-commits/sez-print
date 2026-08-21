import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette, Type } from '@/constants/ui';

type IconName = SymbolViewProps['name'];

const TOOLBAR: { icon: IconName; label: string; active?: boolean; disabled?: boolean }[] = [
  { icon: 'gearshape', label: 'Label' },
  { icon: 'checkmark.square.fill', label: 'Multiple', active: true },
  { icon: 'arrow.uturn.backward', label: 'Undo', disabled: true },
  { icon: 'arrow.uturn.forward', label: 'Redo', disabled: true },
  { icon: 'lock', label: 'Lock' },
  { icon: 'lock.open', label: 'Unlock' },
];

const TOOLS: { icon: IconName; label: string }[] = [
  { icon: 'textformat', label: 'Text' },
  { icon: 'barcode', label: 'Barcode' },
  { icon: 'qrcode', label: 'QRCode' },
  { icon: 'photo', label: 'Image' },
  { icon: 'photo.artframe', label: 'Clipart' },
  { icon: 'line.diagonal', label: 'Line' },
  { icon: 'square.on.circle', label: 'Shapes' },
  { icon: 'tablecells', label: 'Table' },
  { icon: 'clock', label: 'Time' },
  { icon: 'character', label: 'ArcText' },
  { icon: 'list.number', label: 'Degrees' },
  { icon: 'tablecells.badge.ellipsis', label: 'Excel' },
  { icon: 'viewfinder', label: 'Scan' },
  { icon: 'eye', label: 'OCR' },
  { icon: 'mic', label: 'ASR' },
  { icon: 'square.on.square', label: 'Label Clone' },
  { icon: 'square.dashed', label: 'Border' },
  { icon: 'signature', label: 'Signature' },
];

function HeaderAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor="#FFFFFF" size={22} />
      <Text numberOfLines={1} style={styles.headerActionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoundIcon({ icon, active }: { icon: IconName; active?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.roundIcon,
        active && styles.roundIconActive,
        pressed && styles.pressed,
      ]}>
      <SymbolView name={icon} tintColor={active ? '#FFFFFF' : Palette.muted} size={20} />
    </Pressable>
  );
}

function ToolbarItem({
  icon,
  label,
  active,
  disabled,
  withDivider,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  withDivider?: boolean;
}) {
  const color = disabled ? Palette.disabled : active ? Palette.accent : Palette.ink;
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.toolbarItem,
        withDivider && styles.toolbarDivider,
        pressed && !disabled && styles.pressed,
      ]}>
      <SymbolView name={icon} tintColor={active ? Palette.accent : color} size={22} />
      <Text numberOfLines={1} style={[styles.toolbarLabel, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolItem({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.toolItem, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor={Palette.accent} size={26} />
      <Text numberOfLines={1} style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function EditScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={24} />
        </Pressable>

        <View style={styles.headerActions}>
          <HeaderAction icon="ellipsis" label="More" />
          <HeaderAction icon="square.and.arrow.down" label="Save As" />
          <HeaderAction icon="tray.and.arrow.down" label="Save" />
          <HeaderAction icon="printer" label="Print" onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.four },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <View style={styles.subToolbar}>
            <View style={styles.roundGroup}>
              <RoundIcon icon="tablecells" />
              <RoundIcon icon="doc.richtext" />
              <RoundIcon icon="square.on.square" active />
              <RoundIcon icon="crop" />
            </View>
            <View style={styles.dims}>
              <Text style={styles.dimText}>Label Width: 30</Text>
              <Text style={styles.dimText}>Label Height: 15</Text>
            </View>
          </View>

          <View style={styles.canvasWrap}>
            <View style={styles.canvas}>
              <View style={[styles.blob, styles.blobTopLeft]} />
              <View style={[styles.blob, styles.blobTopRight]} />
              <View style={[styles.blob, styles.blobCenter]} />
              <Text style={[styles.star, styles.starOne]}>✦</Text>
              <Text style={[styles.star, styles.starTwo]}>✦</Text>
            </View>
          </View>

          <View style={styles.sheet}>
            <View style={styles.toolbarRow}>
              {TOOLBAR.map((t) => (
                <ToolbarItem key={t.label} {...t} />
              ))}
              <ToolbarItem icon="arrow.up.and.down" label="Drag" withDivider />
            </View>

            <View style={styles.toolsGrid}>
              {TOOLS.map((t) => (
                <ToolItem key={t.label} {...t} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
  },
  header: {
    backgroundColor: Palette.header,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  backBtn: {
    paddingBottom: Spacing.one,
    paddingRight: Spacing.two,
  },
  headerActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: Spacing.four,
  },
  headerAction: {
    alignItems: 'center',
    gap: Spacing.half,
    minWidth: 40,
  },
  headerActionLabel: {
    color: '#FFFFFF',
    ...Type.caption,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  subToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  roundGroup: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexShrink: 1,
  },
  roundIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  roundIconActive: {
    backgroundColor: Palette.accent,
  },
  dims: {
    alignItems: 'flex-end',
  },
  dimText: {
    color: Palette.muted,
    ...Type.caption,
    fontSize: 13,
  },
  canvasWrap: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  canvas: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: Spacing.two,
    backgroundColor: Palette.preview,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
    borderRadius: 999,
  },
  blobTopLeft: {
    width: '14%',
    aspectRatio: 1,
    top: '18%',
    left: '7%',
  },
  blobTopRight: {
    width: '12%',
    aspectRatio: 1,
    top: '16%',
    right: '14%',
  },
  blobCenter: {
    width: '15%',
    aspectRatio: 1,
    top: '48%',
    left: '42%',
  },
  star: {
    position: 'absolute',
    color: '#FFFFFF',
    fontSize: 16,
  },
  starOne: {
    right: '28%',
    top: '42%',
  },
  starTwo: {
    left: '18%',
    top: '72%',
  },
  sheet: {
    backgroundColor: Palette.card,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.three,
    ...cardShadow,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  toolbarItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  toolbarDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairline,
  },
  toolbarLabel: {
    ...Type.caption,
    fontSize: 11,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: Spacing.three,
  },
  toolItem: {
    width: '20%',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  toolLabel: {
    ...Type.action,
    color: Palette.ink,
  },
  pressed: {
    opacity: 0.6,
  },
});
