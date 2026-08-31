import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react';
import { ScrollView, Text, View, useColorScheme } from 'react-native';

import { APP_FONT_MAP } from '@/lib/app-fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sez Print failed to start', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#111827' }}>
            Sez Print failed to start
          </Text>
          <ScrollView>
            <Text selectable style={{ color: '#374151', fontSize: 14 }}>
              {this.state.error.message}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppRoot() {
  const colorScheme = useColorScheme();
  useFonts(APP_FONT_MAP);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
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
        <Stack.Screen name="photo-frames" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="print-photo" options={{ animation: 'slide_from_right' }} />
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
        <Stack.Screen name="calibration-print" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="new-label-setup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="shipping-label"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="customize-template"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <AppRoot />
    </RootErrorBoundary>
  );
}
