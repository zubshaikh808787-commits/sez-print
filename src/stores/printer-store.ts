import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/label-document';
import { effectiveHOffsetMm } from '@/lib/printer/side-liner';
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

/**
 * Bumped when leftover millimetre-chase H/V must be dropped.
 * v2: centered-border engine. Saved H=−1 / V=+1 from the old pipeline
 * un-centers a bitmap that is already 2 mm on every side (negative H shifts
 * ink left; +V REFERENCE moves ink down). Gap and side liner stay.
 */
export const PRINT_ORIGIN_VERSION = 2;

export type PrintCalibrationEntry = {
  /** Printer correction only. The roll's side-liner shift is added at print time. */
  hOffsetMm: number;
  vOffsetMm: number;
  /** Liner strip beside the label on the loaded roll. */
  sideLinerLeftMm?: number;
  sideLinerRightMm?: number;
  /** Liner gap between labels on the loaded roll. Unset until the user picks one. */
  gapMm?: number;
  originVersion?: number;
};

export type ResolvedPrintOffsets = {
  hOffsetMm: number;
  vOffsetMm: number;
  sideLinerLeftMm: number;
  sideLinerRightMm: number;
  gapMm: number | null;
};

function clampPrintOffsetMm(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-10, Math.min(10, value as number));
}

/** Drop leftover H/V from an older origin generation. Keep gap and liner. */
export function migratePrintCalibrationEntry(saved: PrintCalibrationEntry): PrintCalibrationEntry {
  const gapMm = saved.gapMm != null && Number.isFinite(saved.gapMm) ? saved.gapMm : undefined;
  const sideLinerLeftMm = saved.sideLinerLeftMm ?? 0;
  const sideLinerRightMm = saved.sideLinerRightMm ?? 0;
  if (saved.originVersion === PRINT_ORIGIN_VERSION) {
    return {
      ...saved,
      hOffsetMm: clampPrintOffsetMm(saved.hOffsetMm),
      vOffsetMm: clampPrintOffsetMm(saved.vOffsetMm),
      sideLinerLeftMm,
      sideLinerRightMm,
      originVersion: PRINT_ORIGIN_VERSION,
    };
  }
  return {
    ...saved,
    hOffsetMm: 0,
    vOffsetMm: 0,
    sideLinerLeftMm,
    sideLinerRightMm,
    gapMm,
    originVersion: PRINT_ORIGIN_VERSION,
  };
}

export function migratePrintCalibrationMap(
  map: Record<string, PrintCalibrationEntry> | undefined,
): Record<string, PrintCalibrationEntry> {
  if (!map) return {};
  const out: Record<string, PrintCalibrationEntry> = {};
  for (const [key, entry] of Object.entries(map)) {
    out[key] = migratePrintCalibrationEntry(entry);
  }
  return out;
}

/** Load saved roll/printer offsets. Stale originVersion H/V is always 0. */
export function resolvedPrintOffsets(saved?: PrintCalibrationEntry | null): ResolvedPrintOffsets {
  const sideLinerLeftMm = saved?.sideLinerLeftMm ?? 0;
  const sideLinerRightMm = saved?.sideLinerRightMm ?? 0;
  const gapMm = saved?.gapMm != null && Number.isFinite(saved.gapMm) ? saved.gapMm : null;
  if (!saved) {
    return { hOffsetMm: 0, vOffsetMm: 0, sideLinerLeftMm, sideLinerRightMm, gapMm };
  }
  const modern = saved.originVersion === PRINT_ORIGIN_VERSION;
  return {
    hOffsetMm: modern ? clampPrintOffsetMm(saved.hOffsetMm) : 0,
    vOffsetMm: modern ? clampPrintOffsetMm(saved.vOffsetMm) : 0,
    sideLinerLeftMm,
    sideLinerRightMm,
    gapMm,
  };
}

/** H/V to send with a job: printer correction plus the roll's side-liner shift. */
export function jobPrintOffsets(saved?: PrintCalibrationEntry | null): { hOffsetMm: number; vOffsetMm: number } {
  const r = resolvedPrintOffsets(saved);
  return {
    hOffsetMm: effectiveHOffsetMm(r.hOffsetMm, r.sideLinerLeftMm, r.sideLinerRightMm),
    vOffsetMm: r.vOffsetMm,
  };
}

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
  /** MAC → model pin. Overrides name heuristics on reconnect (addendum §5). */
  pinnedDriverByMac: Partial<Record<string, SeznikPrinterModelId>>;
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
  setPrintCalibration: (key: string, entry: Partial<PrintCalibrationEntry>) => void;
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
  pinDriverForMac: (mac: string, model: SeznikPrinterModelId, userPinned?: boolean) => void;
  addHistoryEntry: (entry: Omit<PrintHistoryEntry, 'id' | 'printedAt'>) => void;
  clearHistory: () => void;
};

/** Normalize Bluetooth MAC for stable pin keys (AA:BB:CC:DD:EE:FF). */
export function normalizePrinterMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return mac.trim().toUpperCase();
  return `${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}:${hex.slice(6, 8)}:${hex.slice(8, 10)}:${hex.slice(10, 12)}`;
}

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
      pinnedDriverByMac: {},
      history: [],
      devCommandSet: 'tspl',
      printCalibration: {},

      setStatus: (status) => set({ status }),
      setSelectedPrinterModel: (selectedPrinterModel) => set({ selectedPrinterModel }),
      setDevCommandSet: (devCommandSet) => set({ devCommandSet }),
      setPrintCalibration: (key, entry) =>
        set((state) => {
          const prev = state.printCalibration[key];
          const base =
            prev?.originVersion === PRINT_ORIGIN_VERSION ? prev : { ...prev, hOffsetMm: 0, vOffsetMm: 0 };
          return {
            printCalibration: {
              ...state.printCalibration,
              [key]: { ...base, ...entry, originVersion: PRINT_ORIGIN_VERSION },
            },
          };
        }),

      setConnectedDevice: (deviceId, deviceName, meta) =>
        set((state) => {
          const model = meta?.model ?? (meta?.sdkId as SeznikPrinterModelId) ?? state.selectedPrinterModel;
          const macKey = normalizePrinterMac(deviceId);
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
            pinnedDriverByMac: {
              ...state.pinnedDriverByMac,
              [macKey]: model,
            },
          };
        }),

      pinDriverForMac: (mac, model, userPinned = true) =>
        set((state) => ({
          pinnedDriverByMac: {
            ...state.pinnedDriverByMac,
            [normalizePrinterMac(mac)]: model,
          },
        })),

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
        pinnedDriverByMac: state.pinnedDriverByMac,
        history: state.history,
        printCalibration: state.printCalibration,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PrinterStoreState>;
        return {
          ...current,
          ...p,
          printCalibration: migratePrintCalibrationMap(p.printCalibration),
        };
      },
    },
  ),
);
