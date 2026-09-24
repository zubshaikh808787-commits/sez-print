import { create } from 'zustand';

import {
  DEFAULT_OUTPUT_SIZE,
  defaultWatermark,
  normalizeRotation,
  type OutputSize,
  type PageScope,
  type PdfCrop,
  type PdfEditSession,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';

type PdfEditState = {
  session: PdfEditSession | null;
  startSession: (init: {
    sourceUri: string;
    sourceName: string;
    pageCount: number;
    pageSizesPt: { w: number; h: number }[];
  }) => void;
  resetSession: () => void;
  setCurrentPage: (index: number) => void;
  setOutputSize: (size: OutputSize) => void;
  setCrop: (crop: PdfCrop | null) => void;
  setCropScope: (scope: PageScope) => void;
  setCropOrigin: (originNorm: { x: number; y: number }) => void;
  setCropRect: (originNorm: { x: number; y: number }, sizeNorm?: { w: number; h: number }) => void;
  setRotationForCurrent: (deg: number) => void;
  setSharpnessForCurrent: (value: number) => void;
  setWatermark: (watermark: PdfWatermark | null) => void;
  patchWatermark: (patch: Partial<PdfWatermark>) => void;
};

function emptyArrays(pageCount: number) {
  return {
    rotationByPage: Array.from({ length: pageCount }, () => 0),
    sharpnessByPage: Array.from({ length: pageCount }, () => 0),
  };
}

export const usePdfEditStore = create<PdfEditState>((set) => ({
  session: null,

  startSession: ({ sourceUri, sourceName, pageCount, pageSizesPt }) =>
    set({
      session: {
        sourceUri,
        sourceName,
        pageCount,
        pageSizesPt,
        currentPageIndex: 0,
        outputSize: { ...DEFAULT_OUTPUT_SIZE },
        crop: null,
        watermark: null,
        ...emptyArrays(pageCount),
      },
    }),

  resetSession: () => set({ session: null }),

  setCurrentPage: (index) =>
    set((s) => {
      if (!s.session) return s;
      const i = Math.min(s.session.pageCount - 1, Math.max(0, index));
      return { session: { ...s.session, currentPageIndex: i } };
    }),

  setOutputSize: (size) =>
    set((s) => {
      if (!s.session) return s;
      return { session: { ...s.session, outputSize: size, crop: null } };
    }),

  setCrop: (crop) =>
    set((s) => (s.session ? { session: { ...s.session, crop } } : s)),

  setCropScope: (scope) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope, originNorm: { x: 0.5, y: 0.5 } };
      return { session: { ...s.session, crop: { ...crop, scope } } };
    }),

  setCropOrigin: (originNorm) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope: { mode: 'this' as const }, originNorm };
      return { session: { ...s.session, crop: { ...crop, originNorm } } };
    }),

  setCropRect: (originNorm, sizeNorm) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope: { mode: 'this' as const }, originNorm };
      return { session: { ...s.session, crop: { ...crop, originNorm, sizeNorm } } };
    }),

  setRotationForCurrent: (deg) =>
    set((s) => {
      if (!s.session) return s;
      const rotationByPage = [...s.session.rotationByPage];
      rotationByPage[s.session.currentPageIndex] = normalizeRotation(deg);
      return { session: { ...s.session, rotationByPage } };
    }),

  setSharpnessForCurrent: (value) =>
    set((s) => {
      if (!s.session) return s;
      const sharpnessByPage = [...s.session.sharpnessByPage];
      sharpnessByPage[s.session.currentPageIndex] = Math.min(100, Math.max(0, value));
      return { session: { ...s.session, sharpnessByPage } };
    }),

  setWatermark: (watermark) =>
    set((s) => (s.session ? { session: { ...s.session, watermark } } : s)),

  patchWatermark: (patch) =>
    set((s) => {
      if (!s.session) return s;
      const base = s.session.watermark ?? defaultWatermark();
      return { session: { ...s.session, watermark: { ...base, ...patch } } };
    }),
}));

export { defaultWatermark };
