import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore, type PrintHistoryEntry } from '@/stores/printer-store';

const SOURCE_LABELS: Record<PrintHistoryEntry['source'], string> = {
  label: 'Label',
  photo: 'Photo',
  pdf: 'PDF',
  scan: 'Scan',
  excel: 'Data File',
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function PrintingHistoryScreen() {
  const insets = useSafeAreaInsets();
  const history = usePrinterStore((s) => s.history);
  const clearHistory = usePrinterStore((s) => s.clearHistory);
  const getDocument = useLabelStore((s) => s.getDocument);

  const handleClear = () => {
    if (history.length === 0) return;
    Alert.alert('Clear History', 'Remove all printing history entries?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);
  };

  const handleReprint = (entry: PrintHistoryEntry) => {
    if (entry.documentId && getDocument(entry.documentId)) {
      router.push({ pathname: '/print', params: { labelId: entry.documentId } });
    } else {
      Alert.alert(
        'Unavailable',
        'The original label for this entry no longer exists, so it cannot be reprinted.',
      );
    }
  };

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Printing History" />

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.four },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <AppIcon name="clock.arrow.circlepath" tintColor="#B8C0C8" size={44} />
            <Text style={styles.emptyTitle}>No Printing History</Text>
            <Text style={styles.emptySub}>
              Records appear here after each print when history recording is enabled in Printing
              Settings.
            </Text>
          </View>
        }
        ListHeaderComponent={
          history.length > 0 ? (
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}>
              <AppIcon name="trash" tintColor="#DC2626" size={15} />
              <Text style={styles.clearText}>Clear All ({history.length})</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.labelName}
              </Text>
              <Text style={styles.cardMeta}>
                {SOURCE_LABELS[item.source]} · {item.copies}{' '}
                {item.copies === 1 ? 'copy' : 'copies'} · {formatDate(item.printedAt)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleReprint(item)}
              style={({ pressed }) => [styles.reprintBtn, pressed && styles.pressed]}>
              <AppIcon name="printer" tintColor="#FFFFFF" size={15} />
              <Text style={styles.reprintText}>Reprint</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    minHeight: 40,
    paddingBottom: Spacing.two,
  },
  clearText: {
    color: '#DC2626',
    fontSize: 13.5,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    ...cardShadow,
  },
  cardMain: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
  },
  cardMeta: {
    marginTop: 3,
    fontSize: 12.5,
    color: Palette.muted,
  },
  reprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.accent,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reprintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: Spacing.four,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Palette.ink,
  },
  emptySub: {
    fontSize: 13,
    color: Palette.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.65,
  },
});
