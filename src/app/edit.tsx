import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  Vibration,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';

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
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
import {
  DEFAULT_CANVAS_SPLIT_RATIO,
  DIVIDER_HIT_SIZE_PX,
  NUDGE_PAD_SPLIT_EXTRA_PX,
  PANEL_DEFAULT_HEIGHT_PX,
  PANEL_MIN_HEIGHT_PX,
  SPLIT_ANIMATION_MS,
  clampCanvasSplitHeight,
  clampStoredSplitRatio,
  persistableSplitRatio,
  restoreCanvasSplitHeight,
  usableSplitViewportPx,
  type SplitReleaseResult,
} from '@/lib/editor/canvas-split';
import {
  EDITOR_WORKSPACE_PAD_BOTTOM_PX,
  editorViewTransform,
  snapThresholdMm,
  stepViewZoom,
  windowPointToMm,
  type EditorViewTransform,
} from '@/lib/editor/view-transform';
import { applyLiveDragPosition } from '@/lib/editor/drag-layer';
import { collectImageFileUris, placeImportedImageMm } from '@/lib/editor/image-ingest';
import { ingestEditorImage, sweepEditorImageFiles } from '@/lib/editor/image-ingest-native';
import {
  isPaletteDropOnArtboard,
  paletteDropTopLeftMm,
  paletteDropTypeForLabel,
} from '@/lib/editor/palette-drop';
import { chromeStrokeForFill, paletteGhostSizePx } from '@/lib/editor/canvas-chrome';
import { PaletteDragGhost } from '@/components/editor/palette-drag-ghost';
import { PaletteToolItem } from '@/components/editor/palette-tool-item';
import { ToolMenuIcon, TopToolbarIcon } from '@/components/editor/editor-menu-icons';
import { DegreesPropertyPanel } from '@/components/editor/degrees-property-panel';
import { ArcTextPropertyPanel } from '@/components/editor/arctext-property-panel';
import { BarcodePropertyPanel } from '@/components/editor/barcode-property-panel';
import { ImagePropertyPanel, type ImagePropertyTab } from '@/components/editor/image-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
import { ZoomableEditPad } from '@/components/editor/zoomable-edit-pad';
import { EditingPad } from '@/components/editor/editing-pad';
import { KonvaCanvas } from '@/components/editor/konva-canvas';
import type { TransformCommitPayload, TransformMovePayload } from '@/components/editor/konva-transformer';
import { CanvasPanelDivider } from '@/components/editor/canvas-panel-divider';
import { StaticToolPalette } from '@/components/editor/static-tool-palette';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { logPerf } from '@/lib/perf-logger';
import {
  ArtboardFrame,
  CATALOG_STOCK_LINER,
  EDITOR_ARTBOARD_COLOR,
  EDITOR_WORKSPACE_COLOR,
  fitLabelCanvas,
  LABEL_PAD_STAGE_MIN_HEIGHT,
} from '@/components/label-preview';
import {
  HorizontalRuler,
  RULER_SIZE,
  RulerCorner,
  VerticalRuler,
  type LiveRulerBounds,
} from '@/components/canvas-rulers';
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
import { QuickValueModal } from '@/components/editor/quick-value-modal';
import {
  getQuickEditPatch,
  getQuickEditPlaceholder,
  getQuickEditTitle,
  getQuickEditValue,
  isQuickEditableType,
  type ElementAnchorRect,
} from '@/lib/editor/quick-value';
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
import { CANVAS_BOTTOM_CHIP_CLEARANCE_PX, STAGE_PADDING_PX, clampLabelMm, fitEditorPadBoard } from '@/lib/label-geometry';
import { sortLayers } from '@/lib/template-schema';
import { useTranslation } from '@/lib/i18n';
import { computeTextElementHeightMm, textBlockHeightMm } from '@/lib/element-sizing';
import {
  isJewelryDieCutDocument,
  JEWELRY_DIECUT,
} from '@/constants/jewelry-diecut';
import { canonicalizeJewelryDieCutDocument } from '@/constants/jewelry-template-elements';
import { isRatTail143Document, refitRatTail143Document } from '@/constants/rat-tail-143';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  EditorHistory,
  alignBox,
  boxOf,
  clipboardHasContent,
  copyElementsToClipboard,
  duplicateElements,
  guidesEqual,
  isEditorVisible,
  nudgeBox,
  pasteElementsFromClipboard,
  reorderElements,
  sanitizeTransform,
  snapBoxToGuides,
  type SnapGuide,
} from '@/lib/editor/engine';

type IconName = AppIconName;

const TOOL_ROWS: { icon: IconName; label: string }[][] = [
  [
    { icon: 'textformat', label: 'Text' },
    { icon: 'barcode', label: 'Barcode' },
    { icon: 'qrcode', label: 'QRCode' },
    { icon: 'photo', label: 'Image' },
    { icon: 'photo.artframe', label: 'Clipart' },
  ],
  [
    { icon: 'line.diagonal', label: 'Line' },
    { icon: 'square.on.circle', label: 'Shapes' },
    { icon: 'tablecells', label: 'Table' },
    { icon: 'clock', label: 'Time' },
    { icon: 'character', label: 'ArcText' },
  ],
  [
    { icon: 'list.number', label: 'Counter' },
    { icon: 'tablecells.badge.ellipsis', label: 'Excel' },
    { icon: 'viewfinder', label: 'Scan' },
    { icon: 'eye', label: 'OCR' },
    { icon: 'mic', label: 'ASR' },
  ],
  [
    { icon: 'square.on.square', label: 'Label Clone' },
    { icon: 'square.dashed', label: 'Border' },
    { icon: 'signature', label: 'Signature' },
  ],
];

const TOOLS = TOOL_ROWS.flat();

const MAX_HISTORY = 60;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateEditorSplit() {
  LayoutAnimation.configureNext({
    duration: SPLIT_ANIMATION_MS,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

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
  name,
  label,
  active,
  disabled,
  onPress,
}: {
  name: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const color = disabled ? '#CBD5E1' : active ? '#06B6D4' : '#64748B';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      android_ripple={androidRipple}
      style={({ pressed }) => [
        styles.toolbarItem,
        pressed && !disabled && styles.pressed,
      ]}>
      <TopToolbarIcon name={name} size={22} color={color} active={active} />
      <Text numberOfLines={1} style={[styles.toolbarLabel, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToolItem({
  icon: _icon,
  label,
  onPress,
  style,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      android_ripple={androidRipple}
      style={({ pressed }) => [styles.toolItem, style, pressed && styles.pressed]}>
      <ToolMenuIcon name={label} size={32} />
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

function paletteDefaultSizeMm(
  type: ElementType,
  canvas: { widthMm: number; heightMm: number },
  elements: LabelElement[],
): { widthMm: number; heightMm: number } {
  switch (type) {
    case 'barcode': {
      const fit = fitBarcodeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'qrcode': {
      const fit = fitQrcodeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'line': {
      const fit = fitLineDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'shape':
    case 'arctext': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    default: {
      const fit =
        type === 'time'
          ? fitTimeDefaults(canvas.widthMm, canvas.heightMm, elements)
          : fitTextDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: textBlockHeightMm(fit.fontSize, 1) };
    }
  }
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
  const patchEditor = useSettingsStore((s) => s.patchEditor);
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
        if (isJewelryDieCutDocument(normalized)) {
          return canonicalizeJewelryDieCutDocument(normalized);
        }
        if (isRatTail143Document(normalized)) return refitRatTail143Document(normalized);
        return normalized;
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
        const cloned = (JSON.parse(JSON.stringify(source.elements)) as LabelElement[]).map((el) => ({
          ...el,
          id: generateId(),
        }));
        // Clone target size can differ from the source (2ups/duplicate-at-new-size
        // flow). Rescale through the same proportional logic as the in-editor
        // resize control — a verbatim copy only clamped to the new bounds leaves
        // stale mm geometry (position, font size, stroke width) that clips at
        // the new label's edges instead of resizing to fit it.
        elements =
          source.widthMm === widthMm && source.heightMm === heightMm
            ? cloned
            : scaleDocumentToSize(
                { ...source, elements: cloned, ups: undefined },
                widthMm,
                heightMm,
              ).elements;
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

  const historyRef = useRef(new EditorHistory(MAX_HISTORY));
  const [historyRev, setHistoryRev] = useState(0);
  const transformingRef = useRef(false);
  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);
  const patchBurstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpHistory = useCallback(() => setHistoryRev((n) => n + 1), []);

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
  const initialStageWidth = useMemo(
    () => Math.min(windowWidth || Dimensions.get('window').width, MaxContentWidth),
    [windowWidth],
  );
  const [stageWidth, setStageWidth] = useState(initialStageWidth);
  const [padInner, setPadInner] = useState({ width: 0, height: 0 });
  const [splitViewportH, setSplitViewportH] = useState(0);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitDraggingRef = useRef(false);
  splitDraggingRef.current = splitDragging;
  const [canvasFullscreen, setCanvasFullscreen] = useState(() =>
    Boolean(editorSettings.canvasSplitFullscreen),
  );
  const effectiveSplitRatio =
    editorSettings.canvasSplitRatio == null ||
    editorSettings.canvasSplitRatio === 0.55 ||
    editorSettings.canvasSplitRatio === 0.42
      ? null
      : editorSettings.canvasSplitRatio;

  const [canvasSplitH, setCanvasSplitH] = useState(() =>
    restoreCanvasSplitHeight({
      ratio: effectiveSplitRatio,
      fullscreen: Boolean(editorSettings.canvasSplitFullscreen),
      viewportPx: Math.max(Dimensions.get('window').height, 560) * 0.62,
      panelMinPx: PANEL_MIN_HEIGHT_PX,
      panelDefaultPx: PANEL_DEFAULT_HEIGHT_PX,
    }),
  );

  const canvasHeightSv = useSharedValue(canvasSplitH);
  const isDividerDraggingSv = useSharedValue(false);
  const splitViewportHSv = useSharedValue(
    splitViewportH > 0 ? splitViewportH : Math.max(Dimensions.get('window').height, 560) * 0.62,
  );
  const workspaceWSv = useSharedValue(120);
  const docWidthMmSv = useSharedValue(doc.widthMm);
  const docHeightMmSv = useSharedValue(doc.heightMm);
  const basePxPerMMSv = useSharedValue(1);
  const liveScaleSv = useSharedValue(1);
  const panelDefaultForSplit =
    PANEL_DEFAULT_HEIGHT_PX + (editorSettings.showNudgePad ? NUDGE_PAD_SPLIT_EXTRA_PX : 0);
  const panelMinForSplit =
    PANEL_MIN_HEIGHT_PX + (editorSettings.showNudgePad ? NUDGE_PAD_SPLIT_EXTRA_PX : 0);
  const panelMinForSplitSv = useSharedValue(panelMinForSplit);

  const topBarSelectionVisibleSv = useSharedValue(selectedIds.length > 0 ? 1 : 0);
  const bottomPanelVisibleSv = useSharedValue(panelOpen && selectedIds.length > 0 ? 1 : 0);

  useEffect(() => {
    topBarSelectionVisibleSv.value = selectedIds.length > 0 ? 1 : 0;
  }, [selectedIds.length, topBarSelectionVisibleSv]);

  useEffect(() => {
    bottomPanelVisibleSv.value = panelOpen && selectedIds.length > 0 ? 1 : 0;
  }, [panelOpen, selectedIds.length, bottomPanelVisibleSv]);

  const defaultToolbarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topBarSelectionVisibleSv.value > 0.5 ? 0 : 1,
    zIndex: topBarSelectionVisibleSv.value > 0.5 ? 0 : 1,
    pointerEvents: topBarSelectionVisibleSv.value > 0.5 ? 'none' : 'auto',
  }));

  const contextualToolbarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: topBarSelectionVisibleSv.value > 0.5 ? 1 : 0,
    zIndex: topBarSelectionVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: topBarSelectionVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const staticPaletteAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 0 : 1,
    zIndex: bottomPanelVisibleSv.value > 0.5 ? 0 : 1,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'none' : 'auto',
  }));

  const propertyPanelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    zIndex: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const panelCloseBtnAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bottomPanelVisibleSv.value > 0.5 ? 1 : 0,
    pointerEvents: bottomPanelVisibleSv.value > 0.5 ? 'auto' : 'none',
  }));

  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [padZoom, setPadZoom] = useState(1);
  const padPanRef = useRef({ x: 0, y: 0 });
  const editorViewRef = useRef<EditorViewTransform | null>(null);
  const padWindowOriginRef = useRef({ x: 0, y: 0 });
  const overlayOriginRef = useRef({ x: 0, y: 0 });
  const overlayViewRef = useRef<View>(null);
  const paletteGhostRef = useRef<{
    type: ElementType;
    label: string;
    widthMm: number;
    heightMm: number;
  } | null>(null);
  const [paletteGhost, setPaletteGhost] = useState<{
    windowX: number;
    windowY: number;
    widthPx: number;
    heightPx: number;
    icon: AppIconName;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [imageIngesting, setImageIngesting] = useState(false);

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

  const [quickEditTarget, setQuickEditTarget] = useState<{
    id: string;
    type: ElementType;
    value: string;
    anchorRect?: ElementAnchorRect;
  } | null>(null);

  const initialSplitRestoredRef = useRef(false);
  const lastViewportHRef = useRef(0);
  const lastPanelMinRef = useRef(panelMinForSplit);

  useEffect(() => {
    if (splitViewportH <= 0) return;

    if (!initialSplitRestoredRef.current) {
      initialSplitRestoredRef.current = true;
      lastViewportHRef.current = splitViewportH;
      lastPanelMinRef.current = panelMinForSplit;
      setCanvasSplitH(
        restoreCanvasSplitHeight({
          ratio: effectiveSplitRatio,
          fullscreen: canvasFullscreen,
          viewportPx: splitViewportH,
          panelMinPx: panelMinForSplit,
          panelDefaultPx: panelDefaultForSplit,
        }),
      );
      return;
    }

    const prevVp = lastViewportHRef.current;
    const vpChanged = Math.abs(splitViewportH - prevVp) > 2;
    const panelMinChanged = panelMinForSplit !== lastPanelMinRef.current;

    if (vpChanged || panelMinChanged) {
      lastViewportHRef.current = splitViewportH;
      lastPanelMinRef.current = panelMinForSplit;
      setCanvasSplitH((prevH) => {
        if (canvasFullscreen) {
          return clampCanvasSplitHeight({
            viewportPx: splitViewportH,
            requestedCanvasPx: splitViewportH,
            panelMinPx: panelMinForSplit,
          });
        }
        if (vpChanged && prevVp > 0) {
          const prevUsable = usableSplitViewportPx(prevVp);
          const ratio = prevUsable > 0 ? prevH / prevUsable : DEFAULT_CANVAS_SPLIT_RATIO;
          const newUsable = usableSplitViewportPx(splitViewportH);
          return clampCanvasSplitHeight({
            viewportPx: splitViewportH,
            requestedCanvasPx: Math.round(newUsable * ratio),
            panelMinPx: panelMinForSplit,
          });
        }
        return clampCanvasSplitHeight({
          viewportPx: splitViewportH,
          requestedCanvasPx: prevH,
          panelMinPx: panelMinForSplit,
        });
      });
    }
  }, [splitViewportH, panelMinForSplit, canvasFullscreen, effectiveSplitRatio]);

  const layoutWidth = stageWidth > 0 ? stageWidth : initialStageWidth;
  // Phone workspace is constant. Label millimetres only change the inner artboard.
  const workspaceW = padInner.width > 1 ? padInner.width : Math.max(120, layoutWidth);
  // Canonical base workspace: uses maximum viewport height so canvas elements are rendered
  // at high resolution once. Sheet divider movement purely applies GPU transform (scale: s)
  // without re-running fitEditorPadBoard or causing React reconciliation flicker.
  const baseWorkspaceH =
    splitViewportH > 0 ? splitViewportH : Math.max(Dimensions.get('window').height, 560) * 0.62;
  const { canvasWidthPx, canvasHeightPx, pxPerMM, boardOffsetXPx, boardOffsetYPx, innerWidthPx, innerHeightPx } =
    useMemo(() => {
      const fitted = fitEditorPadBoard(doc.widthMm, doc.heightMm, workspaceW, baseWorkspaceH, RULER_SIZE);
      return {
        canvasWidthPx: Math.max(1, fitted.widthPx),
        canvasHeightPx: Math.max(1, fitted.heightPx),
        pxPerMM: fitted.scale,
        boardOffsetXPx: fitted.offsetXPx,
        boardOffsetYPx: fitted.offsetYPx,
        innerWidthPx: Math.max(1, fitted.innerWidthPx),
        innerHeightPx: Math.max(1, fitted.innerHeightPx),
      };
    }, [workspaceW, baseWorkspaceH, doc.widthMm, doc.heightMm]);

  const committedScale = useMemo(() => {
    if (pxPerMM <= 0) return 1;
    const liveInnerH = Math.max(32, canvasSplitH - RULER_SIZE - STAGE_PADDING_PX * 2);
    const liveInnerW = Math.max(32, workspaceW - RULER_SIZE - STAGE_PADDING_PX * 2);
    const livePxPerMM = Math.min(
      liveInnerW / (doc.widthMm > 0 ? doc.widthMm : 1),
      liveInnerH / (doc.heightMm > 0 ? doc.heightMm : 1),
    );
    return livePxPerMM / pxPerMM;
  }, [canvasSplitH, workspaceW, doc.widthMm, doc.heightMm, pxPerMM]);

  const writeEditorView = useCallback(
    (zoom: number, panX: number, panY: number) => {
      const effectiveZoom = zoom * committedScale;
      editorViewRef.current = editorViewTransform({
        pxPerMM,
        viewZoom: effectiveZoom,
        panX,
        panY,
        viewWidthPx: workspaceW,
        viewHeightPx: canvasSplitH,
        innerWidthPx,
        innerHeightPx,
        rulerSizePx: RULER_SIZE,
        boardOffsetXPx,
        boardOffsetYPx,
        workspacePaddingBottomPx: EDITOR_WORKSPACE_PAD_BOTTOM_PX,
      });
    },
    [pxPerMM, committedScale, workspaceW, canvasSplitH, innerWidthPx, innerHeightPx, boardOffsetXPx, boardOffsetYPx],
  );

  useEffect(() => {
    if (!splitDragging) {
      canvasHeightSv.value = canvasSplitH;
    }
  }, [canvasSplitH, splitDragging, canvasHeightSv]);

  useEffect(() => {
    splitViewportHSv.value = splitViewportH;
  }, [splitViewportH, splitViewportHSv]);

  useEffect(() => {
    workspaceWSv.value = workspaceW;
  }, [workspaceW, workspaceWSv]);

  useEffect(() => {
    docWidthMmSv.value = doc.widthMm;
    docHeightMmSv.value = doc.heightMm;
    basePxPerMMSv.value = pxPerMM;
  }, [doc.widthMm, doc.heightMm, pxPerMM, docWidthMmSv, docHeightMmSv, basePxPerMMSv]);

  useEffect(() => {
    panelMinForSplitSv.value = panelMinForSplit;
  }, [panelMinForSplit, panelMinForSplitSv]);

  const stageAnimatedStyle = useAnimatedStyle(() => ({
    height: canvasHeightSv.value,
  }));

  const toolGridAnimatedStyle = useAnimatedStyle(() => {
    const vpH = splitViewportHSv.value > 0 ? splitViewportHSv.value : 600;
    const belowDividerH = Math.max(0, vpH - canvasHeightSv.value - DIVIDER_HIT_SIZE_PX);
    const nudgeH = panelMinForSplitSv.value - PANEL_MIN_HEIGHT_PX;
    const gridH = Math.max(0, belowDividerH - nudgeH - PANEL_MIN_HEIGHT_PX);
    return {
      height: gridH,
    };
  });

  const canvasAssemblyAnimatedStyle = useAnimatedStyle(() => {
    const liveH = canvasHeightSv.value;
    const liveInnerH = Math.max(32, liveH - RULER_SIZE - STAGE_PADDING_PX * 2);
    const liveInnerW = Math.max(32, workspaceWSv.value - RULER_SIZE - STAGE_PADDING_PX * 2);
    const wMm = docWidthMmSv.value > 0 ? docWidthMmSv.value : 1;
    const hMm = docHeightMmSv.value > 0 ? docHeightMmSv.value : 1;
    const livePxPerMM = Math.min(liveInnerW / wMm, liveInnerH / hMm);
    const base = basePxPerMMSv.value > 0 ? basePxPerMMSv.value : 1;
    const s = livePxPerMM / base;
    liveScaleSv.value = s;
    return {
      transform: [{ scale: s }],
    };
  });

  useEffect(() => {
    writeEditorView(padZoom, padPanRef.current.x, padPanRef.current.y);
  }, [writeEditorView, padZoom]);

  const handleViewTransformChange = useCallback(
    (view: { zoom: number; panX: number; panY: number }) => {
      padPanRef.current = { x: view.panX, y: view.panY };
      writeEditorView(view.zoom, view.panX, view.panY);
    },
    [writeEditorView],
  );

  const handlePadWindowOrigin = useCallback((origin: { x: number; y: number }) => {
    padWindowOriginRef.current = origin;
  }, []);

  const windowPointToArtboardMm = useCallback((windowX: number, windowY: number) => {
    const view = editorViewRef.current;
    if (!view || !(view.pxPerMM > 0)) return null;
    return windowPointToMm({ x: windowX, y: windowY }, padWindowOriginRef.current, view);
  }, []);

  const publishSnapGuides = useCallback((next: SnapGuide[]) => {
    setSnapGuides((prev) => (guidesEqual(prev, next) ? prev : next));
  }, []);


  const persistSplit = useCallback(
    (canvasPx: number, fullscreen: boolean) => {
      patchEditor({
        canvasSplitFullscreen: fullscreen,
        canvasSplitRatio: persistableSplitRatio({
          canvasPx,
          viewportPx: splitViewportH,
          fullscreen,
          lastRatio: effectiveSplitRatio ?? undefined,
        }),
      });
    },
    [patchEditor, splitViewportH, effectiveSplitRatio],
  );

  const toggleCanvasFullscreen = useCallback(() => {
    animateEditorSplit();
    const next = !canvasFullscreen;
    const viewport = splitViewportH > 0 ? splitViewportH : canvasSplitH + panelMinForSplit;
    const height = restoreCanvasSplitHeight({
      ratio: effectiveSplitRatio,
      fullscreen: next,
      viewportPx: viewport,
      panelMinPx: panelMinForSplit,
      panelDefaultPx: panelDefaultForSplit,
    });
    setCanvasFullscreen(next);
    setCanvasSplitH(height);
    persistSplit(height, next);
  }, [
    canvasFullscreen,
    canvasSplitH,
    effectiveSplitRatio,
    panelMinForSplit,
    persistSplit,
    splitViewportH,
  ]);

  const handleSplitDragStart = useCallback(() => {
    splitDraggingRef.current = true;
    setSplitDragging(true);
    if (!canvasFullscreen) return;
    setCanvasFullscreen(false);
  }, [canvasFullscreen]);

  const handleSplitDragEnd = useCallback(
    (result: SplitReleaseResult) => {
      splitDraggingRef.current = false;
      setSplitDragging(false);
      if (result.snapped) {
        try {
          Vibration.vibrate(8);
        } catch {
          // web / unsupported
        }
        animateEditorSplit();
      }
      setCanvasFullscreen(result.fullscreen);
      setCanvasSplitH(result.canvasPx);
      persistSplit(result.canvasPx, result.fullscreen);
    },
    [persistSplit],
  );

  const dieCutPad =
    hasStockSilhouette(doc.templatePreviewType) || isRatTailGeometry(doc.mediaGeometry);
  const stageBg = EDITOR_WORKSPACE_COLOR;
  const artboardFill = dieCutPad ? CATALOG_STOCK_LINER : EDITOR_ARTBOARD_COLOR;

  // Always reopen at Fit. View zoom is optional; it must not change physical mm.
  useEffect(() => {
    setPadZoom(1);
  }, [doc.widthMm, doc.heightMm, doc.templatePreviewType]);
  const selectionColor = chromeStrokeForFill(artboardFill);

  const selectedElement =
    selectedIds.length === 1
      ? doc.elements.find((el) => el.id === selectedIds[0]) ?? null
      : null;

  const lastSelectedElementRef = useRef<LabelElement | null>(null);
  if (selectedElement) {
    lastSelectedElementRef.current = selectedElement;
  }
  const displayElement =
    selectedElement ??
    lastSelectedElementRef.current ??
    (doc.elements.length > 0 ? doc.elements[0] : null);

  const docRef = useRef(doc);
  docRef.current = doc;
  dirtyRef.current = dirty;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (patchBurstTimer.current) clearTimeout(patchBurstTimer.current);
    };
  }, []);

  const scheduleHistoryCommit = useCallback(() => {
    if (patchBurstTimer.current) clearTimeout(patchBurstTimer.current);
    patchBurstTimer.current = setTimeout(() => {
      historyRef.current.commit();
      bumpHistory();
    }, 400);
  }, [bumpHistory]);

  const pushHistory = useCallback(() => {
    historyRef.current.pushUndo(docRef.current.elements);
    bumpHistory();
  }, [bumpHistory]);

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
    historyRef.current.clear();
    bumpHistory();
    setTextEditId(null);
    setDirty(true);
  }, [bumpHistory]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.undo(docRef.current.elements);
    if (!snapshot) return;
    setDoc((d) => {
      let next: LabelDocument = { ...d, elements: snapshot };
      if (next.ups) next = syncUpsActivePanel(next);
      return next;
    });
    setDirty(true);
    bumpHistory();
    setSelectedIds((ids) => ids.filter((id) => snapshot.some((el) => el.id === id)));
  }, [bumpHistory]);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.redo(docRef.current.elements);
    if (!snapshot) return;
    setDoc((d) => {
      let next: LabelDocument = { ...d, elements: snapshot };
      if (next.ups) next = syncUpsActivePanel(next);
      return next;
    });
    setDirty(true);
    bumpHistory();
    setSelectedIds((ids) => ids.filter((id) => snapshot.some((el) => el.id === id)));
  }, [bumpHistory]);

  const patchElement = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => (el.id === id ? ({ ...el, ...updates } as LabelElement) : el)),
      );
      scheduleHistoryCommit();
    },
    [setElements, scheduleHistoryCommit],
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
            content: '1234567890',
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
            lineWidth: 0.55,
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
      const maxZ = docRef.current.elements.reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0);
      element.zIndex = maxZ + 1;
      setElements((items) => [...items, element], true);
      setSelectedIds([element.id]);
      return element;
    },
    [defaults, pickerRows, pickerColumns, setElements],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    setElements((elements) => elements.filter((el) => !selectedIds.includes(el.id)), true);
    setSelectedIds([]);
    setPanelOpen(false);
  }, [selectedIds, setElements, topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const bounds = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const result = duplicateElements(docRef.current.elements, selectedIds, bounds);
    if (result.newIds.length === 0) return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setElements(() => result.elements, true);
    setSelectedIds(result.newIds);
  }, [selectedIds, setElements, topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const handleDeselectAll = useCallback(() => {
    logPerf('[JS_THREAD] handleDeselectAll');
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    setSelectedIds([]);
    setPanelOpen(false);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const resetTabToRegularForElement = useCallback((type: ElementType) => {
    switch (type) {
      case 'barcode':
        setBarcodeTab('Regular');
        break;
      case 'image':
        setImageTab('Regular');
        break;
      case 'text':
        setTextTab('Regular');
        break;
      case 'qrcode':
        setQrcodeTab('Regular');
        break;
      case 'line':
        setLineTab('Regular');
        break;
      case 'shape':
        setShapeTab('Regular');
        break;
      case 'table':
        setTableTab('Regular');
        break;
      case 'time':
        setTimeTab('Regular');
        break;
      case 'arctext':
        setArcTextTab('Regular');
        break;
      case 'degrees':
        setDegreesTab('Regular');
        break;
      default:
        break;
    }
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const element = docRef.current.elements.find((el) => el.id === id);
      if (!element || element.needPrinting === false || element.type === 'border') return;
      logPerf(`[JS_THREAD] handleSelect el=${id}`);
      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      setSelectedIds((prev) => {
        if (multipleMode) {
           return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        }
        if (prev.length === 1 && prev[0] === id) return prev;
        return [id];
      });
      if (!multipleMode) {
        if (element.type === 'signature') {
          setShowSignatureBoard(true);
        } else {
          resetTabToRegularForElement(element.type);
          setPanelOpen(true);
        }
      }
    },
    [multipleMode, topBarSelectionVisibleSv, bottomPanelVisibleSv, resetTabToRegularForElement],
  );

  const openPanelFor = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
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
    resetTabToRegularForElement(element.type);
    setPanelOpen(true);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv, resetTabToRegularForElement]);

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

  const handleQuickEdit = useCallback((id: string, anchorRect?: ElementAnchorRect) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element || !isQuickEditableType(element.type)) return;
    setSelectedIds([id]);
    setQuickEditTarget({
      id,
      type: element.type,
      value: getQuickEditValue(element),
      anchorRect,
    });
  }, []);

  const handleQuickEditConfirm = useCallback(
    (newValue: string) => {
      if (!quickEditTarget) return;
      const element = docRef.current.elements.find((el) => el.id === quickEditTarget.id);
      if (element) {
        const patch = getQuickEditPatch(element, newValue);
        patchElement(element.id, patch);
      }
      setQuickEditTarget(null);
    },
    [quickEditTarget, patchElement],
  );

  const handleQuickEditCancel = useCallback(() => {
    setQuickEditTarget(null);
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

  const rulerLeftMm = useSharedValue(0);
  const rulerTopMm = useSharedValue(0);
  const rulerWidthMm = useSharedValue(0);
  const rulerHeightMm = useSharedValue(0);
  const rulerVisible = useSharedValue(false);

  const liveRulerBounds = useMemo<LiveRulerBounds>(
    () => ({
      leftMm: rulerLeftMm,
      topMm: rulerTopMm,
      widthMm: rulerWidthMm,
      heightMm: rulerHeightMm,
      visible: rulerVisible,
    }),
    [rulerLeftMm, rulerTopMm, rulerWidthMm, rulerHeightMm, rulerVisible],
  );

  useEffect(() => {
    if (selectedElement) {
      rulerLeftMm.value = selectedElement.left;
      rulerTopMm.value = selectedElement.top;
      rulerWidthMm.value = selectedElement.width;
      rulerHeightMm.value = selectedElementHeightMm;
      rulerVisible.value = true;
    } else {
      rulerVisible.value = false;
    }
  }, [
    selectedElement,
    selectedElementHeightMm,
    rulerLeftMm,
    rulerTopMm,
    rulerWidthMm,
    rulerHeightMm,
    rulerVisible,
  ]);

  const handleTransformStart = useCallback((_id: string) => {
    transformingRef.current = true;
    historyRef.current.begin(docRef.current.elements);
    publishSnapGuides([]);
  }, [publishSnapGuides]);

  const snapMoveMm = useCallback(
    (input: { id: string; leftMm: number; topMm: number; widthMm: number; heightMm: number }) => {
      return { leftMm: input.leftMm, topMm: input.topMm };
    },
    [],
  );

  const handleTransformMove = useCallback(
    (_payload: TransformMovePayload) => {
      // Free-motion 1:1 gesture without intermediate React re-renders
    },
    [],
  );

  const handleTransformEnd = useCallback(
    (payload: TransformCommitPayload) => {
      publishSnapGuides([]);
      const clean = sanitizeTransform(payload);
      const recordHistory = !transformingRef.current;
      if (transformingRef.current) {
        historyRef.current.commit();
        transformingRef.current = false;
        bumpHistory();
      }
      setElements(
        (elements) =>
          elements.map((el) => {
            if (el.id !== payload.id) return el;
            const prevSize = elementSizeMm(el);
            const resized =
              Math.abs(prevSize.width - clean.widthMm) > 0.04 ||
              Math.abs(prevSize.height - clean.heightMm) > 0.04;
            let targetHeight = clean.heightMm;
            const fs = clean.fontSize ?? ('fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : undefined);

            if (el.type === 'text' || el.type === 'degrees') {
              const rawText =
                el.contentType === 'Data Source' && el.columnNameContent
                  ? `{${el.columnNameContent}}`
                  : 'text' in el
                    ? el.text
                    : el.content;
              const effectiveFs = fs ?? 12;
              targetHeight = computeTextElementHeightMm({
                text: rawText,
                fontSize: effectiveFs,
                widthMm: clean.widthMm,
                autoWrapping: el.autoWrapping ?? 'Word',
                lineSpacing: el.lineSpacing ?? '1.0',
                charSpacing: el.charSpacing ?? 0,
                bold: el.bold ?? false,
                verticalDisplay: el.verticalDisplay ?? false,
              });
            } else if (el.type === 'time') {
              const effectiveFs = fs ?? 12;
              targetHeight = textBlockHeightMm(effectiveFs, 1);
            }

            const clamped = clampToLabelBounds(
              { left: clean.leftMm, top: clean.topMm, width: clean.widthMm, height: targetHeight },
              { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm },
              { anchor: 'body', naturalHeight: targetHeight },
            );

            const next: LabelElement = {
              ...el,
              left: clamped.left,
              top: clamped.top,
              width: clamped.width,
              rotation: clean.rotation,
            };
            if (fs !== undefined && 'fontSize' in next) {
              (next as { fontSize: number }).fontSize = fs;
            }
            if (
              el.type === 'text' ||
              el.type === 'degrees' ||
              el.type === 'time' ||
              resized ||
              typeof (el as { height?: number }).height === 'number'
            ) {
              (next as { height: number }).height = clamped.height;
            }
            return next;
          }),
        recordHistory,
      );
    },
    [setElements, bumpHistory, publishSnapGuides],
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

  const canvasMm = useMemo(
    () => ({ widthMm: doc.widthMm, heightMm: doc.heightMm }),
    [doc.widthMm, doc.heightMm],
  );

  const nudgeSelected = useCallback(
    (dxMm: number, dyMm: number) => {
      if (selectedIds.length === 0) return;
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') return el;
          const box = boxOf(el);
          const next = nudgeBox(box.left, box.top, box.width, box.height, dxMm, dyMm, canvasMm);
          return { ...el, left: next.left, top: next.top };
        }),
      );
      scheduleHistoryCommit();
    },
    [selectedIds, setElements, canvasMm, scheduleHistoryCommit],
  );

  const rotateSelectedBy = useCallback(
    (deltaDeg: number) => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) =>
            selectedIds.includes(el.id) && !el.lockMovement
              ? { ...el, rotation: normalizeRotation((el.rotation ?? 0) + deltaDeg) }
              : el,
          ),
        true,
      );
    },
    [selectedIds, setElements],
  );

  const alignSelected = useCallback(
    (kind: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
      if (selectedIds.length === 0) return;
      setElements(
        (elements) =>
          elements.map((el) => {
            if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') return el;
            const box = boxOf(el);
            const patch = alignBox(box.width, box.height, canvasMm, kind);
            return { ...el, ...patch };
          }),
        true,
      );
    },
    [selectedIds, setElements, canvasMm],
  );

  const copySelected = useCallback(() => {
    copyElementsToClipboard(docRef.current.elements, selectedIds);
    bumpHistory();
  }, [selectedIds, bumpHistory]);

  const pasteClipboard = useCallback(() => {
    const result = pasteElementsFromClipboard(docRef.current.elements, canvasMm);
    if (result.newIds.length === 0) return;
    setElements(() => result.elements, true);
    setSelectedIds(result.newIds);
  }, [canvasMm, setElements]);

  const reorderSelected = useCallback(
    (kind: 'front' | 'back') => {
      if (selectedIds.length === 0) return;
      setElements((elements) => reorderElements(elements, selectedIds, kind), true);
    },
    [selectedIds, setElements],
  );

  const toggleHideSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const anyHidden = docRef.current.elements.some(
      (el) => selectedIds.includes(el.id) && !isEditorVisible(el),
    );
    setElements(
      (elements) =>
        elements.map((el) =>
          selectedIds.includes(el.id) ? { ...el, visible: anyHidden ? true : false } : el,
        ),
      true,
    );
  }, [selectedIds, setElements]);

  const zoomInPad = useCallback(() => {
    setPadZoom((z) => stepViewZoom(z, 1));
  }, []);
  const zoomOutPad = useCallback(() => {
    setPadZoom((z) => stepViewZoom(z, -1));
  }, []);

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

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current || !dirtyRef.current) return;
      const synced = syncUpsActivePanel(docRef.current);
      upsertDocument(synced);
      setSavedToStore(true);
      setDirty(false);
    }, 1600);
    return () => clearTimeout(timer);
  }, [dirty, doc.elements, doc.widthMm, doc.heightMm, doc.name, upsertDocument]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      if (!dirtyRef.current) return;
      upsertDocument(syncUpsActivePanel(docRef.current));
    });
    return () => sub.remove();
  }, [upsertDocument]);

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
    historyRef.current.clear();
    bumpHistory();
    setShowOpenModal(false);
  }, [bumpHistory]);

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

  const handlePadLayout = useCallback((size: { width: number; height: number }) => {
    if (splitDraggingRef.current) return;
    setPadInner((prev) => {
      const width = Math.round(size.width);
      if (Math.abs(prev.width - width) < 1) return prev;
      return { width, height: 0 };
    });
  }, []);

  const handlePrint = useCallback(() => {
    saveDocument(false);
    router.push({ pathname: '/print', params: { labelId: docRef.current.id } });
  }, [saveDocument]);

  const applyLabelSize = useCallback((widthMm: number, heightMm: number) => {
    if (isRatTail143Document(docRef.current)) return;
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
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!mountedRef.current) return;
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset.uri) return;

    setImageIngesting(true);
    try {
      const ingested = await ingestEditorImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
      if (!mountedRef.current) return;
      const current = docRef.current;
      const content = isRatTailGeometry(current.mediaGeometry)
        ? ratTailBodyRectMm(current.mediaGeometry)
        : isJewelryDieCutDocument(current)
          ? { left: 0, top: 0, width: current.widthMm, height: Math.min(current.heightMm, JEWELRY_DIECUT.bodyHeightMm) }
          : undefined;
      const placed = placeImportedImageMm({
        widthPx: ingested.widthPx,
        heightPx: ingested.heightPx,
        pxPerMM,
        canvas: { widthMm: current.widthMm, heightMm: current.heightMm },
        content,
      });
      const el = addElement('image', {
        uri: ingested.previewUri,
        printUri: ingested.printUri,
        left: placed.left,
        top: placed.top,
        width: placed.width,
        height: placed.height,
        contentFit: 'contain',
        aspectRatioLocked: true,
        originalAspect: ingested.originalAspect,
        workingWidthPx: ingested.workingWidthPx,
        workingHeightPx: ingested.workingHeightPx,
      });
      if (el) {
        setImageTab('Regular');
        setPanelOpen(true);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert(
        'Could not place photo',
        error instanceof Error ? error.message : 'The image could not be decoded.',
      );
    } finally {
      if (mountedRef.current) setImageIngesting(false);
    }
  }, [addElement, pxPerMM]);

  useEffect(() => {
    const keep = collectImageFileUris([
      doc.elements,
      ...historyRef.current.retainedSnapshots(),
      ...savedDocuments.map((item) => item.elements),
    ]);
    void sweepEditorImageFiles(keep);
  }, [doc.elements, historyRev, savedDocuments]);

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

  const openAddedElementPanel = useCallback((label: string) => {
    switch (label) {
      case 'Text':
        setTextTab('Regular');
        setPanelOpen(true);
        break;
      case 'Barcode':
        setBarcodeTab('Regular');
        setPanelOpen(true);
        break;
      case 'QRCode':
        setQrcodeTab('Regular');
        setPanelOpen(true);
        break;
      case 'Line':
        setLineTab('Regular');
        setPanelOpen(true);
        break;
      case 'Shapes':
        setShapeTab('Regular');
        setPanelOpen(true);
        break;
      case 'Time':
        setTimeTab('Regular');
        setPanelOpen(true);
        break;
      case 'ArcText':
        setArcTextTab('Regular');
        setPanelOpen(true);
        break;
      case 'Degrees':
        setDegreesTab('Regular');
        setPanelOpen(true);
        break;
      default:
        break;
    }
  }, []);

  const beginPaletteDrag = useCallback((
    type: ElementType,
    label: string,
    icon: AppIconName,
    windowX: number,
    windowY: number,
  ) => {
    const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const size = paletteDefaultSizeMm(type, canvas, docRef.current.elements);
    const ghostPx = paletteGhostSizePx(size.widthMm, size.heightMm);
    paletteGhostRef.current = { type, label, widthMm: size.widthMm, heightMm: size.heightMm };
    setPaletteGhost({
      windowX,
      windowY,
      widthPx: ghostPx.widthPx,
      heightPx: ghostPx.heightPx,
      icon,
    });
  }, []);

  const movePaletteDrag = useCallback(
    (windowX: number, windowY: number) => {
      setPaletteGhost((prev) => (prev ? { ...prev, windowX, windowY } : prev));
      const ghost = paletteGhostRef.current;
      if (!ghost) return;
      const mm = windowPointToArtboardMm(windowX, windowY);
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
      if (!mm || !isPaletteDropOnArtboard(mm, canvas)) {
        publishSnapGuides([]);
        return;
      }
      publishSnapGuides([]);
    },
    [publishSnapGuides, windowPointToArtboardMm],
  );

  const endPaletteDrag = useCallback(
    (windowX: number, windowY: number) => {
      const ghost = paletteGhostRef.current;
      paletteGhostRef.current = null;
      setPaletteGhost(null);
      publishSnapGuides([]);
      if (!ghost) return;
      const mm = windowPointToArtboardMm(windowX, windowY);
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
      if (!mm || !isPaletteDropOnArtboard(mm, canvas)) return;
      const placed = paletteDropTopLeftMm({
        pointerMm: mm,
        widthMm: ghost.widthMm,
        heightMm: ghost.heightMm,
        canvas,
        thresholdMm: 0,
      });
      const overrides: Record<string, unknown> = {
        left: placed.left,
        top: placed.top,
        width: ghost.widthMm,
      };
      if (ghost.type !== 'text' && ghost.type !== 'degrees' && ghost.type !== 'time') {
        overrides.height = ghost.heightMm;
      }
      addElement(ghost.type, overrides);
      openAddedElementPanel(ghost.label);
    },
    [addElement, openAddedElementPanel, publishSnapGuides, windowPointToArtboardMm],
  );

  const handleToolPress = (label: string) => {
    setShowLabelMenu(false);
    switch (label) {
      case 'Text':
        addElement('text');
        openAddedElementPanel(label);
        break;
      case 'Barcode':
        addElement('barcode');
        openAddedElementPanel(label);
        break;
      case 'QRCode':
        addElement('qrcode');
        openAddedElementPanel(label);
        break;
      case 'Line':
        addElement('line');
        openAddedElementPanel(label);
        break;
      case 'Shapes':
        addElement('shape');
        openAddedElementPanel(label);
        break;
      case 'Table':
        setPickerRows(2);
        setPickerColumns(3);
        setShowTablePicker(true);
        break;
      case 'Time':
        addElement('time');
        openAddedElementPanel(label);
        break;
      case 'ArcText':
        addElement('arctext');
        openAddedElementPanel(label);
        break;
      case 'Counter':
      case 'Degrees':
        addElement('degrees');
        openAddedElementPanel('Degrees');
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
      case 'Label Clone':
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
    bottomPanelVisibleSv.value = 0;
    setPanelOpen(false);
  };

  const canUndo = historyRev >= 0 && historyRef.current.canUndo;
  const canRedo = historyRev >= 0 && historyRef.current.canRedo;

  const renderToolbar = () => (
    <View ref={toolbarRef} collapsable={false} style={styles.toolbarRow}>
      <ToolbarItem
        name="Label"
        label="Label"
        active={showLabelMenu}
        onPress={openLabelMenu}
      />
      <ToolbarItem
        name="Multiple"
        label="Multiple"
        active={multipleMode}
        onPress={() => {
          setMultipleMode((m) => !m);
          setSelectedIds([]);
        }}
      />
      <ToolbarItem
        name="Undo"
        label="Undo"
        disabled={!canUndo}
        onPress={undo}
      />
      <ToolbarItem
        name="Redo"
        label="Redo"
        disabled={!canRedo}
        onPress={redo}
      />
      <ToolbarItem
        name="Lock"
        label="Lock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(true)}
      />
      <ToolbarItem
        name="UnLock"
        label="UnLock"
        disabled={selectedIds.length === 0}
        onPress={() => setLockOnSelection(false)}
      />
    </View>
  );

  const renderContextualToolbar = () => (
    <View style={styles.contextualTopBar}>
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={deleteSelected}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Delete selected element">
        <AppIcon name="trash" tintColor="#FFFFFF" size={18} />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => rotateSelectedBy(90)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Rotate selected element 90 degrees">
        <AppIcon name="arrow.clockwise" tintColor="#FFFFFF" size={18} />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={duplicateSelected}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Duplicate selected element">
        <AppIcon name="square.on.square" tintColor="#FFFFFF" size={18} />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => setLockOnSelection(!(selectedElement?.lockMovement ?? false))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={selectedElement?.lockMovement ? 'Unlock element' : 'Lock element'}>
        <AppIcon
          name={selectedElement?.lockMovement ? 'lock.open' : 'lock'}
          tintColor="#FFFFFF"
          size={18}
        />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => {
          if (selectedElement) openPanelFor(selectedElement.id);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Element properties">
        <AppIcon name="slider.horizontal.3" tintColor="#FFFFFF" size={18} />
      </Pressable>
    </View>
  );

  const renderCanvas = () => (
    <Animated.View
      pointerEvents={splitDragging ? 'none' : 'auto'}
      style={[styles.stage, stageAnimatedStyle, { minHeight: 0, backgroundColor: stageBg }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && Math.abs(next - stageWidth) > 1) {
          setStageWidth(next);
        }
      }}>
      <ZoomableEditPad
        style={styles.stageZoom}
        zoom={padZoom}
        onZoomChange={setPadZoom}
        onViewTransformChange={handleViewTransformChange}
        onViewportLayout={handlePadLayout}
        onWindowOriginChange={handlePadWindowOrigin}
        oneFingerPanEnabled={selectedIds.length === 0}
        doubleTapEnabled={false}>
        <View style={[styles.workspace, { backgroundColor: stageBg }]} pointerEvents="box-none">
          <View
            style={[
              styles.rulerFrame,
              {
                width: RULER_SIZE + innerWidthPx,
                height: RULER_SIZE + innerHeightPx,
              },
            ]}>
            <Animated.View
              style={[
                styles.flushCanvasAssembly,
                canvasAssemblyAnimatedStyle,
                {
                  left: boardOffsetXPx,
                  top: boardOffsetYPx,
                  width: RULER_SIZE + (canvasWidthPx || 1),
                  height: RULER_SIZE + (canvasHeightPx || 1),
                },
                (doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse') && {
                  backgroundColor: 'transparent',
                  shadowOpacity: 0,
                  elevation: 0,
                },
              ]}>
              <View style={styles.rulerTopRow}>
                <RulerCorner />
                <HorizontalRuler
                  trackWidthPx={canvasWidthPx || 1}
                  originPx={0}
                  contentWidthPx={canvasWidthPx || 1}
                  lengthMm={doc.widthMm}
                  selectedRangeMm={
                    selectedElement
                      ? {
                          start: selectedElement.left,
                          end: selectedElement.left + selectedElement.width,
                        }
                      : null
                  }
                  liveBounds={liveRulerBounds}
                />
              </View>
              <View style={styles.rulerBodyRow}>
                <VerticalRuler
                  trackHeightPx={canvasHeightPx || 1}
                  originPx={0}
                  contentHeightPx={canvasHeightPx || 1}
                  lengthMm={doc.heightMm}
                  selectedRangeMm={
                    selectedElement
                      ? {
                          start: selectedElement.top,
                          end: selectedElement.top + selectedElementHeightMm,
                        }
                      : null
                  }
                  liveBounds={liveRulerBounds}
                />
                <View
                  style={[
                    styles.artboardSlot,
                    {
                      width: canvasWidthPx || 1,
                      height: canvasHeightPx || 1,
                    },
                    (doc.mediaShape === 'circle' || doc.mediaShape === 'ellipse') && {
                      backgroundColor: 'transparent',
                      borderRightWidth: 0,
                      borderBottomWidth: 0,
                    },
                  ]}>
                  <KonvaCanvas
                    ref={canvasShotRef}
                    document={doc}
                    canvasWidthPx={canvasWidthPx}
                    canvasHeightPx={canvasHeightPx}
                    pxPerMM={pxPerMM}
                    padZoom={padZoom * committedScale}
                    selectedIds={selectedIds}
                    selectionColor={selectionColor}
                    surfaceColor={artboardFill}
                    showGrid={Boolean(editorSettings.editorGrid)}
                    liveBounds={liveRulerBounds}
                    topBarSelectionVisibleSv={topBarSelectionVisibleSv}
                    bottomPanelVisibleSv={bottomPanelVisibleSv}
                    onSelect={handleSelect}
                    onDeselectAll={handleDeselectAll}
                    onOpenPanel={openPanelFor}
                    onEditText={beginTextEdit}
                    onQuickEdit={handleQuickEdit}
                    onTransformStart={handleTransformStart}
                    onTransformMove={handleTransformMove}
                    onTransformEnd={handleTransformEnd}
                    onQuickRotate={handleRotateElement}
                    pointerToMm={windowPointToArtboardMm}
                    snapMoveMm={snapMoveMm}
                    snapGuides={snapGuides}
                  />
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
      </ZoomableEditPad>
    </Animated.View>
  );

  const renderPanel = (targetEl: LabelElement | null = displayElement) => {
    if (!targetEl) return null;
    switch (targetEl.type) {
      case 'text':
        return (
          <TextPropertyPanel
            activeTab={textTab}
            onTabChange={setTextTab}
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
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
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            onBusyChange={setImageIngesting}
          />
        );
      default:
        return null;
    }
  };

  const propertyMode = panelOpen && selectedElement !== null && renderPanel(displayElement) !== null;

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
        <View style={styles.subToolbarSlot}>
          <Animated.View
            style={[styles.subToolbarRow, defaultToolbarAnimatedStyle]}>
            <Pressable
              onPress={() => {
                if (isRatTail143Document(doc)) return;
                setSizeModalVisible(true);
              }}
              style={({ pressed }) => [styles.subToolbar, pressed && styles.pressed]}>
              <Text style={styles.dimText}>
                {doc.widthMm.toFixed(1)} × {doc.heightMm.toFixed(1)} mm · {doc.paperType}
                {doc.orientation ? ` · ${doc.orientation}°` : ''}
                {doc.ups ? ` · ${doc.ups.columns}ups` : ''}
              </Text>
              <Text style={styles.sizeHint}>
                {isRatTail143Document(doc)
                  ? 'Prints 14.3 × 101.6 mm wrap stock · content locked on the paddle'
                  : 'Tap to customize size'}
              </Text>
            </Pressable>

            {Math.abs(padZoom - 1) > 0.02 ? (
              <Pressable
                onPress={() => setPadZoom(1)}
                hitSlop={8}
                style={({ pressed }) => [styles.fitZoomBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Reset zoom to fit">
                <Text style={styles.fitZoomBtnText}>
                  Fit ({Math.round(padZoom * 100)}%)
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={toggleCanvasFullscreen}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={canvasFullscreen ? 'Restore editing panel' : 'Maximize canvas'}
              style={({ pressed }) => [styles.splitMaxBtn, pressed && styles.pressed]}>
              <AppIcon
                name={
                  canvasFullscreen
                    ? 'arrow.down.right.and.arrow.up.left'
                    : 'arrow.up.left.and.arrow.down.right'
                }
                tintColor={Palette.accent}
                size={18}
              />
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[StyleSheet.absoluteFillObject, contextualToolbarAnimatedStyle]}>
            {renderContextualToolbar()}
          </Animated.View>
        </View>

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
                    doc.ups!.activeIndex >= doc.ups!.columns - 1 && styles.upsPagerChevronDisabled,
                  ]}>
                  ›
                </Text>
              </Pressable>
            </View>
          )
        ) : null}

        <View
          style={styles.splitColumn}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            if (next <= 0) return;
            setSplitViewportH((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
          }}>
          {renderCanvas()}

          <CanvasPanelDivider
            canvasHeightPx={canvasSplitH}
            canvasHeightSv={canvasHeightSv}
            isDraggingSv={isDividerDraggingSv}
            viewportPx={splitViewportH > 0 ? splitViewportH : canvasSplitH + panelMinForSplit}
            panelMinPx={panelMinForSplit}
            onDragStart={handleSplitDragStart}
            onDragEnd={handleSplitDragEnd}
          />

          {editorSettings.showNudgePad && !canvasFullscreen ? (
            <EditingPad
              enabled={selectedIds.length > 0}
              locked={Boolean(selectedElement?.lockMovement) || (selectedIds.length > 0 && doc.elements.filter((el) => selectedIds.includes(el.id)).every((el) => el.lockMovement))}
              hidden={selectedIds.some((id) => {
                const el = doc.elements.find((item) => item.id === id);
                return el != null && !isEditorVisible(el);
              })}
              canPaste={clipboardHasContent()}
              viewZoom={padZoom}
              onNudge={nudgeSelected}
              onRotate={rotateSelectedBy}
              onAlign={alignSelected}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onLock={() => setLockOnSelection(!(selectedElement?.lockMovement ?? false))}
              onHide={toggleHideSelected}
              onCopy={copySelected}
              onPaste={pasteClipboard}
              onFront={() => reorderSelected('front')}
              onBack={() => reorderSelected('back')}
              onZoomIn={zoomInPad}
              onZoomOut={zoomOutPad}
            />
          ) : null}

          <View style={styles.sheet} pointerEvents="auto">
            {/* Pinned Toolbar Row - ALWAYS VISIBLE AT ALL SHEET HEIGHTS */}
            <View style={styles.pinnedToolbar}>
              <View style={styles.panelHeader}>
                {renderToolbar()}
                <Animated.View style={panelCloseBtnAnimatedStyle}>
                  <Pressable
                    onPress={closePanel}
                    hitSlop={10}
                    style={({ pressed }) => [styles.panelCloseBtn, pressed && styles.pressed]}>
                    <AppIcon name="xmark" tintColor={Palette.muted} size={16} />
                  </Pressable>
                </Animated.View>
              </View>
            </View>

            {/* Collapsible Reveal Window for Tool Grid / Property Panel */}
            <Animated.View style={[styles.toolGridRevealWindow, toolGridAnimatedStyle]}>
              <Animated.View style={[styles.staticPaletteContainer, staticPaletteAnimatedStyle]}>
                <StaticToolPalette
                  onToolPress={handleToolPress}
                  onBeginDrag={beginPaletteDrag}
                  onMoveDrag={movePaletteDrag}
                  onEndDrag={endPaletteDrag}
                />
              </Animated.View>

              <Animated.View style={[StyleSheet.absoluteFillObject, propertyPanelAnimatedStyle]}>
                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={{ paddingBottom: Math.max(Spacing.two, insets.bottom) }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled">
                  {renderPanel(displayElement)}
                </ScrollView>
              </Animated.View>
            </Animated.View>
          </View>
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

      <IosAlertModal
        visible={saveAsVisible}
        onClose={() => setSaveAsVisible(false)}
        title="Save As"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setSaveAsVisible(false) },
          { text: 'Save', style: 'default', bold: true, onPress: confirmSaveAs },
        ]}>
        <IosAlertInput
          value={saveAsName}
          onChangeText={setSaveAsName}
          placeholder="Label name"
          autoFocus
        />
      </IosAlertModal>

      <Modal
        visible={showOpenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOpenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.openModalCard]}>
            <View style={styles.openModalHeader}>
              <Text style={styles.modalHeading}>Open Label</Text>
            </View>
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
            <View style={styles.openModalFooter}>
              <Pressable
                style={({ pressed }) => [styles.openModalCloseBtn, pressed && styles.pressed]}
                onPress={() => setShowOpenModal(false)}>
                <Text style={styles.openModalCloseText}>Cancel</Text>
              </Pressable>
            </View>
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
              <View style={styles.openModalHeader}>
                <Text style={styles.modalHeading}>Label Size</Text>
              </View>
              {sizeModalVisible ? (
                <LabelSizeEditor
                  widthMm={doc.widthMm}
                  heightMm={doc.heightMm}
                  onChange={applyLabelSize}
                />
              ) : null}
              <View style={styles.openModalFooter}>
                <Pressable
                  style={({ pressed }) => [styles.openModalCloseBtn, pressed && styles.pressed]}
                  onPress={() => setSizeModalVisible(false)}>
                  <Text style={styles.openModalDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <QuickValueModal
        visible={quickEditTarget !== null}
        initialValue={quickEditTarget?.value ?? ''}
        title={quickEditTarget ? getQuickEditTitle(quickEditTarget.type) : undefined}
        placeholder={quickEditTarget ? getQuickEditPlaceholder(quickEditTarget.type) : undefined}
        anchorRect={quickEditTarget?.anchorRect}
        onCancel={handleQuickEditCancel}
        onConfirm={handleQuickEditConfirm}
      />
      <View
        ref={overlayViewRef}
        pointerEvents="none"
        collapsable={false}
        style={StyleSheet.absoluteFillObject}
        onLayout={() => {
          overlayViewRef.current?.measureInWindow((x, y) => {
            overlayOriginRef.current = { x, y };
          });
        }}>
        {paletteGhost ? (
          <PaletteDragGhost
            windowX={paletteGhost.windowX}
            windowY={paletteGhost.windowY}
            widthPx={paletteGhost.widthPx}
            heightPx={paletteGhost.heightPx}
            overlayOrigin={overlayOriginRef.current}
            icon={paletteGhost.icon}
          />
        ) : null}
      </View>
      {imageIngesting ? (
        <View style={styles.imageIngestOverlay} pointerEvents="auto">
          <View style={styles.imageIngestCard}>
            <ActivityIndicator color={Palette.accent} />
            <Text style={styles.imageIngestText}>Placing photo…</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  imageIngestOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    zIndex: 50,
  },
  imageIngestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  imageIngestText: {
    ...Type.action,
    color: Palette.ink,
  },
  body: {
    flex: 1,
    width: '100%',
  },
  splitColumn: {
    flex: 1,
    minHeight: 0,
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
  subToolbarSlot: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  subToolbarRow: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.two,
  },
  subToolbar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 2,
    gap: 2,
  },
  fitZoomBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(23, 166, 184, 0.15)',
    marginRight: 6,
  },
  fitZoomBtnText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '700',
  },
  splitMaxBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EDITOR_WORKSPACE_COLOR,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: LABEL_PAD_STAGE_MIN_HEIGHT,
    overflow: 'hidden',
  },
  stageZoom: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  workspace: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: EDITOR_WORKSPACE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
  rulerFrame: {
    position: 'relative',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  flushCanvasAssembly: {
    position: 'absolute',
    flexDirection: 'column',
    overflow: 'visible',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  artboardSlot: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  rulerTopRow: {
    flexDirection: 'row',
  },
  rulerBodyRow: {
    flexDirection: 'row',
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    overflow: 'hidden',
    ...cardShadow,
  },
  pinnedToolbar: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  toolGridRevealWindow: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  staticPaletteContainer: {
    width: '100%',
    height: 270,
    backgroundColor: '#FFFFFF',
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
    top: 11,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  toolbarRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  toolbarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 0,
    paddingVertical: 2,
  },
  toolbarDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairline,
  },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
  },
  toolsContainer: {
    width: '100%',
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  toolRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toolCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  toolItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#475569',
    textAlign: 'center',
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sizeModalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 290,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  openModalCard: {
    maxWidth: 320,
    maxHeight: 480,
  },
  sizeModalCard: {
    maxWidth: 340,
  },
  openModalHeader: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D1D6',
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalInput: {
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#FFFFFF',
    marginTop: 12,
  },
  openModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
    height: 45,
  },
  openModalCloseBtn: {
    flex: 1,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openModalCloseText: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '400',
  },
  openModalDoneText: {
    color: '#007AFF',
    fontSize: 17,
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
  contextualTopBar: {
    width: '100%',
    height: 44,
    backgroundColor: '#374151',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)',
  },
  contextualBarBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextualBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
