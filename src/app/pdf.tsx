import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useDataStore } from '@/stores/data-store';

/** 3D Box & Paper Plane Empty State Illustration matching Screenshot 1 */
function EmptyPdfIllustration() {
  return (
    <View style={styles.illustrationContainer}>
      {/* Paper Plane Flying */}
      <View style={styles.planeWrapper}>
        <View style={styles.planeWingTop} />
        <View style={styles.planeBody} />
        <View style={styles.planeWingBottom} />
      </View>

      {/* Flight Trail Dots */}
      <View style={styles.trailContainer}>
        <View style={[styles.trailDot, { opacity: 0.25, transform: [{ scale: 0.7 }] }]} />
        <View style={[styles.trailDot, { opacity: 0.45, transform: [{ scale: 0.85 }] }]} />
        <View style={[styles.trailDot, { opacity: 0.7 }]} />
      </View>

      {/* 3D Isometric Cardboard Box */}
      <View style={styles.boxWrapper}>
        {/* Soft shadow base */}
        <View style={styles.boxShadow} />

        {/* Left Side Wall */}
        <View style={styles.boxSideLeft} />

        {/* Right Side Wall */}
        <View style={styles.boxSideRight} />

        {/* Left Flap */}
        <View style={styles.boxFlapLeft} />

        {/* Right Flap */}
        <View style={styles.boxFlapRight} />

        {/* Inner Box Depths */}
        <View style={styles.boxInterior} />
      </View>
    </View>
  );
}

export default function PdfScreen() {
  const insets = useSafeAreaInsets();
  const pdfFiles = useDataStore((s) => s.pdfFiles);
  const addPdfFile = useDataStore((s) => s.addPdfFile);
  const removePdfFile = useDataStore((s) => s.removePdfFile);

  const handleImportPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        addPdfFile({ name: file.name, uri: file.uri, sizeBytes: file.size ?? 0 });

        Alert.alert(
          'PDF Imported',
          `"${file.name}" has been imported successfully. Would you like to open it in Print preview?`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Print Now',
              onPress: () => {
                router.push({
                  pathname: '/print',
                  params: {
                    docName: file.name,
                    docUri: file.uri,
                    docType: 'PDF',
                  },
                });
              },
            },
          ]
        );
      }
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const handleDeleteFile = (id: string, name: string) => {
    Alert.alert('Delete File', `Are you sure you want to remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removePdfFile(id),
      },
    ]);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.root}>
      {/* Top Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>

        <Text style={styles.headerTitle}>PDF</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content Area */}
      <View style={styles.body}>
        {pdfFiles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyPdfIllustration />
            <Text style={styles.emptyText}>No data file was found</Text>
          </View>
        ) : (
          <FlatList
            data={pdfFiles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.fileListContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.fileCard}>
                <View style={styles.pdfIconWrap}>
                  <Text style={styles.pdfIconText}>PDF</Text>
                </View>

                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {formatFileSize(item.sizeBytes)} •{' '}
                    {new Date(item.importedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>

                <View style={styles.fileActions}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/print',
                        params: {
                          docName: item.name,
                          docUri: item.uri,
                          docType: 'PDF',
                        },
                      })
                    }
                    style={({ pressed }) => [styles.printActionBtn, pressed && styles.pressed]}>
                    <Text style={styles.printActionText}>Print</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeleteFile(item.id, item.name)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteActionBtn, pressed && styles.pressed]}>
                    <Text style={styles.deleteActionText}>✕</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom Import File Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={handleImportPdf}
          style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}>
          <Text style={styles.importBtnText}>Import File</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EFF2F7',
  },
  header: {
    backgroundColor: '#214668',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two + 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: 24,
  },
  illustrationContainer: {
    width: 180,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Paper Airplane & Trail
  planeWrapper: {
    position: 'absolute',
    top: 14,
    right: 28,
    width: 26,
    height: 26,
    transform: [{ rotate: '-18deg' }],
  },
  planeWingTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 0,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#B0C9DE',
  },
  planeBody: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 4,
    backgroundColor: '#9CBAD2',
    borderRadius: 2,
  },
  planeWingBottom: {
    position: 'absolute',
    bottom: 2,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#CADCEB',
  },
  trailContainer: {
    position: 'absolute',
    top: 36,
    right: 64,
    flexDirection: 'row',
    gap: 6,
    transform: [{ rotate: '-22deg' }],
  },
  trailDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#A8C4DC',
  },
  // 3D Cardboard Box
  boxWrapper: {
    position: 'absolute',
    bottom: 20,
    width: 120,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxShadow: {
    position: 'absolute',
    bottom: -6,
    width: 110,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(180, 200, 220, 0.35)',
  },
  boxInterior: {
    position: 'absolute',
    top: 10,
    width: 80,
    height: 24,
    backgroundColor: '#95B8D5',
    transform: [{ rotate: '-5deg' }, { skewX: '-15deg' }],
    borderRadius: 2,
  },
  boxSideLeft: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    width: 50,
    height: 54,
    backgroundColor: '#B6D6EE',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 4,
    transform: [{ skewY: '14deg' }],
  },
  boxSideRight: {
    position: 'absolute',
    bottom: 0,
    right: 10,
    width: 54,
    height: 54,
    backgroundColor: '#CADFF1',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 4,
    transform: [{ skewY: '-14deg' }],
  },
  boxFlapLeft: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 44,
    height: 22,
    backgroundColor: '#D7E9F7',
    borderTopLeftRadius: 4,
    transform: [{ skewX: '-28deg' }, { rotate: '-12deg' }],
  },
  boxFlapRight: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 44,
    height: 22,
    backgroundColor: '#E2F0FA',
    borderTopRightRadius: 4,
    transform: [{ skewX: '28deg' }, { rotate: '12deg' }],
  },
  emptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  // File List
  fileListContainer: {
    padding: Spacing.three,
    gap: 12,
  },
  fileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfIconText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printActionBtn: {
    backgroundColor: '#17A6B8',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  printActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteActionBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#94A3B8',
    fontSize: 16,
  },
  // Bottom Footer
  footer: {
    paddingHorizontal: 28,
    paddingTop: Spacing.two,
  },
  importBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#17A6B8',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#17A6B8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
