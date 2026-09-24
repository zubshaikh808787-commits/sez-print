import Svg, { Line, Path, Polyline, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';

const ICON_COLOR = '#556473';

type IconProps = { size?: number; color?: string };

function SvgWrap({ size, children }: { size: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      {children}
    </Svg>
  );
}

export function NudgeUpIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polyline points="9,4 5.5,8.5 12.5,8.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function NudgeDownIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polyline points="9,14 5.5,9.5 12.5,9.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function NudgeLeftIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polyline points="4,9 8.5,5.5 8.5,12.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function NudgeRightIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polyline points="14,9 9.5,5.5 9.5,12.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </SvgWrap>
  );
}

/** D-pad center: checkmark to center element on label. */
export function CenterCheckIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Polyline
        points="4.5,9.5 7.5,12.5 13.5,6.5"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </SvgWrap>
  );
}

/** Row 1: center vertically on label (box on horizontal midline). */
export function AlignVerticalCenterIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="2" y1="9" x2="16" y2="9" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="7" y="6.5" width="4" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 1: center horizontally on label (box on vertical midline). */
export function AlignHorizontalCenterIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="9" y1="2" x2="9" y2="16" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="6.5" y="7" width="5" height="4" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 1: fit element to full label (corner brackets). */
export function FitToCanvasIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect
        x="5"
        y="5"
        width="8"
        height="8"
        rx="0.8"
        stroke={color}
        strokeWidth="1.2"
        strokeDasharray="2 1.5"
        fill="none"
      />
      <Polyline points="3,6 3,3 6,3" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <Polyline points="12,3 15,3 15,6" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <Polyline points="15,12 15,15 12,15" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <Polyline points="6,15 3,15 3,12" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </SvgWrap>
  );
}

/** Row 2: align object left edge to label. */
export function AlignObjectLeftIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="4" y1="2" x2="4" y2="16" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="5.5" y="6.5" width="5" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 2: align object horizontal center. */
export function AlignObjectCenterHIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="9" y1="2" x2="9" y2="16" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="6.5" y="6.5" width="5" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 2: align object right edge to label. */
export function AlignObjectRightIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="14" y1="2" x2="14" y2="16" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="7.5" y="6.5" width="5" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 2: stretch width to label edges. */
export function StretchHorizontalIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="5" y="6.5" width="8" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
      <Line x1="2.5" y1="9" x2="5" y2="9" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Line x1="13" y1="9" x2="15.5" y2="9" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Polyline points="3.5,7.5 2.5,9 3.5,10.5" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Polyline points="14.5,7.5 15.5,9 14.5,10.5" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </SvgWrap>
  );
}

/** Row 3: align object top edge. */
export function AlignTopIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="2" y1="4" x2="16" y2="4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="6.5" y="5" width="5" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 3: align object bottom edge. */
export function AlignBottomIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="2" y1="14" x2="16" y2="14" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Rect x="6.5" y="8" width="5" height="5" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Row 3: stretch height to label edges. */
export function StretchVerticalIcon({ size = 18, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="6.5" y="5" width="5" height="8" rx="0.6" stroke={color} strokeWidth="1.3" fill="none" />
      <Line x1="9" y1="2.5" x2="9" y2="5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Line x1="9" y1="13" x2="9" y2="15.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <Polyline points="7.5,3.5 9,2.5 10.5,3.5" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Polyline points="7.5,14.5 9,15.5 10.5,14.5" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </SvgWrap>
  );
}

/** Bottom row: send to back (|◀). */
export function SendToBackIcon({ size = 20, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Line x1="4" y1="3" x2="4" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Rect x="7" y="6" width="7" height="6" rx="0.8" stroke={color} strokeWidth="1.3" fill="none" />
      <Polyline points="6,9 4,9 5.5,7.5" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <Polyline points="6,9 4,9 5.5,10.5" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </SvgWrap>
  );
}

/** Bottom row: bring to front (▶|). */
export function BringToFrontIcon({ size = 20, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4" y="6" width="7" height="6" rx="0.8" stroke={color} strokeWidth="1.3" fill="none" />
      <Line x1="14" y1="3" x2="14" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Polyline points="12,9 14,9 12.5,7.5" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <Polyline points="12,9 14,9 12.5,10.5" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </SvgWrap>
  );
}

/** Bottom row: send one layer backward. */
export function SendBackwardIcon({ size = 20, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4" y="7.5" width="6.5" height="5" rx="0.7" stroke={color} strokeWidth="1.1" fill="none" opacity={0.45} />
      <Rect x="7" y="5.5" width="6.5" height="5" rx="0.7" stroke={color} strokeWidth="1.3" fill="none" />
    </SvgWrap>
  );
}

/** Bottom row: bring one layer forward. */
export function BringForwardIcon({ size = 20, color = ICON_COLOR }: IconProps) {
  return (
    <SvgWrap size={size}>
      <Rect x="4.5" y="5.5" width="6.5" height="5" rx="0.7" stroke={color} strokeWidth="1.3" fill="none" />
      <Rect x="7.5" y="7.5" width="6.5" height="5" rx="0.7" stroke={color} strokeWidth="1.1" fill="none" opacity={0.45} />
    </SvgWrap>
  );
}
