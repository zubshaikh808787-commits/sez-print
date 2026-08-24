import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/label-document';

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected';

export type PrintHistoryEntry = {
  id: string;
  labelName: string;
  copies: number;
  printedAt: number;
  documentId?: string;
  source: 'label' | 'photo' | 'pdf' | 'scan' | 'excel';
};

type PrinterStoreState = {
  status: PrinterConnectionStatus;
  deviceId: string | null;
  deviceName: string | null;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
  history: PrintHistoryEntry[];
  setStatus: (status: PrinterConnectionStatus) => void;
  setConnectedDevice: (deviceId: string, deviceName: string) => void;
  clearConnection: () => void;
  addHistoryEntry: (entry: Omit<PrintHistoryEntry, 'id' | 'printedAt'>) => void;
  clearHistory: () => void;
};

export const usePrinterStore = create<PrinterStoreState>()(
  persist(
    (set) => ({
      status: 'disconnected',
      deviceId: null,
      deviceName: null,
      lastDeviceId: null,
      lastDeviceName: null,
      history: [],

      setStatus: (status) => set({ status }),

      setConnectedDevice: (deviceId, deviceName) =>
        set({
          status: 'connected',
          deviceId,
          deviceName,
          lastDeviceId: deviceId,
          lastDeviceName: deviceName,
        }),

      clearConnection: () => set({ status: 'disconnected', deviceId: null, deviceName: null }),

      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [
            { ...entry, id: generateId('print'), printedAt: Date.now() },
            ...state.history,
          ].slice(0, 200),
        })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'sez-print/printer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastDeviceId: state.lastDeviceId,
        lastDeviceName: state.lastDeviceName,
        history: state.history,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
);
