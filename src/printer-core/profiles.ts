/**
 * printer-core / profiles
 *
 * Geometry lives in DATA, not in code.
 *
 * The DEV bridge hardcodes a 384-dot head, a 378-dot print zone and a 1.37 mm head
 * offset. Those numbers are specific to the DEV-7299 mechanism. Kept in code, every
 * new model needs an APK release; kept here, a profile refresh from the server is
 * enough.
 *
 * Rendering always happens at the PRINTER's dpi (203 dpi = 8 dots/mm), never the
 * phone's, and barcode module widths snap to whole dots or scan rates drop.
 */
import raw from './profiles.json';

export interface PrinterProfile {
  model: string;
  displayName: string;
  dpi: number;
  headWidthDots: number;
  /** Usable dots. Often a few short of the head — the DEV-7299 prints 378 of 384. */
  printableDots: number;
  headOffsetLeftMm: number;
  maxWidthMm: number;
  maxLabelHeightMm: number;
  /** Lowercase substrings matched against the Bluetooth name. */
  match: string[];
}

interface ProfileFile {
  version: number;
  updatedAt: string;
  defaults: Record<string, string>;
  models: Record<string, Omit<PrinterProfile, 'model'>>;
}

const bundled = raw as unknown as ProfileFile;

let active: ProfileFile = bundled;

/** Replace the table at runtime from your server. Falls back to bundled data on bad input. */
export function loadProfiles(next: unknown): boolean {
  const candidate = next as ProfileFile | undefined;
  if (!candidate || typeof candidate !== 'object' || !candidate.models) return false;
  if (typeof candidate.version !== 'number') return false;
  active = candidate;
  return true;
}

export function resetProfiles(): void {
  active = bundled;
}

export function profilesVersion(): { version: number; updatedAt: string } {
  return { version: active.version, updatedAt: active.updatedAt };
}

export function getProfile(model: string): PrinterProfile | undefined {
  const entry = active.models[model];
  return entry ? { ...entry, model } : undefined;
}

export function allProfiles(): PrinterProfile[] {
  return Object.entries(active.models).map(([model, entry]) => ({ ...entry, model }));
}

/** The profile a driver falls back to when the model string is unknown. */
export function defaultProfileFor(driverId: string): PrinterProfile | undefined {
  const model = active.defaults[driverId];
  return model ? getProfile(model) : undefined;
}

/**
 * Best-effort model identification from the Bluetooth name, with the driver's
 * default as the fallback. Longest match wins, so "td-404" beats "td-".
 */
export function resolveProfile(driverId: string, deviceName?: string | null): PrinterProfile | undefined {
  const name = (deviceName ?? '').toLowerCase().trim();
  if (name) {
    let best: { profile: PrinterProfile; score: number } | undefined;
    for (const profile of allProfiles()) {
      for (const token of profile.match) {
        if (token && name.includes(token) && (!best || token.length > best.score)) {
          best = { profile, score: token.length };
        }
      }
    }
    if (best) return best.profile;
  }
  return defaultProfileFor(driverId);
}

export function dotsPerMm(dpi: number): number {
  return dpi / 25.4;
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.round(mm * dotsPerMm(dpi));
}

export function dotsToMm(dots: number, dpi: number): number {
  return dots / dotsPerMm(dpi);
}

/**
 * Clamp a requested label to what the head can physically print, and report the
 * exact raster size to render at. Width is snapped to whole dots.
 */
export function fitToHead(
  profile: PrinterProfile,
  widthMm: number,
  heightMm: number,
): { widthMm: number; heightMm: number; widthDots: number; heightDots: number; clamped: boolean } {
  const maxWidthMm = Math.min(profile.maxWidthMm, dotsToMm(profile.printableDots, profile.dpi));
  const w = Math.min(widthMm, maxWidthMm);
  const h = Math.min(heightMm, profile.maxLabelHeightMm);
  return {
    widthMm: w,
    heightMm: h,
    widthDots: mmToDots(w, profile.dpi),
    heightDots: mmToDots(h, profile.dpi),
    clamped: w < widthMm || h < heightMm,
  };
}
