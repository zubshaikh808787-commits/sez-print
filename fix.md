# Phase 3 Rework: Size-First Import Flow with a Ruled Measurement Canvas

## Why this document exists

The existing Phase 3 implementation was built against the wrong flow: image import first (or simultaneous with size), auto-fit-to-canvas, aspect-ratio-mismatch warnings with "fix width/height" suggestions. That's not what the reference app does, and it's not what this feature needs.

The real flow is: **the user commits to a physical size first. Only then do they import an image, and only then do they manually place it themselves against a ruled canvas that constantly shows them the real-world scale.** Nothing is auto-fitted. The ruler is the thing that makes manual placement possible and accurate — it's the core new piece, not a decoration.

This document replaces the Phase 3 section of the original plan. Treat it as a rework of an existing feature, not new scope — the underlying mm-based data model, TSPL export, and printing pipeline from Phases 0–2 and 7 stay exactly as they are. Only the import/placement UI flow changes.

---

## User-facing flow, step by step

1. **Import entry point** — unchanged, stays exactly where it currently lives in the app.
2. **Size prompt (gate).** Tapping import does not open a file picker. It first asks for the label's physical size: width (mm) and height (mm). The user cannot proceed without entering both.
3. **Image prompt.** Only after size is confirmed does the app prompt the user to pick/import an image file.
4. **Editor opens on a ruled canvas.** The canvas is sized to the mm dimensions from step 2. It displays ruler/scale guide marks along the top and left edges, in millimeters, so the user always has a physical-size reference while working — regardless of zoom level.
5. **Image lands as a freeform overlay.** The imported image appears on the canvas as a draggable, resizable layer. There is no auto-fit, no forced aspect lock, no distortion warning. The user drags and resizes it by hand, using the ruler as their reference, until it covers the canvas the way they want.
6. **Explicit "Continue to design" gate.** Text, QR, barcode, and other design tools are disabled/hidden until the user confirms they're done placing the image (a single button press — e.g. "Continue" or "Done placing image"). Once pressed, the rest of the editor unlocks.
7. **Design phase.** User adds text, QR, barcode, shapes, etc., same as the already-built editor phases (4–6) — nothing changes here.
8. **Image visibility toggle.** At any point, including right before printing, the user can hide/show or fully remove the background reference image, leaving only the design elements.
9. **Print.** Printing works exactly as already implemented (Phase 7 pipeline): the canvas's mm dimensions are the print source of truth; the reference image, if still visible, is never rasterized into the print output — it is purely an on-screen aid.

---

## Component-by-component requirements

### 1. Size Entry Gate

- A form with two numeric fields: width (mm), height (mm). Optional: a gap/media-type field if your existing size-entry step already collects that — don't add it here if it wasn't there before.
- The import/file-picker action is unreachable (disabled, or simply not shown) until both fields have valid positive values.
- No image, no canvas, no editor exists yet at this point — this step produces exactly one thing: a confirmed `labelWidthMm` / `labelHeightMm` pair.

### 2. Import Prompt

- Standard image picker (gallery/camera/file), triggered only after step 1 completes.
- No size logic here at all — this step's only job is getting image bytes/URI into the app. Do not read the image's own pixel dimensions to suggest or override the size entered in step 1.

### 3. Ruler / Scale Guide Canvas — the core new component

This is the main thing being added. It must be driven by the exact same mm-based model already used for element positioning (Phases 2 and onward) — no separate unit system, no separate scale factor.

**Purpose:** give the user a constant, physically-accurate visual reference for size while they manually place/resize the image and, later, design elements. Without it, freeform placement is just guessing.

**Requirements:**
- A horizontal ruler strip along the top edge of the canvas, and a vertical ruler strip along the left edge.
- Tick marks in millimeters. Use a two-tier scheme: a major tick every 10mm with a numeric label (e.g. "0", "10", "20"...), and minor unlabeled ticks every 1mm (or every 5mm if 1mm reads as too dense on small screens — pick one and be consistent).
- Ruler origin (0mm) aligns with the canvas's own origin — the same coordinate origin already used for element `left`/`top` in mm.
- Tick spacing must scale exactly with zoom: if the canvas is zoomed to 2×, tick spacing in screen px doubles too, but the tick *labels* stay in real mm values (a tick still says "20" at the position representing 20mm from origin, just spaced further apart in pixels). This should reuse the exact same `mm → px` conversion function already used to render everything else on the canvas — do not write a second conversion path for the ruler.
- Ruler must re-render live as the user pans/zooms the canvas (if panning is supported) so it always reflects the current visible mm range.
- The ruler itself is not an element in the document model — it's a UI overlay only, never exported to TSPL and never printed.

**What NOT to build here:** don't build a general-purpose configurable ruler system (custom units, custom tick intervals, draggable guides/snap-lines off the ruler). Just a fixed mm ruler with major/minor ticks. If snapping-to-ruler-guides feels valuable later, that's a separate future addition, not part of this rework.

### 4. Image Overlay Layer (freeform placement)

- The imported image renders as a layer on the canvas, positioned/sized in the same mm-based coordinate space as everything else (store its position and size in mm, exactly like the box/text/barcode elements already do).
- Provide drag-to-move and corner-handle resize, same interaction pattern already built for elements in Phase 6 — reuse that gesture handling code if at all possible rather than writing a new one.
- Free (non-locked) aspect ratio resize by default. Do not build aspect-ratio warnings, auto-fit, or "fix width/height" suggestions — remove that logic if it exists from the old Phase 3 build.
- The image is flagged as non-printing background reference — same as originally planned. It must never be included in the TSPL/bitmap export while this flag is set.
- No rotation needed for the image layer unless you already have that gesture built and it's trivial to reuse.

### 5. Editor Unlock Gate

- Simplest possible mechanism: once an image exists on the canvas, show a single "Continue to design" (or similarly worded) button. Pressing it enables/reveals the add-text/add-QR/add-barcode/etc. controls that are otherwise disabled or hidden.
- Do not attempt automatic "detect that the image fills the canvas" logic — that's fragile and unnecessary complexity for what's meant to be a simple manual step.
- The gate should be a one-way unlock for the session (once continued, stay unlocked) — the user shouldn't get re-locked out of design tools by, say, moving the image again afterward.

### 6. Image Visibility Toggle / Remove

- A toggle (show/hide) and a separate remove action for the background image, accessible at all times after step 5, including from the print screen.
- Hiding the image must not affect the underlying document model's element list at all — it's purely a display flag (e.g. `backgroundReference.visible`), consistent with what's already described in the existing `BackgroundReference` type.
- Removing the image should clear the background reference entirely (distinct from hiding it) — useful for someone who wants to permanently ship a clean design without carrying the reference image in the saved document.

### 7. Print

- No changes here. Reuse the existing export pipeline (Phase 7's `exportUnifiedCanvasJob` / boundary export) exactly as built — the background reference was already correctly excluded from the printed bitmap, and that behavior should be preserved, not rebuilt.

---

## Data model changes needed

- Confirm/adjust the order of operations in the screen/navigation flow: Size Entry screen → Import screen → Editor screen, each gated on the previous being complete. If the current implementation has these as one combined screen or in a different order, that's the main structural change.
- Remove: aspect-ratio-mismatch detection, `calculateLockedDimensions`/aspect-lock logic, and any "suggested dimensions" UI tied to the image's own pixel size — none of that is part of the corrected flow. (Keep the underlying `BackgroundReference` type and non-printing guarantee — those are still correct.)
- Add: a ruler/scale-guide rendering component, reusing the existing mm↔px conversion utilities.
- Add: an explicit editor-unlock boolean/state (e.g. `hasConfirmedImagePlacement`), gating the visibility of design-tool controls.
- Confirm: `backgroundReference.visible` (or equivalent) already exists and is wired to a UI toggle; if not, add it.

---

## Test plan

**Automated:**
- [ ] Size must be set before the import prompt is reachable — assert the UI flow blocks/hides import until both mm fields are valid.
- [ ] Ruler tick positions match the canvas's mm↔px conversion exactly at several zoom levels (e.g. 0.5×, 1×, 2×) — same conversion function used elsewhere, not a separate calculation.
- [ ] Moving/resizing the image layer only changes the image's own mm position/size — canvas mm dimensions and all other elements are untouched.
- [ ] Design-tool controls are disabled/hidden before the "Continue to design" action, and enabled afterward; state persists across further image moves.
- [ ] Hiding the background image changes only its `visible` flag — TSPL export output is identical to a document with no background image at all.
- [ ] Removing the background image clears the reference entirely (distinct behavior from hiding).

**Manual (in-app, no printer needed):**
- [ ] Walk the full flow start to finish: size → import → freeform placement using the ruler → continue → add a couple of design elements → toggle image off → toggle back on.
- [ ] Confirm ruler labels are legible and correctly positioned at a couple of different label sizes (a small ~30×20mm label and a larger ~100×60mm label).

**Physical:**
- [ ] Enter a known size, import a real label photo, manually align it to the ruler by eye, hide the image, print the boundary (and any placed elements) — measure with calipers/ruler and confirm the printed footprint matches the entered mm size (not the image's own pixel dimensions) within ±0.5mm.

---

## Progress log entry

Once implemented and tested, append a new entry to `PROGRESS.md` using the existing template, titled something like **"Phase 3 (Reworked): Size-First Import Flow with Ruled Canvas"**, and note explicitly that it supersedes/replaces the original Phase 3 entry rather than sitting alongside it as a separate feature. Bring that back for review before moving on to any other phase.
