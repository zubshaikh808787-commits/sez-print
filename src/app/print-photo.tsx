import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { PhotoFramePreview } from '@/components/photo-frame-preview';
import { getPhotoFrame } from '@/constants/photo-frames';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette, cardShadow } from '@/constants/ui';
import {
  encodeEscPosJob,
  grayToBits,
  pngBase64ToGray,
  rotateGray,
  shiftBits,
} from '@/lib/printer/escpos';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { encodeTscBitmapJob } from '@/lib/printer/tsc';
import { PRINT_DOTS_PER_MM } from '@/lib/label-geometry';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent'] as const;
const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;

type ColorMode = (typeof COLOR_MODES)[number];

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  valueColor = Palette.accent,
  bordered,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  valueColor?: string;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.stepRow, bordered && styles.stepRowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          style={({ pressed }) => [
            styles.stepCircle,
            minusDisabled && styles.stepCircleMuted,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepGlyph, minusDisabled && styles.stepGlyphMuted]}>−</Text>
        </Pressable>
        <Text style={[styles.stepValue, { color: valueColor }]}>{value}</Text>
        <Pressable
          disabled={plusDisabled}
          onPress={onPlus}
          style={({ pressed }) => [
            styles.stepCircle,
            styles.stepCircleAccent,
            plusDisabled && styles.stepCircleMuted,
            pressed && !plusDisabled && styles.pressed,
          ]}>
          <Text style={styles.stepGlyphAccent}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PrintPhotoScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    mode?: string;
    frameId?: string;
    imageUri?: string;
  }>();

  const defaults = useSettingsStore((s) => s.defaults);
  const printingSettings = useSettingsStore((s) => s.printing);
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const addHistoryEntry = usePrinterStore((s) => s.addHistoryEntry);
  const connected = status === 'connected';

  const frame = getPhotoFrame(params.frameId);
  const isFrame = params.mode === 'frame' && !!frame;

  const [photos, setPhotos] = useState<(string | null)[]>(() => {
    if (params.imageUri) {
      const count = frame?.slots.length ?? 1;
      return Array.from({ length: count }, (_, i) => (i === 0 ? params.imageUri! : null));
    }
    return Array.from({ length: frame?.slots.length ?? 1 }, () => null);
  });

  const [colorMode, setColorMode] = useState<ColorMode>(
    (defaults.colorMode as ColorMode) || 'Halftone',
  );
  const [grayThreshold, setGrayThreshold] = useState(defaults.grayThreshold ?? 128);
  const [copies, setCopies] = useState(1);
  const [darkness, setDarkness] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>('0°');
  const [paperType, setPaperType] = useState<(typeof PAPER_TYPES)[number]>(defaults.paperType);
  const [gapLength, setGapLength] = useState(3);
  const [hOffset, setHOffset] = useState(0);
  const [vOffset, setVOffset] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [antiColor, setAntiColor] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [footerHeight, setFooterHeight] = useState(72);

  const shotRef = useRef<ViewShot>(null);
  const contentWidth = Math.min(width, MaxContentWidth);
  const previewWidth = Math.min(contentWidth - 48, isFrame ? 200 : 260);

  const primaryPhoto = photos.find((p) => !!p) ?? null;

  const pickPhoto = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.95,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = res.assets[0].uri;
      setPhotos((prev) => {
        const next = [...prev];
        const empty = next.findIndex((p) => !p);
        if (empty >= 0) next[empty] = uri;
        else next[0] = uri;
        return next;
      });
    } catch {
      Alert.alert('Notice', 'Unable to open photo library.');
    }
  }, []);

  const clearPhoto = useCallback((index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  const handlePrint = useCallback(async () => {
    if (!primaryPhoto && !isFrame) {
      Alert.alert('Add a photo', 'Please add a photo before printing.');
      return;
    }
    if (isFrame && photos.every((p) => !p)) {
      Alert.alert('Add a photo', 'To use a photo frame, add at least one photo.');
      return;
    }

    const manager = getPrinterManager();
    if (!manager.isConnected) {
      Alert.alert('Printer Not Connected', 'Connect your TD-404 (Bluetooth or Wi‑Fi) before printing.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Connect', onPress: () => router.push('/printer-connect') },
      ]);
      return;
    }

    setPrinting(true);
    try {
      const widthMm = frame?.widthMm ?? defaults.labelWidth;
      const heightMm = frame?.heightMm ?? defaults.labelHeight;
      const targetW = Math.round(widthMm * PRINT_DOTS_PER_MM);
      const targetH = Math.round(heightMm * PRINT_DOTS_PER_MM);
      const orientationDeg = parseInt(orientation.replace('°', ''), 10) as 0 | 90 | 180 | 270;
      const dither = colorMode === 'Halftone';
      const threshold =
        colorMode === 'Original'
          ? 200
          : Math.min(250, Math.max(10, grayThreshold + (darkness != null ? (darkness - 8) * 10 : 0)));

      const base64 = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: 'base64',
        width: targetW,
        height: targetH,
      });

      let gray = pngBase64ToGray(base64);
      if (flipH) {
        const { width: gw, height: gh, gray: data } = gray;
        const flipped = new Uint8Array(data.length);
        for (let y = 0; y < gh; y += 1) {
          for (let x = 0; x < gw; x += 1) {
            flipped[y * gw + (gw - 1 - x)] = data[y * gw + x];
          }
        }
        gray = { width: gw, height: gh, gray: flipped };
      }
      if (antiColor) {
        const inverted = new Uint8Array(gray.gray.length);
        for (let i = 0; i < gray.gray.length; i += 1) inverted[i] = 255 - gray.gray[i];
        gray = { ...gray, gray: inverted };
      }

      gray = rotateGray(gray, orientationDeg);
      let bits = grayToBits(gray, { threshold, dither: dither || colorMode === 'B & W' });
      const offsetDots = Math.round(hOffset * PRINT_DOTS_PER_MM);
      if (offsetDots !== 0) bits = shiftBits(bits, offsetDots);

      const bytes = manager.usesTd404CommandSet
        ? encodeTscBitmapJob(bits, {
            widthMm,
            heightMm,
            gapMm: gapLength,
            copies,
            density: darkness,
          })
        : encodeEscPosJob(bits, {
            copies,
            leadFeedLines: Math.max(0, Math.round(vOffset * PRINT_DOTS_PER_MM)),
            trailFeedLines: Math.max(0, Math.round(gapLength * PRINT_DOTS_PER_MM)),
            density: darkness,
            speed,
          });
      await manager.print(bytes);

      if (printingSettings.recordHistory) {
        addHistoryEntry({
          labelName: frame?.name ?? 'Print Photo',
          copies,
          source: 'photo',
        });
      }
      Alert.alert('Print Sent', `Job sent to ${deviceName ?? 'the printer'}.`);
      if (printingSettings.returnPrevious) router.back();
    } catch (error) {
      Alert.alert(
        'Print Failed',
        error instanceof Error ? error.message : 'Could not send data to the printer.',
      );
    } finally {
      setPrinting(false);
    }
  }, [
    primaryPhoto,
    isFrame,
    photos,
    frame,
    defaults.labelWidth,
    defaults.labelHeight,
    orientation,
    colorMode,
    grayThreshold,
    darkness,
    speed,
    flipH,
    antiColor,
    hOffset,
    vOffset,
    gapLength,
    copies,
    printingSettings.recordHistory,
    printingSettings.returnPrevious,
    addHistoryEntry,
    deviceName,
  ]);

  const thresholdPct = useMemo(() => grayThreshold / 255, [grayThreshold]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/printer-connect')}
          style={({ pressed }) => [
            styles.connection,
            connected && styles.connectionConnected,
            pressed && styles.pressed,
          ]}>
          <Text numberOfLines={1} style={styles.connectionText}>
            {connected
              ? deviceName ?? 'Connected'
              : status === 'connecting'
                ? 'Connecting…'
                : 'Unconnected'}
          </Text>
          <AppIcon name="link" tintColor="#FFFFFF" size={14} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: footerHeight + Spacing.three,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.previewArea}>
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
            {isFrame && frame ? (
              <PhotoFramePreview frame={frame} photos={photos} width={previewWidth} />
            ) : primaryPhoto ? (
              <View
                style={[
                  styles.directPreview,
                  {
                    width: previewWidth,
                    height: previewWidth * ((defaults.labelHeight || 40) / (defaults.labelWidth || 50)),
                  },
                ]}>
                <Image
                  source={{ uri: primaryPhoto }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View style={[styles.directPreview, { width: previewWidth, height: previewWidth * 0.75 }]}>
                <Text style={styles.placeholderHint}>Add a photo to preview</Text>
              </View>
            )}
          </ViewShot>
        </View>

        <Pressable
          onPress={pickPhoto}
          style={({ pressed }) => [styles.addPhotoCard, { width: contentWidth - 24 }, pressed && styles.pressed]}>
          {primaryPhoto ? (
            <View style={styles.thumbWrap}>
              <Image source={{ uri: primaryPhoto }} style={styles.thumb} contentFit="cover" />
              <Pressable
                hitSlop={8}
                onPress={() => clearPhoto(photos.findIndex((p) => p === primaryPhoto))}
                style={styles.thumbClear}>
                <Text style={styles.thumbClearX}>×</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.thumbEmpty} />
          )}
          <Text style={styles.addPhotoText}>Add photo</Text>
          <AppIcon name="chevron.right" tintColor="#94A3B8" size={16} />
        </Pressable>

        {isFrame ? (
          <Text style={styles.hint}>
            To use a photo frame, you must use the specified label supplies to print the corresponding
            effect.
          </Text>
        ) : null}

        <View style={[styles.card, { width: contentWidth - 24 }]}>
          <Text style={styles.groupLabel}>Color Mode</Text>
          <ChipGroup options={COLOR_MODES} selected={colorMode} onSelect={setColorMode} />
          <View style={styles.sliderRow}>
            <Text style={styles.rowLabel}>Gray Threshold</Text>
            <Text style={styles.sliderValue}>{grayThreshold}</Text>
          </View>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${thresholdPct * 100}%` }]} />
            <Pressable
              style={[styles.sliderThumb, { left: `${thresholdPct * 100}%` }]}
              onPress={() => undefined}
            />
          </View>
          <View style={styles.sliderButtons}>
            <Pressable
              onPress={() => setGrayThreshold((v) => Math.max(0, v - 8))}
              style={({ pressed }) => [styles.tinyBtn, pressed && styles.pressed]}>
              <Text style={styles.tinyBtnText}>−</Text>
            </Pressable>
            <Pressable
              onPress={() => setGrayThreshold((v) => Math.min(255, v + 8))}
              style={({ pressed }) => [styles.tinyBtn, pressed && styles.pressed]}>
              <Text style={styles.tinyBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { width: contentWidth - 24 }]}>
          <StepperRow
            label="Number of Copies"
            value={String(copies)}
            minusDisabled={copies <= 1}
            onMinus={() => setCopies((n) => Math.max(1, n - 1))}
            onPlus={() => setCopies((n) => n + 1)}
          />
        </View>

        <View style={[styles.card, { width: contentWidth - 24 }]}>
          <StepperRow
            label="Print Darkness"
            value={darkness == null ? 'Auto' : String(darkness)}
            valueColor={darkness == null ? Palette.muted : Palette.accent}
            minusDisabled={darkness == null}
            plusDisabled={darkness != null && darkness >= 15}
            onMinus={() => setDarkness((d) => (d == null || d <= 1 ? null : d - 1))}
            onPlus={() => setDarkness((d) => (d == null ? 8 : Math.min(15, d + 1)))}
            bordered
          />
          <StepperRow
            label="Print Speed"
            value={speed == null ? 'Auto' : String(speed)}
            valueColor={speed == null ? Palette.muted : Palette.accent}
            minusDisabled={speed == null}
            plusDisabled={speed != null && speed >= 5}
            onMinus={() => setSpeed((s) => (s == null || s <= 1 ? null : s - 1))}
            onPlus={() => setSpeed((s) => (s == null ? 3 : Math.min(5, s + 1)))}
          />
        </View>

        <View style={[styles.card, { width: contentWidth - 24 }]}>
          <Text style={styles.groupLabel}>Orientation</Text>
          <ChipGroup options={ORIENTATIONS} selected={orientation} onSelect={setOrientation} />
          <Text style={[styles.groupLabel, styles.groupSpaced]}>Paper Type</Text>
          <ChipGroup options={PAPER_TYPES} selected={paperType} onSelect={setPaperType} />
          <StepperRow
            label="Gap Length"
            value={`${gapLength.toFixed(2)} mm`}
            minusDisabled={gapLength <= 0}
            onMinus={() => setGapLength((v) => Math.max(0, Math.round((v - 0.5) * 100) / 100))}
            onPlus={() => setGapLength((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
            bordered
          />
          <StepperRow
            label="Horizontal Offset"
            value={`${hOffset.toFixed(2)} mm`}
            onMinus={() => setHOffset((v) => Math.max(-10, Math.round((v - 0.5) * 100) / 100))}
            onPlus={() => setHOffset((v) => Math.min(10, Math.round((v + 0.5) * 100) / 100))}
            bordered
          />
          <StepperRow
            label="Vertical Offset"
            value={`${vOffset.toFixed(2)} mm`}
            minusDisabled={vOffset <= 0}
            onMinus={() => setVOffset((v) => Math.max(0, Math.round((v - 0.5) * 100) / 100))}
            onPlus={() => setVOffset((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
            bordered
          />
          <View style={[styles.stepRow, styles.stepRowBorder]}>
            <Text style={styles.rowLabel}>Flip Horizontally</Text>
            <Switch
              value={flipH}
              onValueChange={setFlipH}
              trackColor={{ false: '#D1D5DB', true: Palette.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.rowLabel}>Anti-Color</Text>
            <Switch
              value={antiColor}
              onValueChange={setAntiColor}
              trackColor={{ false: '#D1D5DB', true: Palette.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {antiColor ? (
          <Text style={styles.hint}>When the anti-color is opened, the barcode will not be recognized.</Text>
        ) : null}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
        <Pressable
          onPress={() => router.push('/printing-settings')}
          style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
          <AppIcon name="gearshape.fill" tintColor="#FFFFFF" size={22} />
        </Pressable>
        <Pressable
          disabled={printing}
          onPress={() => void handlePrint()}
          style={({ pressed }) => [styles.printBtn, (pressed || printing) && styles.pressed]}>
          {printing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.printBtnText}>Print</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  connectionConnected: { backgroundColor: '#2E9E63' },
  connectionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  scroll: { flex: 1, width: '100%' },
  previewArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: '#D5DCE4',
  },
  directPreview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  placeholderHint: { color: Palette.muted, fontSize: 13, fontWeight: '400' },
  addPhotoCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
  },
  thumbWrap: { width: 44, height: 44 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  thumbEmpty: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  thumbClear: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbClearX: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', lineHeight: 14 },
  addPhotoText: { flex: 1, fontSize: 15, fontWeight: '500', color: Palette.ink },
  hint: {
    marginTop: 12,
    marginHorizontal: 28,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  card: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...cardShadow,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
    marginBottom: 10,
  },
  groupSpaced: { marginTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
  },
  chipActive: { backgroundColor: Palette.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: '#556473' },
  chipTextActive: { color: '#FFFFFF' },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  sliderValue: { fontSize: 14, fontWeight: '500', color: Palette.accent },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    position: 'relative',
    marginBottom: 10,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: Palette.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sliderButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  tinyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tinyBtnText: { fontSize: 16, color: Palette.ink },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  stepRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E8ED',
  },
  rowLabel: { fontSize: 14, fontWeight: '400', color: Palette.ink, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleAccent: {
    borderColor: Palette.accent,
    backgroundColor: Palette.accent,
  },
  stepCircleMuted: { opacity: 0.45 },
  stepGlyph: { fontSize: 18, color: Palette.ink, lineHeight: 20 },
  stepGlyphMuted: { color: '#94A3B8' },
  stepGlyphAccent: { fontSize: 18, color: '#FFFFFF', lineHeight: 20 },
  stepValue: {
    minWidth: 52,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#F4F5F7',
  },
  gearBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
