import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatScale,
  isUntested,
  scaleValueText,
  stepQuality,
  type QualityScale,
} from '@/lib/printer/bridge-quality-caps';

export type QualityStepperProps = {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
};

/**
 * Darkness or speed on a bridge that declares a scale: Auto, or Manual with the
 * value out of the scale, steppers bounded by it and a Reset to Auto button.
 * Each screen passes its own stepper row so the control matches the screen.
 */
export function QualityControl({
  cap,
  value,
  onChange,
  Stepper,
  untestedNote,
}: {
  cap: QualityScale;
  value: number | null;
  onChange: (next: number | null) => void;
  Stepper: ComponentType<QualityStepperProps>;
  untestedNote?: string;
}) {
  const manual = value != null;
  const untested = isUntested(value, cap);
  return (
    <View>
      <Stepper
        label={cap.label}
        value={scaleValueText(value, cap)}
        onMinus={() => onChange(stepQuality(value, cap, -1))}
        onPlus={() => onChange(stepQuality(value, cap, 1))}
        minusDisabled={manual && value <= cap.min}
        plusDisabled={manual && value >= cap.max}
      />
      {manual ? (
        <View style={styles.footer}>
          <Text style={[styles.note, untested && styles.warn]} numberOfLines={2}>
            {formatScale(value, cap)}
            {untested && untestedNote ? ` · ${untestedNote}` : ''}
          </Text>
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Reset ${cap.label.toLowerCase()} to Auto`}
            style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
            <Text style={styles.resetText}>Reset to Auto</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 8,
  },
  note: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 12,
  },
  warn: {
    color: '#F59E0B',
  },
  reset: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(23, 166, 184, 0.15)',
  },
  resetText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
