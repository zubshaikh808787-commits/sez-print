import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import {
  clampElementToLabel,
  fitBarcodeDefaults,
  fitClipartDefaults,
  fitLineDefaults,
  fitQrcodeDefaults,
  fitShapeDefaults,
  fitTableDefaults,
  fitTextDefaults,
  fitTimeDefaults,
  normalizeDocumentElements,
  scaleDocumentToSize,
} from '@/lib/element-sizing';
import { DegreesPropertyPanel } from '@/components/editor/degrees-property-panel';
import { ArcTextPropertyPanel } from '@/components/editor/arctext-property-panel';
import { BarcodePropertyPanel } from '@/components/editor/barcode-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
import { ZoomableEditPad } from '@/components/editor/zoomable-edit-pad';
import {
  ArtboardFrame,
  fitLabelCanvas,
  LABEL_PAD_STAGE_COLOR,
  LABEL_PAD_STAGE_MIN_HEIGHT,
} from '@/components/label-preview';
import { HorizontalRuler, RULER_SIZE, VerticalRuler } from '@/components/canvas-rulers';
import { LabelSizeEditor } from '@/components/label-size-editor';
import { LabelSettingsMenu } from '@/components/editor/more-menu';
import { LinePropertyPanel } from '@/components/editor/line-property-panel';
import { QrcodePropertyPanel } from '@/components/editor/qrcode-property-panel';
import { ShapePropertyPanel } from '@/components/editor/shape-property-panel';
import { TablePropertyPanel } from '@/components/editor/table-property-panel';
import {
  SignatureDrawingBoard,
  type SignatureStroke,
} from '@/components/editor/signature-drawing-board';
import { TableSizePicker } from '@/components/editor/table-size-picker';
import { TextPropertyPanel } from '@/components/editor/text-property-panel';
import { TimePropertyPanel } from '@/components/editor/time-property-panel';
import {
  DEFAULT_ARCTEXT_STATE,
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  createTableState,
  type ArcTextPropertyTab,
  type BarcodePropertyTab,
  type LinePropertyTab,
  type PropertyTab,
  type QrcodePropertyTab,
  type ShapePropertyTab,
  type TablePropertyTab,
  type TimePropertyTab,
} from '@/components/editor/types';
import { editorBridge, barcodeEncodeModeForScanType, isQrScanType } from '@/constants/editor-bridge';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette, Type } from '@/constants/ui';
import {
  applyUpsBatchMirror,
  createLabelDocument,
  elementSizeMm,
  generateId,
  mmToPt,
  parseOrientation,
  parsePaperType,
  switchUpsPanel,
  syncUpsActivePanel,
  type ElementType,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { clampLabelMm } from '@/lib/label-geometry';
import { sortLayers } from '@/lib/template-schema';
import { useTranslation } from '@/lib/i18n';
import { textBlockHeightMm } from '@/lib/element-sizing';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

type IconName = AppIconName;

const TOOLS: { icon: IconName; label: string }[] = [
  { icon: 'textformat', label: 'Text' },
  { icon: 'barcode', label: 'Barcode' },
  { icon: 'qrcode', label: 'QRCode' },
  { icon: 'photo', label: 'Image' },
  { icon: 'photo.artframe', label: 'Clipart' },
  { icon: 'line.diagonal', label: 'Line' },
  { icon: 'square.on.circle', label: 'Shapes' },
  { icon: 'tablecells', label: 'Table' },
  { icon: 'clock', label: 'Time' },
  { icon: 'character', label: 'ArcText' },
  { icon: 'list.number', label: 'Degrees' },
  { icon: 'tablecells.badge.ellipsis', label: 'Excel' },
  { icon: 'viewfinder', label: 'Scan' },
  { icon: 'eye', label: 'OCR' },
  { icon: 'mic', label: 'ASR' },
  { icon: 'square.on.square', label: '2ups Label' },
  { icon: 'square.dashed', label: 'Border' },
  { icon: 'signature', label: 'Signature' },
];

const MAX_HISTORY = 60;

function HeaderAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <AppIcon name={icon} tintColor="#FFFFFF" size={20} />
      <Text numberOfLines={1} style={styles.headerActionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolbarItem({
  icon,
  label,
  active,
  disabled,
  withDivider,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  withDivider?: boolean;
  onPress?: () => void;
}) {
  const color = disabled ? Palette.disabled : active ? Palette.accent : Palette.ink;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      android_ripple={androidRipple}
      style={({ pressed }) => [
        styles.toolbarItem,
        withDivider && styles.toolbarDivider,
        pressed && !disabled && styles.pressed,
      ]}>
      <AppIcon name={icon} tintColor={active ? Palette.accent : color} size={22} />
      <Text numberOfLines={1} style={[styles.toolbarLabel, { color: active ? Palette.accent : color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolItem({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.toolItem, pressed && styles.pressed]}>
      <AppIcon name={icon} tintColor={Palette.accent} size={26} />
      <Text numberOfLines={1} style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const DOUBLE_TAP_MS = 350;
/** Finger must move this many px before a drag starts (avoids accidental nudges). */
const DRAG_ACTIVATION_PX = 4;
/** Commit snap after drag — fine enough for print, no visible jump. */
const POSITION_SNAP_MM = 0.1;

function snapMm(value: number, step = POSITION_SNAP_MM) {
  return Math.round(value / step) * step;
}

function isTextEditableElement(type: LabelElement['type']) {
  return type === 'text' || type === 'degrees';
}

type CanvasElementProps = {
  element: LabelElement;
  scale: number;
  /** Outer pad zoom — finger deltas must be divided by (scale * padZoom). */
  padZoom: number;
  selected: boolean;
  selectionColor: string;
  /** Shared live drag translation (px) applied to all selected elements. */
  liveDragX: Animated.Value;
  liveDragY: Animated.Value;
  liveDragActiveIds: string[] | null;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  /** Total drag offset in mm since the gesture started (throttled). */
  onDrag: (id: string, totalDxMm: number, totalDyMm: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, totalDxMm: number, totalDyMm: number) => void;
  /** Total resize offset in mm since the gesture started. */
  onResize: (id: string, totalDwMm: number, totalDhMm: number) => void;
};

const CanvasElement = memo(function CanvasElement({
  element,
  scale,
  padZoom,
  selected,
  selectionColor,
  liveDragX,
  liveDragY,
  liveDragActiveIds,
  onSelect,
  onOpenPanel,
  onEditText,
  onDrag,
  onDragStart,
  onDragEnd,
  onResize,
}: CanvasElementProps) {
  const size = elementSizeMm(element);
  const widthPx = Math.max(1, size.width * scale);
  const heightPx = Math.max(1, size.height * scale);
  // Expand touch area for thin elements (e.g. lines) so they can be grabbed.
  const touchSlopX = Math.max(0, (28 - widthPx) / 2);
  const touchSlopY = Math.max(0, (28 - heightPx) / 2);

  const movedRef = useRef(false);
  const lastDxRef = useRef(0);
  const lastDyRef = useRef(0);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const padZoomRef = useRef(padZoom);
  padZoomRef.current = padZoom;
  const callbacksRef = useRef({
    onSelect,
    onOpenPanel,
    onEditText,
    onDrag,
    onDragStart,
    onDragEnd,
    onResize,
  });
  callbacksRef.current = {
    onSelect,
    onOpenPanel,
    onEditText,
    onDrag,
    onDragStart,
    onDragEnd,
    onResize,
  };
  const elementRef = useRef(element);
  elementRef.current = element;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastTapRef = useRef({ id: '', time: 0 });

  const inLiveDrag =
    liveDragActiveIds != null && liveDragActiveIds.includes(element.id);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gesture) =>
        Math.abs(gesture.dx) > DRAG_ACTIVATION_PX || Math.abs(gesture.dy) > DRAG_ACTIVATION_PX,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
        lastDxRef.current = 0;
        lastDyRef.current = 0;
      },
      onPanResponderMove: (_e, gesture) => {
        const current = elementRef.current;
        if (current.lockMovement) return;
        const s = scaleRef.current || 1;
        const z = padZoomRef.current || 1;
        const interaction = s * z;
        if (
          !movedRef.current &&
          (Math.abs(gesture.dx) > DRAG_ACTIVATION_PX || Math.abs(gesture.dy) > DRAG_ACTIVATION_PX)
        ) {
          movedRef.current = true;
          callbacksRef.current.onSelect(current.id);
          callbacksRef.current.onDragStart(current.id);
        }
        if (!movedRef.current) return;
        lastDxRef.current = gesture.dx;
        lastDyRef.current = gesture.dy;
        // Visual follow is handled by shared Animated values in the parent.
        callbacksRef.current.onDrag(current.id, gesture.dx / interaction, gesture.dy / interaction);
      },
      onPanResponderRelease: () => {
        const current = elementRef.current;
        if (movedRef.current) {
          const s = scaleRef.current || 1;
          const z = padZoomRef.current || 1;
          const interaction = s * z;
          callbacksRef.current.onDragEnd(
            current.id,
            lastDxRef.current / interaction,
            lastDyRef.current / interaction,
          );
        } else {
          const now = Date.now();
          const last = lastTapRef.current;
          const isDoubleTap = last.id === current.id && now - last.time < DOUBLE_TAP_MS;
          lastTapRef.current = { id: current.id, time: now };

          if (isDoubleTap && isTextEditableElement(current.type)) {
            callbacksRef.current.onEditText(current.id);
            return;
          }
          if (selectedRef.current) {
            callbacksRef.current.onOpenPanel(current.id);
          } else {
            callbacksRef.current.onSelect(current.id);
          }
        }
      },
      onPanResponderTerminate: () => {
        const current = elementRef.current;
        if (movedRef.current) {
          const s = scaleRef.current || 1;
          const z = padZoomRef.current || 1;
          const interaction = s * z;
          callbacksRef.current.onDragEnd(
            current.id,
            lastDxRef.current / interaction,
            lastDyRef.current / interaction,
          );
        }
      },
    }),
  ).current;

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        callbacksRef.current.onDragStart(elementRef.current.id);
      },
      onPanResponderMove: (_e, gesture) => {
        const s = scaleRef.current || 1;
        const z = padZoomRef.current || 1;
        const interaction = s * z;
        callbacksRef.current.onResize(
          elementRef.current.id,
          gesture.dx / interaction,
          gesture.dy / interaction,
        );
      },
    }),
  ).current;

  if (element.type === 'border') {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: element.left * scale,
          top: element.top * scale,
          width: widthPx,
          height: heightPx,
          zIndex: 0,
        }}>
        <ElementContentView element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      </View>
    );
  }

  const baseStyle = {
    position: 'absolute' as const,
    left: element.left * scale,
    top: element.top * scale,
    width: widthPx,
    height: heightPx,
    opacity: element.opacity ?? 1,
    zIndex: element.zIndex ?? 0,
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      {...({
        hitSlop: { top: touchSlopY, bottom: touchSlopY, left: touchSlopX, right: touchSlopX },
      } as object)}
      style={[
        baseStyle,
        {
          transform: [
            ...(inLiveDrag
              ? [{ translateX: liveDragX }, { translateY: liveDragY }]
              : []),
            { rotate: `${element.rotation}deg` },
          ],
        },
      ]}>
      <ElementContentView element={element} widthPx={widthPx} heightPx={heightPx} scale={scale} />
      {selected ? (
        <>
          <View
            pointerEvents="none"
            style={[styles.selectionOutline, { borderColor: selectionColor }]}
          />
          <View
            {...resizeResponder.panHandlers}
            hitSlop={{ top: 10, bottom: 12, left: 10, right: 12 }}
            style={styles.resizeHandle}>
            <View style={styles.resizeHandleInner} />
          </View>
          {element.lockMovement ? (
            <View style={styles.lockBadge}>
              <AppIcon name="lock.fill" tintColor="#FFFFFF" size={9} />
            </View>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
});

export default function EditScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    labelId?: string;
    labelName?: string;
    labelWidth?: string;
    labelHeight?: string;
    orientation?: string;
    paperType?: string;
    templateCategory?: string;
    templatePreviewType?: string;
    cloneFromId?: string;
  }>();

  const defaults = useSettingsStore((s) => s.defaults);
  const editorSettings = useSettingsStore((s) => s.editor);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const savedDocuments = useLabelStore((s) => s.documents);
  const { t } = useTranslation();

  const [doc, setDoc] = useState<LabelDocument>(() => {
    const name = params.labelName ?? 'New Label_1';
    const parsed = clampLabelMm(
      params.labelWidth ? parseFloat(params.labelWidth) : defaults.labelWidth,
      params.labelHeight ? parseFloat(params.labelHeight) : defaults.labelHeight,
    );
    const widthMm = parsed.widthMm;
    const heightMm = parsed.heightMm;

    if (params.labelId) {
      const existing = useLabelStore.getState().getDocument(params.labelId);
      if (existing) {
        const copy = JSON.parse(JSON.stringify(existing)) as LabelDocument;
        return { ...copy, elements: normalizeDocumentElements(copy) };
      }
    }

    // Industry templates: same JSON schema as the catalog card (no extra layers).
    if (params.templatePreviewType) {
      const created = createIndustryTemplateDocument({
        name,
        category: params.templateCategory ?? '',
        widthMm,
        heightMm,
        previewType: params.templatePreviewType,
      });
      return {
        ...created,
        id: params.labelId ?? created.id,
        orientation: parseOrientation(params.orientation),
        paperType: parsePaperType(params.paperType),
      };
    }

    // 2ups Label: copy elements from the source document with fresh ids.
    let elements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        elements = (JSON.parse(JSON.stringify(source.elements)) as LabelElement[]).map((el) => ({
          ...el,
          id: generateId(),
        }));
      }
    } else if (params.templateCategory) {
      const created = createIndustryTemplateDocument({
        name,
        category: params.templateCategory,
        widthMm,
        heightMm,
        previewType: params.templatePreviewType ?? '',
      });
      return {
        ...created,
        orientation: parseOrientation(params.orientation),
        paperType: parsePaperType(params.paperType),
      };
    }

    const created = createLabelDocument({
      name,
      widthMm,
      heightMm,
      orientation: parseOrientation(params.orientation),
      paperType: parsePaperType(params.paperType),
      elements,
    });
    return { ...created, elements: normalizeDocumentElements(created) };
  });
  const [savedToStore, setSavedToStore] = useState(() => Boolean(params.labelId));
  const [dirty, setDirty] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multipleMode, setMultipleMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [past, setPast] = useState<LabelElement[][]>([]);
  const [future, setFuture] = useState<LabelElement[][]>([]);

  const toolbarRef = useRef<View>(null);
  const canvasShotRef = useRef<ViewShot>(null);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [labelMenuTop, setLabelMenuTop] = useState(0);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showSignatureBoard, setShowSignatureBoard] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [pickerRows, setPickerRows] = useState(2);
  const [pickerColumns, setPickerColumns] = useState(3);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [stageWidth, setStageWidth] = useState(0);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [padZoom, setPadZoom] = useState(1);

  const [textTab, setTextTab] = useState<PropertyTab>('Regular');
  const [barcodeTab, setBarcodeTab] = useState<BarcodePropertyTab>('Regular');
  const [qrcodeTab, setQrcodeTab] = useState<QrcodePropertyTab>('Regular');
  const [lineTab, setLineTab] = useState<LinePropertyTab>('Regular');
  const [shapeTab, setShapeTab] = useState<ShapePropertyTab>('Regular');
  const [tableTab, setTableTab] = useState<TablePropertyTab>('Regular');
  const [timeTab, setTimeTab] = useState<TimePropertyTab>('Regular');
  const [arcTextTab, setArcTextTab] = useState<ArcTextPropertyTab>('Regular');
  const [degreesTab, setDegreesTab] = useState<PropertyTab>('Regular');

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textEditDraft, setTextEditDraft] = useState('');
  const [textEditField, setTextEditField] = useState<'text' | 'content'>('text');
  const textEditInputRef = useRef<TextInput>(null);
  const [contentFocusRequest, setContentFocusRequest] = useState(0);

  const stageMaxHeight = Math.max(220, Math.min(windowHeight * 0.46, 400));
  // Stage width is measured once from the viewport; canvas size is contain-fit into
  // (stage − rulers) and does not change when elements are added/selected.
  const layoutWidth = stageWidth > 0 ? stageWidth : windowWidth;
  const fittedPad = fitLabelCanvas(
    doc.widthMm,
    doc.heightMm,
    Math.max(40, layoutWidth - RULER_SIZE - 16),
    Math.max(40, stageMaxHeight - RULER_SIZE - 16),
  );
  const canvasHeightPx = fittedPad.heightPx;
  const canvasWidthPx = fittedPad.widthPx;
  const scale = fittedPad.scale;

  // Reset pad zoom when the label size changes so fit stays correct.
  useEffect(() => {
    setPadZoom(1);
  }, [doc.widthMm, doc.heightMm]);
  const selectionColor =
    ['#FCA5A5', '#EF4444', '#991B1B'][editorSettings.borderColorIndex] ?? Palette.accent;

  const selectedElement =
    selectedIds.length === 1
      ? doc.elements.find((el) => el.id === selectedIds[0]) ?? null
      : null;

  const docRef = useRef(doc);
  docRef.current = doc;

  const pushHistory = useCallback(() => {
    setPast((prev) => {
      const snapshot = JSON.parse(JSON.stringify(docRef.current.elements)) as LabelElement[];
      const next = [...prev, snapshot];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setFuture([]);
  }, []);

  const setElements = useCallback(
    (updater: (elements: LabelElement[]) => LabelElement[], recordHistory = false) => {
      if (recordHistory) pushHistory();
      setDoc((prev) => {
        const nextElements = updater(prev.elements).map((el) =>
          clampElementToLabel(el, prev),
        );
        let next: LabelDocument = { ...prev, elements: nextElements };
        if (next.ups) {
          next = syncUpsActivePanel(next);
          if (next.ups?.batchEdit) {
            next = applyUpsBatchMirror(next);
          }
        }
        return next;
      });
      setDirty(true);
    },
    [pushHistory],
  );

  const goToUpsPanel = useCallback((nextIndex: number) => {
    setDoc((prev) => {
      if (!prev.ups || nextIndex === prev.ups.activeIndex) return prev;
      return switchUpsPanel(prev, nextIndex);
    });
    setSelectedIds([]);
    setPanelOpen(false);
    setPast([]);
    setFuture([]);
    setTextEditId(null);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setFuture((f) => [
        JSON.parse(JSON.stringify(docRef.current.elements)) as LabelElement[],
        ...f,
      ]);
      setDoc((d) => {
        let next: LabelDocument = { ...d, elements: snapshot };
        if (next.ups) next = syncUpsActivePanel(next);
        return next;
      });
      setDirty(true);
      return prev.slice(0, -1);
    });
    setSelectedIds([]);
    setPanelOpen(false);
  }, []);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const [snapshot, ...rest] = prev;
      setPast((p) => [
        ...p,
        JSON.parse(JSON.stringify(docRef.current.elements)) as LabelElement[],
      ]);
      setDoc((d) => {
        let next: LabelDocument = { ...d, elements: snapshot };
        if (next.ups) next = syncUpsActivePanel(next);
        return next;
      });
      setDirty(true);
      return rest;
    });
    setSelectedIds([]);
    setPanelOpen(false);
  }, []);

  const patchElement = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      setElements((elements) =>
        elements.map((el) => (el.id === id ? ({ ...el, ...updates } as LabelElement) : el)),
      );
    },
    [setElements],
  );

  const patchSelected = useCallback(
    (updates: Record<string, unknown>) => {
      if (selectedIds.length !== 1) return;
      patchElement(selectedIds[0], updates);
    },
    [selectedIds, patchElement],
  );

  const addElement = useCallback(
    (type: ElementType, overrides: Record<string, unknown> = {}) => {
      const { widthMm: maxW, heightMm: maxH, elements } = docRef.current;
      const base = { id: generateId() };
      let element: LabelElement;
      switch (type) {
        case 'text': {
          const fit = fitTextDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_ELEMENT_STATE,
            ...base,
            type: 'text',
            text: 'Text',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            fontSize: fit.fontSize,
            autoWrapping: defaults.autoWrap,
            autoTextHeight: defaults.autoTextHeight,
            ...overrides,
          };
          break;
        }
        case 'barcode': {
          const fit = fitBarcodeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_BARCODE_STATE,
            ...base,
            type: 'barcode',
            encodeMode: defaults.barcodeEncodeMode,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            fontSize: fit.fontSize,
            ...overrides,
          };
          break;
        }
        case 'qrcode': {
          const fit = fitQrcodeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_QRCODE_STATE,
            ...base,
            type: 'qrcode',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            errorLevel: defaults.qrErrorLevel,
            zoneSize: defaults.qrZoneSize,
            ...overrides,
          };
          break;
        }
        case 'line': {
          const fit = fitLineDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_LINE_STATE,
            ...base,
            type: 'line',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            ...overrides,
          };
          break;
        }
        case 'shape': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_SHAPE_STATE,
            ...base,
            type: 'shape',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            ...overrides,
          };
          break;
        }
        case 'table': {
          const fit = fitTableDefaults(maxW, maxH, pickerRows, pickerColumns, elements);
          const tableState = createTableState(pickerRows, pickerColumns);
          element = {
            ...tableState,
            ...base,
            type: 'table',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            rowHeights: fit.rowHeights,
            columnWidths: fit.columnWidths,
            ...overrides,
          };
          break;
        }
        case 'time': {
          const fit = fitTimeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_TIME_STATE,
            ...base,
            type: 'time',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            fontSize: fit.fontSize,
            ...overrides,
          };
          break;
        }
        case 'arctext': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_ARCTEXT_STATE,
            ...base,
            type: 'arctext',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            fontSize: fitTextDefaults(maxW, maxH, elements).fontSize,
            ...overrides,
          };
          break;
        }
        case 'degrees': {
          const fit = fitTextDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_DEGREES_STATE,
            ...base,
            type: 'degrees',
            left: fit.left,
            top: fit.top,
            width: fit.width,
            fontSize: fit.fontSize,
            ...overrides,
          };
          break;
        }
        case 'image': {
          const fit = fitClipartDefaults(maxW, maxH, elements);
          element = {
            id: base.id,
            type: 'image',
            uri: '',
            rotation: 0,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            lockMovement: false,
            needPrinting: true,
            antiColor: false,
            ...overrides,
          };
          break;
        }
        case 'clipart': {
          const fit = fitClipartDefaults(maxW, maxH, elements);
          element = {
            id: base.id,
            type: 'clipart',
            clipartId: '',
            rotation: 0,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            lockMovement: false,
            needPrinting: true,
            drawingColorIndex: 0,
            ...overrides,
          };
          break;
        }
        case 'border':
          element = {
            id: base.id,
            type: 'border',
            borderStyle: 'solid-medium',
            lineWidth: 0.75,
            rotation: 0,
            left: 0,
            top: 0,
            width: maxW,
            height: maxH,
            lockMovement: true,
            needPrinting: true,
            drawingColorIndex: 0,
            ...overrides,
          };
          break;
        case 'signature': {
          const fit = fitShapeDefaults(maxW, maxH, elements);
          element = {
            id: base.id,
            type: 'signature',
            strokes: [],
            rotation: 0,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            height: fit.height,
            lockMovement: false,
            needPrinting: true,
            drawingColorIndex: 0,
            ...overrides,
          };
          break;
        }
        default:
          return null;
      }
      element = clampElementToLabel(element, docRef.current);
      setElements((items) => [...items, element], true);
      setSelectedIds([element.id]);
      return element;
    },
    [defaults, pickerRows, pickerColumns, setElements],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setElements((elements) => elements.filter((el) => !selectedIds.includes(el.id)), true);
    setSelectedIds([]);
    setPanelOpen(false);
  }, [selectedIds, setElements]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        if (multipleMode) {
          return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        }
        return [id];
      });
    },
    [multipleMode],
  );

  const openPanelFor = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    setSelectedIds([id]);
    if (element.type === 'signature') {
      setShowSignatureBoard(true);
      return;
    }
    if (
      element.type === 'image' ||
      element.type === 'clipart' ||
      element.type === 'border'
    ) {
      return;
    }
    setPanelOpen(true);
  }, []);

  const beginTextEdit = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    setSelectedIds([id]);
    setPanelOpen(true);

    if (element.type === 'text') {
      setTextTab('Content');
      setTextEditField('text');
      setTextEditDraft(element.text);
      setTextEditId(id);
      setContentFocusRequest((n) => n + 1);
    } else if (element.type === 'degrees') {
      setDegreesTab('Content');
      setTextEditField('content');
      setTextEditDraft(element.content);
      setTextEditId(id);
      setContentFocusRequest((n) => n + 1);
    } else {
      return;
    }

    requestAnimationFrame(() => {
      textEditInputRef.current?.focus();
    });
  }, []);

  const commitTextEdit = useCallback(() => {
    setTextEditId(null);
    textEditInputRef.current?.blur();
  }, []);

  const handleTextEditChange = useCallback(
    (value: string) => {
      setTextEditDraft(value);
      if (!textEditId) return;
      patchElement(textEditId, { [textEditField]: value });
    },
    [patchElement, textEditField, textEditId],
  );

  const selectedElementHeightMm = selectedElement ? elementSizeMm(selectedElement).height : 0;
  const labelBounds = useMemo(
    () => ({ widthMm: doc.widthMm, heightMm: doc.heightMm }),
    [doc.widthMm, doc.heightMm],
  );

  /**
   * Element geometry captured when a drag/resize gesture starts.
   * Live motion uses Animated translate; model mm is committed once on release.
   */
  const gestureBasesRef = useRef(
    new Map<
      string,
      { left: number; top: number; width: number; height: number; fontSize: number }
    >(),
  );
  const liveDragX = useRef(new Animated.Value(0)).current;
  const liveDragY = useRef(new Animated.Value(0)).current;
  const [liveDragActiveIds, setLiveDragActiveIds] = useState<string[] | null>(null);
  const liveDragIdsRef = useRef<string[]>([]);
  const pendingDragMmRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const handleDragStart = useCallback(
    (id: string) => {
      gestureBasesRef.current = new Map();
      pushHistory();
      const ids =
        selectedIds.includes(id) && selectedIds.length > 0 ? [...selectedIds] : [id];
      liveDragIdsRef.current = ids;
      liveDragX.setValue(0);
      liveDragY.setValue(0);
      setLiveDragActiveIds(ids);

      const doc = docRef.current;
      for (const el of doc.elements) {
        if (!ids.includes(el.id) || el.lockMovement) continue;
        const size = elementSizeMm(el);
        gestureBasesRef.current.set(el.id, {
          left: el.left,
          top: el.top,
          width: el.width,
          height:
            'height' in el && typeof el.height === 'number' && el.height > 0
              ? el.height
              : size.height,
          fontSize: 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 0,
        });
      }
    },
    [pushHistory, selectedIds, liveDragX, liveDragY],
  );

  const baseFor = useCallback((el: LabelElement) => {
    let base = gestureBasesRef.current.get(el.id);
    if (!base) {
      const size = elementSizeMm(el);
      base = {
        left: el.left,
        top: el.top,
        width: el.width,
        height:
          'height' in el && typeof el.height === 'number' && el.height > 0
            ? el.height
            : size.height,
        fontSize: 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 0,
      };
      gestureBasesRef.current.set(el.id, base);
    }
    return base;
  }, []);

  /** Live visual follow only — model mm positions update on drag end. */
  const handleDrag = useCallback(
    (_id: string, totalDxMm: number, totalDyMm: number) => {
      const s = scale || 1;
      liveDragX.setValue(totalDxMm * s);
      liveDragY.setValue(totalDyMm * s);
      pendingDragMmRef.current = { id: _id, dx: totalDxMm, dy: totalDyMm };
    },
    [scale, liveDragX, liveDragY],
  );

  const handleDragEnd = useCallback(
    (id: string, totalDxMm: number, totalDyMm: number) => {
      const pending = pendingDragMmRef.current;
      const dx = pending?.id === id ? pending.dx : totalDxMm;
      const dy = pending?.id === id ? pending.dy : totalDyMm;
      pendingDragMmRef.current = null;

      const moveIds = liveDragIdsRef.current.length > 0 ? liveDragIdsRef.current : [id];
      const docNow = docRef.current;

      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (!moveIds.includes(el.id) || el.lockMovement) return el;
          const base = gestureBasesRef.current.get(el.id) ?? {
            left: el.left,
            top: el.top,
            width: el.width,
            height: elementSizeMm(el).height,
            fontSize: 0,
          };
          const maxLeft = Math.max(0, prev.widthMm - base.width);
          const maxTop = Math.max(0, prev.heightMm - Math.min(base.height, prev.heightMm));
          let left = snapMm(base.left + dx);
          let top = snapMm(base.top + dy);
          left = Math.min(Math.max(left, 0), maxLeft);
          top = Math.min(Math.max(top, 0), maxTop);

          if (
            useSettingsStore.getState().editor.pictureAdsorption &&
            (el.type === 'image' || el.type === 'clipart')
          ) {
            const threshold = 1;
            if (left < threshold) left = 0;
            if (top < threshold) top = 0;
            if (docNow.widthMm - (left + base.width) < threshold) {
              left = Math.max(0, docNow.widthMm - base.width);
            }
            if (docNow.heightMm - (top + base.height) < threshold) {
              top = Math.max(0, docNow.heightMm - base.height);
            }
          }

          return { ...el, left, top };
        }),
      }));
      setDirty(true);

      // Same React tick: drop live translate + commit left/top together (no double offset).
      liveDragIdsRef.current = [];
      liveDragX.setValue(0);
      liveDragY.setValue(0);
      setLiveDragActiveIds(null);
    },
    [liveDragX, liveDragY],
  );

  const handleResize = useCallback(
    (id: string, totalDwMm: number, totalDhMm: number) => {
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (el.id !== id) return el;
          const base = baseFor(el);
          const nextWidth = Math.min(
            prev.widthMm - el.left,
            Math.max(3, snapMm(base.width + totalDwMm)),
          );

          if (el.type === 'text' || el.type === 'degrees' || el.type === 'time') {
            const source = el.type === 'time' ? ' ' : 'text' in el ? el.text : el.content;
            const lines = Math.max(1, source.split('\n').length);
            const nextHeight = Math.min(
              prev.heightMm - el.top,
              Math.max(2.4, snapMm(base.height + totalDhMm)),
            );
            const nextFont = Math.max(
              6,
              Math.min(48, Math.round((mmToPt(nextHeight / (1.25 * lines)) * 2)) / 2),
            );
            return { ...el, width: nextWidth, fontSize: nextFont };
          }

          const next: LabelElement = { ...el, width: nextWidth };
          if ('height' in next && typeof next.height === 'number' && next.type !== 'line') {
            (next as { height: number }).height = Math.min(
              prev.heightMm - el.top,
              Math.max(2, snapMm(base.height + totalDhMm)),
            );
          }
          return next;
        }),
      }));
      setDirty(true);
    },
    [baseFor],
  );

  const setLockOnSelection = useCallback(
    (locked: boolean) => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) =>
            selectedIds.includes(el.id) ? { ...el, lockMovement: locked } : el,
          ),
        true,
      );
    },
    [selectedIds, setElements],
  );

  const saveDocument = useCallback(
    (showToast = true) => {
      const synced = syncUpsActivePanel(docRef.current);
      if (synced !== docRef.current) {
        setDoc(synced);
        docRef.current = synced;
      }
      upsertDocument(synced);
      setSavedToStore(true);
      setDirty(false);
      if (showToast) Alert.alert('Saved', `"${synced.name}" has been saved.`);
    },
    [upsertDocument],
  );

  const handleSaveAs = useCallback(() => {
    setSaveAsName(doc.name);
    setSaveAsVisible(true);
  }, [doc.name]);

  const confirmSaveAs = useCallback(() => {
    const name = saveAsName.trim();
    if (!name) {
      setSaveAsVisible(false);
      return;
    }
    const copy = JSON.parse(JSON.stringify(docRef.current)) as LabelDocument;
    copy.id = generateId('label');
    copy.name = name;
    copy.createdAt = Date.now();
    setDoc(copy);
    upsertDocument(copy);
    setSavedToStore(true);
    setDirty(false);
    setSaveAsVisible(false);
  }, [saveAsName, upsertDocument]);

  const openDocument = useCallback((docToOpen: LabelDocument) => {
    const copy = JSON.parse(JSON.stringify(docToOpen)) as LabelDocument;
    setDoc(copy);
    setSavedToStore(true);
    setDirty(false);
    setSelectedIds([]);
    setPanelOpen(false);
    setPast([]);
    setFuture([]);
    setShowOpenModal(false);
  }, []);

  const handlePrint = useCallback(() => {
    saveDocument(false);
    router.push({ pathname: '/print', params: { labelId: docRef.current.id } });
  }, [saveDocument]);

  const applyLabelSize = useCallback((widthMm: number, heightMm: number) => {
    setDoc((prev) => {
      if (Math.abs(prev.widthMm - widthMm) < 0.001 && Math.abs(prev.heightMm - heightMm) < 0.001) {
        return prev;
      }
      return scaleDocumentToSize(prev, widthMm, heightMm);
    });
    setDirty(true);
  }, []);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const maxW = docRef.current.widthMm * 0.5;
    const ratio = asset.width && asset.height ? asset.height / asset.width : 1;
    addElement('image', {
      uri: asset.uri,
      width: maxW,
      height: Math.min(maxW * ratio, docRef.current.heightMm - 2),
    });
  }, [addElement]);

  useFocusEffect(
    useCallback(() => {
      const applyCapture = (kind: 'Text' | 'Barcode' | 'QRCode', data: string, encodeMode?: string) => {
        if (kind === 'QRCode') {
          addElement('qrcode', {
            contentType: 'Manual',
            content: data,
            encodeMode: encodeMode ?? 'QRCode',
          });
          setQrcodeTab('Content');
          setPanelOpen(true);
        } else if (kind === 'Barcode') {
          addElement('barcode', {
            contentType: 'Manual',
            content: data,
            encodeMode: encodeMode ?? 'CODE-128',
          });
          setBarcodeTab('Content');
          setPanelOpen(true);
        } else {
          addElement('text', { text: data, contentType: 'Manual' });
          setTextTab('Content');
          setPanelOpen(true);
        }
      };

      if (editorBridge.asrResult) {
        const { type, data } = editorBridge.asrResult;
        editorBridge.asrResult = null;
        applyCapture(type === 'QRCode' ? 'QRCode' : type === 'Barcode' ? 'Barcode' : 'Text', data);
      }

      if (editorBridge.ocrResult) {
        const { type, data } = editorBridge.ocrResult;
        editorBridge.ocrResult = null;
        applyCapture(type === 'QRCode' ? 'QRCode' : type === 'Barcode' ? 'Barcode' : 'Text', data);
      }

      if (editorBridge.scanResult) {
        const { type, data } = editorBridge.scanResult;
        editorBridge.scanResult = null;
        if (isQrScanType(type)) {
          applyCapture(
            'QRCode',
            data,
            type.toLowerCase() === 'pdf417'
              ? 'PDF417'
              : type.toLowerCase() === 'datamatrix'
              ? 'DataMatrix'
              : 'QRCode',
          );
        } else if (type !== 'MANUAL' || /^\d+$/.test(data)) {
          applyCapture('Barcode', data, barcodeEncodeModeForScanType(type));
        } else {
          applyCapture('Text', data);
        }
      }

      if (editorBridge.columnNameResult !== null) {
        const value = editorBridge.columnNameResult;
        const consumer = editorBridge.columnNameConsumer;
        editorBridge.columnNameResult = null;
        editorBridge.columnNameConsumer = null;
        if (consumer && selectedIds.length === 1) {
          patchElement(selectedIds[0], { columnNameContent: value });
        }
      }

      if (editorBridge.clipartResult) {
        const clipart = editorBridge.clipartResult;
        editorBridge.clipartResult = null;
        addElement('clipart', {
          clipartId: clipart.id,
        });
      }

      if (editorBridge.borderResult) {
        const borderStyle = editorBridge.borderResult;
        editorBridge.borderResult = null;
        const existingBorder = docRef.current.elements.find((el) => el.type === 'border');
        if (existingBorder) {
          patchElement(existingBorder.id, { borderStyle });
        } else {
          addElement('border', { borderStyle });
        }
      }

      if (editorBridge.fontResult) {
        const fontName = editorBridge.fontResult;
        editorBridge.fontResult = null;
        if (selectedIds.length === 1) {
          const el = docRef.current.elements.find((e) => e.id === selectedIds[0]);
          if (el && 'fontFamily' in el) {
            patchElement(el.id, { fontFamily: fontName });
          }
        }
      }
    }, [addElement, patchElement, selectedIds]),
  );

  // Reload when navigated to an existing label while the screen is mounted.
  const lastLoadedId = useRef<string | undefined>(params.labelId);
  useEffect(() => {
    if (!params.labelId) return;
    if (params.labelId === lastLoadedId.current) return;
    lastLoadedId.current = params.labelId;
    const existing = useLabelStore.getState().getDocument(params.labelId);
    if (existing) openDocument(existing);
  }, [params.labelId, openDocument]);

  const handleColumnNamePress = useCallback(() => {
    if (!selectedElement || !('columnNameContent' in selectedElement)) return;
    editorBridge.columnNameConsumer =
      selectedElement.type === 'text'
        ? 'text'
        : selectedElement.type === 'barcode'
        ? 'barcode'
        : selectedElement.type === 'arctext'
        ? 'arctext'
        : selectedElement.type === 'degrees'
        ? 'degrees'
        : 'qrcode';
    router.push({
      pathname: '/column-name',
      params: { value: selectedElement.columnNameContent ?? '' },
    });
  }, [selectedElement]);

  const openLabelMenu = () => {
    toolbarRef.current?.measureInWindow((_x, y, _w, h) => {
      setLabelMenuTop(y + h);
      setShowLabelMenu(true);
    });
  };

  const handleToolPress = (label: string) => {
    setShowLabelMenu(false);
    switch (label) {
      case 'Text':
        addElement('text');
        setTextTab('Regular');
        setPanelOpen(true);
        break;
      case 'Barcode':
        addElement('barcode');
        setBarcodeTab('Regular');
        setPanelOpen(true);
        break;
      case 'QRCode':
        addElement('qrcode');
        setQrcodeTab('Regular');
        setPanelOpen(true);
        break;
      case 'Line':
        addElement('line');
        setLineTab('Regular');
        setPanelOpen(true);
        break;
      case 'Shapes':
        addElement('shape');
        setShapeTab('Regular');
        setPanelOpen(true);
        break;
      case 'Table':
        setPickerRows(2);
        setPickerColumns(3);
        setShowTablePicker(true);
        break;
      case 'Time':
        addElement('time');
        setTimeTab('Regular');
        setPanelOpen(true);
        break;
      case 'ArcText':
        addElement('arctext');
        setArcTextTab('Regular');
        setPanelOpen(true);
        break;
      case 'Degrees':
        addElement('degrees');
        setDegreesTab('Regular');
        setPanelOpen(true);
        break;
      case 'Image':
        void handlePickImage();
        break;
      case 'Clipart':
        router.push({ pathname: '/clipart', params: { from: 'edit' } });
        break;
      case 'Border':
        router.push({ pathname: '/border-library', params: { from: 'edit' } });
        break;
      case 'Excel':
        router.push({ pathname: '/data-file', params: { type: 'Excel' } });
        break;
      case 'Scan':
        router.push({ pathname: '/scan', params: { from: 'edit' } });
        break;
      case 'OCR':
        router.push({ pathname: '/ocr', params: { from: 'edit' } });
        break;
      case 'ASR':
        router.push({ pathname: '/asr', params: { from: 'edit' } });
        break;
      case '2ups Label':
        saveDocument(false);
        router.push({
          pathname: '/new-label-setup',
          params: {
            isTwoUps: 'true',
            cloneFromId: docRef.current.id,
            cloneName: docRef.current.name,
            cloneWidth: String(docRef.current.widthMm),
            cloneHeight: String(docRef.current.heightMm),
          },
        });
        break;
      case 'Signature':
        setShowSignatureBoard(true);
        break;
      default:
        break;
    }
  };

  const handleSignatureConfirm = (strokes: SignatureStroke[]) => {
    const selectedSignature =
      selectedElement && selectedElement.type === 'signature' ? selectedElement : null;
    if (selectedSignature) {
      patchElement(selectedSignature.id, { strokes });
    } else if (strokes.length > 0) {
      const size = Math.min(doc.widthMm, doc.heightMm) * 0.6;
      addElement('signature', { strokes, width: size, height: size });
    }
    setShowSignatureBoard(false);
  };

  const handleTablePickerConfirm = () => {
    const tableState = createTableState(pickerRows, pickerColumns);
    addElement('table', {
      rowCount: tableState.rowCount,
      columnCount: tableState.columnCount,
      rowHeights: tableState.rowHeights,
      columnWidths: tableState.columnWidths,
    });
    setTableTab('Regular');
    setShowTablePicker(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    commitTextEdit();
    setPanelOpen(false);
  };

  const renderToolbar = () => (
    <View ref={toolbarRef} collapsable={false} style={styles.toolbarRow}>
      <ToolbarItem
        icon="gearshape"
        label="Label"
        active={showLabelMenu}
        onPress={openLabelMenu}
      />
      <ToolbarItem
        icon="checkmark.square"
        label="Multiple"
        active={multipleMode}
        onPress={() => {
          setMultipleMode((m) => !m);
          setSelectedIds([]);
        }}
      />
      <ToolbarItem
        icon="arrow.uturn.backward"
        label="Undo"
        disabled={past.length === 0}
        onPress={undo}
      />
      <ToolbarItem
        icon="arrow.uturn.forward"
        label="Redo"
        disabled={future.length === 0}
        onPress={redo}
      />
      <ToolbarItem
        icon="lock"
        label="Lock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(true)}
      />
      <ToolbarItem
        icon="lock.open"
        label="Unlock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(false)}
      />
      <ToolbarItem
        icon="trash"
        label="Delete"
        withDivider
        disabled={selectedIds.length === 0}
        onPress={deleteSelected}
      />
    </View>
  );

  const gridLines = useMemo(() => {
    if (!editorSettings.editorGrid || scale <= 0) return null;
    const stepPx = 5 * scale;
    const vertical: number[] = [];
    const horizontal: number[] = [];
    for (let x = stepPx; x < canvasWidthPx; x += stepPx) vertical.push(x);
    for (let y = stepPx; y < canvasHeightPx; y += stepPx) horizontal.push(y);
    return (
      <Svg
        width={canvasWidthPx}
        height={canvasHeightPx}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none">
        {vertical.map((x) => (
          <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={canvasHeightPx} stroke="#E2E8F0" strokeWidth={1} />
        ))}
        {horizontal.map((y) => (
          <Line key={`h${y}`} x1={0} y1={y} x2={canvasWidthPx} y2={y} stroke="#E2E8F0" strokeWidth={1} />
        ))}
      </Svg>
    );
  }, [editorSettings.editorGrid, scale, canvasWidthPx, canvasHeightPx]);

  const renderCanvas = () => (
    <View
      style={[styles.stage, { height: stageMaxHeight }]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (Math.abs(next - stageWidth) > 1) setStageWidth(next);
      }}>
      <ZoomableEditPad
        style={styles.stageZoom}
        zoom={padZoom}
        onZoomChange={setPadZoom}
        oneFingerPanEnabled={selectedIds.length === 0 && liveDragActiveIds == null}>
        <View
          style={[
            styles.rulerBoard,
            {
              width: RULER_SIZE + (canvasWidthPx || 1),
              height: RULER_SIZE + (canvasHeightPx || 1),
            },
          ]}>
          <View style={styles.rulerTopRow}>
            <View style={styles.rulerCorner} />
            <HorizontalRuler widthPx={canvasWidthPx || 1} lengthMm={doc.widthMm} pxPerMm={scale} />
          </View>
          <View style={styles.rulerBodyRow}>
            <VerticalRuler heightPx={canvasHeightPx || 1} lengthMm={doc.heightMm} pxPerMm={scale} />
            <View
              collapsable={false}
              style={{
                width: canvasWidthPx || 1,
                height: canvasHeightPx || 1,
                overflow: 'hidden',
              }}>
              <ViewShot
                ref={canvasShotRef}
                options={{ format: 'png', quality: 1 }}
                style={{ width: canvasWidthPx || 1, height: canvasHeightPx || 1 }}>
                <ArtboardFrame document={doc} widthPx={canvasWidthPx || 1} heightPx={canvasHeightPx || 1}>
                  <Pressable
                    onPress={() => setSelectedIds([])}
                    style={{
                      width: canvasWidthPx || 1,
                      height: canvasHeightPx || 1,
                      overflow: 'hidden',
                    }}>
                    {doc.background?.type === 'image' ? (
                      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                        <Image
                          source={{ uri: doc.background.uri }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                      </View>
                    ) : null}
                    {gridLines}
                    {scale > 0
                      ? sortLayers(doc.elements).map((element) => (
                          <CanvasElement
                            key={element.id}
                            element={element}
                            scale={scale}
                            padZoom={padZoom}
                            selected={selectedIds.includes(element.id)}
                            selectionColor={selectionColor}
                            liveDragX={liveDragX}
                            liveDragY={liveDragY}
                            liveDragActiveIds={liveDragActiveIds}
                            onSelect={handleSelect}
                            onOpenPanel={openPanelFor}
                            onEditText={beginTextEdit}
                            onDrag={handleDrag}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onResize={handleResize}
                          />
                        ))
                      : null}
                    {doc.elements.length === 0 ? (
                      <View pointerEvents="none" style={styles.emptyHintWrap}>
                        <Text style={styles.emptyHint}>Tap a tool below to add elements</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </ArtboardFrame>
              </ViewShot>
            </View>
          </View>
        </View>
      </ZoomableEditPad>
    </View>
  );

  const renderPanel = () => {
    if (!selectedElement) return null;
    switch (selectedElement.type) {
      case 'text':
        return (
          <TextPropertyPanel
            activeTab={textTab}
            onTabChange={setTextTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            contentFocusRequest={contentFocusRequest}
          />
        );
      case 'barcode':
        return (
          <BarcodePropertyPanel
            activeTab={barcodeTab}
            onTabChange={setBarcodeTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'qrcode':
        return (
          <QrcodePropertyPanel
            activeTab={qrcodeTab}
            onTabChange={setQrcodeTab}
            state={selectedElement}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'line':
        return (
          <LinePropertyPanel
            activeTab={lineTab}
            onTabChange={setLineTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'shape':
        return (
          <ShapePropertyPanel
            activeTab={shapeTab}
            onTabChange={setShapeTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'table':
        return (
          <TablePropertyPanel
            activeTab={tableTab}
            onTabChange={setTableTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'time':
        return (
          <TimePropertyPanel
            activeTab={timeTab}
            onTabChange={setTimeTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'arctext':
        return (
          <ArcTextPropertyPanel
            activeTab={arcTextTab}
            onTabChange={setArcTextTab}
            state={selectedElement}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
          />
        );
      case 'degrees':
        return (
          <DegreesPropertyPanel
            activeTab={degreesTab}
            onTabChange={setDegreesTab}
            state={selectedElement}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            contentFocusRequest={contentFocusRequest}
          />
        );
      default:
        return null;
    }
  };

  const propertyMode = panelOpen && selectedElement !== null && renderPanel() !== null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => {
              if (dirty) {
                Alert.alert('Unsaved Changes', 'Save this label before leaving?', [
                  { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                  {
                    text: 'Save',
                    onPress: () => {
                      saveDocument(false);
                      router.back();
                    },
                  },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              } else {
                router.back();
              }
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
          </Pressable>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitle}>
            {doc.name}
            {dirty ? ' •' : ''}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <HeaderAction icon="folder" label={t('common.open')} onPress={() => setShowOpenModal(true)} />
          <HeaderAction icon="square.and.arrow.down.on.square" label={t('common.saveAs')} onPress={handleSaveAs} />
          <HeaderAction icon="tray.and.arrow.down.fill" label={t('common.save')} onPress={() => saveDocument()} />
          <HeaderAction icon="printer.fill" label={t('print.print')} onPress={handlePrint} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.body, { maxWidth: MaxContentWidth }]}>
        <Pressable
          onPress={() => setSizeModalVisible(true)}
          style={({ pressed }) => [styles.subToolbar, pressed && styles.pressed]}>
          <Text style={styles.dimText}>
            {doc.widthMm.toFixed(1)} × {doc.heightMm.toFixed(1)} mm · {doc.paperType}
            {doc.orientation ? ` · ${doc.orientation}°` : ''}
            {doc.ups ? ` · ${doc.ups.columns}ups` : ''}
          </Text>
          <Text style={styles.sizeHint}>Tap to customize size</Text>
        </Pressable>

        {doc.ups && doc.ups.columns > 1 ? (
          <View style={styles.upsPager}>
            <Pressable
              disabled={doc.ups.activeIndex <= 0}
              onPress={() => goToUpsPanel(doc.ups!.activeIndex - 1)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.upsPagerBtn,
                doc.ups!.activeIndex <= 0 && styles.upsPagerBtnDisabled,
                pressed && doc.ups!.activeIndex > 0 && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.upsPagerChevron,
                  doc.ups!.activeIndex <= 0 && styles.upsPagerChevronDisabled,
                ]}>
                ‹
              </Text>
            </Pressable>
            <Text style={styles.upsPagerText}>
              {doc.ups.activeIndex + 1}/{doc.ups.columns}
            </Text>
            <Pressable
              disabled={doc.ups.activeIndex >= doc.ups.columns - 1}
              onPress={() => goToUpsPanel(doc.ups!.activeIndex + 1)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.upsPagerBtn,
                doc.ups!.activeIndex >= doc.ups!.columns - 1 && styles.upsPagerBtnDisabled,
                pressed && doc.ups!.activeIndex < doc.ups!.columns - 1 && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.upsPagerChevron,
                  doc.ups.activeIndex >= doc.ups.columns - 1 && styles.upsPagerChevronDisabled,
                ]}>
                ›
              </Text>
            </Pressable>
          </View>
        ) : null}

        {renderCanvas()}

        <View style={styles.sheet}>
          {propertyMode ? (
            <View style={styles.panelHeader}>
              {renderToolbar()}
              <Pressable
                onPress={closePanel}
                hitSlop={10}
                style={({ pressed }) => [styles.panelCloseBtn, pressed && styles.pressed]}>
                <AppIcon name="xmark" tintColor={Palette.muted} size={16} />
              </Pressable>
            </View>
          ) : (
            renderToolbar()
          )}
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.three }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {propertyMode ? renderPanel() : (
              <View style={styles.toolsGrid}>
                {TOOLS.map((t) => (
                  <ToolItem key={t.label} {...t} onPress={() => handleToolPress(t.label)} />
                ))}
              </View>
            )}
          </ScrollView>
        </View>

        {textEditId ? (
          <View style={[styles.textEditBar, { paddingBottom: insets.bottom + Spacing.two }]}>
            <TextInput
              ref={textEditInputRef}
              style={styles.textEditInput}
              value={textEditDraft}
              onChangeText={handleTextEditChange}
              onSubmitEditing={commitTextEdit}
              blurOnSubmit
              multiline
              autoFocus
              placeholder="Type text…"
              placeholderTextColor="#94A3B8"
              returnKeyType="done"
            />
            <Pressable
              onPress={commitTextEdit}
              hitSlop={8}
              style={({ pressed }) => [styles.textEditDoneBtn, pressed && styles.pressed]}>
              <Text style={styles.textEditDoneText}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <LabelSettingsMenu
        visible={showLabelMenu}
        topOffset={labelMenuTop}
        onClose={() => setShowLabelMenu(false)}
        onOpen={() => setShowOpenModal(true)}
        onSave={() => saveDocument()}
        onSaveAs={handleSaveAs}
        onShare={() => {
          saveDocument(false);
          router.push({ pathname: '/share', params: { labelId: docRef.current.id } });
        }}
        onUpload={() => {
          saveDocument(false);
          useLabelStore.getState().uploadToCloud(docRef.current);
          Alert.alert(
            'Template saved',
            `"${docRef.current.name}" is in Select Existing Template and Template → Cloud.`,
          );
        }}
      />

      {showTablePicker && (
        <TableSizePicker
          rows={pickerRows}
          columns={pickerColumns}
          onRowsChange={setPickerRows}
          onColumnsChange={setPickerColumns}
          onCancel={() => setShowTablePicker(false)}
          onConfirm={handleTablePickerConfirm}
        />
      )}

      {showSignatureBoard && (
        <SignatureDrawingBoard
          initialStrokes={
            selectedElement && selectedElement.type === 'signature'
              ? selectedElement.strokes
              : []
          }
          onCancel={() => setShowSignatureBoard(false)}
          onConfirm={handleSignatureConfirm}
        />
      )}

      <Modal
        visible={saveAsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveAsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Save As</Text>
            <TextInput
              style={styles.modalInput}
              value={saveAsName}
              onChangeText={setSaveAsName}
              placeholder="Label name"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setSaveAsVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSaveBtn]} onPress={confirmSaveAs}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOpenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOpenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.openModalCard]}>
            <Text style={styles.modalHeading}>Open Label</Text>
            {savedDocuments.length === 0 ? (
              <Text style={styles.openEmptyText}>No saved labels yet.</Text>
            ) : (
              <ScrollView style={styles.openList}>
                {savedDocuments.map((saved) => (
                  <Pressable
                    key={saved.id}
                    onPress={() => openDocument(saved)}
                    style={({ pressed }) => [styles.openRow, pressed && styles.pressed]}>
                    <AppIcon name="doc.text" tintColor={Palette.accent} size={18} />
                    <View style={styles.openRowInfo}>
                      <Text numberOfLines={1} style={styles.openRowName}>
                        {saved.name}
                      </Text>
                      <Text style={styles.openRowMeta}>
                        {saved.widthMm.toFixed(0)}×{saved.heightMm.toFixed(0)} mm ·{' '}
                        {saved.elements.length} element{saved.elements.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={[styles.modalBtn, styles.modalCancelBtn, styles.openCloseBtn]}
              onPress={() => setShowOpenModal(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={sizeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSizeModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sizeModalScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.modalCard, styles.sizeModalCard]}>
              <Text style={styles.modalHeading}>Label size</Text>
              {sizeModalVisible ? (
                <LabelSizeEditor
                  widthMm={doc.widthMm}
                  heightMm={doc.heightMm}
                  onChange={applyLabelSize}
                />
              ) : null}
              <Pressable
                style={[styles.modalBtn, styles.modalSaveBtn, styles.openCloseBtn]}
                onPress={() => setSizeModalVisible(false)}>
                <Text style={styles.modalSaveText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  body: {
    flex: 1,
    width: '100%',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: Palette.header,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    zIndex: 30,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: Spacing.one,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 0,
    gap: 10,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 44,
    paddingHorizontal: 2,
  },
  headerActionLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  propertyModeShell: {
    flex: 1,
  },
  subToolbar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  dimText: {
    color: Palette.muted,
    ...Type.caption,
    fontSize: 13,
  },
  sizeHint: {
    color: Palette.accent,
    fontSize: 11,
    fontWeight: '500',
  },
  upsPager: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 10,
    elevation: 2,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  upsPagerBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsPagerBtnDisabled: {
    opacity: 0.35,
  },
  upsPagerChevron: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
  },
  upsPagerChevronDisabled: {
    color: '#94A3B8',
  },
  upsPagerText: {
    minWidth: 36,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  stage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LABEL_PAD_STAGE_COLOR,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: LABEL_PAD_STAGE_MIN_HEIGHT,
    overflow: 'hidden',
  },
  stageZoom: {
    width: '100%',
    flex: 1,
  },
  rulerBoard: {
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: LABEL_PAD_STAGE_COLOR,
  },
  rulerTopRow: {
    flexDirection: 'row',
  },
  rulerBodyRow: {
    flexDirection: 'row',
  },
  rulerCorner: {
    width: RULER_SIZE,
    height: RULER_SIZE,
    backgroundColor: '#DDE4EC',
  },
  emptyHintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    color: '#B7C2CE',
    fontSize: 13,
  },
  selectionOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  resizeHandle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  resizeHandleInner: {
    width: 10,
    height: 10,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: Palette.accent,
  },
  lockBadge: {
    position: 'absolute',
    left: -8,
    top: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: Palette.card,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.three,
    minHeight: 0,
    ...cardShadow,
  },
  sheetScroll: {
    flex: 1,
  },
  panelHeader: {
    position: 'relative',
  },
  panelCloseBtn: {
    position: 'absolute',
    right: Spacing.two,
    top: -Spacing.one,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  toolbarItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 0,
  },
  toolbarDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairline,
  },
  toolbarLabel: {
    ...Type.caption,
    fontSize: 11,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: Spacing.three,
  },
  toolItem: {
    width: '20%',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  toolLabel: {
    ...Type.action,
    color: Palette.ink,
  },
  pressed: {
    opacity: 0.6,
  },
  textEditBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  textEditInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  textEditDoneBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#17A6B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textEditDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
  },
  sizeModalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
  },
  openModalCard: {
    maxHeight: 480,
  },
  sizeModalCard: {
    maxWidth: 400,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSaveBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  openList: {
    maxHeight: 300,
    marginBottom: 12,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECEF',
  },
  openRowInfo: {
    flex: 1,
  },
  openRowName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1E293B',
  },
  openRowMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  openEmptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    paddingVertical: 20,
  },
  openCloseBtn: {
    flex: 0,
    marginTop: 4,
  },
});
