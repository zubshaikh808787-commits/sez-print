# Canvas architecture

Recorded before Task 1.1 of the label-editor overhaul (`src/lib/__tests__/task.md`).

## Runtime

This app is a **pure Expo / React Native** client (`expo-router`, React Native `View` tree, Android + iOS). There is **no WebView** hosting a web Konva stage. `Konva.js` / `react-konva` cannot run here: they need a DOM `<canvas>`.

Files named `konva-canvas.tsx` and `konva-transformer.tsx` are **React Native** gesture + layout code, not the Konva.js engine.

## Engine decision for this overhaul

- **Do not migrate to Konva.js.** The Phase 1–6 plan’s math (mm as source of truth, `pxPerMm`, pointer→mm, two-handle proportional resize) stays engine-agnostic.
- **Keep the existing RN artboard** (`KonvaCanvas` + `KonvaTransformer` + millimetre `LabelDocument`) as **production**. Phase 8 is a Skia **prototype** (`/canvas-skia-prototype`) of artboard + one image; full migration waits on paired FPS (`compareRendererFps`).

## Mapping the brief onto this codebase

| Brief (Konva / WebView wording) | What we use here |
|---|---|
| Pointer Events on the split handle | `PanResponder` (plus `touchAction: 'none'` on web) |
| `Konva.Stage` resize | RN `onLayout` + explicit canvas region height |
| `pxPerMm` | `fitEditorPadBoard` (fit) + `viewPxPerMm` (fit × view zoom). Store stays mm. |
| Store in mm | `LabelDocument` element `left` / `top` / `width` / `height` |
| `pointerToMm` | `src/lib/label-coordinate-system.ts` — invert pad pan/zoom, then divide by fit `pxPerMM` |
| Zoom clamp | 25%–800% (`VIEW_ZOOM_MIN` / `VIEW_ZOOM_MAX`) |
| `dragBoundFunc` | `dragBoundMm` / `clampBoxOnCanvas` (millimetres) |
| `contentLayer` / `activeLayer` | RN views in `KonvaCanvas`: idle nodes stay mounted; the moving node is lifted |
| `createImageBitmap` + downscale | `expo-image-manipulator` native resize; working copy ≤2000px, `printUri` keeps the original |
| `Konva.Image.cache()` | `expo-image` `cachePolicy="memory-disk"` + `recyclingKey`; same `activeLayer` lift as other elements |
| `Konva.Transformer` `enabledAnchors: ['middle-right', 'bottom-center']` | RN `KonvaTransformer`: at most `'e'` + `'s'` arrows from `resizePolicyFor` |
| `boundBoxFunc` | `boundBoxMm` in `src/lib/editor/resize-policy.ts` (commit path; live preview mirrors it in px) |
| Transformer / drag ghost styling | `src/lib/editor/canvas-chrome.ts` — 1px teal, no shadow, 0.85 lift, 44px palette chip |
| Chrome remote-debug / WKWebView | Expo RN: shake → Perf Monitor. Pinch/pan are RNGH, not `touch-action` |
| Device pixel ratio in pointer math | Ignored. `absoluteX/Y` are logical px (`POINTER_COORD_SPACE`) |
| Phase 7 regression checklist | [`docs/canvas-qa-checklist.md`](./canvas-qa-checklist.md) |
| Phase 8 Skia prototype | `/canvas-skia-prototype` — millimetre image + Phase 5 `boundBoxMm`. Native Skia is not linked (EAS Gradle). Production stays `rn-view` until `compareRendererFps` says otherwise |

Jewelry 14×96 / 54×96 and cable 50×73 print millimetres stay unchanged by this layout work.
