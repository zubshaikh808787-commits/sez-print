import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import { parsePageRange, type PageScope } from '@/lib/pdf-editor/session';

export function PdfCropTool({
  scope,
  pageCount,
  fits,
  hasCrop,
  onScope,
  onResetCrop,
  onApplyCrop,
}: {
  scope: PageScope;
  pageCount: number;
  fits: boolean;
  hasCrop?: boolean;
  onScope: (scope: PageScope) => void;
  onResetCrop?: () => void;
  onApplyCrop: () => void;
}) {
  const rangeError =
    scope.mode === 'range' ? parsePageRange(String(scope.start), String(scope.end), pageCount).error : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.actionRow}>
        <Pressable onPress={onApplyCrop} style={styles.applyBtn}>
          <AppIcon name="checkmark" size={14} tintColor="#FFFFFF" />
          <Text style={styles.applyText}>Apply Crop</Text>
        </Pressable>
        {hasCrop && onResetCrop ? (
          <Pressable onPress={onResetCrop} style={styles.resetBtn}>
            <Text style={styles.resetText}>Reset to Full Page</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.help}>
        Drag or resize the window on the page. Tap Apply Crop when ready to see only the cropped section.
      </Text>
      {!fits ? (
        <Text style={styles.err}>
          This output size is larger than the current page. Pick a smaller size — the page will not be scaled.
        </Text>
      ) : null}
      <PdfScopeSelector
        scope={scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(next) => {
          if (next.mode === 'range') {
            const parsed = parsePageRange(String(next.start), String(next.end), pageCount);
            onScope({ mode: 'range', start: parsed.start, end: parsed.end });
            return;
          }
          onScope(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.accent,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  applyText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  help: { fontSize: 11, color: Palette.muted, lineHeight: 15 },
  err: { fontSize: 11, color: Palette.danger, lineHeight: 15 },
  resetBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.danger,
  },
});
