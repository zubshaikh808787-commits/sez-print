import {
  applyUpsBatchMirror,
  createUpsConfig,
  parseOrientation,
  type LabelDocument,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import { scaleDocumentToSize } from '@/lib/element-sizing';
import {
  CABLE_FLAG_DIECUT,
  CABLE_FLAG_PREVIEW_SINGLE,
  cableFlagPrintDocument,
  isCableFlagDieCutDocument,
} from '@/constants/cable-flag-diecut';

export type MirrorMode = 'Close' | 'Reverse' | 'Syntropy';

export type LabelSettings = {
  mirrorMode: MirrorMode;
  flagLabel: boolean;
  mirrorRowsCount: number;
  mirrorSpacingMm: number;
  mirrorRowNumber: number;
  gapLengthMm: number;
  printDarkness: number | null;
  printSpeed: number | null;
  hOffsetMm: number;
  vOffsetMm: number;
  flipHorizontally: boolean;
  antiColor: boolean;
  defaultDrawingColorIndex: number;
  dataSourceFileId: string | null;
};

export const LABEL_DRAWING_COLORS = [
  { id: 'white', color: '#FFFFFF', label: 'White' },
  { id: 'red', color: '#E53935', label: 'Red' },
  { id: 'green', color: '#43A047', label: 'Green' },
  { id: 'blue', color: '#1E88E5', label: 'Blue' },
  { id: 'yellow', color: '#FFEB3B', label: 'Yellow' },
  { id: 'gold', color: '#C9A227', label: 'Gold' },
  { id: 'gray', color: '#9E9E9E', label: 'Gray' },
  { id: 'black', color: '#111111', label: 'Black' },
  { id: 'teal', color: '#48C3C7', label: 'Teal' },
] as const;

export function defaultLabelSettings(): LabelSettings {
  return {
    mirrorMode: 'Close',
    flagLabel: false,
    mirrorRowsCount: 2,
    mirrorSpacingMm: 0,
    mirrorRowNumber: 1,
    gapLengthMm: 3,
    printDarkness: null,
    printSpeed: null,
    hOffsetMm: 0,
    vOffsetMm: 0,
    flipHorizontally: false,
    antiColor: false,
    defaultDrawingColorIndex: 1,
    dataSourceFileId: null,
  };
}

export function resolveLabelSettings(doc: LabelDocument): LabelSettings {
  return { ...defaultLabelSettings(), ...(doc.settings ?? {}) };
}

function applyFlagLabelGeometry(doc: LabelDocument, enabled: boolean): LabelDocument {
  if (!enabled) {
    if (!isCableFlagDieCutDocument(doc)) return doc;
    return {
      ...doc,
      mediaShape: 'rectangle',
      templatePreviewType: undefined,
      templateCategory: undefined,
    };
  }
  return cableFlagPrintDocument({
    ...doc,
    templateCategory: 'Cable Flag',
    templatePreviewType: CABLE_FLAG_PREVIEW_SINGLE,
  });
}

function applyMirrorMode(doc: LabelDocument, settings: LabelSettings): LabelDocument {
  if (settings.mirrorMode === 'Syntropy') {
    const columns = Math.max(2, Math.min(4, Math.round(settings.mirrorRowsCount)));
    const ups =
      doc.ups && doc.ups.columns === columns
        ? {
            ...doc.ups,
            batchEdit: true,
            columnSpacingMm: settings.mirrorSpacingMm,
            activeIndex: Math.max(0, Math.min(columns - 1, settings.mirrorRowNumber - 1)),
          }
        : createUpsConfig({
            columns,
            columnSpacingMm: settings.mirrorSpacingMm,
            batchEdit: true,
            seedElements: doc.elements,
          });
    let next: LabelDocument = { ...doc, ups };
    next = applyUpsBatchMirror(next);
    return next;
  }

  if (doc.ups?.batchEdit) {
    const panels = doc.ups.panels.map((panel, i) =>
      i === doc.ups!.activeIndex ? panel : [],
    );
    return {
      ...doc,
      ups: { ...doc.ups, batchEdit: false, panels },
    };
  }
  return doc;
}

export type LabelDocumentPatch = {
  name?: string;
  widthMm?: number;
  heightMm?: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  background?: LabelDocument['background'];
  elements?: LabelDocument['elements'];
  settings?: Partial<LabelSettings>;
};

/** Apply label-settings patches and keep derived fields (ups mirror, flag stock) in sync. */
export function patchLabelDocument(doc: LabelDocument, patch: LabelDocumentPatch): LabelDocument {
  let next: LabelDocument = {
    ...doc,
    ...patch,
    settings: patch.settings
      ? { ...resolveLabelSettings(doc), ...patch.settings }
      : resolveLabelSettings(doc),
    updatedAt: Date.now(),
  };

  if (
    patch.widthMm != null &&
    patch.heightMm != null &&
    (Math.abs(doc.widthMm - patch.widthMm) > 0.001 || Math.abs(doc.heightMm - patch.heightMm) > 0.001)
  ) {
    next = scaleDocumentToSize(next, patch.widthMm, patch.heightMm);
    next.settings = resolveLabelSettings(next);
    next.updatedAt = Date.now();
  }

  const settings = resolveLabelSettings(next);
  next = applyMirrorMode(next, settings);
  next = applyFlagLabelGeometry(next, settings.flagLabel);

  if (patch.settings?.defaultDrawingColorIndex !== undefined) {
    const idx = patch.settings.defaultDrawingColorIndex;
    next = {
      ...next,
      elements: next.elements.map((el) =>
        'drawingColorIndex' in el ? ({ ...el, drawingColorIndex: idx } as typeof el) : el,
      ),
    };
  }

  return { ...next, updatedAt: Date.now() };
}

export function formatDarknessValue(value: number | null): string {
  return value == null ? 'Auto' : String(value);
}

export function formatSpeedValue(value: number | null): string {
  return value == null ? 'Auto' : String(value);
}

export function backgroundSummary(doc: LabelDocument): string {
  const bg = doc.background;
  if (!bg || bg.type === 'none') return 'Not set';
  if (bg.type === 'color') return bg.color;
  if (bg.type === 'image') return 'Image';
  return 'Not set';
}

export function borderSummary(doc: LabelDocument): string {
  const border = doc.elements.find((el) => el.type === 'border');
  if (!border) return 'Not set';
  return border.borderStyle;
}
