import Svg, { Path, Polygon, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';

/** WePrint Position-tab ink. */
const ICON_COLOR = '#5C6770';
const KNOCKOUT = '#F3F4F6';

type IconProps = { size?: number; color?: string };

function SvgWrap({ size, children }: { size: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {children}
    </Svg>
  );
}

export function NudgeUpIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polygon points="12,5 5.5,16.5 18.5,16.5" fill={color} />
    </SvgWrap>
  );
}

export function NudgeDownIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polygon points="12,19 5.5,7.5 18.5,7.5" fill={color} />
    </SvgWrap>
  );
}

export function NudgeLeftIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polygon points="5,12 16.5,5.5 16.5,18.5" fill={color} />
    </SvgWrap>
  );
}

export function NudgeRightIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polygon points="19,12 7.5,5.5 7.5,18.5" fill={color} />
    </SvgWrap>
  );
}

/** D-pad center: checkmark to center element on label. */
export function CenterCheckIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Path
        d="M5.5 12.2 L10 16.6 L18.6 7.4"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </SvgWrap>
  );
}

/** Row 1: vertical bar with a center line to the right (center on label height). */
export function AlignVerticalCenterIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4.2" y="4" width="2.6" height="16" rx="0.6" fill={color} />
      <Rect x="6.8" y="10.7" width="13" height="2.6" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 1: top bar with a center line downward (center on label width). */
export function AlignHorizontalCenterIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4" y="4.2" width="16" height="2.6" rx="0.6" fill={color} />
      <Rect x="10.7" y="6.8" width="2.6" height="13" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 1: fit element to the full label (corner brackets only). */
export function FitToCanvasIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Path
        d="M9 4.2 H4.2 V9 M15 4.2 H19.8 V9 M19.8 15 V19.8 H15 M9 19.8 H4.2 V15"
        fill="none"
        stroke={color}
        strokeWidth="2.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </SvgWrap>
  );
}

/** Row 2: align object left edge to label. */
export function AlignObjectLeftIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="3.2" y="3.6" width="2.5" height="16.8" rx="0.5" fill={color} />
      <Rect x="8.4" y="7" width="11.2" height="10" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
    </SvgWrap>
  );
}

/** Row 2: align object horizontal center. */
export function AlignObjectCenterHIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4.2" y="6.6" width="15.6" height="10.8" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="10.75" y="3.4" width="2.5" height="17.2" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 2: align object right edge to label. */
export function AlignObjectRightIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4.2" y="7" width="11.2" height="10" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="18.3" y="3.6" width="2.5" height="16.8" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 2: stretch width to label edges. */
export function StretchHorizontalIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1" stroke={color} strokeWidth="1.6" fill="none" />
      <Polygon points="2.4,12 6.6,8.6 6.6,15.4" fill={color} />
      <Polygon points="21.6,12 17.4,8.6 17.4,15.4" fill={color} />
    </SvgWrap>
  );
}

/** Row 3: align object top edge. */
export function AlignTopIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="3.6" y="3.2" width="16.8" height="2.5" rx="0.5" fill={color} />
      <Rect x="7" y="8.4" width="10" height="11.2" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
    </SvgWrap>
  );
}

/** Row 3: align object vertical center. */
export function AlignObjectCenterVIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="6.6" y="4.2" width="10.8" height="15.6" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="3.4" y="10.75" width="17.2" height="2.5" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 3: align object bottom edge. */
export function AlignBottomIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="7" y="4.2" width="10" height="11.2" rx="1.2" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="3.6" y="18.3" width="16.8" height="2.5" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Row 3: stretch height to label edges. */
export function StretchVerticalIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1" stroke={color} strokeWidth="1.6" fill="none" />
      <Polygon points="12,2.4 8.6,6.6 15.4,6.6" fill={color} />
      <Polygon points="12,21.6 8.6,17.4 15.4,17.4" fill={color} />
    </SvgWrap>
  );
}

/** Bottom row: send to back (|◀). */
export function SendToBackIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4" y="4.5" width="2.6" height="15" rx="0.5" fill={color} />
      <Polygon points="18.8,6.2 9.2,12 18.8,17.8" fill={color} />
    </SvgWrap>
  );
}

/** Bottom row: bring to front (▶|). */
export function BringToFrontIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polygon points="5.2,6.2 14.8,12 5.2,17.8" fill={color} />
      <Rect x="17.4" y="4.5" width="2.6" height="15" rx="0.5" fill={color} />
    </SvgWrap>
  );
}

/** Bottom row: send one layer backward. */
export function SendBackwardIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="3.4" y="3.4" width="11.2" height="11.2" rx="1.6" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="9.2" y="9.2" width="11.2" height="11.2" rx="1.6" stroke={color} strokeWidth="1.7" fill={KNOCKOUT} />
    </SvgWrap>
  );
}

/** Bottom row: bring one layer forward. */
export function BringForwardIcon({ size = 22, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="9.2" y="9.2" width="11.2" height="11.2" rx="1.6" stroke={color} strokeWidth="1.7" fill="none" />
      <Rect x="3.4" y="3.4" width="11.2" height="11.2" rx="1.6" stroke={color} strokeWidth="1.7" fill={KNOCKOUT} />
    </SvgWrap>
  );
}
