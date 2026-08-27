import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

export type AppIconName = string;

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const ION: Record<string, IoniconsName> = {
  'align.horizontal.center': 'swap-horizontal-outline',
  'align.vertical.bottom': 'arrow-down-outline',
  'align.vertical.center': 'swap-vertical-outline',
  'align.vertical.top': 'arrow-up-outline',
  'antenna.radiowaves.left.and.right': 'wifi-outline',
  'arrow.clockwise': 'refresh-outline',
  'arrow.down': 'arrow-down-outline',
  'arrow.down.right.and.arrow.up.left': 'scan-outline',
  'arrow.left.and.right': 'swap-horizontal-outline',
  'arrow.left.to.line': 'arrow-back-outline',
  'arrow.right.to.line': 'arrow-forward-outline',
  'arrow.up': 'arrow-up-outline',
  'arrow.up.and.down': 'swap-vertical-outline',
  'arrow.up.left.and.arrow.down.right': 'expand-outline',
  'arrow.up.right.square': 'open-outline',
  'arrow.uturn.backward': 'arrow-undo-outline',
  'arrow.uturn.forward': 'arrow-redo-outline',
  'arrowtriangle.down.fill': 'chevron-down',
  'arrowtriangle.left.fill': 'chevron-back',
  'arrowtriangle.right.fill': 'chevron-forward',
  'arrowtriangle.up.fill': 'chevron-up',
  barcode: 'barcode-outline',
  'barcode.viewfinder': 'barcode-outline',
  character: 'text-outline',
  checkmark: 'checkmark',
  'checkmark.square': 'checkbox-outline',
  'chevron.left': 'chevron-back',
  'chevron.right': 'chevron-forward',
  clock: 'time-outline',
  'clock.arrow.circlepath': 'time-outline',
  'doc.text': 'document-text-outline',
  eye: 'eye-outline',
  folder: 'folder-outline',
  'flashlight.off.fill': 'flash-outline',
  'flashlight.on.fill': 'flash',
  gearshape: 'settings-outline',
  'gearshape.fill': 'settings',
  globe: 'globe-outline',
  hexagon: 'stop-outline',
  'house.fill': 'home',
  'icloud.and.arrow.up': 'cloud-upload-outline',
  'info.circle': 'information-circle-outline',
  'line.diagonal': 'remove-outline',
  link: 'link-outline',
  'list.number': 'list-outline',
  'lock.fill': 'lock-closed',
  lock: 'lock-closed-outline',
  'lock.open': 'lock-open-outline',
  magnifyingglass: 'search-outline',
  mic: 'mic-outline',
  photo: 'image-outline',
  'photo.artframe': 'images-outline',
  'photo.on.rectangle': 'images-outline',
  'plus.circle': 'add-circle-outline',
  'plus.rectangle': 'add-outline',
  'plus.square': 'add-square-outline',
  printer: 'print-outline',
  'printer.fill': 'print',
  qrcode: 'qr-code-outline',
  'qrcode.viewfinder': 'qr-code-outline',
  'questionmark.circle.fill': 'help-circle',
  'rectangle.dashed': 'crop-outline',
  signature: 'pencil-outline',
  'slider.horizontal.3': 'options-outline',
  'square.and.arrow.down.on.square': 'download-outline',
  'square.and.arrow.up': 'share-outline',
  'square.and.pencil': 'create-outline',
  'square.dashed': 'square-outline',
  'square.grid.2x2': 'grid-outline',
  'square.grid.2x2.fill': 'grid',
  'square.on.circle': 'shapes-outline',
  'square.on.square': 'copy-outline',
  'square.stack.3d.up.fill': 'albums',
  tablecells: 'grid-outline',
  'tablecells.badge.ellipsis': 'grid-outline',
  'text.aligncenter': 'text',
  'text.alignleft': 'text',
  'text.alignright': 'text',
  'text.justify': 'text',
  textformat: 'text-outline',
  'tray.and.arrow.down': 'download-outline',
  'tray.and.arrow.down.fill': 'download',
  trash: 'trash-outline',
  viewfinder: 'scan-outline',
  xmark: 'close-outline',
};

export function AppIcon({
  name,
  tintColor,
  size = 22,
  weight,
  pointerEvents,
  style,
}: {
  name: AppIconName;
  tintColor?: string;
  size?: number;
  weight?: SymbolViewProps['weight'];
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name as SymbolViewProps['name']}
        tintColor={tintColor}
        size={size}
        weight={weight}
        pointerEvents={pointerEvents}
        style={style}
      />
    );
  }

  const glyph = ION[name] ?? 'ellipse-outline';
  return (
    <View
      pointerEvents={pointerEvents ?? 'auto'}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={glyph} size={size} color={tintColor} />
    </View>
  );
}
