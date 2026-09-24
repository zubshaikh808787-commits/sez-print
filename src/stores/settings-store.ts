import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AutoWrapping, QrErrorLevel, QrZoneSize } from '@/components/editor/types';
import { DEFAULT_CANVAS_SPLIT_RATIO } from '@/lib/editor/canvas-split';
import type { LabelOrientation, PaperType } from '@/lib/label-document';

export type ColorMode = 'Original' | 'B & W' | 'Halftone';

/** Selection outline swatches — Editor Settings → Color of The Selected Border. */
export const EDITOR_BORDER_SELECTION_COLORS = ['#111111', '#9CA3AF'] as const;

/** Selection outline swatches — Editor Settings → Color of The Selected Table Cell. */
export const EDITOR_TABLE_SELECTION_COLORS = ['#111111', '#D1D5DB'] as const;

export type EditorSettings = {
  showColumnName: boolean;
  highlightColumnName: boolean;
  pictureAdsorption: boolean;
  /** When true, elements released outside the label spring back in and overlaps warn. */
  safeMode: boolean;
  editorGrid: boolean;
  /** Design grid cell size in mm (editor-only overlay). */
  editorGridSpacingMm: number;
  /** Design grid line color (hex). */
  editorGridColor: string;
  /** One-time alert shown when the user first enables the design grid. */
  editorGridDisclaimerSeen: boolean;
  /** Extra D-pad under the canvas. Off by default — use Editor Settings to show it. */
  showNudgePad: boolean;
  /** Canvas share of the editor split column (0.35–0.89). */
  canvasSplitRatio: number;
  /** When true, the tools sheet is collapsed and the canvas uses the full column. */
  canvasSplitFullscreen: boolean;
  borderColorIndex: number;
  tableColorIndex: number;
};

export type DefaultPropertySettings = {
  labelWidth: number;
  labelHeight: number;
  orientation: LabelOrientation;
  paperType: PaperType;
  autoFitFont: boolean;
  autoFitSize: boolean;
  autoWrap: AutoWrapping;
  autoTextHeight: boolean;
  qrErrorLevel: QrErrorLevel;
  qrZoneSize: QrZoneSize;
  tileImage: boolean;
  colorMode: ColorMode;
  grayThreshold: number;
  barcodeEncodeMode: string;
};

export type PrintingSettings = {
  recordHistory: boolean;
  autoPages: boolean;
  returnPrevious: boolean;
  /**
   * Printer resolution override: 304 (12 dots/mm), 300, or 203 (8 dots/mm).
   * `null` means auto — resolve from the selected printer model's declared DPI,
   * which is the correct value for every supported model. Only set this for a
   * generic printer whose head differs from its model's default; a wrong value
   * scales every print (TSPL puts one bitmap dot on one head dot).
   */
  printerDpi: number | null;
  /** Printhead alignment: 'center' (standard thermal desktop) or 'left'. */
  printerAlignment: 'center' | 'left';
  /** Printhead physical width in mm (108mm for 4-inch printers). */
  printheadWidthMm: number;
  /** Last custom paper/page size entered in the print size selector (mm). */
  customPaperWidthMm: number;
  customPaperHeightMm: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  showColumnName: false,
  highlightColumnName: false,
  pictureAdsorption: true,
  safeMode: false,
  editorGrid: false,
  editorGridSpacingMm: 5,
  editorGridColor: '#000000',
  editorGridDisclaimerSeen: false,
  showNudgePad: false,
  canvasSplitRatio: DEFAULT_CANVAS_SPLIT_RATIO,
  canvasSplitFullscreen: false,
  borderColorIndex: 0,
  tableColorIndex: 0,
};

export const DEFAULT_PROPERTY_SETTINGS: DefaultPropertySettings = {
  labelWidth: 40,
  labelHeight: 30,
  orientation: 0,
  paperType: 'Label',
  autoFitFont: true,
  autoFitSize: true,
  autoWrap: 'Word',
  autoTextHeight: true,
  qrErrorLevel: 'L',
  qrZoneSize: '0',
  tileImage: false,
  colorMode: 'B & W',
  grayThreshold: 160,
  barcodeEncodeMode: 'CODE-128',
};

export const DEFAULT_PRINTING_SETTINGS: PrintingSettings = {
  recordHistory: true,
  autoPages: true,
  returnPrevious: false,
  printerDpi: null,
  printerAlignment: 'left',
  printheadWidthMm: 108,
  customPaperWidthMm: 210,
  customPaperHeightMm: 297,
};

type SettingsStoreState = {
  editor: EditorSettings;
  defaults: DefaultPropertySettings;
  printing: PrintingSettings;
  language: string;
  tutorialSeen: boolean;
  patchEditor: (updates: Partial<EditorSettings>) => void;
  restoreEditorDefaults: () => void;
  patchDefaults: (updates: Partial<DefaultPropertySettings>) => void;
  patchPrinting: (updates: Partial<PrintingSettings>) => void;
  setLanguage: (language: string) => void;
  setTutorialSeen: (seen: boolean) => void;
};

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      editor: DEFAULT_EDITOR_SETTINGS,
      defaults: DEFAULT_PROPERTY_SETTINGS,
      printing: DEFAULT_PRINTING_SETTINGS,
      language: 'en',
      tutorialSeen: false,

      patchEditor: (updates) => set((state) => ({ editor: { ...state.editor, ...updates } })),
      restoreEditorDefaults: () => set({ editor: DEFAULT_EDITOR_SETTINGS }),
      patchDefaults: (updates) =>
        set((state) => ({ defaults: { ...state.defaults, ...updates } })),
      patchPrinting: (updates) =>
        set((state) => ({ printing: { ...state.printing, ...updates } })),
      setLanguage: (language) => set({ language }),
      setTutorialSeen: (seen) => set({ tutorialSeen: seen }),
    }),
    {
      name: 'sez-print/settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
