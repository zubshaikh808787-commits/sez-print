import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Palette } from '@/constants/ui';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <NativeTabs
      backgroundColor={isDark ? '#1A1D20' : '#FFFFFF'}
      indicatorColor={Palette.accent}
      labelStyle={{
        default: { color: isDark ? '#8E8E93' : '#8A95A0' },
        selected: { color: Palette.accent },
      }}>
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="template">
        <Label>Template</Label>
        <Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="help">
        <Label>Help</Label>
        <Icon sf={{ default: 'questionmark.circle', selected: 'questionmark.circle.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="setting">
        <Label>Setting</Label>
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
