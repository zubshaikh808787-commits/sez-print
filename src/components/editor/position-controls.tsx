import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignObjectCenterHIcon,
  AlignObjectLeftIcon,
  AlignObjectRightIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  BringForwardIcon,
  BringToFrontIcon,
  CenterCheckIcon,
  FitToCanvasIcon,
  NudgeDownIcon,
  NudgeLeftIcon,
  NudgeRightIcon,
  NudgeUpIcon,
  SendBackwardIcon,
  SendToBackIcon,
  StretchHorizontalIcon,
  StretchVerticalIcon,
} from '@/components/editor/position-icons';
import type { TextAlign } from '@/components/editor/types';

const NUDGE_MM = 0.5;
const PRESS_HIT_SLOP = 10;

export type PositionLayerActions = {
  onSendToBack?: () => void;
  onBringToFront?: () => void;
  onSendBackward?: () => void;
  onBringForward?: () => void;
};

const PositionLayerActionsContext = createContext<PositionLayerActions | undefined>(undefined);

export function PositionLayerActionsProvider({
  value,
  children,
}: {
  value: PositionLayerActions;
  children: ReactNode;
}) {
  return (
    <PositionLayerActionsContext.Provider value={value}>{children}</PositionLayerActionsContext.Provider>
  );
}

export type PositionControlsProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  labelWidthMm: number;
  labelHeightMm: number;
  onPatch: (updates: Record<string, number | string>) => void;
  /** When provided, horizontal-align buttons also update the text align property. */
  textAlign?: TextAlign;
  layerActions?: PositionLayerActions;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function PositionControls({
  left,
  top,
  width,
  height,
  labelWidthMm,
  labelHeightMm,
  onPatch,
  textAlign,
  layerActions: layerActionsProp,
}: PositionControlsProps) {
  const layerActionsFromContext = useContext(PositionLayerActionsContext);
  const layerActions = layerActionsProp ?? layerActionsFromContext;
  const maxLeft = Math.max(0, labelWidthMm - width);
  const maxTop = Math.max(0, labelHeightMm - height);

  const nudge = (dx: number, dy: number) => {
    onPatch({
      left: clamp(left + dx, 0, maxLeft),
      top: clamp(top + dy, 0, maxTop),
    });
  };

  const alignTo = (kind: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v' | 'center') => {
    switch (kind) {
      case 'left':
        onPatch({ left: 0, ...(textAlign !== undefined ? { align: 'left' as TextAlign } : {}) });
        break;
      case 'right':
        onPatch({
          left: maxLeft,
          ...(textAlign !== undefined ? { align: 'right' as TextAlign } : {}),
        });
        break;
      case 'top':
        onPatch({ top: 0 });
        break;
      case 'bottom':
        onPatch({ top: maxTop });
        break;
      case 'center-h':
        onPatch({
          left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
          ...(textAlign !== undefined ? { align: 'center' as TextAlign } : {}),
        });
        break;
      case 'center-v':
        onPatch({ top: clamp((labelHeightMm - height) / 2, 0, maxTop) });
        break;
      case 'center':
        onPatch({
          left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
          top: clamp((labelHeightMm - height) / 2, 0, maxTop),
        });
        break;
    }
  };

  const stretchWidth = () => {
    onPatch({
      left: 0,
      width: labelWidthMm,
      ...(textAlign !== undefined ? { align: 'spacing' as TextAlign } : {}),
    });
  };

  const stretchHeight = () => {
    onPatch({ top: 0, height: labelHeightMm });
  };

  const fitToCanvas = () => {
    onPatch({
      left: 0,
      top: 0,
      width: labelWidthMm,
      height: labelHeightMm,
      ...(textAlign !== undefined ? { align: 'spacing' as TextAlign } : {}),
    });
  };

  const padBtn = (icon: ReactNode, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={PRESS_HIT_SLOP} style={({ pressed }) => [styles.padBtn, pressed && styles.pressed]}>
      {icon}
    </Pressable>
  );

  const gridBtn = (icon: ReactNode, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      hitSlop={PRESS_HIT_SLOP}
      style={({ pressed }) => [styles.gridBtn, pressed && styles.pressed]}>
      {icon}
    </Pressable>
  );

  const layerBtn = (icon: ReactNode, onPress?: () => void) => (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      hitSlop={PRESS_HIT_SLOP}
      style={({ pressed }) => [styles.layerBtn, !onPress && styles.layerBtnDisabled, pressed && onPress && styles.pressed]}>
      {icon}
    </Pressable>
  );

  return (
    <>
      <View style={styles.positionWrap}>
        <View style={styles.padColumn}>
          {padBtn(<NudgeUpIcon />, () => nudge(0, -NUDGE_MM))}
          <View style={styles.padMiddleRow}>
            {padBtn(<NudgeLeftIcon />, () => nudge(-NUDGE_MM, 0))}
            <Pressable
              onPress={() => alignTo('center')}
              hitSlop={PRESS_HIT_SLOP}
              style={({ pressed }) => [styles.padBtn, styles.padCenter, pressed && styles.pressed]}>
              <CenterCheckIcon />
            </Pressable>
            {padBtn(<NudgeRightIcon />, () => nudge(NUDGE_MM, 0))}
          </View>
          {padBtn(<NudgeDownIcon />, () => nudge(0, NUDGE_MM))}
        </View>

        <View style={styles.alignGrid}>
          <View style={styles.alignRow}>
            {gridBtn(<AlignVerticalCenterIcon />, () => alignTo('center-v'))}
            {gridBtn(<AlignHorizontalCenterIcon />, () => alignTo('center-h'))}
            {gridBtn(<FitToCanvasIcon />, fitToCanvas)}
          </View>
          <View style={styles.alignRow}>
            {gridBtn(<AlignObjectLeftIcon />, () => alignTo('left'))}
            {gridBtn(<AlignObjectCenterHIcon />, () => alignTo('center-h'))}
            {gridBtn(<AlignObjectRightIcon />, () => alignTo('right'))}
            {gridBtn(<StretchHorizontalIcon />, stretchWidth)}
          </View>
          <View style={styles.alignRow}>
            {gridBtn(<AlignTopIcon />, () => alignTo('top'))}
            {gridBtn(<AlignVerticalCenterIcon />, () => alignTo('center-v'))}
            {gridBtn(<AlignBottomIcon />, () => alignTo('bottom'))}
            {gridBtn(<StretchVerticalIcon />, stretchHeight)}
          </View>
        </View>
      </View>

      <View style={styles.layerRow}>
        {layerBtn(<SendToBackIcon />, layerActions?.onSendToBack)}
        {layerBtn(<BringToFrontIcon />, layerActions?.onBringToFront)}
        {layerBtn(<SendBackwardIcon />, layerActions?.onSendBackward)}
        {layerBtn(<BringForwardIcon />, layerActions?.onBringForward)}
      </View>
    </>
  );
}

const BTN = {
  size: 44,
  radius: 6,
  bg: '#EEF1F5',
  centerBg: '#E8ECF1',
  gap: 6,
} as const;

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 16,
  },
  padColumn: { alignItems: 'center', gap: BTN.gap },
  padMiddleRow: { flexDirection: 'row', gap: BTN.gap },
  padBtn: {
    width: BTN.size,
    height: BTN.size,
    borderRadius: BTN.radius,
    backgroundColor: BTN.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: BTN.centerBg },
  alignGrid: { flex: 1, gap: BTN.gap },
  alignRow: { flexDirection: 'row', gap: BTN.gap },
  gridBtn: {
    flex: 1,
    height: BTN.size,
    borderRadius: BTN.radius,
    backgroundColor: BTN.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: BTN.gap,
  },
  layerBtn: {
    flex: 1,
    height: BTN.size,
    borderRadius: BTN.radius,
    backgroundColor: BTN.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerBtnDisabled: { opacity: 0.4 },
});
