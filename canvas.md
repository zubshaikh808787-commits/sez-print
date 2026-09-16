# Canvas Engine Rebuild — React Native Skia (Recommended), with Konva-in-WebView as Appendix

This document replaces the assumption in earlier docs that the canvas engine is (or should become) literal Konva.js. It gives a full rebuild spec for the recommended path — **React Native Skia** — plus an updated resize-handle spec, and an honest appendix on the Konva-in-WebView alternative if you want it instead.

---

## 0. Why Skia over Konva-in-WebView, specifically for you

Every bug you've hit so far traces back to the same underlying pattern: **something crossing a thread, bridge, or re-render boundary during an active gesture.** Shared-value reset via `useEffect`, JS-thread contamination in `onUpdate`, potential double gesture-handling — all variations of "the interaction loop isn't staying cleanly on one thread doing pure, cheap updates."

A WebView-hosted Konva canvas makes this *worse* by construction: every touch coordinate either has to be forwarded from RN into the WebView continuously (reintroducing a bridge crossing on every single drag frame — the exact class of problem you've been debugging), or the WebView has to own touch handling entirely and RN gesture handler/Reanimated get sidelined for canvas interaction, which throws away the native gesture work you've already built and debugged.

React Native Skia avoids this structurally: it renders to a real native GPU surface, and **Reanimated worklets can draw directly to it** — meaning your pan gesture's `onUpdate` can update Skia-rendered shapes on the UI thread, same as it currently updates a `useAnimatedStyle` transform, with no bridge crossing at all during the drag. This is the same rendering approach used by production drawing/design apps built on React Native. It's not a compromise relative to Konva — for a mobile app specifically, it's a better fit.

---

## 1. Package changes

```bash
npx expo install @shopify/react-native-skia
```
- `react-native-gesture-handler` and `react-native-reanimated` — **you already have these, keep them.** They're not being replaced; only the *rendering* layer changes, from RN Views/SVG to Skia primitives. Your gesture logic is being fixed and re-hosted, not thrown away.
- No WebView, no new bridge/messaging library needed.

---

## 2. Core architecture

### 2.1 One Skia `Canvas`, one coordinate system
```jsx
import { Canvas, Group } from '@shopify/react-native-skia';

<Canvas style={{ flex: 1 }}>
  <Group transform={canvasTransform}> {/* zoom/pan matrix, see §6 */}
    <LabelBackground /> {/* the physical label bounds, white rect + optional grid */}
    {elements.map(el => <RenderedElement key={el.id} element={el} />)}
    <SelectionOverlay /> {/* dashed outline + resize handles, see §4 */}
  </Group>
</Canvas>
```
Everything — background, content elements, selection outline, resize handles — lives inside **one** Skia canvas tree. This is important: it means the handles are drawn in the exact same coordinate space and the exact same frame as the content they control, with zero risk of the handle-position-sync drift that plagued the SVG-overlay approach.

### 2.2 Data model stays exactly as-is
Your mm-based element data model (position, size, rotation, type, content) doesn't change. Skia is purely the render layer — you're not migrating your storage format, undo system, or property panel logic. Each element's mm values convert to px via the same single conversion function principle from the earlier docs (§B2 of the original Canvas Behavior Spec) — that guidance still fully applies here.

### 2.3 Element types → Skia primitives

| Element type | Skia representation |
|---|---|
| Text | `<Text>` (Skia's own text/paragraph primitive — supports font, size, alignment natively) |
| Barcode / QR | Generate the barcode/QR as an SVG or raw pixel buffer (same as before), convert to a Skia `Image` via `Skia.Image.MakeImageFromEncoded()` or draw the barcode's bars directly as Skia `Rect`s for perfect crispness at any zoom (recommended — bars are just rectangles, drawing them natively avoids any raster/blur concerns entirely) |
| Shapes (rect, circle, line) | Native Skia `Rect`, `Circle`, `Line`, `Path` |
| Image | Skia `Image` component, loaded via `useImage(uri)` |
| Table | Composed `Rect` (borders/cells) + `Text` per cell |
| Line | Skia `Line`/`Path` |

**Drawing barcode bars as native Skia rects instead of a raster image is a genuine upgrade over the Konva-web approach** — since they're vector rectangles, they stay perfectly crisp at any zoom level and never need the "regenerate on transformend" performance workaround from the earlier doc; resizing a bar-based barcode is just changing rect widths, which is cheap enough to do every frame if you want to.

---

## 3. Full feature list this canvas should provide

This mirrors the intent of the original Canvas Behavior Spec, restated for this stack:

**Artboard / label**
- Fixed physical size in mm, independent of zoom.
- Optional visible grid (toggle), optional background pattern (matches your "diagonal pattern" icon from the reference screenshots).
- Physical-DPI-accurate export via `canvas.makeImageSnapshot()` at a target pixel size computed from the connected printer's calibration profile (see §7) — not from whatever zoom the user happened to be at.

**Elements**
- Add, select, move, resize (single-axis, see §4), rotate (90° steps via toolbar, not a drag handle — per your reference screenshots), delete, duplicate, lock/unlock, reorder (z-index), show/hide.
- Multi-select (marquee-drag over empty canvas, or shift-tap) with group move/delete.
- Per-type property editing (font, barcode encode mode, content source: manual/counter/data-bound) via the existing property panel, unaffected by this rendering swap.

**Selection**
- Dashed bounding-box outline matching the selected element(s) exactly, live-updating during drag/resize with zero lag (drawn in the same Skia frame as the content, so it literally cannot desync).

**Resize** — see §4 for full spec, updated per your request.

**Drag/move**
- Pixel-exact placement, zero snapping/magnetic pull by default (per the earlier explicit requirement from your reference app).
- Fully smooth, 60fps, entirely worklet-driven — see §5 for the specific implementation rules that avoid the bugs found earlier.

**Zoom/pan**
- Pinch-to-zoom and two-finger pan on the canvas background, zoom-to-pinch-center (not zoom-to-corner), never changes any element's real mm size/position — view-only, exactly as originally specified.

**Text editing**
- Double-tap a text element to edit inline (see §8 — Skia text isn't natively editable either, same overlay pattern as Konva but using a native `TextInput`).

**Undo/redo**
- Snapshot the mm-based data model on every discrete action (same approach as originally specified) — unaffected by the rendering engine swap.

**Data-bound / variable fields**
- Text/barcode elements can bind to a data column (counter, data source) for batch label printing — a data-layer feature, unaffected by rendering engine choice.

---

## 4. Updated resize handle spec

This is the part you specifically asked to have updated. Same visual target as before (matching your WePrint reference screenshots), now specified correctly for Skia — and with one genuine improvement Skia enables that Konva-on-web couldn't do as cleanly.

### 4.1 Behavior (unchanged from the reference screenshots)
- Exactly two active handles per selected element: **middle-right** (width-only resize) and **bottom-middle** (height-only resize).
- No corner/proportional handle, no drag-to-rotate handle — rotation is the toolbar's 90° button.
- Circular handle, teal fill (`#2FB6B2`), white directional arrow icon (`↔` for the right handle, `↕` for the bottom handle).
- Dashed red/orange (`#E8543C`) selection outline around the bounding box.

### 4.2 What's genuinely better in Skia vs. the Konva-web approach
On web/Konva, getting a crisp arrow icon inside a circular handle requires pre-rendering the icon as a bitmap and applying it via `fillPatternImage` — a raster-in-a-vector-shape workaround. **In Skia, draw the arrow as a native vector `Path` directly** — it's crisp at any zoom level, needs no image asset, no loading step, and no fill-pattern offset math:

```jsx
import { Circle, Path, Group } from '@shopify/react-native-skia';

function ResizeHandle({ cx, cy, direction }) { // direction: 'horizontal' | 'vertical'
  const RADIUS = 14; // 28px diameter, matches the reference screenshot scale
  const arrowPath = direction === 'horizontal'
    ? 'M -6 0 L -2 -4 M -6 0 L -2 4 M 6 0 L 2 -4 M 6 0 L 2 4 M -6 0 L 6 0' // ↔ two chevrons + shaft
    : 'M 0 -6 L -4 -2 M 0 -6 L 4 -2 M 0 6 L -4 2 M 0 6 L 4 2 M 0 -6 L 0 6'; // ↕ rotated 90°

  return (
    <Group transform={[{ translateX: cx }, { translateY: cy }]}>
      <Circle cx={0} cy={0} r={RADIUS} color="#2FB6B2" />
      <Path path={arrowPath} style="stroke" strokeWidth={1.5} color="#FFFFFF" />
    </Group>
  );
}
```
Position `cx`/`cy` from a `useDerivedValue` tied to the selected element's current width/height shared values — so as the element resizes live, the handle repositions in the exact same frame, with no possibility of the handle visually lagging behind the shape (a real risk in the old SVG-overlay approach, where the handle and the content could be driven by slightly different update paths).

### 4.3 Hit-testing / touch target
Skia's own drawn circle is for visuals only — the actual draggable hit area should be a `Gesture.Pan()` attached to a **larger invisible touch target** (e.g. 44×44pt, standard minimum touch target size) centered on the same point, even though the visible circle is smaller (28px). This is a common mobile UX detail worth being explicit about: matching hit-area size exactly to visual size makes small handles hard to grab accurately on a touchscreen.

### 4.4 Independent single-axis math
```js
const widthHandleGesture = Gesture.Pan()
  .onStart(() => { startWidth.value = elementWidth.value; })
  .onUpdate((e) => {
    elementWidth.value = Math.max(MIN_WIDTH, startWidth.value + e.translationX / canvasScale.value);
    // note: do NOT touch elementHeight.value here — strictly single-axis
  })
  .onEnd(() => {
    runOnJS(commitSize)(elementWidth.value, elementHeight.value); // one JS-thread call, at the end only
  });
```
Same pattern for the height handle, driving only `elementHeight`. Keeping them fully independent (never deriving one from the other, even via an aspect-ratio option) matches your reference app's exact behavior and avoids an entire class of "resize behaves unexpectedly" bugs.

---

## 5. Drag/gesture implementation rules (baking in the earlier diagnostic's lessons)

These rules exist specifically because of the bugs already found in the prior implementation — build the new one so these can't recur:

1. **Never reset a shared value from props while that element is actively selected/being interacted with.** Only re-sync from props/store when the change originated externally (undo, remote update, numeric property-panel edit) — never right after your own gesture's commit. If you need a "source of truth" pattern, make the shared value the source of truth during interaction, and only push *into* the store on `onEnd`, not the other way around during the gesture.
2. **All per-frame position/size math must be scale-aware.** Every `onUpdate` that converts a screen-space touch delta into element-space must divide by the current canvas zoom scale, without exception. Keep `canvasScale` as a single shared value referenced everywhere this conversion happens — don't duplicate the scale-division logic in multiple gesture handlers where it could drift out of sync.
3. **`onUpdate` does shared-value math only.** No `setState`, no `runOnJS` calls, no property-panel live-readout updates inside `onUpdate`. If a live readout is genuinely needed, throttle it explicitly (e.g., update it in `onEnd` only, or via a time-gated `runOnJS` call at most a few times per second, not every frame).
4. **Compose gestures explicitly.** The canvas's own pan/zoom gesture and each element's individual drag/resize gestures must be combined with `Gesture.Exclusive()` (element gestures take priority over canvas panning when a touch starts on an element) — never left as independently-registered gestures that could both claim the same touch.
5. **Convert to/from mm at commit time only, at sufficient precision.** Store sub-millimeter precision (2–3 decimal places) internally; round only for display in the property panel. Never round before writing the committed value back into the store.
6. **One and only one draggable target per touch.** No legacy `PanResponder` anywhere in the same view tree as Gesture Handler — if any exists from the earlier implementation, remove it during migration, don't leave it dormant.

---

## 6. Zoom/pan implementation

```js
const canvasScale = useSharedValue(1);
const canvasTranslateX = useSharedValue(0);
const canvasTranslateY = useSharedValue(0);

const pinchGesture = Gesture.Pinch()
  .onUpdate((e) => {
    canvasScale.value = clamp(e.scale * startScale.value, MIN_ZOOM, MAX_ZOOM);
    // zoom-to-pinch-center math: adjust translateX/Y so the pinch focal point stays fixed on screen
  });

const panGesture = Gesture.Pan()
  .onUpdate((e) => {
    canvasTranslateX.value = startTranslateX.value + e.translationX;
    canvasTranslateY.value = startTranslateY.value + e.translationY;
  });

const canvasTransform = useDerivedValue(() => [
  { translateX: canvasTranslateX.value },
  { translateY: canvasTranslateY.value },
  { scale: canvasScale.value },
]);
```
This transform is applied once, to the top-level `<Group>` wrapping everything (§2.1) — individual elements never need their own zoom-awareness beyond referencing `canvasScale` for their own gesture math (per §5, rule 2).

---

## 7. Export pipeline for printing (this is the handoff to your Android print SDK work)

```js
const targetDpi = calibrationProfile.dpi; // from your printer calibration table, per the earlier Connection Roadmap
const pxPerMm = targetDpi / 25.4;
const exportWidthPx = labelWidthMm * pxPerMm;
const exportHeightPx = labelHeightMm * pxPerMm;

const snapshot = canvasRef.current.makeImageSnapshot({
  x: labelOriginXPx, y: labelOriginYPx, width: exportWidthPx, height: exportHeightPx,
});
const bytes = snapshot.encodeToBytes(); // hand this to your print pipeline
```
Same principle as the original Konva `toCanvas({ pixelRatio })` approach — render the export at the printer's real DPI, completely independent of whatever zoom level the user was looking at on screen — Skia's `makeImageSnapshot` just does this more directly since you can request an arbitrary target size without needing a pixelRatio multiplier trick.

---

## 8. Text editing
Skia doesn't have native editable text, same as Konva. Use a native `TextInput` overlaid on top of the Skia canvas during editing:
- On double-tap of a text element, hide that element's Skia-rendered text, position a `TextInput` at the equivalent screen coordinates (accounting for `canvasScale`/`canvasTranslateX/Y`), focus it.
- On blur/submit, read the value back, update the data model, unhide the Skia text.
- Since this is a native `TextInput`, not an HTML `<textarea>` (unlike the Konva-web pattern), keyboard handling, autocorrect, and text selection all behave like normal native mobile text input — one less thing to hand-roll compared to the web version.

---

## 9. Performance rules specific to Skia

1. **Memoize Skia `Paint`/`Path` objects** with `useMemo` — recreating them every render defeats caching and causes unnecessary work.
2. **Use Skia's `Picture`/static-content caching** for anything that doesn't change during an interaction (e.g., the label background/grid) so it isn't redrawn every frame just because a sibling element is being dragged.
3. **Keep the number of distinct Skia nodes reasonable** — a very large table or many small shapes as individually separate nodes can be flattened into a single `Path` where visually equivalent, reducing per-frame node overhead.
4. **Never allocate new arrays/objects inside a worklet** (`onUpdate`, `useDerivedValue`) — reuse shared values and primitive math, consistent with Reanimated's general worklet rules and directly relevant to keeping §5's "onUpdate does shared-value math only" rule fast, not just correct.

---

## 10. Migration plan from the current implementation

1. Add `@shopify/react-native-skia`. Keep `react-native-gesture-handler`/`react-native-reanimated` as-is.
2. Build the label background + a single static element type (e.g., a rectangle shape) end-to-end first: render in Skia, drag it with the rules in §5, confirm smoothness and exact positioning before adding more element types. This isolates the gesture-correctness work from the "port every element type" work.
3. Port element types one at a time (text, image, barcode, QR, line, shapes, table), each rendering via its Skia primitive from §2.3.
4. Implement the new resize handles per §4, replacing whatever remains of the old SVG-based handle components.
5. Wire zoom/pan per §6.
6. Wire the export pipeline per §7 and confirm output against your printer calibration profile.
7. Port text editing per §8.
8. Remove all old SVG/View-based canvas rendering code and any leftover `PanResponder` usage once Skia parity is confirmed — don't leave the old implementation dormant alongside the new one.
9. Re-run the diagnostic checklist from the earlier troubleshooting doc against the *new* implementation before considering this done — confirm none of the 5 causes from that doc are present in the new gesture code either, since the same category of mistake (prop-resync mid-gesture, scale-unaware math, JS-thread contamination) is possible to reintroduce in any framework if the rules in §5 aren't followed.

---

## Appendix — Konva-in-WebView, if you want literal Konva anyway

If cross-platform code-sharing (the same canvas implementation powering both a future web app and this mobile app) is valuable enough to you to accept the trade-offs, here's what that path actually looks like, honestly:

**Architecture:** an `react-native-webview` hosting a bundled local HTML page running real Konva.js. The WebView owns all canvas touch handling directly (Konva's own event system, exactly as it works on web) — you would **not** route canvas gestures through `react-native-gesture-handler` at all for elements inside the WebView, since the WebView's browser engine handles its own touches independently of RN's native gesture system. RN and the WebView talk via `postMessage` only for **app-level, infrequent** events: load a design, save a design, trigger export/print, undo/redo triggered from a native toolbar button outside the WebView.

**Genuine advantage:** you'd get 1:1 real Konva behavior, identical to a web build — useful if a web version of the designer is actually on your roadmap, since the exact same Konva canvas code could power both.

**Real costs, stated plainly:**
- WebView startup/bundle overhead (a full mini web runtime loading inside your app).
- Scrolling/gesture conflicts between any native RN scrollable UI around the WebView and the WebView's own internal scrolling/zooming need careful isolation.
- Two runtimes to debug (RN/native + the WebView's own JS context) — slower iteration and harder crash diagnosis than a single-runtime native solution.
- Toolbar/property-panel elements outside the WebView (which you'd likely still want as native RN UI for platform-native feel) require you to keep two separate "selected element" states in sync across the `postMessage` boundary — a real source of the exact kind of desync bug this whole troubleshooting arc has been about, just moved to a new boundary.

**When this is worth it anyway:** if a web version of this app is a near-term, concrete plan (not speculative), the code-reuse argument can outweigh the above. If mobile is the only real target for the foreseeable future, Skia is the stronger choice on pure "best experience" grounds — which is what you asked for.