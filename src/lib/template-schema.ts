import { isCableFlagPreviewType } from '@/constants/cable-flag-diecut';
import { isRatTail143PreviewType } from '@/constants/rat-tail-143';
import {
  cloneDocument,
  createLabelDocument,
  elementSizeMm,
  type LabelDocument,
  type LabelElement,
  type TemplateBackground,
} from '@/lib/label-document';
import { computeScale } from '@/lib/label-coordinate-system';
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

/** Templates whose die-cut is the shape layers — no rectangular paper fill. */
export function templateUsesDieCutBackground(previewType: string): boolean {
  return (
    previewType.startsWith('jew-') ||
    previewType.startsWith('cable-') ||
    isCableFlagPreviewType(previewType)
  );
}

/** Fill applied to the artboard surface — never a hardcoded editor default. */
export function canvasFillFromTemplate(background: TemplateBackground | undefined): string {
  if (!background || background.type === 'none') return 'transparent';
  if (background.type === 'color') return background.color;
  return 'transparent';
}

export function canvasFillFromDocument(doc: Pick<LabelDocument, 'background' | 'paperType' | 'templatePreviewType'>): string {
  if (templateUsesDieCutBackground(doc.templatePreviewType ?? '')) return 'transparent';
  if (!doc.background || doc.background.type === 'none') return 'transparent';
  if (doc.background.type === 'color') return doc.background.color;
  if (doc.background.type === 'image') return 'transparent';
  if (doc.paperType === 'Transparent') return 'transparent';
  return '#FFFFFF';
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
  return computeScale(
    { widthPx: deviceCanvasWidth, heightPx: deviceCanvasHeight },
    { widthMm: designWidth, heightMm: designHeight },
  );
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
  const lockContent = isRatTail143PreviewType(previewType);
  return layers.map((layer, index) => {
    const chrome = layer.needPrinting === false || layer.type === 'border';
    return {
      ...layer,
      id: `${previewType}__${index}`,
      zIndex: index,
      opacity: layer.opacity ?? 1,
      lockMovement: chrome || lockContent ? true : layer.lockMovement,
    };
  });
}

export type TemplateDocumentValidation = {
  ok: boolean;
  errors: string[];
};

const CANVAS_SLACK_MM = 0.4;

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Fail loud on NaN / empty canvas. Elements must sit on the millimetre pad. */
export function validateTemplateDocument(doc: LabelDocument): TemplateDocumentValidation {
  const errors: string[] = [];
  if (!isFinitePositive(doc.widthMm)) errors.push('widthMm must be a finite number > 0');
  if (!isFinitePositive(doc.heightMm)) errors.push('heightMm must be a finite number > 0');

  for (const el of doc.elements) {
    const id = el.id || el.type;
    if (!isFiniteNumber(el.left) || !isFiniteNumber(el.top)) {
      errors.push(`${id}: NaN origin`);
      continue;
    }
    const size = elementSizeMm(el);
    if (!isFiniteNumber(size.width) || !isFiniteNumber(size.height)) {
      errors.push(`${id}: NaN size`);
      continue;
    }
    if (size.width < 0 || size.height < 0) {
      errors.push(`${id}: negative size`);
    }
    if (el.left < -0.05 || el.top < -0.05) {
      errors.push(`${id}: origin outside canvas`);
    }
    if (isFinitePositive(doc.widthMm) && el.left + size.width > doc.widthMm + CANVAS_SLACK_MM) {
      errors.push(`${id}: extends past widthMm`);
    }
    if (isFinitePositive(doc.heightMm) && el.top + size.height > doc.heightMm + CANVAS_SLACK_MM) {
      errors.push(`${id}: extends past heightMm`);
    }
    if (el.type === 'barcode') {
      const content = (el.content ?? '').trim();
      if (!content) errors.push(`${id}: barcode content missing`);
    }
  }

  return { ok: errors.length === 0, errors };
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
  const next: LabelDocument = {
    ...document,
    elements: normalizeDocumentElements(document),
  };

  if (!isFinitePositive(next.widthMm) || !isFinitePositive(next.heightMm)) {
    throw new Error(
      `Invalid template "${definition.id}": canvas mm must be finite and > 0 (got ${next.widthMm}×${next.heightMm})`,
    );
  }
  const nanEl = next.elements.find((el) => {
    const size = elementSizeMm(el);
    return ![el.left, el.top, size.width, size.height].every(isFiniteNumber);
  });
  if (nanEl) {
    throw new Error(`Invalid template "${definition.id}": element ${nanEl.id} has NaN geometry`);
  }

  return next;
}

export function cloneTemplateDocument(doc: LabelDocument): LabelDocument {
  return cloneDocument(doc);
}
