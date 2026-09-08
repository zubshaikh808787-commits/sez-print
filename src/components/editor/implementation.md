# Feature Plan: Import → Design → Pixel-Perfect TSPL Label Printing

## How to use this document (read this first, agent)

This is a **phased build plan**. Work on exactly **one phase at a time**, in order.

For every phase you must:
1. Implement only what that phase lists. Do not borrow work from later phases "while you're in there."
2. Run every test listed under that phase — both automated and physical/manual.
3. Append a new dated entry to `PROGRESS.md` (template at the bottom of this file) describing what was built, what was tested, what passed/failed, and any deviations from the plan.
4. **Stop and wait.** Do not start the next phase until the human has reviewed `PROGRESS.md` and given the go-ahead. If a test fails, fix it within the same phase — don't move on with a known-broken foundation.

Keep the implementation lean. Prefer the simplest thing that passes the tests over a "flexible" or "future-proof" abstraction. No plugin systems, no generic shape engines, no config-driven architectures unless a phase explicitly asks for one.

---

## Core idea (read this before writing any code)

Everything in this feature hinges on **one source of truth: physical units (mm), not pixels.**

- The label's real-world size (width × height in mm) is the ground truth.
- The on-screen canvas is just *one possible rendering* of that mm-space, at whatever zoom/DPI the screen happens to use.
- The printer output is *another rendering* of that same mm-space, at the printer's DPI — **304 dots/inch** for this printer (≈ 11.9685 dots/mm; don't round this to 12 — over a 100mm label that rounding error alone is ~3mm off).
- "Pixel-perfect" doesn't mean matching pixels — it means the physical millimeters printed match the physical millimeters designed, regardless of screen resolution.

So: store every element's position and size in **mm** (or a fixed high-precision unit like 1/100 mm). Convert to screen px only at render time (`px = mm * screenDPI / 25.4`), and convert to printer dots only at TSPL-export time (`dots = mm * printerDPI / 25.4`). Never store screen pixels as the model — that's the #1 way "it looked right but printed wrong" bugs happen.

---

## Phase 0 — Printer Connectivity & Ground-Truth Calibration

**Goal:** Prove you can send raw TSPL to the physical printer and get a correctly-sized print, before any UI exists.

**Tasks:**
- Establish a connection to the label printer (USB/serial/network — whichever the target printer uses).
- Send a minimal raw TSPL script by hand:
  ```
  SIZE 50 mm, 30 mm
  GAP 2 mm, 0 mm
  CLS
  BOX 10,10,390,190,2
  PRINT 1
  ```
- Printer DPI is **304**. Set `PRINTER_DPI = 304` as a hardcoded constant for now, and compute `DOTS_PER_MM = 304 / 25.4` (≈ 11.9685) — keep this as a floating-point constant, not a rounded integer, since rounding compounds error across the label.

**Tests (all manual/physical — write down actual numbers):**
- [ ] Printer connects and accepts commands without error.
- [ ] Print a box sized exactly 40mm × 20mm via TSPL. Measure the printed box with a ruler/calipers. Must be within ±0.5mm.
- [ ] Repeat at a different size (e.g. 80mm × 15mm) to confirm it's not a fluke.
- [ ] Confirm the physical measurements match what 304 DPI predicts (not 203 or 300 — some TSPL printers report/round differently in their spec sheet than reality, so this print-and-measure step is what actually confirms 304 is correct, not just the spec sheet).

**Deliverable:** A tiny script/CLI tool that takes mm dimensions and prints a calibration box. `PRINTER_DPI` constant recorded in code/config.

**Do not proceed until physical measurements are within tolerance.** If they're not, the DPI constant or unit math is wrong — fix here, because every later phase builds on it.

---

## Phase 1 — TSPL Command Builder (no UI yet)

**Goal:** A small, well-tested library that turns simple typed instructions into valid TSPL, using mm as the input unit everywhere.

**Tasks:**
- Build functions for at minimum: `setSize(widthMm, heightMm)`, `setGap(gapMm)`, `clear()`, `drawBox(xMm, yMm, wMm, hMm, thicknessMm)`, `drawText(xMm, yMm, text, fontSize)`, `drawBarcode(xMm, yMm, data, type)`, `drawQrCode(xMm, yMm, data)`, `print(copies)`.
- All functions accept mm and internally convert to dots using `PRINTER_DPI` from Phase 0.
- Output is a plain TSPL string (or byte buffer) — this library has no knowledge of the UI/canvas yet.

**Tests:**
- [ ] Unit tests: given known mm inputs, assert the generated TSPL contains the correct dot values (pure math, no printer needed).
- [ ] Physical test: generate TSPL for a box + text + barcode layout, print it, measure box dimensions and position with a ruler — within ±0.5mm.
- [ ] Physical test: scan the printed barcode with a barcode scanner/phone app, confirm it decodes to the correct data.
- [ ] Edge case test: very small element (5mm) and near-full-label-size element both print without clipping or rounding errors.

**Deliverable:** Standalone TSPL builder module + its test suite (can run headless except the physical print tests).

---

## Phase 2 — Canvas Foundation (mm-based model, screen rendering, no image import yet)

**Goal:** An on-screen editor canvas that represents a label of a given mm size, with the mm-first data model from the start. No image import, no barcode UI yet — just prove the coordinate system is right.

**Tasks:**
- User can input label width/height in mm (simple number fields for now — no auto shape detection).
- Canvas renders a rectangle at that size, scaled to fit the screen (screen px = mm × chosen screen DPI, with a zoom factor on top — zoom must never touch the underlying mm model).
- Add exactly one element type for this phase: a rectangle/box, draggable and resizable on screen.
- Every element's true state is stored in mm. Screen px is derived only for rendering; dragging on screen converts back to mm before saving state.

**Tests:**
- [ ] Automated: moving/resizing an element on screen and reading back its model state returns the expected mm values (test the px↔mm conversion both directions).
- [ ] Automated: changing zoom level does not change any element's stored mm values.
- [ ] Physical: place a box at a known mm position/size on the canvas, export via the Phase 1 TSPL builder, print it, and measure — position and size within ±0.5mm of what the canvas showed.

**Deliverable:** Basic editor canvas + box element, backed by an mm-based model, wired to the Phase 1 TSPL builder for export/print.

---

## Phase 3 — Image Import as Background Reference

**Goal:** User can import a photo/scan of a label and use it as a sizing/tracing reference. Keep this simple: **manual size entry**, not automatic shape detection (that's a stretch phase later).

**Tasks:**
- User uploads an image file.
- User types in the real-world width & height (mm) that this image represents.
- Image is placed on the canvas as a non-printing background reference, scaled to exactly fill that mm-sized canvas (so 1mm on the label image = 1mm on the canvas, consistent with Phase 2's model).
- Canvas boundary becomes a plain rectangle at the entered size (no contour/shape detection yet — defer that).

**Tests:**
- [ ] Automated: entering W×H mm and uploading an image results in the canvas bounding box matching those mm values exactly.
- [ ] Visual check: image doesn't stretch/distort — aspect ratio warning shown if the entered mm size doesn't match the image's own aspect ratio (don't silently distort).
- [ ] Physical: import an image of a real label of known size, enter its actual mm dimensions, confirm the printed *canvas boundary* (just the rectangle, no elements yet) matches the real label's footprint within ±0.5mm.

**Deliverable:** Image import + manual size entry, background reference rendering on the mm-based canvas.

---

## Phase 4 — Text Elements

**Goal:** Add real text elements on top of the reference image, using real font sizing in mm/points, mapped correctly to TSPL text commands.

**Tasks:**
- Add a text element type: position (mm), font size, content, editable.
- Ensure font size in the canvas preview visually matches the font size that TSPL will actually print (TSPL text commands use fixed font multipliers — pick a mapping and document it).

**Tests:**
- [ ] Automated: text element mm position/size round-trips correctly through the model (same as Phase 2 box tests).
- [ ] Physical: print a label with 2–3 text elements at specific mm positions and font sizes; measure text baseline position and cap-height with calipers; compare against the preview — flag anything off by more than ~1mm or one font-size step.

**Deliverable:** Text elements fully working end-to-end (canvas → TSPL → print).

---

## Phase 5 — Barcode / QR Code Elements

**Goal:** Add scannable barcode and QR elements, correctly sized and positioned.

**Tasks:**
- Add barcode element (choose one common symbology first, e.g. Code128) and QR code element.
- Position + size in mm, using Phase 1's `drawBarcode`/`drawQrCode`.

**Tests:**
- [ ] Physical: print several barcodes/QR codes at different sizes and positions; scan every one with a phone/scanner and confirm correct decoded data.
- [ ] Physical: confirm barcode/QR footprint size on paper matches the mm size set in the editor (±0.5mm) — undersized barcodes are a common real-world failure (unscannable).
- [ ] Edge case: barcode data too long / QR at minimum readable size — confirm it still scans or the UI warns before printing.

**Deliverable:** Barcode + QR elements working end-to-end.

---

## Phase 6 — Element Manipulation & Editing UX

**Goal:** Make the editor usable: select, move, resize, rotate, delete, layer/reorder elements — all still mm-model-first.

**Tasks:**
- Selection, drag-move, resize handles, delete, basic z-ordering (bring to front/back).
- Optional: snap-to-grid in mm (e.g. snap to 1mm or 0.5mm increments) — keep this simple, no magnetic guides system.

**Tests:**
- [ ] Automated: every interaction (move/resize/rotate/delete/reorder) correctly updates the mm model, and undo (if implemented) restores prior mm state exactly.
- [ ] Physical: build one label using only the mouse/touch UI (no manual mm entry), export, print, and verify the physical result matches the on-screen layout by eye and by a couple of spot-check measurements.

**Deliverable:** A usable editor for composing a full multi-element label.

---

## Phase 7 — Full End-to-End Print Pipeline

**Goal:** Combine background image + all element types into a single TSPL print job and validate the whole pipeline together, across multiple label sizes.

**Tasks:**
- Wire "Print" button: canvas state → full TSPL script (background image as `BITMAP`, plus all elements) → sent to printer.
- Support at least 2–3 different label sizes/aspect ratios to make sure nothing is hardcoded to one size.

**Tests:**
- [ ] Physical: for each of 3 different label sizes, design a label with image + text + barcode, print it, and measure the overall label footprint and at least 2 internal element positions. All within ±0.5mm.
- [ ] Visual comparison: photograph the printed label at the same scale as a canvas screenshot and overlay them (even roughly) to sanity-check alignment.
- [ ] Regression: re-run the Phase 1 and Phase 0 physical tests to confirm nothing drifted.

**Deliverable:** Working end-to-end feature: import → set size → design → print, pixel-perfect (i.e., mm-perfect) output.

---

## Phase 8 (Stretch, optional) — Automatic Shape/Contour Detection

**Goal:** Only attempt this after Phase 7 is solid and reviewed. Auto-detect the label's outer boundary shape from the imported image (instead of the user always getting a plain rectangle), for die-cut/irregular labels.

**Tasks:**
- Basic edge/contour detection on the imported image to find the outer boundary.
- Let the user confirm/adjust the detected shape before locking in size.
- Keep the "manual rectangle" path from Phase 3 as the fallback/default — don't remove it.

**Tests:**
- [ ] Test against several real label photos (rectangle, rounded-rect, circle, die-cut) — detection should be reasonable, not perfect; a manual override must always be available.
- [ ] Physical: print a label using an auto-detected non-rectangular shape and confirm the boundary is close to the real label.

**Deliverable:** Optional shape detection layered on top of the existing working manual-entry flow.

---

## Phase 9 (as needed) — Robustness & Edge Cases

Only tackle after the core flow (Phases 0–7) is confirmed working. Pick items relevant to your actual printer/use case rather than doing all of them speculatively:
- Multiple printer DPI support (203/300/600) instead of one hardcoded constant.
- Gap sensor vs black-mark sensor label stock.
- Multiple copies / batch printing with data merge (e.g. sequential barcodes).
- Printer-not-connected / error handling and user-facing messages.
- Re-calibration flow if a user's specific printer prints slightly off from the assumed DPI.

---

## `PROGRESS.md` template (create this file, append one entry per phase)

```markdown
# Progress Log

## Phase <N>: <phase name> — <date>

### What was implemented
- ...

### Tests run
- [ ] <test> — PASS/FAIL — <measured value if physical>
- [ ] <test> — PASS/FAIL

### Deviations from plan
- ...

### Open issues / follow-ups
- ...

### Ready for review: YES/NO
```

Provide this `PROGRESS.md` back after each phase for feedback before starting the next one.