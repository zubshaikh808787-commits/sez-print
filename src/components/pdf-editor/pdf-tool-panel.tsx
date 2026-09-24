import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';

export type PdfToolId = 'crop' | 'rotate' | 'sharpness' | 'watermark';

const TOOLS: { id: PdfToolId; label: string; icon: string }[] = [
  { id: 'crop', label: 'Crop', icon: 'rectangle.dashed' },
  { id: 'rotate', label: 'Rotate', icon: 'arrow.clockwise' },
  { id: 'sharpness', label: 'Sharpness', icon: 'slider.horizontal.3' },
  { id: 'watermark', label: 'Watermark', icon: 'character' },
];

export function PdfToolPanel({
  active,
  onChange,
  children,
  disabled,
}: {
  active: PdfToolId | null;
  onChange: (id: PdfToolId) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {/* Compact Segmented Toolbar Ribbon */}
      <View style={styles.segmentBar}>
        {TOOLS.map((t) => {
          const isActive = active === t.id;
          return (
            <Pressable
              key={t.id}
              disabled={disabled}
              onPress={() => onChange(t.id)}
              style={[
                styles.segmentBtn,
                isActive && styles.segmentBtnActive,
                disabled && styles.segmentBtnOff,
              ]}>
              <AppIcon
                name={t.icon}
                size={15}
                tintColor={isActive ? Palette.accent : Palette.muted}
              />
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Expandable tool panel content (only takes space when a tool is selected) */}
      {active !== null ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.card,
  },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: 12,
    backgroundColor: Palette.cardTop,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  segmentBtnOff: {
    opacity: 0.4,
  },
  segmentText: {
    fontSize: 12,
    color: Palette.muted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
});
