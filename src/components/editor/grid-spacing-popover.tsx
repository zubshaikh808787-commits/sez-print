import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { clampGridSpacingMm } from '@/lib/editor/canvas-grid';
import {
  GRID_PRINT_DISCLAIMER,
  GRID_SPACING_LABELS,
  spacingLabelForMm,
} from '@/lib/editor/grid-settings-ui';
import { Spacing } from '@/constants/theme';
import { Palette, Type, androidRipple } from '@/constants/ui';

type GridSpacingPopoverProps = {
  visible: boolean;
  spacingMm: number;
  onClose: () => void;
  onSpacingChange: (spacingMm: number) => void;
};

export function GridSpacingPopover({
  visible,
  spacingMm,
  onClose,
  onSpacingChange,
}: GridSpacingPopoverProps) {
  const selectedSpacing = spacingLabelForMm(spacingMm);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.panel} onPress={() => undefined}>
          <Text style={styles.title}>Grid spacing</Text>
          <Text style={styles.disclaimer}>{GRID_PRINT_DISCLAIMER}</Text>

          <View style={styles.chipRow}>
            {GRID_SPACING_LABELS.map((label) => {
              const active = label === selectedSpacing;
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    const mm = Number.parseFloat(label);
                    if (Number.isFinite(mm)) {
                      onSpacingChange(clampGridSpacingMm(mm));
                    }
                  }}
                  android_ripple={androidRipple}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            android_ripple={androidRipple}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 96,
    paddingRight: Spacing.two,
    paddingLeft: Spacing.three,
  },
  panel: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    ...Type.bodyMedium,
    color: Palette.ink,
    fontWeight: '600',
  },
  disclaimer: {
    ...Type.caption,
    color: Palette.muted,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  chipActive: {
    backgroundColor: 'rgba(23, 166, 184, 0.12)',
    borderColor: Palette.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.muted,
  },
  chipTextActive: {
    color: Palette.accent,
  },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  doneText: {
    ...Type.bodyMedium,
    color: Palette.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
