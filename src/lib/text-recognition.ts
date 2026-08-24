/**
 * ML Kit text recognition with a lazy native-module load, so the app still runs
 * in Expo Go (where the module is unavailable and callers fall back to manual entry).
 */
export async function recognizeTextFromImage(uri: string): Promise<string | null> {
  let TextRecognition: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  } catch {
    return null;
  }
  try {
    const result = await TextRecognition.recognize(uri);
    const text = (result?.text ?? '').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
