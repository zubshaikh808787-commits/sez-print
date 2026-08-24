import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AutoWrapping, QrErrorLevel, QrZoneSize } from '@/components/editor/types';
import type { LabelOrientation, PaperType } from '@/lib/label-document';

export type ColorMode = 'Original' | 'B & W' | 'Halftone';

export type EditorSettings = {
  showColumnName: boolean;
  highlightColumnName: boolean;
  pictureAdsorption: boolean;
  editorGrid: boolean;
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
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  showColumnName: false,
  highlightColumnName: false,
  pictureAdsorption: true,
  editorGrid: false,
  borderColorIndex: 1,
  tableColorIndex: 1,
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
  colorMode: 'Halftone',
  grayThreshold: 128,
  barcodeEncodeMode: 'CODE-128',
};

export const DEFAULT_PRINTING_SETTINGS: PrintingSettings = {
  recordHistory: true,
  autoPages: true,
  returnPrevious: false,
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
