import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';

const SECTIONS = [
  {
    title: 'Connect a printer',
    body: 'Tap Unconnected on Home or Print, then scan for Bluetooth printers. Generic ESC/POS thermal printers are supported. A development build is required — Bluetooth is not available in Expo Go.',
  },
  {
    title: 'Design a label',
    body: 'Use New Label or a template, then add text, barcodes, QR codes, tables, and black-and-white stickers. Drag to move, pull the corner to resize, and use Undo/Redo if you miss a step. Save before leaving the editor.',
  },
  {
    title: 'Print',
    body: 'Open Print from the editor or Home. Set copies, darkness, orientation, and offsets, then tap Print. Data-bound labels print one page per Excel row when automatic pages is on.',
  },
  {
    title: 'Stickers & clipart',
    body: 'All stickers are black-and-white silhouettes so they print cleanly on thermal labels. Open Clipart from the editor and tap a sticker to place it.',
  },
  {
    title: 'Data files',
    body: 'Import Excel or CSV from Data File, then bind a text, QR, or barcode field to a column name. At print time each row becomes a label.',
  },
  {
    title: 'Scan, OCR, and voice',
    body: 'Scan reads barcodes from the camera or a photo. OCR extracts text (full text recognition needs a development build). ASR converts speech into label text.',
  },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Help</Text>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabPad },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Printer setup, label editing, and troubleshooting for Sez Print.
        </Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardBody}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  intro: {
    fontSize: 14,
    color: Palette.muted,
    lineHeight: 20,
    marginBottom: Spacing.one,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.three,
    ...cardShadow,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Palette.ink,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#4B5563',
  },
});
