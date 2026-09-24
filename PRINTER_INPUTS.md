# Printer Inputs

How label canvas elements become printer jobs, what each SDK accepts, and how accurate the result can be.

**Related:** `SDKS.md` (SDK capabilities), `PRINTER_BRIDGES.md` (native bridge code), `PRINT_CONTROL.md` (cancel/pause/buffer).

---

## Short answer: can we define width and height for every element on every printer?

**On the canvas — yes.** Every element has `left`, `top`, `width`, and `height` in **millimetres**. The label itself has `widthMm` and `heightMm`.

**To the printer — not as separate elements.** Production printing does **not** send text/barcode/shape objects to the SDK. It:

1. Renders the whole label (all elements) on screen at printer-dot resolution.
2. Captures one **PNG bitmap** (ViewShot).
3. Sends that bitmap plus **label-level** options to the native SDK.

So element sizes are preserved **inside the bitmap** (each mm → N dots at the job DPI). Whether the **physical label** ends up at the requested mm depends on the printer (see per-printer tables below). **Label X is the outlier:** native code ignores `heightMm` and derives length from bitmap aspect ratio + gap sensor.

---

## Canvas element format (shared, all printers)

Source: `src/lib/label-document.ts`, `src/components/editor/types.ts`.

```ts
// Label stock
type LabelDocument = {
  widthMm: number;      // physical label width
  heightMm: number;     // physical label height
  orientation: 0 | 90 | 180 | 270;
  paperType: 'Receipt' | 'Label' | 'Cardstock' | 'Transparent' | 'Black mark';
  elements: LabelElement[];
};

// Every printable element (examples)
type TextElement = {
  type: 'text';
  left: number;    // mm from label left edge
  top: number;     // mm from label top edge
  width: number;   // mm
  height: number;  // mm
  text: string;
  fontSize: number;
  // …
};

type BarcodeElement = {
  type: 'barcode';
  left: number; top: number; width: number; height: number;
  symbology: string;
  value: string;
};

// Also: qrcode, line, shape, table, image, clipart, border, signature, …
```

**Units:** millimetres only on the document. Never screen pixels, never zoom-dependent values.

**Example — 50 × 30 mm label with one text line and one barcode:**

```json
{
  "widthMm": 50,
  "heightMm": 30,
  "orientation": 0,
  "elements": [
    {
      "type": "text",
      "left": 5,
      "top": 4,
      "width": 40,
      "height": 8,
      "text": "SKU-12345"
    },
    {
      "type": "barcode",
      "left": 10,
      "top": 14,
      "width": 30,
      "height": 12,
      "symbology": "code128",
      "value": "SKU-12345"
    }
  ]
}
```

---

## Production pipeline (editor → printer)

```
LabelDocument (mm elements)
    ↓  LabelPreview / Skia renders at captureDotsW × captureDotsH px
ViewShot → PNG base64   (1 px = 1 printer dot at job DPI)
    ↓  rotatePngBase64(orientation)  [all SDKs except Label X rat-tail path]
PrinterManager.print*PngLabelFast()
    ↓  per-printer native module
Hardware
```

| Step | File | What happens |
|------|------|--------------|
| Capture size | `printCaptureLayout()` in `src/lib/label-geometry.ts` | `widthPx = round(widthMm × dotsPerMm(dpi))` |
| Orchestration | `src/app/print.tsx` | ViewShot + route to correct SDK |
| Dot math | `src/lib/printer/print-spec.ts` | `dotsPerMm`: 203→8, 304→12 |

**Capture rule:** `pixelRatio: 1` so a 50 mm-wide label at 203 DPI captures at **400 px** wide (50 × 8), not the phone screen density.

**Alternate path (not main editor):** `src/printing/canvas-export.ts` can emit **TSPL vector** commands (`TEXT`, `BARCODE`, `BOX`, …) for phase demos. Production `print.tsx` uses the **bitmap** path only.

---

## Dot pitch and baseline accuracy

Thermal printers are **discrete dot** devices. You cannot place ink between dots.

| DPI | dots/mm | dot pitch | ±½ dot (best-case placement) |
|-----|---------|-----------|--------------------------------|
| **203** | 8 | **0.125 mm** | ±0.0625 mm |
| **304** | 12 | **0.083 mm** | ±0.042 mm |

**Baseline accuracy for a feature of size S mm** (quantization only, no other bugs):

```
accuracy% ≈ (1 − 0.0625 / S) × 100   @ 203 DPI
accuracy% ≈ (1 − 0.042  / S) × 100   @ 304 DPI
```

| Feature size | 203 DPI baseline | 304 DPI baseline |
|--------------|------------------|------------------|
| 1 mm line | ~94% | ~96% |
| 5 mm box | ~99% | ~99% |
| 10 mm barcode | ~99.4% | ~99.6% |
| 50 mm label width | ~99.9% | ~99.9% |

These are **theoretical floors**. Real jobs add systematic errors below. Percentages marked **needs hardware** are code-level estimates, not caliper-measured.

---

## Per-printer input reference

### 1. SEZNIK TEJAS / RUDRA (TD-404)

| | |
|---|---|
| **Bluetooth names** | TEJAS, RUDRA, TD404, TD-404, SEZNIK, 4BARCODE, POSTEK, TSC, GAINSCHA |
| **Driver** | `modules/td404-printer` → **TSPL** (`SIZE`, `GAP`, `BITMAP`, `PRINT`) |
| **Default DPI** | **304** (12 dots/mm); 203 supported |
| **Label width** | ✅ `widthMm` → `SIZE` + bitmap scale |
| **Label height** | ✅ `heightMm` → `SIZE` + bitmap scale |
| **Element width/height** | ✅ Via PNG (mm → dots in capture) |
| **Transport** | Bluetooth SPP, BLE, WiFi :9100 |

**Native input (`printPngLabel`):**

```ts
{
  pngBase64: string;      // required
  widthMm: number;        // required — e.g. 50.80
  heightMm: number;       // required — e.g. 30.00
  gapMm?: number;         // default 2
  density?: number;       // 0–15, default 10
  speed?: number;         // 1–6, default 3
  dpi?: number;           // default 304
  threshold?: number;     // default 160
  dither?: boolean;       // default false
  copies?: number;
  media?: 'gap' | 'bline' | 'continuous';
}
```

**Brief example — 50 × 30 mm label:**

```
Canvas: 50×30 mm, text at (5,4) size 40×8 mm
Capture: 600×360 px @ 304 DPI  (50×12 by 30×12)
Native TSPL:
  SIZE 50.00 mm,30.00 mm
  GAP 2.00 mm,0 mm
  BITMAP 0,0,75,360,<1bpp data>   ← width packed to multiple of 8 (600→600)
  PRINT 1
```

**Accuracy factors**

| Factor | Effect on accuracy |
|--------|-------------------|
| Dot quantization | ±0.042 mm @ 304 DPI (baseline above) |
| BITMAP width pack-down | Up to **7 dots cropped** (~0.58 mm @ 304) on right edge if width not multiple of 8 |
| `DIRECTION` | Native uses `1`; JS TSPL fallback uses `0` — possible mirror vs preview |
| Gap sensor feed | Label length ±1–2 mm **UNVERIFIED (needs hardware)** |
| Binarization | Hard threshold → edges ±1 dot; dither → softer solids |

**Typical relevance (50 × 30 mm jewellery label, no dither):**

| Dimension | Estimated accuracy |
|-----------|-------------------|
| 10 mm barcode module | **~99%** (quantization + edge threshold) |
| 50 mm label width | **~99%** (pack-down crop up to 0.58 mm on some widths) |
| 30 mm label height | **~95–99%** (TSPL height good; gap feed unverified) |

---

### 2. SEZNIK JOSH

| | |
|---|---|
| **Bluetooth names** | JOSH, D110, D11, B21, B1, B3S, JC, NIIMBOT, LPAPI |
| **Driver** | `modules/josh-printer` → **DothanTech LPAPI** (`printBitmap` / `startJob`) |
| **Default DPI** | **203** (8 dots/mm) |
| **Label width** | ✅ `widthMm` → `startJob(w, h)` |
| **Label height** | ✅ `heightMm` |
| **Element width/height** | ✅ Via PNG; **contain-fit** if aspect mismatches |
| **Transport** | Bluetooth (LPAPI) |

**Native input (`printJoshPngLabel`):**

```ts
{
  pngBase64: string;
  widthMm: number;        // required
  heightMm: number;     // required
  dpi?: number;         // default 203 — must not leak 304 from TD-404 profile
  copies?: number;
  density?: number;     // -1 = SDK auto
  speed?: number;       // -1 = SDK auto
  gapType?: number;     // 2 = gap label
  gapLength?: number;   // mm
  hOffsetMm?: number;
  vOffsetMm?: number;   // baked into white page bitmap
  alignment?: 'left' | 'center';
}
```

**Brief example:**

```
Canvas: 50×30 mm
Capture: 400×240 px @ 203 DPI
Native: startJob(50.0, 30.0) → containFit bitmap onto 400×240 → printBitmap
```

**Accuracy factors**

| Factor | Effect |
|--------|--------|
| Dot quantization | ±0.0625 mm @ 203 DPI |
| Contain-fit | If PNG aspect ≠ label aspect, content **shrinks** with margins — effective size **< 100%** |
| Wrong DPI (300 vs 203) | Would print at **~67.7%** scale — guarded in app |
| Gap sensor | Hardware optical gap — feed alignment **UNVERIFIED** |
| LPAPI auto-center | Offsets baked into bitmap to avoid double-shift |

**Typical relevance (50 × 30 mm, aspect matched):**

| Dimension | Estimated accuracy |
|-----------|-------------------|
| 10 mm feature | **~99%** |
| Full label | **~98–99%** (contain-fit + gap) |

---

### 3. SEZNIK DEV

| | |
|---|---|
| **Bluetooth names** | DEV, SEZNIK DEV, POS-58, MTP, RPP, MPT |
| **Driver** | `modules/dev-printer` → **AutoReplyPrint** TSPL or ESC/POS |
| **Default DPI** | **203** (8 dots/mm) |
| **Label width** | ✅ TSPL: `widthMm`; ⚠️ **94.5% bitmap scale** on 50 mm stock (378-dot cap) |
| **Label height** | ✅ TSPL: `heightMm`; ❌ ESC/POS: **ignored** — height from bitmap aspect |
| **Element width/height** | ✅ Via PNG (TSPL path) |
| **Transport** | Bluetooth SPP |

**Native input (`printDevPngLabel`):**

```ts
{
  pngBase64: string;
  widthMm?: number;       // default 50
  heightMm?: number;      // default 30
  commandSet?: 'tspl' | 'escpos';  // default 'tspl' — use TSPL for die-cut labels
  gapMm?: number;         // rounded to whole mm in TSPL GAP command
  density?: number;       // default 14
  threshold?: number;     // default 160
  dither?: boolean;
  hOffsetMm?: number;
  vOffsetMm?: number;
  copies?: number;
}
```

**Brief example (TSPL — production default):**

```
Canvas: 50×30 mm design
TSPL SIZE 50.00 mm,30.00 mm
Bitmap scaled to 378×227 dots (not 400×240) because printhead cap = 378 dots (47.25 mm)
→ printed artwork width ≈ 47.25 mm while SIZE still says 50 mm
```

**Accuracy factors**

| Factor | Effect |
|--------|--------|
| **378-dot width cap** | **94.5% uniform scale** on 50 mm labels (378/400) — largest systematic error |
| ESC/POS mode | Ignores `heightMm`; wrong for die-cut labels |
| GAP rounding | `round(gapMm)` — fractional gaps lost |
| Dot quantization | ±0.0625 mm @ 203 DPI |

**Typical relevance (50 × 30 mm die-cut, TSPL):**

| Dimension | Estimated accuracy |
|-----------|-------------------|
| 10 mm barcode | **~94%** (inherits 94.5% scale — may fail scan) |
| 50 mm requested width | **~94.5% printed** (artwork, not SIZE command) |
| Label height | **~94.5%** (both axes scaled) |

---

### 4. SEZNIK TEZ / SHAKTI

| | |
|---|---|
| **Bluetooth names** | TEZ, SHAKTI, TEZ-PRINT, YX, YIXIN |
| **Driver** | `modules/tez-printer` → **PrintSDK** (`PrintImgHelper`) |
| **Default DPI** | **203** (8 dots/mm, hardcoded `OEM_DPM = 8`) |
| **Label width** | ✅ `widthMm` → `CreatePage(w, h)` |
| **Label height** | ✅ `heightMm` — **truncated to integer mm** in native |
| **Element width/height** | ✅ Via PNG; contain-fit + nearest-neighbor scale |
| **Transport** | Bluetooth SPP |

**Native input (`printTezPngLabel`):**

```ts
{
  pngBase64: string;
  widthMm?: number;     // default 50 — native rounds to int
  heightMm?: number;    // default 30
  density?: number;     // default 8
  speed?: number;       // default 4.0
  gapMm?: number;
  threshold?: number;   // default 168 in manager for die-cut
  hOffsetMm?: number;
  vOffsetMm?: number;
  copies?: number;
  paperType?: 'gap' | 'continuous' | 'black' | 'tattoo';
}
```

**Brief example:**

```
Canvas: 50.8 × 30.0 mm
Native CreatePage(51, 30)   ← width rounded up to whole mm
Bitmap scaled to 408×240 dots, contain-fit on page
```

**Accuracy factors**

| Factor | Effect |
|--------|--------|
| Integer mm page | Up to **±0.5 mm per axis** (e.g. 50.8 → 51) |
| Contain-fit | Shrinks content if aspects differ |
| Threshold binarization | No dither option — crisp edges, harsh photos |
| Gap backoff/forward | Feed steps around print — **UNVERIFIED** |

**Typical relevance (50 × 30 mm):**

| Dimension | Estimated accuracy |
|-----------|-------------------|
| 10 mm feature | **~98–99%** |
| 50.8 mm label width | **~99%** (rounds to 51 mm page = +0.4%) |
| Sub-mm sizing | **Poor** — integer mm only at SDK boundary |

---

### 5. SEZNIK LABEL X / MiniX / GD985

| | |
|---|---|
| **Bluetooth names** | LABELX, LABEL X, MINIX, GD985, LUCKP, U8, PPP1, LPC50 |
| **Driver** | `modules/labelx-printer` → **LuckPrinter SDK** |
| **Default DPI** | **203** (8 dots/mm); max width **48 mm** (384 dots) |
| **Label width** | ✅ `widthMm` / `widthDots` (default 384) |
| **Label height** | ❌ **`heightMm` ignored** — height = PNG aspect × width |
| **Element width/height** | ✅ Via PNG pixels only |
| **Transport** | Bluetooth SPP |

**Native input (`printLabelXPngLabel`):**

```ts
{
  pngBase64: string;
  widthMm?: number;     // default 48
  widthDots?: number;   // default 384 (= 48 mm @ 203 DPI)
  // NO heightMm
  copies?: number;
  paperType?: 'tag' | 'continuous' | 'blacktag';
  density?: number;     // 0, 1, 2 only (UI density ÷ 5)
  threshold?: number;   // default 145
  dither?: boolean;     // default true
}
```

**Brief example:**

```
Canvas: 48×25 mm label
Capture: 384×200 px intended
Native: scale to 384 × round(200/384*384) = 384×200
        printTag(bitmap) — printer cuts/feeds by gap sensor, not by 25 mm command
```

If PNG aspect ≠ label aspect, **physical height will not match** `heightMm`.

**Accuracy factors**

| Factor | Effect |
|--------|--------|
| No height param | Label length = bitmap height ÷ 8 dots/mm — **gap sensor decides cut** |
| Width truncation | Up to **1 dot** (~0.125 mm) |
| Dither default on | Softens barcodes/text edges |
| Density 3 levels | Coarse vs other printers |
| Vendor server check | Sends BT name, SN, MAC on connect (privacy, not dimensional) |

**Typical relevance (48 × 25 mm tag):**

| Dimension | Estimated accuracy |
|-----------|-------------------|
| 10 mm feature width | **~99%** |
| 48 mm width | **~99.7%** |
| 25 mm height | **~90–98%** (aspect + gap sensor — **needs hardware**) |

---

## Summary table

| Printer | SDK command | DPI | Label W | Label H | Element W/H | Dominant accuracy risk |
|---------|-------------|-----|---------|---------|-------------|------------------------|
| **TEJAS/RUDRA** | TSPL BITMAP | 304 | ✅ mm | ✅ mm | ✅ in bitmap | BITMAP pack-down crop; gap feed |
| **JOSH** | LPAPI bitmap | 203 | ✅ mm | ✅ mm | ✅ in bitmap | Contain-fit shrink; gap |
| **DEV** | TSPL / ESC/POS | 203 | ⚠️ 94.5% art | ✅ TSPL only | ✅ in bitmap | **378-dot cap (94.5% scale)** |
| **TEZ/SHAKTI** | PrintSDK page | 203 | ⚠️ int mm | ⚠️ int mm | ✅ in bitmap | Whole-mm rounding ±0.5 mm |
| **LABEL X** | LuckPrinter tag | 203 | ✅ 48 mm max | ❌ aspect only | ✅ in bitmap | **No height control**; gap sensor |

---

## How to read “print relevance”

Use this checklist when judging whether a design will print faithfully:

1. **Match job DPI to printer** — 304 for TD-404, 203 for all others. Wrong DPI → wrong scale.
2. **Minimum feature size** — features below **2 dots** (~0.25 mm @ 203) may disappear after threshold/dither. Barcodes: aim for ≥ **0.25 mm** module width (see `scannability-inspector.ts`).
3. **Systematic scale bugs** — DEV 94.5% cap and TEZ integer mm dominate over dot quantization.
4. **Label X height** — always verify PNG aspect matches intended mm height; do not rely on `heightMm` alone.
5. **DEV** — never use ESC/POS for die-cut labels (`heightMm` ignored).
6. **Contain-fit printers (JOSH, TEZ)** — PNG aspect must match label aspect or content shrinks.
7. **Caliper truth** — percentages here are **code-level estimates**. Confirm with `calibration-print.tsx` / physical proof on each family.

**Relevance score (rule of thumb):**

```
relevance% ≈ baseline_quantization% × scale_factor × fit_factor

scale_factor  = 1.0  (TD-404, JOSH, TEZ at matched DPI)
              = 0.945 (DEV 50 mm width cap)
              = 1.0  (Label X width; height uncontrolled)

fit_factor    = 1.0  when capture aspect = label aspect
              = <1.0 when contain-fit adds margins
```

---

## Worked example — same label on all five printers

**Design:** 50 × 30 mm, Code128 barcode 30 × 12 mm at (10, 14), text 40 × 8 mm at (5, 4).

| Stage | Value |
|-------|-------|
| Canvas elements | text box 40×8 mm; barcode 30×12 mm — positions in mm |
| Capture @ 203 DPI | 400×240 px PNG |
| Capture @ 304 DPI | 600×360 px PNG |

| Printer | What SDK receives | Expected printed barcode width |
|---------|-------------------|-------------------------------|
| TD-404 @ 304 | `widthMm:50, heightMm:30, png` | ~30 mm (**~99%**) |
| JOSH @ 203 | `widthMm:50, heightMm:30, png` | ~30 mm (**~99%**) |
| DEV @ 203 TSPL | same | ~28.4 mm (**~94.5%** of 30) ⚠️ scan risk |
| TEZ @ 203 | `CreatePage(50,30), png` | ~30 mm (**~99%**) |
| Label X @ 203 | `widthDots:384, png` (48 mm max) | width scaled to 48 mm stock; height from aspect |

---

## Files to read in code

| Topic | Path |
|-------|------|
| Element model | `src/lib/label-document.ts` |
| Print screen dispatch | `src/app/print.tsx` |
| Capture geometry | `src/lib/label-geometry.ts`, `src/lib/printer/print-spec.ts` |
| Printer routing | `src/lib/printer/printer-manager.ts` |
| Model registry | `src/constants/printer-models.ts` |
| TD-404 types | `modules/td404-printer/src/index.ts` |
| DEV types | `modules/dev-printer/src/types.ts` |
| TEZ types | `modules/tez-printer/src/types.ts` |
| JOSH types | `modules/josh-printer/src/index.ts` |
| Label X types | `modules/labelx-printer/src/types.ts` |
| TSPL vector export (demos) | `src/printing/canvas-export.ts` |

---

*Last updated: 2026-09-23. Accuracy percentages are engineering estimates from SDK/code analysis unless marked as hardware-verified.*
