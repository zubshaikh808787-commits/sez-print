import { buildCircleUpsPanelSeed } from '@/constants/industry-template-elements';
import {
  createUpsConfig,
  type LabelDocument,
  type LabelElement,
  type MediaShape,
} from '@/lib/label-document';

export function isTwoUpsCirclePreviewType(previewType: string | undefined | null): boolean {
  return previewType === 'two-ups-circle-30' || previewType === 'two-ups-circle-40';
}

export type TwoUpsCircleLayout = {
  columns: 2;
  panelWidthMm: number;
  panelHeightMm: number;
  columnSpacingMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  mediaShape: MediaShape;
};

export function twoUpsCircleLayout(
  previewType: string,
  sheetWidthMm: number,
  sheetHeightMm: number,
): TwoUpsCircleLayout {
  const diameter = previewType === 'two-ups-circle-40' ? 40 : 30;
  const panel = Math.min(diameter, sheetHeightMm);
  const columnSpacingMm = Math.max(0, Math.round((sheetWidthMm - panel * 2) * 100) / 100);
  return {
    columns: 2,
    panelWidthMm: panel,
    panelHeightMm: panel,
    columnSpacingMm,
    sheetWidthMm,
    sheetHeightMm,
    mediaShape: 'circle',
  };
}

function splitSheetElementsToPanels(
  elements: LabelElement[],
  layout: TwoUpsCircleLayout,
): LabelElement[][] | null {
  if (elements.length === 0) return null;
  const splitX = layout.panelWidthMm + layout.columnSpacingMm / 2;
  const panels: LabelElement[][] = [[], []];
  for (const el of elements) {
    const cx = el.left + el.width / 2;
    const col = cx < splitX ? 0 : 1;
    const copy = JSON.parse(JSON.stringify(el)) as LabelElement;
    if (col === 1) {
      copy.left = el.left - layout.panelWidthMm - layout.columnSpacingMm;
    }
    panels[col]!.push(copy);
  }
  if (panels[0]!.length === 0 && panels[1]!.length === 0) return null;
  return panels;
}

/**
 * Turn a flat Multi-UP circle catalog doc (62×30 strip) into panel-by-panel 2-ups
 * with circular die on each sticker — same model as rectangular 2-ups.
 */
export function structureTwoUpsCircleDocument(doc: LabelDocument): LabelDocument {
  const previewType = doc.templatePreviewType;
  if (!isTwoUpsCirclePreviewType(previewType)) return doc;
  if (doc.ups && doc.mediaShape === 'circle') return doc;

  const layout = twoUpsCircleLayout(previewType!, doc.widthMm, doc.heightMm);
  const split = splitSheetElementsToPanels(doc.elements, layout);
  const defaultSeed = buildCircleUpsPanelSeed(layout.panelWidthMm, layout.panelHeightMm);
  const ups = createUpsConfig({
    columns: 2,
    columnSpacingMm: layout.columnSpacingMm,
    batchEdit: false,
    seedElements: defaultSeed,
  });
  const panels =
    split ??
    ups.panels.map((panel, i) =>
      panel.length > 0 ? panel : i === 0 ? defaultSeed : buildCircleUpsPanelSeed(layout.panelWidthMm, layout.panelHeightMm, `Label ${i + 1}`),
    );

  return {
    ...doc,
    widthMm: layout.panelWidthMm,
    heightMm: layout.panelHeightMm,
    mediaShape: 'circle',
    elements: JSON.parse(JSON.stringify(panels[0] ?? defaultSeed)) as LabelElement[],
    ups: { ...ups, panels },
    templateCategory: doc.templateCategory ?? 'Multi-UP',
  };
}

