import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DocBadgeIcon,
  LabelCloneIcon,
  NewLabelIcon,
  PrintPhotoIcon,
  ScanLabelIcon,
  ShareNodeIcon,
} from '@/components/home-icons';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette, scaleFont } from '@/constants/ui';

type IconName = SymbolViewProps['name'];

function ActionItem({
  icon,
  label,
  disabled,
  href,
  onPress,
  customIcon,
  highlight,
}: {
  icon?: IconName;
  label: string;
  disabled?: boolean;
  href?: string;
  onPress?: () => void;
  customIcon?: React.ReactNode;
  highlight?: boolean;
}) {
  const router = useRouter();
  const color = highlight ? Palette.accent : disabled ? Palette.disabled : Palette.actionText;

  const handlePress = () => {
    if (disabled) return;
    if (href) {
      router.push(href as any);
    } else if (onPress) {
      onPress();
    }
  };

  return (
    <View style={styles.actionItem}>
      <Pressable
        disabled={disabled}
        onPress={handlePress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.actionPressable,
          pressed && !disabled && styles.pressed,
        ]}>
        {customIcon ? (
          customIcon
        ) : icon ? (
          <SymbolView name={icon} tintColor={color} size={23} pointerEvents="none" />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.actionLabel,
            { color: highlight ? Palette.ink : disabled ? Palette.disabled : Palette.actionText },
          ]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const MENU_GAP = 12;
const SCREEN_PAD = 16;
const WIDE_TILE_H = 62;
const SQUARE_TILE_H = 96;

function Tile({
  iconComponent,
  label,
  variant = 'square',
  style,
  href,
  onPress,
}: {
  iconComponent: React.ReactNode;
  label: string;
  variant?: 'wide' | 'square';
  style?: object;
  href?: string;
  onPress?: () => void;
}) {
  const router = useRouter();
  const isWide = variant === 'wide';

  const handlePress = () => {
    if (href) {
      router.push(href as any);
    } else if (onPress) {
      onPress();
    }
  };

  return (
    <View style={[styles.tileOuter, style]}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          isWide ? styles.tileInnerWide : styles.tileInnerSquare,
          pressed && styles.pressed,
        ]}>
        <View style={styles.tileIconWrap}>{iconComponent}</View>
        <Text
          numberOfLines={1}
          style={[styles.tileLabel, isWide && styles.tileLabelWide]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

/** Cute bunny face illustration matching the screenshot preview */
function BunnyIllustration({
  style,
  scale = 1,
  rotation = '0deg',
}: {
  style?: any;
  scale?: number;
  rotation?: string;
}) {
  return (
    <View style={[{ transform: [{ rotate: rotation }] }, style]}>
      {/* Ears */}
      <View style={{ flexDirection: 'row', gap: 2.5 * scale, justifyContent: 'center', marginBottom: -3 * scale }}>
        <View
          style={{
            width: 5.5 * scale,
            height: 13 * scale,
            backgroundColor: '#FFFFFF',
            borderRadius: 3 * scale,
            transform: [{ rotate: '-8deg' }],
          }}
        />
        <View
          style={{
            width: 5.5 * scale,
            height: 13 * scale,
            backgroundColor: '#FFFFFF',
            borderRadius: 3 * scale,
            transform: [{ rotate: '8deg' }],
          }}
        />
      </View>
      {/* Head */}
      <View
        style={{
          width: 25 * scale,
          height: 20 * scale,
          backgroundColor: '#FFFFFF',
          borderRadius: 11 * scale,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
        {/* Eyes & Nose */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * scale, marginTop: 1 * scale }}>
          <View style={{ width: 1.8 * scale, height: 2.5 * scale, borderRadius: 1 * scale, backgroundColor: '#3D2F2D' }} />
          <View style={{ width: 2 * scale, height: 1.4 * scale, borderRadius: 0.7 * scale, backgroundColor: '#3D2F2D' }} />
          <View style={{ width: 1.8 * scale, height: 2.5 * scale, borderRadius: 1 * scale, backgroundColor: '#3D2F2D' }} />
        </View>
        {/* Blush dots */}
        <View
          style={{
            position: 'absolute',
            top: 9 * scale,
            left: 2.5 * scale,
            width: 2.8 * scale,
            height: 1.6 * scale,
            borderRadius: 1 * scale,
            backgroundColor: '#FFAEC0',
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 9 * scale,
            right: 2.5 * scale,
            width: 2.8 * scale,
            height: 1.6 * scale,
            borderRadius: 1 * scale,
            backgroundColor: '#FFAEC0',
          }}
        />
      </View>
    </View>
  );
}

/** Small red bow decoration */
function RibbonBow({ style, scale = 1 }: { style?: any; scale?: number }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      <View
        style={{
          width: 4 * scale,
          height: 4 * scale,
          backgroundColor: '#E84149',
          borderRadius: 1,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View style={{ width: 2 * scale, height: 2 * scale, backgroundColor: '#C82E36', borderRadius: 1 }} />
      <View
        style={{
          width: 4 * scale,
          height: 4 * scale,
          backgroundColor: '#E84149',
          borderRadius: 1,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const contentWidth = Math.min(width - SCREEN_PAD * 2, MaxContentWidth);
  const thirdTileWidth = (contentWidth - MENU_GAP * 2) / 3;

  return (
    <View style={styles.root}>
      {/* Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.connection}>
          <Text numberOfLines={1} style={styles.connectionText}>
            Unconnected
          </Text>
          <SymbolView name="link" tintColor="#FFFFFF" size={15} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: BottomTabInset + Spacing.five },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {/* Main Card */}
          <View style={styles.card}>
            {/* Top Light Gray Inner Section */}
            <View style={styles.cardTopSection}>
              <View style={[styles.cardHead, width < 360 && styles.cardHeadStacked]}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.cardTitle, { fontSize: scaleFont(width, 13.5, 0.85, 1.05) }]}>
                  102-Cartoon-30x15
                </Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    styles.cardSize,
                    width < 360 && styles.cardSizeStacked,
                    { fontSize: scaleFont(width, 13, 0.85, 1.05) },
                  ]}>
                  30 x 15 (Industry)
                </Text>
              </View>

              {/* Pink Label Preview with Bunny Illustrations */}
              <View style={styles.preview}>
                <BunnyIllustration scale={1.15} style={styles.bunnyTopLeft} rotation="-6deg" />
                <BunnyIllustration scale={1.3} style={styles.bunnyCenter} />
                <BunnyIllustration scale={1.1} style={styles.bunnyTopRight} rotation="8deg" />

                <RibbonBow scale={1.3} style={styles.bowCenter} />
                <RibbonBow scale={0.9} style={styles.bowRight} />

                {/* Stars and sparkles */}
                <Text style={styles.starOne}>✦</Text>
                <Text style={styles.starTwo}>✦</Text>
                <Text style={styles.starThree}>✦</Text>

                {/* Bottom party confetti flags */}
                <View style={styles.confettiWrap}>
                  <View style={[styles.confettiTriangle, { borderBottomColor: '#6ED4B8' }]} />
                  <View style={[styles.confettiTriangle, { borderBottomColor: '#FDD26E' }]} />
                  <View style={[styles.confettiTriangle, { borderBottomColor: '#7BB3FC' }]} />
                </View>
              </View>
            </View>

            {/* Bottom White Section: 5 Actions */}
            <View style={styles.actionRow}>
              <ActionItem icon="square.and.pencil" label="Edit" href="/edit" />
              <ActionItem icon="printer" label="Print" href="/print" />
              <ActionItem icon="trash" label="Delete" disabled />
              <ActionItem
                customIcon={<ShareNodeIcon color={Palette.accent} size={24} />}
                label="Share"
                href="/share"
                highlight
              />
              <ActionItem icon="icloud.and.arrow.up" label="Upload" disabled />
            </View>
          </View>

          {/* Menu Grid */}
          <View style={styles.menuSection}>
            {/* Row 1: 2 Wide Buttons */}
            <View style={styles.menuRow}>
              <Tile
                variant="wide"
                style={styles.menuHalf}
                iconComponent={<NewLabelIcon size={26} color={Palette.accent} />}
                label="New Label"
                href="/new-label"
              />
              <Tile
                variant="wide"
                style={styles.menuHalf}
                iconComponent={<ScanLabelIcon size={26} color={Palette.accent} />}
                label="Scan Label"
              />
            </View>

            {/* Row 2: 3 Square Buttons */}
            <View style={styles.menuRow}>
              <Tile
                style={styles.menuThird}
                iconComponent={<DocBadgeIcon badge="EXCEL" size={32} color="#7E8B98" />}
                label="Print Excel"
                href="/data-file"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<DocBadgeIcon badge="PDF" size={32} color="#7E8B98" />}
                label="Print PDF"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<PrintPhotoIcon size={30} color={Palette.accent} />}
                label="Print Photo"
              />
            </View>

            {/* Row 3: 1 Square Button (Label Clone) */}
            <View style={styles.menuRow}>
              <Tile
                style={{ width: thirdTileWidth }}
                iconComponent={<LabelCloneIcon size={30} color={Palette.accent} />}
                label="Label Clone"
              />
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
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six + 6,
    alignItems: 'flex-end',
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.danger,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  connectionText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    marginTop: -(Spacing.six),
  },
  content: {
    paddingHorizontal: SCREEN_PAD,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: MENU_GAP,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    overflow: 'hidden',
    ...cardShadow,
  },
  cardTopSection: {
    backgroundColor: Palette.cardTop,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
  },
  cardHeadStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  cardTitle: {
    color: Palette.ink,
    fontWeight: '500',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  cardSize: {
    color: Palette.ink,
    fontWeight: '500',
    flexShrink: 0,
    maxWidth: '48%',
    textAlign: 'right',
  },
  cardSizeStacked: {
    maxWidth: '100%',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  preview: {
    width: '100%',
    aspectRatio: 2.05,
    borderRadius: 10,
    backgroundColor: Palette.preview,
    overflow: 'hidden',
    position: 'relative',
  },
  bunnyTopLeft: {
    position: 'absolute',
    top: '12%',
    left: '6%',
  },
  bunnyCenter: {
    position: 'absolute',
    bottom: '8%',
    left: '36%',
  },
  bunnyTopRight: {
    position: 'absolute',
    top: '10%',
    right: '8%',
  },
  bowCenter: {
    position: 'absolute',
    top: '22%',
    left: '52%',
  },
  bowRight: {
    position: 'absolute',
    bottom: '24%',
    right: '4%',
  },
  starOne: {
    position: 'absolute',
    bottom: '20%',
    left: '20%',
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.9,
  },
  starTwo: {
    position: 'absolute',
    top: '32%',
    right: '34%',
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
  },
  starThree: {
    position: 'absolute',
    bottom: '38%',
    right: '20%',
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },
  confettiWrap: {
    position: 'absolute',
    bottom: 0,
    right: '32%',
    flexDirection: 'row',
    gap: 4,
  },
  confettiTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  actionPressable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  menuSection: {
    gap: MENU_GAP,
    width: '100%',
  },
  menuRow: {
    flexDirection: 'row',
    gap: MENU_GAP,
    width: '100%',
  },
  menuHalf: {
    flex: 1,
    minWidth: 0,
  },
  menuThird: {
    flex: 1,
    minWidth: 0,
  },
  tileOuter: {
    minWidth: 0,
  },
  tileInnerWide: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
    width: '100%',
    height: WIDE_TILE_H,
    ...cardShadow,
  },
  tileInnerSquare: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    width: '100%',
    height: SQUARE_TILE_H,
    ...cardShadow,
  },
  tileIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Palette.ink,
    textAlign: 'center',
  },
  tileLabelWide: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
    textAlign: 'left',
  },
  pressed: {
    opacity: 0.7,
  },
});
