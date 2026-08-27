import {
  cloneDocument,
  createLabelDocument,
  type LabelDocument,
  type LabelElement,
  type TemplateBackground,
} from '@/lib/label-document';
import { normalizeDocumentElements } from '@/lib/element-sizing';

export type { TemplateBackground } from '@/lib/label-document';

/**
 * Structured template schema (Canva/CapCut-style).
 *
 * Coordinates are in the template's design space (millimetres). The editor never
 * treats a thumbnail image as canvas content — only these layers are instantiated.
 */
export type TemplateDefinition = {
  id: string;
  name: string;
  category: string;
  /** Design-space width in mm. Layer x/width are relative to this. */
  designWidth: number;
  /** Design-space height in mm. Layer y/height are relative to this. */
  designHeight: number;
  background: TemplateBackground;
  layers: LabelElement[];
};

export function emptyBackground(): TemplateBackground {
  return { type: 'none' };
}

export function colorBackground(color: string): TemplateBackground {
  return { type: 'color', color };
}

/** Fill applied to the artboard surface — never a hardcoded editor default. */
export function canvasFillFromTemplate(background: TemplateBackground | undefined): string {
  if (!background || background.type === 'none') return 'transparent';
  if (background.type === 'color') return background.color;
  return 'transparent';
}

export function canvasFillFromDocument(doc: Pick<LabelDocument, 'background' | 'paperType'>): string {
  if (doc.background) return canvasFillFromTemplate(doc.background);
  return doc.paperType === 'Transparent' ? 'transparent' : '#FFFFFF';
}

/**
 * Uniform scale from design millimetres to the device artboard (contain, no stretch).
 * Apply this same factor to x, y, width, height, and font sizes at render time.
 * Stored layer JSON stays in design-space mm.
 */
export function templateScaleFactor(
  designWidth: number,
  designHeight: number,
  deviceCanvasWidth: number,
  deviceCanvasHeight: number,
): number {
  const w = Math.max(designWidth, 0.01);
  const h = Math.max(designHeight, 0.01);
  if (deviceCanvasWidth <= 0 || deviceCanvasHeight <= 0) return 0;
  return Math.min(deviceCanvasWidth / w, deviceCanvasHeight / h);
}

export function sortLayers(layers: LabelElement[]): LabelElement[] {
  return [...layers].sort((a, b) => {
    if (a.type === 'border' && b.type !== 'border') return -1;
    if (b.type === 'border' && a.type !== 'border') return 1;
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
}

/** Stamp stable ids / zIndex so preview and editor share one schema instance. */
export function freezeTemplateLayers(previewType: string, layers: LabelElement[]): LabelElement[] {
  return layers.map((layer, index) => ({
    ...layer,
    id: `${previewType}__${index}`,
    zIndex: index,
    opacity: layer.opacity ?? 1,
  }));
}

export function instantiateTemplate(definition: TemplateDefinition): LabelDocument {
  const layers = sortLayers(definition.layers).map((layer) => JSON.parse(JSON.stringify(layer)) as LabelElement);
  const created = createLabelDocument({
    name: definition.name,
    widthMm: definition.designWidth,
    heightMm: definition.designHeight,
    elements: layers,
  });
  const document: LabelDocument = {
    ...created,
    background: definition.background,
    templatePreviewType: definition.id,
    templateCategory: definition.category,
  };
  return {
    ...document,
    elements: normalizeDocumentElements(document),
  };
}

export function cloneTemplateDocument(doc: LabelDocument): LabelDocument {
  return cloneDocument(doc);
}

/** Templates whose die-cut is the shape layers — no rectangular paper fill. */
export function templateUsesDieCutBackground(previewType: string): boolean {
  return previewType.startsWith('jew-') || previewType.startsWith('circle-');
}
