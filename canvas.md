# WePrint-Style Label Designer — Canvas Behavior Spec (Konva.js)


This doc is in three parts:
- **Part A** — what a WePrint-style canvas is actually supposed to do (behavior spec, tool-agnostic)
- **Part B** — how to implement each behavior specifically in **Konva.js**
- **Part C** — a checklist of the most common ways Konva-based design canvases silently misbehave, since "the canvas is not working accordingly" is almost always one of a short, recognizable list of root causes

If you can point to the *specific* broken behavior (e.g. "resizing distorts text," "elements snap to the wrong place," "zoom moves the wrong element"), I can give you a targeted fix — but this document is built so you can self-diagnose against Part C first.

---

## Part A — Behavior specification

### A1. The label is a fixed physical artboard, not an infinite canvas
A WePrint-style tool isn't a general drawing app — the canvas represents **one physical label at a fixed physical size** (e.g. 40mm × 30mm). Everything the user does happens *within* that boundary. The canvas view can zoom/pan for editing convenience, but the label's real dimensions never change just because the user zoomed in. This is the single most important conceptual difference from a general whiteboard tool, and most "why is my export the wrong size" bugs trace back to violating it.

### A2. Elements are typed objects with a consistent behavior contract
Every draggable thing on the label (text, barcode, QR, image, shape, line, table) shares a common contract:
- Position (x, y), size (width, height), rotation, z-index, locked, visible
- Selectable, draggable (unless locked), resizable via handles, rotatable via a handle
- Deletable, duplicable, alignable to other elements or to the label bounds

Type-specific behavior layers on top of that (text has font/size/alignment; barcode/QR has encoded data and regenerates its visual when that data changes; image has crop/replace).

### A3. Selection and transform
- Click selects one element; shift-click adds to selection; drag-a-rectangle (marquee) over empty canvas selects everything inside it.
- A selected element (or group of elements) shows resize handles at corners/edges and a rotation handle.
- Resizing text should, by default, scale the bounding box and reflow/rescale font size — not stretch/distort the glyphs. Resizing a barcode/QR should regenerate it crisp at the new size, not stretch the existing raster.
- Rotation typically snaps to 15° or 45° increments unless the user holds a modifier key for free rotation (this mirrors most design tools, including WePrint-style ones).

### A4. Snapping and alignment guides
- While dragging, temporary guide lines appear when an element's edge or center aligns with another element's edge/center, or with the label's own edges/center/margins.
- Snapping should feel like a light magnetic pull within a small pixel threshold — not an exact-pixel requirement (if it only snaps at the literal same pixel, it'll feel broken, because mouse input is never that precise).
- A visible grid (toggleable) and "snap to grid" are usually offered alongside object-to-object snapping.

### A5. Zoom and pan are view-only operations
Zooming in/out changes how big the label *looks* on screen, never its real mm dimensions, and never the mm size/position of any element on it. Panning moves the visible viewport, not the label. The cursor position should stay "pinned" to the same point on the label while zooming (zoom-to-cursor), which is what makes zooming feel natural instead of disorienting.

### A6. Text editing is inline, not a separate dialog
Double-clicking a text element should let the user type directly into it on the canvas (with a blinking cursor, selectable text), not pop open a separate text-editing modal. This is a well-known rough edge in canvas libraries (see Part B/C) because canvas-rendered text isn't natively editable the way HTML text is.

### A7. Undo/redo covers every user action
Every add/move/resize/rotate/delete/style-change/reorder is one undo step. Users expect this to be reliable and complete — a design tool where undo "sometimes" works erodes trust in the whole app fast.

### A8. Data-bound / variable fields (for batch and serialized labels)
A hallmark WePrint-style feature: a text or barcode element can be bound to a data column (e.g., "Product Name," "Serial Number," an incrementing counter) instead of a fixed string, so the same design prints a batch of labels with per-item different content. This is a data-layer feature more than a rendering feature, but it affects canvas behavior because the canvas needs a "preview with sample row" mode versus the real per-item bound values at print/export time.

### A9. What you see is what prints
The single hardest requirement, and the one most tied to your earlier print pipeline: the exact visual layout, spacing, and proportions the user sees on screen must be **exactly** what gets rasterized and sent to the printer — not a re-layout, not a re-scale, not a different font-rendering path. Any divergence here is what causes "it looked right in the app but printed wrong" complaints.

---

## Part B — Implementing each behavior in Konva.js

### B1. Layer architecture (do this first — gets a lot of correctness "for free")

Don't put everything in one `Konva.Layer`. Use a small fixed set of layers, bottom to top:

```js
const stage = new Konva.Stage({ container: 'canvas-container', width, height });

const backgroundLayer = new Konva.Layer({ listening: false }); // label bounds, grid, ruler
const contentLayer   = new Konva.Layer();                       // actual label elements
const guideLayer     = new Konva.Layer({ listening: false });    // temporary snap guides
const transformLayer = new Konva.Layer();                       // Transformer lives here

stage.add(backgroundLayer, contentLayer, guideLayer, transformLayer);
```

**Why this matters:** it isolates what needs to redraw when. Dragging an element only needs to redraw `contentLayer` + `guideLayer`, not the grid/background — this alone fixes a lot of "canvas feels laggy" complaints on labels with many elements. It also means your Transformer's handles are never accidentally "behind" a content element, which is a common visual bug when everything's on one layer and z-order gets mixed up.

### B2. Coordinate system — millimeters as the single source of truth

This is the same principle from the print-side roadmap (one conversion function, used everywhere), just applied to the design side:

```js
// The ONE place mm<->px conversion happens.
const PX_PER_MM = 96 / 25.4 * zoomFactor; // 96 = a chosen "design-time" reference DPI, NOT the printer's DPI

function mmToPx(mm) { return mm * PX_PER_MM; }
function pxToMm(px) { return px / PX_PER_MM; }
```

Store every element's canonical position/size **in millimeters** in your own data model (not in Konva node pixel properties directly). Konva nodes are a *view* of that data — set `x`/`y`/`width`/`height` on the Konva node by converting from your mm-based model, and when a drag/transform ends, convert back from the node's pixel values to mm and update your model. Never let the "real" value live only inside a Konva node's pixel property, or you'll get drift between what's stored and what's shown, especially across zoom changes.

This directly solves the most common category of "offsets are wrong" bugs: mixing "design-time reference DPI" (used for on-screen rendering, can be anything reasonable like 96) with "printer DPI" (203 or 300, from your PrintSDK calibration profile) is fine and expected — **they are two different numbers for two different purposes** — but only if you convert through millimeters as the shared unit in between, never px-to-px directly between screen and printer.

### B3. Zoom-to-cursor

```js
stage.on('wheel', (e) => {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition();

  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  const newScale = e.evt.deltaY < 0 ? oldScale * 1.05 : oldScale / 1.05;

  stage.scale({ x: newScale, y: newScale });
  stage.position({
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  });
  stage.batchDraw();
});
```
The key idea: compute the point under the cursor **in unscaled stage coordinates** before changing scale, then re-position the stage after scaling so that same point stays under the cursor. Skipping this (just changing `scale()` alone) is the single most common cause of "zoom feels broken, everything jumps around."

### B4. Selection & Transformer

Use a single shared `Konva.Transformer`, and attach/detach nodes to it rather than creating new transformers:

```js
const tr = new Konva.Transformer({
  rotateAnchorOffset: 24,
  rotationSnaps: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345],
  boundBoxFunc: (oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox),
});
transformLayer.add(tr);

function selectNodes(nodes) {
  tr.nodes(nodes);
  transformLayer.batchDraw();
}
```
Rebuild `tr.nodes([...])` any time selection changes, including after adding a brand-new element (a very common bug: a newly-added element doesn't get a transformer until the user clicks away and back, because the code that attaches the transformer only runs on click, not on programmatic add-and-select).

**The "distorted resize" fix (important, very common bug):** by default, Konva resizing changes `scaleX`/`scaleY`, not `width`/`height`. If you don't reset this, text/strokes get visually stretched instead of cleanly resized. On `transformend`, bake the scale back into width/height and reset scale to 1:

```js
node.on('transformend', () => {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);
  node.width(Math.max(8, node.width() * scaleX));
  node.height(Math.max(8, node.height() * scaleY));
  // then re-derive font size for text nodes, re-render barcode/QR at new size, etc.
  updateModelFromNode(node); // convert back to mm, save into your data model (see B2)
});
```
This single pattern fixes the overwhelming majority of "resizing looks wrong" reports in Konva-based design tools.

### B5. Snapping & smart guides

Compute guide lines during `dragmove`, comparing the dragged node's edges/center against every other node's edges/center and the label's own bounds, within a small pixel threshold:

```js
const GUIDE_THRESHOLD = 5; // px, independent of zoom feel — tune this

node.on('dragmove', () => {
  const guides = getSnapGuides(node, contentLayer.getChildren(), GUIDE_THRESHOLD);
  drawGuideLines(guideLayer, guides); // temporary Konva.Line objects
  if (guides.snapX !== null) node.x(guides.snapX);
  if (guides.snapY !== null) node.y(guides.snapY);
});

node.on('dragend', () => {
  guideLayer.destroyChildren();
  guideLayer.batchDraw();
  updateModelFromNode(node);
});
```
Threshold-based snapping (not exact-pixel matching) is what makes this feel magnetic rather than broken — if your current implementation snaps inconsistently, check whether the threshold is too small (or zero) relative to how fast the mouse is actually moving between frames.

### B6. Inline text editing

Konva text isn't natively editable — the standard, well-established pattern is to overlay an absolutely-positioned HTML `<textarea>` on top of the Konva text node while editing, then destroy it and update the Konva text node when editing ends:

```js
textNode.on('dblclick dbltap', () => {
  textNode.hide();
  tr.hide();

  const textPosition = textNode.absolutePosition();
  const stageBox = stage.container().getBoundingClientRect();

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = textNode.text();
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${stageBox.top + textPosition.y}px`,
    left: `${stageBox.left + textPosition.x}px`,
    width: `${textNode.width() * stage.scaleX()}px`,
    fontSize: `${textNode.fontSize() * stage.scaleY()}px`,
    // match font, line-height, padding, transform (rotation) to the Konva node
  });
  textarea.focus();

  textarea.addEventListener('blur', () => {
    textNode.text(textarea.value);
    document.body.removeChild(textarea);
    textNode.show();
    tr.show();
    updateModelFromNode(textNode);
  });
});
```
**The most common bug here:** the overlay's position/size is computed once at dblclick time but not re-synced if the user zooms/pans while editing, so the textarea visually drifts away from the actual text node. Either lock zoom/pan while an inline editor is open (simplest, and what most tools actually do), or recompute the overlay's position on every stage transform event.

### B7. Barcode/QR/image elements
Treat these as "render-on-data-change" elements, not static images:
- On data change (barcode value, QR payload), regenerate the underlying raster/path at the **current pixel size**, don't stretch a previously-generated raster — this avoids blurry/pixelated barcodes that a scanner can't read.
- Load images asynchronously and only add the Konva.Image to the layer once loaded (`Konva.Image.fromURL(src, (img) => layer.add(img))`), rather than constructing the node before the image data exists — a very common source of "image sometimes doesn't show up" bugs, especially right after upload.

### B8. Undo/redo
Simplest reliable approach for a design tool at this scale: snapshot your **data model** (the mm-based one from B2, not raw Konva JSON) after every discrete user action, push onto an undo stack, and restore-from-snapshot on undo/redo. This is more reliable than trying to implement inverse-operations for every possible action, and its performance cost is negligible at label-design scale (a handful of elements, not thousands).

### B9. Serialization
Konva has built-in `stage.toJSON()` / `Konva.Node.create(json)`, but:
- It won't re-run custom logic (e.g., regenerating a barcode raster) on load — it just restores whatever pixels/attrs were saved. If your barcode/QR nodes are custom shapes with a `sceneFunc`, make sure your load path re-triggers that draw function, not just restores stale bitmap data.
- Prefer serializing **your own mm-based data model** (from B2) as your actual save format, and treat the Konva scene as a disposable view you rebuild from that model — this keeps your saved files stable even if you change how a given element type renders internally later.

---

## Part C — Common Konva canvas bugs and root causes (troubleshooting checklist)

Since you said the canvas "is not working accordingly" without specifying exactly how, here's the short list of what that phrase almost always turns out to mean, in roughly the order of how often each one is the actual cause:

1. **Resize distorts/stretches elements (especially text).**
   → Almost always the B4 issue: `scaleX`/`scaleY` never got reset into `width`/`height` on `transformend`. Check for a `transformend` handler at all — if there isn't one, this is your bug.

2. **Newly added elements aren't selectable/resizable until you click away and back.**
   → The Transformer's `nodes([...])` isn't being called at add-time, only at click-time. Call `selectNodes([newNode])` immediately after adding a new element.

3. **Zoom makes everything jump/pan to a weird position.**
   → Missing the B3 "compute point under cursor before scaling" step. If your zoom handler only calls `stage.scale()` and not also `stage.position()`, this is the bug.

4. **Elements snap to the wrong place, or don't snap at all, or jitter while dragging.**
   → Check your snap threshold (B5) — zero or missing threshold means no snapping; too large a threshold means it snaps to things it shouldn't, which looks like "wrong place." Also confirm you're comparing against *other elements' current on-screen positions*, not stale cached positions from before the drag started.

5. **Exported/printed label doesn't match what was shown on screen** (this is the big one, and it's the seam between this document and the earlier print-side ones).
   → Almost always a units mismatch: exporting at the *current on-screen zoom/scale* instead of a fixed, DPI-correct pixel size. Never call `stage.toDataURL()` using the live, possibly-zoomed stage as-is for the final print export. Instead, temporarily render (or maintain a parallel offscreen) at `pixelRatio` set so that `output_px = mm * printer_dpi / 25.4`, independent of whatever zoom level the user happened to be at when they hit "print." Konva's `toDataURL({ pixelRatio })` / `toCanvas({ pixelRatio })` options exist exactly for this — use them, don't rely on the visible stage's current scale.

6. **Text editing overlay drifts from the actual text position.**
   → B6's known issue: overlay position computed once, not resynced on pan/zoom. Lock view interaction during text edit, or resync on every transform event.

7. **Dragging feels laggy with more than a handful of elements.**
   → Everything's likely on one `Konva.Layer` (see B1), so every drag frame redraws the whole scene including static background/grid. Split into the layered architecture in B1; call `layer.batchDraw()` only on the layer that actually changed.

8. **An element won't drag at all.**
   → Check `draggable` is explicitly `true` on that node (Konva defaults to `false`). If it's inside a `Konva.Group`, confirm the group itself isn't intercepting the drag (a child's `draggable` doesn't do anything if you actually wanted the group to move, and vice versa — decide which one owns dragging for that element type and be consistent).

9. **Clicking one element selects a different one, or clicking empty space doesn't deselect.**
   → Hit-detection/z-order issue. Confirm you're not accidentally handling clicks on a background/grid layer that sits *above* content in z-order. Also confirm you have a stage-level click handler that clears selection when `e.target === stage` (clicking empty canvas).

10. **Barcode/QR looks blurry or fails to scan after resizing.**
    → B7's issue: a previously-generated raster got stretched instead of regenerated at the new pixel size. Regenerate on every resize/transformend, not just on initial creation.

11. **Image element sometimes doesn't appear after upload.**
    → B7's async loading race: the node was added to the layer before the image finished loading. Use the load-callback pattern, not synchronous construction.

12. **Undo sometimes "misses" an action, or restores a slightly wrong state.**
    → Usually means undo snapshots are being taken from *Konva's* live state at inconsistent moments (e.g., mid-drag) rather than your own data model at clean, discrete action boundaries (B8). Snapshot your mm-based model, at the end of each discrete action only — not continuously during drag/resize.

13. **Rotation handle behaves oddly, or rotated elements resize strangely.**
    → Confirm rotation is happening around the node's intended anchor (Konva rotates around `offsetX`/`offsetY`, which defaults to the top-left, not the center, unless you've explicitly set it). A lot of "rotation feels wrong" bugs are actually "rotating around the wrong point" bugs.

14. **Everything works on desktop but breaks on mobile/touch.**
    → Konva's default `wheel`-based zoom won't exist on touch; you need explicit pinch-to-zoom handling (`touchmove` with two touch points, computing distance delta) and to confirm `draggable`/tap-hold-to-select interactions are separately tested on touch, not just assumed to work identically to mouse.

---

## Part D — How this connects back to the print pipeline

To close the loop with the earlier documents: the canvas's job ends exactly at Part C, item 5 — producing a bitmap that is **pixel-accurate to the physical label size at the printer's real DPI**, using the calibration profile from the Connection Roadmap's Phase 2 (not a guessed or generic DPI). Concretely:

```js
const profile = getCalibrationProfileForConnectedPrinter(); // { dpi, marginOffsetMm, ... }
const pixelRatio = profile.dpi / 96; // 96 = whatever reference DPI you used for on-screen design (B2)

const exportCanvas = stage.toCanvas({ pixelRatio, x: labelBoundsPx.x, y: labelBoundsPx.y, width: labelBoundsPx.width, height: labelBoundsPx.height });
// exportCanvas is now the bitmap you hand to your Android print pipeline's rendering step
// (Phase 3 of the Connection Roadmap) — same mm-based label bounds, now rasterized at the
// printer's actual DPI, independent of whatever zoom the user was looking at.
```

This is the one place where the design-canvas half of your app and the Android-print half of your app must agree on a single number (the target DPI) — get that handoff right, and most "designed fine, printed wrong" reports disappear.