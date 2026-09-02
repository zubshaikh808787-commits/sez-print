import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import {
  CustomizeIcon,
  DocBadgeIcon,
  LabelCloneIcon,
  NewLabelIcon,
  PrintPhotoIcon,
  ScanLabelIcon,
  ShareNodeIcon,
  ShippingLabelIcon,
} from '@/components/home-icons';
import { LabelPreview, LABEL_PAD_STAGE_MIN_HEIGHT } from '@/components/label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette, scaleFont } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore } from '@/stores/printer-store';

type IconName = AppIconName;

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
        android_ripple={androidRipple}
        style={({ pressed }) => [
          styles.actionPressable,
          pressed && !disabled && styles.pressed,
        ]}>
        {customIcon ? (
          customIcon
        ) : icon ? (
          <AppIcon name={icon} tintColor={color} size={23} pointerEvents="none" />
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
        android_ripple={androidRipple}
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.five);
  const { width } = useWindowDimensions();
  const router = useRouter();

  const documents = useLabelStore((s) => s.documents);
  const deleteDocument = useLabelStore((s) => s.deleteDocument);
  const uploadToCloud = useLabelStore((s) => s.uploadToCloud);
  const printerStatus = usePrinterStore((s) => s.status);
  const printerName = usePrinterStore((s) => s.deviceName);

  const recentLabel = useMemo(
    () =>
      documents.length > 0
        ? [...documents].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null,
    [documents],
  );

  const [previewWidth, setPreviewWidth] = useState(0);

  const handleDelete = () => {
    if (!recentLabel) return;
    Alert.alert('Delete Label', `Delete "${recentLabel.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteDocument(recentLabel.id),
      },
    ]);
  };

  const handleUpload = () => {
    if (!recentLabel) return;
    uploadToCloud(recentLabel);
    Alert.alert(
      'Template saved',
      `"${recentLabel.name}" is in Select Existing Template and Template → Cloud.`,
    );
  };

  const connected = printerStatus === 'connected';

  return (
    <View style={styles.root}>
      {/* Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.push('/printer-connect')}
          android_ripple={androidRipple}
          style={({ pressed }) => [
            styles.connection,
            connected && styles.connectionConnected,
            pressed && styles.pressed,
          ]}>
          <Text numberOfLines={1} style={styles.connectionText}>
            {connected ? printerName ?? 'Connected' : 'Unconnected'}
          </Text>
          <AppIcon name="link" tintColor="#FFFFFF" size={15} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabPad },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {/* Main Card: most recent label */}
          <View style={styles.card}>
            <View style={styles.cardTopSection}>
              <View style={[styles.cardHead, width < 360 && styles.cardHeadStacked]}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.cardTitle, { fontSize: scaleFont(width, 13.5, 0.85, 1.05) }]}>
                  {recentLabel ? recentLabel.name : 'No labels yet'}
                </Text>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    styles.cardSize,
                    width < 360 && styles.cardSizeStacked,
                    { fontSize: scaleFont(width, 13, 0.85, 1.05) },
                  ]}>
                  {recentLabel
                    ? `${recentLabel.widthMm.toFixed(0)} x ${recentLabel.heightMm.toFixed(0)} (${recentLabel.paperType})`
                    : ''}
                </Text>
              </View>

              <View
                style={styles.previewWrap}
                onLayout={(e) => setPreviewWidth(e.nativeEvent.layout.width)}>
                {recentLabel && previewWidth > 0 ? (
                  <LabelPreview
                    document={recentLabel}
                    width={previewWidth}
                    maxHeight={LABEL_PAD_STAGE_MIN_HEIGHT}
                    showStage
                    style={styles.previewBorder}
                  />
                ) : (
                  <Pressable onPress={() => router.push('/new-label')} style={styles.emptyPreview}>
                    <AppIcon name="plus.circle" tintColor={Palette.accent} size={28} />
                    <Text style={styles.emptyPreviewText}>
                      Create your first label to see it here
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Bottom White Section: 5 Actions */}
            <View style={styles.actionRow}>
              <ActionItem
                icon="square.and.pencil"
                label="Edit"
                disabled={!recentLabel}
                onPress={() =>
                  recentLabel &&
                  router.push({ pathname: '/edit', params: { labelId: recentLabel.id } })
                }
              />
              <ActionItem
                icon="printer"
                label="Print"
                disabled={!recentLabel}
                onPress={() =>
                  recentLabel &&
                  router.push({ pathname: '/print', params: { labelId: recentLabel.id } })
                }
              />
              <ActionItem icon="trash" label="Delete" disabled={!recentLabel} onPress={handleDelete} />
              <ActionItem
                customIcon={<ShareNodeIcon color={recentLabel ? Palette.accent : Palette.disabled} size={24} />}
                label="Share"
                disabled={!recentLabel}
                onPress={() =>
                  recentLabel &&
                  router.push({ pathname: '/share', params: { labelId: recentLabel.id } })
                }
                highlight={Boolean(recentLabel)}
              />
              <ActionItem
                icon="icloud.and.arrow.up"
                label="Upload"
                disabled={!recentLabel}
                onPress={handleUpload}
              />
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
                href="/scan"
              />
            </View>

            {/* Row 2: 3 Square Buttons */}
            <View style={styles.menuRow}>
              <Tile
                style={styles.menuThird}
                iconComponent={<DocBadgeIcon badge="EXCEL" size={32} color="#7E8B98" />}
                label="Print Excel"
                href="/data-file?type=Excel"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<DocBadgeIcon badge="PDF" size={32} color="#7E8B98" />}
                label="Print PDF"
                href="/pdf"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<PrintPhotoIcon size={30} color={Palette.accent} />}
                label="Print Photo"
                href="/print-photo-modal"
              />
            </View>

            {/* Row 3: 2ups Label, Shipping Label, Customize */}
            <View style={styles.menuRow}>
              <Tile
                style={styles.menuThird}
                iconComponent={<LabelCloneIcon size={30} color={Palette.accent} />}
                label="2ups Label"
                href="/new-label-setup?isTwoUps=true"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<ShippingLabelIcon size={30} color={Palette.accent} />}
                label="Shipping Label"
                href="/shipping-label"
              />
              <Tile
                style={styles.menuThird}
                iconComponent={<CustomizeIcon size={30} color={Palette.accent} />}
                label="Customize"
                href="/customize-template"
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
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
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
  previewWrap: {
    width: '100%',
  },
  previewBorder: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyPreview: {
    width: '100%',
    aspectRatio: 2.05,
    borderRadius: 10,
    backgroundColor: '#F4F6F9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyPreviewText: {
    color: Palette.muted,
    fontSize: 12.5,
  },
  connectionConnected: {
    backgroundColor: '#2E9E63',
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
    minWidth: 28,
    minHeight: 28,
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
