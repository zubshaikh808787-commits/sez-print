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
        <Stack.Screen
          name="print-photo-modal"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen name="scan" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ocr" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="asr" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pdf" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="data-file" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="language-switch" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="font-library" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="column-name" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="clipart" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="border-library" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="advanced-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="printing-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="editing-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="editor-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="default-property-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="cache-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="app-permissions" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="printing-history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="printer-connect" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="new-label-setup" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </ThemeProvider>
  );
}
