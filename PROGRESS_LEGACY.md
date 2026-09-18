# Progress Log

This file tracks progress through each phase of the plan defined in [`src/components/editor/implementation.md`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/components/editor/implementation.md).
Entries are appended after completing each phase and awaiting human verification before proceeding to the next.

---

## Phase 0: Printer Connectivity & Ground-Truth Calibration — 2026-09-08

### What was implemented
- Defined `PRINTER_DPI = 304` and unrounded `DOTS_PER_MM = 304 / 25.4` (≈ 11.96850394 dots/mm) in [`src/printing/calibration.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/calibration.ts).
- Implemented `generateCalibrationTspl(...)` to compute exact unrounded dot coordinates for any physical label and box dimensions, generating raw TSPL:
  - `SIZE <w> mm, <h> mm`
  - `GAP <gap> mm, 0 mm`
  - `DIRECTION 1`
  - `CLS`
  - `BOX <x0>,<y0>,<x1>,<y1>,<thickness>`
  - `PRINT 1`
- Built standalone CLI calibration tool [`scripts/print-calibration-box.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-calibration-box.ts) with npm script `npm run print:calibration -- [options]`:
  - Supports `--labelWidth <mm>`, `--labelHeight <mm>`, `--boxWidth <mm>`, `--boxHeight <mm>`, `--gap <mm>`, `--thickness <mm>`, `--ip <printer_ip>`, and `--out <file>`.
  - Sends raw bytes via direct TCP port 9100 when `--ip` is specified.
- Added `printRawTspl(tspl: string)` to `PrinterManager` in [`src/lib/printer/printer-manager.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts) for on-device Bluetooth SPP / BLE / Wi-Fi printing.
- Integrated one-tap "Print Phase 0 Raw TSPL Box" in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
- Added automated math unit tests to [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).

### Tests run
- [x] Automated unit test: 304 DPI unrounded `DOTS_PER_MM` (11.96850394) verified against rounded integer 12 — PASS
- [x] Automated unit test: 40mm × 20mm box on 50mm × 30mm label dot calculations (`BOX 60,60,539,299,4`; 479 × 239 dots) — PASS
- [x] Automated unit test: 80mm × 15mm box on 100mm × 30mm label dot calculations (`BOX 120,90,1077,269,4`; 957 × 179 dots) — PASS
- [x] CLI execution: `npm run print:calibration -- --labelWidth 50 --labelHeight 30 --boxWidth 40 --boxHeight 20` outputs exact TSPL — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors — PASS
- [ ] Physical test: Printer connects and accepts raw TSPL commands without error — PENDING USER MEASUREMENT
- [ ] Physical test: Print 40mm × 20mm box and measure with ruler/calipers (target 40mm × 20mm ± 0.5mm) — PENDING USER MEASUREMENT
- [ ] Physical test: Print 80mm × 15mm box and measure with ruler/calipers (target 80mm × 15mm ± 0.5mm) — PENDING USER MEASUREMENT
- [ ] Physical test: Confirm physical measurements match 304 DPI prediction — PENDING USER MEASUREMENT

### Deviations from plan
None. The implementation is lean and strictly fulfills the deliverables and constraints of Phase 0.

### Open issues / follow-ups
- Awaiting user to run the calibration print on their physical printer (either via `npm run print:calibration -- --ip <printer_ip>` or from the app's Calibration Print screen over Bluetooth) and record measured caliper/ruler values.

### Ready for review: YES

---

## Phase 1: TSPL Command Builder (no UI yet) — 2026-09-08

### What was implemented
- Created standalone TSPL Command Builder in [`src/printing/tspl-builder.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/tspl-builder.ts) accepting physical mm as input units everywhere and converting to dots via `DOTS_PER_MM = 304 / 25.4` (≈ 11.96850394):
  - `setSize(widthMm, heightMm)`
  - `setGap(gapMm, offsetMm?)`
  - `clear()` -> `CLS`
  - `drawBox(xMm, yMm, wMm, hMm, thicknessMm?)` -> `BOX <x0>,<y0>,<x1>,<y1>,<thickness>`
  - `drawText(xMm, yMm, text, fontSize?, options?)` -> `TEXT <x>,<y>,"<font>",<rotation>,<xMulti>,<yMulti>,"<text>"`
  - `drawBarcode(xMm, yMm, data, type?, options?)` -> `BARCODE <x>,<y>,"<type>",<height>,<readable>,<rotation>,<narrow>,<wide>,"<data>"`
  - `drawQrCode(xMm, yMm, data, options?)` -> `QRCODE <x>,<y>,<ecc>,<cellWidth>,A,0,<model>,<mask>,"<data>"`
  - `print(copies?)` -> `PRINT <copies>`
  - `build(): string` and `toBytes(): Uint8Array`
  - Standalone functional exports: `setSize`, `setGap`, `clear`, `drawBox`, `drawText`, `drawBarcode`, `drawQrCode`, `printCommand`.
- Created Phase 1 test suite in [`src/printing/__tests__/tspl-builder.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/tspl-builder.test.ts).
- Added `testPhase1TsplBuilder()` to the global test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created CLI demonstration script [`scripts/print-phase1-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase1-demo.ts) runnable via `npm run print:phase1 -- [options]`.

### Tests run
- [x] Unit test: TSPL command generation from physical mm inputs with exact dot math (`BOX`, `TEXT`, `BARCODE`, `QRCODE`, `SIZE`, `GAP`, `CLS`, `PRINT`) — PASS
- [x] Unit test: Standalone functional helpers composition and string escaping (`Hello "World"`) — PASS
- [x] Edge case test: 5mm small element (`BOX 12,12,72,72,2`) converts accurately with positive thickness without underflow — PASS
- [x] Edge case test: Near-full-label element on 100×150 mm label (`BOX 12,12,1185,1783,4`) stays within print head bounds — PASS
- [x] Unit test: Binary byte buffer output (`toBytes()`) produces valid UTF-8/ASCII bytes matching text — PASS
- [x] CLI execution: `npm run print:phase1 -- --labelWidth 50 --labelHeight 30` produces exact TSPL payload — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors — PASS
- [ ] Physical test: Print box + text + barcode layout via `npm run print:phase1` and measure box dimensions/position with ruler (within ±0.5mm) — PENDING USER MEASUREMENT
- [ ] Physical test: Scan printed Code128 barcode ("PHASE1-TEST") with phone camera / scanner app to confirm valid decode — PENDING USER SCAN
- [ ] Physical test: Verify 5mm corner box and full-width elements print without clipping — PENDING USER MEASUREMENT

### Deviations from plan
None. The module is strictly isolated with zero UI/canvas dependencies.

### Open issues / follow-ups
- Awaiting user physical print of the Phase 1 test layout (`npm run print:phase1 -- --ip <printer_ip>` or via app) to confirm ruler measurements and barcode scanning.

### Ready for review: YES

---

## Phase 2: Canvas Foundation (mm-based model, screen rendering, box element) — 2026-09-08

### What was implemented
- Created canvas model and coordinate transformation module in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):
  - Stored model strictly in physical millimeters (`left`, `top`, `width`, `height`, `lineWidth`).
  - Derived screen pixels via scale factor (`px = mm * scale` and `mm = px / scale`).
  - `computeScreenFitScale` to contain-fit any label dimensions uniformly inside available screen viewport.
  - `applyDragToMm` converts screen pixel pan gestures back to exact physical mm with boundary clamping.
  - `applyResizeToMm` converts screen pixel resize deltas to physical mm with minimum size protection.
  - `exportCanvasToTspl(doc, options)` translates canvas box/shape elements into TSPL via Phase 1 [`TsplBuilder`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/tspl-builder.ts).
- Exported Phase 2 APIs via [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts).
- Built comprehensive test suite in [`src/printing/__tests__/canvas-export.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/canvas-export.test.ts) and integrated into test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created interactive on-screen canvas playground in [`src/app/phase2-canvas.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase2-canvas.tsx):
  - User can type label width/height/gap in mm or pick from presets.
  - Interactive screen canvas contain-fits to viewport with visual zoom levels (0.75x to 2.0x).
  - Draggable & resizable rectangle box element with touch handles.
  - Real-time triple-coordinate inspector (physical mm ↔ screen px ↔ printer dots).
  - Live generated TSPL script display.
  - One-tap "Print Phase 2 Box via TSPL" button wired to [`PrinterManager.printRawTspl`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts).
- Added direct navigation button to Phase 2 Canvas Playground from [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx) and registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx).
- Created CLI demonstration script [`scripts/print-phase2-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase2-demo.ts) runnable via `npm run print:phase2 -- [options]`.

### Tests run
- [x] Automated unit test: Bidirectional px ↔ mm conversion precision across scales (1.0, 3.78, 5.0, 10.0, 11.97 px/mm) — PASS
- [x] Automated unit test: Screen fit scale calculation maintaining uniform aspect fit — PASS
- [x] Automated unit test: Moving element on screen converts pixel delta back to exact mm and clamps to label bounds — PASS
- [x] Automated unit test: Resizing element on screen converts pixel delta to mm and respects minimum size constraints — PASS
- [x] Automated unit test: Changing visual zoom factor (0.5x to 4x) does not alter stored mm model values — PASS
- [x] Automated unit test: Exporting 40×20 mm box on 50×30 mm label generates exact TSPL commands (`BOX 60,60,539,299,4`) — PASS
- [x] Automated unit test: Multi-box document export with custom copy count — PASS
- [x] CLI execution: `npm run print:phase2 -- --labelWidth 50 --labelHeight 30 --boxLeft 5 --boxTop 5 --boxWidth 40 --boxHeight 20` outputs exact TSPL — PASS
- [x] CLI execution: `npm run print:phase2 -- --labelWidth 80 --labelHeight 50 --boxLeft 10 --boxTop 10 --boxWidth 60 --boxHeight 30` outputs exact TSPL (`BOX 120,120,838,479,4`) — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors — PASS
- [ ] Physical test: Place box at known mm position/size on canvas, export via Phase 1 TSPL builder, print, and measure with ruler/calipers — position and size within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. The architecture strictly maintains physical millimeters as ground-truth, keeps screen pixels and zoom purely as visual derived representations, and wires directly to the Phase 1 TSPL builder without premature abstractions.

### Open issues / follow-ups
- Awaiting user physical verification on printer (either via app at Phase 2 Canvas screen or via CLI `npm run print:phase2 -- --ip <printer_ip>`) to confirm calipers/ruler measurement within ±0.5mm.

### Ready for review: YES

---

## Phase 3: Image Import as Background Reference — 2026-09-08

> [!WARNING]
> **SUPERSEDED:** This initial flow has been superseded by **Phase 3 (Reworked): Size-First Import Flow with Ruled Canvas** (see the entry at the end of this document and [`fix.md`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/fix.md)).

### What was implemented
- Created Background Reference & Aspect Ratio system in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):
  - Defined `BackgroundReference` interface (`uri`, `imageWidthPx`, `imageHeightPx`, `opacity`, `visible`).
  - Added `backgroundReference` to `CanvasDocument`.
  - Implemented `checkAspectRatioMismatch(...)` to calculate ratio discrepancy between intrinsic image pixels and entered mm label dimensions, warning when discrepancy exceeds $3\%$.
  - Implemented `calculateLockedDimensions(...)` to calculate proportional width/height when aspect ratio locking is active.
  - Implemented `exportCanvasBoundaryToTspl(...)` to output the exact canvas outer boundary box in TSPL (`BOX 0,0,x1,y1,thickness`) for physical caliper/footprint verification.
  - Verified non-printing background guarantee (reference image emits 0 TSPL bitmap ink in this phase).
- Re-exported Phase 3 functions and types via [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts).
- Created automated test suite in [`src/printing/__tests__/background-reference.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/background-reference.test.ts) and wired into master runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created interactive screen [`src/app/phase3-image-import.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase3-image-import.tsx):
  - Photo picker using `expo-image-picker` with sample fallback.
  - Manual physical size inputs (Width, Height, Gap in mm) and presets.
  - "Lock Aspect Ratio" switch for proportional adjustments.
  - Distortion warning alert banner with one-tap "Fix Width" and "Fix Height" chips.
  - Visual opacity control ($25\% - 100\%$) for tracing/sizing.
  - Screen canvas rendering background reference image scaled $1:1$ with mm canvas.
  - One-tap "Print Canvas Boundary via TSPL" button wired to [`PrinterManager.printRawTspl`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts).
- Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx) and added shortcut button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
- Created CLI tool [`scripts/print-phase3-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase3-demo.ts) runnable via `npm run print:phase3 -- [options]`.

### Tests run
- [x] Automated unit test: Entering W×H mm and uploading image establishes canvas bounding box matching mm values exactly — PASS
- [x] Automated unit test: Aspect ratio mismatch detection flags distortion when $>3\%$ and passes when aspect matches — PASS
- [x] Automated unit test: Suggested dimensions calculation for width-fix and height-fix mm — PASS
- [x] Automated unit test: Locked dimension calculation maintains exact proportional mm — PASS
- [x] Automated unit test: Background reference is non-printing by default (zero TSPL bitmap ink) — PASS
- [x] Automated unit test: `exportCanvasBoundaryToTspl` generates exact outer footprint box (`BOX 0,0,598,359,4`) — PASS
- [x] Automated unit test: `exportCanvasToTspl` with `printBoundary: true` includes outer boundary box — PASS
- [x] CLI execution: `npm run print:phase3 -- --labelWidth 50 --labelHeight 30 --imgWidth 1000 --imgHeight 600` outputs exact TSPL — PASS
- [x] CLI execution: `npm run print:phase3 -- --labelWidth 50 --labelHeight 45 --imgWidth 1000 --imgHeight 600` warns of 33.3% distortion and suggests 75×45 or 50×30 mm — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors — PASS
- [ ] Physical test: Import real label photo, enter physical mm dimensions, print canvas boundary, and confirm physical print footprint matches real label within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Kept simple with manual size entry and non-printing background reference as specified.

### Open issues / follow-ups
- Awaiting user physical print of the canvas boundary to confirm ruler/caliper match with physical label stock (target ±0.5mm).

### Ready for review: YES

---

## Phase 4: Text Elements — 2026-09-08

### What was implemented
- Added Text Elements model and deterministic font resolution in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):
  - Defined `CanvasTextElement` interface (`id`, `type: 'text'`, `text`, `left`, `top`, `fontSize`, `rotation`, `width`, `height`).
  - Implemented deterministic TSPL font resolution `resolveTsplFont(fontSizePt)` mapping points (6pt–48pt+) to TSPL hardware bitmap fonts ("1" through "5") and hardware dot multipliers (`xMulti`, `yMulti`).
  - Implemented `tsplFontHeightMm(font, yMulti)` computing exact physical cap height in millimeters (e.g. Font 1 = 1.00mm, Font 2 = 1.67mm, Font 3 = 2.01mm, Font 4 = 2.67mm, Font 5 = 4.01mm, Font 5 2x2 = 8.02mm).
  - Maintained visual cap-height parity in React Native screen rendering (`Math.round(capHeightMm * scale * zoom * 1.35)`) so screen letter heights in pixels faithfully match printed millimeter heights.
  - Added TSPL string escaping (`safeText = text.replace(/"/g, '\\"')`) to prevent quotation syntax errors in printer firmware.
  - Integrated text elements into `exportCanvasToTspl` alongside box elements and optional boundary box.
- Re-exported Phase 4 text functions and interfaces in [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts).
- Created automated test suite in [`src/printing/__tests__/text-elements.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/text-elements.test.ts) and wired into master test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created interactive screen [`src/app/phase4-text.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase4-text.tsx):
  - Interactive multi-element canvas supporting both text elements and box elements.
  - Tap-to-select elements with bounding box and drag handles.
  - Direct mm position editing (`left`, `top`), text content editing, and font size selector chips (6pt to 48pt).
  - Add text, add box, and delete element controls.
  - Visual zoom factor isolation (0.75x to 2.0x) ensuring stored mm coordinates remain invariant.
  - Live inspector displaying element mm coordinates, screen pixels, printer dots, resolved TSPL font, and physical cap height.
  - Live TSPL command generation stream viewer.
  - One-tap "Print Phase 4 Text via TSPL" button wired to [`PrinterManager.printRawTspl`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts).
- Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx) and added navigation button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
- Created CLI demonstration script [`scripts/print-phase4-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase4-demo.ts) runnable via `npm run print:phase4 -- [options]`.

### Tests run
- [x] Automated unit test: Deterministic TSPL font resolution verified across all sizes (6pt to 48pt) — PASS
- [x] Automated unit test: Text element mm position and font size round-trip in model — PASS
- [x] Automated unit test: Dragging text element converts screen delta to mm and clamps to label bounds — PASS
- [x] Automated unit test: Zoom factor strictly isolates viewport from stored text mm model — PASS
- [x] Automated unit test: `exportCanvasToTspl` generates exact TSPL text commands for multiple font sizes — PASS
- [x] Automated unit test: Full document with box + text + boundary exports accurately — PASS
- [x] Automated unit test: String escaping prevents TSPL syntax errors on quotes — PASS
- [x] CLI execution: `npm run print:phase4 -- --labelWidth 50 --labelHeight 30` outputs exact TSPL commands (`TEXT 60,60,"4",0,1,1,"SEZ-PRINT ENGINE"`, etc.) — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Print text at known mm position/size, measure with ruler/calipers — position and cap-height within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Deterministic font mapping directly aligns React Native screen rendering cap-height with TSPL hardware bitmap font dot heights without layout engine distortion.

### Open issues / follow-ups
- Awaiting user physical print verification on printer (either via Phase 4 screen in app or via CLI `npm run print:phase4 -- --ip <printer_ip>`) to confirm calipers measurement within ±0.5mm.

### Ready for review: YES

---

## Phase 5: Barcode & QR Code Elements — 2026-09-08

### What was implemented
- Added Barcode and QR Code elements model, scannability validation, and TSPL output in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):
  - Defined `CanvasBarcodeElement` (`id`, `type: 'barcode'`, `data`, `left`, `top`, `height`, `width?`, `symbology?`, `readable?`, `rotation?`, `narrowDots?`).
  - Defined `CanvasQrElement` (`id`, `type: 'qr'`, `data`, `left`, `top`, `sizeMm`, `eccLevel?`, `rotation?`, `cellWidthDots?`).
  - Implemented `calculateCode128WidthMm(data, narrowDots)` calculating physical millimeter horizontal footprint based on Code 128 module counts with Code C numeric pair compression.
  - Implemented `resolveQrCellWidth(sizeMm, dataLength)` calculating optimal integer dot size per module (`cellWidthDots` 2–10) at 304 DPI ($11.97\,\text{dots/mm}$) and `calculateQrFootprintMm(cellWidthDots, dataLength)`.
  - Implemented `validateScannability(...)` checking minimum physical scanning constraints (barcode height $\ge 5\,\text{mm}$, narrow bar $\ge 2\,\text{dots}$, QR size $\ge 8\,\text{mm}$ with warning below $10\,\text{mm}$, cell width $\ge 3\,\text{dots}$, edge overflow clipping detection).
  - Integrated barcode and QR code commands into `exportCanvasToTspl` (`BARCODE` and `QRCODE` with dots conversion and quotation escaping).
- Re-exported Phase 5 types and functions via [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts).
- Created automated test suite [`src/printing/__tests__/barcode-qr-elements.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/barcode-qr-elements.test.ts) and wired into master test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created interactive screen [`src/app/phase5-barcode-qr.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase5-barcode-qr.tsx):
  - Multi-element canvas artboard rendering Code 128 barcodes (via normalized SVG bars from `@/lib/barcode-code128`) and QR codes (via `react-native-qrcode-svg`).
  - Tap-to-select elements with bounding box and drag-move gesture handlers clamped in millimeters.
  - Add Barcode, Add QR Code, Add Text, and Delete Element controls.
  - Quick-preset chips for label dimensions, barcode height, and QR size in mm.
  - Real-time scannability indicator banner displaying calculated footprint and warning when elements are undersized or clipped.
  - Triple-Inspector showing mm coordinates, screen px, and 304 DPI printer dots.
  - Live TSPL command generation stream viewer.
  - "Print Phase 5 via TSPL" button wired to [`PrinterManager.printRawTspl`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts).
- Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx) and added shortcut button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
- Created CLI demonstration script [`scripts/print-phase5-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase5-demo.ts) runnable via `npm run print:phase5 -- [options]`.

### Tests run
- [x] Automated unit test: Code 128 width calculation accurately models module counts and Code C compression — PASS
- [x] Automated unit test: QR cell width resolution and footprint calculation verified across physical dimensions — PASS
- [x] Automated unit test: Scannability validator flags size, overflow, and empty content edge cases — PASS
- [x] Automated unit test: `exportCanvasToTspl` generates exact TSPL `BARCODE` command with correct dot calculations — PASS
- [x] Automated unit test: `exportCanvasToTspl` generates exact TSPL `QRCODE` command with correct dot calculations — PASS
- [x] Automated unit test: Full document with boundary, box, text, barcode, and QR code exports accurately — PASS
- [x] CLI execution: `npm run print:phase5` outputs exact TSPL commands (`BARCODE 48,108,"128",120,1,0,2,2,"SP-10045"` and `QRCODE 371,108,M,5,A,0,M2,S7,"https://sez-print.local/verify"`) — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Print several barcodes/QR codes at different sizes/positions; scan with phone/scanner to confirm correct decoded data and verify footprint on paper matches editor mm size (±0.5mm) — PENDING USER MEASUREMENT & SCAN

### Deviations from plan
None. Physical millimeter geometry is strictly maintained throughout, and scannability validation guards against undersized barcodes/QR codes before printing.

### Open issues / follow-ups
- Awaiting user physical scan and calipers measurement on printed output (either via Phase 5 screen in app or via CLI `npm run print:phase5 -- --ip <printer_ip>`) to confirm decode reliability and footprint match within ±0.5mm.

### Ready for review: YES

---

## Phase 6: Element Manipulation & Editing UX — 2026-09-08

### What was implemented
- Created pure, physical millimeter-grounded element manipulation engine in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):
  - `snapToGridMm(valMm, stepMm)`: Snaps coordinates/dimensions to physical increments (e.g. 0.5 mm or 1.0 mm).
  - `getElementFootprintMm(el)`: Computes actual physical millimeter bounding box across all element types (boxes, texts, barcodes, QR codes).
  - `moveElementInCanvas(elements, id, left, top, labelW, labelH, snap)`: Smooth drag-move with label boundary clamping and optional grid snapping.
  - `resizeElementInCanvas(elements, id, handle, deltaX, deltaY, labelW, labelH, snap)`: Corner and edge resizing with element-type specific constraints (barcode min height 5mm, QR min size 8mm, text font scaling, box boundary clamping).
  - `rotateElementInCanvas(elements, id)`: Cycles 90° clockwise rotation (0° $\to$ 90° $\to$ 180° $\to$ 270° $\to$ 0°).
  - `reorderElementInCanvas(elements, id, action)`: Immutably reorders elements for z-ordering (`bringToFront`, `sendToBack`, `moveForward`, `moveBackward`).
  - `deleteElementInCanvas(elements, id)`: Clean immutable element removal.
  - `CanvasHistoryManager<T>`: Robust, branching Undo / Redo history manager storing snapshots in physical millimeters.
  - Updated `exportCanvasToTspl` and `tspl-builder.ts` to output rotation angles across barcodes, texts, and QR codes.
- Re-exported Phase 6 functions, types, and `CanvasHistoryManager` in [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts).
- Created automated test suite [`src/printing/__tests__/element-manipulation.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/element-manipulation.test.ts) and wired into master test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- Created interactive screen [`src/app/phase6-editor.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase6-editor.tsx):
  - Touch-stabilized interactive canvas artboard with zero coordinate jumping.
  - Multi-handle bounding box on active selection: 4 corner resize handles.
  - Top action bar with Undo/Redo buttons, Snap-to-Grid selector chips (Off, 0.5mm, 1.0mm), and Grid overlay toggle lines.
  - Quick manipulation bar: Rotate 90°, Bring to Front, Send to Back, Move Forward, Move Backward, Delete.
  - Add Element controls: + Box, + Text, + Barcode (Code 128), + QR Code.
  - Live Triple Inspector: Physical mm $\leftrightarrow$ Screen px $\leftrightarrow$ 304 DPI printer dots.
  - Live TSPL command generation stream viewer.
  - One-tap "Print Phase 6 via TSPL" button wired to [`PrinterManager.printRawTspl`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts).
- Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx) and added shortcut button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
- Created CLI demonstration script [`scripts/print-phase6-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase6-demo.ts) runnable via `npm run print:phase6 -- [options]`.

### Tests run
- [x] Automated unit test: `snapToGridMm` rounds values to physical millimeter increments — PASS
- [x] Automated unit test: `moveElementInCanvas` updates mm model, clamps to label bounds, and supports snap — PASS
- [x] Automated unit test: `resizeElementInCanvas` enforces min/max dimensions across element types — PASS
- [x] Automated unit test: `rotateElementInCanvas` cycles 90-degree increments and reflects in TSPL commands — PASS
- [x] Automated unit test: `reorderElementInCanvas` handles bringToFront, sendToBack, moveForward, moveBackward — PASS
- [x] Automated unit test: `deleteElementInCanvas` cleanly removes elements — PASS
- [x] Automated unit test: `CanvasHistoryManager` accurately handles multi-step undo, redo, and state branching — PASS
- [x] CLI execution: `npm run print:phase6` simulates complete interactive manipulation flow, undo/redo, and outputs exact TSPL — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Build label using touch manipulation UI (no manual mm entry), export, print, and verify physical result matches on-screen layout within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Physical millimeter data model maintained throughout without pixel drift or premature layout abstractions.

### Open issues / follow-ups
- Awaiting user touch interaction and physical print verification (via Phase 6 Editor screen or via CLI `npm run print:phase6 -- --ip <printer_ip>`) to confirm calipers measurement within ±0.5mm.

### Ready for review: YES

---

## Phase 7: Full End-to-End Print Pipeline — 2026-09-08

### What was implemented
- **PrinterManager Binary Support:**
  - Enhanced [`PrinterManager.printRawTspl(tspl: string | Uint8Array)`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/lib/printer/printer-manager.ts) to accept `Uint8Array` binary payloads containing raw binary `BITMAP` raster streams in addition to ASCII strings.
- **Pipeline & Raster Architecture in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):**
  - Defined `CanvasBitmapRaster` (`leftMm`, `topMm`, `widthMm`, `heightMm`, `widthDots`, `heightDots`, `bytesPerRow`, `data: Uint8Array`).
  - Defined `CanvasPrintJobResult` (`tsplAscii`, `binaryPayload`, `hasBitmap`, `totalBytes`).
  - Defined `ExportCanvasJobOptions` extending `ExportCanvasOptions` with optional `bitmap?: CanvasBitmapRaster`.
  - Implemented `createMonochromePatternRaster(...)`: Generates bit-perfect 1-bit monochrome raster buffers packed MSB-first per byte (1 = black ink dot) with 'checker', 'border', or 'solid' patterns.
  - Implemented `exportUnifiedCanvasJob(...)`:
    - Strict TSPL frame buffer execution order: `SIZE` $\rightarrow$ `GAP` $\rightarrow$ `DIRECTION 1` $\rightarrow$ `CLS` $\rightarrow$ `BITMAP` $\rightarrow$ Overlays (`BOX`, `TEXT`, `BARCODE`, `QRCODE`) $\rightarrow$ `PRINT`.
    - Outputs both human-readable `tsplAscii` (with clean `[...binary raster: X bytes...]` placeholder) and atomic `binaryPayload` (`Uint8Array`) ready for socket transmission.
- **Re-exports in [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts):**
  - Exported `createMonochromePatternRaster`, `exportUnifiedCanvasJob`, `CanvasBitmapRaster`, `CanvasPrintJobResult`, and `ExportCanvasJobOptions`.
- **Automated Test Suite in [`src/printing/__tests__/pipeline.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/pipeline.test.ts):**
  - Verified synthetic 1bpp raster byte alignment and ink packing.
  - Verified multi-size vector print jobs (50×30, 60×40, 80×50 mm).
  - Verified hybrid bitmap + vector overlay jobs with exact binary payload layout.
  - Verified frame buffer command execution order (`CLS` before `BITMAP`, `BITMAP` before overlays, `PRINT` last).
  - Wired into master runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- **Interactive Screen [`src/app/phase7-pipeline.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase7-pipeline.tsx):**
  - Multi-size preset selector (50×30, 60×40, 80×50 mm) and custom mm geometry inputs.
  - Background raster selector (None, Checkerboard, Border Frame, Solid Ink).
  - Live canvas preview with scaled vector elements, real SVG barcode bars, and QR code.
  - Triple-tab inspector: Visual Preview, TSPL Wire Inspector (total payload, dot dimensions, raw command stream), and Elements Verification list with scannability badges.
  - Direct "Print Full Label Job" action sending `Uint8Array` binary payloads via `PrinterManager.printRawTspl`.
- **Navigation & Scripts:**
  - Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx).
  - Added shortcut in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
  - Created CLI demonstration script [`scripts/print-phase7-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase7-demo.ts) runnable via `npm run print:phase7 -- [options]`.
  - Added `"print:phase7"` to [`package.json`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/package.json).

### Tests run
- [x] Automated unit test: `createMonochromePatternRaster` generates byte-aligned 1bpp rasters — PASS
- [x] Automated unit test: Multi-size vector print jobs (50×30, 60×40, 80×50 mm) generate valid TSPL — PASS
- [x] Automated unit test: Hybrid bitmap + vector overlay payload is bit-perfect — PASS
- [x] Automated unit test: Frame buffer execution order (`CLS` $\rightarrow$ `BITMAP` $\rightarrow$ `OVERLAYS` $\rightarrow$ `PRINT`) verified — PASS
- [x] Master test suite: `npm run test:print` (all phases 0 through 7) — 100% PASS
- [x] CLI execution: `npm run print:phase7` (50×30 mm, checkerboard bitmap + overlays) — PASS (27,221 bytes payload)
- [x] CLI execution: `npm run print:phase7 -- --size 60x40` (60×40 mm) — PASS (43,406 bytes payload)
- [x] CLI execution: `npm run print:phase7 -- --size 80x50 --withBitmap false` (80×50 mm pure vector) — PASS (274 bytes payload)
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Dispatch end-to-end multi-element job with background to physical thermal printer, measure with calipers to confirm zero distortion within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Physical millimeter data model strictly maintained; TSPL binary payload conforms strictly to hardware TSPL specification.

### Open issues / follow-ups
- Awaiting user physical verification on printer (either via app at Phase 7 Pipeline screen or via CLI `npm run print:phase7 -- --ip <printer_ip>`) to confirm calipers/ruler measurement within ±0.5mm.

### Ready for review: YES

---

## Phase 8: Automatic Shape/Contour Detection — 2026-09-08

### What was implemented
- **Contour & Geometric Shape Engine in [`src/printing/contour-detection.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/contour-detection.ts):**
  - Built pure-TypeScript 2D pixel luminance and alpha analyzer with zero native C++/OpenCV dependencies.
  - Implemented `detectLabelContour(...)` to classify shapes into standard archetypes:
    - `'rectangle'`: Sharp corners, fill ratio $\ge 0.95$, corner void $\approx 0$.
    - `'roundedRectangle'`: Symmetric corner voids, fill ratio $0.80 - 0.98$, corner radius calculated from missing corner area $(4 - \pi)R^2$.
    - `'circle'`: Aspect ratio $0.92 - 1.08$, circular fill $\approx \pi/4 \approx 0.785$, low corner fill.
    - `'ellipse'`: Elliptical profile with non-square aspect ratio.
    - `'diecut'`: Concave/narrowed waists (barbell jewelry tags, cable flags, notched stock).
  - Extracted outer bounding box $(x_{min}, y_{min}, x_{max}, y_{max})$, aspect ratio, corner radius in mm, and 16 raycasted normalized polygon contour points.
  - Built `createSyntheticLabelImage(...)`: Deterministic test image generator for all 5 shape types on contrasting backgrounds.
  - Built `generateShapeBoundaryRaster(...)`: Generates sub-millimeter 1-bit monochrome raster boundaries for rounded rectangles and die-cut shapes.
- **TSPL Shape Boundary Integration in [`src/printing/tspl-builder.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/tspl-builder.ts) and [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):**
  - Added `drawCircle(xMm, yMm, diameterMm, thicknessMm)` to `TsplBuilder`.
  - Added `shape?: LabelShapeDefinition` to `CanvasDocument`.
  - Updated `exportCanvasBoundaryToTspl` to emit `CIRCLE` for circles and `BITMAP` for rounded rectangles/die-cuts.
  - Added `exportCanvasBoundaryJob(...)`: Produces atomic `CanvasPrintJobResult` with `binaryPayload` and `tsplAscii` for any shape.
- **Re-exports in [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts):**
  - Exported `detectLabelContour`, `createSyntheticLabelImage`, `generateShapeBoundaryRaster`, `exportCanvasBoundaryJob`, and shape types.
- **Automated Test Suite in [`src/printing/__tests__/shape-detection.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/shape-detection.test.ts):**
  - Verified sharp rectangle detection ($AR \approx 1.67$, fill ratio $\ge 0.95$).
  - Verified rounded rectangle detection with corner radius estimation within $\pm 0.5\,\text{mm}$.
  - Verified circle detection ($AR \approx 1.0$, fill ratio $\approx 0.785$).
  - Verified die-cut barbell tag detection with normalized polygon points.
  - Verified TSPL boundary exports across `BOX`, `CIRCLE`, and 1bpp `BITMAP` raster.
  - Wired into master test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- **Interactive Screen [`src/app/phase8-shape-detect.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase8-shape-detect.tsx):**
  - Image picker from gallery + one-tap presets (Sharp Rectangle, Rounded Badge, Round Bottle, Barbell Die-Cut).
  - Detection result card showing detected shape archetype, confidence score, aspect ratio, fill ratio, and estimated radius.
  - Shape override tabs (`Rectangle`, `Rounded`, `Circle`, `Die-Cut`).
  - Corner radius stepper controls ($1\,\text{mm}$ to $15\,\text{mm}$).
  - Dimension inputs ($W \times H\,\text{mm}$ and Gap).
  - "Force Manual Rectangle" fallback toggle (preserving Phase 3 default manual rectangle workflow).
  - Live SVG canvas displaying the detected/selected boundary overlaid on the label reference image.
  - TSPL terminal inspector and one-tap "Print Shape Boundary via TSPL" button wired to `PrinterManager.printRawTspl`.
- **Navigation & Scripts:**
  - Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx).
  - Added button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
  - Built CLI script [`scripts/print-phase8-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase8-demo.ts) runnable via `npm run print:phase8 -- [options]`.
  - Added `"print:phase8"` to [`package.json`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/package.json).

### Tests run
- [x] Automated unit test: Sharp rectangle accurately detected with high confidence — PASS
- [x] Automated unit test: Rounded rectangle detected with corner radius estimation — PASS
- [x] Automated unit test: Circular label detected with aspect ~1.0 and fill ~0.785 — PASS
- [x] Automated unit test: Die-cut irregular tag detected with raycasted polygon points — PASS
- [x] Automated unit test: TSPL boundary generation verified across rectangle, circle, rounded, and die-cut — PASS
- [x] Master test suite: `npm run test:print` (all phases 0 through 8) — 100% PASS
- [x] CLI execution: `npm run print:phase8` (rounded rectangle default) — PASS (27,009 bytes payload)
- [x] CLI execution: `npm run print:phase8 -- --shape circle` (circle 40x40mm) — PASS (`CIRCLE 0,0,479,4`, 80 bytes payload)
- [x] CLI execution: `npm run print:phase8 -- --shape diecut` (diecut tag) — PASS (27,009 bytes payload)
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Print auto-detected non-rectangular boundary (rounded badge / circle / diecut tag) to thermal printer and confirm physical printed boundary matches real label stock within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Kept detection pure TypeScript without native binary dependencies for maximum portability; manual rectangle fallback preserved as default.

### Open issues / follow-ups
- Awaiting user physical verification on printer (either via app at Phase 8 Shape Detection screen or via CLI `npm run print:phase8 -- --ip <printer_ip>`) to confirm calipers/ruler measurement within ±0.5mm.

### Ready for review: YES

---

## Phase 9: Robustness, Multi-DPI, Media Sensors, Batch Printing & Caliper Calibration — 2026-09-08

### What was implemented
- **Multi-DPI Architecture in [`src/printing/calibration.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/calibration.ts) and [`src/printing/tspl-builder.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/tspl-builder.ts):**
  - Added `SupportedDpi` type (`203 | 300 | 304 | 600`).
  - Added `computeDotsPerMm(dpi)` calculating exact unrounded floating dots/mm (e.g. 203 DPI = 7.9921 dpm, 300 DPI = 11.8110 dpm, 304 DPI = 11.9685 dpm, 600 DPI = 23.6220 dpm).
  - Updated `TsplBuilder` to accept optional `TsplBuilderOptions` (`dpi` and `calibrationScale?: { scaleX?: number; scaleY?: number }`), dynamically calculating `dpmX` and `dpmY`.
  - Updated `generateCalibrationTspl` to accept `dpi` and `calibrationScale`.
- **Media Sensor TSPL Commands:**
  - Added `MediaSensorType = 'gap' | 'blackmark' | 'continuous'`.
  - Added `setBline(heightMm, offsetMm)` and `setSensor(type, paramMm, offsetMm)` to `TsplBuilder`.
  - Updated `exportCanvasBoundaryToTspl`, `exportCanvasBoundaryJob`, `exportCanvasToTspl`, and `exportUnifiedCanvasJob` to emit appropriate sensor commands:
    - Transmissive Gap: `GAP <gap> mm, 0 mm`
    - Reflective Black Mark: `BLINE <height> mm, 0 mm`
    - Continuous Roll: `GAP 0 mm, 0 mm`
- **Batch Printing with Sequential Variable Data Merge:**
  - Implemented `substituteSequencePlaceholders(template, seqNum, defaultPad)` supporting `{seq}`, `{{seq}}`, `{serial}`, `{seq:001}` (3-digit padding), and `{seq:4}` (4-digit padding) across text, barcodes, and QR codes.
  - Implemented `exportBatchCanvasJob(doc, count, options)`: Emits common job setup commands once (`SIZE`, sensor command, `DIRECTION`), followed by atomic sequential label blocks (`CLS` $\to$ `BITMAP` $\to$ merged vector overlays $\to$ `PRINT 1`).
- **Pre-Flight Print Job Validation in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts):**
  - Implemented `validateCanvasPrintJob(doc, options)`: Inspects document geometry, max head width (defaults to 108mm), element clipping/overflow, negative coordinates, and symbology scannability.
  - Returns structured `PrintValidationReport` (`isValid`, `errors: PrintValidationIssue[]`, `warnings: PrintValidationIssue[]`) with actionable fix recommendations.
- **Caliper Micro-Recalibration Flow:**
  - Implemented `calculateCalibrationAdjustment(expectedW, measuredW, expectedH, measuredH, nominalDpi)` in `src/printing/calibration.ts`.
  - Calculates $S_x = \text{expectedW} / \text{measuredW}$ and $S_y = \text{expectedH} / \text{measuredH}$ to correct thermal platen roller slip and micro-stepping variances.
  - Wireable directly to `calibrationScale` in all export functions and CLI script.
- **Re-exports in [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts):**
  - Re-exported Phase 9 types and functions (`SupportedDpi`, `computeDotsPerMm`, `calculateCalibrationAdjustment`, `MediaSensorType`, `BatchJobOptions`, `BatchPrintJobResult`, `exportBatchCanvasJob`, `substituteSequencePlaceholders`, `PrintValidationIssue`, `PrintValidationReport`, `validateCanvasPrintJob`, `setBline`, `TsplBuilderOptions`).
- **Automated Unit Test Suite in [`src/printing/__tests__/robustness.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/robustness.test.ts):**
  - Verified multi-DPI dot scaling across 203, 300, 304, and 600 DPI.
  - Verified media sensor commands (`GAP`, `BLINE`, and continuous `GAP 0`).
  - Verified placeholder substitution with various padding patterns (`{seq}`, `{seq:001}`, `{seq:4}`, `{serial}`).
  - Verified batch printing stream generation with multi-label sequence progression.
  - Verified pre-flight validation (oversized label, negative bounds, clipped barcodes, empty text, non-square circle).
  - Verified caliper adjustment factor calculations and dot scaling.
  - Wired into master test runner [`src/printing/__tests__/engine.test.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/__tests__/engine.test.ts).
- **Interactive UI Screen [`src/app/phase9-robustness.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase9-robustness.tsx):**
  - Interactive DPI selector (203, 300, 304, 600 DPI) with live dots/mm calculation.
  - Media sensor selector (Gap, Black Mark, Continuous) with customizable parameters.
  - Sequential batch sequence studio with multi-label preview strip.
  - Caliper re-calibration flow calculating $S_x, S_y$ scale factors from caliper measurements.
  - Pre-flight diagnostic card showing live pass/warning/error issues.
  - Live TSPL terminal inspector and direct "Print Batch" button.
- **Navigation & CLI:**
  - Registered route in [`src/app/_layout.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/_layout.tsx).
  - Added button in [`src/app/calibration-print.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/calibration-print.tsx).
  - Created CLI script [`scripts/print-phase9-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase9-demo.ts) runnable via `npm run print:phase9 -- [options]`.
  - Added `"print:phase9"` to [`package.json`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/package.json).

### Tests run
- [x] Automated unit test: Multi-DPI dot scaling verified across 203, 300, 304, 600 DPI — PASS
- [x] Automated unit test: Media sensor commands (gap, black mark, continuous) verified — PASS
- [x] Automated unit test: Sequential variable data placeholder substitution verified — PASS
- [x] Automated unit test: Batch printing TSPL stream generation & data merge verified — PASS
- [x] Automated unit test: Pre-flight validation diagnostics verified — PASS
- [x] Automated unit test: Caliper micro-recalibration adjustment factor calculations verified — PASS
- [x] Master test suite: `npm run test:print` (all phases 0 through 9) — 100% PASS
- [x] CLI execution: `npm run print:phase9` (default 304 DPI, Gap, 3 labels) — PASS (717 bytes payload)
- [x] CLI execution: `npm run print:phase9 -- --dpi 203 --sensor blackmark --bline 4 --measuredW 49.2 --measuredH 30.3` — PASS (scaled dots & BLINE command)
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Print sequential batch job (3 labels) to thermal printer and confirm physical gap/black mark registration and sequential data advance — PENDING USER MEASUREMENT

### Deviations from plan
None. The implementation strictly adheres to the approved Phase 9 specification, maintains physical millimeters as ground-truth, and integrates smoothly with existing Phase 0–8 subsystems.

### Open issues / follow-ups
- Awaiting user physical verification on thermal printer (either via app at Phase 9 screen or via CLI `npm run print:phase9 -- --ip <printer_ip>`) to confirm gap/black mark calibration and sequential batch printout.

### Ready for review: YES

---

## Phase 3 (Reworked): Size-First Import Flow with Ruled Canvas — 2026-09-08

> [!NOTE]
> **SUPERSEDES AND REPLACES ORIGINAL PHASE 3:** This entry documents the corrected size-first import flow with ruled measurement canvas specified in [`fix.md`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/fix.md), replacing the previous image-first / simultaneous flow, auto-fitting, aspect-ratio mismatch warnings, and automatic dimension suggestions.

### What was implemented
- **Size Entry Gate (Physical Millimeter Commitment):**
  - Physical label dimensions (`labelWidthMm`, `labelHeightMm`) and `gapMm` must be entered and confirmed before image import is accessible.
  - Size inputs remain interactive at any time. When committed, entering or altering dimensions never gets overridden by imported images.
  - Image import actions (photo library and demo sample label) are strictly gated and disabled until valid positive dimensions are confirmed.
- **Physical Ruled Measurement Canvas:**
  - Added physical millimeter ruler strips along the top ($X$-axis, label width) and left ($Y$-axis, label height) canvas edges.
  - Implemented pure `generateRulerTicks(lengthMm, stepMm = 1): RulerTick[]` in [`src/printing/canvas-export.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/canvas-export.ts) generating:
    - Major ticks (10 mm) with numeric distance labels.
    - Mid ticks (5 mm) for quick visual reference.
    - Minor ticks (1 mm) for precision calibration.
  - Synchronous zoom scaling: Ruler ticks calculate screen pixel coordinates using `mmToScreenPx(tick.mm, baseScale * zoomFactor)`, guaranteeing exact 1:1 parity with canvas elements across all zoom levels (0.5× to 3.0×).
- **Freeform Image Overlay Placement:**
  - Imported image lands as a freeform reference layer with physical coordinates (`leftMm`, `topMm`, `widthMm`, `heightMm`) initialized to the label boundaries.
  - Non-locked corner drag handles (`applyResizeToMm`) allowing the user to stretch, reposition, and align reference photos against physical ruler markings without forced aspect ratios or auto-fitting.
  - Live physical coordinate badge displaying current image `(x, y)` and `(w × h)` in millimeters.
- **"Continue to Design" Gate:**
  - Added explicit one-way unlock button: "Continue to Design" confirming reference alignment.
  - Design tools (Text, Barcode, QR Code, Box) are locked/hidden until the user confirms placement.
  - Once confirmed, tools remain unlocked for the session while allowing optional further reference fine-tuning.
- **Visibility Toggle & Removal:**
  - Reference photo can be toggled visible/hidden at any time without resetting placement or document geometry.
  - "Remove Image" permanently clears the reference layer, restoring clean blank canvas.
- **Non-Printing Guarantee & Boundary Verification:**
  - TSPL canvas boundary export (`BOX 0,0,x1,y1,thickness`) emits the exact physical footprint of the committed label dimensions.
  - Zero bitmap raster data emitted for the background reference image (guaranteed non-printing reference).
- **Re-exports & Public API:**
  - Updated [`src/printing/index.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/printing/index.ts) to export `generateRulerTicks` and `type RulerTick`. Removed deprecated aspect ratio helpers.
- **Interactive UI Screen [`src/app/phase3-image-import.tsx`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/src/app/phase3-image-import.tsx):**
  - Step 1: Physical Size Entry card with presets and commit button.
  - Step 2: Image Import controls (Gallery / Demo Sample).
  - Step 3: Top and Left rulers framing the live canvas with zoom controls.
  - Step 4: Draggable, corner-resizable freeform image layer.
  - Step 5: "Continue to Design" gate button.
  - Step 6: Design-tool controls (Text, Barcode, QR, Box) enabled after confirmation.
  - Step 7: Opacity and Visibility toggles.
  - Step 8: "Remove Reference Photo" action.
  - Step 9: Live TSPL Boundary Inspector and direct "Print Canvas Boundary via TSPL" button.
- **CLI Demonstration Script [`scripts/print-phase3-demo.ts`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/scripts/print-phase3-demo.ts):**
  - Demonstrates size commitment, ruler generation inspection, freeform placement coordinates, and TSPL boundary generation (`npm run print:phase3`).

### Tests run
- [x] Automated unit test: Size gate blocks image import until both mm fields have valid positive values — PASS
- [x] Automated unit test: Ruler tick generation and positions match `mmToScreenPx` across zoom levels (0.5×, 1.0×, 2.0×) — PASS
- [x] Automated unit test: Freeform image moving and resizing adjusts image mm coordinates without altering canvas dimensions — PASS
- [x] Automated unit test: Design-tool controls are gated before "Continue to Design" and unlocked after — PASS
- [x] Automated unit test: Hiding background image updates visibility flag without altering TSPL output — PASS
- [x] Automated unit test: Removing background reference clears reference object cleanly — PASS
- [x] Automated unit test: Canvas boundary export emits exact physical footprint (`BOX 0,0,598,359,4`) with 0 bitmap ink — PASS
- [x] Master test suite: `npm run test:print` (all phases 0 through 9) — 100% PASS
- [x] CLI execution: `npm run print:phase3 -- --labelWidth 50 --labelHeight 30` outputs exact ruler guides and TSPL boundary — PASS
- [x] Type checking: `npx tsc --noEmit` clean with 0 errors across entire workspace — PASS
- [ ] Physical test: Import reference photo on size-gated ruled canvas, align to physical markings, print boundary box to thermal printer, and confirm outer footprint matches real label within ±0.5mm — PENDING USER MEASUREMENT

### Deviations from plan
None. Reworked strictly per [`fix.md`](file:///c:/Users/omen/OneDrive/Desktop/sez-print/fix.md) specifications.

### Open issues / follow-ups
- Awaiting user physical print verification of the canvas boundary box on their physical printer (via Phase 3 screen or `npm run print:phase3 -- --ip <printer_ip>`).

### Ready for review: YES
