import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';
import { useTranslation } from '@/lib/i18n';

type IconName = AppIconName;

function FontSettingIcon() {
  return (
    <View style={styles.fontIconBox}>
      <Text style={styles.fontIconText}>A</Text>
    </View>
  );
}

function SettingRow({
  label,
  icon,
  customIcon,
  onPress,
  showDivider,
}: {
  label: string;
  icon?: IconName;
  customIcon?: ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}>
        <View style={styles.rowIcon}>
          {customIcon ??
            (icon ? <AppIcon name={icon} tintColor="#5A6570" size={22} /> : null)}
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
        <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
      </Pressable>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

function SettingGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export default function SettingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  const handleFeedback = () => {
    const query = encodeURIComponent('sez print');
    const url =
      Platform.OS === 'ios'
        ? `https://apps.apple.com/search?term=${query}`
        : `https://play.google.com/store/search?q=${query}&c=apps`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Unavailable', 'Could not open the app store on this device.'),
    );
  };

  const handleAbout = () => {
    const version = Constants.expoConfig?.version ?? '1.0.0';
    Alert.alert(
      'Sez Print',
      `Version ${version}\n\nDesign and print labels on generic ESC/POS Bluetooth thermal printers. Supports barcodes, QR codes, tables, cliparts, data files, and 22 Indian languages.`,
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Text style={styles.headerTitle}>{t('setting.title')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: BottomTabInset + Spacing.four },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.inner, { width: contentWidth, maxWidth: MaxContentWidth }]}>
          <SettingGroup>
            <SettingRow
              label={t('setting.connectBluetoothPrinter')}
              icon="printer"
              onPress={() => router.push('/printer-connect')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.languageSwitch')}
              icon="globe"
              onPress={() => router.push('/language-switch')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.font')}
              customIcon={<FontSettingIcon />}
              onPress={() => router.push('/font-library')}
              showDivider
            />
            <SettingRow
              label={t('setting.clipart')}
              icon="square.grid.2x2"
              onPress={() => router.push('/clipart')}
              showDivider
            />
            <SettingRow
              label={t('setting.border')}
              icon="rectangle.dashed"
              onPress={() => router.push('/border-library')}
              showDivider
            />
            <SettingRow
              label={t('setting.dataFile')}
              icon="tablecells"
              onPress={() => router.push('/data-file?type=Excel')}
              showDivider
            />
            <SettingRow
              label={t('setting.printingHistory')}
              icon="clock.arrow.circlepath"
              onPress={() => router.push('/printing-history')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.advancedSettings')}
              icon="gearshape"
              onPress={() => router.push('/advanced-settings')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.appPermissions')}
              icon="slider.horizontal.3"
              onPress={() => router.push('/app-permissions')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.feedback')}
              icon="square.and.pencil"
              onPress={handleFeedback}
              showDivider
            />
            <SettingRow label={t('setting.aboutUs')} icon="info.circle" onPress={handleAbout} />
          </SettingGroup>
        </View>
      </ScrollView>
    </View>
  );
}

const ICON_COL = 34;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  inner: {
    width: '100%',
    gap: Spacing.two + 2,
  },
  group: {
    backgroundColor: Palette.card,
    borderRadius: 10,
    ...cardShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingRight: Spacing.three,
    overflow: 'hidden',
  },
  rowPressed: {
    backgroundColor: '#F5F7FA',
  },
  rowIcon: {
    width: ICON_COL + Spacing.three * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: '#2C3E50',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E8ED',
    marginLeft: ICON_COL + Spacing.three * 2,
  },
  fontIconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontIconText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#5A6570',
    lineHeight: 20,
  },
});
