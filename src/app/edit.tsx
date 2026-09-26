import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppState,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
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
  fitNewTextDefaults,
  fitTimeDefaults,
  mergeTextElementPatch,
  NEW_TEXT_PLACEHOLDER,
  computeTextElementHeightMm,
  textBlockHeightMm,
  normalizeDocumentElements,
  scaleDocumentToSize,
} from '@/lib/element-sizing';
import { labelOverlapRegionsMm, overlapBannerPositionsPx } from '@/lib/editor/safe-mode';
import { clampToLabelBounds, fitFontSizeToLabel } from '@/lib/editor/label-bounds';
import { GridSpacingPopover } from '@/components/editor/grid-spacing-popover';
import { requestEditorGridToggle } from '@/lib/editor/editor-grid-toggle';
import {
  aspectRatioOf,
  resizeMemberByScale,
  resizePolicyFor,
  sharedScaleLimits,
  type MmBox,
  type ScaleCapMember,
} from '@/lib/editor/resize-policy';
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
import { collectImageFileUris, placeImportedImageMm } from '@/lib/editor/image-ingest';
import { ingestEditorImage, sweepEditorImageFiles } from '@/lib/editor/image-ingest-native';
import {
  ensureTableCells,
  patchTableCellInElement,
  tableCellToEditorState,
  type SelectedTableCell,
} from '@/lib/editor/table-cells';
import {
  isPaletteDropOnArtboard,
  paletteDropTopLeftMm,
  paletteDropTypeForLabel,
} from '@/lib/editor/palette-drop';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { applyPictureAdsorption } from '@/lib/editor/picture-adsorption';
import { chromeStrokeForFill, paletteGhostSizePx } from '@/lib/editor/canvas-chrome';
import { PaletteDragGhost } from '@/components/editor/palette-drag-ghost';
import { PaletteToolItem } from '@/components/editor/palette-tool-item';
import { ToolMenuIcon, TopToolbarIcon } from '@/components/editor/editor-menu-icons';
import { DegreesPropertyPanel } from '@/components/editor/degrees-property-panel';
import { ArcTextPropertyPanel } from '@/components/editor/arctext-property-panel';
import { BarcodePropertyPanel } from '@/components/editor/barcode-property-panel';
import { ImagePropertyPanel, type ImagePropertyTab } from '@/components/editor/image-property-panel';
import {
  ClipartPropertyPanel,
  type ClipartPropertyTab,
} from '@/components/editor/clipart-property-panel';
import { ElementContentView } from '@/components/editor/element-renderer';
import { ZoomableEditPad } from '@/components/editor/zoomable-edit-pad';
import { EditingPad } from '@/components/editor/editing-pad';
import { KonvaCanvas } from '@/components/editor/konva-canvas';
import type {
  TransformCommitPayload,
  TransformMovePayload,
  SelectSource,
  TransformStartKind,
} from '@/components/editor/konva-transformer';
import { CanvasPanelDivider } from '@/components/editor/canvas-panel-divider';
import { StaticToolPalette } from '@/components/editor/static-tool-palette';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const smoothEasing = Easing.out(Easing.cubic);
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
import { LabelSettingsMenu } from '@/components/editor/more-menu';
import { LabelSizeEditor } from '@/components/label-size-editor';
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
import { PositionLayerActionsProvider } from '@/components/editor/position-controls';
import {
  getQuickEditPatch,
  getQuickEditPlaceholder,
  getQuickEditTitle,
  getQuickEditValue,
  isQuickEditableType,
  type ElementAnchorRect,
} from '@/lib/editor/quick-value';
import {
  alignGroupBounds,
  reduceMultipleModeToggle,
  reduceTapSelect,
  selectionFromIds,
} from '@/lib/editor/selection';
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
  type EditorElementState,
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
  applyGeometryToAllLabels,
  applyGeometryToThisLabel,
  geometryFromElements,
  hydrateBulkDocument,
  isBulkSlotId,
  projectBulkDocument,
  resolveBulkSheet,
  syncBulkFromProjectedElements,
} from '@/lib/bulk-labels';
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
import { PdfPageNav } from '@/components/pdf-editor/pdf-page-nav';
import { pickExcelWorkbook } from '@/lib/excel-import';
import { useDataStore } from '@/stores/data-store';
import { CANVAS_BOTTOM_CHIP_CLEARANCE_PX, STAGE_PADDING_PX, clampLabelMm, fitEditorPadBoard } from '@/lib/label-geometry';
import { applyDocumentStockSize, stockSizePromptCopy, type StockSizeHandling } from '@/lib/stock-size';
import { sortLayers } from '@/lib/template-schema';
import { useTranslation } from '@/lib/i18n';
import {
  isJewelryDieCutDocument,
  JEWELRY_DIECUT,
} from '@/constants/jewelry-diecut';
import { canonicalizeJewelryDieCutDocument } from '@/constants/jewelry-template-elements';
import { isRatTail143Document, refitRatTail143Document } from '@/constants/rat-tail-143';
import { hasStockSilhouette } from '@/lib/stock-silhouette';
import { isRatTailGeometry, ratTailBodyRectMm } from '@/lib/media-geometry';
import { useLabelStore } from '@/stores/label-store';
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_BORDER_SELECTION_COLORS,
  EDITOR_TABLE_SELECTION_COLORS,
  useSettingsStore,
} from '@/stores/settings-store';
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
    { icon: 'rectangle.split.2x1', label: '2ups Label' },
    { icon: 'square.dashed', label: 'Border' },
    { icon: 'signature', label: 'Signature' },
  ],
];

const TOOLS = TOOL_ROWS.flat();

const MAX_HISTORY = 60;

function logMultiTransformBox(
  phase: string,
  id: string,
  box: { left: number; top: number; width: number; height: number },
) {
  console.log(
    `[multi-transform] ${phase} ${id} l=${box.left.toFixed(2)} t=${box.top.toFixed(2)} w=${box.width.toFixed(2)} h=${box.height.toFixed(2)}`,
  );
}

function boxOfElement(el: LabelElement): MmBox {
  const size = elementSizeMm(el);
  return { left: el.left, top: el.top, width: size.width, height: size.height };
}

function naturalHeightForWidth(el: LabelElement, widthMm: number, fontSize?: number): number | undefined {
  if (el.type === 'text' || el.type === 'degrees') {
    const rawText =
      el.contentType === 'Data Source' && el.columnNameContent
        ? `{${el.columnNameContent}}`
        : 'text' in el
          ? el.text
          : el.content;
    const fs = fontSize ?? ('fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 12);
    return computeTextElementHeightMm({
      text: rawText,
      fontSize: fs,
      widthMm,
      autoWrapping: el.autoWrapping ?? 'Word',
      lineSpacing: el.lineSpacing ?? '1.0',
      charSpacing: el.charSpacing ?? 0,
      bold: el.bold ?? false,
      verticalDisplay: el.verticalDisplay ?? false,
    });
  }
  if (el.type === 'time') {
    const fs = fontSize ?? ('fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 12);
    return textBlockHeightMm(fs, 1);
  }
  return undefined;
}

function resizeElementByScale(
  el: LabelElement,
  start: MmBox,
  handle: 'e' | 's',
  scaleX: number,
  scaleY: number,
  canvas: { widthMm: number; heightMm: number },
  fontSize?: number,
): MmBox {
  const policy = resizePolicyFor(el);
  const behavior = policy.behavior[handle];
  if (!behavior) {
    return { left: start.left, top: start.top, width: start.width, height: start.height };
  }
  return resizeMemberByScale({
    start,
    handle,
    behavior,
    scaleX,
    scaleY,
    aspect: aspectRatioOf(el),
    minMm: policy.minMm,
    canvas,
    naturalHeightMm: naturalHeightForWidth(el, start.width * scaleX, fontSize),
  });
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateEditorSplit() {
  LayoutAnimation.configureNext({
    duration: SPLIT_ANIMATION_MS,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

const PANEL_ELEMENT_TYPES: readonly ElementType[] = [
  'text',
  'barcode',
  'qrcode',
  'line',
  'shape',
  'table',
  'time',
  'arctext',
  'degrees',
  'image',
  'clipart',
];

function hasPropertyPanel(type: ElementType) {
  return PANEL_ELEMENT_TYPES.includes(type);
}

/**
 * Keeps a property panel mounted after first use. Mounting a panel creates many native
 * views on the UI thread, which stalls an in-flight drag; toggling display does not.
 * Hidden slots skip re-rendering entirely.
 */
const KeepAlivePanelSlot = memo(
  function KeepAlivePanelSlot({ visible, children }: { visible: boolean; children: ReactNode }) {
    return <View style={visible ? null : panelSlotHidden}>{children}</View>;
  },
  (prev, next) => !prev.visible && !next.visible,
);

const panelSlotHidden = { display: 'none' } as const;

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
    case 'shape': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      return { widthMm: fit.width, heightMm: fit.height };
    }
    case 'arctext': {
      const fit = fitShapeDefaults(canvas.widthMm, canvas.heightMm, elements);
      const circleSize = Math.min(fit.width, fit.height);
      return { widthMm: circleSize, heightMm: circleSize };
    }
    default: {
      const fit =
        type === 'time'
          ? fitTimeDefaults(canvas.widthMm, canvas.heightMm, elements)
          : type === 'text'
            ? fitNewTextDefaults(canvas.widthMm, canvas.heightMm, elements)
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
        const hydrated = hydrateBulkDocument(copy, useDataStore.getState().excelFiles);
        const normalized = { ...hydrated, elements: normalizeDocumentElements(hydrated) };
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

    // Clone / duplicate: copy elements from the source document with fresh ids.
    let elements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        const cloned = (JSON.parse(JSON.stringify(source.elements)) as LabelElement[]).map((el) => ({
          ...el,
          id: generateId(),
        }));
        // Clone target size can differ from the source (2ups / duplicate-at-new-size
        // creation flow). Proportional rescale so a verbatim copy is not left with
        // stale mm geometry that clips at the new label's edges.
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
  const [primaryId, setPrimaryId] = useState<string | null>(() =>
    params.selectedElementId ? params.selectedElementId : null,
  );
  const [multipleMode, setMultipleMode] = useState(false);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const primaryIdRef = useRef(primaryId);
  primaryIdRef.current = primaryId;
  const dragStartPositionsRef = useRef<Map<string, { left: number; top: number }> | null>(null);
  const transformKindRef = useRef<TransformStartKind | null>(null);
  const groupDeltaLeftSv = useSharedValue(0);
  const groupDeltaTopSv = useSharedValue(0);
  const groupAnchorIdSv = useSharedValue('');
  const groupEligibleSv = useSharedValue(0);
  const safeModeSv = useSharedValue(editorSettings.safeMode ? 1 : 0);
  const resizeStartSnapshotsRef = useRef<Map<string, MmBox> | null>(null);
  const groupScaleXSv = useSharedValue(1);
  const groupScaleYSv = useSharedValue(1);
  const groupHandleSv = useSharedValue(0);
  const groupScaleMinSv = useSharedValue(0.001);
  const groupScaleMaxSv = useSharedValue(1000);
  const activeSelectedIdSv = useSharedValue(primaryId ?? (params.selectedElementId ?? ''));
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
  const [borderOptionsOpen, setBorderOptionsOpen] = useState(false);
  const [showSignatureBoard, setShowSignatureBoard] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [draftWidthMm, setDraftWidthMm] = useState(50);
  const [draftHeightMm, setDraftHeightMm] = useState(30);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [bulkScopeApplyAll, setBulkScopeApplyAll] = useState(true);
  const bulkApplyAllRef = useRef(true);
  bulkApplyAllRef.current = bulkScopeApplyAll;
  const bulkGestureSnapshotRef = useRef<LabelElement[] | null>(null);
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
    safeModeSv.value = editorSettings.safeMode ? 1 : 0;
  }, [editorSettings.safeMode, safeModeSv]);

  useEffect(() => {
    bottomPanelVisibleSv.value = panelOpen && selectedIds.length > 0 ? 1 : 0;
  }, [panelOpen, selectedIds.length, bottomPanelVisibleSv]);

  useEffect(() => {
    activeSelectedIdSv.value = primaryId ?? (selectedIds.length === 1 ? selectedIds[0] : '');
  }, [primaryId, selectedIds, activeSelectedIdSv]);

  useEffect(() => {
    groupEligibleSv.value = selectedIds.length > 1 ? 1 : 0;
  }, [selectedIds.length, groupEligibleSv]);

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

  const [gridSpacingPopoverVisible, setGridSpacingPopoverVisible] = useState(false);
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
  const [selectedTableCell, setSelectedTableCell] = useState<SelectedTableCell | null>(null);
  const selectedTableCellRef = useRef<SelectedTableCell | null>(null);
  // Single writer for cell selection. The ref is the synchronous source of truth that
  // callbacks read; the state exists only so the canvas repaints the highlight. Assigning
  // either one directly lets the two consumers drift apart.
  const commitSelectedTableCell = useCallback((next: SelectedTableCell | null) => {
    selectedTableCellRef.current = next;
    setSelectedTableCell(next);
  }, []);
  const [timeTab, setTimeTab] = useState<TimePropertyTab>('Regular');
  const [arcTextTab, setArcTextTab] = useState<ArcTextPropertyTab>('Regular');
  const [degreesTab, setDegreesTab] = useState<PropertyTab>('Regular');
  const [imageTab, setImageTab] = useState<ImagePropertyTab>('Regular');
  const [clipartTab, setClipartTab] = useState<ClipartPropertyTab>('Regular');

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
    tableCell?: { tableId: string; row: number; col: number };
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

  const primaryElement = useMemo(() => {
    if (primaryId) {
      return doc.elements.find((el) => el.id === primaryId) ?? null;
    }
    if (selectedIds.length === 1) {
      return doc.elements.find((el) => el.id === selectedIds[0]) ?? null;
    }
    return null;
  }, [doc.elements, primaryId, selectedIds]);

  const selectionColor = useMemo(() => {
    const selectedType =
      primaryElement?.type ??
      (selectedIds.length === 1
        ? doc.elements.find((el) => el.id === selectedIds[0])?.type
        : undefined);
    if (selectedType === 'table') {
      const idx = Math.max(
        0,
        Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, editorSettings.tableColorIndex),
      );
      return EDITOR_TABLE_SELECTION_COLORS[idx];
    }
    if (selectedIds.length > 0) {
      const idx = Math.max(
        0,
        Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, editorSettings.borderColorIndex),
      );
      return EDITOR_BORDER_SELECTION_COLORS[idx];
    }
    return chromeStrokeForFill(artboardFill);
  }, [
    primaryElement?.type,
    selectedIds,
    doc.elements,
    editorSettings.borderColorIndex,
    editorSettings.tableColorIndex,
    artboardFill,
  ]);

  const selectedElement = selectedIds.length === 1 ? primaryElement : null;
  const lastSelectedElementRef = useRef<LabelElement | null>(null);
  if (primaryElement) {
    lastSelectedElementRef.current = primaryElement;
  }
  const displayElement = primaryElement ?? lastSelectedElementRef.current;

  const panelSeedRef = useRef(new Map<ElementType, LabelElement>());
  if (displayElement && hasPropertyPanel(displayElement.type)) {
    panelSeedRef.current.set(displayElement.type, displayElement);
  }
  const [mountedPanelTypes, setMountedPanelTypes] = useState<ElementType[]>(() =>
    displayElement && hasPropertyPanel(displayElement.type) ? [displayElement.type] : [],
  );
  const activePanelType =
    displayElement && hasPropertyPanel(displayElement.type) ? displayElement.type : null;
  if (activePanelType && !mountedPanelTypes.includes(activePanelType)) {
    setMountedPanelTypes((prev) => (prev.includes(activePanelType) ? prev : [...prev, activePanelType]));
  }

  const docPanelTypesKey = useMemo(() => {
    const types = new Set<ElementType>();
    for (const el of doc.elements) {
      if (hasPropertyPanel(el.type)) types.add(el.type);
    }
    return [...types].sort().join(',');
  }, [doc.elements]);

  useEffect(() => {
    const liveTypes = docPanelTypesKey
      ? (docPanelTypesKey.split(',') as ElementType[])
      : [];

    setMountedPanelTypes((prev) => {
      const liveSet = new Set(liveTypes);
      const pruned = prev.filter((type) => liveSet.has(type));
      return pruned.length === prev.length ? prev : pruned;
    });

    if (liveTypes.length === 0) return;

    let cancelled = false;
    let frame: number | null = null;
    const mountNext = () => {
      if (cancelled || !mountedRef.current) return;
      if (transformingRef.current) {
        frame = requestAnimationFrame(mountNext);
        return;
      }
      let added = false;
      setMountedPanelTypes((prev) => {
        const liveSet = new Set(liveTypes);
        const pruned = prev.filter((type) => liveSet.has(type));
        const missing = liveTypes.find((type) => !pruned.includes(type));
        if (!missing) {
          return pruned.length === prev.length ? prev : pruned;
        }
        added = true;
        return [...pruned, missing];
      });
      if (added) {
        frame = requestAnimationFrame(mountNext);
      }
    };
    const task = InteractionManager.runAfterInteractions(() => {
      frame = requestAnimationFrame(mountNext);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [docPanelTypesKey]);

  const selectedElements = useMemo(
    () => doc.elements.filter((el) => selectedIds.includes(el.id)),
    [doc.elements, selectedIds],
  );
  const overlapRegionsMm = useMemo(
    () => (editorSettings.safeMode ? labelOverlapRegionsMm(doc.elements) : []),
    [editorSettings.safeMode, doc.elements],
  );
  const overlapBannerPositions = useMemo(() => {
    if (overlapRegionsMm.length === 0 || pxPerMM <= 0) return [];
    return overlapBannerPositionsPx(
      overlapRegionsMm,
      pxPerMM,
      canvasWidthPx || 1,
      canvasHeightPx || 1,
      RULER_SIZE,
    );
  }, [overlapRegionsMm, pxPerMM, canvasWidthPx, canvasHeightPx]);
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
        if (next.bulk) {
          const sheet = resolveBulkSheet(useDataStore.getState().excelFiles, next.bulk);
          if (sheet) {
            next = {
              ...next,
              bulk: syncBulkFromProjectedElements(next.bulk, sheet, next.elements),
            };
          }
        }
        return next;
      });
      setDirty(true);
    },
    [pushHistory],
  );

  const commitBulkSlotGeometry = useCallback((slotIds: string[]) => {
    if (slotIds.length === 0) return;
    setDoc((prev) => {
      if (!prev.bulk) return prev;
      const geo = geometryFromElements(prev.elements, slotIds);
      if (Object.keys(geo).length === 0) return prev;
      const nextBulk = bulkApplyAllRef.current
        ? applyGeometryToAllLabels(prev.bulk, geo)
        : applyGeometryToThisLabel(prev.bulk, prev.bulk.activeRowIndex, geo);
      return { ...prev, bulk: nextBulk };
    });
  }, []);

  const goToUpsPanel = useCallback((nextIndex: number) => {
    setDoc((prev) => {
      if (!prev.ups || nextIndex === prev.ups.activeIndex) return prev;
      return switchUpsPanel(prev, nextIndex);
    });
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
    historyRef.current.clear();
    bumpHistory();
    setTextEditId(null);
    setDirty(true);
  }, [bumpHistory]);

  const goToBulkRow = useCallback((nextIndex: number) => {
    setDoc((prev) => {
      if (!prev.bulk || nextIndex === prev.bulk.activeRowIndex) return prev;
      const sheet = resolveBulkSheet(useDataStore.getState().excelFiles, prev.bulk);
      if (!sheet) return prev;
      const synced: LabelDocument = {
        ...prev,
        bulk: syncBulkFromProjectedElements(prev.bulk, sheet, prev.elements),
      };
      return projectBulkDocument(synced, sheet, nextIndex);
    });
    setSelectedIds([]);
    setPrimaryId(null);
    setPanelOpen(false);
    historyRef.current.clear();
    bumpHistory();
    setTextEditId(null);
    setDirty(true);
  }, [bumpHistory]);

  const syncSelectionAfterSnapshot = useCallback((snapshot: LabelElement[]) => {
    setSelectedIds((ids) => {
      const filtered = ids.filter((id) => snapshot.some((el) => el.id === id));
      setPrimaryId((pid) =>
        pid && filtered.includes(pid) ? pid : filtered[filtered.length - 1] ?? null,
      );
      return filtered;
    });
  }, []);

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
    syncSelectionAfterSnapshot(snapshot);
  }, [bumpHistory, syncSelectionAfterSnapshot]);

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
    syncSelectionAfterSnapshot(snapshot);
  }, [bumpHistory, syncSelectionAfterSnapshot]);

  const patchElement = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      const geoKeys = ['left', 'top', 'width', 'height'];
      const isGeo = geoKeys.some((key) => key in updates) && isBulkSlotId(id) && Boolean(docRef.current.bulk);
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (el.id !== id) return el;
          if (el.type === 'text' || el.type === 'degrees') {
            return mergeTextElementPatch(el, updates);
          }
          return { ...el, ...updates } as LabelElement;
        }),
      );
      scheduleHistoryCommit();
      if (isGeo) commitBulkSlotGeometry([id]);
    },
    [setElements, scheduleHistoryCommit, commitBulkSlotGeometry],
  );

  const patchSelected = useCallback(
    (updates: Record<string, unknown>) => {
      const id =
        primaryId ??
        (selectedIds.length === 1
          ? selectedIds[0]
          : selectedIds.length > 1
          ? selectedIds[selectedIds.length - 1]
          : null);
      if (!id) return;
      patchElement(id, updates);
    },
    [primaryId, selectedIds, patchElement],
  );

  // Writes to an explicit cell target. Kept free of selection state so callers reached from
  // a focus effect (scan / font / column-name results) can't run against a stale closure.
  const patchTableCellAt = useCallback(
    (
      target: SelectedTableCell,
      updates: Partial<EditorElementState & { degreesOffset?: number }>,
    ) => {
      const table = docRef.current.elements.find(
        (el): el is Extract<LabelElement, { type: 'table' }> =>
          el.id === target.tableId && el.type === 'table',
      );
      if (
        !table ||
        target.row < 0 ||
        target.col < 0 ||
        target.row >= table.rowCount ||
        target.col >= table.columnCount
      ) {
        console.log(
          `[table-cell] patch-rejected target=${JSON.stringify(target)} found=${!!table} rowCount=${table?.rowCount} colCount=${table?.columnCount}`,
        );
        return false;
      }
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) => {
          if (el.id !== target.tableId || el.type !== 'table') return el;
          return patchTableCellInElement(el, target.row, target.col, updates);
        }),
      );
      scheduleHistoryCommit();
      return true;
    },
    [setElements, scheduleHistoryCommit],
  );

  const patchTableCellSelected = useCallback(
    (updates: Partial<EditorElementState & { degreesOffset?: number }>) => {
      const cell = selectedTableCellRef.current;
      if (!cell) return false;
      return patchTableCellAt(cell, updates);
    },
    [patchTableCellAt],
  );

  const handleTableCellPress = useCallback(
    (tableId: string, cell: { row: number; col: number } | null) => {
      if (cell) {
        const tableEl = docRef.current.elements.find(
          (el): el is Extract<LabelElement, { type: 'table' }> =>
            el.id === tableId && el.type === 'table',
        );
        if (
          !tableEl ||
          cell.row < 0 ||
          cell.col < 0 ||
          cell.row >= tableEl.rowCount ||
          cell.col >= tableEl.columnCount
        ) {
          console.log(
            `[table-cell] select-rejected tableId=${tableId} cell=${JSON.stringify(cell)} rowCount=${tableEl?.rowCount} colCount=${tableEl?.columnCount}`,
          );
          return;
        }
        commitSelectedTableCell({ tableId, row: cell.row, col: cell.col });
        setTextTab('Regular');
        console.log(
          `[table-cell] select-highlight tableId=${tableId} row=${cell.row} col=${cell.col} panel=TextPropertyPanel`,
        );
      } else {
        commitSelectedTableCell(null);
        setTableTab('Regular');
        console.log(`[table-cell] clear-cell tableId=${tableId} panel=TablePropertyPanel`);
      }
      setPanelOpen(true);
    },
    [commitSelectedTableCell],
  );

  const handleTableCellQuickEdit = useCallback(
    (tableId: string, cell: { row: number; col: number }, anchorRect?: ElementAnchorRect) => {
      handleTableCellPress(tableId, cell);
      const tableEl = docRef.current.elements.find(
        (el): el is Extract<LabelElement, { type: 'table' }> =>
          el.id === tableId && el.type === 'table',
      );
      if (!tableEl) {
        console.log(`[table-cell] quick-edit-miss tableId=${tableId} — table not found`);
        return;
      }
      const table = ensureTableCells(tableEl);
      const value = table.cells?.[cell.row]?.[cell.col]?.text ?? '';
      console.log(
        `[table-cell] quick-edit-open tableId=${tableId} row=${cell.row} col=${cell.col} valueLen=${value.length} dialog=QuickValueModal`,
      );
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          setQuickEditTarget({
            id: tableId,
            type: 'text',
            value,
            anchorRect,
            tableCell: { tableId, row: cell.row, col: cell.col },
          });
        }, 80);
      });
    },
    [handleTableCellPress],
  );

  const patchPrimary = useCallback(
    (updates: Record<string, unknown>) => {
      const id = primaryId ?? (selectedIds.length === 1 ? selectedIds[0] : null);
      if (!id) return;
      patchElement(id, updates);
    },
    [primaryId, selectedIds, patchElement],
  );

  const patchAllSelected = useCallback(
    (updates: Record<string, unknown>) => {
      if (selectedIds.length === 0) return;
      historyRef.current.begin(docRef.current.elements);
      setElements((elements) =>
        elements.map((el) =>
          selectedIds.includes(el.id) ? ({ ...el, ...updates } as LabelElement) : el,
        ),
      );
      scheduleHistoryCommit();
    },
    [selectedIds, setElements, scheduleHistoryCommit],
  );

  const addElement = useCallback(
    (type: ElementType, overrides: Record<string, unknown> = {}) => {
      const { widthMm: maxW, heightMm: maxH, elements } = docRef.current;
      const base = { id: generateId() };
      let element: LabelElement;
      switch (type) {
        case 'text': {
          const fit = defaults.autoFitSize
            ? fitTextDefaults(maxW, maxH, elements)
            : fitNewTextDefaults(maxW, maxH, elements);
          element = {
            ...DEFAULT_ELEMENT_STATE,
            ...base,
            type: 'text',
            text: NEW_TEXT_PLACEHOLDER,
            left: fit.left,
            top: fit.top,
            width: fit.width,
            fontSize: fit.fontSize,
            autoWrapping: defaults.autoWrap,
            autoTextHeight: defaults.autoTextHeight,
            ...overrides,
          };
          if (defaults.autoFitFont && element.type === 'text') {
            const targetMaxH = Math.max(2, maxH - Math.max(0, element.top));
            const fittedFs = fitFontSizeToLabel({
              text: element.text,
              widthMm: element.width,
              maxHeightMm: targetMaxH,
              initialFontSize: element.fontSize,
              autoWrapping: element.autoWrapping,
              lineSpacing: element.lineSpacing,
              charSpacing: element.charSpacing,
              bold: element.bold,
              verticalDisplay: element.verticalDisplay,
            });
            element = { ...element, fontSize: fittedFs };
            if (element.autoTextHeight) {
              element = {
                ...element,
                height: computeTextElementHeightMm({
                  text: element.text,
                  fontSize: fittedFs,
                  widthMm: element.width,
                  autoWrapping: element.autoWrapping,
                  lineSpacing: element.lineSpacing,
                  charSpacing: element.charSpacing,
                  bold: element.bold,
                  verticalDisplay: element.verticalDisplay,
                }),
              };
            }
          }
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
          const circleSize = Math.min(fit.width, fit.height);
          element = {
            ...DEFAULT_ARCTEXT_STATE,
            ...base,
            type: 'arctext',
            left: fit.left,
            top: fit.top,
            width: circleSize,
            height: circleSize,
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
          const tiled = defaults.tileImage && overrides.contentFit == null && overrides.uri == null;
          element = {
            id: base.id,
            type: 'image',
            uri: '',
            rotation: 0,
            left: tiled ? 0 : fit.left,
            top: tiled ? 0 : fit.top,
            width: tiled ? maxW : fit.width,
            height: tiled ? maxH : fit.height,
            lockMovement: false,
            needPrinting: true,
            antiColor: false,
            contentFit: tiled ? 'fill' : 'contain',
            ...overrides,
          };
          break;
        }
        case 'clipart': {
          const fit = fitClipartDefaults(maxW, maxH, elements);
          const tiled =
            defaults.tileImage &&
            overrides.clipartId == null &&
            overrides.tile == null &&
            overrides.width == null;
          element = {
            id: base.id,
            type: 'clipart',
            clipartId: '',
            rotation: 0,
            left: tiled ? 0 : fit.left,
            top: tiled ? 0 : fit.top,
            width: tiled ? maxW : fit.width,
            height: tiled ? maxH : fit.height,
            lockMovement: false,
            needPrinting: true,
            drawingColorIndex: 0,
            tile: tiled,
            colorMode: defaults.colorMode,
            grayThreshold: defaults.grayThreshold,
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
      if (
        editorSettings.pictureAdsorption &&
        (element.type === 'image' || element.type === 'clipart')
      ) {
        const snapped = applyPictureAdsorption(element, docRef.current.elements, true);
        if (snapped) {
          element = { ...element, ...snapped };
        }
      }
      const maxZ = docRef.current.elements.reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0);
      element.zIndex = maxZ + 1;
      setElements((items) => [...items, element], true);
      setSelectedIds([element.id]);
      setPrimaryId(element.id);
      return element;
    },
    [defaults, pickerRows, pickerColumns, setElements, editorSettings.pictureAdsorption],
  );

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;

    transformingRef.current = false;
    transformKindRef.current = null;
    dragStartPositionsRef.current = null;
    resizeStartSnapshotsRef.current = null;
    clearGroupPreview();

    selectedIdsRef.current = [];
    primaryIdRef.current = null;
    activeSelectedIdSv.value = '';
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    groupEligibleSv.value = 0;

    lastSelectedElementRef.current = null;
    setQuickEditTarget(null);
    setTextEditId(null);
    textEditInputRef.current?.blur();

    const remaining = docRef.current.elements.filter((el) => !ids.includes(el.id));
    for (const [type] of panelSeedRef.current) {
      if (!remaining.some((el) => el.type === type)) {
        panelSeedRef.current.delete(type);
      }
    }

    setElements((elements) => elements.filter((el) => !ids.includes(el.id)), true);
    setSelectedIds([]);
    setPrimaryId(null);
    commitSelectedTableCell(null);
    setPanelOpen(false);
  }, [
    setElements,
    commitSelectedTableCell,
    clearGroupPreview,
    activeSelectedIdSv,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    groupEligibleSv,
  ]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const bounds = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };
    const result = duplicateElements(docRef.current.elements, selectedIds, bounds);
    if (result.newIds.length === 0) return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setElements(() => result.elements, true);
    const next = selectionFromIds(result.newIds);
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
    commitSelectedTableCell(null);
  }, [
    selectedIds,
    setElements,
    topBarSelectionVisibleSv,
    bottomPanelVisibleSv,
    commitSelectedTableCell,
  ]);

  const handleDeselectAll = useCallback(() => {
    topBarSelectionVisibleSv.value = 0;
    bottomPanelVisibleSv.value = 0;
    setSelectedIds([]);
    setPrimaryId(null);
    commitSelectedTableCell(null);
    setPanelOpen(false);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv, commitSelectedTableCell]);

  const toggleMultipleMode = useCallback(() => {
    const turningOn = !multipleMode;
    const next = reduceMultipleModeToggle(turningOn, {
      ids: selectedIdsRef.current,
      primaryId: primaryIdRef.current,
    });
    if (!turningOn) {
      topBarSelectionVisibleSv.value = 0;
      bottomPanelVisibleSv.value = 0;
      setPanelOpen(false);
    }
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
    setMultipleMode(turningOn);
  }, [multipleMode, topBarSelectionVisibleSv, bottomPanelVisibleSv]);

  const toggleEditorGrid = useCallback(() => {
    requestEditorGridToggle(!editorSettings.editorGrid, patchEditor);
  }, [editorSettings.editorGrid, patchEditor]);

  const gridSpacingMm =
    editorSettings.editorGridSpacingMm ?? DEFAULT_EDITOR_SETTINGS.editorGridSpacingMm;

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
      case 'clipart':
        setClipartTab('Regular');
        break;
      default:
        break;
    }
  }, []);

  const handleSelect = useCallback(
    (id: string, source: SelectSource = 'touch') => {
      const element = docRef.current.elements.find((el) => el.id === id);
      if (!element || element.needPrinting === false || element.type === 'border') return;
      if (!mountedRef.current) return;

      const current = { ids: selectedIdsRef.current, primaryId: primaryIdRef.current };
      const alreadySelected = current.ids.includes(id);

      // Touch-down is add-only: in Multiple mode it must never drop a member, or a group
      // drag loses elements and the tap-end toggle flips it back (flicker).
      if (multipleMode && source === 'touch' && alreadySelected) {
        activeSelectedIdSv.value = id;
        return;
      }
      // A deferred toggle whose element was already removed elsewhere is stale.
      if (multipleMode && source === 'toggle' && !alreadySelected) return;

      // e41f3aa: skip React work when the same element is already selected with panel open.
      if (
        !multipleMode &&
        current.ids.length === 1 &&
        current.ids[0] === id &&
        panelOpen
      ) {
        activeSelectedIdSv.value = id;
        return;
      }

      const next = reduceTapSelect({ id, multipleMode, current });

      // Refs update synchronously so a rapid next touch never reads the pre-render selection.
      selectedIdsRef.current = next.ids;
      primaryIdRef.current = next.primaryId;
      setSelectedIds(next.ids);
      setPrimaryId(next.primaryId);

      if (next.ids.length === 0) {
        activeSelectedIdSv.value = '';
        topBarSelectionVisibleSv.value = 0;
        bottomPanelVisibleSv.value = 0;
        commitSelectedTableCell(null);
        setPanelOpen(false);
        return;
      }

      if (
        !next.primaryId ||
        next.primaryId !== selectedTableCellRef.current?.tableId
      ) {
        commitSelectedTableCell(null);
      }

      topBarSelectionVisibleSv.value = 1;
      bottomPanelVisibleSv.value = 1;
      activeSelectedIdSv.value = next.primaryId ?? id;
      lastSelectedElementRef.current =
        docRef.current.elements.find((el) => el.id === next.primaryId) ?? element;

      // e41f3aa: lightweight panel open — no tab resets or deferred transitions on touch-down.
      if (!multipleMode) {
        if (element.type === 'signature') {
          setShowSignatureBoard(true);
        } else if (element.type === 'image') {
          setImageTab('Regular');
          setPanelOpen(true);
        } else if (element.type === 'clipart') {
          setClipartTab('Regular');
          setPanelOpen(true);
        } else {
          setPanelOpen(true);
        }
      } else if (next.ids.length >= 2) {
        setPanelOpen(true);
      } else if (next.ids.length === 1) {
        setPanelOpen(true);
      }
    },
    [
      multipleMode,
      topBarSelectionVisibleSv,
      bottomPanelVisibleSv,
      activeSelectedIdSv,
      panelOpen,
      commitSelectedTableCell,
    ],
  );

  const openPanelFor = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    topBarSelectionVisibleSv.value = 1;
    bottomPanelVisibleSv.value = 1;
    setSelectedIds([id]);
    setPrimaryId(id);
    if (element.type === 'signature') {
      setShowSignatureBoard(true);
      return;
    }
    if (element.type === 'border') {
      return;
    }
    resetTabToRegularForElement(element.type);
    setPanelOpen(true);
  }, [topBarSelectionVisibleSv, bottomPanelVisibleSv, resetTabToRegularForElement]);

  const beginTextEdit = useCallback((id: string) => {
    const element = docRef.current.elements.find((el) => el.id === id);
    if (!element) return;
    setSelectedIds([id]);
    setPrimaryId(id);
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
    setPrimaryId(id);
    // Wait for the double-tap gesture to finish so it doesn't steal focus from the input.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        setQuickEditTarget({
          id,
          type: element.type,
          value: getQuickEditValue(element),
          anchorRect,
        });
      }, 80);
    });
  }, []);

  const handleQuickEditConfirm = useCallback(
    (newValue: string) => {
      if (!quickEditTarget) return;
      const cell = quickEditTarget.tableCell;
      if (cell) {
        historyRef.current.begin(docRef.current.elements);
        setElements((elements) =>
          elements.map((el) => {
            if (el.id !== cell.tableId || el.type !== 'table') return el;
            return patchTableCellInElement(el, cell.row, cell.col, {
              text: newValue,
              contentType: 'Manual',
            });
          }),
        );
        scheduleHistoryCommit();
        commitSelectedTableCell(cell);
        setQuickEditTarget(null);
        return;
      }
      const element = docRef.current.elements.find((el) => el.id === quickEditTarget.id);
      if (element) {
        const patch = getQuickEditPatch(element, newValue);
        patchElement(element.id, patch);
      }
      setQuickEditTarget(null);
    },
    [
      quickEditTarget,
      patchElement,
      setElements,
      scheduleHistoryCommit,
      commitSelectedTableCell,
    ],
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

  const selectedElementHeightMm = primaryElement ? elementSizeMm(primaryElement).height : 0;
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
    if (transformingRef.current) return;
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

  const clearGroupPreview = useCallback(() => {
    groupAnchorIdSv.value = '';
    groupDeltaLeftSv.value = 0;
    groupDeltaTopSv.value = 0;
    groupScaleXSv.value = 1;
    groupScaleYSv.value = 1;
  }, [groupAnchorIdSv, groupDeltaLeftSv, groupDeltaTopSv, groupScaleXSv, groupScaleYSv]);

  const handleTransformStart = useCallback(
    (id: string, kind: TransformStartKind) => {
      transformingRef.current = true;
      historyRef.current.begin(docRef.current.elements);
      publishSnapGuides([]);
      transformKindRef.current = kind;
      if (docRef.current.bulk) {
        bulkGestureSnapshotRef.current = JSON.parse(
          JSON.stringify(docRef.current.elements),
        ) as LabelElement[];
      } else {
        bulkGestureSnapshotRef.current = null;
      }

      if (!selectedIdsRef.current.includes(id)) {
        handleSelect(id);
      }

      const ids = selectedIdsRef.current.includes(id) ? selectedIdsRef.current : [id];
      const map = new Map<string, MmBox>();
      for (const el of docRef.current.elements) {
        if (ids.includes(el.id)) {
          const box = boxOfElement(el);
          map.set(el.id, box);
          logMultiTransformBox('start', el.id, box);
        }
      }

      if (kind === 'move' && ids.length > 1 && ids.includes(id)) {
        const positions = new Map<string, { left: number; top: number }>();
        for (const [memberId, box] of map) {
          positions.set(memberId, { left: box.left, top: box.top });
        }
        dragStartPositionsRef.current = positions;
        resizeStartSnapshotsRef.current = null;
      } else if (kind === 'resize' && ids.length > 1 && ids.includes(id)) {
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = map.size > 1 ? map : null;
      } else {
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = null;
      }
    },
    [publishSnapGuides, handleSelect],
  );

  const prepareGroupResizeHandle = useCallback(
    (handle: 'e' | 's') => {
      const snapshots = resizeStartSnapshotsRef.current;
      const ids = selectedIdsRef.current;
      if (ids.length < 2) return;
      const docSnapshot = docRef.current;
      const canvas = { widthMm: docSnapshot.widthMm, heightMm: docSnapshot.heightMm };
      const resolved = snapshots ?? new Map<string, MmBox>();
      if (!snapshots) {
        for (const el of docSnapshot.elements) {
          if (ids.includes(el.id)) resolved.set(el.id, boxOfElement(el));
        }
        resizeStartSnapshotsRef.current = resolved;
      }
      const members: ScaleCapMember[] = [];
      for (const memberId of ids) {
        const el = docSnapshot.elements.find((item) => item.id === memberId);
        const start = resolved.get(memberId);
        if (!el || !start) continue;
        const policy = resizePolicyFor(el);
        const behavior = policy.behavior[handle];
        if (!behavior) continue;
        members.push({
          start,
          minMm: policy.minMm,
          behavior,
          aspect: aspectRatioOf(el),
        });
      }
      if (members.length === 0) return;
      const limits = sharedScaleLimits({ members, handle, canvas });
      groupHandleSv.value = handle === 's' ? 1 : 0;
      groupScaleMinSv.value = limits.minScale;
      groupScaleMaxSv.value = limits.maxScale;
    },
    [groupHandleSv, groupScaleMinSv, groupScaleMaxSv],
  );

  const snapMoveMm = useCallback(
    (input: { id: string; leftMm: number; topMm: number; widthMm: number; heightMm: number }) => {
      return { leftMm: input.leftMm, topMm: input.topMm };
    },
    [],
  );

  const handleTransformMove = useCallback((_payload: TransformMovePayload) => {
    // Group-drag live preview is driven on the UI thread in konva-transformer worklets.
  }, []);

  const handleTransformEnd = useCallback(
    (payload: TransformCommitPayload) => {
      publishSnapGuides([]);
      if (!docRef.current.elements.some((el) => el.id === payload.id)) {
        transformingRef.current = false;
        dragStartPositionsRef.current = null;
        resizeStartSnapshotsRef.current = null;
        transformKindRef.current = null;
        bulkGestureSnapshotRef.current = null;
        clearGroupPreview();
        return;
      }
      const clean = sanitizeTransform(payload);
      const recordHistory = !transformingRef.current;
      if (transformingRef.current) {
        historyRef.current.commit();
        transformingRef.current = false;
        bumpHistory();
      }

      const startPositions = dragStartPositionsRef.current;
      dragStartPositionsRef.current = null;
      const resizeSnapshots = resizeStartSnapshotsRef.current;
      resizeStartSnapshotsRef.current = null;
      const kind = transformKindRef.current;
      transformKindRef.current = null;
      const ids = selectedIdsRef.current;
      const canvas = { widthMm: docRef.current.widthMm, heightMm: docRef.current.heightMm };

      const offerBulkScope = (memberIds: string[]) => {
        const snap = bulkGestureSnapshotRef.current;
        bulkGestureSnapshotRef.current = null;
        if (kind !== 'move' && kind !== 'resize') return;
        if (!snap) return;
        const slotIds = memberIds.filter(isBulkSlotId);
        if (!slotIds.length) return;
        const origin = snap.find((el) => el.id === payload.id);
        if (origin) {
          const originHeight =
            'height' in origin && typeof origin.height === 'number' ? origin.height : clean.heightMm;
          const unchanged =
            Math.abs(origin.left - clean.leftMm) <= 0.02 &&
            Math.abs(origin.top - clean.topMm) <= 0.02 &&
            (kind === 'move' ||
              (Math.abs(origin.width - clean.widthMm) <= 0.02 &&
                Math.abs(originHeight - clean.heightMm) <= 0.02));
          if (unchanged && (!ids.length || ids.length === 1)) return;
        }
        commitBulkSlotGeometry(slotIds);
      };

      const applyAutoFitFont = (el: LabelElement): LabelElement => {
        if (!defaults.autoFitFont || (el.type !== 'text' && el.type !== 'degrees')) return el;
        const showColumnName = useSettingsStore.getState().editor.showColumnName;
        const raw =
          el.type === 'text'
            ? el.contentType === 'Data Source' && el.columnNameContent
              ? formatDataSourceColumn(el.columnNameContent, showColumnName)
              : el.text
            : el.contentType === 'Data Source' && el.columnNameContent
              ? formatDataSourceColumn(el.columnNameContent, showColumnName)
              : el.content;
        const targetMaxH = Math.max(2, canvas.heightMm - Math.max(0, el.top));
        const fittedFs = fitFontSizeToLabel({
          text: raw,
          widthMm: el.width,
          maxHeightMm: targetMaxH,
          initialFontSize: el.fontSize,
          autoWrapping: el.autoWrapping,
          lineSpacing: el.lineSpacing,
          charSpacing: el.charSpacing,
          bold: el.bold,
          verticalDisplay: el.verticalDisplay,
        });
        const next = { ...el, fontSize: fittedFs } as LabelElement;
        if ('autoTextHeight' in next && next.autoTextHeight !== false) {
          (next as { height: number }).height = computeTextElementHeightMm({
            text: raw,
            fontSize: fittedFs,
            widthMm: el.width,
            autoWrapping: el.autoWrapping,
            lineSpacing: el.lineSpacing,
            charSpacing: el.charSpacing,
            bold: el.bold,
            verticalDisplay: el.verticalDisplay,
          });
        }
        return next;
      };

      const patchBox = (
        el: LabelElement,
        box: MmBox,
        rotation: number,
        fontSize?: number,
      ): LabelElement => {
        const next: LabelElement = {
          ...el,
          left: box.left,
          top: box.top,
          width: box.width,
          rotation,
        };
        if (fontSize !== undefined && 'fontSize' in next) {
          (next as { fontSize: number }).fontSize = fontSize;
        }
        if (
          el.type === 'text' ||
          el.type === 'degrees' ||
          el.type === 'time' ||
          typeof (el as { height?: number }).height === 'number'
        ) {
          (next as { height: number }).height = box.height;
        }
        return next;
      };

      const isGroupResize =
        kind === 'resize' &&
        ids.length > 1 &&
        ids.includes(payload.id) &&
        resizeSnapshots &&
        resizeSnapshots.size > 1;

      if (isGroupResize) {
        const handle: 'e' | 's' = groupHandleSv.value === 1 ? 's' : 'e';
        const scaleX = groupScaleXSv.value;
        const scaleY = groupScaleYSv.value;
        setElements(
          (elements) =>
            elements.map((el) => {
              if (!ids.includes(el.id)) return el;
              const start = resizeSnapshots.get(el.id);
              if (!start) return el;
              const live = resizeElementByScale(el, start, handle, scaleX, scaleY, canvas, clean.fontSize);
              logMultiTransformBox('live', el.id, live);
              logMultiTransformBox('commit', el.id, live);
              return patchBox(el, live, clean.rotation, clean.fontSize);
            }),
          recordHistory,
        );
        clearGroupPreview();
        offerBulkScope(ids);
        return;
      }

      const isGroupMove =
        kind === 'move' &&
        ids.length > 1 &&
        ids.includes(payload.id) &&
        startPositions;

      if (isGroupMove) {
        const deltaLeft = groupDeltaLeftSv.value;
        const deltaTop = groupDeltaTopSv.value;
        setElements(
          (elements) =>
            elements.map((el) => {
              if (!ids.includes(el.id) || el.lockMovement || el.type === 'border') {
                return el;
              }
              const orig = startPositions.get(el.id);
              if (!orig) return el;
              const size = elementSizeMm(el);
              const live = {
                left: orig.left + deltaLeft,
                top: orig.top + deltaTop,
                width: size.width,
                height: size.height,
              };
              logMultiTransformBox('live', el.id, live);
              logMultiTransformBox('commit', el.id, live);
              return { ...el, left: live.left, top: live.top };
            }),
          recordHistory,
        );
        clearGroupPreview();
        offerBulkScope(ids);
        return;
      }

      setElements(
        (elements) =>
          elements.map((el) => {
            if (el.id !== payload.id) return el;
            const fs = clean.fontSize ?? ('fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : undefined);
            let targetHeight = clean.heightMm;
            const naturalH = naturalHeightForWidth(el, clean.widthMm, fs);
            if (naturalH !== undefined) {
              targetHeight = naturalH;
            }
            let next: LabelElement;
            if (kind === 'resize') {
              next = patchBox(
                el,
                {
                  left: clean.leftMm,
                  top: clean.topMm,
                  width: clean.widthMm,
                  height: targetHeight,
                },
                clean.rotation,
                fs,
              );
            } else {
              const clamped = clampToLabelBounds(
                { left: clean.leftMm, top: clean.topMm, width: clean.widthMm, height: targetHeight },
                canvas,
                { anchor: 'body', naturalHeight: targetHeight },
              );
              next = patchBox(
                el,
                {
                  left: clamped.left,
                  top: clamped.top,
                  width: clamped.width,
                  height: clamped.height,
                },
                clean.rotation,
                fs,
              );
            }
            if (
              editorSettings.pictureAdsorption &&
              (next.type === 'image' || next.type === 'clipart')
            ) {
              const snapped = applyPictureAdsorption(
                next,
                elements.map((item) => (item.id === next.id ? next : item)),
                true,
              );
              if (snapped) {
                next = { ...next, ...snapped };
              }
            }
            if (kind === 'resize' && (next.type === 'text' || next.type === 'degrees')) {
              next = applyAutoFitFont(next);
            }
            return next;
          }),
        recordHistory,
      );
      clearGroupPreview();
      offerBulkScope(ids.includes(payload.id) ? ids : [payload.id]);
    },
    [
      setElements,
      commitBulkSlotGeometry,
      bumpHistory,
      publishSnapGuides,
      clearGroupPreview,
      groupDeltaLeftSv,
      groupDeltaTopSv,
      groupHandleSv,
      groupScaleXSv,
      groupScaleYSv,
      editorSettings.pictureAdsorption,
      defaults.autoFitFont,
    ],
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
      if (selectedIds.length > 1) {
        setElements(
          (elements) => {
            const patches = alignGroupBounds(elements, selectedIds, canvasMm, kind);
            return elements.map((el) => {
              if (!selectedIds.includes(el.id) || el.lockMovement || el.type === 'border') {
                return el;
              }
              const patch = patches.get(el.id);
              return patch ? { ...el, ...patch } : el;
            });
          },
          true,
        );
        return;
      }
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
    const next = selectionFromIds(result.newIds);
    setSelectedIds(next.ids);
    setPrimaryId(next.primaryId);
  }, [canvasMm, setElements]);

  const reorderSelected = useCallback(
    (kind: 'front' | 'back' | 'forward' | 'backward') => {
      if (selectedIds.length === 0) return;
      setElements((elements) => reorderElements(elements, selectedIds, kind), true);
    },
    [selectedIds, setElements],
  );

  const positionLayerActions = useMemo(
    () => ({
      onSendToBack: () => reorderSelected('back'),
      onBringToFront: () => reorderSelected('front'),
      onSendBackward: () => reorderSelected('backward'),
      onBringForward: () => reorderSelected('forward'),
    }),
    [reorderSelected],
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
    const copy = hydrateBulkDocument(
      JSON.parse(JSON.stringify(docToOpen)) as LabelDocument,
      useDataStore.getState().excelFiles,
    );
    setDoc(copy);
    setSavedToStore(true);
    setDirty(false);
    setSelectedIds([]);
    setPrimaryId(null);
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

  const applyLabelSize = useCallback(
    (widthMm: number, heightMm: number, mode: StockSizeHandling) => {
      if (isRatTail143Document(docRef.current)) return;
      const files = useDataStore.getState().excelFiles;
      const next = applyDocumentStockSize(docRef.current, widthMm, heightMm, mode, files);
      docRef.current = next;
      setDoc(next);
      upsertDocument(syncUpsActivePanel(next));
      setSavedToStore(true);
      setDirty(false);
      historyRef.current.clear();
      bumpHistory();
    },
    [bumpHistory, upsertDocument],
  );

  const confirmStockSizeChange = useCallback(
    (widthMm: number, heightMm: number) => {
      const current = docRef.current;
      if (isRatTail143Document(current)) return;
      if (Math.abs(current.widthMm - widthMm) < 0.001 && Math.abs(current.heightMm - heightMm) < 0.001) {
        return;
      }
      const copy = stockSizePromptCopy(Boolean(current.bulk));
      Alert.alert(copy.title, copy.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Keep as-is', onPress: () => applyLabelSize(widthMm, heightMm, 'keep') },
        { text: 'Scale proportionally', onPress: () => applyLabelSize(widthMm, heightMm, 'scale') },
      ]);
    },
    [applyLabelSize],
  );

  const placeIngestedImageOnCanvas = useCallback(
    async (uri: string, width?: number, height?: number) => {
      setImageIngesting(true);
      try {
        const ingested = await ingestEditorImage({
          uri,
          width,
          height,
        });
        if (!mountedRef.current) return;
        const current = docRef.current;
        const content = isRatTailGeometry(current.mediaGeometry)
          ? ratTailBodyRectMm(current.mediaGeometry)
          : isJewelryDieCutDocument(current)
            ? { left: 0, top: 0, width: current.widthMm, height: Math.min(current.heightMm, JEWELRY_DIECUT.bodyHeightMm) }
            : undefined;
        const placed = defaults.tileImage
          ? {
              left: content?.left ?? 0,
              top: content?.top ?? 0,
              width: content?.width ?? current.widthMm,
              height: content?.height ?? current.heightMm,
            }
          : placeImportedImageMm({
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
          contentFit: defaults.tileImage ? 'fill' : 'contain',
          aspectRatioLocked: !defaults.tileImage,
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
    },
    [addElement, pxPerMM, defaults.tileImage],
  );

  const applyCroppedImageToElement = useCallback(
    async (elementId: string, uri: string, width?: number, height?: number) => {
      setImageIngesting(true);
      try {
        const ingested = await ingestEditorImage({ uri, width, height });
        if (!mountedRef.current) return;
        patchElement(elementId, {
          uri: ingested.previewUri,
          printUri: ingested.printUri,
          originalAspect: ingested.originalAspect,
          workingWidthPx: ingested.workingWidthPx,
          workingHeightPx: ingested.workingHeightPx,
        });
      } catch (error) {
        if (!mountedRef.current) return;
        Alert.alert(
          'Could not update photo',
          error instanceof Error ? error.message : 'The image could not be decoded.',
        );
      } finally {
        if (mountedRef.current) setImageIngesting(false);
      }
    },
    [patchElement],
  );

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

    router.push({
      pathname: '/image-crop',
      params: {
        uri: asset.uri,
        width: String(asset.width ?? 0),
        height: String(asset.height ?? 0),
        mode: 'import',
      },
    });
  }, []);

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
      const stored = useLabelStore.getState().getDocument(docRef.current.id);
      if (stored && stored.updatedAt > docRef.current.updatedAt && !dirtyRef.current) {
        let normalized = { ...stored, elements: normalizeDocumentElements(stored) };
        if (isJewelryDieCutDocument(normalized)) {
          normalized = canonicalizeJewelryDieCutDocument(normalized);
        } else if (isRatTail143Document(normalized)) {
          normalized = refitRatTail143Document(normalized);
        }
        setDoc(normalized);
        docRef.current = normalized;
      }

      const applyCapture = (kind: 'Text' | 'Barcode' | 'QRCode', data: string, encodeMode?: string) => {
        // A table cell only ever holds text, so a decoded scan lands as plain Manual
        // content there — never as a barcode/QR graphic, whatever the symbology was.
        const cellTarget = selectedTableCellRef.current;
        if (cellTarget) {
          const written = patchTableCellAt(cellTarget, { text: data, contentType: 'Manual' });
          console.log(
            `[table-cell] scan-write kind=${kind} target=${JSON.stringify(cellTarget)} textLen=${data.length} written=${written} as=Manual-text`,
          );
          if (written) {
            setTextTab('Content');
            setPanelOpen(true);
            return;
          }
        }
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
          const selectedId =
            selectedIds.length === 1 ? selectedIds[0] : null;
          const selected =
            selectedId != null
              ? docRef.current.elements.find((el) => el.id === selectedId)
              : undefined;
          if (selected?.type === 'text') {
            patchElement(selected.id, { text: data, contentType: 'Manual' });
            setTextTab('Content');
            setPanelOpen(true);
            return;
          }
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
        const tableCell = selectedTableCellRef.current;
        if (consumer && tableCell) {
          patchTableCellAt(tableCell, { columnNameContent: value, contentType: 'Data Source' });
        } else if (consumer && selectedIdsRef.current.length === 1) {
          patchElement(selectedIdsRef.current[0], { columnNameContent: value });
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
          setClipartTab('Regular');
          setPanelOpen(true);
          topBarSelectionVisibleSv.value = 1;
          bottomPanelVisibleSv.value = 1;
        } else {
          addElement('clipart', {
            clipartId: clipart.id,
          });
          setClipartTab('Regular');
          setPanelOpen(true);
          topBarSelectionVisibleSv.value = 1;
          bottomPanelVisibleSv.value = 1;
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
        const tableCell = selectedTableCellRef.current;
        const targetId = primaryIdRef.current;
        if (tableCell) {
          patchTableCellAt(tableCell, { fontFamily: fontName });
        } else if (targetId) {
          const el = docRef.current.elements.find((e) => e.id === targetId);
          if (el && 'fontFamily' in el) {
            patchElement(el.id, { fontFamily: fontName });
          }
        }
      }

      if (editorBridge.imageCropResult) {
        const crop = editorBridge.imageCropResult;
        editorBridge.imageCropResult = null;
        if (crop.mode === 'import') {
          void placeIngestedImageOnCanvas(crop.uri, crop.width, crop.height);
        } else if (crop.elementId) {
          void applyCroppedImageToElement(crop.elementId, crop.uri, crop.width, crop.height);
        }
      }
    }, [
      addElement,
      patchElement,
      patchTableCellAt,
      placeIngestedImageOnCanvas,
      applyCroppedImageToElement,
    ]),
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
    const tableCell = selectedTableCellRef.current;
    if (
      tableCell &&
      selectedElement?.type === 'table' &&
      selectedElement.id === tableCell.tableId
    ) {
      const table = ensureTableCells(selectedElement);
      const cell = table.cells![tableCell.row][tableCell.col];
      editorBridge.columnNameConsumer = 'text';
      router.push({
        pathname: '/column-name',
        params: { value: cell.columnNameContent ?? '' },
      });
      return;
    }
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
      case 'Clipart':
        setClipartTab('Regular');
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
      const el = addElement(ghost.type, overrides);
      if (el?.type === 'clipart') {
        clipartReplaceIdRef.current = el.id;
        setClipartTab('Regular');
        setPanelOpen(true);
        topBarSelectionVisibleSv.value = 1;
        bottomPanelVisibleSv.value = 1;
      } else {
        openAddedElementPanel(ghost.label);
      }
    },
    [addElement, openAddedElementPanel, publishSnapGuides, windowPointToArtboardMm],
  );

  const importExcelFromCanvas = async () => {
    try {
      const picked = await pickExcelWorkbook();
      if (!picked.ok) {
        if (picked.reason === 'cancelled') return;
        Alert.alert(
          picked.reason === 'invalid' ? 'Invalid File' : 'Empty File',
          picked.reason === 'invalid'
            ? 'Please choose an Excel workbook (.xlsx / .xls) or CSV file.'
            : 'No data rows were found in this file.',
        );
        return;
      }
      const entry = useDataStore.getState().addExcelFile({
        name: picked.name,
        uri: picked.uri,
        sheets: picked.sheets,
        activeSheetIndex: 0,
      });
      const size = clampLabelMm(docRef.current.widthMm, docRef.current.heightMm);
      router.push({
        pathname: '/excel-bulk-setup',
        params: {
          excelFileId: entry.id,
          widthMm: String(size.widthMm),
          heightMm: String(size.heightMm),
        },
      });
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    }
  };

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
      case 'Clipart': {
        const added = addElement('clipart');
        if (added) {
          clipartReplaceIdRef.current = added.id;
        }
        setClipartTab('Regular');
        setPanelOpen(true);
        topBarSelectionVisibleSv.value = 1;
        bottomPanelVisibleSv.value = 1;
        break;
      }
      case 'Border': {
        const existingBorder = docRef.current.elements.find((el) => el.type === 'border');
        if (existingBorder) {
          setBorderOptionsOpen(true);
        } else {
          router.push({ pathname: '/border-library', params: { from: 'edit' } });
        }
        break;
      }
      case 'Excel':
        void importExcelFromCanvas();
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
        router.push({ pathname: '/scan', params: { mode: 'labelClone' } });
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
    bottomPanelVisibleSv.value = withTiming(0, { duration: 160, easing: smoothEasing });
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
        onPress={toggleMultipleMode}
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
        hitSlop={12}
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
        onPress={() =>
          setLockOnSelection(!selectedElements.every((el) => el.lockMovement))
        }
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          selectedElements.every((el) => el.lockMovement) ? 'Unlock element' : 'Lock element'
        }>
        <AppIcon
          name={selectedElements.every((el) => el.lockMovement) ? 'lock.open' : 'lock'}
          tintColor="#FFFFFF"
          size={18}
        />
      </Pressable>
      <View style={styles.contextualBarDivider} />
      <Pressable
        style={({ pressed }) => [styles.contextualBarBtn, pressed && styles.pressed]}
        onPress={() => {
          if (selectedIds.length > 1) {
            setPanelOpen(true);
          } else if (primaryElement) {
            openPanelFor(primaryElement.id);
          }
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
                    gridSpacingMm={gridSpacingMm}
                    liveBounds={liveRulerBounds}
                    activeSelectedIdSv={activeSelectedIdSv}
                    topBarSelectionVisibleSv={topBarSelectionVisibleSv}
                    bottomPanelVisibleSv={bottomPanelVisibleSv}
                    multipleMode={multipleMode}
                    groupEligibleSv={groupEligibleSv}
                    groupAnchorIdSv={groupAnchorIdSv}
                    groupDeltaLeftMm={groupDeltaLeftSv}
                    groupDeltaTopMm={groupDeltaTopSv}
                    groupScaleXSv={groupScaleXSv}
                    groupScaleYSv={groupScaleYSv}
                    groupHandleSv={groupHandleSv}
                    groupScaleMinSv={groupScaleMinSv}
                    groupScaleMaxSv={groupScaleMaxSv}
                    safeModeSv={safeModeSv}
                    onGroupResizeHandleBegin={prepareGroupResizeHandle}
                    onSelect={handleSelect}
                    onDeselectAll={handleDeselectAll}
                    onOpenPanel={openPanelFor}
                    onEditText={beginTextEdit}
                    onQuickEdit={handleQuickEdit}
                    onTransformStart={handleTransformStart}
                    onTransformMove={handleTransformMove}
                    onTransformEnd={handleTransformEnd}
                    onQuickRotate={handleRotateElement}
                    onTableCellPress={handleTableCellPress}
                    onTableCellQuickEdit={handleTableCellQuickEdit}
                    selectedTableCell={selectedTableCell}
                    tableSelectionColor={selectionColor}
                    pointerToMm={windowPointToArtboardMm}
                    snapMoveMm={snapMoveMm}
                    snapGuides={snapGuides}
                  />
                </View>
              </View>
              {overlapBannerPositions.map((pos, index) => (
                <View
                  key={`overlap-${index}-${Math.round(pos.left)}-${Math.round(pos.top)}`}
                  pointerEvents="none"
                  style={[
                    styles.overlapBanner,
                    { top: pos.top, left: pos.left },
                  ]}>
                  <Text style={styles.overlapBannerText}>Elements overlap</Text>
                </View>
              ))}
            </Animated.View>
          </View>
        </View>
      </ZoomableEditPad>
    </Animated.View>
  );

  const renderPanel = (targetEl: LabelElement | null = displayElement, visible = true) => {
    if (!targetEl) return null;
    const focusRequest = visible ? contentFocusRequest : 0;
    switch (targetEl.type) {
      case 'text':
        return (
          <TextPropertyPanel
            activeTab={textTab}
            onTabChange={setTextTab}
            state={targetEl}
            patch={patchSelected}
            onColumnNamePress={handleColumnNamePress}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            contentFocusRequest={focusRequest}
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
      case 'table': {
        const table = ensureTableCells(targetEl);
        const activeCell =
          selectedTableCell &&
          selectedTableCell.tableId === targetEl.id &&
          selectedTableCell.row < table.rowCount &&
          selectedTableCell.col < table.columnCount
            ? selectedTableCell
            : null;
        if (activeCell) {
          const cell = table.cells![activeCell.row][activeCell.col];
          const cellState = tableCellToEditorState(cell, table, activeCell.row, activeCell.col);
          const cellHeightMm = table.rowHeights[activeCell.row] ?? table.height / table.rowCount;
          return (
            <TextPropertyPanel
              activeTab={textTab}
              onTabChange={setTextTab}
              state={cellState}
              patch={patchTableCellSelected}
              onColumnNamePress={handleColumnNamePress}
              labelWidthMm={labelBounds.widthMm}
              labelHeightMm={labelBounds.heightMm}
              elementHeightMm={cellHeightMm}
              contentFocusRequest={focusRequest}
              panelScope="tableCell"
            />
          );
        }
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
      }
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
            contentFocusRequest={focusRequest}
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
      case 'clipart':
        return (
          <ClipartPropertyPanel
            activeTab={clipartTab}
            onTabChange={setClipartTab}
            state={targetEl}
            patch={patchSelected}
            labelWidthMm={labelBounds.widthMm}
            labelHeightMm={labelBounds.heightMm}
            elementHeightMm={selectedElementHeightMm}
            onChooseClipart={() => {
              if (targetEl.id) {
                clipartReplaceIdRef.current = targetEl.id;
              }
              router.push({ pathname: '/clipart', params: { from: 'edit' } });
            }}
          />
        );
      default:
        return null;
    }
  };

  const activePanelContent = (
    <PositionLayerActionsProvider value={positionLayerActions}>
      {mountedPanelTypes.map((type) => {
        const visible = type === activePanelType;
        const seed =
          (visible ? displayElement : null) ??
          panelSeedRef.current.get(type) ??
          doc.elements.find((el) => el.type === type) ??
          null;
        return (
          <KeepAlivePanelSlot key={type} visible={visible}>
            {renderPanel(seed, visible)}
          </KeepAlivePanelSlot>
        );
      })}
    </PositionLayerActionsProvider>
  );

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
          <View style={styles.subToolbarRow}>
            <Pressable
              onPress={() => {
                if (isRatTail143Document(doc)) return;
                setDraftWidthMm(doc.widthMm);
                setDraftHeightMm(doc.heightMm);
                setSizeModalVisible(true);
              }}
              style={({ pressed }) => [styles.subToolbar, pressed && styles.pressed]}>
              <Text style={styles.dimText}>
                {doc.widthMm.toFixed(1)} × {doc.heightMm.toFixed(1)} mm · {doc.paperType}
                {doc.orientation ? ` · ${doc.orientation}°` : ''}
                {doc.ups ? ` · ${doc.ups.columns}ups` : ''}
                {doc.bulk ? ` · ${doc.bulk.rowCount} labels` : ''}
              </Text>
              <Text style={styles.sizeHint}>
                {isRatTail143Document(doc)
                  ? 'Prints 14.3 × 101.6 mm wrap stock · content locked on the paddle'
                  : doc.bulk
                    ? 'Tap to change size for every label in this Excel set'
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
              onPress={() => patchEditor({ safeMode: !editorSettings.safeMode })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={editorSettings.safeMode ? 'Safe mode' : 'Free mode'}
              style={({ pressed }) => [
                styles.splitMaxBtn,
                editorSettings.safeMode && styles.canvasChromeBtnActive,
                pressed && styles.pressed,
              ]}>
              <AppIcon
                name={editorSettings.safeMode ? 'checkmark.shield.fill' : 'lock.open'}
                tintColor={editorSettings.safeMode ? Palette.accent : Palette.muted}
                size={18}
              />
            </Pressable>

            <Pressable
              onPress={toggleEditorGrid}
              onLongPress={() => setGridSpacingPopoverVisible(true)}
              delayLongPress={280}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                editorSettings.editorGrid
                  ? 'Hide design grid'
                  : 'Show design grid'
              }
              accessibilityHint="Long press to change grid spacing."
              style={({ pressed }) => [
                styles.splitMaxBtn,
                editorSettings.editorGrid && styles.canvasChromeBtnActive,
                pressed && styles.pressed,
              ]}>
              <AppIcon
                name={editorSettings.editorGrid ? 'square.grid.2x2.fill' : 'square.grid.2x2'}
                tintColor={editorSettings.editorGrid ? Palette.accent : Palette.muted}
                size={18}
              />
            </Pressable>

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
          </View>

          <View style={styles.contextualToolbarHost}>
            <Animated.View style={[StyleSheet.absoluteFillObject, contextualToolbarAnimatedStyle]}>
              {renderContextualToolbar()}
            </Animated.View>
          </View>
        </View>

        {doc.bulk && doc.bulk.rowCount > 1 ? (
          <View style={styles.bulkNav}>
            <PdfPageNav
              index={doc.bulk.activeRowIndex}
              total={doc.bulk.rowCount}
              onPrev={() => goToBulkRow(doc.bulk!.activeRowIndex - 1)}
              onNext={() => goToBulkRow(doc.bulk!.activeRowIndex + 1)}
            />
            <View style={styles.bulkScopeSwitch}>
              <Pressable
                onPress={() => setBulkScopeApplyAll(false)}
                accessibilityRole="button"
                accessibilityState={{ selected: !bulkScopeApplyAll }}
                style={({ pressed }) => [
                  styles.bulkScopeSeg,
                  !bulkScopeApplyAll && styles.bulkScopeSegOn,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.bulkScopeSegText, !bulkScopeApplyAll && styles.bulkScopeSegTextOn]}>
                  This
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setBulkScopeApplyAll(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: bulkScopeApplyAll }}
                style={({ pressed }) => [
                  styles.bulkScopeSeg,
                  bulkScopeApplyAll && styles.bulkScopeSegOn,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.bulkScopeSegText, bulkScopeApplyAll && styles.bulkScopeSegTextOn]}>
                  All labels
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
                  {activePanelContent}
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
        onLabelSettings={() => {
          saveDocument(false);
          editorBridge.labelSettingsDoc = docRef.current;
          router.push({ pathname: '/label-settings', params: { labelId: docRef.current.id } });
        }}
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

      {borderOptionsOpen && (
        <BorderOptionsSheet
          lineWidth={
            doc.elements.find((el) => el.type === 'border')?.lineWidth ?? 0.55
          }
          onChangeWidth={(lineWidth) => {
            const border = docRef.current.elements.find((el) => el.type === 'border');
            if (border) patchElement(border.id, { lineWidth });
          }}
          onReplace={() => {
            setBorderOptionsOpen(false);
            router.push({ pathname: '/border-library', params: { from: 'edit' } });
          }}
          onRemove={() => {
            setElements((elements) => elements.filter((el) => el.type !== 'border'), true);
            setBorderOptionsOpen(false);
          }}
          onCancel={() => setBorderOptionsOpen(false)}
        />
      )}

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

      <GridSpacingPopover
        visible={gridSpacingPopoverVisible}
        spacingMm={gridSpacingMm}
        onClose={() => setGridSpacingPopoverVisible(false)}
        onSpacingChange={(mm) => patchEditor({ editorGridSpacingMm: mm })}
      />

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
              <View style={styles.sizeModalHeader}>
                <Text style={styles.modalHeading}>Customize Label Size</Text>
              </View>
              {sizeModalVisible ? (
                <LabelSizeEditor
                  widthMm={draftWidthMm}
                  heightMm={draftHeightMm}
                  onChange={(w, h) => {
                    setDraftWidthMm(w);
                    setDraftHeightMm(h);
                  }}
                />
              ) : null}
              <View style={styles.sizeModalFooter}>
                <Pressable
                  style={({ pressed }) => [styles.sizeModalFooterBtn, pressed && styles.pressed]}
                  onPress={() => {
                    const size = clampLabelMm(draftWidthMm, draftHeightMm);
                    setSizeModalVisible(false);
                    confirmStockSizeChange(size.widthMm, size.heightMm);
                  }}>
                  <Text style={styles.sizeModalDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
      <QuickValueModal
        visible={quickEditTarget !== null}
        initialValue={quickEditTarget?.value ?? ''}
        title={quickEditTarget ? getQuickEditTitle(quickEditTarget.type) : undefined}
        placeholder={quickEditTarget ? getQuickEditPlaceholder(quickEditTarget.type) : undefined}
        anchorRect={quickEditTarget?.anchorRect}
        onCancel={handleQuickEditCancel}
        onConfirm={handleQuickEditConfirm}
      />
    </View>
  );
}

function BorderOptionsSheet({
  lineWidth,
  onChangeWidth,
  onReplace,
  onRemove,
  onCancel,
}: {
  lineWidth: number;
  onChangeWidth: (next: number) => void;
  onReplace: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const trackWidth = useRef(1);
  const min = 0.1;
  const max = 1;
  const ratio = Math.min(1, Math.max(0, (lineWidth - min) / (max - min)));
  const setFromX = (x: number) => {
    const nextRatio = Math.min(1, Math.max(0, x / trackWidth.current));
    const next = Math.round((min + nextRatio * (max - min)) * 100) / 100;
    onChangeWidth(next);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.borderSheetBackdrop}>
        <View style={styles.borderSheetCard}>
          <Text style={styles.borderSheetTitle}>Border</Text>
          <View style={styles.borderSheetActions}>
            <Pressable style={styles.borderReplaceBtn} onPress={onReplace}>
              <Text style={styles.borderReplaceText}>Replace</Text>
            </Pressable>
            <Pressable style={styles.borderRemoveBtn} onPress={onRemove}>
              <Text style={styles.borderRemoveText}>Cancel The Border</Text>
            </Pressable>
          </View>
          <View style={styles.borderRangeLabels}>
            <Text style={styles.borderRangeText}>MIN 0.1</Text>
            <Text style={styles.borderRangeText}>MAX 1.0</Text>
          </View>
          <View
            style={styles.borderSliderHit}
            onLayout={(event) => {
              trackWidth.current = event.nativeEvent.layout.width || 1;
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(event) => setFromX(event.nativeEvent.locationX)}
            onResponderMove={(event) => setFromX(event.nativeEvent.locationX)}>
            <View style={styles.borderSliderTrack}>
              <View style={[styles.borderSliderFill, { width: `${ratio * 100}%` }]} />
            </View>
            <View style={[styles.borderSliderThumb, { left: `${ratio * 100}%` }]} />
          </View>
        </View>
        <Pressable style={styles.borderCancelBtn} onPress={onCancel}>
          <Text style={styles.borderCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
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
  overlapBanner: {
    position: 'absolute',
    zIndex: 40,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  overlapBannerText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
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
    height: 88,
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  contextualToolbarHost: {
    position: 'relative',
    width: '100%',
    height: 44,
    overflow: 'hidden',
    zIndex: 2,
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
  canvasChromeBtnActive: {
    backgroundColor: 'rgba(23, 166, 184, 0.15)',
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
  bulkNav: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 2,
    alignItems: 'center',
    gap: 6,
  },
  bulkScopeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#E6EBF0',
    borderRadius: 16,
    padding: 3,
  },
  bulkScopeSeg: {
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 13,
    alignItems: 'center',
  },
  bulkScopeSegOn: {
    backgroundColor: Palette.header,
  },
  bulkScopeSegText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
  },
  bulkScopeSegTextOn: {
    color: '#FFFFFF',
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
    paddingVertical: 24,
  },
  sizeModalCard: {
    maxWidth: 340,
    overflow: 'hidden',
  },
  sizeModalHeader: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D1D6',
  },
  sizeModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sizeModalFooterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sizeModalDoneText: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
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
  borderSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 8,
  },
  borderSheetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
  },
  borderSheetTitle: {
    textAlign: 'center',
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 14,
  },
  borderSheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  borderReplaceBtn: {
    flex: 1,
    backgroundColor: '#3EC6C9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  borderReplaceText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  borderRemoveBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E25B5B',
    paddingVertical: 12,
    alignItems: 'center',
  },
  borderRemoveText: {
    color: '#E25B5B',
    fontSize: 15,
    fontWeight: '600',
  },
  borderRangeLabels: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  borderRangeText: {
    fontSize: 12,
    color: '#9AA0A6',
  },
  borderSliderHit: {
    marginTop: 8,
    height: 28,
    justifyContent: 'center',
  },
  borderSliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7DDE3',
    overflow: 'hidden',
  },
  borderSliderFill: {
    height: 4,
    backgroundColor: '#3EC6C9',
  },
  borderSliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  borderCancelBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  borderCancelText: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
