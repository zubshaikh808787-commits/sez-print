import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
} from '@/lib/element-sizing';
import { DegreesPropertyPanel } from '@/components/editor/degrees-property-panel';
import { ArcTextPropertyPanel } from '@/components/editor/arctext-property-panel';
import { BarcodePropertyPanel } from '@/components/editor/barcode-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
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
import { buildTemplateElements } from '@/constants/template-documents';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette, Type } from '@/constants/ui';
import {
  createLabelDocument,
  elementSizeMm,
  generateId,
  mmToPt,
  parseOrientation,
  parsePaperType,
  type ElementType,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { textBlockHeightMm } from '@/lib/element-sizing';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

type IconName = SymbolViewProps['name'];

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
  { icon: 'square.on.square', label: 'Label Clone' },
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
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor="#FFFFFF" size={22} />
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
      style={({ pressed }) => [
        styles.toolbarItem,
        withDivider && styles.toolbarDivider,
        pressed && !disabled && styles.pressed,
      ]}>
      <SymbolView name={icon} tintColor={active ? Palette.accent : color} size={22} />
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
      style={({ pressed }) => [styles.toolItem, pressed && styles.pressed]}>
      <SymbolView name={icon} tintColor={Palette.accent} size={26} />
      <Text numberOfLines={1} style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const DOUBLE_TAP_MS = 350;

function isTextEditableElement(type: LabelElement['type']) {
  return type === 'text' || type === 'degrees';
}

type CanvasElementProps = {
  element: LabelElement;
  scale: number;
  selected: boolean;
  selectionColor: string;
  onSelect: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onEditText: (id: string) => void;
  /** Total drag offset in mm since the gesture started. */
  onDrag: (id: string, totalDxMm: number, totalDyMm: number) => void;
  onDragStart: () => void;
  onDragEnd: (id: string) => void;
  /** Total resize offset in mm since the gesture started. */
  onResize: (id: string, totalDwMm: number, totalDhMm: number) => void;
};

function CanvasElement({
  element,
  scale,
  selected,
  selectionColor,
  onSelect,
  onOpenPanel,
  onEditText,
  onDrag,
  onDragStart,
  onDragEnd,
  onResize,
}: CanvasElementProps) {
  const size = elementSizeMm(element);
  const widthPx = Math.max(4, size.width * scale);
  const heightPx = Math.max(4, size.height * scale);
  // Expand touch area for thin elements (e.g. lines) so they can be grabbed.
  const touchSlopX = Math.max(0, (28 - widthPx) / 2);
  const touchSlopY = Math.max(0, (28 - heightPx) / 2);

  const movedRef = useRef(false);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const callbacksRef = useRef({ onSelect, onOpenPanel, onEditText, onDrag, onDragStart, onDragEnd, onResize });
  callbacksRef.current = { onSelect, onOpenPanel, onEditText, onDrag, onDragStart, onDragEnd, onResize };
  const elementRef = useRef(element);
  elementRef.current = element;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastTapRef = useRef({ id: '', time: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
      },
      onPanResponderMove: (_e, gesture) => {
        const current = elementRef.current;
        if (current.lockMovement) return;
        const s = scaleRef.current || 1;
        if (!movedRef.current && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)) {
          movedRef.current = true;
          callbacksRef.current.onDragStart();
          callbacksRef.current.onSelect(current.id);
        }
        if (!movedRef.current) return;
        callbacksRef.current.onDrag(current.id, gesture.dx / s, gesture.dy / s);
      },
      onPanResponderRelease: () => {
        const current = elementRef.current;
        if (movedRef.current) {
          callbacksRef.current.onDragEnd(current.id);
        }
        if (!movedRef.current) {
          const now = Date.now();
          const last = lastTapRef.current;
          const isDoubleTap =
            last.id === current.id && now - last.time < DOUBLE_TAP_MS;
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
    }),
  ).current;

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        callbacksRef.current.onDragStart();
      },
      onPanResponderMove: (_e, gesture) => {
        const s = scaleRef.current || 1;
        callbacksRef.current.onResize(elementRef.current.id, gesture.dx / s, gesture.dy / s);
      },
    }),
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      hitSlop={{ top: touchSlopY, bottom: touchSlopY, left: touchSlopX, right: touchSlopX }}
      style={{
        position: 'absolute',
        left: element.left * scale,
        top: element.top * scale,
        width: widthPx,
        height: heightPx,
        transform: [{ rotate: `${element.rotation}deg` }],
      }}>
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
              <SymbolView name="lock.fill" tintColor="#FFFFFF" size={9} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

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
    cloneFromId?: string;
  }>();

  const defaults = useSettingsStore((s) => s.defaults);
  const editorSettings = useSettingsStore((s) => s.editor);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const savedDocuments = useLabelStore((s) => s.documents);

  const [doc, setDoc] = useState<LabelDocument>(() => {
    if (params.labelId) {
      const existing = useLabelStore.getState().getDocument(params.labelId);
      if (existing) {
        const loaded = JSON.parse(JSON.stringify(existing)) as LabelDocument;
        return { ...loaded, elements: normalizeDocumentElements(loaded) };
      }
    }
    const name = params.labelName ?? 'New Label_1';
    const widthMm = params.labelWidth ? parseFloat(params.labelWidth) : defaults.labelWidth;
    const heightMm = params.labelHeight ? parseFloat(params.labelHeight) : defaults.labelHeight;

    // Label Clone: copy elements from the source document with fresh ids.
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
      elements = buildTemplateElements(params.templateCategory, name, widthMm, heightMm);
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
  const { height: windowHeight } = useWindowDimensions();
  const [stageWidth, setStageWidth] = useState(0);

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

  const stageMaxHeight = Math.max(196, Math.min(windowHeight * 0.4, 348));
  const availStageWidth = Math.max(0, stageWidth > 0 ? stageWidth - 28 : 0);
  const heightFromWidth = availStageWidth * (doc.heightMm / Math.max(doc.widthMm, 1));
  const canvasHeightPx =
    heightFromWidth > stageMaxHeight && availStageWidth > 0
      ? stageMaxHeight
      : heightFromWidth;
  const canvasWidthPx =
    canvasHeightPx > 0 ? canvasHeightPx * (doc.widthMm / Math.max(doc.heightMm, 1)) : 0;
  const scale = canvasWidthPx > 0 ? canvasWidthPx / doc.widthMm : 0;
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
      setDoc((prev) => ({ ...prev, elements: updater(prev.elements) }));
      setDirty(true);
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      setFuture((f) => [
        JSON.parse(JSON.stringify(docRef.current.elements)) as LabelElement[],
        ...f,
      ]);
      setDoc((d) => ({ ...d, elements: snapshot }));
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
      setDoc((d) => ({ ...d, elements: snapshot }));
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
            left: 0.5,
            top: 0.5,
            width: maxW - 1,
            height: maxH - 1,
            lockMovement: false,
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
   * Element geometry captured when a drag/resize gesture starts. Positions are
   * computed as base + total gesture delta, then snapped — snapping incremental
   * deltas instead makes 1mm grid movement stutter and lose distance.
   */
  const gestureBasesRef = useRef(
    new Map<
      string,
      { left: number; top: number; width: number; height: number; fontSize: number }
    >(),
  );

  const handleDragStart = useCallback(() => {
    gestureBasesRef.current = new Map();
    pushHistory();
  }, [pushHistory]);

  const baseFor = useCallback((el: LabelElement) => {
    let base = gestureBasesRef.current.get(el.id);
    if (!base) {
      const size = elementSizeMm(el);
      base = {
        left: el.left,
        top: el.top,
        width: el.width,
        height: size.height,
        fontSize: 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 0,
      };
      gestureBasesRef.current.set(el.id, base);
    }
    return base;
  }, []);

  const handleDrag = useCallback(
    (id: string, totalDxMm: number, totalDyMm: number) => {
      const moveIds = selectedIds.includes(id) ? selectedIds : [id];
      const grid = useSettingsStore.getState().editor.editorGrid;
      const step = grid ? 1 : 0.1;
      const snap = (value: number) => Math.round(value / step) * step;
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (!moveIds.includes(el.id) || el.lockMovement) return el;
          const base = baseFor(el);
          const maxLeft = Math.max(0, prev.widthMm - base.width);
          const maxTop = Math.max(0, prev.heightMm - base.height);
          return {
            ...el,
            left: Math.min(Math.max(snap(base.left + totalDxMm), 0), maxLeft),
            top: Math.min(Math.max(snap(base.top + totalDyMm), 0), maxTop),
          };
        }),
      }));
      setDirty(true);
    },
    [selectedIds, baseFor],
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      if (!useSettingsStore.getState().editor.pictureAdsorption) return;
      const doc = docRef.current;
      const el = doc.elements.find((e) => e.id === id);
      if (!el || (el.type !== 'image' && el.type !== 'clipart')) return;
      const size = elementSizeMm(el);
      const threshold = 1;
      let left = el.left;
      let top = el.top;
      if (left < threshold) left = 0;
      if (top < threshold) top = 0;
      if (doc.widthMm - (left + size.width) < threshold) left = Math.max(0, doc.widthMm - size.width);
      if (doc.heightMm - (top + size.height) < threshold) top = Math.max(0, doc.heightMm - size.height);
      if (left !== el.left || top !== el.top) {
        patchElement(id, { left, top });
      }
    },
    [patchElement],
  );

  const handleResize = useCallback(
    (id: string, totalDwMm: number, totalDhMm: number) => {
      const grid = useSettingsStore.getState().editor.editorGrid;
      const step = grid ? 1 : 0.1;
      const snap = (value: number) => Math.round(value / step) * step;
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (el.id !== id) return el;
          const base = baseFor(el);
          const nextWidth = Math.min(
            prev.widthMm - el.left,
            Math.max(3, snap(base.width + totalDwMm)),
          );

          if (el.type === 'text' || el.type === 'degrees' || el.type === 'time') {
            const source = el.type === 'time' ? ' ' : 'text' in el ? el.text : el.content;
            const lines = Math.max(1, source.split('\n').length);
            const nextHeight = Math.min(
              prev.heightMm - el.top,
              Math.max(2.4, snap(base.height + totalDhMm)),
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
              Math.max(2, snap(base.height + totalDhMm)),
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
      upsertDocument(docRef.current);
      setSavedToStore(true);
      setDirty(false);
      if (showToast) Alert.alert('Saved', `"${docRef.current.name}" has been saved.`);
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
    setDoc({ ...copy, elements: normalizeDocumentElements(copy) });
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
          setSelectedIds([existingBorder.id]);
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
    if (params.labelId && params.labelId !== lastLoadedId.current) {
      lastLoadedId.current = params.labelId;
      const existing = useLabelStore.getState().getDocument(params.labelId);
      if (existing) openDocument(existing);
    }
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
      case 'Label Clone':
        saveDocument(false);
        router.push({
          pathname: '/new-label-setup',
          params: {
            isClone: 'true',
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
      style={styles.stage}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (Math.abs(next - stageWidth) > 1) setStageWidth(next);
      }}>
      <ViewShot ref={canvasShotRef} options={{ format: 'png', quality: 1 }}>
        <Pressable
          onPress={() => setSelectedIds([])}
          style={[
            styles.canvas,
            {
              width: canvasWidthPx || 1,
              height: canvasHeightPx || 1,
            },
          ]}>
          {gridLines}
          {scale > 0
            ? doc.elements.map((element) => (
                <CanvasElement
                  key={element.id}
                  element={element}
                  scale={scale}
                  selected={selectedIds.includes(element.id)}
                  selectionColor={selectionColor}
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
      </ViewShot>
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
            onColumnNamePress={handleColumnNamePress}
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
            onColumnNamePress={handleColumnNamePress}
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
          <SymbolView name="chevron.left" tintColor="#FFFFFF" size={24} />
        </Pressable>

        <Text numberOfLines={1} style={styles.headerTitle}>
          {doc.name}
          {dirty ? ' •' : ''}
        </Text>

        <View style={styles.headerActions}>
          <HeaderAction icon="folder" label="Open" onPress={() => setShowOpenModal(true)} />
          <HeaderAction icon="square.and.arrow.down.on.square" label="Save As" onPress={handleSaveAs} />
          <HeaderAction icon="tray.and.arrow.down.fill" label="Save" onPress={() => saveDocument()} />
          <HeaderAction icon="printer.fill" label="Print" onPress={handlePrint} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.body, { maxWidth: MaxContentWidth }]}>
        <View style={styles.subToolbar}>
          <Text style={styles.dimText}>
            {doc.widthMm.toFixed(0)} × {doc.heightMm.toFixed(0)} mm · {doc.paperType}
            {doc.orientation ? ` · ${doc.orientation}°` : ''}
          </Text>
        </View>

        {renderCanvas()}

        <View style={styles.sheet}>
          {propertyMode ? (
            <View style={styles.panelHeader}>
              {renderToolbar()}
              <Pressable
                onPress={closePanel}
                hitSlop={10}
                style={({ pressed }) => [styles.panelCloseBtn, pressed && styles.pressed]}>
                <SymbolView name="xmark" tintColor={Palette.muted} size={16} />
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
          if (!useLabelStore.getState().cloudProfile) {
            Alert.alert(
              'Not Signed In',
              'Sign in from the Template screen Cloud tab to upload labels.',
            );
            return;
          }
          saveDocument(false);
          useLabelStore.getState().uploadToCloud(docRef.current);
          Alert.alert('Saved', `"${docRef.current.name}" saved to cloud backup on this device.`);
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
                    <SymbolView name="doc.text" tintColor={Palette.accent} size={18} />
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
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 30,
  },
  backBtn: {
    paddingBottom: Spacing.one,
    paddingRight: Spacing.two,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    paddingBottom: Spacing.one + 2,
    maxWidth: 140,
  },
  headerActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: Spacing.three,
  },
  headerAction: {
    alignItems: 'center',
    gap: Spacing.half,
    minWidth: 40,
  },
  headerActionLabel: {
    color: '#FFFFFF',
    ...Type.caption,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  dimText: {
    color: Palette.muted,
    ...Type.caption,
    fontSize: 13,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C5CDD6',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 176,
  },
  canvas: {
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7DEE7',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
  },
  openModalCard: {
    maxHeight: 480,
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
