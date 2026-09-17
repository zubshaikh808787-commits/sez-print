import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/label-document';
import { type SeznikPrinterModelId } from '@/constants/printer-models';

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'printing';

export type PrinterTransport = 'bluetooth-spp' | 'bluetooth-ble' | 'wifi' | 'josh-lpapi' | 'tez-spp' | 'dev-spp' | 'labelx-spp';

export type PrintHistoryEntry = {
  id: string;
  labelName: string;
  copies: number;
  printedAt: number;
  documentId?: string;
  source: 'label' | 'photo' | 'pdf' | 'scan' | 'excel' | 'img-to-label';
};

export type PrintCalibrationEntry = {
  hOffsetMm: number;
  vOffsetMm: number;
};

type PrinterStoreState = {
  status: PrinterConnectionStatus;
  selectedPrinterModel: SeznikPrinterModelId;
  deviceId: string | null;
  deviceName: string | null;
  transport: PrinterTransport | null;
  sdkId: 'td404' | 'josh' | 'generic' | 'tez' | 'dev' | 'labelx' | null;
  /** Backend Wi‑Fi session id when transport === 'wifi' */
  backendPrinterId: string | null;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
  lastDeviceForModel: Partial<Record<SeznikPrinterModelId, { id: string; name: string }>>;
  history: PrintHistoryEntry[];
  devCommandSet: 'tspl' | 'escpos';
  /**
   * Horizontal/vertical print offset calibration, per physical printer unit
   * (keyed by deviceId, falling back to sdkId for printers that don't expose
   * one). A fixed mechanical offset — a print head or media guide that isn't
   * perfectly centered — is a real per-unit hardware trait, not a bug the
   * geometry math can "solve"; without persisting it, the H/V offset controls
   * reset to 0 every time the print screen reopens, so a real physical bias
   * looks like a random unfixed shift instead of a one-time calibration.
   */
  printCalibration: Record<string, PrintCalibrationEntry>;
  setStatus: (status: PrinterConnectionStatus) => void;
  setSelectedPrinterModel: (model: SeznikPrinterModelId) => void;
  setDevCommandSet: (cmd: 'tspl' | 'escpos') => void;
  setPrintCalibration: (key: string, entry: PrintCalibrationEntry) => void;
  setConnectedDevice: (
    deviceId: string,
    deviceName: string,
    meta?: {
      transport?: PrinterTransport;
      sdkId?: 'td404' | 'josh' | 'generic' | 'tez' | 'dev' | 'labelx';
      backendPrinterId?: string | null;
      model?: SeznikPrinterModelId;
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
      selectedPrinterModel: 'td404',
      deviceId: null,
      deviceName: null,
      transport: null,
      sdkId: null,
      backendPrinterId: null,
      lastDeviceId: null,
      lastDeviceName: null,
      lastDeviceForModel: {},
      history: [],
      devCommandSet: 'tspl',
      printCalibration: {},

      setStatus: (status) => set({ status }),
      setSelectedPrinterModel: (selectedPrinterModel) => set({ selectedPrinterModel }),
      setDevCommandSet: (devCommandSet) => set({ devCommandSet }),
      setPrintCalibration: (key, entry) =>
        set((state) => ({
          printCalibration: { ...state.printCalibration, [key]: entry },
        })),

      setConnectedDevice: (deviceId, deviceName, meta) =>
        set((state) => {
          const model = meta?.model ?? (meta?.sdkId as SeznikPrinterModelId) ?? state.selectedPrinterModel;
          return {
            status: 'connected',
            deviceId,
            deviceName,
            transport: meta?.transport ?? null,
            sdkId: meta?.sdkId ?? null,
            backendPrinterId: meta?.backendPrinterId ?? null,
            lastDeviceId: deviceId,
            lastDeviceName: deviceName,
            selectedPrinterModel: model,
            lastDeviceForModel: {
              ...state.lastDeviceForModel,
              [model]: { id: deviceId, name: deviceName },
            },
          };
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
        selectedPrinterModel: state.selectedPrinterModel,
        lastDeviceId: state.lastDeviceId,
        lastDeviceName: state.lastDeviceName,
        lastDeviceForModel: state.lastDeviceForModel,
        history: state.history,
        printCalibration: state.printCalibration,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
);
