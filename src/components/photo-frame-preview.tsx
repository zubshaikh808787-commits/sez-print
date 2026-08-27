import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PhotoFrameDef } from '@/constants/photo-frames';

type Props = {
  frame: PhotoFrameDef;
  /** Photos assigned to slots (uri). Missing slots show gray placeholders. */
  photos?: (string | null)[];
  width: number;
  style?: StyleProp<ViewStyle>;
};

function Slot({
  frame,
  uri,
  left,
  top,
  width,
  height,
  dashed,
}: {
  frame: PhotoFrameDef;
  uri?: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
  dashed?: boolean;
}) {
  return (
    <View
      style={[
        styles.slot,
        {
          left,
          top,
          width,
          height,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: frame.style === 'cartoon' ? '#F5A623' : '#FFFFFF',
          borderWidth: frame.style === 'cartoon' ? 3 : frame.style.startsWith('sticker') ? 0 : 2,
          borderRadius: frame.style === 'cartoon' ? 8 : 2,
        },
      ]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <View style={styles.slotEmpty} />
      )}
    </View>
  );
}

function Sprockets({ height, side }: { height: number; side: 'left' | 'right' }) {
  const count = Math.max(8, Math.floor(height / 14));
  return (
    <View style={[styles.sprocketCol, side === 'left' ? { left: 3 } : { right: 3 }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.sprocket} />
      ))}
    </View>
  );
}

/** Visual replica of Use-Frames templates for gallery + print preview. */
export function PhotoFramePreview({ frame, photos = [], width, style }: Props) {
  const height = width * (frame.heightMm / Math.max(frame.widthMm, 0.01));

  const slots = frame.slots.map((slot, i) => (
    <Slot
      key={i}
      frame={frame}
      uri={photos[i]}
      left={slot.x * width}
      top={slot.y * height}
      width={slot.w * width}
      height={slot.h * height}
      dashed={frame.style === 'cartoon'}
    />
  ));

  if (frame.style === 'cartoon') {
    return (
      <View style={[{ width, height }, styles.cartoon, style]}>
        <Text style={styles.cartoonTitle}>But cute</Text>
        <Text style={styles.cartoonDot}>✿</Text>
        {slots}
        <Text style={styles.cartoonFooter}>Record every day of your</Text>
      </View>
    );
  }

  if (frame.style === 'double-film') {
    return (
      <View style={[{ width, height }, styles.filmDark, style]}>
        <Sprockets height={height} side="left" />
        <Sprockets height={height} side="right" />
        <Text style={styles.filmTitle}>LOVELY BARBIE</Text>
        <View style={styles.filmMetaRow}>
          <Text style={styles.filmMeta}>📷 PHOTOGRAPH</Text>
          <Text style={styles.filmMeta}>🔍</Text>
        </View>
        {slots}
        <Text style={styles.filmScript}>Record every day of your</Text>
      </View>
    );
  }

  if (frame.style === 'post') {
    return (
      <View style={[{ width, height }, styles.post, style]}>
        <View style={styles.postTop}>
          <Text style={styles.postIcon}>📷</Text>
          <Text style={styles.postIcon}>➤</Text>
        </View>
        {slots}
        <View style={styles.postActions}>
          <Text style={styles.heart}>❤</Text>
          <Text style={styles.postIconSm}>💬</Text>
          <Text style={styles.postIconSm}>🔖</Text>
          <Text style={[styles.postIconSm, { marginLeft: 'auto' }]}>···</Text>
        </View>
        <Text style={styles.postLikes}>❤ 6988 Likes</Text>
        <Text style={styles.postCaption}>Memorial : Nice to meet U</Text>
        <Text style={styles.postTags}>#Fashion# #Love# #Unique art#</Text>
      </View>
    );
  }

  if (frame.style === 'film') {
    return (
      <View style={[{ width, height }, styles.filmClassic, style]}>
        <Sprockets height={height} side="left" />
        <Sprockets height={height} side="right" />
        <Text style={styles.enjoy}>
          {'ENJOY YOUR DAY'.split('').map((ch, i) => (
            <Text
              key={i}
              style={{
                color: ['#F472B6', '#34D399', '#60A5FA', '#A78BFA', '#FB923C', '#F87171'][i % 6],
              }}>
              {ch === ' ' ? '  ' : ch}
            </Text>
          ))}
        </Text>
        <View style={styles.filmHud}>
          <Text style={styles.filmHudText}>100  AI/01</Text>
          <Text style={styles.filmHudText}>4 : 3</Text>
        </View>
        {slots}
        <View style={styles.filmBottom}>
          <View>
            <Text style={styles.filmNum}>150800</Text>
            <Text style={styles.filmNum}>1000/0520</Text>
          </View>
          <Text style={styles.sweet}>SWEET MEMORIES</Text>
        </View>
      </View>
    );
  }

  if (frame.style === 'instant') {
    return (
      <View style={[{ width, height }, styles.instant, style]}>
        {slots}
        <View style={styles.instantFooter} />
      </View>
    );
  }

  // sticker variants — white page with gray photo slots
  return (
    <View style={[{ width, height }, styles.sticker, style]}>{slots}</View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#B8BFC7',
  },
  slotEmpty: {
    flex: 1,
    backgroundColor: '#B8BFC7',
  },
  cartoon: {
    backgroundColor: '#F7E329',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#F5A623',
    overflow: 'hidden',
  },
  cartoonTitle: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: '#E11D48',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  cartoonDot: {
    position: 'absolute',
    top: 12,
    right: 18,
    fontSize: 12,
    color: '#F472B6',
  },
  cartoonFooter: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    fontSize: 10,
    color: '#334155',
    fontWeight: '500',
  },
  filmDark: {
    backgroundColor: '#0F2A3A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  filmClassic: {
    backgroundColor: '#111827',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#000000',
  },
  sprocketCol: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 8,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  sprocket: {
    width: 7,
    height: 9,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  filmTitle: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  filmMetaRow: {
    position: 'absolute',
    top: 32,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filmMeta: { color: '#E2E8F0', fontSize: 9 },
  filmScript: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    right: 16,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 11,
    fontStyle: 'italic',
  },
  post: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    paddingBottom: 8,
  },
  postTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  postIcon: { fontSize: 14 },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  heart: { color: '#EF4444', fontSize: 14 },
  postIconSm: { fontSize: 13, color: '#111827' },
  postLikes: {
    paddingHorizontal: 10,
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  postCaption: {
    paddingHorizontal: 10,
    marginTop: 2,
    fontSize: 11,
    color: '#111827',
  },
  postTags: {
    paddingHorizontal: 10,
    marginTop: 2,
    fontSize: 11,
    color: '#2563EB',
  },
  enjoy: {
    position: 'absolute',
    top: 8,
    left: 14,
    right: 14,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  filmHud: {
    position: 'absolute',
    top: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filmHudText: { color: '#E5E7EB', fontSize: 9 },
  filmBottom: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  filmNum: { color: '#FFFFFF', fontSize: 9, fontWeight: '500' },
  sweet: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  instant: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  instantFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '22%',
    backgroundColor: '#FFFFFF',
  },
  sticker: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
});
