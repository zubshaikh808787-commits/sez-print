# Architecture Comparison & Modernization Plan

> **Comparative Analysis:** How `sez-print` compares to industry-standard label printing applications (WePrint, Niimbot, Zebra Print, Dymo Connect, Brother P-touch), where it aligns, where it deflects, and what needs to be refactored.

---

## Executive Overview

Modern production label printing systems follow a clear separation of concerns:
```
Template (Vector JSON, mm)
   → Dynamic Re-Layout (Constraints + Ratios + Preflight Validation)
   → Unit Conversion (mm → Hardware Dots @ Printer DPI)
   → Discrete Rasterization (Headless Canvas, Integer Barcode Modules)
   → Monochrome Thresholding & Packet Encoding (1-Bit Pack / Command Stream)
   → Hardware Delivery (Bluetooth SPP / BLE / USB / Wi-Fi)
```

In `sez-print`, our recent fix generalized the native TSPL sizing logic so that dimensions, scanline bytes, and canvas coordinates are no longer hardcoded. However, examining our entire pipeline against professional label engines reveals clear strengths, key architectural deflections, and high-impact areas for refactoring.

---

## 1. Where Our App Aligns Similarly to Industry Standards

`sez-print` already possesses several fundamental design principles used by top-tier printing applications:

### 1.1 Vector/Template-First Data Model
- **Implementation:** [`src/lib/label-document.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/label-document.ts), [`src/stores/label-store.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/stores/label-store.ts)
- **Alignment:** Labels are **never** stored as static raster images. They are structured JSON documents (`LabelDocument`) containing physical dimensions (`widthMm`, `heightMm`) and an array of individual vector elements (`LabelElement`: text, barcode, qrcode, image, shape, line, border, table).
- **Physical Coordinates:** All layout positions (`left`, `top`, `width`, `height`, `lineWidth`) are defined in physical millimetres (`mm`), not device-dependent pixels or CSS 96-DPI values.

### 1.2 Centralized DPI & Conversion Architecture
- **Implementation:** [`src/lib/printer/print-spec.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/printer/print-spec.ts), [`src/lib/label-geometry.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/label-geometry.ts)
- **Alignment:** Single source of truth for printer resolution and physical dot density:
  - 203 DPI = 8.0 dots/mm (standard mobile/desktop thermal)
  - 304 DPI = 12.0 dots/mm (high-res thermal)
  - Calculations (`mmToDots`, `dotsToMm`, `quantizeMm`) ensure mathematical parity across UI and print jobs.

### 1.3 Dedicated 1:1 Hardware Dot Print Artboard
- **Implementation:** [`src/app/print.tsx`](file:///Users/aadityabasisth/Desktop/sez-print/src/app/print.tsx#L1040-L1062)
- **Alignment:** The app does **not** stretch a screenshot of the phone screen for printing. It mounts a dedicated offscreen artboard sized to the exact physical dot count of the label (`printCaptureSize = round(widthMm * dpm) × round(heightMm * dpm)`). Vector elements are re-rendered at full hardware printer resolution.

### 1.4 Dynamic Sizing & Native Hardware Control
- **Implementation:** [`DevPrinterModule.kt`](file:///Users/aadityabasisth/Desktop/sez-print/modules/dev-printer/android/src/main/java/expo/modules/devprinter/DevPrinterModule.kt), [`tsc.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/printer/tsc.ts)
- **Alignment:** Hardware protocol generation dynamically emits firmware parameters (`SIZE <w> mm, <h> mm`, `GAP <g> mm`, `SPEED`, `DENSITY`, `DIRECTION 0`, `REFERENCE 0,0`, `BITMAP`). Byte-per-row packing adapts dynamically to label dimensions.

---

## 2. Where Our App Deflects From Industry Standards

While the foundation is solid, our implementation departs from enterprise label engines in five key areas:

```
┌──────────────────────────────┬────────────────────────────────────────┬────────────────────────────────────────┐
│ Dimension                    │ Industry Standard (Zebra, Niimbot)     │ sez-print Current Implementation       │
├──────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────┤
│ 1. Rasterization Pipeline    │ Headless 2D Canvas (In-Memory Skia)    │ Offscreen React Native DOM (ViewShot)  │
│ 2. Barcode Rendering         │ Discrete integer module-width snapping │ Continuous SVG ratio stretching        │
│ 3. Canvas Resizing Rules     │ Responsive anchors + hybrid constraints│ Simple proportional scaling / contain  │
│ 4. Print Preflight Engine    │ Hardware validation pass (min dots)    │ Basic boundary clamping only           │
│ 5. Multi-Page / Data Binding │ Single template + streaming data feed  │ Full DOM re-render per page            │
└──────────────────────────────┴────────────────────────────────────────┴────────────────────────────────────────┘
```

### Deflection 1: ViewShot/DOM Capture vs. Headless Canvas Rendering
- **How Industry Apps Work:** Industry engines use a C++/Skia/Native in-memory canvas (e.g. `Android.graphics.Canvas` or `Skia.Surface`). The vector template is traversed and drawn directly into an in-memory bitmap in 5–15 milliseconds with zero UI thread overhead.
- **How sez-print Works:** `sez-print` renders an offscreen React Native component hierarchy (`<ViewShot>`, `<LabelPreview>`, React Native `<View>`, `<Text>`, and SVG `<Rect>`), waits for layout passes via `waitForNextPaint()`, and captures a PNG screenshot via `react-native-view-shot`.
- **Consequences:** 
  - Adds 200–500ms latency per page.
  - Causes Hermes GC memory pressure on large multi-page jobs.
  - Vulnerable to Android View hierarchy timing bugs, text layout jumps, and letterboxing.

### Deflection 2: Fractional Barcode Scaling vs. Integer Module Snapping
- **How Industry Apps Work:** Barcodes are discrete optical signals. Thermal printheads cannot heat "fractional" dots (a dot is either 100% on or off). Professional engines specify barcode dimensions in terms of **Module Width** ($X$-dimension = 1 dot, 2 dots, 3 dots). When resizing a template, bar widths snap to discrete dot multiples, and quiet zones are strictly preserved.
- **How sez-print Works:** In [`src/components/editor/element-renderer.tsx`](file:///Users/aadityabasisth/Desktop/sez-print/src/components/editor/element-renderer.tsx#L300-L310), barcode bars are rendered as SVG `<Rect x={bar.x * widthPx} width={bar.width * widthPx} />`. When width is scaled arbitrarily, bar widths become floating-point numbers (e.g. 1.34 px). When thresholded to monochrome 1-bit, anti-aliasing causes "dot jitter," where some narrow bars render as 1 dot and others as 2 dots, making barcodes difficult or impossible for optical scanners to read.

### Deflection 3: Pure Ratio Scaling vs. Responsive Anchor Constraints
- **How Industry Apps Work:** Templates support anchors and rules:
  - *"Pin this barcode 2mm from the bottom-left"*
  - *"Center this title horizontally, but wrap if width < 30mm"*
  - *"Keep border locked to edge with fixed 0.5mm stroke"*
- **How sez-print Works:** [`scaleDocumentToSize`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/element-sizing.ts#L345) multiplies all $x, y, w, h$ by $s_x, s_y$, and scales fonts by $\min(s_x, s_y)$. If a user changes an aspect ratio (e.g. from 50×50 mm square to 50×20 mm wide strip), text boxes are squashed vertically, causing text to re-wrap or clip, while shapes become distorted.

### Deflection 4: Missing Print Preflight Engine
- **How Industry Apps Work:** Before sending to print, a preflight analyzer checks:
  - Will any line be $< 1$ printer dot (making it invisible)?
  - Is barcode module width below scannable threshold at 203 DPI?
  - Does text overflow its box in the target DPI?
- **How sez-print Works:** Validates only total canvas size (`validatePrintSpec`), but does not inspect individual elements for thermal print legibility.

---

## 3. What Things Need a Partial Refactor

These components have solid architecture, but need targeted improvements to reach production-grade reliability:

### 3.1 Barcode & QR Code Rendering Engine
* **Files:** [`src/components/editor/element-renderer.tsx`](file:///Users/aadityabasisth/Desktop/sez-print/src/components/editor/element-renderer.tsx), [`src/lib/barcode/`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/barcode/)
* **What to Refactor:**
  - Introduce **Integer Module Width Snapping** for 1D barcodes at target DPI (e.g. at 203 DPI, narrow bar = 1 dot [0.125mm] or 2 dots [0.25mm]).
  - Enforce standard quiet zones (minimum 10 modules on left and right).
  - Prevent fractional SVG scaling from introducing anti-aliasing artifacts on 1-bit thresholding.

### 3.2 Template Resize Logic (Element Sizing)
* **Files:** [`src/lib/element-sizing.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/element-sizing.ts), [`src/lib/print-sizes.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/print-sizes.ts)
* **What to Refactor:**
  - Enhance [`scaleDocumentToSize`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/element-sizing.ts#L345) to handle aspect-ratio shifts intelligently:
    - **Borders:** Pin to perimeter $(0, 0, W, H)$ with user-defined stroke thickness.
    - **Barcodes:** Adjust height to available space, but recompute width based on valid module steps rather than dumb stretching.
    - **Text:** Re-evaluate text wrapping bounds (`computeWrappedLines`) after resize to prevent text overflow.

### 3.3 Printhead Margin Calibration & Guide Alignment
* **Files:** [`src/lib/printer/print-spec.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/printer/print-spec.ts), [`src/lib/printer/printer-manager.ts`](file:///Users/aadityabasisth/Desktop/sez-print/src/lib/printer/printer-manager.ts)
* **What to Refactor:**
  - Formalize physical guide positioning (center-aligned vs. left-aligned media rolls) across all printer models in `PrinterProfile`.
  - Provide a clear calibration UI for mechanical offset adjustments ($hOffset, vOffset$) stored per physical printer MAC address.

---

## 4. What Things Need an Entire Refactor

These areas have architectural bottlenecks that limit performance, scalability, and code maintainability:

### 4.1 Entire Refactor: Replace ViewShot with Headless Skia Rasterization
* **Current State:** 
  `ViewShot` in [`src/app/print.tsx`](file:///Users/aadityabasisth/Desktop/sez-print/src/app/print.tsx) forces the app to mount React Native views on the UI thread, wait for frames (`waitForNextPaint`), capture to a PNG file on disk, read back Base64, and transmit it.
* **Why It Needs Entire Refactor:**
  - Extremely slow on multi-page jobs (e.g. 50 Excel rows take 30–60 seconds of UI freezing).
  - Subject to Android OS display scale and font DPI overrides.
  - Generates hundreds of MBs of temporary PNG allocations in Hermes heap.
* **Target Architecture:**
  Build a pure **Headless Skia Direct Rasterizer**:
  ```ts
  function rasterizeDocumentToBitmap(
    doc: LabelDocument,
    dpi: number,
    options: RasterizeOptions
  ): Uint8Array // Direct 1-bit packed monochrome buffer
  ```
  - Directly draws text, shapes, lines, and barcodes onto an in-memory Skia canvas (`@shopify/react-native-skia` is already installed!).
  - Generates the 1-bit monochrome byte stream in **< 10 ms per label**, completely off the UI thread.
  - Eliminates `ViewShot`, `react-native-view-shot`, and PNG encoding/decoding entirely.

### 4.2 Entire Refactor: Introduce a Constraint-Based Layout Engine
* **Current State:**
  Elements only have absolute coordinates (`left`, `top`, `width`, `height`). Changing label size or aspect ratio either scales everything dumbly or clips.
* **Why It Needs Entire Refactor:**
  - Modern label software allows users to design a template once (e.g. 50×50 mm) and print it on 40×30, 60×40, or 70×50 mm without breaking layout.
* **Target Architecture:**
  Add optional constraints to `LabelElement`:
  ```ts
  type ElementConstraints = {
    horizontalAnchor?: 'left' | 'center' | 'right' | 'stretch';
    verticalAnchor?: 'top' | 'center' | 'bottom' | 'stretch';
    marginMm?: { top?: number; right?: number; bottom?: number; left?: number };
    lockAspectRatio?: boolean;
    autoWrapText?: boolean;
  };
  ```
  - When label size changes, the layout engine resolves anchors like CSS Flexbox/Figma constraints, preserving design symmetry automatically.

---

## 5. Strategic Roadmap

```
Phase 1 (Completed):
  ✓ Fix DEV bridge TSPL sizing math (eliminate hardcoded 384-dot / 48-byte assumptions)
  ✓ Establish computeDevTsplPrintLayout as shared single source of truth
  ✓ Pass dynamic layout parameters from TypeScript to Native

Phase 2 (Partial Refactors - Recommended Next):
  • Add Integer Module Snapping for barcodes at 203/304 DPI to eliminate scanner read failures
  • Implement text auto-refit / wrap validation during template dimension changes
  • Store calibration offsets (hOffset, vOffset) per connected printer device

Phase 3 (Entire Refactor - Future Architecture):
  • Implement Headless Skia Rasterizer to replace ViewShot capture (10x faster print dispatch)
  • Add Constraint/Anchor engine to LabelDocument for auto-responsive label resizing
```
