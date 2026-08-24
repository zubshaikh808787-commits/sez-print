import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { cardShadow, Palette } from '@/constants/ui';

type IconName = SymbolViewProps['name'];

type LabelSettingsMenuProps = {
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onShare?: () => void;
  onUpload?: () => void;
};

export function LabelSettingsMenu({
  visible,
  topOffset,
  onClose,
  onOpen,
  onSave,
  onSaveAs,
  onShare,
  onUpload,
}: LabelSettingsMenuProps) {
  const MENU_ITEMS: { label: string; icon: IconName; onPress?: () => void }[] = [
    {
      label: 'Label Settings',
      icon: 'hexagon',
      onPress: () => router.push('/default-property-settings'),
    },
    {
      label: 'Editing Settings',
      icon: 'square.and.pencil',
      onPress: () => router.push('/editing-settings'),
    },
    {
      label: 'New',
      icon: 'plus.square',
      onPress: () => router.push('/new-label-setup'),
    },
    {
      label: 'Open',
      icon: 'folder',
      onPress: onOpen ?? (() => Alert.alert('Open', 'Open a saved label file.')),
    },
    {
      label: 'Save',
      icon: 'tray.and.arrow.down',
      onPress: onSave ?? (() => Alert.alert('Save', 'Label saved.')),
    },
    {
      label: 'Save As',
      icon: 'square.and.arrow.down.on.square',
      onPress: onSaveAs ?? (() => Alert.alert('Save As', 'Save label with a new name.')),
    },
    {
      label: 'Share',
      icon: 'square.and.arrow.up',
      onPress: onShare ?? (() => router.push('/share')),
    },
    {
      label: 'Upload',
      icon: 'icloud.and.arrow.up',
      onPress: onUpload ?? (() => Alert.alert('Upload', 'Upload label to cloud.')),
    },
  ];

  const { width } = useWindowDimensions();
  const menuWidth = Math.min(Math.max(width * 0.46, 200), 260);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.menu,
          {
            top: topOffset,
            width: menuWidth,
          },
        ]}>
        {MENU_ITEMS.map((item, index) => (
          <Pressable
            key={item.label}
            onPress={() => {
              onClose();
              item.onPress?.();
            }}
            style={({ pressed }) => [
              styles.menuRow,
              index < MENU_ITEMS.length - 1 && styles.menuRowBorder,
              pressed && styles.pressed,
            ]}>
            <View style={styles.menuIconWrap}>
              <SymbolView name={item.icon} tintColor="#556473" size={20} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** @deprecated Use LabelSettingsMenu */
export const MoreMenu = LabelSettingsMenu;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  menu: {
    position: 'absolute',
    left: 0,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 46,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEF',
  },
  menuIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
  },
  pressed: {
    opacity: 0.65,
  },
});
