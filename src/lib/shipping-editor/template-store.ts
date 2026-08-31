/**
 * Persistence store for custom shipping label templates and size presets.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  LabelDpi,
  ShippingTemplate,
  STARTER_SHIPPING_TEMPLATES,
  TEMPLATE_STANDARD_4X6,
} from '@/lib/shipping-editor/types';

const STORAGE_KEY = 'sez_custom_shipping_templates_v1';
const PRESET_KEY = 'sez_selected_shipping_size_v1';

type ShippingTemplateState = {
  customTemplates: ShippingTemplate[];
  selectedTemplateId: string;
  targetDpi: LabelDpi;
  loadSavedTemplates: () => Promise<void>;
  saveTemplate: (template: ShippingTemplate) => Promise<void>;
  deleteCustomTemplate: (templateId: string) => Promise<void>;
  setTargetDpi: (dpi: LabelDpi) => void;
  setSelectedTemplateId: (id: string) => void;
};

export const useShippingTemplateStore = create<ShippingTemplateState>((set, get) => ({
  customTemplates: [],
  selectedTemplateId: TEMPLATE_STANDARD_4X6.templateId,
  targetDpi: 203,

  loadSavedTemplates: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ShippingTemplate[];
        if (Array.isArray(parsed)) {
          set({ customTemplates: parsed });
        }
      }
      const rawDpi = await AsyncStorage.getItem(PRESET_KEY);
      if (rawDpi === '300' || rawDpi === '203') {
        set({ targetDpi: parseInt(rawDpi, 10) as LabelDpi });
      }
    } catch (e) {
      console.warn('[template-store] Failed to load custom templates:', e);
    }
  },

  saveTemplate: async (template: ShippingTemplate) => {
    try {
      const current = get().customTemplates;
      const index = current.findIndex((t) => t.templateId === template.templateId);
      let updated: ShippingTemplate[];
      if (index >= 0) {
        updated = current.map((t) => (t.templateId === template.templateId ? template : t));
      } else {
        updated = [...current, template];
      }
      set({ customTemplates: updated });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[template-store] Failed to save template:', e);
    }
  },

  deleteCustomTemplate: async (templateId: string) => {
    try {
      const updated = get().customTemplates.filter((t) => t.templateId !== templateId);
      set({ customTemplates: updated });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[template-store] Failed to delete template:', e);
    }
  },

  setTargetDpi: (dpi: LabelDpi) => {
    set({ targetDpi: dpi });
    AsyncStorage.setItem(PRESET_KEY, String(dpi)).catch(() => undefined);
  },

  setSelectedTemplateId: (id: string) => {
    set({ selectedTemplateId: id });
  },
}));
