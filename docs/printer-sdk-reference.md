# Printer SDK Reference

What each of the four printer integrations actually does to a bitmap, and where they
disagree. Written because "preview doesn't match print" kept regenerating after
individual fixes — the cause is that each SDK re-derives geometry independently, so
fixing one printer silently breaks the contract another one assumed.

Audit date: 2026-09-17. Line numbers are accurate as of that date; re-verify before relying on one.

## The four SDKs

| | TD-404 | JOSH | DEV | TEZ |
|---|---|---|---|---|
| Vendor / protocol | Ninestar, TSPL | DothanTech LPAPI | Caysn AutoReplyPrint (TSPL **and** ESC/POS) | Flashlabel OEM PrintSDK |
| Native module | `modules/td404-printer/` | `modules/josh-printer/` | `modules/dev-printer/` | `modules/tez-printer/` |
| Real head DPI | 304 (also 203) | 203 | 203 | 203 |
| Takes a raw PNG? | yes | yes | yes | yes |
| Byte alignment needed | yes (TSPL `BITMAP` width is in bytes) | **no** (Bitmap API) | yes for TSPL + ESC/POS raster | **no** (Bitmap API) |

`SEZNIK_PRINTER_MODELS` (`src/constants/printer-models.ts:20`) already declares the correct
`defaultDpi` per model. It is currently **not** used as the DPI source — see contradiction C1.

## Per-SDK geometry pipeline

### TD-404 — `Td404PrinterModule.kt`
- dots/mm: `dpi==304 ? 12 : dpi==203 ? 8 : dpi/25.4` (`:450`). DPI is a real parameter.
- mm→dots: `Math.round` (`:451-452`). Byte-align **DOWN**: `(sizeDotsW/8)*8` (`:454`).
- Size mismatch: **crop/pad, never scale** (`:460-479`). A 2× density capture therefore prints
  only its **top-left quadrant**.
- Centering: none. Label top-left, `REFERENCE 0,0` (`:540`).
- Offsets arrive in **dots** (`xDots`/`yDots`, `:424-425`) — the only SDK that does this.
- Binarization: hard threshold 128, no dither, no parameter (`:519-524`). Bit 1 = white.
- Rotation: rotates but does **not** swap mm, so `SIZE` contradicts the rotated bitmap (`:437-445` vs `:481`).
- Declares: `SIZE` from requested mm (2dp), `GAP`/`BLINE`, `DIRECTION 0`, `REFERENCE 0,0`, `BITMAP`, `PRINT 1,1`.
- `copies`: re-transmits the whole job N times.

### JOSH — `JoshPrinterManager.kt`
- dots/mm: `8.0` unless `dpi == 300.0` exactly, which gives `11.811` (`:784-785`). Passing 304 silently yields 8.0.
- mm→dots: `Math.round` (`:803-804`). No byte alignment.
- Size mismatch: **uniform contain-fit letterbox**, bilinear (`containFitToPage`, `:1083-1105`, `isFilterBitmap=true` at `:1099`).
- Centering: label-center unless `alignment=="left"` (`:1096-1097`). **Plus** LPAPI Strategy 1
  (`:876`) hands the raw bitmap to the vendor SDK which centers on the roll itself — an
  invisible third centering the app cannot predict.
- Which of three submit strategies runs is a **runtime fallback chain** (`:876-905`), and
  Strategy 1 vs 2/3 use different geometry contracts (pixel-implied vs mm-declared).
- Binarization: delegated to vendor SDK. No threshold parameter at all.
- Rotation: rotates **and** swaps mm for 90/270 (`:790-801`) — the only one that does.
- `copies`: `PrintParamName.PRINT_COPIES`, only set when > 1.

### DEV — `DevPrinterModule.kt` (two engines)
Engine chosen by `commandSet` (`:474`, `useEscPos = commandSet != "tspl"`). Note the TS wrapper
defaults to `'auto'` → ESC/POS, while `printer-manager.ts:2609` sends `'tspl'`. Same printer,
two different geometry universes.

**TSPL engine** (`:641-771`)
- dots/mm: `8.0` hardcoded (`:652`). The `dpi` parameter is **never read**.
- Byte-align **UP**: `((rawW+7)/8)*8` (`:663`) — the opposite of TD-404, deliberately, to avoid
  cropping the right-hand border.
- Size mismatch: pad if within 8px, else **non-uniform stretch** `createScaledBitmap(...,true)` (`:691`).
- Centering: none, label top-left, `BITMAP 0,0` (`:760`).
- Binarization: ordered Bayer 16×16 (`Floyd16x16`, `:56-73`, applied `:724`). Bit 1 = white.
  The `threshold` parameter JS sends is **silently dropped**.
- Declares `SIZE` derived from the byte-aligned bitmap so SIZE-dots == BITMAP-dots exactly —
  but that makes declared width up to 0.875 mm wider than the *physical* label.
- Binarization defaults to a hard threshold (128, matching TD-404) and only uses the ordered
  Bayer dither when the app explicitly asks for it (Halftone content) — previously it dithered
  unconditionally, which is why solid shapes/borders/text printed as a stippled gray instead of
  solid black. Fixed 2026-09-18.
- On a capture/target size mismatch within 8 dots (ViewShot's actual pixel output can differ
  from the computed target by a few dots even with `pixelRatio: 1`, on some devices), the canvas
  is **grown and padded**, never cropped.
- **Right-edge border loss, root-caused on device 2026-09-18**: on a real "SEZNIK 2in1" unit, a
  thin border pinned to the label's own right edge printed missing while top/left/bottom survived,
  even after the crop-vs-pad fix above. `adb logcat` during a live print confirmed the ViewShot
  capture was pixel-exact (`captureTargetW=400`, and the transmitted byte count only reconciles
  with an unmodified 400-dot-wide bitmap), and the bit-packing loop was re-verified by hand to
  read every column including the last one correctly. That rules out this app's JS and Kotlin as
  the source — the loss is happening at the print head or media itself, most likely the last
  dot-column(s) of each row being electrically unreliable on this driver board (a known trait of
  low-cost thermal heads), or the physical die-cut running a hair narrower than the declared mm.
  Mitigation: `buildTsplPrintJob` now appends a ~2mm guaranteed-white trailing margin after the
  real content (position of real content is unchanged), so whatever is unreliable at the true
  edge lands on blank padding instead of on ink. Declared `SIZE` grows to match. **This is a
  mitigation for a hardware/media trait, not a fix for an app bug** — needs hardware confirmation,
  and if it doesn't resolve the symptom the next step is measuring the physical media width
  directly rather than further software changes.

**ESC/POS engine** (`:776-865`)
- `heightMm` is **never used** — vertical size comes from the source bitmap's aspect (`:796`).
- Byte-aligns **height** too (`:797`), which `GS v 0` does not require — a silent vertical
  stretch of up to 7 rows.
- Centering: **head-relative** `(headDots - targetW)/2` (`:798`) — the only head-relative
  centering in the codebase. Depends on `printheadWidthMm`, default 50.0.
- Binarization: same Bayer matrix but **inverted polarity** (bit 1 = black, `:844`).
- Declares nothing about page size — pure raster rows + feed.

### TEZ — `TezPrinterModule.kt` + `PrintPipeline.kt`
- Label mm are **rounded to whole integers at the JS boundary** (`TezPrinterModule.kt:139-140`),
  then `× 8` (`PrintPipeline.kt:212-213`). A 50.8 mm label becomes 51 mm on every print.
- dots/mm: `8` as an Int constant (`PrintPipeline.kt:258`). No DPI parameter exists.
- Size mismatch: uniform contain-fit letterbox, **nearest-neighbour** (`:236-254`, `isFilterBitmap=false`
  at `:248` — explicitly the opposite choice from JOSH, for the same operation).
- Centering: **always centered**, no `alignment` option (`:244-245`).
- Offsets: mm → dots by **truncation** `.toInt()` (`:221-222`), where everyone else rounds.
- Binarization: vendor SDK with an app-supplied threshold, whose value is 128 / 128 / 168 / 254
  in four different call sites.
- Rotation: **no parameter, no code path**.
- `copies`: N × `printImg` inside one build.

## The contradictions

These are why a single preview cannot currently predict all four printers.

| # | Concept | The disagreement |
|---|---|---|
| C1 | **dots/mm** | TD-404 honours `dpi`; JOSH clamps all but 300.0 to 8.0; DEV and TEZ ignore DPI entirely. Same PNG + same declared mm ⇒ up to **1.5× size difference** between printers, silently. |
| C2 | **Byte-align direction** | TD-404 floors, DEV ceils, JS floors. Both native comments are correct *about their own firmware* and mutually exclusive as a shared contract. |
| C3 | **Size-mismatch policy** | crop (TD-404) vs stretch (DEV-TSPL) vs aspect-from-source (DEV-ESC/POS) vs contain-fit letterbox (JOSH, TEZ). A preview cannot simultaneously mean "will be cropped", "will be stretched" and "will be shrunk with bars". |
| C4 | **Interpolation** | JOSH bilinear vs TEZ nearest-neighbour for the identical contain-fit. |
| C5 | **Centering origin** | label-top-left (TD-404, DEV-TSPL), label-center (JOSH, TEZ), head-center (DEV-ESC/POS), firmware-roll-center (JOSH Strategy 1). JS meanwhile asserts centering is always 0. |
| C6 | **`alignment`** | Only JOSH reads it. It is dead metadata on the other three, yet lives on the shared profile. |
| C7 | **Offset units** | TD-404 takes dots, everyone else mm; TEZ truncates where others round. `hOffsetMm = 1.0` ⇒ 12 dots on TD-404@304, 8 dots elsewhere. |
| C8 | **mm precision** | 2dp (TD-404), 2dp SIZE + integer GAP (DEV), integer both axes (TEZ). A 50.8×76.2 mm label is `50.80×76.20` on TD-404 and `51×76` on TEZ. |
| C9 | **Binarization** | hard-threshold-128 (TD-404) vs ordered Bayer (DEV) vs vendor-no-threshold (JOSH) vs vendor-with-threshold (TEZ). Thin borders survive on DEV and vanish on TD-404. |
| C10 | **Rotation** | swap-mm (JOSH) vs don't-swap (TD-404) vs ignored (DEV) vs doesn't-exist (TEZ). Currently papered over by pre-rotating in JS. |
| C11 | **Declared page size** | TD-404 declares > transmitted; DEV-TSPL declares == transmitted but > physical label; TEZ declares == transmitted, both ≠ physical; DEV-ESC/POS and JOSH-Strategy-1 declare nothing. |
| C12 | **`heightMm` authority** | Authoritative on three engines, entirely ignored on DEV ESC/POS. |
| C13 | **`copies`** | Four different semantics, with different gap-sensing/backfeed behaviour. |
| C14 | **Gratuitous height alignment** | DEV ESC/POS byte-aligns height with no protocol need, stretching vertically. |

## Known root causes of the reported symptoms

Ranked, with the symptom each produces.

1. **Zoom in/out** — `printerDpi` is a *manual setting defaulting to 304* with no hardware probe
   (`printer-manager.ts:555-574`, `settings-store.ts:91`). TSPL prints 1 bitmap dot per head dot,
   so 304-on-a-203-head is **1.5× too large and cropped**; 203-on-304 is 0.67×. JOSH is
   force-corrected (`josh-print.ts:25-29`) and TEZ is hardcoded, but generic/TD-404 is not.
   The model registry already knows the right answer and isn't consulted.
2. **Right border clipped** — `tsplPackedWidthDots` floors to a multiple of 8 (`print-spec.ts:169-172`)
   and the leftover 0–7 columns are cropped off the **right** (`escpos.ts:576-589`) — up to 0.875 mm
   at 8 dpm. Template frames sit at a 0.5 mm inset with a 0.45 mm stroke, i.e. *inside that band*.
   Whether it bites depends on whether `round(widthMm × dpm)` is already a multiple of 8, which is
   why it affects some label sizes and not others.
3. **Border in the wrong shape** — the editor decides "draw this border as a ring" from a label
   **squareness** heuristic (`konva-transformer.tsx:127-131`), the print path decides from
   `mediaShape` (`label-preview.tsx:211`). On a square rectangular label the editor shows an
   ellipse and the print shows a rectangle.
4. **Z-order differs editor vs print** — `label-preview.tsx:202` applies numeric `zIndex` as a style;
   `konva-transformer.tsx:912` pins borders to 0. Also `visible === false` hides in the editor but
   **still prints** (`label-preview.tsx:166` filters only on `needPrinting`).
5. **Template sizing** — `applyPrintSize` (`print-sizes.ts:632`) stretches anisotropically while
   font scales by `min(sx,sy)`, so text re-wraps to a different line count and stacked rows overlap.
   The clamp permits bleed, so overflow is never re-fitted — only clipped.
   `fitDocumentCenteredOnPage` (the contain-fit alternative) exists but is **dead code**.
6. **2-up / 3-up tiling** — `tileDocumentTwoUp` and `tileDocumentThreeUpRatTail` hard-code cell
   sizes and do **not** scale `fontSize` or `lineWidth`.
7. **Template canvas overwritten** — `createIndustryTemplateDocument` (`template-documents.ts:408-426`)
   reassigns `widthMm`/`heightMm` *after* elements were laid out against the old size, without rescaling.
8. **Multi-up border collapse** — resizing a composed strip re-pins every per-panel border to the
   full strip (`element-sizing.ts:368-374` + `:207-227`).
9. **21 of 32 border styles are not implemented** — `border-preview.tsx:227` falls through to a plain
   rectangle for everything except 11 styles. Picking "Scalloped" yields a plain box.
10. **Multi-page capture race** — two `requestAnimationFrame`s is a heuristic, nothing asserts the
    ViewShot subtree actually reflects the new page before capture (`print.tsx:697-714`).
    `printRasterRef` is dead code (declared, read, never written).

## Architectural state

- A correct `PrinterAdapter` interface already exists (`src/printing/printer/types.ts:39-49`) with
  exactly **one** implementation (TD-404), used by only two screens.
- **Seven** independent dispatch sites branch on `isTez`/`isJosh`/`isDev`/`usesTd404CommandSet`.
- `PrinterManager` is a ~2790-line class with roughly 12 responsibilities.
- `connectModel()` (`printer-manager.ts:1006-1080`) is already the clean per-printer chokepoint and
  its own comment calls them "bridges".
- `sdkId`/`transport`/`deviceId` are **deliberately not persisted** (`printer-store.ts:142-149`), so
  after an app restart printer identity silently falls back to name-sniffing regexes.
- Geometry math is triplicated: `printing/geometry/units.ts` (2 importers),
  `lib/printer/print-spec.ts` (18 importers — the real one), `lib/printer/print-geometry.ts`
  (1 importer: the shipping editor, which is why its preview drifts).
  `PrintGeometry` and `PrinterProfile` are each declared **twice with different shapes**.
