import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';

export async function loadPdfMetadata(uri: string): Promise<{
  pageCount: number;
  pageSizesPt: { w: number; h: number }[];
}> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(b64, { ignoreEncryption: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg)) {
      throw new Error('This PDF is encrypted or password-protected and cannot be opened.');
    }
    throw new Error('Could not read this PDF. The file may be invalid.');
  }
  const pageCount = doc.getPageCount();
  if (pageCount < 1) throw new Error('This PDF has no pages.');
  const pageSizesPt = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { w: width, h: height };
  });
  return { pageCount, pageSizesPt };
}

export async function copyPdfToCache(sourceUri: string, name: string): Promise<string> {
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) return sourceUri;
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.pdf$/i, '');
  const dest = `${root}pdf-editor/${Date.now()}_${safe}.pdf`;
  const dir = `${root}pdf-editor/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}
