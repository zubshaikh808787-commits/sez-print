type FastPngDecode = typeof import('fast-png').decode;
type FastPngEncode = typeof import('fast-png').encode;

let cachedDecode: FastPngDecode | null = null;
let cachedEncode: FastPngEncode | null = null;

function ensureFastPng(): { decode: FastPngDecode; encode: FastPngEncode } {
  if (cachedDecode && cachedEncode) {
    return { decode: cachedDecode, encode: cachedEncode };
  }

  const g = globalThis as { TextDecoder?: typeof TextDecoder };
  const Original = g.TextDecoder;
  let supportsLatin1 = false;
  if (Original) {
    try {
      new Original('latin1');
      supportsLatin1 = true;
    } catch {
      supportsLatin1 = false;
    }
  }

  if (Original && !supportsLatin1) {
    const LATIN1_LABELS = new Set([
      'latin1',
      'iso-8859-1',
      'iso8859-1',
      'l1',
      'ascii',
      'us-ascii',
      'windows-1252',
    ]);

    class Latin1CapableTextDecoder {
      private inner: TextDecoder | null = null;
      readonly encoding: string;
      readonly fatal = false;
      readonly ignoreBOM = false;

      constructor(label = 'utf-8', options?: TextDecoderOptions) {
        if (LATIN1_LABELS.has(String(label).toLowerCase().trim())) {
          this.encoding = 'iso-8859-1';
        } else {
          this.inner = new (Original as typeof TextDecoder)(label, options);
          this.encoding = this.inner.encoding;
        }
      }

      decode(input?: ArrayBufferView | ArrayBuffer): string {
        if (this.inner) return this.inner.decode(input as ArrayBuffer);
        if (input == null) return '';
        const bytes =
          input instanceof Uint8Array
            ? input
            : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input);
        let out = '';
        for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return out;
      }
    }

    g.TextDecoder = Latin1CapableTextDecoder as unknown as typeof TextDecoder;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('fast-png') as typeof import('fast-png');
      cachedDecode = mod.decode;
      cachedEncode = mod.encode;
    } finally {
      g.TextDecoder = Original;
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('fast-png') as typeof import('fast-png');
    cachedDecode = mod.decode;
    cachedEncode = mod.encode;
  }

  return { decode: cachedDecode!, encode: cachedEncode! };
}

export function decodePng(data: ArrayBufferView | ArrayBuffer) {
  return ensureFastPng().decode(data);
}

export function encodePng(png: Parameters<FastPngEncode>[0]) {
  return ensureFastPng().encode(png);
}
