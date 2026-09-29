import { Asset } from 'expo-asset';
import { Skia, type SkTypeface } from '@shopify/react-native-skia';

import { APP_FONT_MAP } from '@/lib/app-fonts';

const typefaces = new Map<string, SkTypeface>();
let loading: Promise<void> | null = null;

async function loadFace(name: string, moduleId: number): Promise<void> {
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri;
  if (!uri) throw new Error(`Print font ${name} has no local file.`);
  const data = await Skia.Data.fromURI(uri);
  const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
  if (!face) throw new Error(`Print font ${name} could not be decoded.`);
  typefaces.set(name, face);
}

/** Load the same faces the editor uses, so headless print is not a block font. */
export function ensurePrintTypefaces(): Promise<void> {
  if (typefaces.size > 0) return Promise.resolve();
  if (!loading) {
    loading = Promise.all(
      Object.entries(APP_FONT_MAP).map(([name, moduleId]) => loadFace(name, moduleId as number)),
    )
      .then(() => undefined)
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/** Embedded face for a FONT_LIBRARY family. Default and barcode text use Inter. */
export function printTypeface(family?: string, bold?: boolean): SkTypeface | null {
  if (family && typefaces.has(family)) return typefaces.get(family) ?? null;
  if (bold && typefaces.has('Inter_600SemiBold')) return typefaces.get('Inter_600SemiBold') ?? null;
  return typefaces.get('Inter_400Regular') ?? null;
}
