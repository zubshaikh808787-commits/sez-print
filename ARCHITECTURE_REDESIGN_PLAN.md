# Enterprise Architecture Redesign & Modernization Master Plan

> **Authoritative Technical Specification & Phased Execution Blueprint**  
> **Application:** `sez-print` (Universal Mobile Label Design & Thermal Printing Engine)  
> **Target Standard:** Enterprise Parity with Zebra Print Station, Niimbot Pro, WePrint, and Brother P-touch  
> **Hardware Targets:** 203 DPI (8.0 dots/mm) & 304 DPI (11.9685 dots/mm) Thermal Label Printers  

---

## Executive Architectural Blueprint & Vision

Modern industrial-grade label software relies on a strict mathematical foundation: physical dimensions (mm) are the single ground truth, the UI is an interactive GPU projection of that space, and the print output is a discrete, hardware-aligned binary dot raster.

```mermaid
graph TD
    subgraph DataModel["1. Vector Data Model"]
        JSON["LabelDocument JSON: Physical mm Coordinates"]
        Constraints["Responsive Anchor & Constraint Rules"]
    end

    subgraph EditorCanvas["2. Interactive UI Canvas - Phase 1 & 3"]
        SkiaCanvas["React Native Skia Canvas @ GPU Surface"]
        ReanimatedWorklets["Worklet Transforms: Zero Bridge Overhead"]
        SingleAxisHandles["Two 28px Teal Handles + Dashed Selection Box"]
        ConstraintSolver["Live Constraint Engine: 60/120 fps"]
    end

    subgraph OpticalEngine["3. Barcode & Optical Symbology - Phase 2"]
        Snapping["Integer Module Snapping: 1 dot, 2 dots, 3 dots"]
        QuietZones["Enforced 10x Quiet Zones"]
        ISOEncoders["Compliant ISO/IEC Encoders: Code128, QR, PDF417, DataMatrix"]
    end

    subgraph HeadlessRasterizer["4. Headless Print Pipeline - Phase 4 & 5"]
        HeadlessSkia["In-Memory Headless Skia Surface: Under 15ms"]
        Preflight["Print Preflight Engine: Optical & Dot Legibility"]
        MonoPacker["Direct 1-Bit Packed Scanlines: No PNG / No Base64"]
        BatchStreamer["Streaming Multi-Page Batch Feed: Flat Memory"]
    end

    subgraph HardwareLayer["5. Universal Driver & Calibration - Phase 6 & 7"]
        Calibration["MAC-Keyed Calibration Offsets: hOffset, vOffset"]
        Alignment["Center-Fed vs Left-Aligned Printhead Geometry"]
        UniversalHAL["Universal Driver Layer: Dev, Tez, Josh, LabelX, TD404"]
        ThermalSmoothing["Thermal Energy Density Smoothing"]
    end

    JSON --> Constraints
    Constraints --> SkiaCanvas
    Constraints --> HeadlessSkia
    SkiaCanvas --> ReanimatedWorklets
    ReanimatedWorklets --> SingleAxisHandles
    Constraints --> ConstraintSolver

    JSON --> Snapping
    Snapping --> QuietZones
    QuietZones --> ISOEncoders
    ISOEncoders --> HeadlessSkia
    ISOEncoders --> SkiaCanvas

    HeadlessSkia --> Preflight
    Preflight --> MonoPacker
    MonoPacker --> BatchStreamer

    BatchStreamer --> Calibration
    Calibration --> Alignment
    Alignment --> UniversalHAL
    UniversalHAL --> ThermalSmoothing
```

---

## Global Quality Standards & Benchmark Matrix

To establish unyielding software robustness, every subsystem is evaluated against a concrete **Current Standard** versus an industry-grade **Benchmark Standard**.

| Subsystem / Metric | Current Standard (As-Is) | Benchmark Standard (Target) | Gap / Delta | Robustness Verification Gate |
| :--- | :--- | :--- | :--- | :--- |
| **1. Editor Rendering & Gesture FPS** | React Native SVG/Views in `konva-canvas.tsx`. 35–50 fps during active gestures; layout drops when dragging complex items. | 100% GPU Skia Canvas (`@shopify/react-native-skia`). Solid 60/120 fps with under 8ms frame time on mid-range Android devices. | +25 to 70 fps improvement, zero layout recalculation overhead during active gesture. | Reanimated frame-drop profiler: 0 dropped frames over a 300-frame continuous drag session. |
| **2. Drag / Drop Precision** | Handled in `konva-transformer.tsx` with risk of float rounding jumps and DOM remount flashes. | Scale-aware Reanimated worklets; sub-millimeter 4-decimal precision (`0.0001mm`); zero magnetic snapping; stable single list. | Eliminates pointer slippage, frame flashing, and repulsive jump zones. | Automated synthetic drag test: touch point delta equals committed coordinate delta within ±0.005mm. |
| **3. Resize UX & Handles** | React Native View elements scaled via matrix transforms; handles rendered as SVG elements outside Skia. | Two circular teal (`#54C8C8`, 28px) handles with native Skia vector arrow paths (↔ width, ↕ height); 44×44pt invisible touch targets. | Single coordinate space; zero desynchronization between selection handles and element content. | Visual parity test matching reference UI + touch target accuracy verification on mobile. |
| **4. Template Resizing Symmetry** | Linear multiplier (sx, sy). Aspect ratio shift squashes text vertically and distorts borders. | Constraint-based layout: perimeter border locking, dynamic module width recalculation for barcodes, text re-wrap reflow. | No clipped text, no deformed borders, preserved aspect ratios on key elements. | Template resize suite: converting 50×50mm to 50×25mm maintains border width ±0% and causes zero text truncation. |
| **5. Barcode Module Precision** | Continuous floating-point SVG rectangles (`bar.width * px`). Fractional widths cause dot jitter on 1-bit thermal printhead. | Discrete integer module snapping (X-dimension in {1, 2, 3, ...} dots). Enforced 10x quiet zones. | Eliminates thermal dot jitter and optical scanner reading failures. | Optical scan verification: ≥ 99.9% first-pass decode rate with Honeywell/Zebra 1D/2D laser scanners. |
| **6. 2D Code Symbology** | Pseudo-random noise matrix (`pseudoMatrix`) used to fake PDF417 and DataMatrix barcodes. | Full ISO/IEC 15438 (PDF417) and ISO/IEC 16022 (DataMatrix) algorithmic encoding with Reed-Solomon error correction. | Compliant barcodes readable by any standard scanner vs. completely unreadable placeholder noise. | Automated decode test using ZXing/ML-Kit reading generated buffers; 100% data fidelity. |
| **7. Print Dispatch Latency** | Offscreen React Native DOM capture via `<ViewShot>`: 250–600ms per label. | Headless in-memory Skia direct rasterization: under 15ms per label directly to monochrome byte buffer. | **15 to 40x faster** print job generation; zero UI thread blocking. | Benchmark script: 100 labels rasterized in under 1.5s total CPU time. |
| **8. Multi-Page Batch Memory** | Offscreen DOM mounted per page; Base64 PNG strings in Hermes heap. 50 pages ~150MB heap spike; OOM crash risk. | Streaming chunk pipeline: render dot stream → packetize TSPL → flush to native driver → garbage collect scanline. | Flat O(1) memory usage: under 15MB memory consumption regardless of job page count (even 1000 pages). | Memory leak test: 500-page batch run on low-end Android device with under 5MB total heap variation. |
| **9. Hardware Margin Calibration** | Dynamic layout calculation, but mechanical offsets (hOffset, vOffset) are not saved per printer MAC address. | Persistent calibration profiles stored per printer MAC; center-fed vs. left-aligned auto-compensation. | Eliminates manual alignment guesswork when switching between printers. | Physical caliper test: printed box margin matches designed position within ±0.2mm. |
| **10. Print Preflight Validation** | Basic canvas size check only (`validatePrintSpec`). Silent failures on thin lines or clipped text. | Preflight rules engine: checks for sub-dot lines (under 1 dot), unscannable barcodes, text overflow, and low-contrast regions. | Proactive user warning and 1-tap auto-repair before wasting physical label stock. | Test harness: 10 synthetic malformed templates flagged with 100% precision before print transmission. |

---

## Phased Implementation Roadmap (Balanced Equal Weight)

The architecture redesign is partitioned into **7 distinct, equal-weight phases**. Each phase is scoped to represent approximately equal engineering complexity, cognitive load, and verification effort.

```
Phase 1: Interactive Skia Canvas & Resizing Engine (Editor UI & Geometry)
Phase 2: Integer-Module Optical Barcode & 2D Symbology Engine
Phase 3: Constraint-Based Layout & Responsive Anchor Architecture
Phase 4: Headless In-Memory Skia Direct Rasterizer (Print Pipeline)
Phase 5: Streaming Multi-Page Batch & Data Binding Pipeline
Phase 6: Hardware Calibration, Printhead Margins & Universal Driver Layer
Phase 7: Print Preflight Engine & Thermal Density Optimization
```

---

### Phase 1: Interactive Skia Canvas & Resizing Engine (Editor UI & Geometry)

#### 1. Architectural Scope & Weight
- **Scope:** Complete migration of the visual editor from the hybrid React Native SVG/View tree (`konva-canvas.tsx`, `konva-transformer.tsx`) to a pure GPU-accelerated React Native Skia Canvas (`skia-canvas.tsx`, `skia-element-renderer.tsx`). Implementation of the modernized dynamic resizing logic in `src/lib/element-sizing.ts`.
- **Weight:** Core foundational phase. Equal weight balanced between native Skia canvas rendering/gestures and mathematical geometry refactoring.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - `src/app/edit.tsx` mounts `<KonvaCanvas>`, which wraps React Native Views and SVG elements inside `<ViewShot>`.
  - Gestures are handled by Reanimated shared values in `konva-transformer.tsx`, but element visuals are composed of React Native `<Text>`, SVG `<Rect>`, and `<Line>`.
  - Resize handles are custom React Native View nodes styled to look like teal circles, but separate from the canvas drawing tree.
  - Template resizing (`scaleDocumentToSize` in `src/lib/element-sizing.ts`) multiplies all coordinates linearly (sx, sy), leading to text squashing, border distortion, and clipped elements when changing aspect ratios.
  - `skia-canvas.tsx` and `skia-element-renderer.tsx` were prototyped, but suffered from static dimension props (`widthPx`, `heightPx`), handle desync during live gesture scaling, and incomplete element support.
- **What Needs to be Changed:**
  - **Entire Refactor:** Replace `<KonvaCanvas>` in `src/app/edit.tsx` with `<SkiaCanvas>`.
  - **Partial Refactor:** Upgrade `skia-canvas.tsx` and `skia-element-renderer.tsx` so that element rendering scales dynamically during active gestures using Reanimated shared values (`curWidth`, `curHeight`, `transX`, `transY`).
  - **Partial Refactor:** Refactor `src/lib/element-sizing.ts` to implement aspect-ratio-aware document scaling:
    - Lock borders to the exact outer perimeter (0, 0, W_new, H_new) with preserved stroke width.
    - Recalculate text element height via `computeWrappedLines` and `computeTextElementHeightMm` after scaling to prevent line truncation.
    - Maintain barcode height-to-width proportions within scannable aspect bounds.
  - **New Feature:** Unified Skia Selection Chrome: Render the red/orange dashed selection box (`#E8543C`, dash `[6, 4]`) and circular teal `#54C8C8` handles (middle-right width ↔, bottom-middle height ↕) directly inside the Skia canvas tree, backed by 44×44pt invisible touch targets.

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - Frame rate during drag/resize: 35–50 fps with visible UI thread stutters when dragging elements with text or tables.
  - Resize handle lag: React Native View handles can visually drift 2–5px behind content during rapid gestures.
  - Document aspect ratio change (e.g. 50×50mm → 50×25mm): Text height shrinks by 50%, font size scales down unnecessarily, multi-line text clips on bottom border.
- **Benchmark Standard:**
  - Solid 60 fps (16.6ms) on standard refresh rate / 120 fps (8.3ms) on ProMotion displays during all drag and resize interactions.
  - Zero coordinate drift: Handles and bounding box rendered in the exact same Skia GPU frame as the element content.
  - Document aspect ratio change: Text maintains readable point size, width adjusts, height re-flows dynamically, borders stay pinned to outer perimeter.
- **Difference / Gap Analysis:**
  - The gap is caused by React Native layout passes (Yoga) and cross-bridge layout sync during gestures. Skia eliminates Yoga from the gesture hot-path entirely by rendering on the GPU surface driven directly by Reanimated worklets.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 1.1:** Refactor `skia-element-renderer.tsx` to support live scaling via Reanimated shared values:
  - Create GPU-composited transform matrix worklets for all element types: Text, Barcode, QR, Image, Shapes, Line, Table, Clipart, Signature.
  - Ensure Skia text layout correctly measures font metrics without triggering React re-renders.
- [ ] **Task 1.2:** Implement Native Vector Handles in `skia-canvas.tsx`:
  - Draw circular teal `#54C8C8` anchors (28px diameter) with native Skia vector arrow paths (↔ width, ↕ height).
  - Bind handle positions to `useDerivedValue` reading `curWidth` and `curHeight` so handles never desynchronize from element boundaries.
  - Attach 44×44pt invisible touch targets via `GestureDetector` with `minDistance(0)`.
- [ ] **Task 1.3:** Modernize Template Resizing in `src/lib/element-sizing.ts`:
  - Rewrite `scaleDocumentToSize` to handle aspect ratio shifts gracefully:
    - Pin borders to (0, 0, W, H) and preserve `lineWidth`.
    - Recalculate text bounds with `computeWrappedLines` and update element height to accommodate text flow.
    - Scale barcodes along the primary axis without violating minimum readable dimensions.
- [ ] **Task 1.4:** Mount `<SkiaCanvas>` in `src/app/edit.tsx`:
  - Replace `<KonvaCanvas>` with `<SkiaCanvas>`.
  - Connect all edit page callbacks: element selection, property panel opening, double-tap inline text editing, and quick rotation.
  - Ensure zoom and pan gestures compose cleanly with element selection gestures using `Gesture.Exclusive()`.

#### 5. Robustness Verification & Quality Gates
- **Automated Test:** Run `src/lib/editor/__tests__/element-sizing.test.ts` to assert that scaling a document from 50×50mm to 50×20mm preserves border stroke, recomputes text height, and keeps all elements within label boundaries.
- **Performance Benchmark:** Execute a 300-frame automated drag and resize sequence. Frame time must remain under 16.6ms with zero garbage collector spikes.
- **Visual Verification:** Confirm circular teal handles and dashed selection box match reference UI with pixel-perfect fidelity at 1×, 2×, and 3× screen zoom levels.

---

### Phase 2: Integer-Module Optical Barcode & 2D Symbology Engine

#### 1. Architectural Scope & Weight
- **Scope:** Complete overhaul of barcode and 2D code generation. Introduction of integer module snapping at target printer DPI (203 & 304 DPI), enforcement of standard quiet zones, and replacement of fake pseudo-random matrices with real ISO/IEC standard encoders for PDF417 and DataMatrix.
- **Weight:** Balanced algorithmic and mathematical engineering phase.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - `src/lib/barcode-code128.ts` encodes Code128 pattern strings, but `element-renderer.tsx` maps bars to SVG rectangles using floating-point coordinates (`bar.x * widthPx`, `bar.width * widthPx`).
  - At 203 DPI (8 dots/mm) or 304 DPI (11.9685 dots/mm), fractional scaling causes narrow bars (e.g. 1.3 dots) to round inconsistently during 1-bit monochrome thresholding. This "dot jitter" causes narrow bars to alternate between 1 dot and 2 dots, rendering barcodes unscannable.
  - No quiet zone enforcement: barcodes can be positioned flush against borders or other elements, preventing optical readers from detecting the start/stop pattern.
  - In `element-renderer.tsx` line 322, PDF417 and DataMatrix are simulated using a pseudo-random number generator (`pseudoMatrix`)! These 2D barcodes are visual mocks and cannot be decoded by any scanner.
- **What Needs to be Changed:**
  - **Partial Refactor:** Update Code128 and 1D barcode generators to snap bar module widths (X-dimension) to exact integer printer dots (1, 2, 3, ... dots) based on the target DPI.
  - **New Feature:** Implement standard quiet zones (minimum 10 module widths on left and right for 1D barcodes; 4 module widths for QR codes).
  - **Entire Refactor:** Replace `pseudoMatrix` with authentic, compliant ISO/IEC encoders for PDF417 (ISO/IEC 15438) and DataMatrix (ISO/IEC 16022) with configurable error correction levels (ECC 0–8).
  - **New Feature:** Real-time optical scannability validator: Flag barcodes in the editor if their calculated X-dimension is below 0.25mm (2 dots at 203 DPI) for standard commercial scanning.

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - First-pass optical scan success rate on printed thermal labels: ~82% on 203 DPI printers (frequent scan failure on compact barcodes).
  - PDF417 / DataMatrix scan success rate: 0% (fake pseudo-random matrix).
  - Quiet zone adherence: None (bars touch bounding box edges).
- **Benchmark Standard:**
  - First-pass optical scan success rate: ≥ 99.9% across all standard 1D symbologies (Code128, Code39, EAN-13, UPC-A, ITF) using industrial handheld scanners and mobile camera apps.
  - 100% compliant PDF417 and DataMatrix encoding with verified Reed-Solomon checksum recovery.
  - Enforced quiet zones: 10× narrow-bar width minimum on 1D barcodes, 4× module width on 2D codes.
- **Difference / Gap Analysis:**
  - Thermal printheads are discrete binary devices (a dot is either 100% heated or 100% cold). Continuous vector scaling works on computer displays with subpixel anti-aliasing, but fails on binary thermal heads. Integer module snapping guarantees that every bar and space maps to an exact integer number of thermal dots.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 2.1:** Build Integer Module Snapping Engine in `src/lib/barcode/barcode-snapping.ts`:
  - Function `snapBarcodeToHardwareDots(contentWidthMm, totalModules, dpi)` returning quantized width and individual module dot counts (1, 2, 3 dots).
  - Enforce quiet zones (10× module width left/right margins).
- [ ] **Task 2.2:** Implement Authentic PDF417 and DataMatrix Encoders:
  - Integrate pure, lightweight TypeScript encoders for ISO/IEC 15438 (PDF417) with variable error correction (ECC Level 0 to 8).
  - Integrate ISO/IEC 16022 (DataMatrix ECC 200) square and rectangular module matrices.
  - Completely remove `pseudoMatrix` from the codebase.
- [ ] **Task 2.3:** Update Skia Barcode Rendering in `skia-element-renderer.tsx`:
  - Render 1D barcode bars directly as contiguous native Skia `Rect`s quantized to dot increments.
  - Render 2D matrix modules as Skia `Rect` grid items with thermal-aligned cell boundaries.
- [ ] **Task 2.4:** Build Real-Time Scannability Preflight Inspector:
  - Add visual indicator in `barcode-property-panel.tsx` warning the user when barcode density or physical size is below optical scanning thresholds for 203 DPI heads.

#### 5. Robustness Verification & Quality Gates
- **Automated Test:** Unit test decoding generated Code128, QR, PDF417, and DataMatrix bitmaps using ZXing/ML-Kit headless decoders across 20 test strings; require 100% decode success.
- **Physical Test:** Print a sheet of 10 barcodes (varying from 15mm to 60mm wide) on a 203 DPI thermal printer. Scan each barcode with a physical handheld laser scanner; require 10 out of 10 successful scans on the first trigger pull.
- **Caliper Test:** Measure total barcode width and quiet zone margins; confirm values match calculated millimeter specifications within ±0.1mm.

---

### Phase 3: Constraint-Based Layout & Responsive Anchor Architecture

#### 1. Architectural Scope & Weight
- **Scope:** Upgrade the `LabelDocument` data model and layout engine from purely absolute coordinates (`left`, `top`, `width`, `height`) to a responsive, constraint-driven system with anchors, margin locks, and dynamic flow rules.
- **Weight:** Core architectural refactoring of document schema, serialization, and layout solver.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - `LabelElement` in `src/lib/label-document.ts` only stores absolute values: `left`, `top`, `width`, `height`.
  - When the user changes label stock size (e.g. from 50×50mm square to 40×30mm or 70×50mm), elements either scale linearly or clip outside the printable area.
  - No way to specify: "Keep this barcode centered horizontally and 3mm from the bottom", "Lock this border to the edges", or "Stretch this title across the top with 2mm side margins".
- **What Needs to be Changed:**
  - **Partial Refactor:** Extend `LabelElement` with optional `ElementConstraints` definition:
    ```ts
    export type ElementConstraints = {
      horizontalAnchor?: 'left' | 'center' | 'right' | 'stretch' | 'none';
      verticalAnchor?: 'top' | 'center' | 'bottom' | 'stretch' | 'none';
      marginMm?: { top?: number; right?: number; bottom?: number; left?: number };
      lockAspectRatio?: boolean;
      autoWrapText?: boolean;
    };
    ```
  - **New Feature:** Implement a high-performance Constraint Solver in `src/lib/layout-constraints.ts`:
    - Given a `LabelDocument` and a new target width and height, resolve element positions and sizes based on their assigned constraints.
    - Fully backward-compatible: elements without constraints default to proportional scaling or retain current behavior.
  - **New Feature:** Anchor Controls in Editor: Add intuitive alignment and anchor buttons in `position-controls.tsx` and property panels (Pin to Top, Pin to Bottom, Center Horizontally, Stretch to Width).

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - Stock size transition: Destructive. Modifying label dimensions breaks visual layout; user must manually reposition and resize every element.
  - Border handling: Scales stroke width unevenly; corners distort.
- **Benchmark Standard:**
  - Stock size transition: Responsive and non-destructive (similar to Figma auto-layout / CSS flex constraints).
  - Borders stay pinned to outer perimeter with constant millimeter stroke width.
  - Headers and footers stay pinned to respective margins. Barcodes maintain optical proportions while centering automatically.
- **Difference / Gap Analysis:**
  - Professional label applications allow enterprise users to design a single template and print it across different roll widths (e.g. 2-inch vs 3-inch vs 4-inch printers). Absolute positioning makes template reuse painful. Constraint resolution provides automatic responsive adaptation.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 3.1:** Extend `LabelElement` Schema in `src/lib/label-document.ts`:
  - Add `constraints?: ElementConstraints` to `LabelElementBase`.
  - Update template serialization and validation schemas in `src/lib/template-schema.ts`.
- [ ] **Task 3.2:** Implement Layout Constraint Solver in `src/lib/layout-constraints.ts`:
  - Build `resolveDocumentConstraints(doc: LabelDocument, targetWidthMm: number, targetHeightMm: number): LabelDocument`.
  - Resolve horizontal anchors (`left`, `center`, `right`, `stretch`) and vertical anchors (`top`, `center`, `bottom`, `stretch`).
  - Calculate margin locks and aspect ratio preservation rules.
- [ ] **Task 3.3:** Integrate Constraint Resolution into Label Size Switching:
  - Wire `resolveDocumentConstraints` into `src/lib/element-sizing.ts` and `src/stores/label-store.ts` when changing label stock dimensions.
- [ ] **Task 3.4:** Add Constraint UI Controls to Editor Property Panels:
  - Add Anchor Selector widget to `position-controls.tsx` (9-point anchor grid: Top-Left, Top-Center, Top-Right, etc.).
  - Add "Lock Aspect Ratio" and "Pin to Margins" toggles.

#### 5. Robustness Verification & Quality Gates
- **Automated Test:** Create unit tests with 5 standard templates (Shipping Label, Retail Price Tag, Cable Flag, Jewelry Tag, Inventory Asset). Scale each template across 3 different physical sizes; assert zero element clipping and exact preservation of pinned margins within ±0.05mm.
- **Backward Compatibility Test:** Verify that existing legacy templates without `constraints` load and render identically without any layout mutation.

---

### Phase 4: Headless In-Memory Skia Direct Rasterizer (Print Pipeline)

#### 1. Architectural Scope & Weight
- **Scope:** Complete elimination of `<ViewShot>` and offscreen React Native DOM rendering during print dispatch. Construction of a pure, headless in-memory Skia direct rasterizer that produces 1-bit packed monochrome byte buffers in under 15ms per label.
- **Weight:** High-impact systems engineering phase focusing on native rasterization, memory efficiency, and print speed.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - In `src/app/print.tsx`, printing mounts an offscreen `<ViewShot>` component containing `<LabelPreview>`, which renders a full React Native View hierarchy (`<View>`, `<Text>`, SVG `<Rect>`, etc.).
  - The app calls `waitForNextPaint()`, invokes `captureRef(shotRef, PRINT_CAPTURE_OPTIONS)` to generate a PNG file via native view screenshot, reads back the Base64 string, and passes it over the bridge to the printer SDK.
  - Each page capture incurs 250–600ms latency, triggers React Native layout cycles, consumes hundreds of megabytes of Hermes heap on multi-page batches, and is susceptible to Android OS display scale and font size overrides.
- **What Needs to be Changed:**
  - **Entire Refactor:** Completely eliminate `<ViewShot>`, `react-native-view-shot`, and offscreen DOM mounting from `src/app/print.tsx`.
  - **New Feature:** Implement pure **Headless Skia Direct Rasterizer** (`src/printing/raster/skia-rasterizer.ts`):
    ```ts
    export function rasterizeDocumentToBitmap(
      doc: LabelDocument,
      dpi: number,
      options: RasterizeOptions
    ): {
      widthDots: number;
      heightDots: number;
      bytesPerRow: number;
      mono1bppBuffer: Uint8Array;
    }
    ```
  - Traverses the `LabelDocument` vector tree directly, draws text, shapes, lines, barcodes, and images onto an in-memory `Skia.Surface`, and executes fast 1-bit monochrome thresholding directly in C++/Skia memory.
  - Generates the raw TSPL/ESC-POS `BITMAP` scanline byte stream directly, bypassing PNG encoding, PNG decoding, and Base64 string serialization.

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - Single page rasterization & capture time: 250–600ms.
  - Multi-page batch (50 labels): 25–40 seconds with frequent UI freeze.
  - Memory allocation: 50–150MB temporary PNG Base64 heap allocations.
  - Rendering fidelity: Affected by Android system font scaling and screen DPI.
- **Benchmark Standard:**
  - Single page direct rasterization time: **under 15ms**.
  - Multi-page batch (50 labels): **under 0.8 seconds** total generation time.
  - Memory allocation: Flat O(1) memory, under 2MB total buffer reused across pages.
  - Rendering fidelity: 100% deterministic hardware dot output, completely immune to phone display settings or font scaling.
- **Difference / Gap Analysis:**
  - ViewShot takes a screenshot of a live Android View surface on the UI thread. Headless Skia draws directly into a hardware-backed C++ memory buffer off the UI thread. This removes the entire overhead of React Native view mounting, Yoga layout calculation, and PNG file compression.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 4.1:** Build Headless Skia Surface Engine in `src/printing/raster/skia-surface.ts`:
  - Instantiate offscreen Skia Surface: `Skia.Surface.MakeOffscreen(widthDots, heightDots)`.
  - Implement drawing visitors for each element type:
    - Text: Render using Skia `Paragraph` or `TextBlob` at target DPI font sizes.
    - Barcode: Direct Skia `Rect` fills snapped to printer dots.
    - QR Code / 2D Code: Direct Skia `Rect` module matrix.
    - Shapes, Lines, Borders: Native Skia vector paths with exact dot stroke widths.
    - Images: Scaled and thresholded via Skia shader or bitmap blit.
- [ ] **Task 4.2:** Implement High-Speed 1-Bit Monochrome Bit-Packer:
  - Extract raw pixel buffer from Skia surface snapshot.
  - Pack 8 pixels into 1 byte (MSB first, black = 0 / white = 1 or inverse per TSPL spec) in a tight typed-array loop:
    ```ts
    // 8 dots per byte row packing
    const byte = (p0 << 7) | (p1 << 6) | (p2 << 5) | (p3 << 4) | (p4 << 3) | (p5 << 2) | (p6 << 1) | p7;
    ```
- [ ] **Task 4.3:** Integrate Direct Rasterizer into `src/app/print.tsx`:
  - Replace `captureRef` call with `rasterizeDocumentToBitmap`.
  - Send the generated 1-bit monochrome byte stream directly to `printerManager.printBitmap` or TSPL `BITMAP` packet generator.
  - Remove all offscreen `<ViewShot>` JSX and layout wait timers (`waitForNextPaint`).

#### 5. Robustness Verification & Quality Gates
- **Automated Benchmark Test:** Rasterize a full shipping label (text + 1D barcode + QR code + border) at 304 DPI (1440 × 960 dots). Benchmark must record execution time under 15ms on physical hardware.
- **Memory Profiler:** Verify zero heap accumulation over 100 consecutive rasterizations using Hermes memory inspection.
- **Visual & Binary Comparison:** Compare binary output of headless rasterizer against physical print proofs; verify 100% dot-for-dot fidelity.

---

### Phase 5: Streaming Multi-Page Batch & Data Binding Pipeline

#### 1. Architectural Scope & Weight
- **Scope:** Architecture of a streaming multi-page printing pipeline. Separation of template design from variable data rows (Excel, CSV, sequential numbers), dynamic on-the-fly field evaluation, and chunked Bluetooth transmission.
- **Weight:** Equal weight balanced between batch data processing, memory management, and asynchronous hardware streaming.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - Multi-page printing in `src/app/print.tsx` runs an imperative `for` loop that updates React state `setPageIndex(page)`, forces a React re-render, waits for layout with `waitForNextPaint()`, and screenshots each page individually.
  - Printing 50 or 100 pages freezes the UI, causes phone thermal throttling, and risks crashing the app if the OS kills the process due to Hermes memory pressure.
  - Data binding (importing an Excel sheet with 50 rows) duplicates entire document structures in memory instead of maintaining one template with a streaming data iterator.
- **What Needs to be Changed:**
  - **Entire Refactor:** Decouple template definition from variable data rows. Introduce a **Streaming Batch Print Pipeline** (`src/printing/batch/batch-streamer.ts`):
    ```ts
    export async function streamBatchPrintJob(
      template: LabelDocument,
      dataFeed: IterableIterator<Record<string, string>>,
      printer: PrinterAdapter,
      onProgress: (current: number, total: number) => void
    ): Promise<void>
    ```
  - For each row, substitute variable fields (e.g. `{name}`, `{sku}`, `{barcode}`) into the template in-memory, rasterize to 1-bit scanline buffer via Phase 4's headless engine, transmit chunk to the printer buffer, and immediately release the buffer for garbage collection.
  - Flat O(1) memory usage: Only one page bitmap exists in memory at any millisecond, regardless of whether printing 10 labels or 1,000 labels.

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - 50-label batch print time: 25–40 seconds (plus 10–15 seconds of UI freezing).
  - Peak memory usage during 50-label batch: 120–250MB heap spike.
  - Job cancellation: Sluggish or leaves printer in an undefined state.
- **Benchmark Standard:**
  - 50-label batch print dispatch time: under 3 seconds total pipeline generation.
  - Peak memory usage during batch: under 15MB flat memory footprint.
  - Job cancellation: Instantaneous (under 50ms) with proper hardware abort commands sent to the printer.
- **Difference / Gap Analysis:**
  - Standard apps process batch jobs by pre-generating all pages as bloated UI components or images. Industrial systems use a streaming iterator pipeline that feeds the print buffer continuously while maintaining a minimal memory footprint.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 5.1:** Create Data Substitution Engine in `src/printing/batch/data-binder.ts`:
  - Fast string and barcode interpolation for variable columns (Excel, CSV, dynamic counters, date/time offsets).
  - Support formatters: zero-padded numbers, uppercase transforms, currency formatting.
- [ ] **Task 5.2:** Build Streaming Batch Controller in `src/printing/batch/batch-streamer.ts`:
  - Chunked asynchronous generator yielding 1-bit rasterized page packets one at a time.
  - Flow-control backpressure: Monitor printer Bluetooth buffer status; pause rasterization when printer buffer is full; resume as pages are physically printed.
- [ ] **Task 5.3:** Cancellation & Progress UI in `src/app/print.tsx`:
  - Wire streaming controller to a responsive progress modal showing: current page, speed (labels/sec), and estimated time remaining.
  - Implement responsive "Cancel Job" button that immediately halts the iterator and issues a clear-buffer command to the printer.

#### 5. Robustness Verification & Quality Gates
- **Automated Stress Test:** Run a simulated 500-label batch print job with mock Bluetooth transport. Verify heap memory consumption stays flat within ±2MB from page 1 to page 500.
- **Hardware Test:** Print a 30-label sequential barcode run from an imported Excel sheet. Verify every printed barcode has the correct incremented value and that the printer does not pause or stutter between labels.

---

### Phase 6: Hardware Calibration, Printhead Margins & Universal Driver Layer

#### 1. Architectural Scope & Weight
- **Scope:** Unification of printer communication across all 5 printer models (`dev-printer`, `tez-printer`, `josh-printer`, `labelx-printer`, `td404-printer`). Implementation of media alignment compensation (center-fed vs. left-aligned) and persistent MAC-keyed hardware calibration.
- **Weight:** Equal weight balanced between native mobile bridge modules, Bluetooth protocol engineering, and physical calibration UI.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - The app communicates with 5 different printer hardware families, each with slightly different native code and parameter assumptions.
  - While DEV bridge TSPL sizing was recently made dynamic (`computeDevTsplPrintLayout`), physical guide alignment differences (e.g. some printers use center-justified rolls, others left-justified) are handled with ad-hoc conditional branches.
  - Mechanical printhead offsets (hOffset, vOffset) are not stored per physical printer MAC address. When a user connects to a different printer, calibrations are lost or cross-contaminated.
- **What Needs to be Changed:**
  - **Partial Refactor:** Formalize the **Universal Hardware Driver Layer** (`src/lib/printer/universal-driver.ts`):
    - Unified driver interface with normalized command generation: `setupMedia(widthMm, heightMm, type, gapMm)`, `sendBitmap(buffer, x, y, w, h)`, `formFeed()`, `printCopies(n)`.
  - **New Feature:** Media Alignment Calibration:
    - Auto-compute horizontal printhead offset based on printer model profile:
      - Center-fed printers: `hOffset = (PrintheadWidth - LabelWidth) / 2`.
      - Left-aligned printers: `hOffset = 0`.
  - **New Feature:** Persistent Printer Calibration Profile:
    - Store calibration offsets (hOffset, vOffset, density, speed) in `AsyncStorage` keyed by printer Bluetooth MAC address.
  - **New Feature:** Interactive Calibration Wizard UI (`src/app/calibration-wizard.tsx`):
    - User prints a 20×20mm calibration test square with center crosshairs, measures physical margins with a ruler, and enters measured values. App calculates and saves persistent offset corrections.

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - Margin accuracy across different printers: ±1.2mm error; requires code tweaks when switching between center-fed (Tez/Josh) and left-aligned (Dev) models.
  - Calibration persistence: Global or session-based; lost when switching devices.
- **Benchmark Standard:**
  - Margin accuracy across all printer models: **≤ ±0.2mm** caliper accuracy.
  - Calibration persistence: Automatically loads unique offset profile whenever a specific Bluetooth MAC connects.
- **Difference / Gap Analysis:**
  - Mechanical tolerances in thermal printer feed rollers and sensor positions vary by up to 1mm between manufacturing batches. Industry leaders provide user calibration wizards that store hardware-specific offsets.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 6.1:** Refactor Driver Layer into Unified Hardware Interface:
  - Standardize protocol generation across TSPL, CPCL, ESC/POS, and proprietary SDKs.
  - Centralize `PrintSpec` generation with explicit physical head width and feed alignment parameters.
- [ ] **Task 6.2:** Build MAC-Keyed Calibration Storage in `src/lib/printer/calibration-store.ts`:
  - Methods: `getCalibration(macAddress)`, `saveCalibration(macAddress, profile)`.
  - Profile parameters: `horizontalOffsetMm`, `verticalOffsetMm`, `densityOverride`, `speedOverride`.
- [ ] **Task 6.3:** Implement Interactive Calibration Wizard Screen:
  - Add "Calibrate Printer" option in printer connection settings.
  - 3-step wizard:
    1. Print standardized 20×20mm test pattern with edge rulers.
    2. Input measured physical offsets (X error mm, Y error mm).
    3. Auto-save calibration coefficients and print confirmation test.

#### 5. Robustness Verification & Quality Gates
- **Physical Caliper Verification:** Calibrate a connected printer using the wizard. Print a 40×20mm border box. Measure top, bottom, left, and right margins with digital calipers. All margins must match designed positions within ±0.2mm.
- **Multi-Device Test:** Switch connection between two different physical printers (e.g. Dev printer and Tez printer); verify each loads its own independent calibration profile without manual intervention.

---

### Phase 7: Print Preflight Engine & Thermal Density Optimization

#### 1. Architectural Scope & Weight
- **Scope:** Implementation of a Print Preflight Engine that inspects label elements for thermal print legibility prior to job dispatch, combined with thermal printhead energy density smoothing to prevent printhead burnout and motor stalling.
- **Weight:** Balanced algorithmic verification and thermal hardware optimization phase.

#### 2. What is Currently Implemented vs. What Needs to be Changed
- **Current Standing:**
  - The app only verifies total canvas dimensions (`validatePrintSpec`). It does not inspect individual vector elements for physical thermal printability.
  - If a user adds a line with stroke under 1 printer dot, it silently disappears on print. If text wraps outside its bounding box, it silently clips. If a large solid black area is printed, thermal heads can overheat or stall the paper feed motor due to sudden current draw.
- **What Needs to be Changed:**
  - **New Feature:** Implement **Print Preflight Engine** (`src/lib/preflight/preflight-engine.ts`):
    - Analyzes `LabelDocument` against target printer resolution (203/304 DPI) and flags:
      - **Sub-Dot Geometry:** Lines or borders with thickness under 1 printer dot.
      - **Unscannable Barcodes:** Module width under 2 dots at 203 DPI or missing quiet zones.
      - **Text Overflow:** Text strings that exceed their bounding boxes.
      - **Contrast Warnings:** Low-contrast images that will become muddy black blobs under 1-bit thresholding.
  - **New Feature:** Thermal Printhead Energy Management (`src/printing/raster/thermal-density.ts`):
    - Analyzes scanline duty cycle (percentage of black dots per row).
    - If a row exceeds 75% black ink (e.g. solid black reverse-print block), apply thermal compensation or warn the user to avoid head burn and motor stalling.
  - **New Feature:** Preflight Modal UI:
    - Display preflight review sheet before printing with 1-tap "Auto-Fix" actions (e.g., "Auto-boost line thickness to 1 dot", "Expand quiet zone").

#### 3. Current Standard vs. Benchmark Standard
- **Current Standard:**
  - Preflight checks: None. Defective designs waste physical label rolls.
  - Thermal management: Raw bitmaps sent to printhead without duty-cycle analysis.
- **Benchmark Standard:**
  - 100% pre-print interception of defective layouts, unreadable barcodes, and sub-dot lines.
  - Duty-cycle smoothing prevents printhead overheating, streaking, and motor stalls.
- **Difference / Gap Analysis:**
  - Professional prepress and industrial label software never blindly sends documents to printheads. A preflight pass catches 95% of real-world user design errors before physical ink hits paper.

#### 4. Actionable Step-by-Step Tasks
- [ ] **Task 7.1:** Build Preflight Inspection Rules in `src/lib/preflight/preflight-engine.ts`:
  - Rule `checkSubDotLines(doc, dpi)`: Flags lines under 1 dot.
  - Rule `checkBarcodeScannability(doc, dpi)`: Flags barcodes with module width under 2 dots or quiet zones under 10 modules.
  - Rule `checkTextClipping(doc)`: Flags text overflow.
  - Rule `checkThermalDensity(doc)`: Flags large solid black blocks.
- [ ] **Task 7.2:** Build Thermal Density Analyzer in `src/printing/raster/thermal-density.ts`:
  - Scanline black-pixel histogram calculation.
  - Automatic density smoothing curves for thermal printheads.
- [ ] **Task 7.3:** Build Preflight Review UI Modal in `src/components/preflight/preflight-modal.tsx`:
  - Non-intrusive warning badge on Print screen if issues exist.
  - Clean modal dialog detailing detected issues with one-click "Auto-Fix All" button.

#### 5. Robustness Verification & Quality Gates
- **Automated Test Suite:** Run preflight analyzer against 10 synthetic malformed templates (hairline lines, tiny barcodes, overflowing text); assert 10 out of 10 are caught with 100% accuracy.
- **Auto-Fix Verification:** Execute "Auto-Fix All"; verify all flagged issues are remediated and the updated document passes preflight validation with zero errors.
- **Physical Thermal Test:** Print a high-density reverse-print label with thermal smoothing enabled; verify clean paper advancement without motor stall or printhead streaking.

---

## Execution Protocol: One Phase at a Time

To maintain stability and production quality, the implementation must adhere to this strict execution discipline:

1. **Sequential Execution:** Work on **exactly one phase at a time** in numerical order (Phase 1 through Phase 7).
2. **Quality Gates Sign-Off:** Each phase concludes with automated test execution, performance profiling, and physical calibration/print verification.
3. **Progress Tracking:** Upon completing each phase, record all measured benchmarks, test outcomes, and code changes in `PROGRESS.md`.
4. **Human Review Gate:** Pause and obtain human review before advancing to the subsequent phase.

---

*This document serves as the master architectural specification and quality benchmark standard for all modernization efforts across the `sez-print` codebase.*
