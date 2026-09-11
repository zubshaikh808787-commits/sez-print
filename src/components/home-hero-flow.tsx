import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const SLIDES = [
  require('../../assets/images/home/files.jpg'),
  require('../../assets/images/home/folders-blue.jpg'),
  require('../../assets/images/home/cut.jpg'),
  require('../../assets/images/home/scan.jpg'),
  require('../../assets/images/home/write.jpg'),
  require('../../assets/images/home/import.jpg'),
  require('../../assets/images/home/folders-purple.jpg'),
];

const CYCLE_MS = 4200;

function wrapDist(progress: number, index: number, count: number) {
  'worklet';
  let d = progress - index;
  d = ((d % count) + count) % count;
  return d;
}

function HeroSlide({
  source,
  index,
  count,
  progress,
}: {
  source: number;
  index: number;
  count: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const d = wrapDist(progress.value, index, count);
    const fade = 0.2;
    let opacity = 0;
    if (d <= 1 - fade) opacity = 1;
    else if (d < 1) opacity = (1 - d) / fade;
    else if (d > count - fade) opacity = (d - (count - fade)) / fade;

    const local = Math.min(d, 1);
    const scale = interpolate(local, [0, 1], [1.04, 1.12], Extrapolation.CLAMP);
    const translateX = interpolate(local, [0, 1], [10, -18], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }, { translateX }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

/** Looping hero behind the home Connect control. Isolated to the header band. */
export function HomeHeroFlow() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(SLIDES.length, {
        duration: SLIDES.length * CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {SLIDES.map((source, index) => (
        <HeroSlide
          key={index}
          source={source}
          index={index}
          count={SLIDES.length}
          progress={progress}
        />
      ))}
      <View pointerEvents="none" style={styles.veil} />
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 42, 68, 0.28)',
  },
});
