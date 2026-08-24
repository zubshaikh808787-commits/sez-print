import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type SignaturePoint = { x: number; y: number };

export type SignatureStroke = {
  points: SignaturePoint[];
  strokeWidth: number;
};

type SignatureDrawingBoardProps = {
  onCancel: () => void;
  onConfirm: (strokes: SignatureStroke[]) => void;
  initialStrokes?: SignatureStroke[];
};

const BRUSH_WIDTHS = [2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
const BRUSH_DOT_SIZES = [8, 10, 12, 14, 16, 18];
const STROKE_COLOR = '#111827';
const BLUE = '#3498DB';
const RED = '#E5484D';

function pointsToPath(points: SignaturePoint[]) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

function cloneStrokes(strokes: SignatureStroke[]) {
  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function normalizeStrokes(strokes: SignatureStroke[], width: number, height: number): SignatureStroke[] {
  if (width <= 0 || height <= 0) return strokes;

  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth / width,
    points: stroke.points.map((point) => ({
      x: point.x / width,
      y: point.y / height,
    })),
  }));
}

function denormalizeStrokes(strokes: SignatureStroke[], width: number, height: number): SignatureStroke[] {
  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth * width,
    points: stroke.points.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    })),
  }));
}

export function SignatureDrawingBoard({
  onCancel,
  onConfirm,
  initialStrokes = [],
}: SignatureDrawingBoardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const modalWidth = Math.min(screenWidth * 0.88, 340);
  const canvasSize = modalWidth - 32;

  const canvasSizeRef = useRef({ width: canvasSize, height: canvasSize });
  canvasSizeRef.current = { width: canvasSize, height: canvasSize };

  const [brushIndex, setBrushIndex] = useState(1);
  const [strokes, setStrokes] = useState<SignatureStroke[]>(() =>
    denormalizeStrokes(initialStrokes, canvasSize, canvasSize),
  );
  const [redoStack, setRedoStack] = useState<SignatureStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<SignatureStroke | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentStroke({
            strokeWidth: BRUSH_WIDTHS[brushIndex],
            points: [{ x: locationX, y: locationY }],
          });
          setRedoStack([]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentStroke((prev) =>
            prev
              ? {
                  ...prev,
                  points: [...prev.points, { x: locationX, y: locationY }],
                }
              : null,
          );
        },
        onPanResponderRelease: () => {
          setCurrentStroke((prev) => {
            if (prev && prev.points.length > 0) {
              setStrokes((existing) => [...existing, prev]);
            }
            return null;
          });
        },
        onPanResponderTerminate: () => {
          setCurrentStroke(null);
        },
      }),
    [brushIndex],
  );

  const renderedStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setRedoStack((redo) => [prev[prev.length - 1], ...redo]);
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [stroke, ...rest] = prev;
      setStrokes((existing) => [...existing, stroke]);
      return rest;
    });
  };

  const handleConfirm = () => {
    const { width, height } = canvasSizeRef.current;
    onConfirm(normalizeStrokes(strokes, width, height));
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onCancel} />

      <View style={[styles.stack, { width: modalWidth }]}>
        <View style={[styles.modal, { width: modalWidth }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={handleUndo}
              disabled={strokes.length === 0}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <SymbolView
                name="arrow.uturn.backward"
                tintColor={strokes.length === 0 ? '#B8C0C8' : BLUE}
                size={22}
              />
            </Pressable>

            <Text style={styles.title}>Drawing board</Text>

            <Pressable
              onPress={handleRedo}
              disabled={redoStack.length === 0}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <SymbolView
                name="arrow.uturn.forward"
                tintColor={redoStack.length === 0 ? '#B8C0C8' : BLUE}
                size={22}
              />
            </Pressable>
          </View>

          <View style={styles.brushRow}>
            {BRUSH_DOT_SIZES.map((size, index) => {
              const active = index === brushIndex;
              return (
                <Pressable
                  key={`brush-${index}`}
                  onPress={() => setBrushIndex(index)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.brushHit, pressed && styles.pressed]}>
                  <View
                    style={[
                      styles.brushDot,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: active ? RED : BLUE,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          <View
            style={[styles.canvas, { width: canvasSize, height: canvasSize }]}
            {...panResponder.panHandlers}>
            <Svg width={canvasSize} height={canvasSize}>
              {renderedStrokes.map((stroke, index) => (
                <Path
                  key={`stroke-${index}`}
                  d={pointsToPath(stroke.points)}
                  stroke={STROKE_COLOR}
                  strokeWidth={stroke.strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type SignaturePreviewProps = {
  strokes: SignatureStroke[];
  width: number;
  height: number;
};

export function SignaturePreview({ strokes, width, height }: SignaturePreviewProps) {
  const pixelStrokes = useMemo(
    () => denormalizeStrokes(strokes, width, height),
    [height, strokes, width],
  );

  if (pixelStrokes.length === 0) return null;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {pixelStrokes.map((stroke, index) => (
        <Path
          key={`preview-stroke-${index}`}
          d={pointsToPath(stroke.points)}
          stroke={STROKE_COLOR}
          strokeWidth={stroke.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  stack: {
    zIndex: 61,
    alignItems: 'stretch',
    gap: 12,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: '#7E8B98',
  },
  brushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  brushHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushDot: {
    backgroundColor: BLUE,
  },
  canvas: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E8ED',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: BLUE,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: RED,
  },
  pressed: {
    opacity: 0.68,
  },
});
