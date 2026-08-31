import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cloneDocument, generateId, type LabelDocument } from '@/lib/label-document';

export type LabelGroup = {
  id: string;
  name: string;
};

export type CloudProfile = {
  email: string;
  name: string;
  signedInAt: number;
};

/** Local + uploaded templates, one entry per id, newest first. */
export function mergeSavedTemplates(
  documents: LabelDocument[],
  cloudTemplates: LabelDocument[],
): LabelDocument[] {
  const byId = new Map<string, LabelDocument>();
  for (const doc of cloudTemplates) byId.set(doc.id, doc);
  for (const doc of documents) {
    const prev = byId.get(doc.id);
    if (!prev || doc.updatedAt >= prev.updatedAt) byId.set(doc.id, doc);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

type LabelStoreState = {
  documents: LabelDocument[];
  groups: LabelGroup[];
  cloudProfile: CloudProfile | null;
  cloudTemplates: LabelDocument[];
  upsertDocument: (doc: LabelDocument) => void;
  deleteDocument: (id: string) => void;
  duplicateDocument: (id: string, newName: string) => LabelDocument | null;
  getDocument: (id: string) => LabelDocument | undefined;
  /** Copy a cloud-only template into `documents` so editor/print can load it by id. */
  ensureLocalDocument: (id: string) => LabelDocument | null;
  addGroup: (name: string) => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  setDocumentGroup: (docId: string, groupId: string | null) => void;
  signIn: (email: string, name: string) => void;
  signOut: () => void;
  uploadToCloud: (doc: LabelDocument) => void;
  deleteCloudTemplate: (id: string) => void;
};

export const useLabelStore = create<LabelStoreState>()(
  persist(
    (set, get) => ({
      documents: [],
      groups: [],
      cloudProfile: null,
      cloudTemplates: [],

      upsertDocument: (doc) =>
        set((state) => {
          const updated = { ...doc, updatedAt: Date.now() };
          const exists = state.documents.some((d) => d.id === doc.id);
          return {
            documents: exists
              ? state.documents.map((d) => (d.id === doc.id ? updated : d))
              : [updated, ...state.documents],
          };
        }),

      deleteDocument: (id) =>
        set((state) => ({ documents: state.documents.filter((d) => d.id !== id) })),

      duplicateDocument: (id, newName) => {
        const source = get().documents.find((d) => d.id === id);
        if (!source) return null;
        const copy = cloneDocument(source);
        copy.id = generateId('label');
        copy.name = newName;
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        set((state) => ({ documents: [copy, ...state.documents] }));
        return copy;
      },

      getDocument: (id) =>
        get().documents.find((d) => d.id === id) ??
        get().cloudTemplates.find((d) => d.id === id),

      ensureLocalDocument: (id) => {
        const local = get().documents.find((d) => d.id === id);
        if (local) return local;
        const cloud = get().cloudTemplates.find((d) => d.id === id);
        if (!cloud) return null;
        const copy = cloneDocument(cloud);
        copy.updatedAt = Date.now();
        set((state) => ({ documents: [copy, ...state.documents] }));
        return copy;
      },

      addGroup: (name) =>
        set((state) => ({ groups: [...state.groups, { id: generateId('group'), name }] })),

      renameGroup: (id, name) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g)),
        })),

      deleteGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          documents: state.documents.map((d) =>
            d.groupId === id ? { ...d, groupId: null } : d,
          ),
        })),

      setDocumentGroup: (docId, groupId) =>
        set((state) => ({
          documents: state.documents.map((d) => (d.id === docId ? { ...d, groupId } : d)),
        })),

      signIn: (email, name) =>
        set({ cloudProfile: { email, name, signedInAt: Date.now() } }),

      signOut: () => set({ cloudProfile: null }),

      uploadToCloud: (doc) =>
        set((state) => {
          const copy = cloneDocument(doc);
          copy.updatedAt = Date.now();
          const existsLocal = state.documents.some((d) => d.id === copy.id);
          const existsCloud = state.cloudTemplates.some((t) => t.id === copy.id);
          return {
            documents: existsLocal
              ? state.documents.map((d) => (d.id === copy.id ? { ...d, ...copy } : d))
              : [copy, ...state.documents],
            cloudTemplates: existsCloud
              ? state.cloudTemplates.map((t) => (t.id === copy.id ? copy : t))
              : [copy, ...state.cloudTemplates],
          };
        }),

      deleteCloudTemplate: (id) =>
        set((state) => ({
          cloudTemplates: state.cloudTemplates.filter((t) => t.id !== id),
        })),
    }),
    {
      name: 'sez-print/labels',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
