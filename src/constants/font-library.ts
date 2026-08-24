import { Platform } from 'react-native';

export interface FontLibraryItem {
  id: string;
  name: string;
  family: string | undefined;
  category: 'Latin' | 'Indian Script' | 'Display' | 'System';
  sample: string;
  sampleNative?: string;
}

export const FONT_LIBRARY: FontLibraryItem[] = [
  {
    id: 'system',
    name: 'System Default',
    family: undefined,
    category: 'System',
    sample: 'Label Print Preview Aa',
  },
  {
    id: 'inter',
    name: 'Inter',
    family: 'Inter_400Regular',
    category: 'Latin',
    sample: 'Clean modern sans-serif text',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    family: 'Roboto_400Regular',
    category: 'Latin',
    sample: 'Roboto regular body text',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    family: 'OpenSans_400Regular',
    category: 'Latin',
    sample: 'Open Sans friendly labels',
  },
  {
    id: 'lato',
    name: 'Lato',
    family: 'Lato_400Regular',
    category: 'Latin',
    sample: 'Lato semi-rounded letters',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: 'Montserrat_600SemiBold',
    category: 'Display',
    sample: 'MONTserrat HEADLINE',
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    family: 'PlayfairDisplay_700Bold',
    category: 'Display',
    sample: 'Playfair elegant serif',
  },
  {
    id: 'oswald',
    name: 'Oswald',
    family: 'Oswald_500Medium',
    category: 'Display',
    sample: 'OSWALD CONDENSED TITLE',
  },
  {
    id: 'noto-devanagari',
    name: 'Noto Sans Devanagari',
    family: 'NotoSansDevanagari_400Regular',
    category: 'Indian Script',
    sample: 'हिन्दी लेबल पाठ',
    sampleNative: 'हिन्दी',
  },
  {
    id: 'noto-tamil',
    name: 'Noto Sans Tamil',
    family: 'NotoSansTamil_400Regular',
    category: 'Indian Script',
    sample: 'தமிழ் லேபிள் உரை',
    sampleNative: 'தமிழ்',
  },
  {
    id: 'noto-bengali',
    name: 'Noto Sans Bengali',
    family: 'NotoSansBengali_400Regular',
    category: 'Indian Script',
    sample: 'বাংলা লেবেল টেক্সট',
    sampleNative: 'বাংলা',
  },
  {
    id: 'noto-telugu',
    name: 'Noto Sans Telugu',
    family: 'NotoSansTelugu_400Regular',
    category: 'Indian Script',
    sample: 'తెలుగు లేబుల్ టెక్స్ట్',
    sampleNative: 'తెలుగు',
  },
  {
    id: 'noto-kannada',
    name: 'Noto Sans Kannada',
    family: 'NotoSansKannada_400Regular',
    category: 'Indian Script',
    sample: 'ಕನ್ನಡ ಲೇಬಲ್ ಪಠ್ಯ',
    sampleNative: 'ಕನ್ನಡ',
  },
  {
    id: 'noto-malayalam',
    name: 'Noto Sans Malayalam',
    family: 'NotoSansMalayalam_400Regular',
    category: 'Indian Script',
    sample: 'മലയാളം ലേബൽ ടെക്സ്റ്റ്',
    sampleNative: 'മലയാളം',
  },
  {
    id: 'noto-gujarati',
    name: 'Noto Sans Gujarati',
    family: 'NotoSansGujarati_400Regular',
    category: 'Indian Script',
    sample: 'ગુજરાતી લેબલ ટેક્સ્ટ',
    sampleNative: 'ગુજરાતી',
  },
  {
    id: 'noto-gurmukhi',
    name: 'Noto Sans Gurmukhi',
    family: 'NotoSansGurmukhi_400Regular',
    category: 'Indian Script',
    sample: 'ਪੰਜਾਬੀ ਲੇਬਲ ਟੈਕਸਟ',
    sampleNative: 'ਪੰਜਾਬੀ',
  },
  {
    id: 'serif',
    name: Platform.OS === 'ios' ? 'Georgia' : 'Serif',
    family: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    category: 'System',
    sample: 'Classic serif label text',
  },
  {
    id: 'mono',
    name: 'Monospace',
    family: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    category: 'System',
    sample: 'CODE-128 BARCODE 001',
  },
];

export const FONT_CATEGORIES = ['All', 'Latin', 'Indian Script', 'Display', 'System'] as const;
