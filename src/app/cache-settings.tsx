import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsRadioRow,
  SettingsScreenShell,
} from '@/components/settings-ui';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore } from '@/stores/printer-store';

type CacheItemId = 'local' | 'cloud' | 'data' | 'history' | 'files';

function jsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${Math.max(0, Math.round(bytes))}B`;
}

async function cacheDirectorySize(): Promise<number> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return 0;
  let total = 0;
  const walk = async (path: string) => {
    const entries = await FileSystem.readDirectoryAsync(path).catch(() => [] as string[]);
    for (const entry of entries) {
      const info = await FileSystem.getInfoAsync(`${path}${entry}`).catch(() => null);
      if (!info?.exists) continue;
      if (info.isDirectory) await walk(`${path}${entry}/`);
      else total += info.size ?? 0;
    }
  };
  await walk(dir);
  return total;
}

async function clearCacheDirectory(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return;
  const entries = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  await Promise.all(
    entries.map((entry) => FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true })),
  );
}

export default function CacheSettingsScreen() {
  const documents = useLabelStore((s) => s.documents);
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const pdfFiles = useDataStore((s) => s.pdfFiles);
  const history = usePrinterStore((s) => s.history);
  const clearHistory = usePrinterStore((s) => s.clearHistory);

  const [selectedIds, setSelectedIds] = useState<CacheItemId[]>([]);
  const [fileCacheBytes, setFileCacheBytes] = useState(0);

  useEffect(() => {
    void cacheDirectorySize().then(setFileCacheBytes);
  }, []);

  const items = useMemo(
    () => [
      { id: 'local' as const, label: 'Local', bytes: jsonBytes(documents) },
      { id: 'cloud' as const, label: 'Cloud', bytes: jsonBytes(cloudTemplates) },
      {
        id: 'data' as const,
        label: 'Data File',
        bytes: jsonBytes(excelFiles) + jsonBytes(pdfFiles),
      },
      { id: 'history' as const, label: 'Printing History', bytes: jsonBytes(history) },
      { id: 'files' as const, label: 'Temporary Files', bytes: fileCacheBytes },
    ],
    [documents, cloudTemplates, excelFiles, pdfFiles, history, fileCacheBytes],
  );

  const usedBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const selectedBytes = items
    .filter((item) => selectedIds.includes(item.id))
    .reduce((sum, item) => sum + item.bytes, 0);

  const toggleItem = (id: CacheItemId) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const clearCache = useCallback(() => {
    if (selectedIds.length === 0) {
      Alert.alert('Select Cache', 'Choose at least one cache item to clear.');
      return;
    }
    const clearsLabels = selectedIds.includes('local');
    Alert.alert(
      'Clear Cache',
      clearsLabels
        ? 'This will permanently delete all saved labels. Continue?'
        : `Clear ${formatBytes(selectedBytes)} of selected cache data?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (selectedIds.includes('local')) {
                useLabelStore.setState({ documents: [], groups: [] });
              }
              if (selectedIds.includes('cloud')) {
                useLabelStore.setState({ cloudTemplates: [] });
              }
              if (selectedIds.includes('data')) {
                useDataStore.setState({
                  excelFiles: [],
                  pdfFiles: [],
                  activeExcelFileId: null,
                  activeRowIndex: 0,
                });
              }
              if (selectedIds.includes('history')) clearHistory();
              if (selectedIds.includes('files')) {
                await clearCacheDirectory();
                setFileCacheBytes(await cacheDirectorySize());
              }
              setSelectedIds([]);
              Alert.alert('Cache Cleared', 'Selected cache data has been removed.');
            })();
          },
        },
      ],
    );
  }, [selectedIds, selectedBytes, clearHistory]);

  return (
    <SettingsScreenShell title="Cache Settings">
      <SettingsCard>
        <View
          style={{
            minHeight: 52,
            paddingHorizontal: 16,
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#2C3E50' }}>
            Used Space
          </Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF5350' }}>
            {formatBytes(usedBytes)}
          </Text>
        </View>
      </SettingsCard>

      <SettingsCard>
        {items.map((item, index) => (
          <SettingsRadioRow
            key={item.id}
            label={item.label}
            value={formatBytes(item.bytes)}
            selected={selectedIds.includes(item.id)}
            onPress={() => toggleItem(item.id)}
            showDivider={index < items.length - 1}
          />
        ))}
      </SettingsCard>

      <SettingsActionCard
        label={`Clear Cache (${formatBytes(selectedBytes)})`}
        danger
        onPress={clearCache}
      />
    </SettingsScreenShell>
  );
}
