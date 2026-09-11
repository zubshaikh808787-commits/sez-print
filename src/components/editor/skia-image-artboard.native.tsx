import { Canvas, Image, Rect, useImage } from '@shopify/react-native-skia';

import { SkiaImageArtboardChrome, type SkiaImageArtboardChromeProps } from './skia-image-artboard-chrome';
import { mmBoxToSkiaRect } from '@/lib/editor/skia-prototype';

type Props = Omit<SkiaImageArtboardChromeProps, 'children'> & {
  imageSource: number;
};

/** Native Skia draw path for Phase 8. Gestures stay on RNGH overlay. */
export function SkiaImageArtboard({
  widthMm,
  heightMm,
  pxPerMm,
  image,
  onImageChange,
  imageSource,
}: Props) {
  const skiaImage = useImage(imageSource);
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
      <Canvas style={{ width: canvasW, height: canvasH, pointerEvents: 'none' }}>
        <Rect x={0} y={0} width={canvasW} height={canvasH} color="#E6EBEF" />
        {skiaImage ? (
          <Image
            image={skiaImage}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fit="fill"
          />
        ) : (
          <Rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} color="#CBD5E1" />
        )}
      </Canvas>
    </SkiaImageArtboardChrome>
  );
}
