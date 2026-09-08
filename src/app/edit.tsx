import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
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
import { ImagePropertyPanel, type ImagePropertyTab } from '@/components/editor/image-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
import { ZoomableEditPad } from '@/components/editor/zoomable-edit-pad';
import { KonvaCanvas } from '@/components/editor/konva-canvas';
import type { TransformCommitPayload } from '@/components/editor/konva-transformer';
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
  normalizeRotation,
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
import { clampLabelMm, fitLabelSize } from '@/lib/label-geometry';
import { sortLayers } from '@/lib/template-schema';
import { useTranslation } from '@/lib/i18n';
import { textBlockHeightMm } from '@/lib/element-sizing';
import { isJewelryDieCutDocument, refitJewelryDieCutDocument } from '@/constants/jewelry-diecut';
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
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
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
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
    selectedElementId?: string;
    autoOpenPanel?: string;
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
        const normalized = { ...copy, elements: normalizeDocumentElements(copy) };
        return isJewelryDieCutDocument(normalized)
          ? refitJewelryDieCutDocument(normalized)
          : normalized;
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

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    params.selectedElementId ? [params.selectedElementId] : []
  );
  const [multipleMode, setMultipleMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() =>
    Boolean(params.autoOpenPanel === 'true' && params.selectedElementId)
  );

  const [past, setPast] = useState<LabelElement[][]>([]);
  const [future, setFuture] = useState<LabelElement[][]>([]);

  const toolbarRef = useRef<View>(null);
  const canvasShotRef = useRef<ViewShot>(null);
  const clipartReplaceIdRef = useRef<string | null>(null);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [labelMenuTop, setLabelMenuTop] = useState(0);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showSignatureBoard, setShowSignatureBoard] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [pickerRows, setPickerRows] = useState(2);
  const [pickerColumns, setPickerColumns] = useState(3);
  const { width: windowWidth } = useWindowDimensions();
  const initialStageWidth = useMemo(() => Math.min(Dimensions.get('window').width, MaxContentWidth), []);
  const [stageWidth, setStageWidth] = useState(initialStageWidth);
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
  const [imageTab, setImageTab] = useState<ImagePropertyTab>('Regular');

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textEditDraft, setTextEditDraft] = useState('');
  const [textEditField, setTextEditField] = useState<'text' | 'content'>('text');
  const textEditInputRef = useRef<TextInput>(null);
  const [contentFocusRequest, setContentFocusRequest] = useState(0);

  // Stable stage height based on screen height so pad size never shrinks or jumps when soft keyboard opens
  const screenHeight = useRef(Dimensions.get('screen').height).current;
  const stageMaxHeight = useMemo(
    () => Math.max(240, Math.min(Math.round(screenHeight * 0.35), 360)),
    [screenHeight],
  );
  // Stage width is contain-fit into (stage − rulers) and stays permanent and stable
  const layoutWidth = stageWidth > 0 ? stageWidth : initialStageWidth;
  // True aspect-ratio editing area: uniform scale ensures 1mm width == 1mm height on screen,
  // precisely matching preview and physical output with zero geometry distortion.
  const { canvasWidthPx, canvasHeightPx, scaleX, scaleY, scale } = useMemo(() => {
    const maxW = Math.max(160, layoutWidth - RULER_SIZE - 24);
    const maxH = Math.max(140, stageMaxHeight - RULER_SIZE - 24);
    const fitted = fitLabelSize(doc.widthMm, doc.heightMm, maxW, maxH);
    return {
      canvasWidthPx: Math.max(1, Math.round(fitted.widthPx)),
      canvasHeightPx: Math.max(1, Math.round(fitted.heightPx)),
      scaleX: fitted.scale,
      scaleY: fitted.scale,
      scale: fitted.scale,
    };
  }, [layoutWidth, stageMaxHeight, doc.widthMm, doc.heightMm]);

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

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const bounds = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const sources = docRef.current.elements.filter(
      (el) => selectedIds.includes(el.id) && el.needPrinting !== false && el.type !== 'border',
    );
    if (sources.length === 0) return;
    const clones = sources.map((el) => {
      const clone = JSON.parse(JSON.stringify(el)) as LabelElement;
      clone.id = generateId();
      clone.left = el.left + 2;
      clone.top = el.top + 2;
      return clampElementToLabel(clone, bounds);
    });
    setElements((elements) => [...elements, ...clones], true);
    setSelectedIds(clones.map((clone) => clone.id));
  }, [selectedIds, setElements]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds([]);
    setPanelOpen(false);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const element = docRef.current.elements.find((el) => el.id === id);
      if (!element || element.needPrinting === false || element.type === 'border') return;
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
    if (element.type === 'border') {
      return;
    }
    if (element.type === 'clipart') {
      clipartReplaceIdRef.current = id;
      router.push({ pathname: '/clipart', params: { from: 'edit' } });
      return;
    }
    if (element.type === 'image') {
      setImageTab('Regular');
      setPanelOpen(true);
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

  const handleTransformEnd = useCallback(
    (payload: TransformCommitPayload) => {
      setElements((elements) =>
        elements.map((el) => {
          if (el.id !== payload.id) return el;
          const next: LabelElement = {
            ...el,
            left: payload.leftMm,
            top: payload.topMm,
            width: payload.widthMm,
            rotation: normalizeRotation(payload.rotation),
          };
          if ('height' in next && typeof next.height === 'number') {
            (next as { height: number }).height = payload.heightMm;
          }
          if (payload.fontSize !== undefined && 'fontSize' in next) {
            (next as { fontSize: number }).fontSize = payload.fontSize;
          }
          return next;
        }),
        true,
      );
    },
    [setElements],
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

  const handleRotateElement = useCallback(
    (id: string) => {
      setElements(
        (items) =>
          items.map((el) => {
            if (el.id !== id) return el;
            return { ...el, rotation: normalizeRotation((el.rotation ?? 0) + 90) };
          }),
        true,
      );
    },
    [setElements],
  );

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
    const el = addElement('image', {
      uri: asset.uri,
      width: maxW,
      height: Math.min(maxW * ratio, docRef.current.heightMm - 2),
    });
    if (el) {
      setImageTab('Regular');
      setPanelOpen(true);
    }
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
        const replaceId = clipartReplaceIdRef.current;
        clipartReplaceIdRef.current = null;
        const existing =
          replaceId != null
            ? docRef.current.elements.find((el) => el.id === replaceId && el.type === 'clipart')
            : undefined;
        if (existing) {
          patchElement(existing.id, { clipartId: clipart.id });
        } else {
          addElement('clipart', {
            clipartId: clipart.id,
          });
        }
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
        clipartReplaceIdRef.current = null;
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
        icon="square.on.square"
        label="Duplicate"
        disabled={selectedIds.length === 0}
        onPress={duplicateSelected}
      />
      <ToolbarItem
        icon="trash"
        label="Delete"
        withDivider
        disabled={selectedIds.length === 0}
        onPress={deleteSelected}
      />
      {selectedElement?.type === 'image' ? (
        <ToolbarItem
          icon="photo"
          label="Edit Image"
          active={panelOpen}
          onPress={() => {
            setImageTab('Regular');
            setPanelOpen((o) => !o);
          }}
        />
      ) : null}
    </View>
  );  const renderCanvas = () => (
    <View
      style={[styles.stage, { height: stageMaxHeight }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && Math.abs(next - stageWidth) > 8) {
          setStageWidth(next);
        }
      }}>
      <ZoomableEditPad
        style={styles.stageZoom}
        zoom={padZoom}
        onZoomChange={setPadZoom}
        oneFingerPanEnabled={false}>
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
            <HorizontalRuler widthPx={canvasWidthPx || 1} lengthMm={doc.widthMm} pxPerMm={scaleX} />
          </View>
          <View style={styles.rulerBodyRow}>
            <VerticalRuler heightPx={canvasHeightPx || 1} lengthMm={doc.heightMm} pxPerMm={scaleY} />
            <KonvaCanvas
              ref={canvasShotRef}
              document={doc}
              canvasWidthPx={canvasWidthPx}
              canvasHeightPx={canvasHeightPx}
              scaleX={scaleX}
              scaleY={scaleY}
              padZoom={padZoom}
              selectedIds={selectedIds}
              selectionColor={selectionColor}
              showGrid={Boolean(editorSettings.editorGrid)}
              onSelect={handleSelect}
              onDeselectAll={handleDeselectAll}
              onOpenPanel={openPanelFor}
              onEditText={beginTextEdit}
              onTransformEnd={handleTransformEnd}
              onQuickRotate={handleRotateElement}
            />
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
            onColumnNamePress={handleColumnNamePress}
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
      case 'image':
        return (
          <ImagePropertyPanel
            activeTab={imageTab}
            onTabChange={setImageTab}
            state={selectedElement}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
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
          doc.ups.columns >= 3 ? (
            /* Jewellery 3-up style: individual tab buttons */
            <View style={styles.upsPager}>
              {Array.from({ length: doc.ups.columns }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => goToUpsPanel(i)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.upsTabBtn,
                    doc.ups!.activeIndex === i && styles.upsTabBtnActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.upsTabText,
                      doc.ups!.activeIndex === i && styles.upsTabTextActive,
                    ]}>
                    Label {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            /* Original 2-up chevron pager */
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
          )
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
  upsTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  upsTabBtnActive: {
    backgroundColor: Palette.accent,
  },
  upsTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  upsTabTextActive: {
    color: '#FFFFFF',
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
  rotateHandle: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
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
