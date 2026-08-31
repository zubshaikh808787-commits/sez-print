import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/** Tab bar height including the system inset — use this instead of a hardcoded 50/56 dp. */
export function useTabBarPadding(extra = 0) {
  return useBottomTabBarHeight() + extra;
}
