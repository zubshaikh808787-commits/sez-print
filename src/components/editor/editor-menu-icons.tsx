import React from 'react';
import Svg, { Circle, Line, Path, Rect, Text } from 'react-native-svg';

export interface ToolMenuIconProps {
  name: string;
  size?: number;
  color?: string;
  accentColor?: string;
}

const DEFAULT_COLOR = '#64748B';
const DEFAULT_ACCENT = '#06B6D4';

export function ToolMenuIcon({
  name,
  size = 32,
  color = DEFAULT_COLOR,
  accentColor = DEFAULT_ACCENT,
}: ToolMenuIconProps) {
  switch (name) {
    case 'Text':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="3.5" y="3.5" width="25" height="25" rx="4" stroke={color} strokeWidth="1.8" fill="none" />
          <Path d="M 9.5 10.5 H 22.5 M 16 10.5 V 22.5" stroke={accentColor} strokeWidth="2.4" strokeLinecap="round" />
        </Svg>
      );

    case 'Barcode':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Line x1="5.5" y1="6" x2="5.5" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <Line x1="9.5" y1="6" x2="9.5" y2="26" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <Line x1="13" y1="6" x2="13" y2="26" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
          <Line x1="16.5" y1="6" x2="16.5" y2="26" stroke={accentColor} strokeWidth="1.4" strokeLinecap="round" />
          <Line x1="19.5" y1="6" x2="19.5" y2="26" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <Line x1="23" y1="6" x2="23" y2="26" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <Line x1="26.5" y1="6" x2="26.5" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );

    case 'QRCode':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          {/* Top-left finder */}
          <Rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.6" fill="none" />
          <Rect x="6" y="6" width="4" height="4" fill={color} />
          {/* Top-right finder */}
          <Rect x="19.5" y="3.5" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.6" fill="none" />
          <Rect x="22" y="6" width="4" height="4" fill={color} />
          {/* Bottom-left finder */}
          <Rect x="3.5" y="19.5" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.6" fill="none" />
          <Rect x="6" y="22" width="4" height="4" fill={color} />
          {/* Bottom-right data modules with cyan accents */}
          <Rect x="16" y="16" width="3" height="3" fill={accentColor} />
          <Rect x="22" y="16" width="3" height="3" fill={color} />
          <Rect x="26.5" y="16" width="2.5" height="2.5" fill={accentColor} />
          <Rect x="16" y="22" width="3" height="3" fill={color} />
          <Rect x="21" y="21" width="3.5" height="3.5" fill={accentColor} />
          <Rect x="26.5" y="21.5" width="2.5" height="2.5" fill={color} />
          <Rect x="16" y="26.5" width="3" height="2.5" fill={accentColor} />
          <Rect x="21.5" y="26.5" width="3" height="2.5" fill={color} />
          <Rect x="26.5" y="26" width="2.5" height="3" fill={accentColor} />
        </Svg>
      );

    case 'Image':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="3.5" y="4.5" width="25" height="23" rx="4" stroke={color} strokeWidth="1.8" fill="none" />
          <Circle cx="21" cy="11.5" r="2.5" stroke={color} strokeWidth="1.5" fill="none" />
          <Path d="M 4 23.5 L 12 15 L 16.5 19.5 L 20.5 15.5 L 28 23.5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    case 'Clipart':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Circle cx="16" cy="16" r="12" stroke={color} strokeWidth="1.8" fill="none" />
          <Path
            d="M 12 21 V 11 H 16.5 C 18.5 11 19.5 12.2 19.5 14 C 19.5 15.8 18.5 17 16.5 17 H 12 M 16 17 L 19.5 21"
            stroke={accentColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );

    case 'Line':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Line x1="7" y1="25" x2="25" y2="7" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="7" cy="25" r="2.6" fill={accentColor} />
          <Circle cx="25" cy="7" r="2.6" fill={accentColor} />
        </Svg>
      );

    case 'Shapes':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="4" y="5" width="14" height="14" rx="2" stroke={color} strokeWidth="1.8" fill="none" />
          <Circle cx="20" cy="20" r="7.5" stroke={accentColor} strokeWidth="1.8" fill="none" />
        </Svg>
      );

    case 'Table':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="3.5" y="4.5" width="25" height="23" rx="3.5" stroke={color} strokeWidth="1.8" fill="none" />
          <Rect x="4.5" y="5.5" width="23" height="6.5" fill={accentColor} fillOpacity="0.4" />
          <Line x1="3.5" y1="12" x2="28.5" y2="12" stroke={accentColor} strokeWidth="1.8" />
          <Line x1="3.5" y1="19.5" x2="28.5" y2="19.5" stroke={color} strokeWidth="1.4" />
          <Line x1="12" y1="4.5" x2="12" y2="27.5" stroke={color} strokeWidth="1.4" />
          <Line x1="20" y1="4.5" x2="20" y2="27.5" stroke={color} strokeWidth="1.4" />
        </Svg>
      );

    case 'Time':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Circle cx="16" cy="16" r="11.5" stroke={color} strokeWidth="1.8" fill="none" />
          <Line x1="16" y1="16" x2="16" y2="9.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="16" y1="16" x2="21.5" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="16" cy="16" r="1.5" fill={color} />
        </Svg>
      );

    case 'ArcText':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 5 11 C 9.5 5.5 22.5 5.5 27 11" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Path d="M 11 16.5 H 21 M 16 16.5 V 26" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    case 'Counter':
    case 'Degrees':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Text x="6.5" y="11.5" fill={accentColor} fontSize="8.5" fontWeight="bold">1</Text>
          <Text x="6.5" y="18.5" fill={accentColor} fontSize="8.5" fontWeight="bold">2</Text>
          <Text x="6.5" y="25.5" fill={accentColor} fontSize="8.5" fontWeight="bold">3</Text>
          <Line x1="14" y1="9" x2="27" y2="9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="14" y1="16" x2="27" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="14" y1="23" x2="27" y2="23" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </Svg>
      );

    case 'Excel':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 6 4 H 19 L 26.5 11.5 V 27 C 26.5 28 25.5 28.5 24.5 28.5 H 6 C 5 28.5 4 28 4 27 V 5.5 C 4 4.5 5 4 6 4 Z" stroke={color} strokeWidth="1.8" fill="none" />
          <Path d="M 19 4 V 11.5 H 26.5" stroke={color} strokeWidth="1.5" fill="none" />
          <Path d="M 9.5 15.5 L 16.5 23.5 M 16.5 15.5 L 9.5 23.5" stroke={accentColor} strokeWidth="2.4" strokeLinecap="round" />
        </Svg>
      );

    case 'Scan':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 4.5 10 V 5.5 H 9 M 23 5.5 H 27.5 V 10 M 4.5 22 V 26.5 H 9 M 23 26.5 H 27.5 V 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Line x1="7.5" y1="16" x2="24.5" y2="16" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    case 'OCR':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 4.5 10 V 5.5 H 9 M 23 5.5 H 27.5 V 10 M 4.5 22 V 26.5 H 9 M 23 26.5 H 27.5 V 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M 8.5 16 C 11.5 12.5 20.5 12.5 23.5 16 C 20.5 19.5 11.5 19.5 8.5 16 Z" stroke={accentColor} strokeWidth="1.6" fill="none" />
          <Circle cx="16" cy="16" r="2.2" fill={accentColor} />
        </Svg>
      );

    case 'ASR':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="12" y="5.5" width="8" height="12.5" rx="4" stroke={color} strokeWidth="1.8" fill="none" />
          <Path d="M 7.5 14 C 7.5 19 24.5 19 24.5 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Line x1="16" y1="19" x2="16" y2="25.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="11" y1="25.5" x2="21" y2="25.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </Svg>
      );

    case 'Label Clone':
    case '2ups Label':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 4.5 10 V 5.5 H 9 M 23 5.5 H 27.5 V 10 M 4.5 22 V 26.5 H 9 M 23 26.5 H 27.5 V 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M 19 12.5 C 18 11.5 17 11.2 15.5 11.2 C 12.8 11.2 11.5 13.2 11.5 16 C 11.5 18.8 12.8 20.8 15.5 20.8 C 17 20.8 18 20.5 19 19.5" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </Svg>
      );

    case 'Border':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Rect x="5" y="5" width="22" height="22" rx="1.5" stroke={accentColor} strokeWidth="2" fill="none" />
        </Svg>
      );

    case 'Signature':
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Path d="M 21.5 6.5 L 24.5 9.5 C 25.5 10.5 25.5 11.5 24.5 12.5 L 12 24 L 7 25 L 8 20 L 20.5 7.5 C 21.5 6.5 22 6.5 21.5 6.5 Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
          <Line x1="6" y1="27" x2="26" y2="27" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Circle cx="16" cy="16" r="10" stroke={color} strokeWidth="1.8" fill="none" />
        </Svg>
      );
  }
}

export function TopToolbarIcon({
  name,
  size = 22,
  color = DEFAULT_COLOR,
  active = false,
}: {
  name: string;
  size?: number;
  color?: string;
  active?: boolean;
}) {
  const c = active ? DEFAULT_ACCENT : color;
  switch (name) {
    case 'Label':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="3.5" stroke={c} strokeWidth="1.8" fill="none" />
          <Path
            d="M 12 2.5 V 4.5 M 12 19.5 V 21.5 M 2.5 12 H 4.5 M 19.5 12 H 21.5 M 5.3 5.3 L 6.7 6.7 M 17.3 17.3 L 18.7 18.7 M 5.3 18.7 L 6.7 17.3 M 17.3 6.7 L 18.7 5.3"
            stroke={c}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Svg>
      );

    case 'Multiple':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="3" y="3" width="18" height="18" rx="3.5" stroke={c} strokeWidth="1.8" fill="none" />
          <Path d="M 7 12 L 10.5 15.5 L 17 8.5" stroke={active ? DEFAULT_ACCENT : c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    case 'Undo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M 5 9.5 H 14.5 C 17.5 9.5 19.5 11.5 19.5 14.5 C 19.5 17.5 17.5 19.5 14.5 19.5 H 9 M 9 5.5 L 5 9.5 L 9 13.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    case 'Redo':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M 19 9.5 H 9.5 C 6.5 9.5 4.5 11.5 4.5 14.5 C 4.5 17.5 6.5 19.5 9.5 19.5 H 15 M 15 5.5 L 19 9.5 L 15 13.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    case 'Lock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="10" width="16" height="11" rx="2.5" stroke={c} strokeWidth="1.8" fill="none" />
          <Path d="M 7.5 10 V 6.5 C 7.5 4 9.5 2.5 12 2.5 C 14.5 2.5 16.5 4 16.5 6.5 V 10" stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Circle cx="12" cy="15.5" r="1.5" fill={c} />
        </Svg>
      );

    case 'UnLock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="4" y="10" width="16" height="11" rx="2.5" stroke={c} strokeWidth="1.8" fill="none" />
          <Path d="M 7.5 10 V 6.5 C 7.5 4 9.5 2.5 12 2.5 C 14.5 2.5 16.5 4 16.5 6.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <Circle cx="12" cy="15.5" r="1.5" fill={c} />
        </Svg>
      );

    case 'Drag':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Line x1="12" y1="4" x2="12" y2="20" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M 8 7.5 L 12 3.5 L 16 7.5 M 8 16.5 L 12 20.5 L 16 16.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    default:
      return null;
  }
}
