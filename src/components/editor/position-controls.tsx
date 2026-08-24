import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TextAlign } from '@/components/editor/types';

type IconName = SymbolViewProps['name'];

const NUDGE_MM = 0.5;

export type PositionControlsProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  labelWidthMm: number;
  labelHeightMm: number;
  onPatch: (updates: Record<string, number | string>) => void;
  /** When provided, text-align buttons also update the align property. */
  textAlign?: TextAlign;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function PositionControls({
  left,
  top,
  width,
  height,
  labelWidthMm,
  labelHeightMm,
  onPatch,
  textAlign,
}: PositionControlsProps) {
  const maxLeft = Math.max(0, labelWidthMm - width);
  const maxTop = Math.max(0, labelHeightMm - height);

  const nudge = (dx: number, dy: number) => {
    onPatch({
      left: clamp(left + dx, 0, maxLeft),
      top: clamp(top + dy, 0, maxTop),
    });
  };

  const alignTo = (kind: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'center') => {
    switch (kind) {
      case 'left':
        onPatch({ left: 0, ...(textAlign !== undefined ? { align: 'left' as TextAlign } : {}) });
        break;
      case 'right':
        onPatch({
          left: maxLeft,
          ...(textAlign !== undefined ? { align: 'right' as TextAlign } : {}),
        });
        break;
      case 'top':
        onPatch({ top: 0 });
        break;
      case 'bottom':
        onPatch({ top: maxTop });
        break;
      case 'center-h':
        onPatch({
          left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
          ...(textAlign !== undefined ? { align: 'center' as TextAlign } : {}),
        });
        break;
      case 'center-v':
        onPatch({ top: clamp((labelHeightMm - height) / 2, 0, maxTop) });
        break;
      case 'center':
        onPatch({
          left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
          top: clamp((labelHeightMm - height) / 2, 0, maxTop),
        });
        break;
    }
  };

  const stretchWidth = () => {
    onPatch({ left: 0, width: labelWidthMm });
  };

  const padBtn = (icon: IconName, onPress: () => void) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.padBtn, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor="#556473" size={18} />
    </Pressable>
  );

  const gridBtn = (icon: IconName, onPress: () => void) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.gridBtn, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor="#556473" size={17} />
    </Pressable>
  );

  return (
    <>
      <View style={styles.positionWrap}>
        <View style={styles.padColumn}>
          {padBtn('arrowtriangle.up.fill', () => nudge(0, -NUDGE_MM))}
          <View style={styles.padMiddleRow}>
            {padBtn('arrowtriangle.left.fill', () => nudge(-NUDGE_MM, 0))}
            <Pressable
              onPress={() => alignTo('center')}
              style={({ pressed }) => [styles.padBtn, styles.padCenter, pressed && styles.pressed]}>
              <SymbolView name="checkmark" tintColor="#556473" size={16} />
            </Pressable>
            {padBtn('arrowtriangle.right.fill', () => nudge(NUDGE_MM, 0))}
          </View>
          {padBtn('arrowtriangle.down.fill', () => nudge(0, NUDGE_MM))}
        </View>
        <View style={styles.alignGrid}>
          {gridBtn('align.vertical.center', () => alignTo('center-v'))}
          {gridBtn('align.horizontal.center', () => alignTo('center-h'))}
          {gridBtn('arrow.up.left.and.arrow.down.right', () => alignTo('center'))}
          {gridBtn('text.alignleft', () => alignTo('left'))}
          {gridBtn('text.aligncenter', () => alignTo('center-h'))}
          {gridBtn('text.alignright', () => alignTo('right'))}
          {gridBtn('arrow.left.and.right', stretchWidth)}
          {gridBtn('align.vertical.top', () => alignTo('top'))}
          {gridBtn('align.vertical.center', () => alignTo('center-v'))}
          {gridBtn('align.vertical.bottom', () => alignTo('bottom'))}
          {gridBtn('arrow.up.and.down', () => onPatch({ top: maxTop }))}
        </View>
      </View>
      <View style={styles.positionActions}>
        {(
          [
            ['arrow.left.to.line', () => alignTo('left')] as const,
            ['arrow.right.to.line', () => alignTo('right')] as const,
            ['arrow.up.left.and.arrow.down.right', () => {
              onPatch({ left: 0, top: 0, width: labelWidthMm });
            }] as const,
            ['arrow.down.right.and.arrow.up.left', () => alignTo('center')] as const,
          ] satisfies [IconName, () => void][]
        ).map(([icon, onPress]) => (
          <Pressable
            key={icon}
            onPress={onPress}
            style={({ pressed }) => [styles.positionActionBtn, pressed && styles.pressed]}>
            <SymbolView name={icon} tintColor="#556473" size={20} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  padColumn: {
    alignItems: 'center',
    gap: 6,
  },
  padMiddleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  padBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: {
    backgroundColor: '#E8ECF1',
  },
  alignGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridBtn: {
    width: '22%',
    minWidth: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  positionActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
