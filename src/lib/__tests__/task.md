# Label Editor Canvas Overhaul — Implementation Plan for Cursor

> **Paste this whole file to Cursor as the task brief.** Work through the phases **in the order given, one task at a time.** After finishing a task, run through its Acceptance Criteria, fix anything that fails, and only then move to the next task. Do not batch multiple tasks into one commit/PR — small, verifiable steps are the point.

---

## 0. Context (for the agent)

This is a mobile label-printing app (Android + iOS) similar to consumer label-maker apps: the user picks a label size (e.g. `100×150mm`), gets an artboard with rulers, and adds elements — Text, QR Code, Barcode, Time, Material/images — onto it, then prints.

Current problems being fixed:
1. The canvas gets too little screen space versus the editing options panel below it, and the split isn't adjustable.
2. Dragging (moving/uploading images, moving elements) feels heavy/laggy and imprecise.
3. Dropped/moved elements don't always land at the exact position the user released them at.
4. Resizing an image distorts it — there's no aspect-ratio-locked resize UX.
5. Drag feedback visuals are too bold/heavy; they should read as light, precise, "designer-tool" affordances.

---

## 1. Canvas Library Decision — Keep Konva.js (with a documented exit ramp)

You said you're using **Konva.js**. Here's the assessment so this doesn't need to be re-litigated mid-project:

**Verdict: keep Konva.js.** Don't rewrite the rendering layer to hit these requirements — none of the 6 requirements need a different engine, they need better use of the one you have (correct coordinate math, a custom Transformer config, layer separation during drag, and CSS/layout work for the split panel).

Why it still holds up in 2026 for this use case:
- Konva is built specifically for interactive object-graph editors (shapes, images, text, groups, drag/resize/rotate, event bubbling) — this is exactly a label-design-tool use case, not a "draw a few static shapes" use case.
- It has the best React bindings of the three mainstream canvas libraries (`react-konva`), and its multi-layer architecture (each `Konva.Layer` is its own `<canvas>`) is the mechanism you'll lean on hardest for the "smooth dragging" requirement (Phase 4).
- Its built-in `Konva.Transformer` already does 90% of what Requirement 5 needs (resize handles, aspect-ratio lock) — you're customizing it, not building resize-from-scratch.

One important architectural fact to confirm before Phase 1: **Konva only runs against a real DOM `<canvas>` element.** That's fine if your app is:
- A hybrid/WebView app (Capacitor, Ionic, Cordova, or a React Native `WebView` screen hosting a web build) — this is the assumed setup for the rest of this document.

If instead this is a **pure React Native app with no WebView**, Konva/`react-konva` cannot run at all (no DOM canvas exists in React Native) — that combination doesn't work today. In that case the direct replacement is **`@shopify/react-native-skia`** (Skia runs on the UI thread via JSI with no JS-bridge hop, pairs with `react-native-gesture-handler` + `react-native-reanimated` for buttery drag/resize, and is what you'd want anyway for Requirement 2/6's "low friction" feel). Skia has no built-in Transformer, so you'd hand-roll the same anchor/aspect-ratio logic described in Phase 5 regardless of engine — the math in this plan is engine-agnostic.

**Action for Cursor before Task 1.1:** confirm which of the two setups above is true for this codebase, note it in a `docs/canvas-architecture.md` note, and proceed with the Konva.js plan below unless it's confirmed to be pure React Native with no WebView.

Don't switch to Fabric.js or PixiJS: Fabric.js's built-in object model is nice but isn't meaningfully better than a customized Konva Transformer for this spec, and PixiJS is a WebGL renderer aimed at games/particle-heavy scenes — you'd have to hand-build the entire selection/transform UI yourself, which is strictly more work than customizing Konva's.

---

## 2. Architecture Principles (apply across every phase)

Set these up early — most of Requirements 3 and 4's bugs come from *not* having these in place.

- **Millimeters are the source of truth, pixels are just the current view.** Every element's position/size is stored in `mm` (or `pt`) in your state store, not in on-screen pixels. Pixels are derived on render as `px = mm * currentScale`. This is what makes "exact position maintained" survive zoom, pan, and different screen densities — without it you'll be chasing rounding bugs forever.
- **One `Konva.Stage`, multiple `Konva.Layer`s**, split by responsibility, not just visuals:
  - `pageLayer` — static artboard/page background + print-bleed guides. `listening: false`.
  - `contentLayer` — all placed elements (images, text, QR, barcode) when idle.
  - `activeLayer` — the single element currently being dragged/transformed, temporarily moved here on `dragstart`/`transformstart` and moved back to `contentLayer` on `dragend`/`transformend`.
  - `uiLayer` — Transformer, selection outline, snapping guide lines. Redraws constantly during interaction, so keeping it separate from `contentLayer` means you're not repainting every other element every frame.
- **A single state store** (Zustand/Redux/whatever you already use) holding the element list (`id, type, x_mm, y_mm, width_mm, height_mm, rotation, zIndex, ...`) as the single source of truth. Konva nodes are a *rendering* of that state, not the state itself — don't read positions back out of Konva nodes as your source of truth, sync outward from the store instead (prevents drift between what's stored and what's drawn).
- **Coordinate transform helper**, used everywhere you convert a touch/pointer event into a canvas position:
  ```js
  // screen/client px -> mm on the artboard, accounting for current zoom+pan+DPR
  function pointerToMm(stage, clientPoint) {
    const transform = stage.getAbsoluteTransform().copy().invert();
    const stagePoint = transform.point(clientPoint); // now in stage px
    return { x: stagePoint.x / pxPerMm, y: stagePoint.y / pxPerMm };
  }
  ```

---

## Phase 1 — Resizable Split Layout (Canvas vs. Editing Panel)

**Goal:** replace the fixed canvas/panel split with a draggable divider, so the canvas can take up most or all of the screen on demand.

### Task 1.1 — Build the draggable divider component
- [x] Build a horizontal drag-handle bar between the canvas region and the bottom options panel (the row of Text/QR/Barcode/Time/Material icons + whatever panel is open above it).
- [x] Implement with Pointer Events (`pointerdown/pointermove/pointerup`), not native HTML5 drag-and-drop — you want continuous position updates and clean touch behavior, not the browser's drag ghost/drop semantics.
- [x] Give the handle a generous touch target (~44×44px hit area minimum) even though its visible bar is thin — this is the same "lean visual, generous hit-area" pattern you'll reuse for the resize handles in Phase 5.
- [x] Clamp the drag: canvas region min height (e.g. 35% of viewport) and panel min height (enough to show one row of tool icons + a partial editor).
- [x] Add `touch-action: none` on the handle so mobile browsers don't hijack the gesture as a page scroll.

**Acceptance criteria:** dragging the handle smoothly resizes the two regions with no jump/flicker, works with touch and mouse, and can't be dragged past the min-height clamps.

### Task 1.2 — Full-screen toggle + snap presets
- [x] Add a "maximize canvas" control (icon button, e.g. near the existing top toolbar) that snaps the canvas to full-screen and collapses/hides the panel, with a matching control to restore the previous split.
- [x] Optionally support snap points on the divider itself (e.g. drag near 90% → snaps to full-screen) with a small resistance/haptic tick if the platform layer exposes haptics.

**Acceptance criteria:** one tap gets the user a full-screen canvas and back; the transition animates (150–250ms) rather than jumping instantly.

### Task 1.3 — Make the Konva Stage responsive to panel resizing
- [x] On every divider drag frame (throttled to animation frame, not every pixel), recompute the canvas container's width/height and call `stage.width()` / `stage.height()`.
- [x] Recompute `pxPerMm` (Section 2) whenever the container size changes so the artboard re-fits, and re-center or re-fit-to-view (don't let the artboard silently drift off-screen when the container shrinks).
- [x] Debounce the expensive parts (ruler re-render, guide re-layout) but keep the stage resize itself immediate — a lagging canvas while dragging the divider will feel exactly like the "less real estate" bug you're trying to fix.

**Acceptance criteria:** resizing the divider never clips or misplaces the artboard; no visible tearing/flicker while dragging.

### Task 1.4 — Persist the user's preferred split
- [x] Save the last-used split ratio (and full-screen state) locally per device, restore it on next app open.

**Acceptance criteria:** close and reopen the editor — the layout looks the same as when you left it.

---

## Phase 2 — Print-Accurate Coordinate System & Artboard Setup

**Goal:** once the user enters a size (e.g. `100×150mm`), open an artboard that is geometrically correct and that stays correct at any zoom level.

### Task 2.1 — mm-based data model
- [x] Confirm/refactor the element schema so position, size, and any handle math is in `mm`, per Section 2. If it's currently in raw px, this is the moment to migrate it — everything downstream in Phases 3–5 assumes this.

**Acceptance criteria:** inspecting the state store for any element shows real-world mm values, independent of current zoom.

### Task 2.2 — mm ↔ px scale factor
- [x] Compute `pxPerMm` from the available canvas container size and the artboard's mm dimensions on artboard open (fit-to-screen with some padding), and recompute on rotation/resize/zoom change.
- [x] Keep a single source for this value (don't let different components compute their own slightly different scale).

**Acceptance criteria:** a 10mm square element measures the same, proportionally, whether the label is 50×50mm or 100×150mm.

### Task 2.3 — Artboard/page rendering + rulers
- [x] Render the page boundary as a `Konva.Rect` on `pageLayer`, sized from `pxPerMm`.
- [x] Rulers along top/left (as in the current screenshot) can stay as HTML/CSS overlays synced to the same `pxPerMm` and current pan offset, rather than drawn inside Konva — simpler to style and doesn't cost canvas repaint budget.

**Acceptance criteria:** ruler tick marks line up with the artboard edges at every zoom level.

### Task 2.4 — Zoom & pan controls for precision editing
- [x] Add pinch-to-zoom (two-finger) and single-finger pan when not touching an element, plus explicit +/− and "fit to screen" buttons — small phone screens need a way to zoom in for precise placement, which is the root cause behind "content arrangement is not accurate" on mobile.
- [x] Clamp zoom range (e.g. 25%–800%) and make sure `pxPerMm`-derived math (Task 2.2) and the pointer-to-mm helper (Section 2) both account for the live zoom/pan transform — this is what keeps Requirement 4 correct while zoomed in.

**Acceptance criteria:** user can pinch-zoom in on a corner of the label, precisely place/nudge an element there, zoom back out, and it's exactly where they put it.

---

## Phase 3 — Drag & Drop Positioning Engine

**Goal:** whatever the user drags, wherever they drop it, that's exactly where it ends up — at any zoom/pan state.

### Task 3.1 — Fix the pointer→canvas coordinate transform
- [x] Implement/verify the `pointerToMm` helper from Section 2 and route every drag/drop position calculation through it — this is almost certainly the root cause of "doesn't maintain exact position" today (a common bug is using raw `clientX/clientY` or a stale scale value instead of inverting the stage's current transform).
- [x] Explicitly test at 100% zoom, while zoomed in, and while panned off-center — all three need to produce the same real-world mm position for the same visual drop point.

**Acceptance criteria:** drop an element at a marked spot on the ruler at 100% zoom, then repeat after zooming to 250% and panning — both land on the same mm coordinate.

### Task 3.2 — Moving existing elements on canvas
- [x] Use Konva's native `draggable: true` + `dragBoundFunc` on element nodes rather than reimplementing move-drag by hand — `dragBoundFunc` is also where you enforce staying within artboard bounds (or explicitly allow bleed, if that's a supported use case).
- [x] On `dragmove`, write the live position back into the state store in mm (throttled to animation frame) so the store never falls out of sync with what's on screen (Section 2's "store is the source of truth" rule).
- [x] Move the node onto `activeLayer` on `dragstart`, back onto `contentLayer` on `dragend` (Section 2's layer split) — this is the single biggest lever for making drag feel smooth, since only one small layer repaints per frame instead of the whole canvas.

**Acceptance criteria:** dragging one element among a dozen others on a mid-range Android device shows no visible stutter; the other elements never flicker/repaint during the drag.

### Task 3.3 — Adding new elements from the bottom panel (palette → canvas)
- [x] Implement this as a custom pointer-tracked drag (pointerdown on the palette icon → floating preview follows the finger → pointerup over the canvas creates the element at that position), not the native HTML5 Drag and Drop API — HTML5 DnD has inconsistent/poor touch support and produces the heavy default "ghost" image you're trying to get away from in Requirement 6.
- [x] On drop, convert the release point through `pointerToMm` and create the element centered on that point (or top-left, pick one convention and use it consistently).

**Acceptance criteria:** dragging a "QR Code" icon from the panel and releasing it over a specific spot on the artboard creates the QR code centered exactly there, with a light/thin floating preview during the drag (ties into Phase 6).

### Task 3.4 — Snapping & alignment guides (stretch goal, do after 3.1–3.3 are solid)
- [x] Add smart guides: show a thin snap line when a dragged element's edge/center aligns with the artboard center or another element's edge/center; snap within a small pixel threshold.

**Acceptance criteria:** dragging an element near the artboard's horizontal center shows a center guide line and gently snaps to it within ~5px.

---

## Phase 4 — Image Upload & Smooth Manipulation

**Goal:** uploading and moving a photo should feel light, not like it's dragging a heavy file around.

### Task 4.1 — Image ingestion pipeline
- [x] On image pick, decode via `createImageBitmap()` (faster than an `<img>` decode-on-load for large photos).
- [x] Downscale the working copy to a sane max dimension (e.g. 2000px on the long edge) for on-canvas editing/dragging performance; keep a reference to the original file separately for the final print export/render, so print quality isn't affected by the editing-time downscale.
- [x] Show a lightweight loading state while a large image decodes, so a big upload doesn't look like a freeze.

**Acceptance criteria:** uploading a 12MP+ photo doesn't visibly freeze the UI thread; the placed image still drags smoothly afterward.

### Task 4.2 — Placing the image as a correctly scaled `Konva.Image`
- [x] On placement, compute the image's initial `width_mm`/`height_mm` from its pixel dimensions and the current `pxPerMm`, preserving its native aspect ratio (don't stretch on initial placement).
- [x] Cap initial size to fit within the artboard if the source image is proportionally larger than the label.

**Acceptance criteria:** any photo, regardless of its original resolution/aspect ratio, appears un-distorted and reasonably sized when first placed.

### Task 4.3 — Apply the layer-splitting drag strategy (Task 3.2) to images specifically
- [x] Confirm `Konva.Image` nodes get `.cache()` applied once decoded (Konva caches to an offscreen bitmap, so repeated drag-frame redraws don't re-run any filters/re-decoding) and are moved to `activeLayer` during drag like any other element.

**Acceptance criteria:** dragging a full-bleed background photo around the label is as smooth as dragging a small text element.

### Task 4.4 — Memory cleanup
- [x] Release/garbage-collect decoded bitmaps for images removed from the canvas or replaced, so repeated upload/undo/redo cycles don't leak memory on longer editing sessions.

**Acceptance criteria:** upload/delete/upload a dozen large images in one session without a memory-driven slowdown or crash (spot-check with browser/WebView dev tools memory profiler).

---

## Phase 5 — Custom Resize Handles with Locked Aspect Ratio

**Goal:** exactly two resize handles — a double-headed arrow on the right-middle edge and one on the bottom-middle edge — and dragging either one scales the element proportionally (no distortion), rather than the usual "edge handle stretches one axis" behavior.

This is the one piece of the spec that needs genuinely custom logic — Konva's `Transformer` supports restricting *which* anchors show, and it supports `keepRatio`, but its default `keepRatio` behavior only preserves aspect ratio from the **corner** anchors; dragging a middle/edge anchor normally resizes one axis only. You need to override that specifically for these two edge anchors.

### Task 5.1 — Restrict the Transformer to two anchors
- [x] Attach a `Konva.Transformer` to the selected image/element with:
  ```js
  new Konva.Transformer({
    enabledAnchors: ['middle-right', 'bottom-center'],
    rotateEnabled: false, // unless rotation is separately in scope
    keepRatio: false,     // we're overriding ratio-lock ourselves in boundBoxFunc, see 5.2
  });
  ```

**Acceptance criteria:** selecting an image shows exactly two handles (right edge, bottom edge) and nothing else (no corner handles, no rotate handle, unless rotation is intentionally in scope elsewhere).

### Task 5.2 — Proportional resize math via `boundBoxFunc`
- [x] Implement a `boundBoxFunc(oldBox, newBox)` that:
  - Detects which anchor is active (Konva exposes the active anchor name on the transformer during a transform).
  - If it's `middle-right`: take the new width from `newBox.width`, then force `newBox.height = newBox.width / aspectRatio`.
  - If it's `bottom-center`: take the new height from `newBox.height`, then force `newBox.width = newBox.height * aspectRatio`.
  - Return the corrected `newBox` so the node scales proportionally regardless of which of the two handles the user grabbed.
  - Enforce a sensible minimum size (e.g. 5mm) so the element can't be dragged down to nothing.
- [x] After resize, write the new `width_mm`/`height_mm` back into the state store (Section 2), not just the Konva node — same "store is truth" rule as dragging.

**Acceptance criteria:** grabbing either handle and dragging it in any direction changes both width and height together, the image never looks stretched/squished, and the on-screen result matches what's saved in the store.

### Task 5.3 — Style the handles as lean double-headed arrows with a generous hit area
- [x] Replace the default square anchor styling with a custom double-headed-arrow icon (small, thin stroke) for the two visible anchors, per Requirement 6's "lean not bold" note.
- [x] Keep the visible icon small/thin but give it a larger invisible hit-area (same pattern as Task 1.1's divider) — this is standard mobile UX practice and avoids making the actual line look chunky just to be tappable.
- [x] Set the Transformer's border to a thin (1px), light-colored line rather than the default thicker highlight box.

**Acceptance criteria:** the resize UI reads as delicate/precise in a screenshot, not as bold blue boxes; handles are still easy to grab on a real phone.

### Task 5.4 — Generalize per element type
- [x] Apply the same locked-aspect two-handle transformer to QR codes (should always stay square — consider locking width=height entirely rather than just aspect ratio).
- [x] Decide and implement the equivalent for Barcode (likely: width-only resize is more useful than aspect-locked, since barcodes commonly need to widen without growing taller — confirm this with whoever owns product decisions, don't assume) and for Text (typically scales font size rather than a bounding box aspect ratio).

**Acceptance criteria:** each element type has an explicitly-decided resize behavior (documented in code comments), not just "reused the image logic and hoped it fits."

---

## Phase 6 — Lean Drag & Resize Visual Language

**Goal:** every drag/resize interaction reads as light and precise, never as a bold, heavy overlay.

### Task 6.1 — Transformer styling pass
- [x] Confirm border stroke width (~1px), a light neutral or brand-accent color (not solid black/heavy blue), and no drop shadow on the Transformer border and anchors (builds on Task 5.3, applied consistently to every selectable element, not just images).

### Task 6.2 — In-canvas move feedback
- [x] While an element is being dragged (Task 3.2), reduce its opacity slightly (e.g. to ~0.85) and/or show a thin outline instead of a bold highlight box, so the element being moved reads as "lifted" rather than "boxed."

### Task 6.3 — Palette-to-canvas drag ghost (Task 3.3)
- [x] Build the floating preview as a small, semi-transparent, thin-outlined version of the icon/element being dragged in — explicitly avoid the native browser drag ghost image (which tends to render as a bold, opaque rectangle).

**Acceptance criteria (all of Phase 6):** side-by-side before/after screenshots of a drag-in-progress and a resize-in-progress clearly show thinner strokes, lower visual weight, and no heavy boxes/shadows, while remaining clearly visible against both light and dark label backgrounds.

---

## Phase 7 — Performance, Testing & Cross-Platform QA

**Goal:** verify all of the above actually holds up on real devices, not just in a fast simulator.

### Task 7.1 — Frame-rate check on a real low/mid-end Android device
- [x] Profile drag and resize interactions (Chrome remote debugging over the WebView, or your platform's equivalent) and confirm sustained ~60fps during drag/resize with a realistically busy label (10+ elements, at least one large photo).

### Task 7.2 — iOS WebView pass
- [x] Re-test all of Phases 1–6 in the iOS WKWebView context specifically — touch-action/pointer-event quirks and momentum-scroll interference are common iOS-Safari-family gotchas that don't show up on Android.

### Task 7.3 — Multi-density / DPI testing
- [x] Test on at least one standard-density and one high-density (retina-class) device to confirm mm-accurate positioning (Phase 2/3) holds regardless of device pixel ratio.

### Task 7.4 — Regression checklist
- [x] Re-verify every Acceptance Criteria block above in one pass before calling this done — write them into an actual QA checklist file (`docs/canvas-qa-checklist.md`) rather than trusting memory.

---

## Phase 8 (Optional / Future) — Native Migration Path

Only pick this up if Phase 7 profiling shows a hard performance ceiling from the WebView/JS-bridge layer itself (not from anything fixable in Phases 1–6).

- [x] Prototype the artboard + one element type (e.g. image with the Phase 5 resize behavior) in `@shopify/react-native-skia` + `react-native-gesture-handler` + `react-native-reanimated`, as a native, bridge-free rendering path.
- [x] Compare real-device frame timing against the tuned Konva/WebView version from Phase 7 before deciding whether a full migration is justified — this is a substantial rewrite, so it should be justified by measured numbers, not a hunch.

---

## Quick reference: requirement → phase map

| Your requirement | Where it's handled |
|---|---|
| 1. Full-screen, draggable, customizable canvas | Phase 1 |
| 2. Smooth photo upload/drag | Phase 4 (+ Phase 3 layer-splitting) |
| 3. Customizable canvas via drag interface | Phase 1 (layout) + Phase 2.4 (zoom/pan) |
| 4. Exact position maintained on drag/drop | Phase 3 |
| 5. Two aspect-ratio-locked resize handles (right + bottom) | Phase 5 |
| 6. Lean, not bold, drag visuals | Phase 6 |