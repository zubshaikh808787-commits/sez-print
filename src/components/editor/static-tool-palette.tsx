/**
 * Statically pre-laid-out tool palette block.
 * Contains all 4 rows of tools (Text through Signature) at their natural fixed height.
 * Always fully rendered and mounted; visibility is clipped purely by the parent sheet container.
 * Wrapped in React.memo so sheet height changes never trigger re-renders or layout re-flexes.
 */

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ToolMenuIcon } from '@/components/editor/editor-menu-icons';
import { PaletteToolItem } from '@/components/editor/palette-tool-item';
import { paletteDropTypeForLabel } from '@/lib/editor/palette-drop';
import type { ElementType } from '@/lib/label-document';
import type { AppIconName } from '@/components/app-icon';

export const STATIC_PALETTE_CONTENT_HEIGHT = 270;

export const TOOL_ROWS: { icon: AppIconName; label: string }[][] = [
  [
    { icon: 'textformat', label: 'Text' },
    { icon: 'barcode', label: 'Barcode' },
    { icon: 'qrcode', label: 'QRCode' },
    { icon: 'photo', label: 'Image' },
    { icon: 'photo.artframe', label: 'Clipart' },
  ],
  [
    { icon: 'line.diagonal', label: 'Line' },
    { icon: 'square.on.circle', label: 'Shapes' },
    { icon: 'tablecells', label: 'Table' },
    { icon: 'clock', label: 'Time' },
    { icon: 'character', label: 'ArcText' },
  ],
  [
    { icon: 'list.number', label: 'Counter' },
    { icon: 'tablecells.badge.ellipsis', label: 'Excel' },
    { icon: 'viewfinder', label: 'Scan' },
    { icon: 'eye', label: 'OCR' },
    { icon: 'mic', label: 'ASR' },
  ],
  [
    { icon: 'square.on.square', label: 'Label Clone' },
    { icon: 'rectangle.split.2x1', label: '2ups Label' },
    { icon: 'square.dashed', label: 'Border' },
    { icon: 'signature', label: 'Signature' },
  ],
];

type StaticToolPaletteProps = {
  onToolPress: (label: string) => void;
  onBeginDrag?: (type: ElementType, label: string, icon: AppIconName, x: number, y: number) => void;
  onMoveDrag?: (x: number, y: number) => void;
  onEndDrag?: (x: number, y: number) => void;
};

export const StaticToolPalette = memo(function StaticToolPalette({
  onToolPress,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
}: StaticToolPaletteProps) {
  return (
    <View style={styles.toolsContainer} collapsable={false}>
      {TOOL_ROWS.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.toolRow}>
          {row.map((t) => {
            const dropType = paletteDropTypeForLabel(t.label);
            return (
              <View key={t.label} style={styles.toolCell}>
                {dropType && onBeginDrag && onMoveDrag && onEndDrag ? (
                  <PaletteToolItem
                    icon={t.icon}
                    label={t.label}
                    style={styles.toolItem}
                    onPress={() => onToolPress(t.label)}
                    onDragStart={(x, y) => onBeginDrag(dropType, t.label, t.icon, x, y)}
                    onDragMove={onMoveDrag}
                    onDragEnd={onEndDrag}
                  />
                ) : (
                  <Pressable
                    onPress={() => onToolPress(t.label)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={({ pressed }) => [styles.toolItem, pressed && styles.pressed]}>
                    <ToolMenuIcon name={t.label} size={32} />
                    <Text numberOfLines={1} style={styles.toolLabel}>
                      {t.label}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {Array.from({ length: Math.max(0, 5 - row.length) }).map((_, i) => (
            <View key={`spacer-${rowIndex}-${i}`} style={styles.toolCell} pointerEvents="none" />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  toolsContainer: {
    width: '100%',
    height: STATIC_PALETTE_CONTENT_HEIGHT,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  toolRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toolCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  toolItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#475569',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
