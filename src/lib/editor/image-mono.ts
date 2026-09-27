export type EditorColorMode = 'Original' | 'B & W' | 'Halftone';

export const DEFAULT_EDITOR_COLOR_MODE: EditorColorMode = 'B & W';
export const DEFAULT_GRAY_THRESHOLD = 128;

/** Darker than the threshold prints/previews black; equal or lighter stays white. */
export function monoFromLuminance(luminance: number, threshold: number): 0 | 255 {
  const lum = Number.isFinite(luminance) ? luminance : 255;
  const t = Number.isFinite(threshold) ? threshold : DEFAULT_GRAY_THRESHOLD;
  return lum < t ? 0 : 255;
}

export function resolveEditorColorMode(mode?: EditorColorMode | string): EditorColorMode {
  if (mode === 'Original' || mode === 'Halftone') return mode;
  return 'B & W';
}

export function looksLikeImageUri(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return (
    /^(file:|content:|https?:|data:image|ph:\/\/|asset:|assets-library:)/i.test(v) ||
    /\.(png|jpe?g|webp|gif|bmp|heic)(\?|$)/i.test(v)
  );
}

export const MONO_IMAGE_SKSL = `
uniform shader image;
uniform float threshold;
uniform float mode;

half4 main(float2 xy) {
  half4 c = image.eval(xy);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float t = threshold / 255.0;
  float v;
  if (mode < 1.5) {
    v = lum < t ? 0.0 : 1.0;
  } else {
    int ix = int(mod(floor(xy.x), 4.0));
    int iy = int(mod(floor(xy.y), 4.0));
    int idx = iy * 4 + ix;
    float b = 0.0;
    if (idx == 0) b = 0.0;
    else if (idx == 1) b = 8.0;
    else if (idx == 2) b = 2.0;
    else if (idx == 3) b = 10.0;
    else if (idx == 4) b = 12.0;
    else if (idx == 5) b = 4.0;
    else if (idx == 6) b = 14.0;
    else if (idx == 7) b = 6.0;
    else if (idx == 8) b = 3.0;
    else if (idx == 9) b = 11.0;
    else if (idx == 10) b = 1.0;
    else if (idx == 11) b = 9.0;
    else if (idx == 12) b = 15.0;
    else if (idx == 13) b = 7.0;
    else if (idx == 14) b = 13.0;
    else b = 5.0;
    float bias = ((b + 0.5) / 16.0 - 0.5) / 4.0;
    v = lum + bias < t ? 0.0 : 1.0;
  }
  return half4(v, v, v, c.a);
}
`;

export function binarizeLuminanceBuffer(
  gray: Uint8Array,
  threshold = DEFAULT_GRAY_THRESHOLD,
): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = monoFromLuminance(gray[i], threshold);
  }
  return out;
}

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** In-place RGBA8888 threshold / ordered dither. Alpha is preserved. */
export function applyMonoToRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  mode: EditorColorMode,
): void {
  if (mode === 'Original') return;
  const t = Number.isFinite(threshold) ? threshold : DEFAULT_GRAY_THRESHOLD;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
      let v: 0 | 255;
      if (mode === 'Halftone') {
        const bias = ((BAYER_4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * 64;
        v = lum + bias < t ? 0 : 255;
      } else {
        v = monoFromLuminance(lum, t);
      }
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
    }
  }
}

