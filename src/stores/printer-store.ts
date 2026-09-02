import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/label-document';

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'printing';

export type PrinterTransport = 'bluetooth-spp' | 'bluetooth-ble' | 'wifi';

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
  transport: PrinterTransport | null;
  sdkId: 'td404' | 'generic' | null;
  /** Backend Wi‑Fi session id when transport === 'wifi' */
  backendPrinterId: string | null;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
  history: PrintHistoryEntry[];
  setStatus: (status: PrinterConnectionStatus) => void;
  setConnectedDevice: (
    deviceId: string,
    deviceName: string,
    meta?: {
      transport?: PrinterTransport;
      sdkId?: 'td404' | 'generic';
      backendPrinterId?: string | null;
    },
  ) => void;
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
      transport: null,
      sdkId: null,
      backendPrinterId: null,
      lastDeviceId: null,
      lastDeviceName: null,
      history: [],

      setStatus: (status) => set({ status }),

      setConnectedDevice: (deviceId, deviceName, meta) =>
        set({
          status: 'connected',
          deviceId,
          deviceName,
          transport: meta?.transport ?? null,
          sdkId: meta?.sdkId ?? null,
          backendPrinterId: meta?.backendPrinterId ?? null,
          lastDeviceId: deviceId,
          lastDeviceName: deviceName,
        }),

      clearConnection: () =>
        set({
          status: 'disconnected',
          deviceId: null,
          deviceName: null,
          transport: null,
          sdkId: null,
          backendPrinterId: null,
        }),

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
