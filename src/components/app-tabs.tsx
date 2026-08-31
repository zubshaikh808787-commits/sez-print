import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';

import { Palette } from '@/constants/ui';
import { useTranslation } from '@/lib/i18n';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.accent,
        tabBarInactiveTintColor: isDark ? '#8E8E93' : '#8A95A0',
        tabBarStyle: {
          backgroundColor: isDark ? '#1A1D20' : '#FFFFFF',
          borderTopColor: isDark ? '#2A2E32' : '#E6EBF0',
          ...(Platform.OS === 'android' ? { elevation: 8 } : null),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="template"
        options={{
          title: t('tab.template'),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tab.help'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="setting"
        options={{
          title: t('tab.setting'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
