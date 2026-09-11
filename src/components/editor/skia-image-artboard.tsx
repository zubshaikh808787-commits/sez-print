import { Image } from 'expo-image';
import { View } from 'react-native';

import { SkiaImageArtboardChrome, type SkiaImageArtboardChromeProps } from './skia-image-artboard-chrome';
import { mmBoxToSkiaRect } from '@/lib/editor/skia-prototype';

type Props = Omit<SkiaImageArtboardChromeProps, 'children'> & {
  imageSource: number;
};

/** Web fallback: CanvasKit is not loaded. Same millimetre chrome as the Skia path. */
export function SkiaImageArtboard({
  widthMm,
  heightMm,
  pxPerMm,
  image,
  onImageChange,
  imageSource,
}: Props) {
  const canvasW = Math.max(1, widthMm * pxPerMm);
  const canvasH = Math.max(1, heightMm * pxPerMm);
  const rect = mmBoxToSkiaRect(image, pxPerMm);

  return (
    <SkiaImageArtboardChrome
      widthMm={widthMm}
      heightMm={heightMm}
      pxPerMm={pxPerMm}
      image={image}
      onImageChange={onImageChange}>
      <View style={{ width: canvasW, height: canvasH, backgroundColor: '#E6EBEF' }}>
        <Image
          source={imageSource}
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
          contentFit="fill"
        />
      </View>
    </SkiaImageArtboardChrome>
  );
}
