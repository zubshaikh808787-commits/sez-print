import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette } from '@/constants/ui';
import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import {
  ninePointToOffsetNorm,
  parsePageRange,
  type NinePoint,
  type PageScope,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';

const WORD_PRESETS = ['CONFIDENTIAL', 'SAMPLE', 'PAID', 'DRAFT', 'COPY', 'URGENT'];

const COLOR_PRESETS = [
  { label: 'Red', hex: '#DC2626' },
  { label: 'Slate', hex: '#1F2937' },
  { label: 'Blue', hex: '#2563EB' },
  { label: 'Green', hex: '#059669' },
  { label: 'Gold', hex: '#D97706' },
];

const DENSITY_PRESETS = [
  { label: 'Dense (5×5)', val: 0.16 },
  { label: 'Normal (4×4)', val: 0.24 },
  { label: 'Spaced (3×3)', val: 0.33 },
  { label: 'Sparse (2×2)', val: 0.45 },
];

const STAMP_SIZE_PRESETS = [
  { label: 'Small', val: 0.25 },
  { label: 'Medium', val: 0.38 },
  { label: 'Large', val: 0.55 },
  { label: 'Max', val: 0.75 },
];

const OPACITY_PRESETS = [
  { label: '20%', val: 0.2 },
  { label: '35%', val: 0.35 },
  { label: '50%', val: 0.5 },
  { label: '70%', val: 0.7 },
];

export function PdfWatermarkTool({
  value,
  pageCount,
  onChange,
  onPickImage,
}: {
  value: PdfWatermark;
  pageCount: number;
  onChange: (next: PdfWatermark) => void;
  onPickImage: (uri: string) => void;
}) {
  const rangeError =
    value.scope.mode === 'range'
      ? parsePageRange(String(value.scope.start), String(value.scope.end), pageCount).error
      : undefined;

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    onPickImage(res.assets[0].uri);
  };

  const setAnchor = (anchor: NinePoint) => {
    const offsetNorm = ninePointToOffsetNorm(anchor);
    onChange({
      ...value,
      stamp: {
        anchor,
        offsetNorm,
        sizeNorm: value.stamp?.sizeNorm ?? 0.38,
      },
    });
  };

  const currentColor = value.text?.color || '#DC2626';

  return (
    <View style={styles.wrap}>
      {/* Mode Switches */}
      <View style={styles.row}>
        <Seg label="Text" on={value.type === 'text'} onPress={() => onChange({ ...value, type: 'text' })} />
        <Seg label="Image" on={value.type === 'image'} onPress={() => onChange({ ...value, type: 'image' })} />
      </View>
      <View style={styles.row}>
        <Seg
          label="Single Stamp"
          on={value.layout === 'stamp'}
          onPress={() => onChange({ ...value, layout: 'stamp' })}
        />
        <Seg
          label="Tiled Pattern"
          on={value.layout === 'tiled'}
          onPress={() => onChange({ ...value, layout: 'tiled' })}
        />
      </View>

      {/* Text or Image Configuration */}
      {value.type === 'text' ? (
        <View style={styles.block}>
          <TextInput
            value={value.text?.content ?? ''}
            onChangeText={(content) =>
              onChange({
                ...value,
                text: { content, fontSizePt: value.text?.fontSizePt ?? 22, color: currentColor },
              })
            }
            placeholder="Watermark text"
            style={styles.input}
          />
          {/* Quick Word Presets */}
          <View style={styles.presetsRow}>
            {WORD_PRESETS.map((word) => (
              <Pressable
                key={word}
                onPress={() =>
                  onChange({
                    ...value,
                    text: { content: word, fontSizePt: value.text?.fontSizePt ?? 22, color: currentColor },
                  })
                }
                style={[styles.wordChip, value.text?.content === word && styles.wordChipActive]}>
                <Text style={[styles.wordChipText, value.text?.content === word && styles.wordChipTextActive]}>
                  {word}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Color Presets */}
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {COLOR_PRESETS.map((c) => {
              const active = currentColor === c.hex;
              return (
                <Pressable
                  key={c.hex}
                  onPress={() =>
                    onChange({
                      ...value,
                      text: {
                        content: value.text?.content || 'WATERMARK',
                        fontSizePt: value.text?.fontSizePt ?? 22,
                        color: c.hex,
                      },
                    })
                  }
                  style={[styles.colorBtn, active && styles.colorBtnActive]}>
                  <View style={[styles.colorDot, { backgroundColor: c.hex }]} />
                  <Text style={[styles.colorText, active && styles.colorTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Pressable onPress={pick} style={styles.pick}>
          <Text style={styles.pickText}>{value.image?.sourceUri ? 'Change image' : 'Choose image'}</Text>
        </Pressable>
      )}

      {/* Single Stamp vs Tiled Pattern Settings */}
      {value.layout === 'stamp' ? (
        <View style={styles.block}>
          <Text style={styles.label}>Position</Text>
          <View style={styles.locationGrid}>
            {ANCHOR_ITEMS.map((item) => {
              const active = value.stamp?.anchor === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setAnchor(item.id)}
                  style={[styles.locationBtn, active && styles.locationBtnActive]}>
                  <View style={[styles.alignmentDot, active && styles.alignmentDotActive]} />
                  <Text style={[styles.locationLabel, active && styles.locationLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.dragHintRow}>
            <View style={styles.dragDot} />
            <Text style={styles.dragHintText}>
              Watermark is draggable — you can tap a position above or drag it freely on the page preview.
            </Text>
          </View>

          <Text style={styles.label}>Stamp Size ({Math.round((value.stamp?.sizeNorm ?? 0.38) * 100)}%)</Text>
          <View style={styles.presetsRow}>
            {STAMP_SIZE_PRESETS.map((p) => {
              const active = Math.abs((value.stamp?.sizeNorm ?? 0.38) - p.val) < 0.05;
              return (
                <Pressable
                  key={p.label}
                  onPress={() =>
                    onChange({
                      ...value,
                      stamp: {
                        anchor: value.stamp?.anchor ?? 'center',
                        offsetNorm: value.stamp?.offsetNorm ?? { x: 0.5, y: 0.5 },
                        sizeNorm: p.val,
                      },
                    })
                  }
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        /* Tiled Pattern Controls */
        <View style={styles.block}>
          <Text style={styles.label}>Tile Density & Grid</Text>
          <View style={styles.presetsRow}>
            {DENSITY_PRESETS.map((p) => {
              const active = Math.abs((value.tiled?.spacingNorm?.x ?? 0.24) - p.val) < 0.04;
              return (
                <Pressable
                  key={p.label}
                  onPress={() =>
                    onChange({
                      ...value,
                      tiled: { spacingNorm: { x: p.val, y: p.val } },
                    })
                  }
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <Seg
              label="− Denser"
              on={false}
              onPress={() => {
                const s = value.tiled?.spacingNorm ?? { x: 0.24, y: 0.24 };
                onChange({
                  ...value,
                  tiled: { spacingNorm: { x: Math.max(0.1, s.x - 0.04), y: Math.max(0.1, s.y - 0.04) } },
                });
              }}
            />
            <Seg
              label="+ Looser"
              on={false}
              onPress={() => {
                const s = value.tiled?.spacingNorm ?? { x: 0.24, y: 0.24 };
                onChange({
                  ...value,
                  tiled: { spacingNorm: { x: Math.min(0.5, s.x + 0.04), y: Math.min(0.5, s.y + 0.04) } },
                });
              }}
            />
          </View>
        </View>
      )}

      {/* Opacity */}
      <Text style={styles.label}>Opacity ({Math.round(value.opacity * 100)}%)</Text>
      <View style={styles.presetsRow}>
        {OPACITY_PRESETS.map((p) => {
          const active = Math.abs(value.opacity - p.val) < 0.06;
          return (
            <Pressable
              key={p.label}
              onPress={() => onChange({ ...value, opacity: p.val })}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Rotation */}
      <Text style={styles.label}>Rotation ({value.rotationDeg}°)</Text>
      <View style={styles.row}>
        {[-45, -30, 0, 30, 45, 90].map((d) => (
          <Seg
            key={d}
            label={`${d}°`}
            on={value.rotationDeg === d}
            onPress={() => onChange({ ...value, rotationDeg: d })}
          />
        ))}
      </View>

      {/* Page Scope */}
      <PdfScopeSelector
        scope={value.scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(scope) => {
          if (scope.mode === 'range') {
            const parsed = parsePageRange(String(scope.start), String(scope.end), pageCount);
            onChange({ ...value, scope: { mode: 'range', start: parsed.start, end: parsed.end } });
            return;
          }
          onChange({ ...value, scope });
        }}
      />
    </View>
  );
}

function Seg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, on && styles.segOn]}>
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

const ANCHOR_ITEMS: { id: NinePoint; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'middle-left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'middle-right', label: 'Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  block: { gap: 8 },
  label: { fontSize: 12, color: Palette.ink, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Palette.ink,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordChip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
  },
  wordChipActive: {
    borderColor: Palette.accent,
    backgroundColor: '#E7F7F9',
  },
  wordChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: Palette.actionText,
  },
  wordChipTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  colorBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
  },
  colorBtnActive: {
    borderColor: Palette.accent,
    backgroundColor: '#E7F7F9',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorText: {
    fontSize: 10,
    color: Palette.actionText,
    fontWeight: '500',
  },
  colorTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  pick: {
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  pickText: { color: Palette.accent, fontWeight: '600' },
  locationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  locationBtn: {
    width: '31%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  locationBtnActive: {
    borderColor: Palette.accent,
    backgroundColor: '#E7F7F9',
  },
  alignmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.hairline,
  },
  alignmentDotActive: {
    backgroundColor: Palette.accent,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Palette.actionText,
    textAlign: 'center',
  },
  locationLabelActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  dragHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  dragDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Palette.accent,
  },
  dragHintText: {
    flex: 1,
    fontSize: 11,
    color: Palette.muted,
    lineHeight: 15,
  },
  chip: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.cardTop,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: Palette.accent,
    backgroundColor: '#E7F7F9',
  },
  chipText: {
    fontSize: 11,
    color: Palette.actionText,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Palette.accent,
    fontWeight: '700',
  },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  segOn: { borderColor: Palette.accent, backgroundColor: '#E7F7F9' },
  segText: { fontSize: 12, color: Palette.actionText },
  segTextOn: { color: Palette.accent, fontWeight: '600' },
});
