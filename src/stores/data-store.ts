import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/label-document';

export type ExcelSheet = {
  name: string;
  columns: string[];
  rows: string[][];
};

export type ImportedExcelFile = {
  id: string;
  name: string;
  uri: string;
  sheets: ExcelSheet[];
  activeSheetIndex: number;
  importedAt: number;
};

export type ImportedPdfFile = {
  id: string;
  name: string;
  uri: string;
  sizeBytes: number;
  importedAt: number;
};

export type RemoteDataLink = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
};

type DataStoreState = {
  excelFiles: ImportedExcelFile[];
  pdfFiles: ImportedPdfFile[];
  remoteLinks: RemoteDataLink[];
  activeExcelFileId: string | null;
  activeRowIndex: number;
  addExcelFile: (file: Omit<ImportedExcelFile, 'id' | 'importedAt'>) => ImportedExcelFile;
  removeExcelFile: (id: string) => void;
  setActiveExcelFile: (id: string | null) => void;
  setActiveSheetIndex: (fileId: string, sheetIndex: number) => void;
  setActiveRowIndex: (index: number) => void;
  addPdfFile: (file: Omit<ImportedPdfFile, 'id' | 'importedAt'>) => ImportedPdfFile;
  removePdfFile: (id: string) => void;
  addRemoteLink: (link: Omit<RemoteDataLink, 'id' | 'createdAt'>) => RemoteDataLink;
  removeRemoteLink: (id: string) => void;
};

export const useDataStore = create<DataStoreState>()(
  persist(
    (set) => ({
      excelFiles: [],
      pdfFiles: [],
      remoteLinks: [],
      activeExcelFileId: null,
      activeRowIndex: 0,

      addExcelFile: (file) => {
        const entry: ImportedExcelFile = { ...file, id: generateId('xls'), importedAt: Date.now() };
        set((state) => ({
          excelFiles: [entry, ...state.excelFiles.filter((f) => f.uri !== file.uri)],
          activeExcelFileId: entry.id,
          activeRowIndex: 0,
        }));
        return entry;
      },

      removeExcelFile: (id) =>
        set((state) => ({
          excelFiles: state.excelFiles.filter((f) => f.id !== id),
          activeExcelFileId: state.activeExcelFileId === id ? null : state.activeExcelFileId,
        })),

      setActiveExcelFile: (id) => set({ activeExcelFileId: id, activeRowIndex: 0 }),

      setActiveSheetIndex: (fileId, sheetIndex) =>
        set((state) => ({
          excelFiles: state.excelFiles.map((f) =>
            f.id === fileId ? { ...f, activeSheetIndex: sheetIndex } : f,
          ),
        })),

      setActiveRowIndex: (index) => set({ activeRowIndex: index }),

      addPdfFile: (file) => {
        const entry: ImportedPdfFile = { ...file, id: generateId('pdf'), importedAt: Date.now() };
        set((state) => ({
          pdfFiles: [entry, ...state.pdfFiles.filter((f) => f.uri !== file.uri)],
        }));
        return entry;
      },

      removePdfFile: (id) =>
        set((state) => ({ pdfFiles: state.pdfFiles.filter((f) => f.id !== id) })),

      addRemoteLink: (link) => {
        const entry: RemoteDataLink = {
          ...link,
          id: generateId('link'),
          createdAt: Date.now(),
        };
        set((state) => ({
          remoteLinks: [entry, ...state.remoteLinks.filter((l) => l.url !== link.url)],
        }));
        return entry;
      },

      removeRemoteLink: (id) =>
        set((state) => ({ remoteLinks: state.remoteLinks.filter((l) => l.id !== id) })),
    }),
    {
      name: 'sez-print/data-files',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
