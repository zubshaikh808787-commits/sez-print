# Label Editor Canvas Overhaul — Progress

Tracks [`task.md`](./task.md). One numbered task at a time. Updated after each subtask.

---

## Prerequisite — Canvas engine confirmation

**Status:** done (2026-09-11)

- Confirmed **pure Expo React Native**, no WebView.
- Konva.js is **not** viable; `konva-*.tsx` is an RN-named layer.
- Noted in [`docs/canvas-architecture.md`](../../../docs/canvas-architecture.md).
- Phase 1 layout work proceeds on the existing RN editor.

---

## Task 1.1 — Build the draggable divider component

**Status:** done (2026-09-11)

### 1.1.a Horizontal drag-handle between canvas and tools sheet

**Status:** done

- [`src/components/editor/canvas-panel-divider.tsx`](../../../src/components/editor/canvas-panel-divider.tsx) sits between `KonvaCanvas` and the bottom tools/property sheet in [`src/app/edit.tsx`](../../../src/app/edit.tsx).
- Default split is **55% canvas** of the usable column (was capped at **35% / 360px**).

### 1.1.b Pointer tracking, not HTML5 drag-and-drop

**Status:** done

- `PanResponder` grant/move maps `gesture.dy` 1:1 through [`canvasHeightAfterDrag`](../../../src/lib/editor/canvas-split.ts).
- Live refs so the responder is not stale across frames; no browser drag ghost.

### 1.1.c Lean bar, 44px hit target

**Status:** done

- Visible pill is 44×3px; hit strip is `DIVIDER_HIT_SIZE_PX = 44`.
- Covered by unit test `testHitTargetIsAtLeastFortyFour`.

### 1.1.d Clamp canvas ≥ 35% and panel ≥ toolbar + one tool row

**Status:** done

- [`clampCanvasSplitHeight`](../../../src/lib/editor/canvas-split.ts): canvas min `0.35` of usable height; panel min `148px` (+ `96px` when the nudge pad is on).
- Undersized viewports keep the canvas 35% share rather than collapsing it.

### 1.1.e `touch-action: none` on web

**Status:** done

- Web handle style sets `touchAction: 'none'`, `cursor: 'row-resize'`, `userSelect: 'none'`.
- Android/iOS: `onPanResponderTerminationRequest` returns false so the sheet scroll does not steal the gesture.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] `src/lib/editor/__tests__/canvas-split.test.ts` (11 cases: usable viewport, default majority, 35% floor, panel min, no-jump, 1:1 dy, clamp stop, tiny viewport, nudge-pad extra, non-finite, 44px hit) — PASS
- [x] `npm run test:editor` (engine + label-geometry including jewelry/rat-tail pad + split) — PASS
- [x] `npm run test:print` (print engine, 50×73 cable, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Finger-drag the divider on a phone (touch + clamp feel) — pending device

### Deviations

- Brief assumed DOM Pointer Events / Konva Stage. Implementation uses RN `PanResponder` per [`docs/canvas-architecture.md`](../../../docs/canvas-architecture.md).

---

## Task 1.2 — Full-screen toggle + snap presets

**Status:** done (2026-09-11)

### 1.2.a Maximize / restore control

**Status:** done

- Expand/collapse icon next to the size chip on the editor sub-toolbar.
- 200ms `LayoutAnimation` (`SPLIT_ANIMATION_MS`).
- Maximize hides the tools sheet; restore uses the last stored ratio.

### 1.2.b Divider snap + haptic

**Status:** done

- Release past **90%** of usable height snaps to full-screen (`resolveSplitRelease`).
- Short `Vibration.vibrate(8)` when that snap fires (no extra native haptics module).

---

## Task 1.3 — Artboard follows the split immediately

**Status:** done (2026-09-11)

### 1.3.a rAF-throttled stage resize

**Status:** done

- Divider queues height updates on `requestAnimationFrame` (latest pending pixel, not a stale first frame).

### 1.3.b Immediate `pxPerMm` re-fit

**Status:** done

- Workspace height is `workspaceHeightFromSplit(canvasSplitH)` — not a stale `onLayout` pad.
- `fitEditorPadBoard` recomputes scale/offsets every split frame so the artboard stay contain-fitted.

### 1.3.c Debounced rulers

**Status:** done

- Ruler tracks debounce 48ms while dragging; artboard size stays live.

---

## Task 1.4 — Persist split

**Status:** done (2026-09-11)

- `editor.canvasSplitRatio` and `editor.canvasSplitFullscreen` on the existing Zustand + AsyncStorage settings store.
- Written on drag-end and maximize toggle; restored when the editor opens.
- Full-screen persist keeps the last non-full ratio so restore does not jump to 90%+.

---

## Phase 1 — complete

### Tests run (full Phase 1)

- [x] `npx tsc --noEmit` — PASS
- [x] canvas-split tests (17 cases including snap, persist ratio, immediate workspace height, jewelry 54×96 re-fit) — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: drag divider, maximize, kill/reopen editor — pending device

### Next

Phase 2 — complete (see below).

---

## Task 2.1 — mm-based data model

**Status:** done (2026-09-11)

- Confirmed: `LabelDocument` / element `left` `top` `width` `height` are millimetres.
- Transformer commits `leftMm` / `topMm` / `widthMm` / `heightMm` via `sanitizeTransform`.
- View zoom is a CSS/Reanimated scale on `ZoomableEditPad` — it does not rewrite the store.
- Documented on `LabelDocument`. Tests assert store values stay mm at zoom 1 and 2.5.

---

## Task 2.2 — Single `pxPerMm`

**Status:** done (2026-09-11)

- Fit scale is only `fitEditorPadBoard` → `containFitLabel` (`fitted.scale` in the editor).
- `viewPxPerMm(fit, zoom)` is the screen multiplier; layout still uses fit `pxPerMM`.
- A 10mm square is the same fraction of a 50×50mm label and a 100×150mm label.

---

## Task 2.3 — Artboard page layer + rulers

**Status:** done (2026-09-11)

- Page fill, grid, and page-boundary stroke sit on a non-listening layer in `KonvaCanvas`.
- Rulers stay RN overlays inside the zoomed pad (`rulerTicksFor` maps mm → unzoomed content px).
- Tick 0 and tick `lengthMm` land on the letterboxed artboard edges; zoom scales the whole pad.

---

## Task 2.4 — Zoom, pan, `pointerToMm`

**Status:** done (2026-09-11)

- Pinch, two-finger pan, +/−, and Fit (badge) already existed; Fit still clears pan.
- Zoom clamp is **25%–800%** (`VIEW_ZOOM_MIN` / `VIEW_ZOOM_MAX`).
- One-finger pan when nothing is selected and zoom > 105%.
- `pointerToMm` / `mmToPointer` invert pan + centre-origin zoom, then divide by fit `pxPerMM`.
- Live transform is written to `editorViewRef` on pinch/pan/fit (Phase 3 drop math uses this).

### Tests run (Phase 2)

- [x] `npx tsc --noEmit` — PASS
- [x] `src/lib/editor/__tests__/view-transform.test.ts` (mm store, 10mm proportion, ruler edges, clamp, pointer round-trip at 100% / 250% / panned, jewelry 54×96 + cable 50×73) — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: pinch a corner, place/nudge, zoom out — pending device

### Deviations

- No Konva.js `Stage.getAbsoluteTransform()`. RN invert matches `translate(pan)` then `scale(zoom)` around the view centre.
- Page boundary is an RN `View` border (`styles.artboardBorder`), not `Konva.Rect`.

### Next

Task 3.1 — complete (see below).

---

## Task 3.1 — Pointer → artboard millimetres

**Status:** done (2026-09-11)

- Drag commit no longer converts leftover artboard px with `pxToMm` as the source of truth.
- Window `absoluteX/Y` → pad-local (`measureInWindow` origin) → `pointerToMm` (live zoom + pan).
- Grab offset is captured in mm on drag start; drop uses `dropTopLeftMm` so the grabbed point stays under the finger.
- Fallback still uses unzoomed artboard px if the pad origin has not been measured yet.
- Tests: drop on a 10mm ruler mark and drag-commit at 100%, 250%, and panned — same millimetres. Jewelry 54×96 drop at 10mm stays 10mm.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: drop on a ruler tick at Fit, 250%, and panned — pending device

### Deviations

- No Konva `getAbsoluteTransform()`. Invert is `windowPointToMm` on the RN pad transform.
- Live drag preview still uses window delta / view zoom on the UI thread; commit is the millimetre invert.

### Next

Task 3.2 — complete (see below).

---

## Task 3.2 — Move existing elements

**Status:** done (2026-09-11)

- `dragBoundMm` (`clampBoxOnCanvas`) keeps the dragged box on the artboard.
- `dragmove` writes millimetres into the document on animation frames (`createFrameThrottled`); history still begins on start and commits on end.
- The moving node is lifted onto `activeLayer`; `contentLayer` is memoized on element identity so the other nodes do not re-render.
- `clampElementToLabel` now returns the same object when already in bounds, so idle refs survive the live store write.
- Drag origin is frozen on UI-thread shared values so live store updates cannot double-apply the delta.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] `src/lib/editor/__tests__/drag-layer.test.ts` (bounds, 12-element lift, identity, rAF coalesce, jewelry clamp identity) — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: drag one of many elements, confirm idle nodes stay still — pending device

### Deviations

- No Konva `draggable` / `Layer`. RN Pan + Reanimated, with an explicit content/active view split.
- Live preview stays on the UI thread; the store tracks mm at frame rate.

### Next

Task 3.3 — complete (see below).

---

## Task 3.3 — Palette → canvas drop

**Status:** done (2026-09-11)

- Custom pointer drag from Text / Barcode / QR / Line / Shapes / Time / ArcText / Degrees (not HTML5 DnD). Tap still auto-places.
- Thin semi-transparent outline follows the finger (`PaletteDragGhost`). Phase 6 can restyle it.
- Release over the artboard goes through `windowPointToMm` then `paletteDropTopLeftMm` — **center on the drop point**, then clamp.
- Same visual 10mm spot at Fit, 250%, and panned yields the same millimetres. Jewelry 54×96 and cable 50×73 stay millimetres.
- Dropping off the artboard cancels (does not tap-add). Image / Clipart / Table / Scan stay tap-only.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] `src/lib/editor/__tests__/palette-drop.test.ts` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: drag QR onto a ruler mark at Fit, 250%, and panned — pending device

### Deviations

- No HTML5 drag ghost. RN `Gesture.Pan` + overlay view.
- Center-on-pointer convention (not top-left).

### Next

Task 3.4 — complete (see below).

---

## Task 3.4 — Snap guides

**Status:** done (2026-09-11)

- Live move-drag and palette drop snap to artboard edges/centre and other object edges/centres.
- Threshold is **5 screen pixels** converted to mm at the live view scale (`snapThresholdMm`), not a huge magnetic pull.
- Thin teal guide lines draw on the artboard (`uiLayer` overlay, outside the print ViewShot) while a snap is active.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] engine + palette-drop snap cases (center within ~5px, ignore farther, object edge) — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: drag near the horizontal center and confirm the guide + snap — pending device

### Deviations

- Guides are RN `Svg` lines on the artboard view, not a Konva `uiLayer`.

### Next

Phase 4 — complete (see below).

---

## Task 4.1 — Image ingestion pipeline

**Status:** done (2026-09-11)

- Pick → `expo-image-manipulator` decode on a native thread (`createImageBitmap` stand-in).
- Working copy capped at **2000px** on the long edge; `printUri` keeps the full-resolution JPEG.
- Lightweight “Placing photo…” overlay so a 12MP decode does not look like a freeze.
- Files live in `documentDirectory/sez-editor-images/` so cache-clear does not drop print originals.

### Tests run

- [x] `npx tsc --noEmit`
- [x] `src/lib/editor/__tests__/image-ingest.test.ts` (12MP → 2000×1500 working size)
- [x] `npm run test:editor`
- [x] `npm run test:print`
- [ ] Phone: import a 12MP photo and confirm the UI stays responsive — pending device

### Deviations

- No DOM `createImageBitmap`. Native `ImageManipulator.manipulate` + `renderAsync`.

---

## Task 4.2 — Place image at native aspect

**Status:** done (2026-09-11)

- Initial mm = source pixels / fit `pxPerMm`, then contain-cap to the artboard (or jewelry body / rat-tail paddle).
- Small photos stay small and centered; large photos fill the label without stretching.
- Aspect locked on first place (`contentFit: 'contain'`). Fill-label remains a property-panel action.

### Tests run

- [x] 80×60px at 4 px/mm → 20×15 mm centered on 50×30
- [x] 4000×3000 contain-fits 50×30 at 4:3
- [x] jewelry 54×96 and cable 50×73 document millimetres unchanged

### Deviations

- No `Konva.Image`. RN `expo-image` in `ElementContentView`.

---

## Task 4.3 — Image drag uses the same layer split

**Status:** done (2026-09-11)

- Images already lift onto `activeLayer` (Task 3.2).
- `expo-image` `cachePolicy="memory-disk"`, `recyclingKey`, and working-copy pixel size so drag does not re-decode the original.
- Prefetch the working URI after ingest.

### Deviations

- No Konva `.cache()`. expo-image decoded bitmap cache is the equivalent.

---

## Task 4.4 — Memory cleanup

**Status:** done (2026-09-11)

- Sweep `sez-editor-images/` against current elements, undo/redo snapshots, and saved documents.
- Replaced/deleted files are removed; undo still has its files until those snapshots drop off.
- Print convert reads `printUri || uri`.

### Tests run

- [x] sweep keeps history URIs and drops orphans
- [x] `npx tsc --noEmit` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30) — PASS
- [ ] Phone: upload/delete a handful of large photos — pending device

### Next

Phase 5 — complete (see below).

---

## Task 5.1 — Two edge anchors only

**Status:** done (2026-09-11)

- RN transformer shows at most **middle-right** (`'e'`) and **bottom-center** (`'s'`), matching Konva `enabledAnchors: ['middle-right', 'bottom-center']`.
- Images, clipart, signature, and QR have **no on-canvas rotate stem**; rotation stays on the editing pad / 90° control.
- Corners and the other four edge squares are gone.

### Tests run

- [x] `src/lib/editor/__tests__/resize-policy.test.ts` — image anchors `['e','s']`, rotateHandle false
- [ ] Phone: select a photo and confirm only two arrows — pending device

### Deviations

- No `Konva.Transformer`. Same two anchors on the existing RN gesture chrome.

---

## Task 5.2 — `boundBoxMm` proportional resize

**Status:** done (2026-09-11)

- [`src/lib/editor/resize-policy.ts`](../../../src/lib/editor/resize-policy.ts) `boundBoxMm` is the millimetre `boundBoxFunc`.
- Right handle: width from pointer, `height = width / aspect`, left edge stays, vertical centre stays.
- Bottom handle: height from pointer, `width = height * aspect`, top edge stays, horizontal centre stays.
- Proportional types cannot shrink below **5mm** on the shorter side (uniform scale, aspect kept).
- Handle release commits through `boundBoxMm` into the store (`width`/`height` mm), not from raw px.

### Tests run

- [x] 20×10 image, aspect 2, right handle → 24×12, left unchanged, top recentred
- [x] bottom handle 10→15 mm → 30×15, top unchanged, left recentred
- [x] min 5mm; jewelry 54×96 and cable 50×73 clamps stay on the label
- [x] `npx tsc --noEmit`
- [x] `npm run test:editor`
- [x] `npm run test:print` (cable 50×73, jewelry 54×96, JOSH 50×30)

---

## Task 5.3 — Lean arrows, 44px hit, 1px outline

**Status:** done (2026-09-11)

- Visible glyphs are thin `arrow.left.and.right` / `arrow.up.and.down` (no white squares, no drop shadow).
- Hit target is `DIVIDER_HIT_SIZE_PX` (**44**) centred on the edge.
- Selection outline is **1px**.

### Deviations

- Icons are SF Symbols / Ionicons, not custom SVG arrows. Stroke weight is `light`.

---

## Task 5.4 — Per-type resize policy

**Status:** done (2026-09-11)

Documented on `resizePolicyFor` (`comment` on every type):

| Type | Anchors | Behavior | Rotate stem |
|---|---|---|---|
| image / clipart / signature | e, s | aspect-lock (images unlock on the property panel) | no |
| qrcode | e, s | **square** (width = height) | no |
| barcode | e | width-only | yes |
| text / degrees / time | e, s | e = wrap width; s = height + **fontSize** on commit | yes |
| line | e | length only | yes |
| shape / arctext / table | e, s | independent width/height | yes |
| border | none | locked to the label | no |

### Tests run

- [x] catalog covers every `ElementType`
- [x] QR stays square; barcode height unchanged; text e does not stretch glyphs
- [x] `npx tsc --noEmit` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` — PASS
- [ ] Phone: resize a photo, a QR, a barcode, and a text box — pending device

### Next

Phase 6 — complete (see below).

---

## Task 6.1 — Transformer styling pass

**Status:** done (2026-09-11)

- Chrome tokens live in [`src/lib/editor/canvas-chrome.ts`](../../../src/lib/editor/canvas-chrome.ts).
- Selection outline is **1px** brand teal (`rgba(23, 166, 184, 0.85)` on light fills; a brighter teal on dark fills). Not `#2563EB` and not the print-border reds.
- Rotate stem/anchor: 1px ring, translucent fill, **no drop shadow**. Edge arrows were already unshadowed (Task 5.3); this applies to every selectable type.

### Tests run

- [x] `CHROME_STROKE_PX === 1`, `CHROME_HAS_SHADOW === false`
- [ ] Phone: screenshot a selected text box vs a selected photo — pending device

---

## Task 6.2 — In-canvas move feedback

**Status:** done (2026-09-11)

- Body-drag sets opacity to **0.85** (`DRAG_LIFT_OPACITY`) via a Reanimated shared value.
- Resize/rotate handles hide while moving so the node reads as lifted, not boxed. The 1px outline stays.

### Tests run

- [x] `dragOpacity(1) === 0.85`

---

## Task 6.3 — Palette drag ghost

**Status:** done (2026-09-11)

- Ghost is a **≤44px** semi-transparent chip with a 1px teal outline and the tool icon — not the placed element's on-canvas size.
- Native HTML5 / OS drag ghost is still unused (`PaletteToolItem` pointer tracking).
- Drop millimetres are unchanged (still centered on the pointer via `paletteDropTopLeftMm`).

### Tests run

- [x] QR ghost 44×44; barcode ghost much smaller than 30mm×8px/mm; line is a thin bar
- [x] jewelry 54×96 / cable 50×73 millimetres are not part of ghost chrome
- [x] `npx tsc --noEmit` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` — PASS
- [ ] Phone: drag Text/QR from the palette and move an existing element — pending device

### Next

Phase 7 — complete (see below). Device FPS / iOS / density rows in [`docs/canvas-qa-checklist.md`](../../../docs/canvas-qa-checklist.md) stay open until a phone pass.

---

## Task 7.1 — Frame-rate (lab + runbook)

**Status:** done (2026-09-11) — device FPS numbers still pending

- Busy-label invariant: 11 text + 1 photo, `splitCanvasLayers` freezes idle refs; `createFrameThrottled` coalesces to one rAF write; working photo ≤ 2000px.
- Profiling is Expo **Perf Monitor** (shake / Metro `j`), not Chrome WebView inspect.
- Device table lives in the QA checklist.

### Tests run

- [x] `src/lib/editor/__tests__/canvas-qa.test.ts` busy-label + throttle
- [ ] Phone: 12-element + photo drag/resize FPS — pending device

---

## Task 7.2 — iOS (mapped off WKWebView)

**Status:** done (2026-09-11) — on-device iOS pass still pending

- No WKWebView. Pinch/pan use RNGH `shouldCancelWhenOutside(false)`.
- Split handle `onPanResponderTerminationRequest: false` so sheet bounce cannot steal the drag.
- Tools `ScrollView` disables while a palette ghost is active.

### Deviations

- Brief assumed iOS Safari / `touch-action`. Native RNGH is the equivalent.

---

## Task 7.3 — Density / DPI

**Status:** done (2026-09-11) — physical 1x vs 3x phones still pending

- `pointerToMm` takes logical pixels only. `pointerLogicalPx(x, dpr)` ignores dpr.
- Same 10mm drop at dpr 1 / 2 / 3; jewelry 54×96 and cable 50×73 included.

---

## Task 7.4 — Regression checklist

**Status:** done (2026-09-11)

- [`docs/canvas-qa-checklist.md`](../../../docs/canvas-qa-checklist.md) lists every Phase 1–6 acceptance criterion with a Lab column (filled from unit tests) and empty Android/iOS columns.
- One-file regression pack: `canvas-qa.test.ts`.

### Tests run

- [x] `npx tsc --noEmit` — PASS
- [x] `npm run test:editor` — PASS
- [x] `npm run test:print` — PASS
- [ ] Fill the device columns in the checklist — pending device

### Next

Phase 8 — complete (see below). Production editor is unchanged.

---

## Task 8.1 — Skia artboard + image prototype

**Status:** done (2026-09-11)

- `@shopify/react-native-skia` **2.2.12** (Expo 54). Native draw in `skia-image-artboard.native.tsx`; web uses an `expo-image` stand-in (no CanvasKit).
- Gestures: RNGH overlay, Phase 5 `boundBoxMm` / `dragBoundMm` via `src/lib/editor/skia-prototype.ts`.
- Screen: [`src/app/canvas-skia-prototype.tsx`](../../../src/app/canvas-skia-prototype.tsx) from Editing Settings. Presets include jewelry 54×96 and cable 50×73.
- **`/edit` still uses `KonvaCanvas`.** This is a prototype, not a rewrite.

### Tests run

- [x] `skia-prototype.test.ts` (mm round-trip, aspect resize, stock mm, FPS gate)
- [ ] Device: rebuild dev client, open the prototype, drag/resize the photo — pending native binary

---

## Task 8.2 — FPS comparison gate

**Status:** done (2026-09-11) — paired device numbers still pending

- `compareRendererFps`: missing samples → stay on RN views; RN ≥ 60fps → no migrate; migrate only if RN misses 60 and Skia clears it by ≥ 8fps.
- There is no WebView ceiling in this app; the gate encodes that so a rewrite cannot happen on a hunch.

### Tests run

- [x] `npx tsc --noEmit`
- [x] `npm run test:editor`
- [x] `npm run test:print`

### Next

Canvas overhaul phases 1–8 are implemented. Remaining work is the device columns in the QA checklist.

