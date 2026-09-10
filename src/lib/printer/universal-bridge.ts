/**
 * App bridge: universal engine + existing PrinterManager transport.
 * Not part of the SDK-free renderer package.
 */

import {
  createArtworkDocument,
  createPhysicalProofDocument,
  mediaFromSize,
  pageSizeDots,
  rectMmToDots,
  renderPrintDocument,
  validatePrintRequest,
  logPrintTrace,
  type GrayBitmap,
  type ImageFitMode,
  type MediaShapeKind,
  type RenderedPrintJob,
} from '@/printing';
import { createTd404Adapter, createTd404Capabilities } from '@/printing/adapters/td404/TD404Adapter';
import { defaultPrintQueue } from '@/printing/printer/PrintQueue';
import { encodeTscBitmapJob, inspectTsplJob } from '@/lib/printer/tsc';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { grayToPngBase64, type BitRaster } from '@/lib/printer/escpos';

export type ArtworkPrintInput = {
  widthMm: number;
  heightMm: number;
  gray: GrayBitmap;
  fit?: ImageFitMode;
  shape?: MediaShapeKind;
  dither?: boolean;
  threshold?: number;
  flipY?: boolean;
  copies?: number;
  gapMm?: number;
  mediaType?: 'gap' | 'bline' | 'continuous';
  density?: number | null;
  speed?: number | null;
  offsetXmm?: number;
  offsetYmm?: number;
};

function capabilitiesFromManager() {
  const manager = getPrinterManager();
  const profile = manager.getActivePrinterProfile();
  return createTd404Capabilities({
    printerId: profile.id,
    model: profile.name,
    dpi: manager.getPrintDpi(),
    maxWidthMm: profile.printheadWidthMm,
    transport: manager.usesTd404CommandSet ? 'bluetooth' : 'wifi',
  });
}

function adapterFromManager() {
  const manager = getPrinterManager();
  const capabilities = capabilitiesFromManager();
  return createTd404Adapter(capabilities, {
    encodeTspl: (job, options) => {
      const dpmX = capabilities.dotsPerMmX ?? capabilities.dpiX / 25.4;
      const dpmY = capabilities.dotsPerMmY ?? capabilities.dpiY / 25.4;
      const x = Math.max(0, Math.round((options.offsetXmm ?? 0) * dpmX));
      const y = Math.max(0, Math.round((options.offsetYmm ?? 0) * dpmY));
      const bits: BitRaster = {
        bytesPerRow: job.bitmap.bytesPerRow ?? Math.ceil(job.widthDots / 8),
        height: job.heightDots,
        data: job.bitmap.data,
      };
      return encodeTscBitmapJob(bits, {
        widthMm: job.widthMm,
        heightMm: job.heightMm,
        gapMm: options.gapMm ?? 3,
        copies: 1,
        density: options.density ?? 8,
        speed: options.speed ?? 6,
        media: options.mediaType ?? 'gap',
        x,
        y,
      });
    },
    send: (data) => manager.print(data),
    getStatus: async () => ({
      connected: manager.isConnected,
      ready: manager.isConnected,
    }),
    connect: async () => {
      await manager.ensureConnected();
    },
  });
}

export function renderArtworkToJob(input: ArtworkPrintInput): RenderedPrintJob {
  const capabilities = capabilitiesFromManager();
  const media = mediaFromSize(input.widthMm, input.heightMm, { shape: input.shape });
  const document = createArtworkDocument({
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    gray: input.gray,
    fit: input.fit ?? 'stretch',
    shape: input.shape,
    dither: input.dither,
  });
  const check = validatePrintRequest(document, media, capabilities);
  if (!check.ok) {
    throw new Error(check.errors.join(' '));
  }
  for (const warning of check.warnings) console.warn('[universal-print]', warning);

  logPrintTrace('RENDER_CONFIG', {
    userWidthMm: input.widthMm,
    userHeightMm: input.heightMm,
    documentWidthMm: document.widthMm,
    documentHeightMm: document.heightMm,
    sourceGrayW: input.gray.width,
    sourceGrayH: input.gray.height,
    dpiX: capabilities.dpiX,
    dpiY: capabilities.dpiY,
    dotsPerMmX: capabilities.dotsPerMmX ?? capabilities.dpiX / 25.4,
    dotsPerMmY: capabilities.dotsPerMmY ?? capabilities.dpiY / 25.4,
    printer: capabilities.model,
    adapter: capabilities.adapterId,
    fit: input.fit ?? 'stretch',
    flipY: Boolean(input.flipY),
  });

  const job = renderPrintDocument(document, media, {
    dpiX: capabilities.dpiX,
    dpiY: capabilities.dpiY,
    dotsPerMmX: capabilities.dotsPerMmX,
    dotsPerMmY: capabilities.dotsPerMmY,
    printableWidthMm: capabilities.printableWidthMm,
    printableHeightMm: capabilities.printableHeightMm ?? input.heightMm,
    colorMode: 'mono',
    rasterMode: '1bpp',
    threshold: input.threshold ?? 180,
    ditherPhotos: Boolean(input.dither),
    flipY: input.flipY,
  }, input.copies ?? 1);

  logPrintTrace('BITMAP', {
    widthDots: job.widthDots,
    heightDots: job.heightDots,
    bytesPerRow: job.bitmap.bytesPerRow ?? Math.ceil(job.widthDots / 8),
    byteCount: job.bitmap.data.length,
    pixelFormat: job.bitmap.pixelFormat,
    dpiX: job.dpiX,
    dpiY: job.dpiY,
  });

  return job;
}

export async function printArtworkJob(input: ArtworkPrintInput): Promise<RenderedPrintJob> {
  const manager = getPrinterManager();
  const job = renderArtworkToJob(input);

  if (manager.isJosh) {
    const pngBase64 = grayToPngBase64({
      width: input.gray.width,
      height: input.gray.height,
      gray: input.gray.gray,
    });
    await defaultPrintQueue.enqueue(async () => {
      await manager.printJoshPngLabelFast({
        pngBase64,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
        gapMm: input.gapMm,
        copies: input.copies ?? 1,
        density: input.density,
        speed: input.speed,
      });
    });
    return job;
  }

  const adapter = adapterFromManager();
  const bytes = await adapter.encode(job, {
    gapMm: input.gapMm,
    mediaType: input.mediaType,
    density: input.density,
    speed: input.speed,
    offsetXmm: input.offsetXmm,
    offsetYmm: input.offsetYmm,
  });
  const tspl = inspectTsplJob(bytes);
  logPrintTrace('TSPL_COMMAND', {
    size: tspl.sizeCommand,
    gap: tspl.gapCommand,
    direction: tspl.directionCommand,
    reference: tspl.referenceCommand,
    bitmap: tspl.bitmapCommand,
    bitmapWidthBytes: tspl.bitmapWidthBytes,
    bitmapHeightDots: tspl.bitmapHeightDots,
    payloadBytes: tspl.payloadBytes,
    rawByteLength: tspl.totalBytes,
  });
  await defaultPrintQueue.enqueue(async () => {
    const copies = Math.max(1, input.copies ?? 1);
    for (let i = 0; i < copies; i++) {
      await adapter.send(bytes);
    }
  });
  logPrintTrace('TRANSPORT', {
    copies: Math.max(1, input.copies ?? 1),
    rawByteLength: bytes.length,
  });
  return job;
}

export type PhysicalProofReport = {
  requestedWidthMm: number;
  requestedHeightMm: number;
  printerModel: string;
  dpiX: number;
  dpiY: number;
  dotsPerMmX: number;
  dotsPerMmY: number;
  expectedWidthDots: number;
  expectedHeightDots: number;
  actualWidthDots: number;
  actualHeightDots: number;
  bytesPerRow: number;
  bitmapByteCount: number;
  sizeCommand: string;
  bitmapCommand: string;
  rawByteLength: number;
  elementDots: Record<string, string>;
};

/**
 * Rasterize a millimetre proof pattern at the active printer DPI and send it.
 * Does not screenshot the UI.
 */
export async function printPhysicalProofJob(
  widthMm = 50,
  heightMm = 25,
): Promise<PhysicalProofReport> {
  const capabilities = capabilitiesFromManager();
  const adapter = adapterFromManager();
  const document = createPhysicalProofDocument(widthMm, heightMm);
  const media = mediaFromSize(widthMm, heightMm);
  const axis = {
    dpiX: capabilities.dpiX,
    dpiY: capabilities.dpiY,
    dotsPerMmX: capabilities.dotsPerMmX,
    dotsPerMmY: capabilities.dotsPerMmY,
  };
  const expected = pageSizeDots(widthMm, heightMm, axis);

  logPrintTrace('USER_SIZE', { widthMm, heightMm });
  logPrintTrace('DOCUMENT_SIZE', {
    widthMm: document.widthMm,
    heightMm: document.heightMm,
    elementCount: document.elements.length,
  });
  logPrintTrace('PRINT_DPI', {
    printer: capabilities.model,
    dpiX: axis.dpiX,
    dpiY: axis.dpiY,
    dotsPerMmX: axis.dotsPerMmX ?? axis.dpiX / 25.4,
    dotsPerMmY: axis.dotsPerMmY ?? axis.dpiY / 25.4,
  });
  logPrintTrace('CALCULATED_DOTS', {
    widthDots: expected.widthDots,
    heightDots: expected.heightDots,
  });

  const elementDots: Record<string, string> = {};
  for (const el of document.elements) {
    const box = rectMmToDots(el.xMm, el.yMm, el.widthMm, el.heightMm, axis);
    elementDots[el.id] =
      `mm ${el.xMm},${el.yMm} ${el.widthMm}×${el.heightMm} → dots ${box.x0},${box.y0} ${box.widthDots}×${box.heightDots}`;
    logPrintTrace('ELEMENT', {
      id: el.id,
      type: el.type,
      xMm: el.xMm,
      yMm: el.yMm,
      widthMm: el.widthMm,
      heightMm: el.heightMm,
      x0: box.x0,
      y0: box.y0,
      widthDots: box.widthDots,
      heightDots: box.heightDots,
    });
  }

  const check = validatePrintRequest(document, media, capabilities);
  if (!check.ok) throw new Error(check.errors.join(' '));

  const job = renderPrintDocument(document, media, {
    dpiX: capabilities.dpiX,
    dpiY: capabilities.dpiY,
    dotsPerMmX: capabilities.dotsPerMmX,
    dotsPerMmY: capabilities.dotsPerMmY,
    printableWidthMm: capabilities.printableWidthMm,
    printableHeightMm: capabilities.printableHeightMm ?? heightMm,
    colorMode: 'mono',
    rasterMode: '1bpp',
    threshold: 128,
    ditherPhotos: false,
    flipY: false,
  });

  const bytesPerRow = job.bitmap.bytesPerRow ?? Math.ceil(job.widthDots / 8);
  logPrintTrace('BITMAP', {
    widthDots: job.widthDots,
    heightDots: job.heightDots,
    bytesPerRow,
    byteCount: job.bitmap.data.length,
    pixelFormat: job.bitmap.pixelFormat,
  });

  const bytes = await adapter.encode(job, {
    gapMm: media.gapMm ?? 3,
    mediaType: 'gap',
    density: 8,
    speed: 6,
  });
  const tspl = inspectTsplJob(bytes);
  logPrintTrace('NATIVE_BRIDGE', {
    path: 'js-tspl-encode',
    arguments: `${job.widthMm}x${job.heightMm}mm ${job.widthDots}x${job.heightDots}dots`,
  });
  logPrintTrace('TSPL_COMMAND', {
    size: tspl.sizeCommand,
    gap: tspl.gapCommand,
    direction: tspl.directionCommand,
    reference: tspl.referenceCommand,
    bitmap: tspl.bitmapCommand,
    bitmapWidthBytes: tspl.bitmapWidthBytes,
    bitmapHeightDots: tspl.bitmapHeightDots,
    payloadBytes: tspl.payloadBytes,
    rawByteLength: tspl.totalBytes,
  });

  await defaultPrintQueue.enqueue(async () => {
    await adapter.send(bytes);
  });
  logPrintTrace('TRANSPORT', { rawByteLength: bytes.length, copies: 1 });

  return {
    requestedWidthMm: widthMm,
    requestedHeightMm: heightMm,
    printerModel: capabilities.model,
    dpiX: capabilities.dpiX,
    dpiY: capabilities.dpiY,
    dotsPerMmX: axis.dotsPerMmX ?? axis.dpiX / 25.4,
    dotsPerMmY: axis.dotsPerMmY ?? axis.dpiY / 25.4,
    expectedWidthDots: expected.widthDots,
    expectedHeightDots: expected.heightDots,
    actualWidthDots: job.widthDots,
    actualHeightDots: job.heightDots,
    bytesPerRow,
    bitmapByteCount: job.bitmap.data.length,
    sizeCommand: tspl.sizeCommand,
    bitmapCommand: tspl.bitmapCommand,
    rawByteLength: bytes.length,
    elementDots,
  };
}
