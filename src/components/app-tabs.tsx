import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Palette } from '@/constants/ui';
import { useTranslation } from '@/lib/i18n';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { t } = useTranslation();

  return (
    <NativeTabs
      backgroundColor={isDark ? '#1A1D20' : '#FFFFFF'}
      indicatorColor={Palette.accent}
      labelStyle={{
        default: { color: isDark ? '#8E8E93' : '#8A95A0' },
        selected: { color: Palette.accent },
      }}>
      <NativeTabs.Trigger name="index">
        <Label>{t('tab.home')}</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="template">
        <Label>{t('tab.template')}</Label>
        <Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="help">
        <Label>{t('tab.help')}</Label>
        <Icon sf={{ default: 'questionmark.circle', selected: 'questionmark.circle.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="setting">
        <Label>{t('tab.setting')}</Label>
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
