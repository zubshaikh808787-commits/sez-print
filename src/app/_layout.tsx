import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="print" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="share"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="new-label"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen name="data-file" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </ThemeProvider>
  );
}
