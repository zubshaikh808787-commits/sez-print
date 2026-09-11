# Canvas overhaul — QA checklist

Device pass for Phases 1–6 (`src/lib/__tests__/task.md`). This app is **Expo React Native**, not a Konva WebView. Chrome remote-debug of a WKWebView does not apply.

**Lab (this machine):** `npx tsc --noEmit` · `npm run test:editor` · `npm run test:print`

Jewelry **54×96** and cable **50×73** print millimetres must not change.

---

## How to profile FPS (Task 7.1)

Target: **~60fps** while dragging/resizing on a busy label (12+ elements, at least one large photo).

1. Open a label, add 11 items (text/QR/barcode mix) plus one imported photo.
2. On the device: shake → **Show Perf Monitor** (or `j` in the Metro terminal).
3. Drag the photo across the artboard, then resize it with the right-edge arrow.
4. JS FPS should stay near 60; idle elements must not flicker.

| Device | OS | Busy drag FPS | Busy resize FPS | Idle flicker? | Date |
|---|---|---|---|---|---|
| Mid-range Android | | | | | |
| iPhone | | | | | |

Lab already covers the levers: `activeLayer` lift (`splitCanvasLayers`), one rAF write (`createFrameThrottled`), working photo ≤ **2000px** (`EDITOR_IMAGE_MAX_EDGE_PX`).

---

## iOS (Task 7.2)

There is no WKWebView. Pinch/pan are `react-native-gesture-handler` with `shouldCancelWhenOutside(false)`. The tools sheet is a separate `ScrollView` below the pad (`scrollEnabled` off while a palette ghost is up). The split handle refuses responder termination so iOS bounce cannot steal it.

| Check | Pass |
|---|---|
| Divider drag is not stolen by the tools sheet scroll | |
| Pinch-zoom on the pad is not a system back-swipe / page scroll | |
| One-finger pan of the zoomed pad does not move a selected element | |
| Palette drag from Text/QR follows the finger; sheet does not scroll | |
| `touch-action` is N/A on iOS; web still sets `touchAction: 'none'` on the divider | |

---

## Density (Task 7.3)

Pointer path is **logical pixels**. `PixelRatio` must not be multiplied into `pointerToMm`. Automated pack: `src/lib/editor/__tests__/canvas-qa.test.ts` (dpr 1 / 2 / 3).

| Device | Density class | Drop on 10mm ruler = 10mm? | Date |
|---|---|---|---|
| Standard (mdpi / 1x) | | | |
| Retina-class (2x–3x) | | | |

---

## Phase 1 — Split layout

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| Divider resizes canvas vs tools, no jump, clamps at 35% / panel min | [x] canvas-split.test.ts | | |
| Hit target ≥ 44px | [x] | | |
| Maximize canvas and restore; 150–250ms animation | [x] `SPLIT_ANIMATION_MS = 200` | | |
| Divider drag re-fits `pxPerMm`, artboard stays on screen | [x] | | |
| Split ratio / fullscreen persist across reopen | [x] | | |

---

## Phase 2 — Coordinates

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| Store is millimetres, independent of zoom | [x] view-transform.test.ts | | |
| 10mm square is the same fraction of 50×50 and 100×150 | [x] | | |
| Ruler 0 and length ticks sit on artboard edges at every zoom | [x] | | |
| Pinch / +/− / Fit; zoom 25%–800%; place in a corner, zoom out, still there | [x] | | |

---

## Phase 3 — Drag & drop

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| Drop on a ruler mark is the same mm at 100%, 250%, and panned | [x] | | |
| Drag among 12 elements: idle nodes keep identity (no flicker) | [x] drag-layer + canvas-qa | | |
| Palette QR drop is centered on the finger | [x] palette-drop.test.ts | | |
| Center snap within ~5 screen px | [x] `SNAP_GUIDE_PX = 5` | | |

---

## Phase 4 — Images

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| 12MP working copy is 2000px on the long edge | [x] image-ingest.test.ts | | |
| First place keeps aspect and contain-fits the label | [x] | | |
| Photo drag uses the same active-layer lift as text | [x] | | |
| Delete/undo sweep does not keep orphan files | [x] | | |

Custom `expo-dev-client` may need a rebuild after adding `expo-image-manipulator`.

---

## Phase 5 — Resize

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| Image: only right + bottom arrows, no corners, no rotate stem | [x] resize-policy.test.ts | | |
| Either handle keeps aspect; store mm match; min 5mm | [x] | | |
| Lean arrows, 44px hit, 1px outline | [x] canvas-chrome.test.ts | | |
| QR square; barcode width-only; text wrap + fontSize on height | [x] | | |

---

## Phase 6 — Lean chrome

| Acceptance | Lab | Android | iOS |
|---|---|---|---|
| 1px teal, no drop shadow | [x] | | |
| Move: 0.85 opacity, handles hidden, outline stays | [x] | | |
| Palette ghost ≤ 44px chip, not a full-size rectangle | [x] | | |
| Readable on light (`#E6EBEF`) and dark (`#111`) fills | [x] chromeStrokeForFill | | |

---

## Print stock (must not regress)

| Stock | Lab | Print on device |
|---|---|---|
| Jewelry 54×96 | [x] editor + print tests | |
| Cable 50×73 | [x] | |
| JOSH 50×30 at 8 dpm | [x] test:print | |

---

## Phase 8 — Skia prototype (not production)

Open **Editing Settings → Skia canvas prototype** (`/canvas-skia-prototype`). Rebuild the Expo dev client so `@shopify/react-native-skia` is in the binary.

| Check | Lab | Device |
|---|---|---|
| Artboard + one image; two edge handles; aspect lock | [x] skia-prototype.test.ts | |
| Jewelry 54×96 / cable 50×73 millimetres unchanged | [x] | |
| `compareRendererFps`: no rewrite until RN views miss 60fps and Skia clears it | [x] | |
| Paired Perf Monitor: busy `/edit` vs this screen | | |

Do **not** switch production `/edit` off RN views without those FPS numbers.

