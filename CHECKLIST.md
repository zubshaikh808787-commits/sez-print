# Modernization & Architecture Redesign Task Checklist

> Reference Master Plan: [`ARCHITECTURE_REDESIGN_PLAN.md`](./ARCHITECTURE_REDESIGN_PLAN.md)  
> Detailed Progress Log: [`PROGRESS.md`](./PROGRESS.md)

---

## Standalone Bugfixes (Legacy Konva Canvas — Non-Phase 1)
- [x] **Bugfix (Legacy Konva Canvas):** Vertical Resize Height Jitter on Barcode/Shape/Image Elements (`src/lib/editor/label-bounds.ts`, `src/components/editor/element-renderer.tsx`) — *progress entry added retroactively 2026-09-23; no original log or verification record exists*
- [x] **Bugfix (Legacy Konva Canvas):** Barcode Width Scale & HRI Text Distortion + Anchor Audit in `clampToLabelBounds` (`src/lib/editor/label-bounds.ts`, `src/components/editor/element-renderer.tsx`)
- [x] **Bugfix & Performance (Legacy Konva Canvas):** QR Code Single-Path Vector Rendering & Fluid 120fps Gesture Scaling — includes the resize-bleed fix via headroom clamping (`src/components/editor/element-renderer.tsx`, `src/components/editor/konva-transformer.tsx`, `src/lib/editor/resize-policy.ts`)
- [x] **Enhancement (Active Editor UX):** Real-Time Ruler Scale Highlighting During Move & Resize Gestures (`src/components/canvas-rulers.tsx`, `src/app/edit.tsx`, `src/components/editor/konva-transformer.tsx`, `src/components/editor/konva-canvas.tsx`, `src/components/editor/skia-canvas.tsx`)

---

## Phase 1: Interactive Editor Canvas & Resizing Engine (Editor UI & Geometry)
> Editor stays on Konva; Skia is print-only (Task 1.4). Tasks 1.1–1.2 targeted the Skia editor prototype and are superseded, not delivered on the live editor.

- [x] ~~**Task 1.1:** Refactor `skia-element-renderer.tsx` to support live scaling via Reanimated shared values~~ — **Superseded by Task 1.4** (Konva equivalent: live shared-value scaling in `konva-transformer.tsx`)
- [x] ~~**Task 1.2:** Implement Native Vector Handles in `skia-canvas.tsx`~~ — **Superseded by Task 1.4** (Konva equivalent: shared-value-derived handles in `konva-transformer.tsx`)
- [x] **Task 1.3:** Modernize Template Resizing in `src/lib/element-sizing.ts` (canvas-agnostic; unaffected by Task 1.4)
- [x] **Task 1.4:** Architecture Alignment: Editor Canvas Stabilized on Konva (`konva-canvas.tsx`); Print/Export Rasterizer Decoupled to Headless Skia (Phase 4)

---

## Phase 2: Integer-Module Optical Barcode & 2D Symbology Engine (Canvas-Agnostic)
- [x] **Task 2.1:** Build Integer Module Snapping Engine in `src/lib/barcode/barcode-snapping.ts`
- [x] **Task 2.2:** Implement Authentic PDF417 and DataMatrix Encoders in `src/lib/barcode/`
- [x] **Task 2.3:** Update Barcode & 2D Rendering in `src/components/editor/element-renderer.tsx` & Symbology Core
- [x] **Task 2.4:** Build Real-Time Scannability Preflight Inspector in `src/lib/barcode/scannability-inspector.ts` and `barcode-property-panel.tsx`
- [x] **Bugfix (post-2.4):** Barcode Selection/Bounding Box Sizing Mismatch vs WePrint (`src/components/editor/element-renderer.tsx`, `src/components/editor/types.ts`, `src/lib/element-sizing.ts`)

---

## Editor Feature: Multi-Select ("Multiple" Mode) — Konva Editor
> **Status: Implementation in progress (rewrite underway).** Locked model: one shared scale factor applied through the single-element `resizeMemberByScale`; member origins never move during resize; the shared scale is capped so the whole group stops when any member hits its minimum size (or the canvas edge). Spec: `ARCHITECTURE_REDESIGN_PLAN.md` → "Editor Feature Track: Multi-Select".

- [x] Selection reducers: tap add/remove, mode toggle, union bounds, group align (`src/lib/editor/selection.ts`; `selection.test.ts` 11/11)
- [x] Shared-scale resize primitives: `resizeMemberByScale`, `sharedScaleLimits`, `capSharedScale` (`src/lib/editor/resize-policy.ts`; `resize-member-by-scale.test.ts` 7/7, `multi-transform-verify.test.ts` 4/4)
- [ ] Group drag and resize wired end-to-end in `konva-transformer.tsx` / `konva-canvas.tsx` / `src/app/edit.tsx` (rewrite underway)
- [ ] Multi-select property panel (`src/components/editor/multi-select-property-panel.tsx`) applies to all members as one undo step
- [ ] On-device verification: live equals commit (no release jump); group stops together at min-size and canvas-edge caps; square-locked QR inside a group; ruler/chrome follow union bounds; no selection blink on add; `npx tsc --noEmit` clean

---

## Phase 3: Constraint-Based Layout & Responsive Anchor Architecture
- [ ] **Task 3.1:** Extend `LabelElement` Schema in `src/lib/label-document.ts`
- [ ] **Task 3.2:** Implement Layout Constraint Solver in `src/lib/layout-constraints.ts`
- [ ] **Task 3.3:** Integrate Constraint Resolution into Label Size Switching
- [ ] **Task 3.4:** Add Constraint UI Controls to Editor Property Panels

---

## Phase 4: Headless In-Memory Skia Direct Rasterizer (Print Pipeline)
- [ ] **Task 4.1:** Build Headless Skia Surface Engine in `src/printing/raster/skia-surface.ts`
- [ ] **Task 4.2:** Implement High-Speed 1-Bit Monochrome Bit-Packer
- [ ] **Task 4.3:** Integrate Direct Rasterizer into `src/app/print.tsx`

--- 

## Phase 5: Streaming Multi-Page Batch & Data Binding Pipeline
- [ ] **Task 5.1:** Create Data Substitution Engine in `src/printing/batch/data-binder.ts`
- [ ] **Task 5.2:** Build Streaming Batch Controller in `src/printing/batch/batch-streamer.ts`
- [ ] **Task 5.3:** Cancellation & Progress UI in `src/app/print.tsx`

---

## Phase 6: Hardware Calibration, Printhead Margins & Universal Driver Layer
> Spec revised 2026-09-23 after the app-side verification pass in [`SDKS.md`](./SDKS.md). Three sizing contracts: **A** mm-native job (Josh), **B** raw commands we generate (Dev, TD-404), **C** bitmap-only (Label X, Tez). Depends on Phase 4 (1-bit buffer); 6.1 and the per-adapter defect fixes can start earlier.

- [x] **Pre-work (2026-09-23):** Dev `isAvailable()` catch returns `false`; Josh gap sent as mm → 0.01 mm (`gapMmTo01mm`), JS no longer rounds — **hardware feed check still pending**
- [ ] **Task 6.1:** SDK Build Integrity & Decoupling (re-run `expo prebuild` so `pickFirst` is present locally; two different `libPrinterNative.so` binaries + Tez JAR missing `Code941`/`Compress` that the Luck AAR still has; keep rules + minify-on test — not proven to break all five; remove unused binaries; fix misleading comments / `printer-models.ts` copy)
- [ ] **Task 6.2:** `PrinterBridge` Contract in `src/lib/printer/universal-driver.ts` (`MonoPrintJob`, `DriverCapabilities.sizingContract`, `confirmed | sent-unconfirmed | failed` outcome, native 1-bit entry points)
- [ ] **Task 6.3:** Single TSPL / ESC-POS Generator for contract B
- [ ] **Task 6.4:** Five Isolated `PrinterBridge` Adapters (requested rollout order; differs from `SDKS.md` difficulty ranking — see plan)
  - [ ] **6.4a** Dev / Veer (B) — native `commandSet` default `"escpos"` vs JS `"tspl"` (owned by this adapter, not a separate task)
  - [ ] **6.4b** Label X / MiniX / GD985 (C) — blocked on 6.1 decoupling + `SDKS.md` Q2–Q3; also: `isAvailable` always true, dither cutoff 128, print hang, no `OnDestroy`
  - [ ] **6.4c** Tez / Shakti (C) — blocked on 6.1 + `SDKS.md` Q1; hardware logcat check of `commandApi` first (ahead of Josh gap and TD-404 caliper); also: `isAvailable { true }`, no `OnDestroy`
  - [ ] **6.4d** Tejas / Rudra / TD-404 (B) — dots/mm needs `SDKS.md` Q6 caliper test
  - [ ] **6.4e** Josh (A) — path per `SDKS.md` Q4; also: `DataEnded` 200 ms false-success, bitmap leak on fail, `"left"` forces top
- [ ] **Task 6.5:** Hardware Capability Discovery (printer-reported DPI / head width, profile fallback)
- [ ] **Task 6.6:** Calibration Profile Store in `src/lib/printer/calibration-store.ts` (migrate `printCalibration`; MAC key for Bluetooth, **alternate key for TD-404 Wi-Fi** — `SDKS.md` Q8)
- [ ] **Task 6.7:** Guided Calibration Wizard (extends `src/app/calibration-print.tsx`)

---

## Phase 7: Print Preflight Engine & Thermal Density Optimization
- [ ] **Task 7.1:** Build Preflight Inspection Rules in `src/lib/preflight/preflight-engine.ts`
- [ ] **Task 7.2:** Build Thermal Density Analyzer in `src/printing/raster/thermal-density.ts`
- [ ] **Task 7.3:** Build Preflight Review UI Modal in `src/components/preflight/preflight-modal.tsx`
