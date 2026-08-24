import { Platform } from 'react-native';

export type AsrSpeechEvents = {
  onStart?: () => void;
  onEnd?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
};

type SpeechHandle = {
  available: boolean;
  start: () => Promise<void>;
  stop: () => void;
  abort: () => void;
  dispose: () => void;
};

function loadNativeSpeechModule() {
  try {
    // Lazy require so Expo Go doesn't crash route registration at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as typeof import('expo-speech-recognition');
  } catch {
    return null;
  }
}

function createWebSpeech(events: AsrSpeechEvents): SpeechHandle | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  type WebRecognition = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean } }; resultIndex: number }) => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  };

  const browserWindow = window as Window & {
    SpeechRecognition?: new () => WebRecognition;
    webkitSpeechRecognition?: new () => WebRecognition;
  };

  const WebSpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

  if (!WebSpeechRecognition) return null;

  let recognition: WebRecognition | null = null;

  const ensureRecognition = () => {
    if (recognition) return recognition;
    recognition = new WebSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => events.onStart?.();
    recognition.onend = () => events.onEnd?.();
    recognition.onerror = () => events.onError?.('Unable to recognize speech. Please try again.');
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        events.onResult?.(transcript, result.isFinal);
      }
    };

    return recognition;
  };

  return {
    available: true,
    start: async () => {
      const active = ensureRecognition();
      active.start();
    },
    stop: () => {
      recognition?.stop();
    },
    abort: () => {
      recognition?.abort();
    },
    dispose: () => {
      recognition?.abort();
      recognition = null;
    },
  };
}

function createNativeSpeech(events: AsrSpeechEvents): SpeechHandle | null {
  const speech = loadNativeSpeechModule();
  if (!speech) return null;

  const { ExpoSpeechRecognitionModule } = speech;

  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      return null;
    }
  } catch {
    return null;
  }

  const subscriptions = [
    ExpoSpeechRecognitionModule.addListener('start', () => events.onStart?.()),
    ExpoSpeechRecognitionModule.addListener('end', () => events.onEnd?.()),
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const transcript = event.results[0]?.transcript?.trim() ?? '';
      if (transcript) {
        events.onResult?.(transcript, event.isFinal);
      }
    }),
    ExpoSpeechRecognitionModule.addListener('error', (event) => {
      if (event.error === 'aborted') return;
      events.onError?.(event.message || 'Unable to recognize speech. Please try again.');
    }),
  ];

  return {
    available: true,
    start: async () => {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone and speech permissions are required.');
      }

      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      });
    },
    stop: () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // ignore
      }
    },
    abort: () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    },
    dispose: () => {
      subscriptions.forEach((subscription) => subscription.remove());
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    },
  };
}

export function createAsrSpeechEngine(events: AsrSpeechEvents): SpeechHandle {
  const webEngine = createWebSpeech(events);
  if (webEngine) return webEngine;

  const nativeEngine = createNativeSpeech(events);
  if (nativeEngine) return nativeEngine;

  return {
    available: false,
    start: async () => {
      throw new Error('Speech recognition is unavailable in Expo Go. Type in the box or use a dev build.');
    },
    stop: () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}
