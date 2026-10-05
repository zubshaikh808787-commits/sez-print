import Svg, { Path } from 'react-native-svg';

const SHIELD = 'M12 2.5 L19.5 5.4 V11 C19.5 15.9 16.4 19.8 12 21.5 C7.6 19.8 4.5 15.9 4.5 11 V5.4 Z';

/** Shield: filled with a check when on, empty outline when off. */
export function SafeModeIcon({ active, color, size = 18 }: { active: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={SHIELD}
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {active ? (
        <Path
          d="M8.4 11.8 L11 14.4 L15.8 9.4"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

/** Printed sheet with a grid: filled with white rules when on, outline when off. */
export function PrintGridIcon({ active, color, size = 18 }: { active: boolean; color: string; size?: number }) {
  const rule = active ? '#FFFFFF' : color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M7 2.5 H14.5 L19.5 7.5 V19.5 A2 2 0 0 1 17.5 21.5 H7 A2 2 0 0 1 5 19.5 V4.5 A2 2 0 0 1 7 2.5 Z"
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M14.5 2.5 V7.5 H19.5" fill="none" stroke={rule} strokeWidth={1.4} strokeLinejoin="round" />
      <Path
        d="M9.8 10.5 V20.6 M14.6 10.5 V20.6 M5.8 12.2 H18.7 M5.8 16.6 H18.7"
        stroke={rule}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}
