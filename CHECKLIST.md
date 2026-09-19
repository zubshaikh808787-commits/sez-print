# Modernization & Architecture Redesign Task Checklist

> Reference Master Plan: [`ARCHITECTURE_REDESIGN_PLAN.md`](./ARCHITECTURE_REDESIGN_PLAN.md)  
> Detailed Progress Log: [`PROGRESS.md`](./PROGRESS.md)

---

## Standalone Bugfixes (Legacy Konva Canvas — Non-Phase 1)
- [x] **Bugfix (Legacy Konva Canvas):** Vertical Resize Height Jitter on Barcode/Shape/Image Elements (`src/lib/editor/label-bounds.ts`, `src/components/editor/element-renderer.tsx`)
- [x] **Bugfix (Legacy Konva Canvas):** Barcode Width Scale & HRI Text Distortion + Anchor Audit in `clampToLabelBounds` (`src/lib/editor/label-bounds.ts`, `src/components/editor/element-renderer.tsx`)
- [x] **Bugfix (Legacy Konva Canvas):** QR Code Vector Rendering & Resize Bleed (`src/components/editor/element-renderer.tsx`)
- [x] **Enhancement (Active Editor UX):** Real-Time Ruler Scale Highlighting During Move & Resize Gestures (`src/components/canvas-rulers.tsx`, `src/app/edit.tsx`, `src/components/editor/konva-transformer.tsx`, `src/components/editor/konva-canvas.tsx`, `src/components/editor/skia-canvas.tsx`)

---

## Phase 1: Interactive Canvas & Resizing Engine (Editor UI & Geometry)
- [x] **Task 1.1:** Refactor `skia-element-renderer.tsx` to support live scaling via Reanimated shared values
- [x] **Task 1.2:** Implement Native Vector Handles in `skia-canvas.tsx`
- [x] **Task 1.3:** Modernize Template Resizing in `src/lib/element-sizing.ts`
- [x] **Task 1.4:** Architecture Alignment: Editor Canvas Stabilized on Konva (`konva-canvas.tsx`); Print/Export Rasterizer Decoupled to Headless Skia (Phase 4)

---

## Phase 2: Integer-Module Optical Barcode & 2D Symbology Engine (Canvas-Agnostic)
- [x] **Task 2.1:** Build Integer Module Snapping Engine in `src/lib/barcode/barcode-snapping.ts`
- [x] **Task 2.2:** Implement Authentic PDF417 and DataMatrix Encoders in `src/lib/barcode/`
- [x] **Task 2.3:** Update Barcode & 2D Rendering in `src/components/editor/element-renderer.tsx` & Symbology Core
- [ ] **Task 2.4:** Build Real-Time Scannability Preflight Inspector in `src/lib/barcode/scannability-inspector.ts` and `barcode-property-panel.tsx`

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
- [ ] **Task 6.1:** Refactor Driver Layer into Unified Hardware Interface
- [ ] **Task 6.2:** Build MAC-Keyed Calibration Storage in `src/lib/printer/calibration-store.ts`
- [ ] **Task 6.3:** Implement Interactive Calibration Wizard Screen

---

## Phase 7: Print Preflight Engine & Thermal Density Optimization
- [ ] **Task 7.1:** Build Preflight Inspection Rules in `src/lib/preflight/preflight-engine.ts`
- [ ] **Task 7.2:** Build Thermal Density Analyzer in `src/printing/raster/thermal-density.ts`
- [ ] **Task 7.3:** Build Preflight Review UI Modal in `src/components/preflight/preflight-modal.tsx`
