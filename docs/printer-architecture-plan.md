# Print Architecture — Migration Plan

Companion to [`printer-sdk-reference.md`](./printer-sdk-reference.md), which documents *why*
these changes are needed. This file is the ordered plan and the running status.

## The core idea

Today every layer re-derives geometry: JS computes one thing, and four native modules each
compute something different from millimetres using their own dots-per-mm, rounding,
byte-alignment direction, scaling policy, centering origin and binarization. That is why
fixing one printer keeps breaking another, and why the preview can never be right for all four.

**Invert the contract: JS owns the final raster; native modules become dumb transports.**

- JS resolves the connected printer's real capabilities.
- JS computes the canonical dot layout, rasterizes and binarizes to *exactly* that dot canvas.
- Native receives an already-final bitmap plus explicit `widthDots`/`heightDots`, and does
  **zero** scaling, cropping, centering or re-binarizing. On a size mismatch it **fails loudly**
  instead of silently "fixing" it.
- The same layout + raster pipeline drives the on-screen preview, so WYSIWYG is structural
  rather than coincidental.

## Decisions taken

| Decision | Choice |
|---|---|
| DPI source | **Model registry is authoritative.** `SEZNIK_PRINTER_MODELS[model].defaultDpi` wins; the manual setting becomes an advanced per-model override only. |
| Resize policy | **Contain-fit, preserve aspect.** Revive `fitDocumentCenteredOnPage`; stop anisotropic stretch. |
| Rollout | **Phased. DEV first**, hardware-verified, then the other three. |
| DEV engine | **Standardise on TSPL** for labels. ESC/POS retained for receipt printing only. |

## Capability record

One declarative record per printer, replacing the assumptions currently scattered across
native code. Derived directly from contradictions C1–C14.

```
dotsPerMm            real head density — from the model registry, not a user setting
headWidthMm          physical printable width
byteAlign            'none' | 'floor' | 'ceil'   (and whether it applies to height — it never should)
offsetUnits          'mm' | 'dots'
centeringOrigin      'label-top-left' | 'label-center' | 'head-center'
binarization         'js' (we own it) | 'vendor'
supportsRotation     boolean — if false, JS pre-rotates
copiesSemantics      'retransmit' | 'protocol-count' | 'vendor-param'
mmPrecision          decimals the protocol accepts
protocol             'tspl' | 'lpapi' | 'escpos' | 'vendor-sdk'
```

## Phases

### Phase 1 — printer-independent correctness + DEV (hardware-verifiable now)
Fixes that need no cross-printer testing, plus the DEV path the user can verify.

1. **DPI from the model registry.** `getActivePrinterProfile()` (`printer-manager.ts:482-586`)
   takes `defaultDpi` from `SEZNIK_PRINTER_MODELS`; `settings.printerDpi` demoted to an explicit
   override. Removes the 1.5×/0.67× zoom class outright.
2. **Contain-fit resize.** `applyPrintSize` (`print-sizes.ts:632`) calls the existing
   `fitDocumentCenteredOnPage` (`element-sizing.ts:397`) instead of `scaleDocumentToSize`.
3. **Border shape agreement.** Delete the squareness heuristic (`konva-transformer.tsx:127-131`);
   both editor and print derive border shape from `mediaShape`.
4. **Z-order + visibility agreement.** Stop applying numeric `zIndex` as a style in the capture
   (`label-preview.tsx:202`); honour `visible === false` at print (`label-preview.tsx:166`).
5. **Right-edge crop.** Make the byte-alignment policy explicit per capability instead of a global
   floor, so a border in the right-most column is never the thing that gets dropped.
6. **DEV standardises on TSPL** for labels; ESC/POS reserved for receipts.
7. Delete dead code found in the audit: `printRasterRef`, `fitDocumentToFillPage`,
   the unused `printDpi` constants, duplicate `PrintGeometry`/`PrinterProfile` declarations.

**Verify:** border on all four edges at 50 mm, 50.8 mm and 101.6 mm; a default template printed at
its authoring size and at a different size; square vs non-square labels; bulk print of 3+ copies.

### Phase 2 — one geometry module
Collapse `printing/geometry/units.ts`, `lib/printer/print-spec.ts` and `lib/printer/print-geometry.ts`
into a single source. `print-spec.ts` wins (18 importers). Migrate the shipping editor
(`label-editor.tsx`, the sole `print-geometry.ts` consumer) — this alone removes its preview drift.

### Phase 3 — bridge registry
Give each printer a bridge implementing the **existing** `PrinterAdapter` interface
(`src/printing/printer/types.ts:39-49`), following `TD404Adapter`'s dependency-injection pattern.
Register by `SeznikPrinterModelId`; instantiate in `connectModel()` (`printer-manager.ts:1006-1080`,
already the clean chokepoint) and tear down in `disconnect()`. Replace all **seven** dispatch sites
with one `getActiveBridge()`.

Also persist `sdkId`/`transport` (`printer-store.ts:142-149`) so identity survives a restart
instead of falling back to name-sniffing regexes — and use the registry's already-declared
`supportedNames` instead of the mutually-recursive regexes in `printer-heuristics.ts`.

### Phase 4 — JS owns the raster
Move binarization into JS so all four printers produce identical ink, and change each native
contract to accept explicit `widthDots`/`heightDots` with a loud failure on mismatch.
Highest risk: touches all four Kotlin modules, three of which cannot be hardware-tested here.

### Phase 5 — template and border correctness
- Implement or remove the 21 unimplemented border styles (`border-preview.tsx:227`).
- Fix `tileDocumentTwoUp` / `tileDocumentThreeUpRatTail` to scale `fontSize` and `lineWidth`.
- Fix `createIndustryTemplateDocument` (`template-documents.ts:408-426`) overwriting canvas mm
  after layout without rescaling.
- Fix multi-up border collapse (`element-sizing.ts:368-374`).
- Replace the multi-page capture rAF race with a deterministic wait (`print.tsx:697-714`).

## Risk notes

- Native Kotlin changes for JOSH / TD-404 / TEZ cannot be verified without those printers.
  Phases 1–3 deliberately keep native changes to DEV only.
- JOSH's three-strategy fallback chain means its geometry contract is non-deterministic at runtime;
  pin a single strategy before trusting any JOSH measurement.
- Changing the TSPL `SIZE` declaration affects gap-sensor calibration — always re-verify
  gap detection after touching it, not just print placement.

## Status

- [x] Audit of all four SDKs — see `printer-sdk-reference.md`
- [x] **Phase 1** — awaiting hardware verification on DEV
  - [x] DPI from model registry; `printerDpi` demoted to a nullable override with a new
        "Auto" option in Printing Settings (`printer-manager.ts:555`, `settings-store.ts`,
        `printing-settings.tsx`)
  - [x] `applyPrintSize` switched to contain-fit via `fitDocumentCenteredOnPage` (`print-sizes.ts:632`)
  - [x] Border shape now from `mediaShape` in both editor and print; squareness heuristic
        deleted (`konva-transformer.tsx`, threaded through `konva-canvas.tsx`)
  - [x] Print capture honours `visible === false` and uses `sortLayers` order instead of
        raw `zIndex` (`label-preview.tsx`)
  - [x] DEV defaults to TSPL, never `'auto'`→ESC/POS (`modules/dev-printer/src/index.ts`)
  - [x] Dead code removed: `printRasterRef`, `printRasterKey`
  - [x] Dev binarization now respects `dither`/threshold instead of forcing ordered
        dither on every job (`DevPrinterModule.kt`, wired end-to-end through
        `modules/dev-printer/src/index.ts`, `types.ts`, `printer-manager.ts`, `print.tsx`)
  - [x] Dev's TSPL crop/pad step never trims real content on a capture/target size
        mismatch — grows the canvas and pads instead (found on hardware: a thin
        right border vanished while top/bottom/left survived, because the
        top-left-anchored crop always sacrificed the right/bottom edge on a
        few-dot ViewShot density-rounding mismatch) (`DevPrinterModule.kt`)
  - [ ] Hardware verification (see checklist below)
- [ ] Phase 2 — collapse the three geometry modules
- [ ] Phase 3 — bridge registry + persist `sdkId`
- [ ] Phase 4 — JS owns the raster
- [ ] Phase 5 — template/border correctness (21 unimplemented border styles, tiling
      font/stroke scaling, `createIndustryTemplateDocument` canvas overwrite, multi-up
      border collapse, multi-page capture race)

### Phase 1 hardware checklist (DEV printer)

Set Printing Settings → Printer Resolution to **Auto** first, and reset Horizontal
Offset to 0.00 mm (it persists per printer).

1. Border on all four edges at 50 mm, 50.8 mm and 101.6 mm widths — the right edge is the
   one that used to clip, and it is size-dependent.
2. A default template printed at its authoring size, then at a different aspect — should now
   scale proportionally and stay centered instead of stretching.
3. A square label (e.g. 50×50) with a border — the editor used to draw an ellipse here and
   the printer a rectangle; both should now be rectangles.
4. Hide a layer in the editor, then print — it must not appear.
5. Bulk print 3+ copies and a multi-page data merge — each label should be identical and correct.
6. Confirm gap sensing still calibrates correctly (the TSPL `SIZE` declaration changed earlier).
