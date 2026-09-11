import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import {
  CHROME_HANDLE_COLOR,
  CHROME_STROKE_LIGHT,
  CHROME_STROKE_PX,
  PALETTE_GHOST_FILL,
  PALETTE_GHOST_OPACITY,
} from '@/lib/editor/canvas-chrome';

/** Small icon chip that follows the finger. Not a native / full-size drag ghost. */
export function PaletteDragGhost({
  windowX,
  windowY,
  widthPx,
  heightPx,
  overlayOrigin,
  icon,
}: {
  windowX: number;
  windowY: number;
  widthPx: number;
  heightPx: number;
  overlayOrigin: { x: number; y: number };
  icon?: AppIconName;
}) {
  const w = Math.max(8, widthPx);
  const h = Math.max(8, heightPx);
  const showIcon = h >= 16 && w >= 16 && Boolean(icon);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ghost,
        {
          left: windowX - overlayOrigin.x - w / 2,
          top: windowY - overlayOrigin.y - h / 2,
          width: w,
          height: h,
        },
      ]}>
      {showIcon && icon ? (
        <AppIcon name={icon} tintColor={CHROME_HANDLE_COLOR} size={16} weight="light" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    borderWidth: CHROME_STROKE_PX,
    borderColor: CHROME_STROKE_LIGHT,
    backgroundColor: PALETTE_GHOST_FILL,
    borderRadius: 3,
    opacity: PALETTE_GHOST_OPACITY,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
