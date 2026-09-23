# Printer Bridge Files

> **Date:** 2026-09-23  
> **What this is:** The five Expo native modules that sit between JS (`src/lib/printer/printer-manager.ts`) and the vendor SDKs. Each section is **SDK name | printer name**, then the actual JS/TS bridge code, then the native Expo `Function` / `AsyncFunction` surface, then the print-input contract.  
> **Platform:** All five modules are Android-only (`expo-module.config.json` → `"platforms": ["android"]`). There is no `ios/` directory in any of them.  
> **App dispatcher:** `PrinterManager.printPngLabelFast` in `src/lib/printer/printer-manager.ts` routes by `activeTransport` / `isLabelX` / `isDev` / `isTez` / `isJosh`, then TD-404.

---

## Index

| SDK / File Name | Printer Name (`SEZNIK_PRINTER_MODELS`) | Expo module name | JS bridge | Native module |
| :--- | :--- | :--- | :--- | :--- |
| Caysn AutoReplyPrint (`autoreplyprint.jar` + `libautoreplyprint.so`) | SEZNIK DEV (Veer uses the same driver) | `DevPrinter` | `modules/dev-printer/src/index.ts` | `DevPrinterModule.kt` |
| LuckPrinter SDK v1.3.8 Abroad | SEZNIK LABEL X (MiniX / GD985) | `LabelXPrinter` | `modules/labelx-printer/src/index.ts` | `LabelXPrinterModule.kt` |
| PrintSDK-68 (obfuscated) | SEZNIK TEZ / SHAKTI | `TezPrinter` | `modules/tez-printer/src/index.ts` | `TezPrinterModule.kt` → `TezPrinterManager` / `PrintPipeline` |
| Ninestar `labelprinter.jar` (linked, **unused at print time**) | SEZNIK TEJAS / RUDRA (TD-404) | `Td404Printer` | `modules/td404-printer/src/index.ts` | `Td404PrinterModule.kt` |
| DothanTech LPAPI | SEZNIK JOSH | `JoshPrinter` | `modules/josh-printer/src/index.ts` | `JoshPrinterModule.kt` → `JoshPrinterManager.kt` |

Marketing names and `supportedNames` live in `src/constants/printer-models.ts`.

---

## Shared caller contract (`printer-manager.ts`)

Every fast-print path is PNG-in, not a vector job. The manager always sends `pngBase64` plus millimetre page size. What each native module does with those millimetres is different (see each section).

Dispatch:

```2835:2848:src/lib/printer/printer-manager.ts
    if (this.activeTransport === 'labelx-spp' || this.isLabelX) {
      return this.printLabelXPngLabelFast(options);
    }
    if (this.activeTransport === 'dev-spp' || this.isDev) {
      return this.printDevPngLabelFast(options);
    }
    if (this.activeTransport === 'tez-spp' || this.isTez) {
      return this.printTezPngLabelFast(options);
    }
    if (this.activeTransport === 'josh-lpapi' || this.isJosh) {
      return this.printJoshPngLabelFast(options);
    }
```

Common JS options the manager accepts (not every driver uses every field):

- `pngBase64` (required)
- `widthMm`, `heightMm`
- `gapMm`
- `copies`, `density`, `speed`
- `hOffsetMm`, `vOffsetMm`
- `media`: `'gap' | 'bline' | 'continuous'`
- `dpi`, `threshold`, `dither`, `orientation`

---

## 1. Caysn AutoReplyPrint | SEZNIK DEV

**Default DPI:** 203. **Transport:** Bluetooth SPP (`dev-spp`). **Native name:** `DevPrinter`.

### JS/TS bridge — `modules/dev-printer/src/types.ts`

```ts
export const DEV_PAPER_TYPE = {
  GAP: 0,
  CONTINUOUS: 1,
  BLACK_MARK: 2,
} as const;

export type DevPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  rotation?: number;
  threshold?: number;
  dither?: boolean;
  gapMm?: number;
  media?: 'gap' | 'bline' | 'continuous' | string;
  speed?: number;
  commandSet?: 'tspl' | 'escpos' | 'auto';
  hOffsetMm?: number;
  vOffsetMm?: number;
  printheadWidthMm?: number;
};
```

### JS/TS bridge — print wrapper (`modules/dev-printer/src/index.ts`)

```ts
export async function printDevPngLabel(options: DevPrintOptions): Promise<DevPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    gapMm: options.gapMm ?? 2,
    copies: options.copies ?? 1,
    density: options.density ?? 14,
    speed: options.speed ?? 3,
    media: options.media ?? 'gap',
    commandSet: options.commandSet ?? 'tspl',
    rotation: options.rotation ?? 0,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    printheadWidthMm: options.printheadWidthMm ?? 48,
  });
}
```

Exported surface: `isAvailable`, `isBluetoothEnabled`, `isConnected`, `getBondedDevices`, `startScan` / `stopScan`, `connect(mac, name?)`, `disconnect`, `getStatus`, `calibrate(paperType?)`, `printPngLabel`, `printReceiptText`, `testPrint`. Events: `onDeviceFound`, `onScanFinished`, `onScanFailed`.

### Native Expo surface (`DevPrinterModule.kt`)

```
Name("DevPrinter")
Events: onDeviceFound, onScanFinished, onConnectionChanged
Function isAvailable
Function isBluetoothEnabled
AsyncFunction getBondedDevices
AsyncFunction startScan / stopScan
AsyncFunction connect(macAddress, name?)
AsyncFunction disconnect
Function isConnected
Function getConnectedDevice
AsyncFunction getStatus
AsyncFunction calibrate(paperTypeParam?)
AsyncFunction feedLabel
AsyncFunction printPngLabel(options)
AsyncFunction printReceiptText(text, options?)
AsyncFunction testPrint(optionsParam?)
```

Native print option extraction:

```kotlin
val pngBase64 = options["pngBase64"] as? String ?: throw ...
val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
val density = ((options["density"] as? Number)?.toInt() ?: 14).coerceIn(1, 15)
val speed = ((options["speed"] as? Number)?.toInt() ?: 3).coerceIn(1, 10)
val media = (options["media"] as? String) ?: "gap"
val commandSet = (options["commandSet"] as? String) ?: "escpos"   // native default ≠ JS default
val hOffsetMm / vOffsetMm default 0
val dither default false
val threshold default 160
val printheadWidthMm default 48.0
val useEscPos = commandSet != "tspl"
```

SDK used at runtime: `CP_Port_OpenBtSpp` / `CP_Port_Write` / status / `CP_Label_CalibrateLabel`. We generate TSPL or ESC/POS ourselves. `AutoReplyPrint` is transport, not a millimetre job API.

### Input format and required details

- **Contract:** PNG base64 → decoded `Bitmap` → **1-bit raster**. Page size is millimetres on the TSPL path only.
- **TSPL (what the app sends):** `SIZE` in fractional mm, `GAP` rounded to whole mm, `BITMAP` in dots at **8 dots/mm**. Copies are encoded in the TSPL job (`loopCopies = 1` when TSPL).
- **ESC/POS (native default if JS forgets `commandSet`):** `GS v 0` raster. Native default for `commandSet` is `"escpos"`; JS wrapper and `printer-manager.ts` force `"tspl"`. ESC/POS ignores `heightMm` and derives height from bitmap aspect.
- **Geometry cap:** `maxSymmetricDots = min(headDots, 378)`. A 50 mm design is 400 dots; `fit = 378/400 = 0.945` scales **both bitmap axes**. TSPL `SIZE` is still the requested mm. Product decision (`SDKS.md` Q5); caliper still needed.
- **Offsets:** `hOffsetMm` / `vOffsetMm` baked into the bitmap.
- **Head width:** `printheadWidthMm` from `print-spec.ts` profile (manager passes `profile.printheadWidthMm`), native fallback 48 mm.
- **Dither:** default **false** (hard threshold). Opt in for photos only.
- **Calibrate:** `paperType` 0=gap, 1=continuous, 2=black mark.
- **Our-bridge — `getStatus` lies when the query fails.** `CP_Printer_GetPrinterStatusInfo` is used when it returns true; if it returns false (or the handle is empty), the module still `promise.resolve("ready" to true, …)`. Same lying-on-failure class as the `isAvailable` catch that was fixed on this driver.
- **iOS:** not implemented.

---

## 2. LuckPrinter SDK v1.3.8 | SEZNIK LABEL X

**Default DPI:** 203. **Transport:** `labelx-spp` (classic BT via `PrinterHelper.connectLuck`). **Native name:** `LabelXPrinter`.

### JS/TS bridge — `modules/labelx-printer/src/types.ts`

```ts
export interface LabelXPrintOptions {
  pngBase64: string;
  copies?: number;
  widthMm?: number;
  widthDots?: number;
  paperType?: 'tag' | 'continuous' | 'receipt' | 'blacktag' | 'blackmark';
  density?: number; // 0, 1, 2
  threshold?: number;
  dither?: boolean;
}
```

There is **no `heightMm`**, **no `gapMm`**, **no `hOffsetMm` / `vOffsetMm`** on this type.

### JS/TS bridge — print wrapper (`modules/labelx-printer/src/index.ts`)

```ts
export async function printLabelXPngLabel(options: LabelXPrintOptions): Promise<LabelXPrintResult> {
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    copies: options.copies ?? 1,
    widthMm: options.widthMm ?? 48,
    widthDots: options.widthDots ?? 384,
    paperType: options.paperType ?? 'tag',
    density: options.density ?? 1,
    threshold: options.threshold ?? 145,
    dither: options.dither ?? true,
  });
}
```

Manager hard-codes `widthDots: 384` and maps `media` → `paperType` (`bline`→`blacktag`, `continuous`→`continuous`, else `tag`). It does **not** pass height or offsets.

### Native Expo surface (`LabelXPrinterModule.kt`)

```
Name("LabelXPrinter")
Events: onDeviceFound, onScanFinished, onConnectionChanged, onStatusChanged
Function isAvailable          // init SDK, then return true
Function isBluetoothEnabled
Function isConnected          // PrinterHelper.isConnectedLuck
Function initSdk(asKey?)
AsyncFunction getBondedDevices / startScan / stopScan
AsyncFunction connect(macAddress, deviceName?, btType?)
AsyncFunction disconnect
AsyncFunction getStatus
AsyncFunction printPngLabel(options)
AsyncFunction printTestLabel(text?)
```

SDK init:

```kotlin
private val DEFAULT_AS_KEY = "7fec7c4703824444a8bcf8b24b148dec"
PrinterHelper.getInstance().init(context.applicationContext, key, false)
```

Native print:

```kotlin
val copies, paperType default "tag", density default 1, threshold default 145, dither default true
val targetWidthDots = widthDots ?: (widthMm * 8)?.toInt() ?: 384
val targetHeightDots = srcH / srcW * targetWidthDots   // HEIGHT FROM ASPECT, not heightMm
when (paperType) {
  "continuous", "receipt" -> helper.print(bmp, copies, cb)
  "blacktag", "blackmark" -> helper.printBlackTag(bmp, copies, cb)
  else -> helper.printTag(bmp, copies, cb)
}
```

### Input format and required details

- **Contract:** **Bitmap only.** SDK APIs are `print` / `printTag` / `printBlackTag(Bitmap, copies, callback)`.
- **Width:** millimetres × 8, truncated to int (or caller `widthDots`). Manager always sends 384 dots.
- **Height:** not an input. Derived from PNG aspect after width scale. A 50×30 mm design only prints 30 mm tall if the PNG is 50:30.
- **No native offsets.** `hOffsetMm` / `vOffsetMm` from the manager are dropped.
- **Rasterization:** dither defaults **true** (opposite of Dev / TD-404). Floyd–Steinberg cutoff is hardcoded `oldVal < 128f` and takes no `threshold`. JS still sends `threshold: 145`, but that only reaches `applyThresholdBinarization` when `dither` is explicitly `false`. Default path is **not** “dither on and threshold 145.”
- **Density:** 0 / 1 / 2. `setDensityLuck(density, null)` *is* called (empty `catch`). The image raster path ignores density. Whether the head honours `setDensityLuck` needs a print test.
- **Our-bridge — `isAvailable` can never return `false`.** `ensureSdkInitialized` catches `Throwable` and only logs (`isInitialized` stays false). `Function("isAvailable")` then does `try { ensureSdkInitialized(); true } catch { false }` — the outer catch is unreachable. JS `"LuckPrinter SDK initialization failed"` is dead.
- **Our-bridge — print can hang forever.** `printPngLabel` settles only in `OnPrintCallback.onPrintSuccess` / `onPrintFail`. No timeout.
- **Our-bridge — no `OnDestroy`.** Discovery `BroadcastReceiver` is unregistered only in `stopScan`. Module teardown never disconnects the printer.
- **Licence:** demo `asKey` above. SDK posts device identity to `https://api.gj.luckjingle.com/api/sdk/check2`. Product/legal: own key vs disclosure vs offline.
- **Shares `libPrinterNative.so` with Tez** (different hashes; `pickFirst` ships Tez’s copy). Separately, Luck’s AAR still contains `com.print.libnative.Code941` / `Compress` that the current Tez JAR calls but does not ship. See `SDKS.md` / `PRINTER_ISSUE_REGISTER.md` #16.
- **iOS:** LuckBleSDK.xcframework exists in vendor material; our module has no iOS impl.

---

## 3. PrintSDK-68 | SEZNIK TEZ / SHAKTI

**Default DPI:** 203. **Transport:** `tez-spp`. **Native name:** `TezPrinter`. JS revision gate: `TEZ_NATIVE_REVISION = 'tez-connect-v3'`.

### JS/TS bridge — `modules/tez-printer/src/types.ts`

```ts
export const TEZ_PAPER_TYPE = { GAP: 0, CONTINUOUS: 1, BLACK: 2, TATTOO: 3 } as const;

export type TezPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  speed?: number;
  paperType?: 'gap' | 'continuous' | 'black' | 'tattoo' | number;
  gapMm?: number;
  threshold?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
};
```

### JS/TS bridge — print wrapper (`modules/tez-printer/src/index.ts`)

```ts
export async function printTezImage(options: TezPrintOptions): Promise<TezPrintResult> {
  const paperTypeInt = parsePaperType(options.paperType);
  return mod.printImage({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    copies: options.copies ?? 1,
    density: options.density ?? 8,
    speed: options.speed ?? 4.0,
    paperType: paperTypeInt,
    gapMm: options.gapMm ?? 0,
    threshold: options.threshold ?? 128,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
  });
}
export const printTezPngLabel = printTezImage;
```

Manager maps `media` → `paperType` int (`continuous`=1, `bline`=2, else 0) and uses threshold **168** (not the JS default 128).

Connect refuses if `getNativeRevision() !== 'tez-connect-v3'`.

### Native Expo surface (`TezPrinterModule.kt`)

```
Name("TezPrinter")
Events: onDeviceFound, onScanFinished, onScanFailed
Function isAvailable          // always true
Function getNativeRevision
Function isBluetoothEnabled / isConnected
Function getBondedDevices / startScan / stopScan
AsyncFunction connect(macAddress, deviceName?)
AsyncFunction disconnect
AsyncFunction calibrate(paperType: Int)
AsyncFunction getStatus / getBatteryLevel
AsyncFunction printImage(options)     // NOT printPngLabel
AsyncFunction printTestText(text)
```

Native print option extraction (whole millimetres):

```kotlin
val widthMm  = round(options["widthMm"]).toInt() ?: 50
val heightMm = round(options["heightMm"]).toInt() ?: 30
val copies, paperType default 0, density default 8
val speed default 4.0f
val threshold default 128
val gapMm default 0f
val hOffsetMm / vOffsetMm default 0f
```

`PrintPipeline`:

```kotlin
build.CreatePage(options.widthMm, options.heightMm)  // Int mm
build.paperType / density / speed
build.printImg(imageName, 1)
// gap/black: backoffPaper / fixedPoint / forwardPaper
// continuous: printLinedots(gapMm * 8) or 16 dots
OEM_DPM = 8
// 15s timer completes success=true if OEM callback never fires
```

### Input format and required details

- **Contract:** PNG → bitmap scaled to `widthMm × heightMm × 8` dots → OEM `printImg`. Page is **whole millimetres** (`CreatePage(int, int)`). Fractional mm is **rounded**, not truncated.
- **Not TSPL.** Proprietary `PrintImgHelper` chain.
- **Offsets:** applied in `scaleToLabelDots` when fitting the bitmap to the page.
- **Gap:** on gap/black, gap millimetres are **not** sent as a GAP command; the pipeline uses `paperType` + paper learn / `fixedPoint`. `gapMm` only feeds `printLinedots` on continuous.
- **Completion:** OEM `readCall`, else a **15 s timer reports success**. A hung printer can look like a good print.
- **Connect:** skip `connect(DeviceItem)` (allowlist). SPP `OoO08o.connect(boolean)` can still open RFCOMM. Reflective `commandApi` uses the **abstract** field type and fails; assign `new 〇Ooo.〇o0〇o0(modelKey)` in our code. Vendor allowlist is a separate legal issue. See `SDKS.md` / `PRINTER_ISSUE_REGISTER.md` #1.
- **`isAvailable` always returns `true`** (module presence). `getStatus` still sends `Command.get_status()`.
- **Our-bridge — no `OnDestroy`.** Teardown never stops the scanner or releases the printer. SDK `Printer.release()` nulls `commandApi`; we never call it. Contrast Josh `manager?.destroy()`, Dev `closeHandle()`, TD-404 `closeSocket()`.
- **iOS:** no binary in this module.

---

## 4. Ninestar `labelprinter` | SEZNIK TEJAS / RUDRA (TD-404)

**Default DPI:** 304. **Transport:** `td404-spp` (our own RFCOMM, not the SDK port class). **Native name:** `Td404Printer`.

### JS/TS bridge — `modules/td404-printer/src/index.ts`

```ts
export type Td404PngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  density?: number | null;
  speed?: number | null;
  xDots?: number;
  yDots?: number;
  copies?: number;
  media?: 'gap' | 'bline' | 'continuous';
  orientation?: number;
  dpi?: number;
  direction?: 0 | 1;
  threshold?: number;
  dither?: boolean;
};

export async function printTd404PngLabel(options: Td404PngLabelOptions) {
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    gapMm: options.gapMm ?? 2,
    density: options.density ?? 10,
    speed: options.speed ?? 3,
    xDots: options.xDots ?? 0,
    yDots: options.yDots ?? 0,
    copies: options.copies ?? 1,
    media: options.media ?? 'gap',
    orientation: options.orientation ?? 0,
    dpi: options.dpi ?? 304,
    direction: options.direction ?? 1,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
  });
}
```

Also: `printBase64(string)` and `printRaw(Uint8Array)` (pre-built TSPL bytes), plus `renderPdfPages(uri, { dpi, maxPages })`.

Manager builds a `PrintSpec` first, then passes `spec.widthMm/heightMm/gapMm`, `spec.xOffsetDots/yOffsetDots`, `spec.dpi`, `direction: 1`.

### Native Expo surface (`Td404PrinterModule.kt`)

```
Name("Td404Printer")
Events: onDeviceFound, onScanFinished, onConnectionChanged
Function isAvailable              // Bluetooth adapter != null
Function isBluetoothEnabled
AsyncFunction getBondedDevices / startScan / stopScan
AsyncFunction connect(macAddress, name?)
AsyncFunction disconnect
Function isConnected / getConnectedDevice / isSocketAlive / getConnectionInfo
AsyncFunction printBase64(base64)
AsyncFunction printRaw(bytes)
AsyncFunction printPngLabel(options)
AsyncFunction renderPdfPages(uriString, options?)
```

`printPngLabelNative` (LabelCommand is imported but **not called**):

```kotlin
widthMm/heightMm default 50/30
gapMm default 2, density 10, speed 3, threshold 160
xDots/yDots default 0
copies, media "gap", orientation 0
dpi default 304.0
direction default 1
dpm = if (dpi == 304.0) 12.0 else if (dpi == 203.0) 8.0 else dpi / 25.4
SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm   // fractional to 0.01
GAP / BLINE / continuous
BITMAP x,y,bytesPerRow,h,0  then PRINT 1
```

Doc comment in the Kotlin file claims "Mirrors Ninestar demo: LabelCommand.addSize/addGap/addBitmap". That is **false** at runtime. Bytes are hand-built TSPL over our socket.

### Input format and required details

- **Contract:** millimetre page (`SIZE` fractional mm to 0.01) **plus** 1-bit TSPL `BITMAP` in device dots.
- **Dots/mm:** hardcoded `12.0` at 304 DPI, `8.0` at 203. Nominal 304 DPI is 11.97 dots/mm; a 300 DPI head is 11.81. **Needs a caliper test** — do not pick 12 vs 11.97 in code.
- **Offsets:** `xDots` / `yDots` from `PrintSpec`. Negative offsets are baked into the bitmap (TSPL BITMAP x,y must be ≥ 0).
- **Bitmap width:** packed to a multiple of 8 dots, never packed *up* past `SIZE` in dots.
- **Transport:** SPP only. SDK also has BLE / Ethernet:9100 / USB; unused here. Node backend uses raw TCP.
- **SDK JAR is linked and unused.** Do not swap in the AAR: its manifest requires `usb.host`.
- **Extra API:** `printRaw` / `printBase64` for JS-generated TSPL (`src/lib/printer/tsc.ts`) as fallback.
- **iOS:** vendor PDF only, no binary.

---

## 5. DothanTech LPAPI | SEZNIK JOSH

**Default DPI:** 203. **Transport:** `josh-lpapi` (LPAPI, not raw SPP from JS). **Native name:** `JoshPrinter`.

### JS/TS bridge — `modules/josh-printer/src/index.ts`

```ts
export type JoshPngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  dpi?: number;
  copies?: number;
  density?: number;
  speed?: number;
  direction?: number;
  orientation?: number;
  gapType?: number;
  /** Millimetres (fractional allowed); native converts to LPAPI's 0.01 mm unit. */
  gapLength?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: 'left' | 'center';
};

export async function printJoshPngLabel(options: JoshPngLabelOptions) {
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi: options.dpi ?? 203,
    copies: options.copies ?? 1,
    density: options.density ?? -1,
    speed: options.speed ?? -1,
    direction: options.direction ?? options.orientation ?? 0,
    gapType: options.gapType ?? 2,
    gapLength: options.gapLength ?? 3,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    alignment: options.alignment ?? 'center',
  });
}
```

`-1` density/speed means “printer default”. Manager maps `media` → `gapType` via `joshGapTypeFromMedia` and passes `gapLength` as millimetres (`options.gapMm ?? 3`).

### Native Expo surface (`JoshPrinterModule.kt`)

```
Name("JoshPrinter")
Events: onJoshPrinterDiscovered, onJoshScanFinished, onJoshConnectionStateChanged,
        onJoshPrintProgress, onJoshError
Function isAvailable
Function isBluetoothEnabled
Function isDeviceNameSupported(name?)
AsyncFunction startDiscovery / stopDiscovery
AsyncFunction connect(macAddress, name?)
AsyncFunction disconnect / reconnect
Function getState / isConnected
AsyncFunction configureParams({ density, speed, gapType, gapLength })
AsyncFunction printTestText(text?)
AsyncFunction printPngLabel(options)
```

Native print:

```kotlin
widthMm default 40.0, heightMm default 30.0   // note: 40, not 50
dpi default 203
density/speed default -1
gapType default 2  // GAP_TYPE_LABEL
gapLengthMm default LABEL_GAP_MM (3.0)
hOffsetMm / vOffsetMm default 0
alignment default "center"
mgr.printBitmap(...)
```

Unit conversion in `JoshPrinterManager.kt`:

```kotlin
const val LABEL_GAP_MM = 3.0
fun gapMmTo01mm(gapMm: Double): Int = Math.round(gapMm * 100.0).toInt()
const val HARDWARE_DPI = 203.0
const val HARDWARE_DPM = 8.0
const val GAP_TYPE_RECEIPT = 0
const val GAP_TYPE_LABEL = 2
const val GAP_TYPE_BLACK_MARK = 3
// PrintParamName.GAP_LENGTH is GAP_LENGTH_01MM (0.01 mm units)
putInt(PrintParamName.GAP_LENGTH, gapMmTo01mm(gapLengthMm))
setPrintPageGapLength(same)
```

LPAPI job is millimetre-native: `startJob` / `drawBitmap` in mm, then `commitJob`. Bitmap pixels are sized at 203 DPI (`HARDWARE_DPI`) unless `dpi == 300.0`.

### Input format and required details

- **Contract:** millimetre page + millimetre gap + PNG bitmap drawn in the LPAPI job. This is the only driver whose SDK is a real **mm job API** (text/barcode draw APIs exist; we currently only `drawBitmap`).
- **Gap:** JS millimetres × 100 → `GAP_LENGTH_01MM`. A 3 mm gap becomes `300`. (Older code passed `3` straight into the 0.01 mm field = 0.03 mm. Native converter is now `gapMmTo01mm`.)
- **Offsets:** millimetres, converted the same 0.01 mm way on the LPAPI offset params.
- **Alignment:** `'left' | 'center'` from `print-spec.ts` profile (manager: `profile.alignment`). **Our-bridge:** `containFitToPage` and `submitMmJob` both treat `"left"` as left *and* top (`top = 0` / `vAlign = 0`).
- **DPI:** `HARDWARE_DPI = 203` unless the option is exactly `300.0`. A 300 DPI unit printed through the 203 path would be ~67.7% scale. `PrinterInfo.deviceDPI` exists and is unused.
- **Our-bridge — `DataEnded` 200 ms false-success.** Real `PrintProgress.Success` exists, but `DataEnded` posts a 200 ms runnable that sets `lastPrintSuccess = true` with no hardware ACK (same class as Tez’s 15 s timer).
- **Our-bridge — bitmap leak on failure.** `bitmap.recycle()` runs only on the success return. `!submitted`, timeout, and `!lastPrintSuccess` all `return null` without recycling the page bitmap.
- **Discovery:** LPAPI, not Android `startDiscovery`. `isDeviceNameSupported` calls obfuscated `com.dothantech.b.b.g(String)`.
- **iOS:** DothanTech iOS SDK exists in vendor trees; our module is Android-only.

---

## Side-by-side print input (what you must send)

| Field | DEV | Label X | TEZ / SHAKTI | TEJAS / RUDRA (TD-404) | JOSH |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Native print method | `printPngLabel` | `printPngLabel` | `printImage` | `printPngLabel` (or `printRaw`) | `printPngLabel` |
| Payload | PNG base64 | PNG base64 | PNG base64 | PNG base64 or raw TSPL bytes | PNG base64 |
| Page size | mm (TSPL SIZE); ESC/POS ignores height | width mm or widthDots; **height from PNG aspect** | **int mm** (`CreatePage`) | fractional mm TSPL `SIZE` | mm LPAPI `startJob` |
| Dots/mm | 8 (hardcoded) | 8 (`widthMm × 8`) | 8 (`OEM_DPM`) | 12 @304 / 8 @203 | 8 (`HARDWARE_DPM`) |
| Gap | mm, TSPL GAP **whole mm** | none | paperType + LEARN; `gapMm` only on continuous feed | mm TSPL GAP/BLINE | mm × 100 → `GAP_LENGTH_01MM` |
| Offsets | baked mm | **dropped** | baked mm in bitmap fit | `xDots`/`yDots` (negatives baked) | mm × 100 LPAPI offsets |
| Default density | 14 (1–15) | 1 (0–2) | 8 | 10 | −1 (printer default) |
| Default dither | false | **true** | n/a (threshold) | false | n/a |
| SDK job vs our bytes | we generate TSPL/ESC-POS; SDK writes | SDK `printTag`/`print`/`printBlackTag` | SDK `PrintImgHelper` | we generate TSPL; SDK unused | SDK LPAPI job |
| Success signal | write completed (no printer ACK) | SDK print callback only — **no timeout, can hang forever** | OEM callback **or 15s timer = success** | SPP write completed (no ACK) | LPAPI ACK, **or 200ms DataEnded timer = success** |

---

## File map (every bridge file)

```
modules/dev-printer/
  src/index.ts
  src/types.ts
  expo-module.config.json
  android/src/main/java/expo/modules/devprinter/DevPrinterModule.kt

modules/labelx-printer/
  src/index.ts
  src/types.ts
  expo-module.config.json
  android/src/main/java/expo/modules/labelxprinter/LabelXPrinterModule.kt

modules/tez-printer/
  src/index.ts
  src/types.ts
  expo-module.config.json
  android/src/main/java/expo/modules/tezprinter/TezPrinterModule.kt
  android/src/main/java/expo/modules/tezprinter/TezPrinterManager.kt
  android/src/main/java/expo/modules/tezprinter/PrintPipeline.kt
  android/src/main/java/expo/modules/tezprinter/ConnectionGuard.kt
  android/src/main/java/expo/modules/tezprinter/CalibrationController.kt
  android/src/main/java/expo/modules/tezprinter/SerialTaskQueue.kt
  android/src/main/java/expo/modules/tezprinter/RetryPolicy.kt

modules/td404-printer/
  src/index.ts
  expo-module.config.json
  android/src/main/java/expo/modules/td404printer/Td404PrinterModule.kt

modules/josh-printer/
  src/index.ts
  expo-module.config.json
  android/src/main/java/expo/modules/joshprinter/JoshPrinterModule.kt
  android/src/main/java/expo/modules/joshprinter/JoshPrinterManager.kt

App dispatcher (not a native module):
  src/lib/printer/printer-manager.ts
  src/constants/printer-models.ts
```

---

## Complete source

Every file below is the full current contents of the repo, not a snippet.

### 1. DEV — Caysn AutoReplyPrint | SEZNIK DEV

#### `modules/dev-printer/expo-module.config.json` (7 lines)

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.devprinter.DevPrinterModule"]
  }
}
 
```

#### `modules/dev-printer/src/types.ts` (80 lines)

```ts
export const DEV_PAPER_TYPE = {
  GAP: 0,
  CONTINUOUS: 1,
  BLACK_MARK: 2,
} as const;

export const DEV_PRINT_MODE = {
  LABEL: 0,
  RECEIPT: 1,
} as const;

export function parseDevPaperType(
  type: 'gap' | 'bline' | 'black_mark' | 'continuous' | number | undefined,
): number {
  if (typeof type === 'number') return type;
  if (!type) return DEV_PAPER_TYPE.GAP;
  const lower = type.toLowerCase();
  if (lower === 'continuous') return DEV_PAPER_TYPE.CONTINUOUS;
  if (lower === 'bline' || lower === 'black_mark') return DEV_PAPER_TYPE.BLACK_MARK;
  return DEV_PAPER_TYPE.GAP;
}

export type DevDiscoveredDevice = {
  id: string;
  name: string | null;
  rawName?: string | null;
  bonded?: boolean;
  transport?: string;
  sdkId?: string;
  likelyDev?: boolean;
};

export type DevPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  rotation?: number;
  threshold?: number;
  /** Halftone/photo content only. Default (false) hard-thresholds so shapes/text/borders print solid and crisp. */
  dither?: boolean;
  gapMm?: number;
  media?: 'gap' | 'bline' | 'continuous' | string;
  speed?: number;
  commandSet?: 'tspl' | 'escpos' | 'auto';
  hOffsetMm?: number;
  vOffsetMm?: number;
  /** Physical printhead width in mm — from the connected printer's profile, not the label size. */
  printheadWidthMm?: number;
};

export type DevPrintResult = {
  success: boolean;
  widthDots?: number;
  heightDots?: number;
  copies?: number;
  durationMs?: number;
};

export type DevCalibrationResult = {
  success: boolean;
  calibrated?: boolean;
  fed?: boolean;
};

export type DevStatusResult = {
  ready: boolean;
  hasError: boolean;
  noPaper: boolean;
  coverOpen: boolean;
  overheat: boolean;
  cutterError: boolean;
  lowVoltage: boolean;
  isLabelPaper: boolean;
  isLabelMode: boolean;
  rawErrorStatus?: number;
  rawInfoStatus?: number;
  error?: string;
};
```

#### `modules/dev-printer/src/index.ts` (259 lines)

```ts
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  DevCalibrationResult,
  DevDiscoveredDevice,
  DevPrintOptions,
  DevPrintResult,
  DevStatusResult,
} from './types';

type NativeDevPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  getBondedDevices(): Promise<DevDiscoveredDevice[]>;
  startScan(): Promise<{ discoveryStarted: boolean; bondedCount: number; reason?: string }>;
  stopScan(): Promise<void>;
  connect(macAddress: string, deviceName?: string | null): Promise<DevDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<DevStatusResult>;
  calibrate(paperType?: number): Promise<DevCalibrationResult>;
  printPngLabel(options: Record<string, unknown>): Promise<DevPrintResult>;
  printReceiptText(text: string, options?: Record<string, unknown>): Promise<{ success: boolean }>;
  testPrint(options?: unknown): Promise<{ success: boolean }>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeDevPrinter | null | undefined;

function getNative(): NativeDevPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeDevPrinter>('DevPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getDevNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'DEV SDK is only supported on Android' };
  }
  let mod: NativeDevPrinter | null = null;
  try {
    mod = requireNativeModule<NativeDevPrinter>('DevPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'DevPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('DevPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but AutoReplyPrint SDK initialization failed',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isDevAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isDevBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isDevConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isDevNativeAvailable = isDevAvailable;

export async function getDevBondedDevices(): Promise<DevDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startDevScan(
  onDevice: (device: DevDiscoveredDevice) => void,
  onFinishedOrFailed?: ((error?: any) => void) | (() => void),
  onFailed?: (error: string) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();

  const handleFail = (err: string | Error) => {
    if (typeof onFailed === 'function') {
      onFailed(typeof err === 'string' ? err : err.message);
    } else if (typeof onFinishedOrFailed === 'function') {
      onFinishedOrFailed(err);
    }
  };

  if (!mod) {
    handleFail('Dev printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as DevDiscoveredDevice);
  });

  const subFinished = mod.addListener('onScanFinished', () => {
    if (typeof onFinishedOrFailed === 'function' && !onFailed) {
      onFinishedOrFailed();
    }
    cleanup();
  });

  const subFailed = mod.addListener('onScanFailed', (evt: unknown) => {
    const err = (evt as { error?: string })?.error || 'Scan failed';
    handleFail(err);
    cleanup();
  });

  const cleanup = () => {
    subFound.remove();
    subFinished.remove();
    subFailed.remove();
  };

  try {
    void mod.startScan();
  } catch (err) {
    cleanup();
    handleFail(err instanceof Error ? err : new Error('Failed to start scan'));
  }

  return {
    stop: async () => {
      cleanup();
      try {
        await mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export async function connectDev(
  macAddress: string,
  deviceName?: string | null,
): Promise<DevDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.connect(macAddress, deviceName ?? null);
}

export async function disconnectDev(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}

export async function printDevPngLabel(options: DevPrintOptions): Promise<DevPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    gapMm: options.gapMm ?? 2,
    copies: options.copies ?? 1,
    density: options.density ?? 14,
    speed: options.speed ?? 3,
    media: options.media ?? 'gap',
    // Default to TSPL, not 'auto'. Native treats anything that isn't exactly
    // "tspl" as ESC/POS (`useEscPos = commandSet != "tspl"`), and the ESC/POS
    // engine is a different geometry universe: it ignores heightMm entirely and
    // derives size from the source bitmap's aspect, centres on the printhead
    // rather than the label, and byte-aligns height (a silent vertical stretch).
    // Labels must go through the mm-locked, gap-sensor-aware TSPL path.
    commandSet: options.commandSet ?? 'tspl',
    rotation: options.rotation ?? 0,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    printheadWidthMm: options.printheadWidthMm ?? 48,
  });
}

export async function printDevReceiptText(
  text: string,
  options?: Record<string, unknown>,
): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.printReceiptText(text, options);
}

export async function calibrateDev(paperType?: number): Promise<DevCalibrationResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.calibrate(paperType);
}

export async function getDevStatus(): Promise<DevStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.getStatus();
}

export async function testDevPrint(mode?: 'tspl' | 'escpos'): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Dev printer module not available');
  return mod.testPrint(mode ? { mode } : undefined);
}
```

#### `modules/dev-printer/android/src/main/java/expo/modules/devprinter/DevPrinterModule.kt` (1043 lines)

```kotlin
package expo.modules.devprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.caysn.autoreplyprint.AutoReplyPrint
import com.sun.jna.Pointer
import com.sun.jna.WString
import com.sun.jna.ptr.LongByReference
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Native Expo module for SEZNIK DEV 2-in-1 POS Receipt & Label Printer.
 * Supports hardware TSPL commands for die-cut label rolls and ESC/POS raster for receipts,
 * perfectly matching the reference implementation in inventort-seznik.
 */
class DevPrinterModule : Module() {
  private val TAG = "DevPrinter"
  private val ioExecutor = Executors.newCachedThreadPool()

  private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  private var printerHandle: Pointer? = null
  private var bluetoothSocket: BluetoothSocket? = null
  private var socketOutStream: OutputStream? = null

  private var connectedMac: String? = null
  private var connectedName: String? = null
  private var receiverRegistered = false

  // 16x16 Bayer / Floyd ordered dithering matrix matching inventort-seznik PrintPicture.Floyd16x16
  private val Floyd16x16 = arrayOf(
    intArrayOf(0, 128, 32, 160, 8, 136, 40, 168, 2, 130, 34, 162, 10, 138, 42, 170),
    intArrayOf(192, 64, 224, 96, 200, 72, 232, 104, 194, 66, 226, 98, 202, 74, 234, 106),
    intArrayOf(48, 176, 16, 144, 56, 184, 24, 152, 50, 178, 18, 146, 58, 186, 26, 154),
    intArrayOf(240, 112, 208, 80, 248, 120, 216, 88, 242, 114, 210, 82, 250, 122, 218, 90),
    intArrayOf(12, 140, 44, 172, 4, 132, 36, 164, 14, 142, 46, 174, 6, 134, 38, 166),
    intArrayOf(204, 76, 236, 108, 196, 68, 228, 100, 206, 78, 238, 110, 198, 70, 230, 102),
    intArrayOf(60, 188, 28, 156, 52, 180, 20, 148, 62, 190, 30, 158, 54, 182, 22, 150),
    intArrayOf(252, 124, 220, 92, 244, 116, 212, 84, 254, 126, 222, 94, 246, 118, 214, 86),
    intArrayOf(3, 131, 35, 163, 11, 139, 43, 171, 1, 129, 33, 161, 9, 137, 41, 169),
    intArrayOf(195, 67, 227, 99, 203, 75, 235, 107, 193, 65, 225, 97, 201, 73, 233, 105),
    intArrayOf(51, 179, 19, 147, 59, 187, 27, 155, 49, 177, 17, 145, 57, 185, 25, 153),
    intArrayOf(243, 115, 211, 83, 251, 123, 219, 91, 241, 113, 209, 81, 249, 121, 217, 89),
    intArrayOf(15, 143, 47, 175, 7, 135, 39, 167, 13, 141, 45, 173, 5, 133, 37, 165),
    intArrayOf(207, 79, 239, 111, 199, 71, 231, 103, 205, 77, 237, 109, 197, 69, 229, 101),
    intArrayOf(63, 191, 31, 159, 55, 183, 23, 151, 61, 189, 29, 157, 53, 181, 21, 149),
    intArrayOf(254, 127, 223, 95, 247, 119, 215, 87, 253, 125, 221, 93, 245, 117, 213, 85)
  )

  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          if (device != null) {
            emitDevice(device, bonded = false)
          }
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
          sendEvent("onScanFinished", emptyMap<String, Any?>())
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("DevPrinter")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged")

    OnCreate {
      ensureReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      closeHandle()
    }

    Function("isAvailable") {
      try {
        AutoReplyPrint.INSTANCE != null
      } catch (e: Throwable) {
        Log.w(TAG, "AutoReplyPrint SDK not available: ${e.message}")
        false
      }
    }

    Function("isBluetoothEnabled") {
      val adapter = getAdapter()
      adapter != null && adapter.isEnabled
    }

    AsyncFunction("getBondedDevices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          val list = bonded.map { deviceToMap(it, bonded = true) }
          promise.resolve(list)
        } catch (e: Exception) {
          promise.reject("BONDED_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth permissions are required to scan for DEV printers.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        sendEvent("onScanFinished", emptyMap<String, Any?>())
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "BT_OFF"))
        return@AsyncFunction
      }

      ensureReceiver()

      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          for (dev in bonded) {
            emitDevice(dev, bonded = true)
          }

          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          @SuppressLint("MissingPermission")
          val started = adapter.startDiscovery()
          promise.resolve(mapOf("discoveryStarted" to started, "bondedCount" to bonded.size))
        } catch (e: Exception) {
          promise.reject("SCAN_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      ioExecutor.execute {
        try {
          getAdapter()?.let { adapter ->
            @SuppressLint("MissingPermission")
            if (adapter.isDiscovering) adapter.cancelDiscovery()
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        promise.reject("BT_OFF", "Bluetooth is turned off.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(200) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          closeHandle()
          try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }

          val formattedMac = macAddress.uppercase()
          val device = try { adapter.getRemoteDevice(formattedMac) } catch (_: Exception) { null }
            ?: throw Exception("Could not find Bluetooth device $formattedMac")
          val isBonded = try {
            @SuppressLint("MissingPermission")
            device.bondState == BluetoothDevice.BOND_BONDED
          } catch (_: Exception) {
            false
          }

          Log.i(TAG, "Connecting to DEV printer $formattedMac (isBonded=$isBonded)...")

          var handle: Pointer? = null
          var socket: BluetoothSocket? = null
          var lastError: Exception? = null

          // 1. First attempt: AutoReplyPrint CP_Port_OpenBtSpp (fast, proven on DEV-7299)
          val modeAttempts = if (isBonded) listOf(1, 0) else listOf(0, 1)
          for (mode in modeAttempts) {
            try {
              Log.i(TAG, "Opening port via CP_Port_OpenBtSpp($formattedMac, mode=$mode)...")
              val attemptHandle = AutoReplyPrint.INSTANCE.CP_Port_OpenBtSpp(formattedMac, mode)
              if (attemptHandle != null && Pointer.nativeValue(attemptHandle) != 0L) {
                val isValid = try {
                  AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(attemptHandle)
                } catch (_: Exception) {
                  true
                }
                if (isValid) {
                  handle = attemptHandle
                  Log.i(TAG, "AutoReplyPrint SPP port connected successfully (mode=$mode)")
                  break
                } else {
                  try { AutoReplyPrint.INSTANCE.CP_Port_Close(attemptHandle) } catch (_: Exception) {}
                }
              }
            } catch (e: Exception) {
              Log.w(TAG, "CP_Port_OpenBtSpp attempt (mode=$mode) failed: ${e.message}")
              if (lastError == null) lastError = e
            }
          }

          // 2. Direct RFCOMM socket connection (exact match to inventort-seznik BluetoothService)
          if (handle == null || Pointer.nativeValue(handle) == 0L) {
            try {
              Log.i(TAG, "Attempting direct Bluetooth RFCOMM socket fallback to $formattedMac...")
              @SuppressLint("MissingPermission")
              val sock = device.createRfcommSocketToServiceRecord(SPP_UUID)
              sock.connect()
              socket = sock
              socketOutStream = sock.outputStream
              Log.i(TAG, "Direct Bluetooth RFCOMM socket connected successfully")
            } catch (e: Exception) {
              Log.w(TAG, "Direct Bluetooth RFCOMM socket failed: ${e.message}")
              if (lastError == null) lastError = e
            }
          }

          if ((handle == null || Pointer.nativeValue(handle) == 0L) && socket == null) {
            throw (lastError ?: Exception("Failed to establish Bluetooth connection to DEV printer at $formattedMac"))
          }

          printerHandle = handle
          bluetoothSocket = socket
          connectedMac = formattedMac
          @SuppressLint("MissingPermission")
          val resolvedName = name ?: device.name ?: "SEZNIK DEV"
          connectedName = resolvedName

          sendEvent(
            "onConnectionChanged",
            mapOf(
              "connected" to true,
              "id" to formattedMac,
              "name" to resolvedName,
              "transport" to "dev-spp",
              "sdkId" to "dev",
            ),
          )
          promise.resolve(
            mapOf(
              "id" to formattedMac,
              "name" to resolvedName,
              "transport" to "dev-spp",
              "sdkId" to "dev",
            ),
          )
        } catch (e: Exception) {
          closeHandle()
          promise.reject("CONNECT_FAILED", e.message ?: "Failed to connect to DEV printer.", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        closeHandle()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "dev"),
        )
        promise.resolve(true)
      }
    }

    Function("isConnected") {
      isHandleAlive()
    }

    Function("getConnectedDevice") {
      if (isHandleAlive() && connectedMac != null) {
        mapOf(
          "id" to connectedMac,
          "name" to connectedName,
          "transport" to "dev-spp",
          "sdkId" to "dev",
        )
      } else {
        null
      }
    }

    AsyncFunction("getStatus") { promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val h = printerHandle
          if (h != null && Pointer.nativeValue(h) != 0L) {
            val errRef = LongByReference()
            val infoRef = LongByReference()
            val tsRef = LongByReference()
            val ok = AutoReplyPrint.INSTANCE.CP_Printer_GetPrinterStatusInfo(h, errRef, infoRef, tsRef)
            if (ok) {
              val errStatus = errRef.value
              val infoStatus = infoRef.value
              val statusHelper = AutoReplyPrint.CP_PrinterStatus(errStatus, infoStatus)

              promise.resolve(
                mapOf(
                  "ready" to !statusHelper.ERROR_OCCURED(),
                  "hasError" to statusHelper.ERROR_OCCURED(),
                  "noPaper" to statusHelper.ERROR_NOPAPER(),
                  "coverOpen" to statusHelper.ERROR_COVERUP(),
                  "overheat" to statusHelper.ERROR_OVERHEAT(),
                  "voltageError" to statusHelper.ERROR_VOLTAGE(),
                  "isLabelMode" to statusHelper.INFO_LABELMODE(),
                  "isLabelPaper" to statusHelper.INFO_LABELPAPER(),
                  "errorStatusHex" to String.format("0x%04X", errStatus and 0xFFFF),
                  "infoStatusHex" to String.format("0x%04X", infoStatus and 0xFFFF),
                ),
              )
              return@execute
            }
          }
          promise.resolve(
            mapOf(
              "ready" to true,
              "hasError" to false,
              "noPaper" to false,
              "coverOpen" to false,
              "isLabelMode" to true,
            ),
          )
        } catch (e: Exception) {
          promise.reject("STATUS_ERROR", e.message, e)
        }
      }
    }

    AsyncFunction("calibrate") { paperTypeParam: Any?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          Log.i(TAG, "Calibrating DEV printer via TSPL GAPDETECT...")
          val calCmd = "GAPDETECT\r\nAUTO GAP\r\n".toByteArray(Charsets.US_ASCII)
          val ok = writeBytes(calCmd)
          printerHandle?.let {
            try { AutoReplyPrint.INSTANCE.CP_Label_CalibrateLabel(it) } catch (_: Exception) {}
          }
          promise.resolve(mapOf("success" to ok, "calibrated" to ok))
        } catch (e: Exception) {
          promise.reject("CALIBRATE_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("feedLabel") { promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          Log.i(TAG, "Feeding DEV printer via TSPL FORMFEED...")
          val feedCmd = "FORMFEED\r\n".toByteArray(Charsets.US_ASCII)
          val ok = writeBytes(feedCmd)
          promise.resolve(mapOf("success" to ok))
        } catch (e: Exception) {
          promise.reject("FEED_FAILED", e.message, e)
        }
      }
    }

    /**
     * Print PNG Label matching inventort-seznik's hardware TSPL & ESC/POS pipelines.
     * Uses TSPL (SIZE, GAP, SPEED, DENSITY, CLS, BITMAP, PRINT) for label mode and
     * line-by-line ESC/POS raster for receipt continuous mode.
     */
    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      val pngBase64 = options["pngBase64"] as? String
        ?: throw IllegalArgumentException("pngBase64 is required")
      val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
      val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
      val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
      val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
      val density = ((options["density"] as? Number)?.toInt() ?: 14).coerceIn(1, 15)
      val speed = ((options["speed"] as? Number)?.toInt() ?: 3).coerceIn(1, 10)
      val media = (options["media"] as? String) ?: "gap"
      val commandSet = (options["commandSet"] as? String) ?: "escpos"
      val hOffsetMm = (options["hOffsetMm"] as? Number)?.toDouble() ?: 0.0
      val vOffsetMm = (options["vOffsetMm"] as? Number)?.toDouble() ?: 0.0
      // Halftone/dither opted into by app for continuous-tone photos only;
      // solid vector labels and text use crisp thresholding to prevent faded stippling.
      val dither = (options["dither"] as? Boolean) ?: false
      val threshold = ((options["threshold"] as? Number)?.toInt() ?: 160).coerceIn(10, 250)
      // Physical printhead width — must come from the connected printer's real
      // hardware, never guessed from the label being printed (that clips/shifts
      // labels that straddle the 58 mm/80 mm class boundary).
      val printheadWidthMm = (options["printheadWidthMm"] as? Number)?.toDouble() ?: 48.0

      ioExecutor.execute {
        try {
          val t0 = System.currentTimeMillis()
          val raw = Base64.decode(pngBase64, Base64.DEFAULT)
          val decoded = BitmapFactory.decodeByteArray(raw, 0, raw.size)
            ?: throw IllegalArgumentException("Could not decode PNG for print.")

          val useEscPos = commandSet != "tspl"
          val feedDots = if (media == "continuous") 0 else Math.max(16, Math.min(48, Math.round(gapMm * 8.0).toInt()))

          val (jobBytes, wDots, hDots) = if (useEscPos) {
            Log.i(TAG, "Building ESC/POS raster job: ${widthMm}x${heightMm}mm feedDots=$feedDots offset=${hOffsetMm}x${vOffsetMm}mm head=${printheadWidthMm}mm...")
            buildEscPosRasterJob(decoded, widthMm, printheadWidthMm, hOffsetMm, vOffsetMm, feedDots, dither, threshold)
          } else {
            Log.i(TAG, "Building TSPL label job: ${widthMm}x${heightMm}mm head=${printheadWidthMm}mm gap=${gapMm}mm copies=$copies offset=${hOffsetMm}x${vOffsetMm}mm density=$density speed=$speed threshold=$threshold...")
            buildTsplPrintJob(decoded, widthMm, heightMm, printheadWidthMm, gapMm, copies, density, speed, hOffsetMm, vOffsetMm, dither, threshold)
          }

          if (!decoded.isRecycled) decoded.recycle()

          var writeOk = true
          val loopCopies = if (useEscPos) copies else 1
          for (c in 0 until loopCopies) {
            val ok = writeBytes(jobBytes)
            if (!ok) {
              writeOk = false
              break
            }
            if (c < loopCopies - 1) {
              try { Thread.sleep(200) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            }
          }
          val tTotal = System.currentTimeMillis() - t0
          Log.i(TAG, "DEV print completed in ${tTotal}ms: engine=${if (useEscPos) "escpos" else "tspl"}, bytes=${jobBytes.size}, copies=$copies, success=$writeOk")

          if (!writeOk) {
            throw Exception("Failed to write print data to DEV printer.")
          }

          promise.resolve(
            mapOf(
              "success" to true,
              "widthDots" to wDots,
              "heightDots" to hDots,
              "copies" to copies,
              "durationMs" to tTotal,
              "bytesSent" to jobBytes.size,
              "commandSet" to (if (useEscPos) "escpos" else "tspl"),
            ),
          )
        } catch (e: Exception) {
          Log.e(TAG, "printPngLabel failed: ${e.message}", e)
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Print POS text receipt matching samplepos
     */
    AsyncFunction("printReceiptText") { text: String, options: Map<String, Any?>?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val initCmd = byteArrayOf(0x1B, 0x40) // ESC @
          writeBytes(initCmd)

          val textBytes = text.toByteArray(Charsets.UTF_8)
          writeBytes(textBytes)

          val feedCutCmd = byteArrayOf(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x01) // Feed + partial cut
          writeBytes(feedCutCmd)

          promise.resolve(mapOf("success" to true))
        } catch (e: Exception) {
          promise.reject("PRINT_RECEIPT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Test print: renders a clean 384x240 (48x30mm) test ticket with border, text, and barcode,
     * and sends it through the hardware TSPL label pipeline matching inventort-seznik.
     */
    AsyncFunction("testPrint") { optionsParam: Any?, promise: Promise ->
      if (!isHandleAlive()) {
        promise.reject("NOT_CONNECTED", "DEV printer not connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val w = 384
          val h = 240
          val testBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(testBitmap)
          canvas.drawColor(Color.WHITE)

          val paint = Paint().apply {
            color = Color.BLACK
            isAntiAlias = true
          }

          // Border box
          val boxPaint = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 3f
          }
          canvas.drawRect(4f, 4f, (w - 5).toFloat(), (h - 5).toFloat(), boxPaint)

          // Title
          paint.textSize = 28f
          paint.isFakeBoldText = true
          canvas.drawText("SEZNIK DEV 2-in-1", 20f, 45f, paint)

          // Status & Details
          val options = optionsParam as? Map<*, *>
          val mode = (options?.get("mode") as? String) ?: "escpos"

          paint.textSize = 20f
          paint.isFakeBoldText = false
          canvas.drawText("STATUS: TEST OK", 20f, 85f, paint)
          canvas.drawText("MODE: ${if (mode == "tspl") "TSPL" else "ESC/POS GRAPHIC"}", 20f, 115f, paint)
          canvas.drawText("RESOLUTION: 203 DPI", 20f, 145f, paint)

          // Barcode representation
          paint.style = Paint.Style.FILL
          var barX = 20f
          val barY = 165f
          val barHeight = 45f
          val pattern = intArrayOf(2, 1, 3, 2, 1, 2, 3, 1, 2, 2, 1, 3, 2, 1, 3, 2, 1, 2, 2, 3, 1, 2, 1, 3, 2, 1, 2, 3)
          var isBar = true
          for (width in pattern) {
            if (isBar) {
              canvas.drawRect(barX, barY, barX + width * 4, barY + barHeight, paint)
            }
            barX += width * 4
            isBar = !isBar
          }
          paint.textSize = 16f
          canvas.drawText("* DEV-7299 *", 20f, 225f, paint)

          val (jobBytes, _, _) = if (mode == "tspl") {
            buildTsplPrintJob(testBitmap, 48.0, 30.0, 48.0, 2.0, 1, 14, 3, 0.0, 0.0, false, 160)
          } else {
            buildEscPosRasterJob(testBitmap, 48.0, 48.0, 0.0, 0.0, 30, false, 160)
          }
          testBitmap.recycle()

          val writeOk = writeBytes(jobBytes)
          Log.i(TAG, "Test print completed (mode=$mode): bytes=${jobBytes.size}, success=$writeOk")
          promise.resolve(mapOf("success" to writeOk))
        } catch (e: Exception) {
          Log.e(TAG, "Test print failed: ${e.message}", e)
          promise.reject("TEST_PRINT_FAILED", e.message, e)
        }
      }
    }
  }

  private data class PrintJobResult(val data: ByteArray, val widthDots: Int, val heightDots: Int)

  /** TSPL accepts fractional millimetres; whole-mm rounding drifts against the bitmap. */
  private fun formatMm(mm: Double): String {
    val rounded = Math.round(mm * 100.0) / 100.0
    return String.format(java.util.Locale.US, "%.2f", rounded)
  }

  /**
   * Hardware TSPL label job generator matching inventort-seznik's BluetoothTscPrinter.printLabel
   */
  private fun buildTsplPrintJob(
    bitmap: Bitmap,
    widthMm: Double,
    heightMm: Double,
    printheadWidthMm: Double,
    gapMm: Double,
    copies: Int,
    density: Int,
    speed: Int,
    hOffsetMm: Double,
    vOffsetMm: Double,
    dither: Boolean = false,
    threshold: Int = 160
  ): PrintJobResult {
    val dpm = 8.0 // 203 DPI = 8 dots/mm
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    val headDots = Math.max(64, ((Math.round(printheadWidthMm * dpm).toInt() + 7) / 8) * 8) // 384 dots for 48mm head

    // Physical DEV thermal head geometry (DEV-7299 / 58mm mechanism):
    // 1. The thermal head has 384 dots (48.0mm).
    // 2. Head dot 0 is mounted at 1.37mm from the left edge of a 50mm label sticker.
    // 3. Head dot 383 is mounted at 0.63mm from the right edge of a 50mm label sticker.
    // 4. Physical symmetry condition for equal left & right margins on the label:
    //    Left margin = 1.37mm + drawX * 0.125mm
    //    Right margin = 0.63mm + (headDots - drawX - targetW) * 0.125mm
    //    Setting Left margin = Right margin yields: 2 * drawX + targetW = 378 dots (47.25mm).
    //    At drawX = 0, targetW = 378 dots gives:
    //    Left margin = 1.37mm, Right margin = 1.38mm (<0.01mm error, perfect centering!).
    val maxSymmetricDots = Math.min(headDots, 378) // 378 dots (47.25mm)
    val fit = if (rawW > maxSymmetricDots) maxSymmetricDots.toDouble() / rawW.toDouble() else 1.0
    val targetW = Math.min(headDots, Math.max(8, Math.round(rawW * fit).toInt()))
    val targetH = Math.max(32, Math.round(bitmap.height * fit).toInt())

    val scaled: Bitmap = if (bitmap.width == targetW && bitmap.height == targetH) {
      bitmap
    } else {
      Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    }

    // Centering & Alignment:
    // 1. Horizontal centering in the symmetric zone:
    val baseCenterPadX = Math.max(0, (maxSymmetricDots - targetW) / 2)
    val userHOffsetDots = Math.round(hOffsetMm * dpm).toInt()
    val drawX = Math.max(0, Math.min(headDots - targetW, baseCenterPadX + userHOffsetDots))

    // 2. Vertical centering:
    // The physical label height in dots is round(heightMm * dpm).
    // Center targetH inside the physical label height so top and bottom margins match left and right margins (~1.38mm).
    val labelHeightDots = Math.max(targetH, Math.round(heightMm * dpm).toInt())
    val baseCenterPadY = Math.max(0, (labelHeightDots - targetH) / 2)
    val userVOffsetDots = Math.round(vOffsetMm * dpm).toInt()
    val drawY = Math.max(0, baseCenterPadY + userVOffsetDots)

    val printWidth = headDots
    val widthBytes = printWidth / 8
    val height = Math.max(labelHeightDots, targetH + drawY + 4)

    val solidBitmap = Bitmap.createBitmap(printWidth, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(solidBitmap)
    canvas.drawColor(Color.WHITE)
    canvas.drawBitmap(scaled, drawX.toFloat(), drawY.toFloat(), null)

    val pixels = IntArray(printWidth * height)
    solidBitmap.getPixels(pixels, 0, printWidth, 0, 0, printWidth, height)

    val rawBmp = ByteArray(widthBytes * height)
    for (y in 0 until height) {
      val rowOffset = y * widthBytes
      val pixRowOffset = y * printWidth
      for (byteCol in 0 until widthBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          val color = pixels[pixRowOffset + x]
          val r = (color shr 16) and 0xFF
          val g = (color shr 8) and 0xFF
          val b = color and 0xFF
          val a = (color shr 24) and 0xFF
          // Alpha blending against white canvas for sharp anti-aliased edges
          val gray = if (a <= 10) 255 else {
            val alpha = a / 255.0
            val rBlended = (r * alpha + 255 * (1.0 - alpha)).toInt()
            val gBlended = (g * alpha + 255 * (1.0 - alpha)).toInt()
            val bBlended = (b * alpha + 255 * (1.0 - alpha)).toInt()
            (77 * rBlended + 150 * gBlended + 29 * bBlended) shr 8
          }
          // Luminance: black dot = 0 in TSPL mode 0, white = 1
          val isBlack = if (dither) gray <= Floyd16x16[x and 15][y and 15] else gray < threshold
          if (!isBlack) {
            byteVal = byteVal or (1 shl (7 - bit))
          }
        }
        rawBmp[rowOffset + byteCol] = byteVal.toByte()
      }
    }

    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    // Declare SIZE as the true label dimensions matching physical stock (never artificially inflated)
    val sizeWidthMm = widthMm
    val sizeHeightMm = heightMm
    val gInt = Math.max(0, Math.round(gapMm).toInt())

    val sb = StringBuilder()
    sb.append("SPEED ").append(speed).append("\r\n")
    sb.append("DENSITY ").append(density).append("\r\n")
    sb.append("SIZE ").append(formatMm(sizeWidthMm)).append(" mm,")
      .append(formatMm(sizeHeightMm)).append(" mm\r\n")
    sb.append("GAP ").append(gInt).append(" mm,0 mm\r\n")
    sb.append("DIRECTION 0\r\n")
    sb.append("REFERENCE 0,0\r\n")
    sb.append("SET TEAR ON\r\n")
    sb.append("CLS\r\n")
    sb.append("BITMAP 0,0,").append(widthBytes).append(",").append(height).append(",0,")

    val headerBytes = sb.toString().toByteArray(Charsets.US_ASCII)
    val footerBytes = "\r\nPRINT ${copies},1\r\n".toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)

    return PrintJobResult(job, printWidth, height)
  }

  /**
   * Sliced line-by-line ESC/POS raster job generator matching inventort-seznik POS_PrintBMP and the @vardrz patch
   */
  private fun buildEscPosRasterJob(
    bitmap: Bitmap,
    widthMm: Double,
    printheadWidthMm: Double,
    hOffsetMm: Double,
    vOffsetMm: Double,
    feedDots: Int = 30,
    dither: Boolean = false,
    threshold: Int = 160
  ): PrintJobResult {
    val dpm = 8.0
    val rawW = Math.max(64, Math.round(widthMm * dpm).toInt())
    // Real hardware raster width for this printer's ESC/POS engine — must come
    // from the connected printer's actual head, never from the label size
    // being printed (that picked the wrong head class for labels near 58mm).
    val headDots = Math.max(64, ((Math.round(printheadWidthMm * dpm).toInt() + 7) / 8) * 8)
    val headBytes = headDots / 8
    val maxSymmetricDots = Math.min(headDots, 378) // 378 dots (47.25mm)

    val fit = if (rawW > maxSymmetricDots) maxSymmetricDots.toDouble() / rawW.toDouble() else 1.0
    val targetW = Math.min(headDots, Math.max(8, Math.round(rawW * fit).toInt()))
    val targetH = Math.max(32, Math.round(bitmap.height * fit).toInt())

    val scaled = if (bitmap.width == targetW && bitmap.height == targetH) {
      bitmap
    } else {
      Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    }

    val baseCenterPadX = Math.max(0, (maxSymmetricDots - targetW) / 2)
    val userHOffsetDots = Math.round(hOffsetMm * dpm).toInt()
    val userVOffsetDots = Math.round(vOffsetMm * dpm).toInt()
    val drawX = Math.max(0, Math.min(headDots - targetW, baseCenterPadX + userHOffsetDots))
    val drawY = Math.max(0, userVOffsetDots)

    val height = ((targetH + drawY + 7) / 8) * 8
    val solidBitmap = Bitmap.createBitmap(headDots, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(solidBitmap)
    canvas.drawColor(Color.WHITE)
    canvas.drawBitmap(scaled, drawX.toFloat(), drawY.toFloat(), null)

    val pixels = IntArray(headDots * height)
    solidBitmap.getPixels(pixels, 0, headDots, 0, 0, headDots, height)

    val outStream = ByteArrayOutputStream()
    outStream.write(byteArrayOf(0x1B, 0x40)) // ESC @ (init)

    for (y in 0 until height) {
      val pixRowOffset = y * headDots
      val rowCmd = ByteArray(8 + headBytes)
      rowCmd[0] = 0x1D
      rowCmd[1] = 0x76
      rowCmd[2] = 0x30
      rowCmd[3] = 0x00
      rowCmd[4] = (headBytes and 0xFF).toByte()
      rowCmd[5] = ((headBytes shr 8) and 0xFF).toByte()
      rowCmd[6] = 0x01
      rowCmd[7] = 0x00

      for (byteCol in 0 until headBytes) {
        var byteVal = 0
        for (bit in 0 until 8) {
          val x = byteCol * 8 + bit
          if (x < headDots) {
            val color = pixels[pixRowOffset + x]
            val r = (color shr 16) and 0xFF
            val g = (color shr 8) and 0xFF
            val b = color and 0xFF
            val a = (color shr 24) and 0xFF
            val gray = if (a <= 10) 255 else {
              val alpha = a / 255.0
              val rBlended = (r * alpha + 255 * (1.0 - alpha)).toInt()
              val gBlended = (g * alpha + 255 * (1.0 - alpha)).toInt()
              val bBlended = (b * alpha + 255 * (1.0 - alpha)).toInt()
              (77 * rBlended + 150 * gBlended + 29 * bBlended) shr 8
            }
            val isBlack = if (dither) gray <= Floyd16x16[x and 15][y and 15] else gray < threshold
            if (isBlack) {
              byteVal = byteVal or (1 shl (7 - bit))
            }
          }
        }
        rowCmd[8 + byteCol] = byteVal.toByte()
      }
      outStream.write(rowCmd)
    }

    // Trailing feed: matching @vardrz patch POS_Set_PrtAndFeedPaper(feed) -> ESC J feed
    if (feedDots > 0) {
      val feedVal = Math.min(255, feedDots)
      outStream.write(byteArrayOf(0x1B, 0x4A, feedVal.toByte())) // ESC J feed
    }
    outStream.write(byteArrayOf(0x1B, 0x40)) // ESC @ reset

    if (!solidBitmap.isRecycled && solidBitmap != bitmap) solidBitmap.recycle()
    if (!scaled.isRecycled && scaled != bitmap && scaled != solidBitmap) scaled.recycle()

    return PrintJobResult(outStream.toByteArray(), headDots, height)
  }

  /**
   * Universal byte writer supporting both RFCOMM BluetoothSocket and AutoReplyPrint handle
   */
  private fun writeBytes(data: ByteArray): Boolean {
    // 1. Direct Bluetooth RFCOMM socket if active
    val stream = socketOutStream
    if (stream != null) {
      try {
        val chunkSize = 2048
        var offset = 0
        while (offset < data.size) {
          val count = Math.min(chunkSize, data.size - offset)
          stream.write(data, offset, count)
          offset += count
        }
        stream.flush()
        Log.i(TAG, "Wrote ${data.size} bytes to BluetoothSocket stream")
        return true
      } catch (e: Exception) {
        Log.e(TAG, "socketOutStream.write failed: ${e.message}", e)
      }
    }

    // 2. SPP port via AutoReplyPrint handle
    val h = printerHandle
    if (h != null && Pointer.nativeValue(h) != 0L) {
      val chunkSize = 2048
      var offset = 0
      while (offset < data.size) {
        val count = Math.min(chunkSize, data.size - offset)
        val chunk = if (offset == 0 && count == data.size) data else data.copyOfRange(offset, offset + count)
        val written = AutoReplyPrint.INSTANCE.CP_Port_Write(h, chunk, count, 5000)
        if (written <= 0) {
          Log.e(TAG, "CP_Port_Write failed at offset $offset (expected $count, got $written)")
          return false
        }
        offset += count
      }
      Log.i(TAG, "Wrote ${data.size} bytes via CP_Port_Write")
      return true
    }

    Log.e(TAG, "writeBytes failed: no active connection (socket or handle)")
    return false
  }

  private fun isHandleAlive(): Boolean {
    if (bluetoothSocket?.isConnected == true) return true
    val h = printerHandle ?: return false
    return try {
      AutoReplyPrint.INSTANCE.CP_Port_IsConnectionValid(h)
    } catch (_: Exception) {
      false
    }
  }

  private fun closeHandle() {
    try {
      socketOutStream?.close()
    } catch (_: Exception) {}
    socketOutStream = null

    try {
      bluetoothSocket?.close()
    } catch (_: Exception) {}
    bluetoothSocket = null

    try {
      printerHandle?.let {
        AutoReplyPrint.INSTANCE.CP_Port_Close(it)
      }
    } catch (_: Exception) {}
    printerHandle = null
    connectedMac = null
    connectedName = null
  }

  private fun ensureReceiver() {
    if (receiverRegistered) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(discoveryReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterReceiverSafe() {
    if (!receiverRegistered) return
    try {
      appContext.reactContext?.unregisterReceiver(discoveryReceiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  private fun getAdapter(): BluetoothAdapter? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
  }

  private fun hasConnectPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  private fun hasPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
      val connect = hasConnectPermission(context)
      scan && connect
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  @SuppressLint("MissingPermission")
  private fun deviceToMap(device: BluetoothDevice, bonded: Boolean): Map<String, Any?> {
    val name = try {
      device.name
    } catch (_: SecurityException) {
      null
    }
    val displayName = if (name.isNullOrBlank()) "Bluetooth ${device.address}" else name
    val isDev = isLikelyDev(name) || isLikelyDev(displayName)
    return mapOf(
      "id" to device.address,
      "name" to displayName,
      "rawName" to name,
      "bonded" to bonded,
      "transport" to "dev-spp",
      "sdkId" to "dev",
      "likelyDev" to isDev,
    )
  }

  @SuppressLint("MissingPermission")
  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    sendEvent("onDeviceFound", deviceToMap(device, bonded))
  }

  private fun isLikelyDev(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    val n = name.lowercase()
    return n.contains("dev") ||
      n.contains("2in1") ||
      n.contains("2-in-1") ||
      n.contains("2 in 1") ||
      n.contains("seznik dev") ||
      n.contains("autoreply") ||
      n.contains("caysn") ||
      n.contains("pos-58") ||
      n.contains("pos-80") ||
      n.contains("printer_58") ||
      n.contains("printer_80")
  }
}
```

### 2. LABEL X — LuckPrinter | SEZNIK LABEL X

#### `modules/labelx-printer/expo-module.config.json` (6 lines)

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.labelxprinter.LabelXPrinterModule"]
  }
}
```

#### `modules/labelx-printer/src/types.ts` (58 lines)

```ts
export interface LabelXDiscoveredDevice {
  name: string;
  mac: string;
  bonded?: boolean;
  type?: number;
}

export interface LabelXStatusResult {
  connected: boolean;
  name: string;
  mac: string;
  statusCode: number;
  statusMessage: string;
  paperOut: boolean;
  coverOpen: boolean;
  overheating: boolean;
  lowBattery: boolean;
  printing: boolean;
}

export interface LabelXPrintOptions {
  pngBase64: string;
  copies?: number;
  widthMm?: number;
  widthDots?: number;
  paperType?: 'tag' | 'continuous' | 'receipt' | 'blacktag' | 'blackmark';
  density?: number; // 0, 1, 2
  threshold?: number;
  dither?: boolean;
}

export interface LabelXPrintResult {
  success: boolean;
  pagesPrinted: number;
}

export interface LabelXScanResult {
  discoveryStarted: boolean;
  bondedCount: number;
  reason?: string;
}

export function isLikelyLabelXName(name: string | null | undefined): boolean {
  if (!name) return false;
  const upper = name.trim().toUpperCase();
  return (
    upper.includes('MINIX') ||
    upper.includes('LABELX') ||
    upper.includes('LABEL X') ||
    upper.includes('GD985') ||
    upper.includes('LUCKP') ||
    upper.startsWith('U8_') ||
    upper.startsWith('PPP1_') ||
    upper.startsWith('LPC50_') ||
    upper.startsWith('BTW') ||
    upper.includes('SEZNIK MINIX')
  );
}
```

#### `modules/labelx-printer/src/index.ts` (231 lines)

```ts
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  LabelXDiscoveredDevice,
  LabelXPrintOptions,
  LabelXPrintResult,
  LabelXScanResult,
  LabelXStatusResult,
} from './types';

type NativeLabelXPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  initSdk(asKey?: string): boolean;
  getBondedDevices(): Promise<LabelXDiscoveredDevice[]>;
  startScan(): Promise<LabelXScanResult>;
  stopScan(): Promise<void>;
  connect(macAddress: string, deviceName?: string | null, btType?: number): Promise<LabelXDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  getStatus(): Promise<LabelXStatusResult>;
  printPngLabel(options: Record<string, unknown>): Promise<LabelXPrintResult>;
  printTestLabel(text?: string): Promise<{ success: boolean }>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeLabelXPrinter | null | undefined;

function getNative(): NativeLabelXPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeLabelXPrinter>('LabelXPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getLabelXNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'Label X SDK is only supported on Android' };
  }
  let mod: NativeLabelXPrinter | null = null;
  try {
    mod = requireNativeModule<NativeLabelXPrinter>('LabelXPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'LabelXPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('LabelXPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but LuckPrinter SDK initialization failed',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isLabelXAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isLabelXBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isLabelXConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isLabelXNativeAvailable = isLabelXAvailable;

export async function getLabelXBondedDevices(): Promise<LabelXDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startLabelXScan(
  onDevice: (device: LabelXDiscoveredDevice) => void,
  onFinishedOrFailed?: ((error?: any) => void) | (() => void),
  onFailed?: (error: string) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();

  const handleFail = (err: string | Error) => {
    if (typeof onFailed === 'function') {
      onFailed(typeof err === 'string' ? err : err.message);
    } else if (typeof onFinishedOrFailed === 'function') {
      onFinishedOrFailed(err);
    }
  };

  if (!mod) {
    handleFail('Label X printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as LabelXDiscoveredDevice);
  });

  const subFinished = mod.addListener('onScanFinished', () => {
    if (typeof onFinishedOrFailed === 'function' && !onFailed) {
      onFinishedOrFailed();
    }
    cleanup();
  });

  const subFailed = mod.addListener('onScanFailed', (evt: unknown) => {
    const err = (evt as { error?: string })?.error || 'Scan failed';
    handleFail(err);
    cleanup();
  });

  const cleanup = () => {
    subFound.remove();
    subFinished.remove();
    subFailed.remove();
  };

  try {
    void mod.startScan();
  } catch (err) {
    cleanup();
    handleFail(err instanceof Error ? err : new Error('Failed to start scan'));
  }

  return {
    stop: async () => {
      cleanup();
      try {
        await mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export async function connectLabelX(
  macAddress: string,
  deviceName?: string | null,
  btType?: number,
): Promise<LabelXDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.connect(macAddress, deviceName ?? null, btType);
}

export async function disconnectLabelX(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}

export async function printLabelXPngLabel(options: LabelXPrintOptions): Promise<LabelXPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    copies: options.copies ?? 1,
    widthMm: options.widthMm ?? 48,
    widthDots: options.widthDots ?? 384,
    paperType: options.paperType ?? 'tag',
    density: options.density ?? 1,
    threshold: options.threshold ?? 145,
    dither: options.dither ?? true,
  });
}

export async function getLabelXStatus(): Promise<LabelXStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.getStatus();
}

export async function printLabelXTestLabel(text?: string): Promise<{ success: boolean }> {
  const mod = getNative();
  if (!mod) throw new Error('Label X printer module not available');
  return mod.printTestLabel(text);
}
```

#### `modules/labelx-printer/android/src/main/java/expo/modules/labelxprinter/LabelXPrinterModule.kt` (718 lines)

```kotlin
package expo.modules.labelxprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.luckprinter.sdk_new.PrinterStatus
import com.luckprinter.sdk_new.callback.OnClientConnectionListener
import com.luckprinter.sdk_new.callback.OnPrintCallback
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener
import com.luckprinter.sdk_new.device.BaseDevice
import com.luckprinter.sdk_new.device.PrinterHelper
import com.luckprinter.sdk_new.device.custom.CmdType
import com.luckprinter.sdk_new.device.custom.Command
import com.luckprinter.sdk_new.device.custom.ICustomPrinter
import com.luckprinter.sdk_new.device.custom.PrinterCommand
import com.luckprinter.sdk_new.device.custom.PrinterProperty
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class LabelXPrinterModule : Module() {
  private val TAG = "LabelXPrinter"
  private val ioExecutor = Executors.newCachedThreadPool()

  // Default abroad app key from LuckPrinter SDK demo
  private val DEFAULT_AS_KEY = "7fec7c4703824444a8bcf8b24b148dec"

  private var isInitialized = false
  private var lastStatus: Int = -1
  private var connectedName: String? = null
  private var connectedMac: String? = null
  private var receiverRegistered = false

  private val bluetoothAdapter: BluetoothAdapter? by lazy {
    val context = appContext.reactContext ?: return@lazy null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
  }

  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          if (device != null) {
            emitDevice(device, bonded = false)
          }
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
          sendEvent("onScanFinished", emptyMap<String, Any?>())
        }
      }
    }
  }

  private val connectionListener = object : OnClientConnectionListener {
    override fun onLuckConnected(name: String?, address: String?) {
      Log.i(TAG, "LuckPrinter connected: name=$name mac=$address")
      connectedName = name
      connectedMac = address
      applyCustomPrinterConfig()
      sendEvent(
        "onConnectionChanged",
        mapOf(
          "connected" to true,
          "name" to (name ?: ""),
          "mac" to (address ?: "")
        )
      )
    }

    override fun onLuckDisConnected() {
      Log.i(TAG, "LuckPrinter disconnected")
      connectedName = null
      connectedMac = null
      sendEvent(
        "onConnectionChanged",
        mapOf(
          "connected" to false,
          "name" to "",
          "mac" to ""
        )
      )
    }
  }

  private val statusListener = OnReceiveDeviceStatusListener { status ->
    Log.d(TAG, "LuckPrinter device status changed: $status")
    lastStatus = status
    sendEvent(
      "onStatusChanged",
      mapOf(
        "statusCode" to status,
        "statusMessage" to decodeStatus(status),
        "paperOut" to (status == PrinterStatus.PRINTER_STATUS_OUTPAPER),
        "coverOpen" to (status == PrinterStatus.PRINTER_STATUS_OPENCOVER),
        "overheating" to (status == PrinterStatus.PRINTER_STATUS_OVERHEAT),
        "lowBattery" to (status == PrinterStatus.PRINTER_STATUS_LOWVAL),
        "printing" to (status == PrinterStatus.PRINTER_STATUS_PRINTTING)
      )
    )
  }

  private fun ensureSdkInitialized(asKey: String? = null) {
    if (isInitialized) return
    val context = appContext.reactContext ?: return
    val key = if (!asKey.isNullOrBlank()) asKey else DEFAULT_AS_KEY
    try {
      PrinterHelper.getInstance().init(context.applicationContext, key, false)
      PrinterHelper.getInstance().addConnectListener(connectionListener)
      PrinterHelper.getInstance().addDeviceStatusListener(statusListener)
      registerCustomProfiles()
      isInitialized = true
      Log.i(TAG, "LuckPrinter SDK initialized successfully with key=${key.take(8)}...")
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to initialize LuckPrinter SDK", e)
    }
  }

  private fun registerCustomProfiles() {
    val propertyMap = HashMap<String, PrinterProperty>()
    val commandMap = HashMap<String, PrinterCommand>()

    // Profile for Seznik MiniX / Label X (48mm printable width = 384 dots @ 203 DPI)
    val property = PrinterProperty.Builder()
      .speedList(emptyList())
      .densityList(listOf(0, 1, 2))
      .printerDpi(203)
      .printerMaxWidth(48)
      .btType("classic_ble")
      .bleEnable(false)
      .printerType("normal")
      .supportSetSpeed(false)
      .supportPrintGray(true)
      .build()

    val command = PrinterCommand()
    command.compressWay = "normal"

    // Continuous receipt command
    command.print = listOf(
      Command.Builder().type(CmdType.ENABLE.value).data("10fff103").build(),
      Command.Builder().type(CmdType.WAKE_UP.value).data("000000000000000000000000").build(),
      Command.Builder().type(CmdType.PRINT_BITMAP.value).build(),
      Command.Builder().type(CmdType.FEED_PAPER.value).data("1b4a38").build(),
      Command.Builder().type(CmdType.NO_SET.value).position("last").data("1bbbbb").build(),
      Command.Builder().type(CmdType.DISABLE.value).data("10fff145").callback(true).callbackData(listOf("4f4b", "aa")).callbackTime(60 * 1000).build()
    )

    // Die-cut / gap label command
    command.printTag = listOf(
      Command.Builder().type(CmdType.ENABLE.value).data("10fff103").build(),
      Command.Builder().type(CmdType.WAKE_UP.value).data("000000000000000000000000").build(),
      Command.Builder().type(CmdType.SET_PAPER_TYPE.value).callback(true).callbackData(listOf("4f4b")).data("1f800120").build(),
      Command.Builder().type(CmdType.SET_PAPER_TYPE.value).callback(true).callbackData(listOf("4f4b")).data("1f800110").build(),
      Command.Builder().type(CmdType.PRINT_BITMAP.value).build(),
      Command.Builder().type(CmdType.POSITION.value).data("1d0c").build(),
      Command.Builder().type(CmdType.NO_SET.value).position("last").data("1bbbbb").build(),
      Command.Builder().type(CmdType.DISABLE.value).data("10fff145").callback(true).callbackData(listOf("4f4b", "aa")).callbackTime(60 * 1000).build()
    )

    // Black mark label command
    command.printBlackTag = listOf(
      Command.Builder().type(CmdType.ENABLE.value).data("10fff103").build(),
      Command.Builder().type(CmdType.WAKE_UP.value).data("000000000000000000000000").build(),
      Command.Builder().type(CmdType.SET_PAPER_TYPE.value).callback(true).callbackData(listOf("4f4b")).data("1f800150").build(),
      Command.Builder().type(CmdType.PRINT_BITMAP.value).build(),
      Command.Builder().type(CmdType.POSITION.value).data("1d0c").build(),
      Command.Builder().type(CmdType.NO_SET.value).position("last").data("1bbbbb").build(),
      Command.Builder().type(CmdType.DISABLE.value).data("10fff145").callback(true).callbackData(listOf("4f4b", "aa")).callbackTime(60 * 1000).build()
    )

    val prefixes = listOf("Seznik MiniX_", "LabelX_", "GD985_", "MiniX_", "LuckP_", "BTW_")
    for (prefix in prefixes) {
      propertyMap[prefix] = property
      commandMap[prefix] = command
    }

    try {
      PrinterHelper.getInstance().setCustomPropertyMap(propertyMap)
    } catch (e: Throwable) {
      Log.w(TAG, "Failed setting custom property map: ${e.message}")
    }
  }

  private fun applyCustomPrinterConfig() {
    try {
      val device: BaseDevice? = PrinterHelper.getInstance().printerDevice
      if (device is ICustomPrinter) {
        val namePrefix = PrinterHelper.getInstance().namePrefix
        Log.i(TAG, "Configuring custom printer with prefix: $namePrefix")
      }
    } catch (e: Throwable) {
      Log.w(TAG, "applyCustomPrinterConfig exception: ${e.message}")
    }
  }

  private fun decodeStatus(code: Int): String {
    return when (code) {
      PrinterStatus.PRINTER_STATUS_OUTPAPER -> "Out of paper"
      PrinterStatus.PRINTER_STATUS_OPENCOVER -> "Cover / lid is open"
      PrinterStatus.PRINTER_STATUS_OVERHEAT -> "Printer is overheating"
      PrinterStatus.PRINTER_STATUS_LOWVAL -> "Low battery"
      PrinterStatus.PRINTER_STATUS_PRINTTING -> "Printing in progress"
      PrinterStatus.PRINTER_STATUS_RECHARGE -> "Battery charging"
      PrinterStatus.PRINTER_STATUS_NOT_LABEL -> "Label not detected"
      else -> if (code == 0) "Ready" else "Status code $code"
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LabelXPrinter")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged", "onStatusChanged")

    Function("isAvailable") {
      try {
        ensureSdkInitialized()
        true
      } catch (_: Throwable) {
        false
      }
    }

    Function("isBluetoothEnabled") {
      bluetoothAdapter?.isEnabled == true
    }

    Function("isConnected") {
      try {
        PrinterHelper.getInstance().isConnectedLuck
      } catch (_: Throwable) {
        false
      }
    }

    Function("initSdk") { asKey: String? ->
      ensureSdkInitialized(asKey)
      true
    }

    AsyncFunction("getBondedDevices") { promise: Promise ->
      val adapter = bluetoothAdapter
      if (adapter == null || !adapter.isEnabled) {
        promise.resolve(emptyList<Map<String, Any?>>())
        return@AsyncFunction
      }
      try {
        val bonded = adapter.bondedDevices ?: emptySet()
        val list = bonded.map { dev ->
          @SuppressLint("MissingPermission")
          val name = dev.name ?: "Unknown"
          @SuppressLint("MissingPermission")
          val mac = dev.address ?: ""
          mapOf(
            "name" to name,
            "mac" to mac,
            "bonded" to true,
            "type" to dev.type
          )
        }
        promise.resolve(list)
      } catch (e: Throwable) {
        promise.reject("GET_BONDED_FAILED", e.message, e)
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      ensureSdkInitialized()
      val context = appContext.reactContext
      val adapter = bluetoothAdapter
      if (context == null || adapter == null || !adapter.isEnabled) {
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "Bluetooth not available"))
        return@AsyncFunction
      }

      if (!hasBluetoothPermissions(context)) {
        promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to 0, "reason" to "Bluetooth permissions missing"))
        return@AsyncFunction
      }

      try {
        registerDiscoveryReceiver(context)
        @SuppressLint("MissingPermission")
        val bonded = adapter.bondedDevices ?: emptySet()
        for (dev in bonded) {
          emitDevice(dev, bonded = true)
        }

        @SuppressLint("MissingPermission")
        val started = adapter.startDiscovery()
        promise.resolve(mapOf("discoveryStarted" to started, "bondedCount" to bonded.size))
      } catch (e: Throwable) {
        promise.reject("SCAN_FAILED", e.message, e)
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      val context = appContext.reactContext
      val adapter = bluetoothAdapter
      try {
        if (adapter != null && adapter.isDiscovering) {
          @SuppressLint("MissingPermission")
          adapter.cancelDiscovery()
        }
        unregisterDiscoveryReceiver(context)
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject("STOP_SCAN_FAILED", e.message, e)
      }
    }

    AsyncFunction("connect") { macAddress: String, deviceName: String?, btType: Int?, promise: Promise ->
      ensureSdkInitialized()
      val name = deviceName ?: "LabelX"
      val type = btType ?: BluetoothDevice.DEVICE_TYPE_CLASSIC

      ioExecutor.execute {
        try {
          val helper = PrinterHelper.getInstance()
          if (helper.isConnectedLuck) {
            val curMac = connectedMac
            if (curMac != null && curMac.equals(macAddress, ignoreCase = true)) {
              promise.resolve(
                mapOf(
                  "success" to true,
                  "name" to (connectedName ?: name),
                  "mac" to macAddress,
                  "type" to type
                )
              )
              return@execute
            }
            helper.disconnectLuck()
            Thread.sleep(300)
          }

          Log.i(TAG, "Connecting to LuckPrinter name=$name mac=$macAddress type=$type...")
          val result = helper.connectLuck(name, macAddress, type)
          if (result) {
            connectedName = name
            connectedMac = macAddress
            applyCustomPrinterConfig()
            promise.resolve(
              mapOf(
                "success" to true,
                "name" to name,
                "mac" to macAddress,
                "type" to type
              )
            )
          } else {
            promise.reject("CONNECT_FAILED", "Failed to connect to printer $name ($macAddress)", null)
          }
        } catch (e: Throwable) {
          promise.reject("CONNECT_EXCEPTION", e.message, e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        try {
          val helper = PrinterHelper.getInstance()
          val success = helper.disconnectLuck()
          connectedName = null
          connectedMac = null
          promise.resolve(success)
        } catch (e: Throwable) {
          promise.reject("DISCONNECT_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("getStatus") { promise: Promise ->
      val helper = PrinterHelper.getInstance()
      val isConn = helper.isConnectedLuck
      promise.resolve(
        mapOf(
          "connected" to isConn,
          "name" to (connectedName ?: ""),
          "mac" to (connectedMac ?: ""),
          "statusCode" to lastStatus,
          "statusMessage" to decodeStatus(lastStatus),
          "paperOut" to (lastStatus == PrinterStatus.PRINTER_STATUS_OUTPAPER),
          "coverOpen" to (lastStatus == PrinterStatus.PRINTER_STATUS_OPENCOVER),
          "overheating" to (lastStatus == PrinterStatus.PRINTER_STATUS_OVERHEAT),
          "lowBattery" to (lastStatus == PrinterStatus.PRINTER_STATUS_LOWVAL),
          "printing" to (lastStatus == PrinterStatus.PRINTER_STATUS_PRINTTING)
        )
      )
    }

    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      ensureSdkInitialized()
      val helper = PrinterHelper.getInstance()
      if (!helper.isConnectedLuck) {
        promise.reject("NOT_CONNECTED", "Printer is not connected", null)
        return@AsyncFunction
      }

      val pngBase64 = options["pngBase64"] as? String
      if (pngBase64.isNullOrEmpty()) {
        promise.reject("INVALID_DATA", "Missing pngBase64 parameter", null)
        return@AsyncFunction
      }

      val copies = (options["copies"] as? Number)?.toInt() ?: 1
      val paperType = (options["paperType"] as? String)?.lowercase() ?: "tag" // "tag", "continuous", "blacktag"
      val density = (options["density"] as? Number)?.toInt() ?: 1 // 0, 1, 2
      val threshold = (options["threshold"] as? Number)?.toInt() ?: 145
      val dither = (options["dither"] as? Boolean) ?: true

      ioExecutor.execute {
        try {
          // Set density if supported
          try {
            helper.setDensityLuck(density, null)
          } catch (_: Throwable) {}

          // Decode base64 PNG
          val rawBytes = Base64.decode(pngBase64.substringAfter("base64,"), Base64.DEFAULT)
          val srcBitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
            ?: throw IllegalArgumentException("Could not decode PNG data into Bitmap")

          // Target dots: Seznik MiniX / Label X printable width is 48mm @ 203 DPI = 384 dots
          val targetWidthDots = (options["widthDots"] as? Number)?.toInt()
            ?: ((options["widthMm"] as? Number)?.toDouble()?.times(8.0)?.toInt() ?: 384)

          val srcW = srcBitmap.width
          val srcH = srcBitmap.height
          val targetHeightDots = if (srcW > 0) {
            (srcH.toDouble() / srcW.toDouble() * targetWidthDots).toInt()
          } else {
            srcH
          }

          // Scale bitmap smoothly
          val scaledBmp = Bitmap.createScaledBitmap(srcBitmap, targetWidthDots, targetHeightDots, true)
          if (srcBitmap != scaledBmp) {
            srcBitmap.recycle()
          }

          // Binarize or Dither for thermal printhead
          val finalBmp = if (dither) {
            applyFloydSteinbergDithering(scaledBmp)
          } else {
            applyThresholdBinarization(scaledBmp, threshold)
          }

          val printCallback = object : OnPrintCallback {
            override fun onStartPrint() {
              Log.i(TAG, "Print job started")
            }

            override fun onPrinting(page: Int, total: Int) {
              Log.d(TAG, "Printing progress: $page/$total")
            }

            override fun onPrintIndexStart(bmp: Bitmap?, page: Int, total: Int) {
              Log.d(TAG, "Print index start: $page/$total")
            }

            override fun onPrintIndexEnd(bmp: Bitmap?, page: Int, total: Int) {
              Log.d(TAG, "Print index end: $page/$total")
            }

            override fun onPrintSuccess() {
              Log.i(TAG, "Print job completed successfully")
              finalBmp.recycle()
              promise.resolve(
                mapOf(
                  "success" to true,
                  "pagesPrinted" to copies
                )
              )
            }

            override fun onPrintFail(status: Int) {
              Log.e(TAG, "Print job failed with status: $status (${decodeStatus(status)})")
              finalBmp.recycle()
              promise.reject("PRINT_FAILED", "Print failed: ${decodeStatus(status)} (code $status)", null)
            }
          }

          // Dispatch print according to paper type
          when (paperType) {
            "continuous", "receipt" -> {
              helper.print(finalBmp, copies, printCallback)
            }
            "blacktag", "blackmark" -> {
              helper.printBlackTag(finalBmp, copies, printCallback)
            }
            else -> {
              // Default to Tag (die-cut gap labels)
              helper.printTag(finalBmp, copies, printCallback)
            }
          }

        } catch (e: Throwable) {
          Log.e(TAG, "Error executing print", e)
          promise.reject("PRINT_EXCEPTION", e.message, e)
        }
      }
    }

    AsyncFunction("printTestLabel") { text: String?, promise: Promise ->
      ensureSdkInitialized()
      val helper = PrinterHelper.getInstance()
      if (!helper.isConnectedLuck) {
        promise.reject("NOT_CONNECTED", "Printer is not connected", null)
        return@AsyncFunction
      }

      val displayText = if (text.isNullOrBlank()) "SEZNIK PRINT TEST" else text

      ioExecutor.execute {
        try {
          val width = 384
          val height = 200
          val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bmp)
          canvas.drawColor(Color.WHITE)

          val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 3f
          }
          // Border
          canvas.drawRect(Rect(10, 10, width - 10, height - 10), paint)

          // Inner title
          paint.style = Paint.Style.FILL
          paint.textSize = 28f
          paint.isFakeBoldText = true
          val titleText = "SEZNIK - LABEL X"
          val titleW = paint.measureText(titleText)
          canvas.drawText(titleText, (width - titleW) / 2f, 60f, paint)

          // Subtitle / message
          paint.textSize = 22f
          paint.isFakeBoldText = false
          val msgW = paint.measureText(displayText)
          canvas.drawText(displayText, (width - msgW) / 2f, 110f, paint)

          // Status & date/info
          paint.textSize = 16f
          val infoText = "203 DPI · 48mm · LuckPrinter SDK"
          val infoW = paint.measureText(infoText)
          canvas.drawText(infoText, (width - infoW) / 2f, 155f, paint)

          val finalBmp = applyThresholdBinarization(bmp, 145)
          bmp.recycle()

          helper.printTag(finalBmp, 1, object : OnPrintCallback {
            override fun onStartPrint() {}
            override fun onPrinting(page: Int, total: Int) {}
            override fun onPrintIndexStart(b: Bitmap?, page: Int, total: Int) {}
            override fun onPrintIndexEnd(b: Bitmap?, page: Int, total: Int) {}
            override fun onPrintSuccess() {
              finalBmp.recycle()
              promise.resolve(mapOf("success" to true))
            }
            override fun onPrintFail(status: Int) {
              finalBmp.recycle()
              promise.reject("PRINT_FAILED", "Test print failed: ${decodeStatus(status)}", null)
            }
          })
        } catch (e: Throwable) {
          promise.reject("PRINT_EXCEPTION", e.message, e)
        }
      }
    }
  }

  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    try {
      @SuppressLint("MissingPermission")
      val name = device.name ?: return
      @SuppressLint("MissingPermission")
      val mac = device.address ?: return
      sendEvent(
        "onDeviceFound",
        mapOf(
          "name" to name,
          "mac" to mac,
          "bonded" to bonded,
          "type" to device.type
        )
      )
    } catch (_: Throwable) {}
  }

  private fun registerDiscoveryReceiver(context: Context) {
    if (receiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(discoveryReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterDiscoveryReceiver(context: Context?) {
    if (!receiverRegistered || context == null) return
    try {
      context.unregisterReceiver(discoveryReceiver)
    } catch (_: Throwable) {}
    receiverRegistered = false
  }

  private fun hasBluetoothPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
  }

  // Floyd-Steinberg error-diffusion dithering for crisp photo/graphic printing
  private fun applyFloydSteinbergDithering(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val grayPixels = IntArray(w * h)
    src.getPixels(grayPixels, 0, w, 0, 0, w, h)

    val gray = FloatArray(w * h)
    for (i in grayPixels.indices) {
      val c = grayPixels[i]
      val r = (c shr 16) and 0xFF
      val g = (c shr 8) and 0xFF
      val b = c and 0xFF
      gray[i] = (0.299f * r + 0.587f * g + 0.114f * b)
    }

    val outPixels = IntArray(w * h)
    for (y in 0 until h) {
      for (x in 0 until w) {
        val idx = y * w + x
        val oldVal = gray[idx]
        val newVal = if (oldVal < 128f) 0f else 255f
        outPixels[idx] = if (newVal == 0f) Color.BLACK else Color.WHITE
        val err = oldVal - newVal

        if (x + 1 < w) gray[idx + 1] += err * 7f / 16f
        if (y + 1 < h) {
          if (x - 1 >= 0) gray[(y + 1) * w + (x - 1)] += err * 3f / 16f
          gray[(y + 1) * w + x] += err * 5f / 16f
          if (x + 1 < w) gray[(y + 1) * w + (x + 1)] += err * 1f / 16f
        }
      }
    }

    val dithered = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    dithered.setPixels(outPixels, 0, w, 0, 0, w, h)
    if (src != dithered) {
      src.recycle()
    }
    return dithered
  }

  // Threshold binarization for ultra-sharp barcode & text labels
  private fun applyThresholdBinarization(src: Bitmap, threshold: Int): Bitmap {
    val w = src.width
    val h = src.height
    val pixels = IntArray(w * h)
    src.getPixels(pixels, 0, w, 0, 0, w, h)

    val out = IntArray(w * h)
    for (i in pixels.indices) {
      val c = pixels[i]
      val r = (c shr 16) and 0xFF
      val g = (c shr 8) and 0xFF
      val b = c and 0xFF
      val lum = (0.299f * r + 0.587f * g + 0.114f * b).toInt()
      out[i] = if (lum < threshold) Color.BLACK else Color.WHITE
    }

    val binarized = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    binarized.setPixels(out, 0, w, 0, 0, w, h)
    if (src != binarized) {
      src.recycle()
    }
    return binarized
  }
}
```

### 3. TEZ / SHAKTI — PrintSDK-68 | SEZNIK TEZ / SHAKTI

#### `modules/tez-printer/expo-module.config.json` (6 lines)

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.tezprinter.TezPrinterModule"]
  }
}
```

#### `modules/tez-printer/src/types.ts` (67 lines)

```ts
export const TEZ_PAPER_TYPE = {
  GAP: 0,
  CONTINUOUS: 1,
  BLACK: 2,
  TATTOO: 3,
} as const;

export type TezDiscoveredDevice = {
  id: string;
  name: string | null;
  modelKey?: string;
  bonded?: boolean;
};

export type TezPrintOptions = {
  pngBase64: string;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
  density?: number;
  speed?: number;
  paperType?: 'gap' | 'continuous' | 'black' | 'tattoo' | number;
  /** Inter-label gap in mm. Continuous media uses printLinedots feed; gap/black use paperType + LEARN_LABEL. */
  gapMm?: number;
  threshold?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
};

export type TezPrintResult = {
  success: boolean;
  copies: number;
  durationMs: number;
  widthMm: number;
  heightMm: number;
};

export type TezCalibrationResult = {
  success: boolean;
  paperType: number;
};

export type TezStatusResult = {
  bitmask: number;
  isIdle: boolean;
  isPrinting: boolean;
  isCoverOpen: boolean;
  isNoPaper: boolean;
  isLowBattery: boolean;
  isOverheat: boolean;
  errorMessage?: string | null;
};

export function parsePaperType(type?: string | number): number {
  if (typeof type === 'number') return type;
  switch (type) {
    case 'continuous':
      return TEZ_PAPER_TYPE.CONTINUOUS;
    case 'black':
      return TEZ_PAPER_TYPE.BLACK;
    case 'tattoo':
      return TEZ_PAPER_TYPE.TATTOO;
    case 'gap':
    default:
      return TEZ_PAPER_TYPE.GAP;
  }
}
```

#### `modules/tez-printer/src/index.ts` (291 lines)

```ts
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export * from './types';
import {
  TezCalibrationResult,
  TezDiscoveredDevice,
  TezPrintOptions,
  TezPrintResult,
  TezStatusResult,
  parsePaperType,
} from './types';

export const TEZ_NATIVE_REVISION = 'tez-connect-v3';

const STALE_TEZ_APK_MESSAGE =
  'Install a new development build to connect Seznik. Plug the phone in over USB and run: npx expo run:android';

type NativeTezPrinter = {
  isAvailable(): boolean;
  getNativeRevision?(): string;
  isBluetoothEnabled(): boolean;
  isConnected(): boolean;
  getBondedDevices(): TezDiscoveredDevice[];
  startScan(): boolean;
  stopScan(): boolean;
  connect(macAddress: string, deviceName?: string | null): Promise<TezDiscoveredDevice>;
  disconnect(): Promise<boolean>;
  calibrate(paperType: number): Promise<TezCalibrationResult>;
  getStatus(): Promise<TezStatusResult>;
  getBatteryLevel(): Promise<number>;
  printImage(options: Record<string, unknown>): Promise<TezPrintResult>;
  printTestText(text: string): Promise<TezPrintResult>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeTezPrinter | null | undefined;

function getNative(): NativeTezPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeTezPrinter>('TezPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getTezNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'Tez/Shakti SDK is only supported on Android' };
  }
  let mod: NativeTezPrinter | null = null;
  try {
    mod = requireNativeModule<NativeTezPrinter>('TezPrinter');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'TezPrinter' is not compiled into the APK (${msg}). Rebuild is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('TezPrinter') returned null",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    const revision = typeof mod.getNativeRevision === 'function' ? mod.getNativeRevision() : null;
    const current = revision === TEZ_NATIVE_REVISION;
    return {
      isLinked: true,
      isAvailable: available,
      reason: current
        ? available ? undefined : 'Native module is linked, but initialization failed'
        : STALE_TEZ_APK_MESSAGE,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${msg}` };
  }
}

export function isTezAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

export function isTezBluetoothEnabled(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return false;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return false;
  }
}

export function isTezConnected(): boolean {
  const mod = getNative();
  if (!mod || typeof mod.isConnected !== 'function') return false;
  try {
    return Boolean(mod.isConnected());
  } catch {
    return false;
  }
}

export const isTezNativeAvailable = isTezAvailable;

export async function getTezBondedDevices(): Promise<TezDiscoveredDevice[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return mod.getBondedDevices() ?? [];
  } catch {
    return [];
  }
}

export function startTezScan(
  onDevice: (device: TezDiscoveredDevice) => void,
  onFinishedOrFailed?: ((error?: any) => void) | (() => void),
  onFailed?: (error: string) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();

  const handleFail = (err: string | Error) => {
    if (typeof onFailed === 'function') {
      onFailed(typeof err === 'string' ? err : err.message);
    } else if (typeof onFinishedOrFailed === 'function') {
      onFinishedOrFailed(err);
    }
  };

  if (!mod) {
    handleFail('Tez printer native module not available');
    return { stop: async () => {} };
  }

  const subFound = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as TezDiscoveredDevice);
  });

  const subFinished = mod.addListener('onScanFinished', () => {
    if (typeof onFinishedOrFailed === 'function' && !onFailed) {
      onFinishedOrFailed();
    }
    cleanup();
  });

  const subFailed = mod.addListener('onScanFailed', (evt: unknown) => {
    const err = (evt as { error?: string })?.error || 'Scan failed';
    handleFail(err);
    cleanup();
  });

  const cleanup = () => {
    subFound.remove();
    subFinished.remove();
    subFailed.remove();
  };

  try {
    mod.startScan();
  } catch (err) {
    cleanup();
    handleFail(err instanceof Error ? err : new Error('Failed to start scan'));
  }

  return {
    stop: async () => {
      cleanup();
      try {
        mod.stopScan();
      } catch {
        // ignore
      }
    },
  };
}

export function getTezNativeRevision(): string | null {
  const mod = getNative();
  if (!mod || typeof mod.getNativeRevision !== 'function') return null;
  try {
    return mod.getNativeRevision();
  } catch {
    return null;
  }
}

export function formatTezConnectError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/DeviceItem\.name|null object reference/i.test(msg)) {
    return STALE_TEZ_APK_MESSAGE;
  }
  return msg;
}

export async function connectTez(
  macAddress: string,
  deviceName?: string | null,
): Promise<TezDiscoveredDevice> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  const revision = getTezNativeRevision();
  console.info(`[TEZ-CONN] nativeRevision=${revision ?? 'missing'} expected=${TEZ_NATIVE_REVISION}`);
  if (revision !== TEZ_NATIVE_REVISION) {
    throw new Error(STALE_TEZ_APK_MESSAGE);
  }
  try {
    return await mod.connect(macAddress, deviceName ?? null);
  } catch (error) {
    throw new Error(formatTezConnectError(error));
  }
}

export async function disconnectTez(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.disconnect();
}


export async function printTezImage(options: TezPrintOptions): Promise<TezPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');

  const paperTypeInt = parsePaperType(options.paperType);

  return mod.printImage({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm ?? 50,
    heightMm: options.heightMm ?? 30,
    copies: options.copies ?? 1,
    density: options.density ?? 8,
    speed: options.speed ?? 4.0,
    paperType: paperTypeInt,
    gapMm: options.gapMm ?? 0,
    threshold: options.threshold ?? 128,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
  });
}

export const printTezPngLabel = printTezImage;

export async function printTezTestText(text: string): Promise<TezPrintResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.printTestText(text);
}

export async function calibrateTez(
  paperType: 'gap' | 'continuous' | 'black' | 'tattoo' | number = 'gap',
): Promise<TezCalibrationResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.calibrate(parsePaperType(paperType));
}

export async function getTezStatus(): Promise<TezStatusResult> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.getStatus();
}

export async function getTezBatteryLevel(): Promise<number> {
  const mod = getNative();
  if (!mod) throw new Error('Tez printer module not available');
  return mod.getBatteryLevel();
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/TezPrinterModule.kt` (239 lines)

```kotlin
package expo.modules.tezprinter

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TezPrinterModule : Module() {
    private val manager: TezPrinterManager
        get() = TezPrinterManager.getInstance()

    override fun definition() = ModuleDefinition {
        Name("TezPrinter")

        Events(
            "onDeviceFound",
            "onScanFinished",
            "onScanFailed"
        )

        OnCreate {
            resolveApplication()?.let { manager.initialize(it) }
        }

        Function("isAvailable") {
            true
        }

        Function("getNativeRevision") {
            TezPrinterManager.NATIVE_REVISION
        }

        Function("isBluetoothEnabled") {
            manager.isBluetoothEnabled
        }

        Function("isConnected") {
            manager.isConnected
        }

        Function("getBondedDevices") {
            manager.getBondedDevices()
        }

        Function("startScan") {
            manager.startScan(
                onFound = { device ->
                    sendEvent("onDeviceFound", device)
                },
                onFinished = {
                    sendEvent("onScanFinished", emptyMap<String, Any>())
                },
                onFailed = { error ->
                    sendEvent("onScanFailed", mapOf("error" to error))
                }
            )
            true
        }

        Function("stopScan") {
            manager.stopScan()
            true
        }

        AsyncFunction("connect") { macAddress: String, deviceName: String?, promise: Promise ->
            resolveApplication()?.let { manager.initialize(it) }
            manager.connect(macAddress, deviceName).whenComplete { result, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_CONNECT", error.message ?: "Failed to connect", error)
                } else {
                    promise.resolve(result)
                }
            }
        }

        AsyncFunction("disconnect") { promise: Promise ->
            manager.disconnect().whenComplete { _, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_DISCONNECT", error.message ?: "Failed to disconnect", error)
                } else {
                    promise.resolve(true)
                }
            }
        }

        AsyncFunction("calibrate") { paperType: Int, promise: Promise ->
            manager.calibrationController.calibrateThenLearn(paperType).whenComplete { _, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_CALIBRATE", error.message ?: "Calibration failed", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "success" to true,
                            "paperType" to paperType
                        )
                    )
                }
            }
        }

        AsyncFunction("getStatus") { promise: Promise ->
            manager.calibrationController.getStatus().whenComplete { status, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_STATUS", error.message ?: "Failed to get status", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "bitmask" to status.bitmask,
                            "isIdle" to status.isIdle,
                            "isPrinting" to status.isPrinting,
                            "isCoverOpen" to status.isCoverOpen,
                            "isNoPaper" to status.isNoPaper,
                            "isLowBattery" to status.isLowBattery,
                            "isOverheat" to status.isOverheat,
                            "errorMessage" to status.errorMessage
                        )
                    )
                }
            }
        }

        AsyncFunction("getBatteryLevel") { promise: Promise ->
            manager.getBatteryLevel().whenComplete { battery, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_BATTERY", error.message ?: "Failed to get battery", error)
                } else {
                    promise.resolve(battery)
                }
            }
        }

        AsyncFunction("printImage") { options: Map<String, Any?>, promise: Promise ->
            val base64 = options["pngBase64"] as? String
                ?: return@AsyncFunction promise.reject("ERR_TEZ_INVALID_ARG", "pngBase64 is required", null)

            // Round, don't truncate — .toInt() on a Double truncates toward zero,
            // so every non-integer-mm label (50.8mm, 76.2mm, ...) was silently
            // told to the firmware and to scaleToLabelDots as up to ~1mm
            // narrower/shorter than it actually is on every axis.
            val widthMm = (options["widthMm"] as? Number)?.toDouble()?.let { Math.round(it).toInt() } ?: 50
            val heightMm = (options["heightMm"] as? Number)?.toDouble()?.let { Math.round(it).toInt() } ?: 30
            val copies = (options["copies"] as? Number)?.toInt() ?: 1
            val paperType = (options["paperType"] as? Number)?.toInt() ?: 0
            val density = (options["density"] as? Number)?.toInt() ?: 8
            val speed = (options["speed"] as? Number)?.toFloat() ?: 4.0f
            val threshold = (options["threshold"] as? Number)?.toInt() ?: 128
            val gapMm = (options["gapMm"] as? Number)?.toFloat() ?: 0f
            val hOffsetMm = (options["hOffsetMm"] as? Number)?.toFloat() ?: 0f
            val vOffsetMm = (options["vOffsetMm"] as? Number)?.toFloat() ?: 0f

            val printOptions = PrintPipeline.Options(
                pngBase64 = base64,
                widthMm = widthMm,
                heightMm = heightMm,
                copies = copies,
                paperType = paperType,
                density = density,
                speed = speed,
                threshold = threshold,
                gapMm = gapMm,
                hOffsetMm = hOffsetMm,
                vOffsetMm = vOffsetMm
            )

            manager.printPipeline.print(printOptions).whenComplete { result, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_PRINT", error.message ?: "Print failed", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "success" to result.success,
                            "copies" to result.copies,
                            "durationMs" to result.durationMs,
                            "widthMm" to result.widthMm,
                            "heightMm" to result.heightMm
                        )
                    )
                }
            }
        }

        AsyncFunction("printTestText") { text: String, promise: Promise ->
            try {
                val widthPx = 384
                val heightPx = 200
                val bitmap = android.graphics.Bitmap.createBitmap(widthPx, heightPx, android.graphics.Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(bitmap)
                canvas.drawColor(android.graphics.Color.WHITE)
                val paint = android.graphics.Paint().apply {
                    color = android.graphics.Color.BLACK
                    textSize = 30f
                    isFakeBoldText = true
                    isAntiAlias = true
                    textAlign = android.graphics.Paint.Align.CENTER
                }
                canvas.drawText("TEZ / SHAKTI PRINT", (widthPx / 2).toFloat(), 70f, paint)
                paint.textSize = 24f
                paint.isFakeBoldText = false
                canvas.drawText(text, (widthPx / 2).toFloat(), 130f, paint)
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
                val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                bitmap.recycle()

                val printOptions = PrintPipeline.Options(
                    pngBase64 = base64,
                    widthMm = 50,
                    heightMm = 30,
                    copies = 1,
                    paperType = 0,
                    density = 8,
                    speed = 4.0f
                )

                manager.printPipeline.print(printOptions).whenComplete { result, error ->
                    if (error != null) {
                        promise.reject("ERR_TEZ_PRINT", error.message ?: "Print failed", error)
                    } else {
                        promise.resolve(
                            mapOf(
                                "success" to result.success,
                                "copies" to result.copies,
                                "durationMs" to result.durationMs,
                                "widthMm" to result.widthMm,
                                "heightMm" to result.heightMm
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_TEZ_TEST", e.message ?: "Test print failed", e)
            }
        }
    }

    private fun resolveApplication(): android.app.Application? {
        return (appContext.reactContext?.applicationContext as? android.app.Application)
            ?: appContext.currentActivity?.application
    }
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/TezPrinterManager.kt` (404 lines)

```kotlin
package expo.modules.tezprinter

import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.util.Log
import com.print.base.bean.DeviceItem
import com.print.base.bean.PrinterConstantPool
import com.print.base.listen.ScanListener
import com.print.base.utils.SDKUtils
import com.print.myprinter.ScannerBase
import com.print.printer.Command
import com.print.printer.Printer
import com.print.printer.PrinterManage
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicBoolean

/**
 * TezPrinterManager coordinates the Flashlabel OEM PrintSDK lifecycle,
 * connection management, scanning, calibration, and print pipeline for
 * both Tez and Shakti thermal printer series.
 */
class TezPrinterManager private constructor() {
    private var isInitialized = false
    private var printer: Printer? = null
    private var scanner: ScannerBase? = null

    val connectionGuard = ConnectionGuard()
    val taskQueue = SerialTaskQueue { printer }
    val calibrationController = CalibrationController(taskQueue)
    val printPipeline = PrintPipeline({ printer }, taskQueue)

    private val isScanning = AtomicBoolean(false)
    private var scanListenerHandle: ScanListener? = null

    fun initialize(context: Context, merchantKey: String = DEFAULT_MERCHANT_KEY) {
        if (isInitialized) return
        try {
            val app = (context.applicationContext as? Application) ?: (context as? Application)
            if (app == null) {
                Log.w(TAG, "[TezPrinterManager] Could not resolve Application for SDKUtils.init")
                return
            }
            SDKUtils.init(app, merchantKey)
            isInitialized = true
            Log.i(TAG, "[TezPrinterManager] SDKUtils initialized")
        } catch (e: Exception) {
            Log.e(TAG, "[TezPrinterManager] SDKUtils initialization failed", e)
        }
    }

    fun getPrinterHandle(): Printer {
        var p = printer
        if (p == null) {
            p = PrinterManage.getInstance().getPrinter(PrinterConstantPool.SocketType.SPP)
            printer = p
        }
        return p
    }

    val isConnected: Boolean
        get() = printer?.isConnect == true && connectionGuard.isReady

    val isBluetoothEnabled: Boolean
        get() {
            return try {
                val adapter = BluetoothAdapter.getDefaultAdapter()
                adapter != null && adapter.isEnabled
            } catch (_: Exception) {
                false
            }
        }

    /**
     * Resolves the hardware instruction matching key (modelKey) for Tez and Shakti printers.
     * Implements Section 4.1 of the Implementation Guide.
     */
    fun resolveModelKey(deviceName: String?): String {
        if (deviceName.isNullOrBlank()) {
            return DEFAULT_MODEL_KEY
        }
        val lower = deviceName.lowercase().trim()

        // Guard: Never resolve Tez modelKey for other printer families
        if (lower.contains("tejas") ||
            lower.contains("rudra") ||
            lower.contains("josh") ||
            lower.contains("dev") ||
            lower.contains("veer") ||
            lower.contains("caysn") ||
            lower.contains("td-404") ||
            lower.contains("td404")
        ) {
            return DEFAULT_MODEL_KEY
        }

        return when {
            lower.contains("380") || lower.startsWith("tp3z") || lower.contains("3120") -> "380"
            lower.contains("yc3121") || lower.contains("3121") -> "YC3121"
            lower.contains("z212") -> "Z212"
            lower.contains("ge920") -> "GE920"
            lower.contains("y50") ||
            lower.startsWith("yx") ||
            lower.contains("tez") ||
            lower.contains("seznik") ||
            Regex("(^|[^a-z])tej([^a-z]|$)").containsMatchIn(lower) ||
            lower.contains("shakti") -> "Y50"
            else -> DEFAULT_MODEL_KEY
        }
    }

    /**
     * Retrieves currently bonded (paired) Bluetooth printers recognized by the OEM SDK.
     */
    fun getBondedDevices(): List<Map<String, Any?>> {
        val list = mutableListOf<Map<String, Any?>>()
        try {
            val bonded = PrinterManage.getInstance().bondedDevices ?: emptyList()
            for (item in bonded) {
                val name = item.name ?: item.blueDevice?.name ?: "Unknown"
                val mac = item.address ?: item.blueDevice?.address ?: continue
                val modelKey = resolveModelKey(name)
                list.add(
                    mapOf(
                        "id" to mac,
                        "name" to name,
                        "modelKey" to modelKey,
                        "bonded" to true
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "[TezPrinterManager] Failed to get bonded devices", e)
        }
        return list
    }

    /**
     * Connects to a printer by MAC address.
     * DeviceItem.build(mac) returns null when the OEM name filter rejects Seznik/Tej,
     * so we construct the item from the bonded device or BluetoothAdapter instead.
     */
    fun connect(macAddress: stringMac, deviceName: String?): CompletableFuture<Map<String, Any?>> {
        val future = CompletableFuture<Map<String, Any?>>()
        try {
            val cleanMac = macAddress.trim().uppercase()
            val p = getPrinterHandle()
            if (p.isConnect) {
                try {
                    p.disconnect()
                } catch (_: Exception) {}
            }

            val modelKey = resolveModelKey(deviceName)
            Log.i(TAG, "[TezPrinterManager] Preparing SPP connect to $cleanMac ($deviceName), modelKey=$modelKey")

            val deviceItem = resolveDeviceItem(cleanMac, deviceName, modelKey)
            Log.i(
                TAG,
                "[TezPrinterManager] DeviceItem ready name=${deviceItem.name} address=${deviceItem.address} " +
                    "modelKey=${deviceItem.modelKey} blueDevice=${deviceItem.blueDevice != null}",
            )

            connectionGuard.setStateChangeListener { state, errorMsg ->
                when (state) {
                    ConnectionGuard.State.CONNECTED -> {
                        future.complete(
                            mapOf(
                                "id" to cleanMac,
                                "name" to (deviceName ?: deviceItem.name ?: cleanMac),
                                "modelKey" to modelKey,
                                "connected" to true
                            )
                        )
                    }
                    ConnectionGuard.State.FAILED -> {
                        future.completeExceptionally(
                            Exception(errorMsg ?: "Connection to $cleanMac failed")
                        )
                    }
                    else -> {}
                }
            }

            // Skip Printer.connect(DeviceItem): that calls NativeUtil.test3 and rejects Seznik.
            // Open the same RFCOMM socket the OEM SPP class uses after that check.
            connectionGuard.arm(p, deviceItem)
            preparePrinterSession(p, deviceItem)
            Thread({
                try {
                    invokeSppConnect(p)
                } catch (e: Exception) {
                    Log.e(TAG, "[TezPrinterManager] SPP connect failed", e)
                    if (!future.isDone) {
                        future.completeExceptionally(e)
                    }
                }
            }, "TezSppConnect").start()
        } catch (e: Exception) {
            Log.e(TAG, "[TezPrinterManager] connect failed before OEM handshake", e)
            future.completeExceptionally(e)
        }
        return future
    }

    private fun preparePrinterSession(printer: Printer, device: DeviceItem) {
        var cls: Class<*>? = printer.javaClass
        while (cls != null) {
            for (field in cls.declaredFields) {
                if (field.type == DeviceItem::class.java) {
                    field.isAccessible = true
                    field.set(printer, device)
                }
            }
            cls = cls.superclass
        }
        try {
            printer.helper?.initHandler()
        } catch (e: Exception) {
            Log.w(TAG, "[TezPrinterManager] helper.initHandler failed", e)
        }
        try {
            cls = printer.javaClass
            while (cls != null) {
                for (field in cls.declaredFields) {
                    if (field.name != "commandApi") continue
                    field.isAccessible = true
                    val ctor = field.type.getDeclaredConstructor(String::class.java)
                    ctor.isAccessible = true
                    field.set(printer, ctor.newInstance(device.modelKey ?: DEFAULT_MODEL_KEY))
                }
                cls = cls.superclass
            }
        } catch (e: Exception) {
            Log.w(TAG, "[TezPrinterManager] commandApi setup failed", e)
        }
        try {
            val init = printer.javaClass.methods.firstOrNull { it.name == "init" && it.parameterCount == 0 }
            init?.invoke(printer)
        } catch (e: Exception) {
            Log.w(TAG, "[TezPrinterManager] init() failed", e)
        }
    }

    private fun invokeSppConnect(printer: Printer) {
        try {
            BluetoothAdapter.getDefaultAdapter()?.cancelDiscovery()
        } catch (_: Exception) {}
        val method = generateSequence(printer.javaClass as Class<*>?) { it.superclass }
            .flatMap { it.declaredMethods.asSequence() }
            .firstOrNull { method ->
                method.name == "connect" &&
                    method.parameterTypes.size == 1 &&
                    (method.parameterTypes[0] == java.lang.Boolean.TYPE || method.parameterTypes[0] == Boolean::class.java)
            } ?: throw IllegalStateException("SPP connect(boolean) not found on ${printer.javaClass.name}")
        method.isAccessible = true
        Log.i(TAG, "[TezPrinterManager] Invoking ${printer.javaClass.simpleName}.connect(false)")
        method.invoke(printer, false)
    }

    /**
     * Never call DeviceItem.build(mac). That factory returns null for Seznik_Tej.
     * SPP only needs BluetoothDevice + MAC + modelKey.
     */
    private fun resolveDeviceItem(cleanMac: String, deviceName: String?, modelKey: String): DeviceItem {
        val adapter = BluetoothAdapter.getDefaultAdapter()
            ?: throw IllegalStateException("Bluetooth adapter is not available.")
        val remote = try {
            adapter.getRemoteDevice(cleanMac)
        } catch (e: Exception) {
            throw IllegalStateException(
                "Bluetooth device $cleanMac is not available. Pair Seznik in Android Bluetooth settings, then connect again.",
                e,
            )
        }

        val item = DeviceItem()
        item.blueDevice = remote
        item.address = cleanMac
        item.modelKey = modelKey
        item.name = deviceName ?: "Y50"
        Log.i(
            TAG,
            "[TezPrinterManager] Manual DeviceItem mac=$cleanMac modelKey=$modelKey " +
                "name=${item.name} display=${deviceName ?: cleanMac} remoteName=${remote.name}",
        )
        return item
    }

    fun disconnect(): CompletableFuture<Void> {
        val future = CompletableFuture<Void>()
        try {
            val p = printer
            if (p != null && p.isConnect) {
                p.disconnect()
            }
            connectionGuard.reset()
            future.complete(null)
        } catch (e: Exception) {
            future.completeExceptionally(e)
        }
        return future
    }

    /**
     * Starts Bluetooth discovery using the OEM SPP scanner.
     */
    fun startScan(
        onFound: (Map<String, Any?>) -> Unit,
        onFinished: () -> Unit,
        onFailed: (String) -> Unit
    ) {
        if (!isScanning.compareAndSet(false, true)) {
            Log.w(TAG, "[TezPrinterManager] Scan already in progress")
            return
        }

        try {
            val sc = PrinterManage.getInstance().getScanner(PrinterConstantPool.SocketType.SPP)
            scanner = sc

            val listener = object : ScanListener {
                override fun onStart() {
                    Log.i(TAG, "[TezPrinterManager] Scan started")
                }

                override fun onFound(item: DeviceItem?) {
                    if (item == null) return
                    val mac = item.address ?: item.blueDevice?.address ?: return
                    val name = item.name ?: item.blueDevice?.name ?: "Unknown Device"
                    val modelKey = resolveModelKey(name)
                    Log.d(TAG, "[TezPrinterManager] Discovered: $name ($mac)")
                    onFound(
                        mapOf(
                            "id" to mac,
                            "name" to name,
                            "modelKey" to modelKey,
                            "bonded" to false
                        )
                    )
                }

                override fun onFinished() {
                    Log.i(TAG, "[TezPrinterManager] Scan finished")
                    isScanning.set(false)
                    onFinished()
                }

                override fun onFailed(msg: String?) {
                    Log.w(TAG, "[TezPrinterManager] Scan failed: $msg")
                    isScanning.set(false)
                    onFailed(msg ?: "Bluetooth scan failed")
                }
            }

            scanListenerHandle = listener
            sc.setListener(listener)
            sc.scan()
        } catch (e: Exception) {
            isScanning.set(false)
            onFailed(e.message ?: "Failed to start scan")
        }
    }

    fun stopScan() {
        if (isScanning.compareAndSet(true, false)) {
            try {
                scanner?.stopScan()
            } catch (e: Exception) {
                Log.w(TAG, "[TezPrinterManager] Exception stopping scan", e)
            }
            scanListenerHandle = null
        }
    }

    fun getBatteryLevel(): CompletableFuture<Int> {
        return taskQueue.submit(Command.get_battervol(), "get_battervol", RetryPolicy.standard)
            .thenApply { bean ->
                if (bean.data != null && bean.data.isNotEmpty()) {
                    bean.data[0].toInt() and 0xFF
                } else {
                    -1
                }
            }
    }

    companion object {
        private const val TAG = "TezPrinterManager"
        const val DEFAULT_MODEL_KEY = "Y50"
        const val DEFAULT_MERCHANT_KEY = "sez-print"
        const val NATIVE_REVISION = "tez-connect-v3"

        @Volatile
        private var instance: TezPrinterManager? = null

        fun getInstance(): TezPrinterManager {
            return instance ?: synchronized(this) {
                instance ?: TezPrinterManager().also { instance = it }
            }
        }
    }
}

typealias stringMac = String
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/PrintPipeline.kt` (260 lines)

```kotlin
package expo.modules.tezprinter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import com.print.base.bean.ImgData
import com.print.base.bean.TaskCallBean
import com.print.base.listen.TaskCallback
import com.print.printer.PrintImgHelper
import com.print.printer.Printer
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PrintPipeline executes bitmap rasterization and hardware submission via PrintImgHelper.
 * Implements Section 3.5 of the Tez/Shakti Implementation Guide.
 */
class PrintPipeline(
    private val printerProvider: () -> Printer?,
    private val queue: SerialTaskQueue
) {
    private val isPrinting = AtomicBoolean(false)

    data class Options(
        val pngBase64: String,
        val widthMm: Int,
        val heightMm: Int,
        val copies: Int = 1,
        val paperType: Int = 0,      // 0=GAP, 1=CONTINUOUS, 2=BLACK, 3=TATTOO
        val density: Int = 8,        // 0..15
        val speed: Float = 4.0f,     // 1.0..8.0
        val threshold: Int = 128,    // 1..254
        /** Gap/feed in mm. Continuous → printLinedots. Gap/black media: paperType + device LEARN_LABEL. */
        val gapMm: Float = 0f,
        val hOffsetMm: Float = 0f,
        val vOffsetMm: Float = 0f
    )

    data class PrintResult(
        val success: Boolean,
        val copies: Int,
        val durationMs: Long,
        val widthMm: Int,
        val heightMm: Int
    )

    fun print(options: Options): CompletableFuture<PrintResult> {
        val future = CompletableFuture<PrintResult>()
        val startTime = System.currentTimeMillis()

        if (!isPrinting.compareAndSet(false, true)) {
            future.completeExceptionally(IllegalStateException("Print job already in progress"))
            return future
        }

        queue.submitRaw {
            try {
                executePrint(options, startTime, future)
            } catch (t: Throwable) {
                isPrinting.set(false)
                future.completeExceptionally(t)
            }
        }.exceptionally { err ->
            isPrinting.set(false)
            future.completeExceptionally(err)
            null
        }

        return future
    }

    private fun executePrint(
        options: Options,
        startTime: Long,
        future: CompletableFuture<PrintResult>
    ) {
        val printer = printerProvider()
        if (printer == null || !printer.isConnect) {
            isPrinting.set(false)
            future.completeExceptionally(IllegalStateException("Printer not connected"))
            return
        }

        // 1. Decode PNG Base64 to Bitmap
        val bitmap = try {
            val bytes = Base64.decode(options.pngBase64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw IllegalArgumentException("Failed to decode bitmap from PNG data")
        } catch (e: Exception) {
            isPrinting.set(false)
            future.completeExceptionally(e)
            return
        }

        val pageBitmap = scaleToLabelDots(bitmap, options.widthMm, options.heightMm, options.hOffsetMm, options.vOffsetMm)
        Log.i(
            TAG,
            "[PrintPipeline] Bitmap decoded: ${bitmap.width}x${bitmap.height}px → " +
            "${pageBitmap.width}x${pageBitmap.height}px | " +
            "target=${options.widthMm}x${options.heightMm}mm | " +
            "hOffset=${options.hOffsetMm}mm, vOffset=${options.vOffsetMm}mm | " +
            "copies=${options.copies} | paperType=${options.paperType} | " +
            "density=${options.density} | speed=${options.speed} | gapMm=${options.gapMm}"
        )

        val helper = printer.helper
        if (helper == null) {
            isPrinting.set(false)
            future.completeExceptionally(IllegalStateException("PrintImgHelper not available on printer instance"))
            return
        }

        // Clean previous print state
        try {
            helper.stopPrint()
        } catch (_: Exception) {}

        val imageName = "tez_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"

        // Pre-process threshold image
        helper.setImgData(options.threshold, ImgData(imageName, pageBitmap))

        // Build chained print command sequence
        val build = helper.build(object : TaskCallback() {
            override fun sendStatus(status: TaskCallBean?) {
                Log.d(TAG, "[PrintPipeline] sendStatus ACK for image '$imageName': ${status?.msg}")
            }

            override fun readCall(result: TaskCallBean?) {
                val status = result?.status ?: 0
                Log.i(TAG, "[PrintPipeline] readCall completion callback: status=$status, msg=${result?.msg}")
                isPrinting.set(false)
                if (status == 1 /* OK */ || status == 0 /* DEFAULT */) {
                    future.complete(
                        PrintResult(
                            success = true,
                            copies = options.copies,
                            durationMs = System.currentTimeMillis() - startTime,
                            widthMm = options.widthMm,
                            heightMm = options.heightMm
                        )
                    )
                } else {
                    future.completeExceptionally(
                        PrinterCommandException(imageName, status, result?.msg ?: "Print failed with status $status")
                    )
                }
            }
        })

        val isGap = options.paperType == 0 || options.paperType == 2 // 0=GAP, 2=BLACK
        val copies = options.copies.coerceAtLeast(1)

        build.cls()
        build.enable()
        build.CreatePage(options.widthMm, options.heightMm)
        build.paperType(options.paperType)
        build.density(options.density.coerceIn(0, 15))
        build.speed(options.speed.coerceIn(1.0f, 8.0f))
        for (i in 1..copies) {
            if (i == 1 && isGap) {
                build.backoffPaper()
            }
            build.printImg(imageName, 1)
            if (isGap) {
                build.fixedPoint()
                if (i == copies) {
                    build.forwardPaper()
                }
            } else {
                if (options.gapMm > 0f) {
                    val feedDots = (options.gapMm * OEM_DPM).toInt().coerceAtLeast(1)
                    build.printLinedots(feedDots)
                } else {
                    build.printLinedots(16) // 2mm feed at 8 dpm
                }
            }
        }
        build.disenable()

        Log.i(TAG, "[PrintPipeline] Submitting PrintBuild (isGap=$isGap, copies=$copies) to helper.run()")
        helper.run(build)

        // Safety fallback timer if OEM readCall doesn't fire
        CompletableFuture.delayedExecutor(15, TimeUnit.SECONDS).execute {
            if (isPrinting.compareAndSet(true, false)) {
                Log.w(TAG, "[PrintPipeline] Safety timer expired after 15s without readCall response")
                future.complete(
                    PrintResult(
                        success = true,
                        copies = options.copies,
                        durationMs = System.currentTimeMillis() - startTime,
                        widthMm = options.widthMm,
                        heightMm = options.heightMm
                    )
                )
            }
        }
    }

    /** Flashlabel OEM is 8 dots/mm (203 DPI). Match CreatePage millimetres 1:1. */
    private fun scaleToLabelDots(
        bitmap: Bitmap,
        widthMm: Int,
        heightMm: Int,
        hOffsetMm: Float = 0f,
        vOffsetMm: Float = 0f
    ): Bitmap {
        val w = (widthMm * OEM_DPM).coerceAtLeast(1)
        val h = (heightMm * OEM_DPM).coerceAtLeast(1)
        val scaled = if (bitmap.width == w && bitmap.height == h) {
            bitmap
        } else {
            Log.i(TAG, "[PrintPipeline] Fitting ${bitmap.width}x${bitmap.height} → ${w}x${h}px (${widthMm}x${heightMm}mm @ ${OEM_DPM} dpm)")
            containFitToPage(bitmap, w, h)
        }

        val hOffsetPx = (hOffsetMm * OEM_DPM).toInt()
        val vOffsetPx = (vOffsetMm * OEM_DPM).toInt()

        if (hOffsetPx == 0 && vOffsetPx == 0) {
            return scaled
        }

        Log.i(TAG, "[PrintPipeline] Applying physical offsets: hOffset=${hOffsetMm}mm (${hOffsetPx}px), vOffset=${vOffsetMm}mm (${vOffsetPx}px)")
        val target = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(target)
        canvas.drawColor(android.graphics.Color.WHITE)
        canvas.drawBitmap(scaled, hOffsetPx.toFloat(), vOffsetPx.toFloat(), null)
        return target
    }

    private fun containFitToPage(src: Bitmap, pageW: Int, pageH: Int): Bitmap {
        val page = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(page)
        canvas.drawColor(android.graphics.Color.WHITE)
        if (src.width <= 0 || src.height <= 0) return page
        val scale = minOf(pageW.toFloat() / src.width, pageH.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = (pageW - dw) / 2f
        val top = (pageH - dh) / 2f
        val paint = android.graphics.Paint().apply {
            // Nearest-neighbor keeps thin text/barcode edges; bilinear bloomed thermal ink.
            isFilterBitmap = false
            isDither = false
            isAntiAlias = false
        }
        canvas.drawBitmap(src, null, android.graphics.RectF(left, top, left + dw, top + dh), paint)
        return page
    }

    companion object {
        private const val TAG = "TezPrintPipeline"
        private const val OEM_DPM = 8
    }
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/ConnectionGuard.kt` (105 lines)

```kotlin
package expo.modules.tezprinter

import android.util.Log
import com.print.base.bean.DeviceItem
import com.print.base.listen.ConnectListener
import com.print.printer.Printer
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference

/**
 * ConnectionGuard tracks printer connection state and queues operations until ready.
 * Implements Section 3.1 of the Tez/Shakti Implementation Guide.
 *
 * NOTE: The SDK interface uses typos (`onConneted`, `onConnetFailed`).
 * These match the OEM Flashlabel library byte-for-byte.
 */
class ConnectionGuard : ConnectListener {
    enum class State {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        FAILED
    }

    private val stateRef = AtomicReference(State.DISCONNECTED)
    private val onReadyQueue = CopyOnWriteArrayList<Runnable>()
    private var stateChangeListener: ((State, String?) -> Unit)? = null

    val state: State
        get() = stateRef.get()

    val isReady: Boolean
        get() = stateRef.get() == State.CONNECTED

    fun setStateChangeListener(listener: ((State, String?) -> Unit)?) {
        this.stateChangeListener = listener
    }

    fun arm(printer: Printer, device: DeviceItem) {
        stateRef.set(State.CONNECTING)
        stateChangeListener?.invoke(State.CONNECTING, null)
        Log.i(TAG, "[ConnectionGuard] Arming SPP connect to ${device.name ?: "Unknown"} (${device.address}) modelKey=${device.modelKey}")
        printer.setListener(this)
    }

    fun connect(printer: Printer, device: DeviceItem) {
        arm(printer, device)
        printer.connect(device)
    }

    override fun onConneted() {
        Log.i(TAG, "[ConnectionGuard] onConneted: Printer confirmed connected")
        stateRef.set(State.CONNECTED)
        stateChangeListener?.invoke(State.CONNECTED, null)
        drainReadyQueue()
    }

    override fun onConnetFailed(msg: String?) {
        val errorMsg = msg ?: "Connection failed"
        Log.w(TAG, "[ConnectionGuard] onConnetFailed: $errorMsg")
        stateRef.set(State.FAILED)
        stateChangeListener?.invoke(State.FAILED, errorMsg)
        clearReadyQueue()
    }

    override fun closed() {
        Log.i(TAG, "[ConnectionGuard] closed: Connection closed/dropped")
        stateRef.set(State.DISCONNECTED)
        stateChangeListener?.invoke(State.DISCONNECTED, null)
        clearReadyQueue()
    }

    fun runWhenReady(task: Runnable) {
        if (isReady) {
            task.run()
        } else {
            onReadyQueue.add(task)
        }
    }

    fun reset() {
        stateRef.set(State.DISCONNECTED)
        clearReadyQueue()
    }

    private fun drainReadyQueue() {
        val tasks = ArrayList(onReadyQueue)
        onReadyQueue.clear()
        for (task in tasks) {
            try {
                task.run()
            } catch (t: Throwable) {
                Log.e(TAG, "[ConnectionGuard] Error executing queued ready task", t)
            }
        }
    }

    private fun clearReadyQueue() {
        onReadyQueue.clear()
    }

    companion object {
        private const val TAG = "TezConnectionGuard"
    }
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/CalibrationController.kt` (157 lines)

```kotlin
package expo.modules.tezprinter

import android.util.Log
import com.print.base.bean.TaskCallBean
import com.print.printer.Command
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * CalibrationController executes the sensor calibration and paper-length learning sequence.
 * Implements Section 3.4 of the Tez/Shakti Implementation Guide.
 *
 * Sequence:
 *   1. Check get_status() -> ensure idle and no fault conditions
 *   2. set_paperType(paperType)
 *   3. calibration() (sensor light intensity)
 *   4. verifyIdle() loop
 *   5. LEARN_LABEL() (paper-length learning)
 *   6. verifyIdle() loop
 */
class CalibrationController(private val queue: SerialTaskQueue) {
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "TezCalibScheduler").apply { isDaemon = true }
    }

    data class PrinterStatus(
        val bitmask: Int,
        val isIdle: Boolean,
        val isPrinting: Boolean,
        val isCoverOpen: Boolean,
        val isNoPaper: Boolean,
        val isLowBattery: Boolean,
        val isOverheat: Boolean
    ) {
        val errorMessage: String?
            get() = when {
                isCoverOpen -> "Printer cover is open"
                isNoPaper -> "Printer is out of paper"
                isOverheat -> "Printer head is overheating"
                else -> null
            }
    }

    fun parseStatus(bean: TaskCallBean): PrinterStatus {
        val mask = if (bean.data != null && bean.data.isNotEmpty()) {
            bean.data[0].toInt() and 0xFF
        } else {
            0x00
        }
        return PrinterStatus(
            bitmask = mask,
            isIdle = mask == 0x00,
            isPrinting = (mask and 0x01) != 0,
            isCoverOpen = (mask and 0x02) != 0,
            isNoPaper = (mask and 0x04) != 0,
            isLowBattery = (mask and 0x08) != 0,
            isOverheat = (mask and 0x10) != 0
        )
    }

    fun getStatus(): CompletableFuture<PrinterStatus> {
        return queue.submit(Command.get_status(), "get_status", RetryPolicy.standard)
            .thenApply { parseStatus(it) }
    }

    /**
     * Executes the complete calibrateThenLearn sequence for the specified paperType.
     * paperType: 0=GAP, 1=CONTINUOUS, 2=BLACK, 3=TATTOO
     */
    fun calibrateThenLearn(paperType: Int): CompletableFuture<Void> {
        Log.i(TAG, "[Calibration] Initiating calibrateThenLearn for paperType=$paperType")

        // 1. Pre-flight check
        return getStatus()
            .thenCompose { status ->
                status.errorMessage?.let { errorMsg ->
                    Log.e(TAG, "[Calibration] Pre-flight aborted: $errorMsg (bitmask=0x${Integer.toHexString(status.bitmask)})")
                    throw IllegalStateException("Calibration aborted: $errorMsg")
                }
                Log.d(TAG, "[Calibration] Pre-flight OK (idle, cover closed, paper loaded). Setting paperType=$paperType")
                queue.submit(Command.set_paperType(paperType), "set_paperType", RetryPolicy.standard)
            }
            // 2. Sensor light calibration
            .thenCompose {
                Log.d(TAG, "[Calibration] Dispatching Command.calibration()")
                queue.submit(Command.calibration(), "calibration", RetryPolicy.standard)
            }
            // 3. Wait for sensor calibration to complete
            .thenCompose {
                Log.d(TAG, "[Calibration] Waiting for sensor calibration to settle...")
                verifyIdle(maxPolls = 15, pollIntervalMs = 300)
            }
            // 4. Paper-length learning
            .thenCompose {
                Log.d(TAG, "[Calibration] Dispatching Command.LEARN_LABEL()")
                queue.submit(Command.LEARN_LABEL(), "learn_label", RetryPolicy.standard)
            }
            // 5. Wait for label learning to settle
            .thenCompose {
                Log.d(TAG, "[Calibration] Waiting for label learn to settle...")
                verifyIdle(maxPolls = 20, pollIntervalMs = 300)
            }
            .thenApply {
                Log.i(TAG, "[Calibration] Calibration & label learning completed successfully for paperType=$paperType")
                null
            }
    }

    private fun verifyIdle(maxPolls: Int, pollIntervalMs: Long): CompletableFuture<PrinterStatus> {
        val future = CompletableFuture<PrinterStatus>()
        pollStatusRecursive(future, 0, maxPolls, pollIntervalMs)
        return future
    }

    private fun pollStatusRecursive(
        future: CompletableFuture<PrinterStatus>,
        pollCount: Int,
        maxPolls: Int,
        pollIntervalMs: Long
    ) {
        getStatus().whenComplete { status, error ->
            if (error != null) {
                if (pollCount + 1 < maxPolls) {
                    scheduler.schedule({
                        pollStatusRecursive(future, pollCount + 1, maxPolls, pollIntervalMs)
                    }, pollIntervalMs, TimeUnit.MILLISECONDS)
                } else {
                    future.completeExceptionally(error)
                }
                return@whenComplete
            }

            status.errorMessage?.let { errorMsg ->
                future.completeExceptionally(IllegalStateException("Fault detected during calibration: $errorMsg"))
                return@whenComplete
            }

            if (status.isIdle) {
                future.complete(status)
            } else if (pollCount + 1 < maxPolls) {
                scheduler.schedule({
                    pollStatusRecursive(future, pollCount + 1, maxPolls, pollIntervalMs)
                }, pollIntervalMs, TimeUnit.MILLISECONDS)
            } else {
                // Settle timeout reached, but proceed if not in hard fault
                Log.w(TAG, "[Calibration] Settle poll limit reached without exact 0x00 idle (status=0x${Integer.toHexString(status.bitmask)})")
                future.complete(status)
            }
        }
    }

    companion object {
        private const val TAG = "TezCalibration"
    }
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/SerialTaskQueue.kt` (133 lines)

```kotlin
package expo.modules.tezprinter

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.print.base.bean.PrinterConstantPool
import com.print.base.bean.TaskCallBean
import com.print.base.listen.TaskCallback
import com.print.printer.Command
import com.print.printer.Printer
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class PrinterCommandException(
    val tag: String,
    val status: Int,
    message: String = "Printer command '$tag' failed with status $status"
) : Exception(message)

/**
 * SerialTaskQueue serializes all addTask() commands to the OEM PrintSDK,
 * preventing byte stream interleaving and implementing automatic retries with backoff.
 * Implements Section 3.2 of the Tez/Shakti Implementation Guide.
 */
class SerialTaskQueue(private val printerProvider: () -> Printer?) {
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "TezSerialTaskQueue").apply { isDaemon = true }
    }
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "TezTaskScheduler").apply { isDaemon = true }
    }

    fun submit(command: Command, tag: String, retry: RetryPolicy = RetryPolicy.standard): CompletableFuture<TaskCallBean> {
        val future = CompletableFuture<TaskCallBean>()
        executor.submit {
            dispatchWithRetry(command, tag, retry, future, 0)
        }
        return future
    }

    fun submitRaw(task: Runnable): CompletableFuture<Void> {
        val future = CompletableFuture<Void>()
        executor.submit {
            try {
                task.run()
                future.complete(null)
            } catch (t: Throwable) {
                future.completeExceptionally(t)
            }
        }
        return future
    }

    private fun dispatchWithRetry(
        command: Command,
        tag: String,
        retry: RetryPolicy,
        future: CompletableFuture<TaskCallBean>,
        attempt: Int
    ) {
        val printer = printerProvider()
        if (printer == null) {
            future.completeExceptionally(IllegalStateException("Printer handle is null"))
            return
        }

        if (!printer.isConnect) {
            future.completeExceptionally(IllegalStateException("Printer is not connected (tag=$tag)"))
            return
        }

        Log.d(TAG, "[SerialTaskQueue] Dispatching task '$tag' (attempt ${attempt + 1}/${retry.maxAttempts})")

        printer.addTask(command, tag, true, object : TaskCallback() {
            override fun sendStatus(status: TaskCallBean?) {
                Log.d(TAG, "[SerialTaskQueue] sendStatus ACK for '$tag': ${status?.msg}")
            }

            override fun readCall(result: TaskCallBean?) {
                if (result == null) {
                    handleFailure(command, tag, retry, future, attempt, -1, "Null TaskCallBean response")
                    return
                }

                Log.d(TAG, "[SerialTaskQueue] readCall for '$tag': status=${result.status}, msg=${result.msg}")

                if (result.status == PrinterConstantPool.Status.OK) {
                    future.complete(result)
                } else if (result.status == PrinterConstantPool.Status.FAIL ||
                           result.status == PrinterConstantPool.Status.TIMEOUT) {
                    handleFailure(command, tag, retry, future, attempt, result.status, result.msg ?: "Command returned status ${result.status}")
                } else {
                    // Status 0 (DEFAULT) or unexpected
                    future.complete(result)
                }
            }
        })
    }

    private fun handleFailure(
        command: Command,
        tag: String,
        retry: RetryPolicy,
        future: CompletableFuture<TaskCallBean>,
        attempt: Int,
        status: Int,
        message: String
    ) {
        if (attempt + 1 < retry.maxAttempts) {
            val delayMs = retry.backoffMillis(attempt)
            Log.w(TAG, "[SerialTaskQueue] Task '$tag' failed (status=$status). Retrying in ${delayMs}ms (attempt ${attempt + 2}/${retry.maxAttempts})")
            scheduler.schedule({
                executor.submit {
                    dispatchWithRetry(command, tag, retry, future, attempt + 1)
                }
            }, delayMs, TimeUnit.MILLISECONDS)
        } else {
            Log.e(TAG, "[SerialTaskQueue] Task '$tag' failed permanently after ${attempt + 1} attempts (status=$status): $message")
            future.completeExceptionally(PrinterCommandException(tag, status, message))
        }
    }

    fun shutdown() {
        executor.shutdownNow()
        scheduler.shutdownNow()
    }

    companion object {
        private const val TAG = "TezTaskQueue"
    }
}
```

#### `modules/tez-printer/android/src/main/java/expo/modules/tezprinter/RetryPolicy.kt` (21 lines)

```kotlin
package expo.modules.tezprinter

/**
 * Exponential backoff retry policy for Flashlabel OEM printer commands.
 * Matches Section 3.3 of the implementation guide.
 */
class RetryPolicy(
    val maxAttempts: Int = 3,
    val baseDelayMs: Long = 300L
) {
    fun backoffMillis(attempt: Int): Long {
        val shift = if (attempt >= 30) 30 else attempt
        return baseDelayMs * (1L shl shift)
    }

    companion object {
        val standard = RetryPolicy(maxAttempts = 3, baseDelayMs = 300L)
        val fast = RetryPolicy(maxAttempts = 2, baseDelayMs = 150L)
        val single = RetryPolicy(maxAttempts = 1, baseDelayMs = 0L)
    }
}
```

### 4. TD-404 — Ninestar labelprinter | SEZNIK TEJAS / RUDRA

#### `modules/td404-printer/expo-module.config.json` (6 lines)

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.td404printer.Td404PrinterModule"]
  }
}
```

#### `modules/td404-printer/src/index.ts` (288 lines)

```ts
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type Td404Device = {
  id: string;
  name: string | null;
  rawName?: string | null;
  bonded?: boolean;
  transport?: 'bluetooth-spp';
  sdkId?: 'td404';
  likelyTd404?: boolean;
};

export type Td404PngLabelResult = {
  bytesSent: number;
  jobBytes?: number;
  copies?: number;
  decodeMs?: number;
  encodeMs?: number;
  writeMs?: number;
  path?: string;
};

type NativeTd404 = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  getBondedDevices(): Promise<Td404Device[]>;
  startScan(): Promise<{ discoveryStarted?: boolean; bondedCount?: number; reason?: string } | void>;
  stopScan(): Promise<void>;
  connect(
    macAddress: string,
    name: string | null,
  ): Promise<{ id: string; name: string | null; transport: string; sdkId: string }>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectedDevice(): Td404Device | null;
  printBase64(base64: string): Promise<{ bytesSent: number }>;
  printRaw?(bytes: Uint8Array): Promise<{ bytesSent: number }>;
  printPngLabel?(options: Record<string, unknown>): Promise<Td404PngLabelResult>;
  renderPdfPages?(
    uri: string,
    options?: Record<string, unknown>,
  ): Promise<RenderPdfResult>;
  addListener(
    eventName: string,
    listener: (event: Td404Device | Record<string, unknown>) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeTd404 | null | undefined;

function getNative(): NativeTd404 | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeTd404>('Td404Printer');
  } catch {
    cached = null;
  }
  return cached;
}

export function isTd404NativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

/** Adapter power only. Returns null when the helper is missing (older APK). */
export function isTd404BluetoothEnabled(): boolean | null {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return null;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return null;
  }
}

export async function getTd404BondedDevices(): Promise<Td404Device[]> {
  const mod = getNative();
  if (!mod) return [];
  try {
    return (await mod.getBondedDevices()) ?? [];
  } catch {
    return [];
  }
}

export function startTd404Scan(
  onDevice: (device: Td404Device) => void,
  onFinished?: (error?: Error) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'TD-404 Bluetooth module requires a development build (`npx expo run:android`). Not available in Expo Go.',
    );
  }

  const foundSub = mod.addListener('onDeviceFound', (payload) => {
    onDevice(payload as Td404Device);
  });
  const finishSub = onFinished
    ? mod.addListener('onScanFinished', () => onFinished())
    : null;

  void mod
    .startScan()
    .then((result) => {
      if (result && result.discoveryStarted === false) {
        onFinished?.();
      }
    })
    .catch((error) => {
      foundSub.remove();
      finishSub?.remove();
      const err = error instanceof Error ? error : new Error(String(error));
      onFinished?.(err);
    });

  return {
    stop: async () => {
      foundSub.remove();
      finishSub?.remove();
      await mod.stopScan().catch(() => {});
    },
  };
}

export async function connectTd404(macAddress: string, name: string | null) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  await mod.stopScan().catch(() => {});
  return mod.connect(macAddress, name);
}

export async function disconnectTd404() {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export function isTd404Connected(): boolean {
  const mod = getNative();
  return Boolean(mod?.isConnected());
}

export async function printTd404Base64(base64: string) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  return mod.printBase64(base64);
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function safeBytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  if (len === 0) return '';
  const parts: string[] = [];
  const CHUNK_SIZE = 16384;
  let buf = '';
  const mainLen = len - (len % 3);
  for (let i = 0; i < mainLen; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    buf +=
      B64_CHARS[(chunk >> 18) & 63] +
      B64_CHARS[(chunk >> 12) & 63] +
      B64_CHARS[(chunk >> 6) & 63] +
      B64_CHARS[chunk & 63];
    if (buf.length >= CHUNK_SIZE) {
      parts.push(buf);
      buf = '';
    }
  }
  const remaining = len - mainLen;
  if (remaining === 1) {
    const chunk = bytes[mainLen];
    buf += B64_CHARS[chunk >> 2] + B64_CHARS[(chunk & 3) << 4] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[mainLen] << 8) | bytes[mainLen + 1];
    buf +=
      B64_CHARS[chunk >> 10] +
      B64_CHARS[(chunk >> 4) & 63] +
      B64_CHARS[(chunk & 15) << 2] +
      '=';
  }
  if (buf.length > 0) parts.push(buf);
  return parts.join('');
}

export async function printTd404Raw(bytes: Uint8Array) {
  const mod = getNative();
  if (!mod) throw new Error('TD-404 Bluetooth module is not available.');
  if (typeof mod.printRaw === 'function') {
    try {
      return await mod.printRaw(bytes);
    } catch {
      // If native printRaw fails or is not supported, fall back to safe base64
    }
  }
  return mod.printBase64(safeBytesToBase64(bytes));
}

export type Td404PngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  density?: number | null;
  speed?: number | null;
  xDots?: number;
  yDots?: number;
  copies?: number;
  media?: 'gap' | 'bline' | 'continuous';
  orientation?: number;
  dpi?: number;
  /** TSPL DIRECTION: 1 (default, matches JS pipeline / preview) or 0. */
  direction?: 0 | 1;
  /** Luminance cutoff (0–255) for black ink. Default 160 keeps thin text and barcodes solid. */
  threshold?: number;
  /** Whether to use Floyd-Steinberg error diffusion dithering for photos / halftones. */
  dither?: boolean;
};

/**
 * Native SDK fast path: PNG → LabelCommand → SPP write (no JS rasterize).
 * Returns null when the native module / method is unavailable.
 */
export async function printTd404PngLabel(
  options: Td404PngLabelOptions,
): Promise<Td404PngLabelResult | null> {
  const mod = getNative();
  if (!mod || typeof mod.printPngLabel !== 'function') return null;
  if (!mod.isConnected()) {
    throw new Error('No TD-404 printer connected.');
  }
  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    gapMm: options.gapMm ?? 2,
    density: options.density ?? 10,
    speed: options.speed ?? 3,
    xDots: options.xDots ?? 0,
    yDots: options.yDots ?? 0,
    copies: options.copies ?? 1,
    media: options.media ?? 'gap',
    orientation: options.orientation ?? 0,
    dpi: options.dpi ?? 304,
    direction: options.direction ?? 1,
    threshold: options.threshold ?? 160,
    dither: options.dither ?? false,
  });
}

export type RenderedPdfPage = {
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  base64: string;
};

export type RenderPdfResult = {
  pageCount: number;
  pages: RenderedPdfPage[];
};

/**
 * Native Android hardware-accelerated PDF renderer.
 * Converts any PDF URI into rendered page Bitmaps/PNGs at target DPI.
 */
export async function renderPdfPages(
  uriString: string,
  options?: { dpi?: number; maxPages?: number },
): Promise<RenderPdfResult | null> {
  const mod = getNative();
  if (!mod || typeof mod.renderPdfPages !== 'function') return null;
  return mod.renderPdfPages(uriString, options as Record<string, unknown> | undefined);
}
```

#### `modules/td404-printer/android/src/main/java/expo/modules/td404printer/Td404PrinterModule.kt` (922 lines)

```kotlin
package expo.modules.td404printer

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.content.ContextCompat
import com.ninestar.printer.command.LabelCommand
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.Vector
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * TD-404 / Ninestar classic Bluetooth (SPP) bridge.
 * Lists bonded (paired) devices + nearby discovery, then connects via SPP
 * (same profile as SppBluetoothPort in labelprinter.aar).
 */
class Td404PrinterModule : Module() {
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  private val ioExecutor = Executors.newCachedThreadPool()
  private val connectTimeoutMs = 8_000L
  private val printChunk = 32 * 1024
  private var socket: BluetoothSocket? = null
  private var connectedMac: String? = null
  private var connectedName: String? = null
  private var receiverRegistered = false

  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          if (device != null) {
            emitDevice(device, bonded = false)
          }
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
          sendEvent("onScanFinished", emptyMap<String, Any?>())
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Td404Printer")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged")

    OnCreate {
      ensureReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      closeSocket()
    }

    Function("isAvailable") {
      getAdapter() != null
    }

    /** Adapter power only — does not start scan, discovery, or connect. */
    Function("isBluetoothEnabled") {
      val adapter = getAdapter()
      adapter != null && adapter.isEnabled
    }

    /** Always-available paired list (even when not discoverable / already connected in system BT). */
    AsyncFunction("getBondedDevices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      // Bonded list only needs BLUETOOTH_CONNECT (not SCAN / location).
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          val list = bonded.map { deviceToMap(it, bonded = true) }
          promise.resolve(list)
        } catch (e: Exception) {
          promise.reject("BONDED_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      // Prefer full scan perms; fall back to bonded-only if SCAN is missing.
      val canDiscover = hasPermissions(context)
      if (!hasConnectPermission(context)) {
        promise.reject(
          "PERMISSION",
          "Bluetooth permissions are required to scan for TD-404 printers.",
          null,
        )
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found on this device.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        // Resolve (do not reject) so JS `void startScan()` cannot surface LogBox.
        sendEvent("onScanFinished", emptyMap<String, Any?>())
        promise.resolve(
          mapOf(
            "discoveryStarted" to false,
            "bondedCount" to 0,
            "reason" to "BT_OFF",
          ),
        )
        return@AsyncFunction
      }

      ensureReceiver()

      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) adapter.cancelDiscovery()

          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          for (device in bonded) {
            emitDevice(device, bonded = true)
          }

          if (!canDiscover) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }

          @SuppressLint("MissingPermission")
          val started = adapter.startDiscovery()
          if (!started) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }
          promise.resolve(mapOf("discoveryStarted" to true, "bondedCount" to bonded.size))
        } catch (e: Exception) {
          promise.reject("SCAN_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      ioExecutor.execute {
        try {
          getAdapter()?.let { adapter ->
            @SuppressLint("MissingPermission")
            if (adapter.isDiscovering) adapter.cancelDiscovery()
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        promise.reject("BT_OFF", "Bluetooth is turned off. Enable Bluetooth and try again.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          closeSocket()
          try { Thread.sleep(100) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }

          val device = adapter.getRemoteDevice(macAddress.uppercase())
          val sock = openSppSocket(device)
          socket = sock
          connectedMac = device.address
          @SuppressLint("MissingPermission")
          val resolvedName = name ?: device.name ?: device.address
          connectedName = resolvedName
          sendEvent(
            "onConnectionChanged",
            mapOf(
              "connected" to true,
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
          promise.resolve(
            mapOf(
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
        } catch (e: Exception) {
          closeSocket()
          promise.reject("CONNECT_FAILED", e.message ?: "Failed to connect to TD-404 printer.", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.resolve(null)
      }
    }

    Function("isConnected") {
      isSocketAlive()
    }

    Function("getConnectedDevice") {
      if (isSocketAlive() && connectedMac != null) {
        mapOf(
          "id" to connectedMac,
          "name" to connectedName,
          "transport" to "bluetooth-spp",
          "sdkId" to "td404",
        )
      } else {
        null
      }
    }

    /** Lightweight health check: verifies the socket and output stream are still viable. */
    Function("isSocketAlive") {
      isSocketAlive()
    }

    /** Returns connection diagnostics for the debug screen. */
    Function("getConnectionInfo") {
      mapOf(
        "connected" to isSocketAlive(),
        "mac" to connectedMac,
        "name" to connectedName,
        "transport" to "bluetooth-spp",
        "sdkId" to "td404",
        "socketClass" to (socket?.javaClass?.simpleName ?: "none"),
      )
    }

    AsyncFunction("printBase64") { base64: String, promise: Promise ->
      try {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        writeBytesToSocket(bytes, promise)
      } catch (e: Exception) {
        promise.reject("DECODE_FAILED", e.message, e)
      }
    }

    AsyncFunction("printRaw") { bytes: ByteArray, promise: Promise ->
      writeBytesToSocket(bytes, promise)
    }

    /**
     * Fast SDK-style print: PNG → LabelCommand (native) → SPP write without waiting
     * for printer ACK. Skips the slow JS PNG→gray→1-bit→TSPL path.
     *
     * Mirrors Ninestar demo: LabelCommand.addSize/addGap/addBitmap/addPrint then
     * writeDataImmediately(..., isReadReceive=false).
     */
    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val sock = socket
      if (sock == null || !sock.isConnected) {
        promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val result = printPngLabelNative(options)
          promise.resolve(result)
        } catch (e: Exception) {
          android.util.Log.e("Td404Printer", "printPngLabel failed: ${e.message}", e)
          if (e is IOException) {
            closeSocket()
            sendEvent(
              "onConnectionChanged",
              mapOf("connected" to false, "sdkId" to "td404"),
            )
          }
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Native Android hardware-accelerated PDF renderer.
     * Converts any PDF URI (content:// or file://) into page Bitmaps/PNGs at target DPI.
     */
    AsyncFunction("renderPdfPages") { uriString: String, options: Map<String, Any?>?, promise: Promise ->
      ioExecutor.execute {
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var tempFile: File? = null
        try {
          val context = appContext.reactContext ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val targetDpi = (options?.get("dpi") as? Number)?.toDouble() ?: 203.0
          val maxPages = (options?.get("maxPages") as? Number)?.toInt() ?: 100

          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_render_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output ->
                input.copyTo(output)
              }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            val path = if (uri.scheme == "file") uri.path ?: uriString else uriString
            File(path)
          }

          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          renderer = PdfRenderer(pfd)
          val totalPages = renderer.pageCount
          val renderCount = minOf(totalPages, maxPages)
          val pagesList = mutableListOf<Map<String, Any?>>()
          val scale = targetDpi / 72.0

          for (i in 0 until renderCount) {
            val page = renderer.openPage(i)
            val w = Math.max(1, Math.round(page.width * scale).toInt())
            val h = Math.max(1, Math.round(page.height * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()

            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
            val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
            bitmap.recycle()

            pagesList.add(
              mapOf(
                "pageIndex" to i,
                "widthPx" to w,
                "heightPx" to h,
                "widthMm" to (page.width * 25.4 / 72.0),
                "heightMm" to (page.height * 25.4 / 72.0),
                "base64" to base64,
              )
            )
          }

          promise.resolve(
            mapOf(
              "pageCount" to totalPages,
              "pages" to pagesList,
            )
          )
        } catch (e: Exception) {
          android.util.Log.e("Td404Printer", "renderPdfPages failed: ${e.message}", e)
          promise.reject("PDF_RENDER_FAILED", e.message, e)
        } finally {
          try { renderer?.close() } catch (_: Exception) {}
          try { pfd?.close() } catch (_: Exception) {}
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }
  }

  private fun writeBytesToSocket(bytes: ByteArray, promise: Promise) {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
      return
    }
    ioExecutor.execute {
      try {
        val written = writeBytesToSocketSync(bytes)
        promise.resolve(mapOf("bytesSent" to written))
      } catch (e: IOException) {
        android.util.Log.e("Td404Printer", "SPP write failed, closing dead socket: ${e.message}")
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.reject("PRINT_FAILED", e.message, e)
      }
    }
  }

  /** Fire-and-forget SPP stream with pacing for large payloads to prevent UART buffer overrun. */
  private fun writeBytesToSocketSync(bytes: ByteArray): Int {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      throw IOException("No TD-404 printer connected.")
    }
    val rawOut = sock.outputStream ?: throw IOException("Printer output stream unavailable.")
    val startMs = System.currentTimeMillis()

    // Fast path: small payloads (test prints, small labels <= 32KB) fit in printer RAM.
    // Stream directly with zero delay.
    if (bytes.size <= 32 * 1024) {
      rawOut.write(bytes)
      rawOut.flush()
      val totalMs = System.currentTimeMillis() - startMs
      android.util.Log.i("Td404Printer", "SPP fast write ${bytes.size} bytes in ${totalMs}ms")
      return bytes.size
    }

    // Paced path for large payloads (4x6 labels, 100KB–300KB):
    // Write in 4096-byte chunks with a micro-pause (3ms).
    // This allows the printer's 115200-baud UART buffer to drain smoothly without
    // overflowing its hardware FIFO, preventing the printer Bluetooth chip from crashing or resetting.
    val chunkSize = 4096
    var offset = 0
    while (offset < bytes.size) {
      val count = minOf(chunkSize, bytes.size - offset)
      rawOut.write(bytes, offset, count)
      rawOut.flush()
      offset += count
      if (offset < bytes.size) {
        try {
          Thread.sleep(3) // 3ms breather between 4KB packets prevents UART RX overrun
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    val totalMs = System.currentTimeMillis() - startMs
    android.util.Log.i("Td404Printer", "SPP paced write ${bytes.size} bytes in ${totalMs}ms (stable)")
    return bytes.size
  }

  /**
   * Build a TSPL job with Ninestar LabelCommand (native bitmap packing) and
   * stream it over the open SPP socket. Matches vendor demo PrintContent.getLabel.
   */
  private fun printPngLabelNative(options: Map<String, Any?>): Map<String, Any?> {
    val pngBase64 = options["pngBase64"] as? String
      ?: throw IllegalArgumentException("pngBase64 is required")
    val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
    val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
    val gapMm = (options["gapMm"] as? Number)?.toDouble() ?: 2.0
    val density = (options["density"] as? Number)?.toInt() ?: 10
    val speed = (options["speed"] as? Number)?.toInt() ?: 3
    val threshold = (options["threshold"] as? Number)?.toInt() ?: 160
    val xDots = (options["xDots"] as? Number)?.toInt() ?: 0
    val yDots = (options["yDots"] as? Number)?.toInt() ?: 0
    val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
    val media = (options["media"] as? String) ?: "gap"
    val orientation = (options["orientation"] as? Number)?.toInt() ?: 0
    val dpi = (options["dpi"] as? Number)?.toDouble() ?: 304.0
    // DIRECTION 1 matches the JS TSPL pipeline default. DIRECTION 0 mirrors the
    // bitmap along the feed axis, causing apparent zoom/offset vs the on-screen preview.
    val direction = (options["direction"] as? Number)?.toInt() ?: 1

    val t0 = System.currentTimeMillis()
    val raw = android.util.Base64.decode(pngBase64, android.util.Base64.DEFAULT)
    var bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.size)
      ?: throw IllegalArgumentException("Could not decode PNG for print.")
    val tDecode = System.currentTimeMillis()

    val deg = ((orientation % 360) + 360) % 360
    if (deg == 90 || deg == 180 || deg == 270) {
      val matrix = Matrix().apply { postRotate(deg.toFloat()) }
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated !== bitmap) {
        bitmap.recycle()
        bitmap = rotated
      }
    }
    val tRotate = System.currentTimeMillis()

    // 304 DPI heads are 12 dots/mm. 54 mm × 12 = 648 (byte-aligned). Using
    // dpi/25.4 (54 × 304/25.4 = 646) then packing up to 648 clips after SIZE.
    val dpm = if (dpi == 304.0) 12.0 else if (dpi == 203.0) 8.0 else dpi / 25.4
    val sizeDotsW = Math.max(1, Math.round(widthMm * dpm).toInt())
    val sizeDotsH = Math.max(1, Math.round(heightMm * dpm).toInt())
    // TSPL BITMAP is bytes×8. Never pack UP past SIZE-in-dots.
    val packedW = Math.max(8, (sizeDotsW / 8) * 8)
    val packedH = sizeDotsH
    // If incoming capture is density-inflated (e.g. ViewShot rendered at screen
    // density 2.625x / 3x) or differently sized, scale to target packed dots
    // rather than blindly cropping. If difference is within 8 dots, it is just byte-alignment;
    // preserve exact pixels to prevent bilinear blur on crisp lines and dithers.
    val srcW = bitmap.width
    val srcH = bitmap.height
    if (srcW != packedW || srcH != packedH) {
      val diffW = Math.abs(srcW - packedW)
      val diffH = Math.abs(srcH - packedH)
      if (diffW > 8 || diffH > 8) {
        android.util.Log.w(
          "Td404Printer",
          "PRINT-TRACE BITMAP_FIT src=${srcW}x${srcH} packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} (scaling to packed dots)",
        )
        val scaled = Bitmap.createScaledBitmap(bitmap, packedW, packedH, true)
        if (scaled !== bitmap) {
          bitmap.recycle()
          bitmap = scaled
        }
      }
    }

    val sizeCmd = "SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm\r\n"

    // TSPL BITMAP x,y must be >= 0. Bake any negative (or mixed) offset into pixels.
    var bitmapX = xDots
    var bitmapY = yDots
    if (xDots < 0 || yDots < 0) {
      val shifted = Bitmap.createBitmap(packedW, packedH, Bitmap.Config.ARGB_8888)
      shifted.eraseColor(Color.WHITE)
      Canvas(shifted).drawBitmap(bitmap, xDots.toFloat(), yDots.toFloat(), null)
      if (shifted !== bitmap) {
        bitmap.recycle()
        bitmap = shifted
      }
      bitmapX = 0
      bitmapY = 0
      android.util.Log.i(
        "Td404Printer",
        "PRINT-TRACE OFFSET_BAKED raw=${xDots},${yDots} → BITMAP 0,0",
      )
    }

    val dither = (options["dither"] as? Boolean) ?: false
    val contentW = minOf(bitmap.width, packedW)
    val contentH = minOf(bitmap.height, packedH)
    val bytesPerRow = packedW / 8
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    val rawBmp = ByteArray(bytesPerRow * contentH)

    // Pre-fill white (bit 1 set) so unused trailing bits stay blank
    java.util.Arrays.fill(rawBmp, 0xFF.toByte())

    if (!dither) {
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val pixRowOffset = y * bitmap.width
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          val lum = (77 * r + 150 * g + 29 * b) shr 8
          if (lum < threshold) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
        }
      }
    } else {
      // Native Floyd-Steinberg error diffusion for photo & halftone print quality
      val work = IntArray(contentW * contentH)
      for (y in 0 until contentH) {
        val pixRowOffset = y * bitmap.width
        val workRowOffset = y * contentW
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          work[workRowOffset + x] = (77 * r + 150 * g + 29 * b) shr 8
        }
      }
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val workRowOffset = y * contentW
        val hasNextRow = y + 1 < contentH
        val nextWorkRowOffset = workRowOffset + contentW
        for (x in 0 until contentW) {
          val idx = workRowOffset + x
          val oldLum = work[idx]
          val black = oldLum < threshold
          if (black) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
          val error = if (black) oldLum else (oldLum - 255)
          if (error != 0) {
            if (x + 1 < contentW) {
              work[idx + 1] += (error * 7) shr 4
            }
            if (hasNextRow) {
              if (x > 0) {
                work[nextWorkRowOffset + x - 1] += (error * 3) shr 4
              }
              work[nextWorkRowOffset + x] += (error * 5) shr 4
              if (x + 1 < contentW) {
                work[nextWorkRowOffset + x + 1] += error shr 4
              }
            }
          }
        }
      }
    }

    val gapCmd = when (media) {
      "bline" -> "BLINE ${formatGap(gapMm)} mm,0 mm\r\n"
      "continuous" -> "GAP 0.00 mm,0 mm\r\n"
      else -> "GAP ${formatGap(gapMm)} mm,0 mm\r\n"
    }

    val header = "\r\n" +
      sizeCmd +
      gapCmd +
      "SPEED $speed\r\n" +
      "DENSITY $density\r\n" +
      "DIRECTION $direction\r\n" +
      "SET TEAR ON\r\n" +
      "OFFSET 0 mm\r\n" +
      "REFERENCE 0,0\r\n" +
      "CLS\r\n" +
      "BITMAP $bitmapX,$bitmapY,$bytesPerRow,$contentH,0,"
    val footer = "\r\nPRINT 1\r\n"

    val headerBytes = header.toByteArray(Charsets.US_ASCII)
    val footerBytes = footer.toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)
    val tEncode = System.currentTimeMillis()

    var totalSent = 0
    for (i in 0 until copies) {
      totalSent += writeBytesToSocketSync(job)
    }
    val tWrite = System.currentTimeMillis()

    android.util.Log.i(
      "Td404Printer",
      "PRINT-TRACE SDK png=${srcW}x${srcH} packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} " +
        "dpm=$dpm dpi=$dpi SIZE=${formatMm(widthMm)}x${formatMm(heightMm)}mm " +
        "BITMAP=${bytesPerRow}x${contentH} DIRECTION=$direction job=${job.size}B copies=$copies " +
        "decode=${tDecode - t0}ms rotate=${tRotate - tDecode}ms encode=${tEncode - tRotate}ms write=${tWrite - tEncode}ms",
    )

    if (!bitmap.isRecycled) bitmap.recycle()

    return mapOf(
      "bytesSent" to totalSent,
      "jobBytes" to job.size,
      "copies" to copies,
      "decodeMs" to (tDecode - t0),
      "encodeMs" to (tEncode - tRotate),
      "writeMs" to (tWrite - tEncode),
      "path" to "labelcommand-sdk",
    )
  }


  private fun formatGap(gapMm: Double): String = formatMm(gapMm)

  private fun formatMm(mm: Double): String {
    val rounded = Math.round(mm * 100.0) / 100.0
    return String.format(java.util.Locale.US, "%.2f", rounded)
  }



  @SuppressLint("MissingPermission")
  private fun openSppSocket(device: BluetoothDevice): BluetoothSocket {
    val isBonded = try {
      device.bondState == BluetoothDevice.BOND_BONDED
    } catch (_: SecurityException) {
      false
    }

    val attempts = if (isBonded) {
      listOf(
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    } else {
      listOf(
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    }

    var lastError: Exception? = null
    for ((name, makeSocket) in attempts) {
      var sock: BluetoothSocket? = null
      try {
        android.util.Log.i("Td404Printer", "Opening SPP socket via $name...")
        sock = makeSocket()
        connectWithTimeout(sock, connectTimeoutMs)
        android.util.Log.i("Td404Printer", "SPP socket connected successfully via $name")
        return sock
      } catch (e: Exception) {
        android.util.Log.w("Td404Printer", "SPP attempt via $name failed: ${e.message}")
        lastError = e
        try {
          sock?.close()
        } catch (_: Exception) {
        }
        try {
          Thread.sleep(200)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    throw lastError ?: IOException("Could not open Bluetooth SPP socket.")
  }

  private fun connectWithTimeout(sock: BluetoothSocket, timeoutMs: Long) {
    val done = CountDownLatch(1)
    var error: Exception? = null
    val worker = Thread({
      try {
        sock.connect()
      } catch (e: Exception) {
        error = e
      } finally {
        done.countDown()
      }
    }, "td404-spp-connect")
    worker.isDaemon = true
    worker.start()
    if (!done.await(timeoutMs, TimeUnit.MILLISECONDS)) {
      try {
        sock.close()
      } catch (_: Exception) {
      }
      throw IOException("Printer did not accept the connection in time. Keep it on and close other phone connections.")
    }
    error?.let { throw it }
  }

  private fun ensureReceiver() {
    if (receiverRegistered) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(discoveryReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterReceiverSafe() {
    if (!receiverRegistered) return
    try {
      appContext.reactContext?.unregisterReceiver(discoveryReceiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  private fun getAdapter(): BluetoothAdapter? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
  }

  private fun hasConnectPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  private fun hasPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
      val connect = hasConnectPermission(context)
      // Location helps classic discovery on some OEMs but must not block bonded listing.
      scan && connect
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  @SuppressLint("MissingPermission")
  private fun deviceToMap(device: BluetoothDevice, bonded: Boolean): Map<String, Any?> {
    val name = try {
      device.name
    } catch (_: SecurityException) {
      null
    }
    val displayName = if (name.isNullOrBlank()) "Bluetooth ${device.address}" else name
    return mapOf(
      "id" to device.address,
      "name" to displayName,
      "rawName" to name,
      "bonded" to bonded,
      "transport" to "bluetooth-spp",
      "sdkId" to "td404",
      "likelyTd404" to (isLikelyTd404(name) || isLikelyTd404(displayName)),
    )
  }

  @SuppressLint("MissingPermission")
  private fun emitDevice(device: BluetoothDevice, bonded: Boolean) {
    sendEvent("onDeviceFound", deviceToMap(device, bonded))
  }

  private fun isLikelyTd404(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    val n = name.lowercase()
    return n.contains("td-404") ||
      n.contains("td404") ||
      n.contains("td 404") ||
      n.contains("ninestar") ||
      n.contains("nsprinter") ||
      n.contains("labelprinter") ||
      n.contains("label printer") ||
      n.contains("tpl") ||
      n.startsWith("btprinter") ||
      n.contains("gp-") ||
      n.contains("printer")
  }

  /**
   * Non-destructive socket health check.
   * Verifies both socket.isConnected and that the outputStream is accessible.
   * On some Android devices, socket.isConnected stays true even after the
   * physical BT link drops — checking outputStream catches those cases.
   */
  private fun isSocketAlive(): Boolean {
    val sock = socket ?: return false
    return try {
      sock.isConnected && sock.outputStream != null
    } catch (_: Exception) {
      false
    }
  }

  private fun closeSocket() {
    try {
      socket?.close()
    } catch (_: Exception) {
    }
    socket = null
    connectedMac = null
    connectedName = null
  }
}
```

### 5. JOSH — DothanTech LPAPI | SEZNIK JOSH

#### `modules/josh-printer/expo-module.config.json` (6 lines)

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.joshprinter.JoshPrinterModule"]
  }
}
```

#### `modules/josh-printer/src/index.ts` (319 lines)

```ts
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type JoshDevice = {
  id: string;
  name: string | null;
  macAddress: string;
  transport: 'josh-lpapi';
  sdkId: 'josh';
  bonded?: boolean;
};

export type JoshPrinterState = {
  state: string;
  isConnected: boolean;
  isPrinting: boolean;
  isDiscovering: boolean;
  printerName: string | null;
  macAddress: string | null;
  lastError: string | null;
  lastConnectedAt: number;
  density: number;
  speed: number;
  gapType: number;
  gapLength: number;
};

export type JoshPrintResult = {
  jobId: string;
  copies: number;
  widthMm: number;
  heightMm: number;
  targetW: number;
  targetH: number;
  density: number;
  speed: number;
  decodeMs: number;
  fitMs: number;
  submitMs: number;
  waitMs: number;
  totalMs: number;
};

export type JoshPngLabelOptions = {
  pngBase64: string;
  widthMm: number;
  heightMm: number;
  dpi?: number;
  copies?: number;
  density?: number;
  speed?: number;
  direction?: number;
  orientation?: number;
  gapType?: number;
  /** Millimetres (fractional allowed); native converts to LPAPI's 0.01 mm unit. */
  gapLength?: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: 'left' | 'center';
};

type NativeJoshPrinter = {
  isAvailable(): boolean;
  isBluetoothEnabled?(): boolean;
  isDeviceNameSupported(name: string | null): boolean;
  startDiscovery(): Promise<{ discoveryStarted?: boolean }>;
  stopDiscovery(): Promise<void>;
  connect(macAddress: string, name: string | null): Promise<JoshDevice>;
  disconnect(): Promise<void>;
  reconnect(): Promise<boolean>;
  getState(): JoshPrinterState;
  isConnected(): boolean;
  configureParams(params: {
    density?: number;
    speed?: number;
    gapType?: number;
    gapLength?: number;
  }): Promise<void>;
  printTestText(text: string): Promise<boolean>;
  printPngLabel(options: Record<string, unknown>): Promise<JoshPrintResult>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): { remove: () => void };
  removeListeners(count: number): void;
};

let cached: NativeJoshPrinter | null | undefined;

function getNative(): NativeJoshPrinter | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch {
    cached = null;
  }
  return cached;
}

export function getJoshNativeDiagnostic(): {
  isLinked: boolean;
  isAvailable: boolean;
  reason?: string;
} {
  if (Platform.OS !== 'android') {
    return { isLinked: false, isAvailable: false, reason: 'JOSH LPAPI is only supported on Android' };
  }
  let mod: NativeJoshPrinter | null = null;
  try {
    mod = requireNativeModule<NativeJoshPrinter>('JoshPrinter');
  } catch (err: any) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: `Native module 'JoshPrinter' is not compiled into the APK running on this device (${err?.message ?? 'not found'}). An APK reinstall is required after adding native modules.`,
    };
  }
  if (!mod) {
    return {
      isLinked: false,
      isAvailable: false,
      reason: "requireNativeModule('JoshPrinter') returned null — native code not present in running APK",
    };
  }
  try {
    const available = Boolean(mod.isAvailable());
    return {
      isLinked: true,
      isAvailable: available,
      reason: available ? undefined : 'Native module is linked, but manager initialization failed',
    };
  } catch (err: any) {
    return { isLinked: true, isAvailable: false, reason: `mod.isAvailable() threw: ${err?.message}` };
  }
}

export function isJoshNativeAvailable(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isAvailable());
  } catch {
    return false;
  }
}

/** Adapter power only. Returns null when the helper is missing (older APK). */
export function isJoshBluetoothEnabled(): boolean | null {
  const mod = getNative();
  if (!mod || typeof mod.isBluetoothEnabled !== 'function') return null;
  try {
    return Boolean(mod.isBluetoothEnabled());
  } catch {
    return null;
  }
}

export function isDeviceNameSupported(name: string | null | undefined): boolean {
  const mod = getNative();
  if (!mod || !name) return false;
  try {
    return Boolean(mod.isDeviceNameSupported(name));
  } catch {
    return false;
  }
}

export function startJoshDiscovery(
  onDevice: (device: JoshDevice) => void,
  onFinished?: (error?: Error) => void,
): { stop: () => Promise<void> } {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'JOSH Bluetooth module requires a development build (`npx expo run:android`). Not available in Expo Go.',
    );
  }

  const foundSub = mod.addListener('onJoshPrinterDiscovered', (payload) => {
    onDevice(payload as JoshDevice);
  });
  const finishSub = onFinished
    ? mod.addListener('onJoshScanFinished', () => onFinished())
    : null;

  void mod
    .startDiscovery()
    .then((result) => {
      if (result && result.discoveryStarted === false) {
        onFinished?.();
      }
    })
    .catch((error) => {
      foundSub.remove();
      finishSub?.remove();
      const err = error instanceof Error ? error : new Error(String(error));
      onFinished?.(err);
    });

  return {
    stop: async () => {
      foundSub.remove();
      finishSub?.remove();
      await mod.stopDiscovery().catch(() => {});
    },
  };
}

export async function connectJosh(
  macAddress: string,
  name: string | null = null,
): Promise<JoshDevice> {
  const mod = getNative();
  if (!mod) throw new Error('JOSH Bluetooth module is not available.');
  await mod.stopDiscovery().catch(() => {});
  return mod.connect(macAddress, name);
}

export async function disconnectJosh(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.disconnect();
}

export async function reconnectJosh(): Promise<boolean> {
  const mod = getNative();
  if (!mod) return false;
  return mod.reconnect();
}

export function isJoshConnected(): boolean {
  const mod = getNative();
  return Boolean(mod?.isConnected());
}

export function getJoshState(): JoshPrinterState | null {
  const mod = getNative();
  if (!mod) return null;
  try {
    return mod.getState();
  } catch {
    return null;
  }
}

export async function configureJoshParams(params: {
  density?: number;
  speed?: number;
  gapType?: number;
  gapLength?: number;
}): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  await mod.configureParams(params);
}

export async function printJoshPngLabel(
  options: JoshPngLabelOptions,
): Promise<JoshPrintResult> {
  const mod = getNative();
  if (!mod || typeof mod.printPngLabel !== 'function') {
    throw new Error('JOSH printPngLabel is not available on this platform.');
  }
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }

  return mod.printPngLabel({
    pngBase64: options.pngBase64,
    widthMm: options.widthMm,
    heightMm: options.heightMm,
    dpi: options.dpi ?? 203,
    copies: options.copies ?? 1,
    density: options.density ?? -1,
    speed: options.speed ?? -1,
    direction: options.direction ?? options.orientation ?? 0,
    gapType: options.gapType ?? 2,
    gapLength: options.gapLength ?? 3,
    hOffsetMm: options.hOffsetMm ?? 0,
    vOffsetMm: options.vOffsetMm ?? 0,
    alignment: options.alignment ?? 'center',
  });
}

export async function printJoshTestText(text?: string): Promise<boolean> {
  const mod = getNative();
  if (!mod || typeof mod.printTestText !== 'function') {
    throw new Error('JOSH printTestText is not available on this platform.');
  }
  if (!mod.isConnected()) {
    throw new Error('No JOSH printer connected.');
  }
  return mod.printTestText(text ?? 'Sez Print JOSH OK');
}

export function addJoshConnectionListener(
  listener: (event: { state: string; isConnected: boolean; printerName?: string; macAddress?: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshConnectionStateChanged', listener);
}

export function addJoshPrintProgressListener(
  listener: (event: { jobId: string; progress: string; [key: string]: any }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshPrintProgress', listener);
}

export function addJoshErrorListener(
  listener: (event: { code: string; message: string }) => void,
): { remove: () => void } {
  const mod = getNative();
  if (!mod) return { remove: () => {} };
  return mod.addListener('onJoshError', listener);
}
```

#### `modules/josh-printer/android/src/main/java/expo/modules/joshprinter/JoshPrinterModule.kt` (383 lines)

```kotlin
package expo.modules.joshprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

/**
 * Expo module bridge for JOSH / DothanTech LPAPI Bluetooth printer.
 */
class JoshPrinterModule : Module() {
  private val ioExecutor = Executors.newCachedThreadPool()
  private var manager: JoshPrinterManager? = null

  private fun getContext(): Context? {
    return appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
  }

  private fun getOrInitManager(): JoshPrinterManager? {
    if (manager != null) return manager
    val context = getContext() ?: return null
    val mgr = JoshPrinterManager(context)
    val ok = mgr.initialize()
    if (!ok) return null

    mgr.listener = object : JoshPrinterManager.EventListener {
      override fun onStateChanged(state: JoshPrinterManager.State, data: Map<String, Any?>) {
        val payload = HashMap(data)
        payload["state"] = state.name
        payload["isConnected"] = mgr.isConnected()
        sendEvent("onJoshConnectionStateChanged", payload)
      }

      override fun onPrinterDiscovered(printer: Map<String, Any?>) {
        sendEvent("onJoshPrinterDiscovered", printer)
      }

      override fun onPrintProgress(jobId: String, progress: String, data: Map<String, Any?>) {
        val payload = HashMap(data)
        payload["jobId"] = jobId
        payload["progress"] = progress
        sendEvent("onJoshPrintProgress", payload)
      }

      override fun onError(code: String, message: String) {
        sendEvent("onJoshError", mapOf("code" to code, "message" to message))
      }
    }

    manager = mgr
    return mgr
  }

  override fun definition() = ModuleDefinition {
    Name("JoshPrinter")

    Events(
      "onJoshPrinterDiscovered",
      "onJoshScanFinished",
      "onJoshConnectionStateChanged",
      "onJoshPrintProgress",
      "onJoshError"
    )

    OnCreate {
      getOrInitManager()
    }

    OnDestroy {
      manager?.destroy()
      manager = null
    }

    Function("isAvailable") {
      val mgr = getOrInitManager()
      val ok = mgr != null
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] isAvailable() called -> $ok")
      ok
    }

    /** Adapter power only — does not start LPAPI discovery or connect. */
    Function("isBluetoothEnabled") {
      val context = getContext() ?: return@Function false
      val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      val adapter = manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
      adapter != null && adapter.isEnabled
    }

    Function("isDeviceNameSupported") { name: String? ->
      val mgr = getOrInitManager()
      val supported = mgr?.isDeviceNameSupported(name) ?: false
      Log.d("JoshPrinter", "[JOSH-NATIVE-BRIDGE] isDeviceNameSupported('$name') -> $supported")
      supported
    }

    AsyncFunction("startDiscovery") { promise: Promise ->
      val context = getContext()
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      if (!hasScanPermissions(context)) {
        promise.reject("PERMISSION", "Bluetooth Scan / Location permissions are required.", null)
        return@AsyncFunction
      }

      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "Failed to initialize JOSH printer manager.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          val started = mgr.startDiscovery()
          promise.resolve(mapOf("discoveryStarted" to started))
        } catch (e: Exception) {
          promise.reject("DISCOVERY_FAILED", e.message ?: "Failed to start discovery", e)
        }
      }
    }

    AsyncFunction("stopDiscovery") { promise: Promise ->
      ioExecutor.execute {
        try {
          manager?.stopDiscovery()
          sendEvent("onJoshScanFinished", emptyMap<String, Any?>())
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message ?: "Failed to stop discovery", e)
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] connect() invoked: mac=$macAddress, name=$name")
      val context = getContext()
      if (context != null && !hasConnectPermission(context)) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Bluetooth Connect permission missing")
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }

      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] JOSH printer manager failed to initialize")
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Delegating connect to JoshPrinterManager...")
          val success = mgr.connect(macAddress, name)
          if (success) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection confirmed! Resolving promise to JS")
            val res = mapOf(
              "id" to macAddress,
              "name" to (name ?: macAddress),
              "macAddress" to macAddress,
              "transport" to "josh-lpapi",
              "sdkId" to "josh"
            )
            promise.resolve(res)
          } else {
            val err = mgr.lastError ?: "Failed to connect to JOSH printer"
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection failed: $err")
            promise.reject("CONNECT_FAILED", err, null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Connection exception", e)
          promise.reject("CONNECT_FAILED", e.message ?: "Connection error", e)
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      ioExecutor.execute {
        try {
          manager?.disconnect()
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("DISCONNECT_FAILED", e.message ?: "Failed to disconnect", e)
        }
      }
    }

    AsyncFunction("reconnect") { promise: Promise ->
      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      ioExecutor.execute {
        try {
          val success = mgr.reconnect()
          promise.resolve(success)
        } catch (e: Exception) {
          promise.reject("RECONNECT_FAILED", e.message ?: "Reconnect failed", e)
        }
      }
    }

    Function("getState") {
      val mgr = getOrInitManager()
      mgr?.getStateSnapshot() ?: emptyMap<String, Any?>()
    }

    Function("isConnected") {
      val mgr = getOrInitManager()
      mgr?.isConnected() ?: false
    }

    AsyncFunction("configureParams") { params: Map<String, Any?>, promise: Promise ->
      val mgr = getOrInitManager()
      if (mgr == null) {
        promise.reject("NO_MANAGER", "JOSH printer manager is not initialized.", null)
        return@AsyncFunction
      }

      try {
        val density = (params["density"] as? Number)?.toInt()
        val speed = (params["speed"] as? Number)?.toInt()
        val gapType = (params["gapType"] as? Number)?.toInt()
        val gapLengthMm = (params["gapLength"] as? Number)?.toDouble()
        mgr.configureParams(density, speed, gapType, gapLengthMm)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("CONFIG_FAILED", e.message ?: "Failed to configure params", e)
      }
    }

    AsyncFunction("printTestText") { text: String?, promise: Promise ->
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText() called with text=\"$text\"")
      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] JOSH printer manager is not initialized")
        promise.reject("NOT_INITIALIZED", "JOSH printer manager is not initialized", null)
        return@AsyncFunction
      }
      if (!mgr.isConnected()) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] Cannot test print: JOSH printer is not connected")
        promise.reject("NOT_CONNECTED", "JOSH printer is not connected", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val success = mgr.printTestText(text ?: "Sez Print JOSH OK")
          if (success) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText completed successfully")
            promise.resolve(true)
          } else {
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText failed")
            promise.reject("PRINT_FAILED", "Test print failed", null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printTestText exception", e)
          promise.reject("PRINT_FAILED", e.message ?: "Test print error", e)
        }
      }
    }

    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 40.0
      val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
      val copies = (options["copies"] as? Number)?.toInt() ?: 1
      Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel() called: ${widthMm}x${heightMm}mm, copies=$copies")

      val mgr = getOrInitManager()
      if (mgr == null) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel: JOSH printer manager is not initialized")
        promise.reject("NOT_INITIALIZED", "JOSH printer manager is not initialized", null)
        return@AsyncFunction
      }
      if (!mgr.isConnected()) {
        Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printPngLabel: JOSH printer is not connected")
        promise.reject("NOT_CONNECTED", "JOSH printer is not connected", null)
        return@AsyncFunction
      }

      val pngBase64 = options["pngBase64"] as? String
      if (pngBase64.isNullOrEmpty()) {
        promise.reject("INVALID_PARAMS", "Missing pngBase64 parameter", null)
        return@AsyncFunction
      }

      val dpi = (options["dpi"] as? Number)?.toDouble() ?: 203.0
      val density = (options["density"] as? Number)?.toInt() ?: -1
      val speed = (options["speed"] as? Number)?.toInt() ?: -1
      val direction = (options["direction"] as? Number)?.toInt()
        ?: (options["orientation"] as? Number)?.toInt()
        ?: 0
      val gapType = (options["gapType"] as? Number)?.toInt() ?: 2
      val gapLengthMm = (options["gapLength"] as? Number)?.toDouble() ?: JoshPrinterManager.LABEL_GAP_MM
      val hOffsetMm = (options["hOffsetMm"] as? Number)?.toDouble() ?: 0.0
      val vOffsetMm = (options["vOffsetMm"] as? Number)?.toDouble() ?: 0.0
      val alignment = (options["alignment"] as? String) ?: "center"

      ioExecutor.execute {
        try {
          val pngBytes = Base64.decode(pngBase64, Base64.DEFAULT)
          Log.i(
            "JoshPrinter",
            "[JOSH-NATIVE-BRIDGE] ${widthMm}x${heightMm}mm dpi=$dpi gapType=$gapType gap=${gapLengthMm}mm offset=${hOffsetMm}x${vOffsetMm} align=$alignment",
          )
          val result = mgr.printBitmap(
            pngBytes = pngBytes,
            widthMm = widthMm,
            heightMm = heightMm,
            dpi = dpi,
            copies = copies,
            paramDensity = density,
            paramSpeed = speed,
            direction = direction,
            paramGapType = gapType,
            paramGapLengthMm = gapLengthMm,
            hOffsetMm = hOffsetMm,
            vOffsetMm = vOffsetMm,
            alignment = alignment,
          )

          if (result != null) {
            Log.i("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap completed successfully")
            promise.resolve(result)
          } else {
            val err = mgr.lastError ?: "Print failed"
            Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap failed: $err")
            promise.reject("PRINT_FAILED", err, null)
          }
        } catch (e: Exception) {
          Log.e("JoshPrinter", "[JOSH-NATIVE-BRIDGE] printBitmap exception", e)
          promise.reject("PRINT_ERROR", e.message ?: "Failed to print label", e)
        }
      }
    }
  }

  private fun hasConnectPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_CONNECT
      ) == PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  private fun hasScanPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_SCAN
      ) == PackageManager.PERMISSION_GRANTED &&
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_CONNECT
      ) == PackageManager.PERMISSION_GRANTED
    } else {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
    }
  }
}
```

#### `modules/josh-printer/android/src/main/java/expo/modules/joshprinter/JoshPrinterManager.kt` (1373 lines)

```kotlin
package expo.modules.joshprinter

import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.dothantech.lpapi.LPAPI
import com.dothantech.printer.IDzPrinter
import com.dothantech.printer.IDzPrinter.AddressType
import com.dothantech.printer.IDzPrinter.PrintParamName
import com.dothantech.printer.IDzPrinter.PrintProgress
import com.dothantech.printer.IDzPrinter.PrinterAddress
import com.dothantech.printer.IDzPrinter.PrinterState
import com.dothantech.printer.IDzPrinter.ProgressInfo
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock

/**
 * JOSH / DothanTech LPAPI printer lifecycle manager.
 *
 * Owns a single LPAPI instance. Provides:
 *  • Explicit state machine (no bare booleans)
 *  • Serialized print queue (one job at a time)
 *  • Connection guard (no duplicate openPrinterByAddress calls)
 *  • Auto-reconnection with exponential backoff
 *  • Print timeout (never stuck in PRINTING)
 *  • Thread-safe callback marshalling to main thread
 *
 * This class is NOT an Activity. It survives screen navigation.
 */
class JoshPrinterManager(private val context: Context) {

    companion object {
        private const val TAG = "JoshPrinter"
        private const val DISCOVERY_TIMEOUT_MS = 15_000L
        private const val CONNECT_TIMEOUT_MS = 20_000L
        private const val CONNECT_RETRY_DELAY_MS = 1_500L
        private const val CONNECT_MAX_ATTEMPTS = 2
        private const val PRINT_TIMEOUT_MS = 4_000L
        private const val MAX_RECONNECT_ATTEMPTS = 3
        private val RECONNECT_DELAYS_MS = longArrayOf(1000, 2000, 4000)

        // Default print parameters — -1 means use printer hardware defaults
        const val DEFAULT_DENSITY = -1   // -1 = use printer default (safe for all models)
        const val DEFAULT_SPEED = -1     // -1 = use printer default
        const val DEFAULT_GAP_TYPE = -1  // -1 = use printer default
        const val DEFAULT_GAP_LENGTH_MM = -1.0
        const val LABEL_GAP_MM = 3.0

        /**
         * PrintParamName.GAP_LENGTH is an alias of GAP_LENGTH_01MM (0.01 mm units), and
         * setPrintPageGapLength(int) uses the same wire encoding, so both take mm × 100.
         */
        fun gapMmTo01mm(gapMm: Double): Int = Math.round(gapMm * 100.0).toInt()
        /** DothanTech JOSH heads are 203 DPI. 304 is TD-404 and must not size the bitmap. */
        const val HARDWARE_DPI = 203.0
        const val HARDWARE_DPM = 8.0
        /** Official demo: Label / 间隙纸. Die-cut 50×30 stock. */
        const val GAP_TYPE_LABEL = 2
        const val GAP_TYPE_RECEIPT = 0
        const val GAP_TYPE_BLACK_MARK = 3
    }

    // ─── State Machine ─────────────────────────────────────────────────

    enum class State {
        IDLE,
        SCANNING,
        CONNECTING,
        CONNECTED,
        DISCONNECTING,
        DISCONNECTED,
        PRINTING,
        PRINT_SUCCESS,
        PRINT_FAILED,
        RECONNECTING,
        ERROR
    }

    private val state = AtomicReference(State.IDLE)
    private val mainHandler = Handler(Looper.getMainLooper())

    // ─── Connection ────────────────────────────────────────────────────

    private val isConnecting = AtomicBoolean(false)
    private val isDiscovering = AtomicBoolean(false)
    private var connectedPrinterAddress: PrinterAddress? = null
    private var connectedPrinterName: String? = null
    private var connectedMacAddress: String? = null
    private var connectingMacAddress: String? = null
    private var lastConnectedAddress: PrinterAddress? = null
    private val lastConnectedAt = AtomicLong(0)
    private var connectLatch: CountDownLatch? = null

    // ─── Discovery ─────────────────────────────────────────────────────

    private val discoveredPrinters = ConcurrentHashMap<String, PrinterAddress>()
    private var discoveryTimer: Runnable? = null

    // ─── Print Queue ───────────────────────────────────────────────────

    private val printLock = ReentrantLock()
    private val isPrinting = AtomicBoolean(false)
    private var printLatch: CountDownLatch? = null
    private var lastPrintSuccess = false
    private val jobIdCounter = AtomicInteger(0)

    // ─── Configuration ─────────────────────────────────────────────────

    private var density = DEFAULT_DENSITY
    private var speed = DEFAULT_SPEED
    private var gapType = DEFAULT_GAP_TYPE
    private var gapLengthMm = DEFAULT_GAP_LENGTH_MM

    // ─── Last Error ────────────────────────────────────────────────────

    @Volatile
    var lastError: String? = null
        private set

    // ─── Event Listener ────────────────────────────────────────────────

    interface EventListener {
        fun onStateChanged(state: State, data: Map<String, Any?>)
        fun onPrinterDiscovered(printer: Map<String, Any?>)
        fun onPrintProgress(jobId: String, progress: String, data: Map<String, Any?>)
        fun onError(code: String, message: String)
    }

    @Volatile
    var listener: EventListener? = null

    // ─── LPAPI ─────────────────────────────────────────────────────────

    private var api: LPAPI? = null
    private val apiInitialized = AtomicBoolean(false)

    private val lpapiCallback = object : LPAPI.Callback {

        override fun onStateChange(address: PrinterAddress?, printerState: PrinterState?) {
            Log.i(TAG, "[JOSH-CONN-P4:STATE_CHANGE] address=${address?.shownName ?: address?.macAddress} state=$printerState")
            when (printerState) {
                PrinterState.Connected, PrinterState.Connected2 -> {
                    mainHandler.post { handleConnected(address) }
                }
                PrinterState.Disconnected -> {
                    mainHandler.post { handleDisconnected() }
                }
                PrinterState.Connecting -> {
                    Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] Connecting in progress...")
                }
                else -> {
                    Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] State: $printerState")
                }
            }
        }

        override fun onProgressInfo(info: ProgressInfo?, data: Any?) {
            Log.d(TAG, "[JOSH-INFO] info=$info")
        }

        override fun onPrinterDiscovery(address: PrinterAddress?, data: Any?) {
            if (address == null) return
            mainHandler.post { handlePrinterDiscovered(address) }
        }

        override fun onPrintProgress(
            address: PrinterAddress?,
            bitmapData: IDzPrinter.PrintData?,
            progress: PrintProgress?,
            addiInfo: Any?
        ) {
            Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] progress=$progress addiInfo=$addiInfo")
            when (progress) {
                PrintProgress.Success -> {
                    Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-ACK] Physical print confirmed by printer hardware!")
                    lastPrintSuccess = true
                    printLatch?.countDown()
                    mainHandler.post { handlePrintSuccess() }
                }
                PrintProgress.Failed -> {
                    lastPrintSuccess = false
                    val reason = addiInfo?.toString() ?: "Print job failed"
                    Log.e(TAG, "[JOSH-PRINT-P4:HARDWARE-FAIL] Physical print failed at hardware level: $reason")
                    lastError = "JOSH_PRINT_FAILED: $reason"
                    printLatch?.countDown()
                    mainHandler.post { handlePrintFailed(reason) }
                }
                PrintProgress.DataEnded -> {
                    Log.i(TAG, "[JOSH-PRINT-P3:DATA-TRANSMITTED] Bluetooth byte transmission completed, waiting for hardware print confirmation...")
                    // If hardware does not send Success packet within 200ms after all bytes are sent,
                    // count down as success so print completes fast without hanging on models lacking hardware ACK.
                    // Previously 1500ms — reduced to 200ms to eliminate artificial delay in the print pipeline.
                    mainHandler.postDelayed({
                        if (printLatch != null && isPrinting.get() && !lastPrintSuccess) {
                            Log.i(TAG, "[JOSH-PRINT-P4:FALLBACK-SUCCESS] DataEnded confirmed and safety timer elapsed; completing print.")
                            lastPrintSuccess = true
                            printLatch?.countDown()
                            handlePrintSuccess()
                        }
                    }, 200)
                }
                else -> {
                    Log.d(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] $progress (info=$addiInfo)")
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Initialization
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Initialize the LPAPI instance. Must be called once.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    fun initialize(): Boolean {
        if (apiInitialized.get()) return true
        return try {
            // Android 14/15 reflection fix:
            // LPAPI's DzPrinter internally relies on com.dothantech.common.a.g (Application).
            // Under Android 14/15, ActivityThread.currentApplication() can return null, causing
            // DzPrinter.init() to fail and openPrinter/print to be rejected immediately.
            try {
                val appClass = Class.forName("com.dothantech.common.a")
                val field = appClass.getDeclaredField("g")
                field.isAccessible = true
                val app = (context.applicationContext as? android.app.Application)
                    ?: (context as? android.app.Application)
                if (app != null) {
                    field.set(null, app)
                    Log.i(TAG, "[INIT] Injected Application context into com.dothantech.common.a.g")
                }
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] Reflection injection into com.dothantech.common.a: ${t.message}")
            }

            api = LPAPI.Factory.createInstance(lpapiCallback)

            // Also directly initialize DzPrinter singleton with explicit context
            try {
                val dz = com.dothantech.printer.DzPrinter.getInstance()
                dz.init(context.applicationContext, lpapiCallback)
                Log.i(TAG, "[INIT] DzPrinter.init called with explicit applicationContext")
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] DzPrinter.init call: ${t.message}")
            }

            apiInitialized.set(true)
            setState(State.IDLE)
            Log.i(TAG, "[INIT] LPAPI initialized successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "[INIT] Failed to initialize LPAPI", e)
            lastError = "JOSH_SDK_INIT_FAILED: ${e.message}"
            emitError("JOSH_SDK_INIT_FAILED", e.message ?: "Failed to initialize JOSH SDK")
            false
        }
    }

    /**
     * Full shutdown. Only call on application/module destruction.
     */
    fun destroy() {
        Log.i(TAG, "[DESTROY] Shutting down JoshPrinterManager")
        stopDiscovery()
        try {
            api?.quit()
        } catch (e: Exception) {
            Log.w(TAG, "[DESTROY] quit() threw", e)
        }
        api = null
        apiInitialized.set(false)
        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        setState(State.IDLE)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Discovery
    // ═══════════════════════════════════════════════════════════════════

    fun startDiscovery(): Boolean {
        val currentApi = api
        if (currentApi == null) {
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            Log.w(TAG, "[DISCOVERY_START] Bluetooth is off — skipping LPAPI discovery")
            return false
        }

        // Prevent duplicate discovery
        if (isDiscovering.get()) {
            Log.w(TAG, "[DISCOVERY_START] Already discovering — ignoring")
            return false
        }

        // Don't discover while connecting or printing
        val currentState = state.get()
        if (currentState == State.CONNECTING || currentState == State.PRINTING) {
            Log.w(TAG, "[DISCOVERY_START] Cannot scan in state=$currentState")
            emitError("JOSH_INVALID_STATE", "Cannot scan while $currentState")
            return false
        }

        discoveredPrinters.clear()
        isDiscovering.set(true)
        setState(State.SCANNING)
        Log.i(TAG, "[DISCOVERY_START] Starting printer discovery")

        currentApi.discovery()

        // Immediate query for bonded/paired LPAPI printers
        try {
            val pairedList = currentApi.getAllPrinterAddresses(null)
            if (pairedList != null) {
                for (addr in pairedList) {
                    handlePrinterDiscovered(addr)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY] getAllPrinterAddresses threw", e)
        }

        // Auto-stop timer
        val timeout = Runnable {
            if (isDiscovering.get()) {
                Log.i(TAG, "[DISCOVERY_TIMEOUT] ${DISCOVERY_TIMEOUT_MS}ms elapsed — stopping")
                stopDiscovery()
            }
        }
        discoveryTimer = timeout
        mainHandler.postDelayed(timeout, DISCOVERY_TIMEOUT_MS)

        return true
    }

    fun stopDiscovery() {
        if (!isDiscovering.getAndSet(false)) return
        Log.i(TAG, "[DISCOVERY_STOP] Stopping discovery")
        try {
            api?.stopDiscovery()
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY_STOP] stopDiscovery() threw", e)
        }
        discoveryTimer?.let { mainHandler.removeCallbacks(it) }
        discoveryTimer = null

        if (state.get() == State.SCANNING) {
            setState(if (connectedPrinterAddress != null) State.CONNECTED else State.DISCONNECTED)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Connection
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Connect to a JOSH printer by its PrinterAddress (MAC).
     * Blocks the calling thread until Connected callback or timeout.
     *
     * @return true if connection succeeded, false on failure/timeout.
     */
    fun connect(macAddress: String, printerName: String?): Boolean {
        val currentApi = api
        if (currentApi == null) {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        // Prevent duplicate connections to same target; abort and reset if target changed
        if (isConnecting.get()) {
            if (macAddress.equals(connectingMacAddress, ignoreCase = true)) {
                Log.w(TAG, "[CONNECT] Already connecting to $macAddress — ignoring duplicate")
                return false
            } else {
                Log.i(TAG, "[CONNECT] Connecting to new target $macAddress while previous $connectingMacAddress in flight — resetting")
                connectLatch?.countDown()
                try { currentApi.closePrinter() } catch (_: Exception) {}
                isConnecting.set(false)
            }
        }
        connectingMacAddress = macAddress

        // Pre-flight: Check Bluetooth adapter is enabled
        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            lastError = "JOSH_BT_DISABLED: Bluetooth is not enabled"
            emitError("JOSH_BT_DISABLED", "Bluetooth adapter is not enabled")
            return false
        }

        // Cancel any active Bluetooth discovery to avoid RFCOMM page collisions
        if (btAdapter.isDiscovering) {
            try { btAdapter.cancelDiscovery() } catch (_: Exception) {}
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
        }

        // Already connected to this device?
        val currentState = state.get()
        if ((currentState == State.CONNECTED) &&
            connectedMacAddress != null &&
            connectedMacAddress.equals(macAddress, ignoreCase = true)
        ) {
            Log.i(TAG, "[CONNECT] Already connected to $macAddress — no-op")
            return true
        }

        // Don't connect while printing
        if (currentState == State.PRINTING) {
            Log.w(TAG, "[CONNECT] Cannot connect during PRINTING")
            emitError("JOSH_INVALID_STATE", "Cannot connect while printing")
            return false
        }

        // Stop any running discovery
        stopDiscovery()

        isConnecting.set(true)
        setState(State.CONNECTING)
        lastError = null
        Log.i(TAG, "[JOSH-CONN-P1:IDENTIFY] Initiating JOSH connection: mac=$macAddress, name=$printerName")

        // ── PHASE 2: PREPARE — clean up any active SDK session ──
        // Only close if currently opened/connected. Closing when already idle queues a
        // spurious Disconnected callback that would interfere with the new connection attempt.
        if (currentApi.isPrinterOpened || currentState == State.CONNECTED) {
            try {
                currentApi.closePrinter()
                Log.i(TAG, "[JOSH-CONN-P2:PREPARE] closePrinter() called to clear previous session")
                try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] closePrinter() threw (non-fatal)", e)
            }
        }

        // Check if printer is already connected via SDK
        val sdkState = currentApi.printerState
        if (currentApi.isPrinterOpened || sdkState?.group() == 2) {
            val currentName = currentApi.printerName
            Log.d(TAG, "[JOSH-CONN-P1:IDENTIFY] SDK reports already connected to: $currentName")
            if (connectedMacAddress != null && connectedMacAddress.equals(macAddress, ignoreCase = true)) {
                isConnecting.set(false)
                setState(State.CONNECTED)
                return true
            }
        }

        // Resolve PrinterAddress with validated friendly name (NEVER pass a MAC as shownName!)
        var printerAddress = discoveredPrinters[macAddress.uppercase()]
        if (printerAddress == null) {
            try {
                printerAddress = currentApi.getFirstPrinterAddress(macAddress)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] getFirstPrinterAddress threw", e)
            }
        }

        val remoteDevice = try {
            btAdapter.getRemoteDevice(macAddress)
        } catch (e: Exception) {
            null
        }

        if (printerAddress == null && remoteDevice != null) {
            try {
                printerAddress = com.dothantech.b.b.c(remoteDevice)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] BluetoothUtils.c threw", e)
            }
        }

        val resolvedName = when {
            !printerName.isNullOrBlank() && !printerName.contains(":") -> printerName
            remoteDevice?.name != null && !remoteDevice.name.isNullOrBlank() -> remoteDevice.name
            printerAddress?.shownName != null && !printerAddress.shownName.contains(":") -> printerAddress.shownName
            else -> "JOSH"
        }

        val resolvedType = when {
            printerAddress?.addressType != null -> printerAddress.addressType
            remoteDevice != null -> {
                try { com.dothantech.b.b.b(remoteDevice) } catch (_: Throwable) { AddressType.DUAL }
            }
            else -> AddressType.DUAL
        }

        val targetAddress = if (printerAddress == null) {
            PrinterAddress(resolvedName, macAddress, resolvedType)
        } else if (printerAddress.shownName.isNullOrBlank() || printerAddress.shownName.contains(":")) {
            PrinterAddress(resolvedName, macAddress, printerAddress.addressType ?: resolvedType)
        } else {
            printerAddress
        }
        Log.i(TAG, "[JOSH-CONN-P2:PREPARE] Target PrinterAddress: shownName=${targetAddress.shownName}, mac=${targetAddress.macAddress}, type=${targetAddress.addressType}")

        // ── PHASE 3: OPEN — attempt connection with retry ──
        for (attempt in 1..CONNECT_MAX_ATTEMPTS) {
            if (attempt > 1) {
                Log.i(TAG, "[JOSH-CONN-P3:RETRY] Attempt $attempt/$CONNECT_MAX_ATTEMPTS after ${CONNECT_RETRY_DELAY_MS}ms delay")
                try { Thread.sleep(CONNECT_RETRY_DELAY_MS) } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
                // Clean up before retry
                try { currentApi.closePrinter() } catch (_: Exception) {}
                try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            }

            val latch = CountDownLatch(1)
            connectLatch = latch

            // Tier 1: Try openPrinterByAddress
            Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — submitting openPrinterByAddress to LPAPI...")
            var requestAccepted = try {
                currentApi.openPrinterByAddress(targetAddress)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinterByAddress threw", e)
                false
            }

            // Tier 2: Try openPrinter(BluetoothDevice)
            if (!requestAccepted && remoteDevice != null) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] openPrinterByAddress returned false; falling back to openPrinter(device)")
                requestAccepted = try {
                    currentApi.openPrinter(remoteDevice)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(device) threw", e)
                    false
                }
            }

            // Tier 3: Try openPrinter(String)
            if (!requestAccepted) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] falling back to openPrinter(name/mac)")
                requestAccepted = try {
                    currentApi.openPrinter(resolvedName) || currentApi.openPrinter(macAddress)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(string) threw", e)
                    false
                }
            }

            if (!requestAccepted) {
                Log.w(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — all openPrinter methods returned false")
                connectLatch = null
                if (attempt < CONNECT_MAX_ATTEMPTS) continue
                // Final attempt failed
                isConnecting.set(false)
                lastError = "JOSH_CONNECTION_FAILED: Connection request rejected"
                setState(State.DISCONNECTED)
                emitError("JOSH_CONNECTION_FAILED", "Printer rejected connection request")
                return false
            }

            Log.i(TAG, "[JOSH-CONN-P3:WAIT] Attempt $attempt — waiting for LPAPI Connected callback (timeout=${CONNECT_TIMEOUT_MS}ms)...")
            val connected = try {
                latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }

            connectLatch = null

            val isNowConnected = state.get() == State.CONNECTED || currentApi.isPrinterOpened || currentApi.printerState?.group() == 2
            if (isNowConnected) {
                // Success!
                isConnecting.set(false)
                setState(State.CONNECTED)
                if (connectedPrinterAddress == null) {
                    connectedPrinterAddress = targetAddress
                    connectedPrinterName = targetAddress.shownName ?: currentApi.printerName
                    connectedMacAddress = macAddress
                    lastConnectedAt.set(System.currentTimeMillis())
                }
                lastConnectedAddress = targetAddress
                Log.i(TAG, "[JOSH-CONN-P4:CONFIRMED] Connected to ${connectedPrinterName ?: macAddress} on attempt $attempt")
                listener?.onStateChanged(State.CONNECTED, mapOf(
                    "printerName" to (connectedPrinterName ?: targetAddress.shownName),
                    "macAddress" to macAddress,
                    "timestamp" to System.currentTimeMillis(),
                ))
                return true
            }

            Log.w(TAG, "[JOSH-CONN-P3:TIMEOUT] Attempt $attempt — no Connected callback within ${CONNECT_TIMEOUT_MS}ms")
            if (attempt < CONNECT_MAX_ATTEMPTS) {
                // Reset state for retry
                setState(State.CONNECTING)
            }
        }

        // All attempts exhausted
        isConnecting.set(false)
        Log.e(TAG, "[JOSH-CONN-P4:FAILED] All $CONNECT_MAX_ATTEMPTS connect attempts exhausted")
        lastError = "JOSH_CONNECTION_TIMEOUT: Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts"
        setState(State.DISCONNECTED)
        emitError("JOSH_CONNECTION_TIMEOUT", "Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts")
        return false
    }

    /**
     * Disconnect from the current printer.
     * Uses closePrinter() instead of quit() to preserve the LPAPI instance
     * for future connections. quit() is only called in destroy().
     */
    fun disconnect() {
        val currentState = state.get()
        if (currentState == State.DISCONNECTED || currentState == State.IDLE) {
            Log.d(TAG, "[DISCONNECT] Already disconnected")
            return
        }

        if (currentState == State.PRINTING) {
            Log.w(TAG, "[DISCONNECT] Warning: disconnecting during active print")
        }

        setState(State.DISCONNECTING)
        Log.i(TAG, "[DISCONNECT_START] Disconnecting from ${connectedPrinterName ?: connectedMacAddress}")

        stopDiscovery()
        try {
            // Use closePrinter() instead of quit() — this cleanly closes the
            // RFCOMM socket without destroying the LPAPI singleton. The instance
            // remains valid for future openPrinter calls.
            api?.closePrinter()
            Log.i(TAG, "[DISCONNECT] closePrinter() completed")
        } catch (e: Exception) {
            Log.w(TAG, "[DISCONNECT] closePrinter() threw", e)
        }

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        isPrinting.set(false)
        isConnecting.set(false)
        setState(State.DISCONNECTED)
        Log.i(TAG, "[DISCONNECT_DONE] Disconnected")
    }

    /**
     * Attempt to reconnect to the last connected printer with backoff.
     * @return true if reconnection succeeded.
     */
    fun reconnect(): Boolean {
        val lastAddr = lastConnectedAddress ?: run {
            Log.w(TAG, "[RECONNECT] No last known address")
            return false
        }

        if (state.get() == State.CONNECTED) {
            Log.d(TAG, "[RECONNECT] Already connected")
            return true
        }

        setState(State.RECONNECTING)
        Log.i(TAG, "[RECONNECT_START] Attempting reconnect to ${lastAddr.shownName ?: lastAddr.macAddress}")

        for (attempt in 0 until MAX_RECONNECT_ATTEMPTS) {
            val delay = RECONNECT_DELAYS_MS[attempt.coerceAtMost(RECONNECT_DELAYS_MS.size - 1)]
            Log.i(TAG, "[RECONNECT] Attempt ${attempt + 1}/$MAX_RECONNECT_ATTEMPTS after ${delay}ms delay")

            try {
                Thread.sleep(delay)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            }

            val success = connect(lastAddr.macAddress, lastAddr.shownName)
            if (success) {
                Log.i(TAG, "[RECONNECT_SUCCESS] Reconnected on attempt ${attempt + 1}")
                return true
            }
        }

        Log.e(TAG, "[RECONNECT_FAILED] All $MAX_RECONNECT_ATTEMPTS attempts failed")
        lastError = "JOSH_RECONNECT_FAILED: Max retries exceeded"
        setState(State.ERROR)
        emitError("JOSH_RECONNECT_FAILED", "Could not reconnect after $MAX_RECONNECT_ATTEMPTS attempts")
        return false
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Print
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Print a PNG bitmap on the connected JOSH printer.
     *
     * @param pngBytes Raw PNG bytes (decoded from base64 by the caller).
     * @param widthMm Physical label width in mm.
     * @param heightMm Physical label height in mm.
     * Physical size is locked with LPAPI startJob(widthMm, heightMm) + drawBitmap in mm.
     * Bitmap pixels are never treated as 304 DPI TSPL dots (that prints ~1.5× too large).
     */
    fun printBitmap(
        pngBytes: ByteArray,
        widthMm: Double,
        heightMm: Double,
        dpi: Double = HARDWARE_DPI,
        copies: Int = 1,
        paramDensity: Int = -1,
        paramSpeed: Int = -1,
        direction: Int = 0,
        paramGapType: Int = GAP_TYPE_LABEL,
        paramGapLengthMm: Double = LABEL_GAP_MM,
        hOffsetMm: Double = 0.0,
        vOffsetMm: Double = 0.0,
        alignment: String = "left",
    ): Map<String, Any?>? {
        val currentApi = api ?: run {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return null
        }

        // ── Pre-flight checks ──────────────────────────────────────────

        // 1. Check state — must be CONNECTED
        val currentState = state.get()
        if (currentState != State.CONNECTED && currentState != State.PRINT_SUCCESS && currentState != State.PRINT_FAILED) {
            lastError = "JOSH_NOT_CONNECTED: State is $currentState"
            emitError("JOSH_NOT_CONNECTED", "Printer is not connected (state: $currentState)")
            return null
        }

        // 2. Check SDK state
        val sdkState = currentApi.printerState
        if (sdkState == null || sdkState == PrinterState.Disconnected) {
            lastError = "JOSH_NOT_CONNECTED: SDK reports disconnected"
            emitError("JOSH_NOT_CONNECTED", "LPAPI reports printer disconnected")
            return null
        }

        // 3. Acquire print lock (non-blocking check first)
        if (isPrinting.get()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Another print job is active")
            return null
        }

        // 4. Acquire lock
        if (!printLock.tryLock()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING: Lock contention"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Print lock is held by another job")
            return null
        }

        isPrinting.set(true)
        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.incrementAndGet())}"
        setState(State.PRINTING)
        Log.i(TAG, "[$jobId] [JOSH-PRINT-P1:PREFLIGHT] Start ${widthMm}x${heightMm}mm @${dpi}DPI copies=$copies")

        try {
            val t0 = System.currentTimeMillis()

            // ── Decode PNG ─────────────────────────────────────────────
            val decoded = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.size)
                ?: run {
                    lastError = "JOSH_INVALID_BITMAP: Could not decode PNG"
                    emitError("JOSH_INVALID_BITMAP", "Failed to decode PNG bitmap")
                    return null
                }
            val tDecode = System.currentTimeMillis()

            val hardwareDpi = if (dpi == 300.0) 300.0 else HARDWARE_DPI
            val dpm = if (hardwareDpi == 300.0) hardwareDpi / 25.4 else HARDWARE_DPM

            var working = decoded
            var finalWidthMm = widthMm
            var finalHeightMm = heightMm
            if (direction != 0) {
                val matrix = Matrix().apply { postRotate(direction.toFloat()) }
                val rotated = Bitmap.createBitmap(working, 0, 0, working.width, working.height, matrix, true)
                if (rotated !== working) {
                    working.recycle()
                    working = rotated
                }
                if (direction == 90 || direction == 270) {
                    finalWidthMm = heightMm
                    finalHeightMm = widthMm
                }
            }

            val targetW = Math.max(1, Math.round(finalWidthMm * dpm).toInt())
            val targetH = Math.max(1, Math.round(finalHeightMm * dpm).toInt())
            Log.i(
                TAG,
                "[$jobId] [JOSH-PRINT-P2:RASTERIZE] src=${working.width}x${working.height} page=${targetW}x${targetH}px " +
                    "${finalWidthMm}x${finalHeightMm}mm dpm=$dpm dpi=$hardwareDpi dir=$direction align=$alignment offset=${hOffsetMm}x${vOffsetMm}",
            )

            // Composite onto solid OPAQUE WHITE canvas at exact label dots.
            // Apply H/V offsets here so Strategy 1 (printBitmap) honours calibration —
            // startJob drawBitmap offsets only run on fallback strategies.
            val hOffsetPx = Math.round(hOffsetMm * dpm).toInt()
            val vOffsetPx = Math.round(vOffsetMm * dpm).toInt()
            val fitted = if (working.width == targetW && working.height == targetH) {
                working
            } else {
                containFitToPage(working, targetW, targetH, alignment)
            }
            val bitmap = if (hOffsetPx == 0 && vOffsetPx == 0 && fitted.width == targetW && fitted.height == targetH) {
                if (fitted === working) {
                    val page = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(page)
                    canvas.drawColor(Color.WHITE)
                    canvas.drawBitmap(fitted, 0f, 0f, null)
                    page
                } else {
                    fitted
                }
            } else {
                val page = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(page)
                canvas.drawColor(Color.WHITE)
                canvas.drawBitmap(fitted, hOffsetPx.toFloat(), vOffsetPx.toFloat(), null)
                if (fitted !== working && fitted !== page && !fitted.isRecycled) fitted.recycle()
                page
            }
            if (working !== decoded && working !== bitmap && !working.isRecycled) working.recycle()
            if (!decoded.isRecycled) decoded.recycle()
            val tFit = System.currentTimeMillis()
            Log.i(
                TAG,
                "[$jobId] [JOSH-PRINT-P2:OFFSET] applied h=${hOffsetMm}mm (${hOffsetPx}px) v=${vOffsetMm}mm (${vOffsetPx}px)",
            )

            lastPrintSuccess = false
            val latch = CountDownLatch(1)
            printLatch = latch

            val gapTypeValue = if (paramGapType >= 0) paramGapType else GAP_TYPE_LABEL
            val gapLengthValue = gapMmTo01mm(if (paramGapLengthMm >= 0.0) paramGapLengthMm else LABEL_GAP_MM)
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P2:GAP] type=$gapTypeValue length=${paramGapLengthMm}mm → $gapLengthValue (0.01 mm)")
            try {
                currentApi.setPrintPageGapType(gapTypeValue)
                currentApi.setPrintPageGapLength(gapLengthValue)
            } catch (e: Exception) {
                Log.w(TAG, "[$jobId] [JOSH-PRINT-P2:GAP] setPrintPageGap* threw (non-fatal)", e)
            }

            val printParams = Bundle().apply {
                if (gapTypeValue >= 0) putInt(PrintParamName.GAP_TYPE, gapTypeValue)
                if (gapLengthValue >= 0) putInt(PrintParamName.GAP_LENGTH, gapLengthValue)
                if (paramDensity >= 0) putInt(PrintParamName.PRINT_DENSITY, paramDensity)
                if (paramSpeed >= 0) putInt(PrintParamName.PRINT_SPEED, paramSpeed)
                if (copies > 1) putInt(PrintParamName.PRINT_COPIES, copies)
            }
            val finalParams = if (printParams.isEmpty) null else printParams

            // Offsets already baked into bitmap; keep startJob origin at 0 to avoid double-shift.
            val xMm = 0.0
            val yMm = 0.0

            // Strategy 1 (Primary - Official Demo MainActivity.java line 762 & f3daa91):
            // Direct api.printBitmap(bitmap, printParams) allows LPAPI SDK hardware driver
            // to automatically center the bitmap on the label paper roll with physical guide alignment.
            var submitted = try {
                currentApi.printBitmap(bitmap, finalParams)
            } catch (e: Exception) {
                Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] currentApi.printBitmap threw", e)
                false
            }
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 1 (direct printBitmap) submitted=$submitted")

            // Strategy 2 (Fallback - startJob with centered alignment):
            if (!submitted) {
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 2 fallback to submitMmJob startJob(mm)")
                submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, finalParams, alignment)
            }

            // Strategy 3 (Fallback - startJob without extra params):
            if (!submitted) {
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 3 fallback to submitMmJob no-params")
                submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, null, alignment)
            }

            // Strategy 4 (Fallback - printBitmap null params):
            if (!submitted) {
                submitted = try {
                    currentApi.printBitmap(bitmap, null)
                } catch (e: Exception) {
                    Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] printBitmap(null) threw", e)
                    false
                }
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 4 printBitmap(null) submitted=$submitted")
            }

            if (!submitted) {
                Log.e(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] PRINT_REJECTED all print strategies were rejected")
                printLatch = null
                lastError = "JOSH_PRINT_FAILED: Print request rejected by printer SDK"
                handlePrintFailed("Print request rejected by LPAPI SDK")
                return null
            }
            val tSubmit = System.currentTimeMillis()

            Log.i(TAG, "[$jobId] [JOSH-PRINT-P4:WAIT-HARDWARE] PRINT_SUBMITTED waiting for physical completion (timeout=${PRINT_TIMEOUT_MS}ms)")

            // ── Wait for completion callback ───────────────────────────
            val completed = try {
                latch.await(PRINT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            printLatch = null
            val tDone = System.currentTimeMillis()

            if (!completed) {
                Log.e(TAG, "[$jobId] PRINT_TIMEOUT No callback within ${PRINT_TIMEOUT_MS}ms")
                lastError = "JOSH_PRINT_TIMEOUT"
                setState(State.PRINT_FAILED)
                emitError("JOSH_PRINT_TIMEOUT", "Print timed out — printer may be unresponsive")
                emitPrintProgress(jobId, "TIMEOUT", mapOf("timeoutMs" to PRINT_TIMEOUT_MS))

                // Check connection after timeout
                val postState = currentApi.printerState
                if (postState == null || postState == PrinterState.Disconnected) {
                    Log.w(TAG, "[$jobId] Connection lost after timeout")
                    handleDisconnected()
                }
                return null
            }

            if (!lastPrintSuccess) {
                Log.e(TAG, "[$jobId] PRINT_FAILED callback received")
                return null
            }

            // Recycle bitmap
            if (!bitmap.isRecycled) bitmap.recycle()

            val result = mapOf<String, Any?>(
                "jobId" to jobId,
                "copies" to copies,
                "widthMm" to finalWidthMm,
                "heightMm" to finalHeightMm,
                "targetW" to targetW,
                "targetH" to targetH,
                "decodeMs" to (tDecode - t0),
                "fitMs" to (tFit - tDecode),
                "submitMs" to (tSubmit - tFit),
                "waitMs" to (tDone - tSubmit),
                "totalMs" to (tDone - t0),
            )
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P5:FINALIZE] Print complete in ${tDone - t0}ms $result")
            return result

        } catch (e: Exception) {
            Log.e(TAG, "[$jobId] PRINT_ERROR", e)
            lastError = "JOSH_PRINT_FAILED: ${e.message}"
            setState(State.PRINT_FAILED)
            emitError("JOSH_PRINT_FAILED", e.message ?: "Print failed")
            emitPrintProgress(jobId, "FAILED", mapOf("error" to (e.message ?: "Unknown")))
            return null
        } finally {
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Configuration
    // ═══════════════════════════════════════════════════════════════════

    fun configureParams(
        newDensity: Int? = null,
        newSpeed: Int? = null,
        newGapType: Int? = null,
        newGapLengthMm: Double? = null,
    ) {
        val currentApi = api
        newDensity?.let {
            density = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintDarkness(it)
                Log.d(TAG, "[CONFIG] density=$it")
            }
        }
        newSpeed?.let {
            speed = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintSpeed(it)
                Log.d(TAG, "[CONFIG] speed=$it")
            }
        }
        newGapType?.let {
            gapType = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintPageGapType(it)
                Log.d(TAG, "[CONFIG] gapType=$it")
            }
        }
        newGapLengthMm?.let {
            gapLengthMm = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                val gap01mm = gapMmTo01mm(it)
                currentApi.setPrintPageGapLength(gap01mm)
                Log.d(TAG, "[CONFIG] gapLength=${it}mm → $gap01mm (0.01 mm)")
            }
        }
    }

    fun printTestText(text: String): Boolean {
        val currentApi = api ?: return false
        if (!isConnected()) return false

        if (!printLock.tryLock(5000, TimeUnit.MILLISECONDS)) {
            Log.w(TAG, "[JOSH-PRINT-P1:PREFLIGHT] Test print lock contention")
            return false
        }
        isPrinting.set(true)
        setState(State.PRINTING)

        return try {
            lastPrintSuccess = false
            val latch = CountDownLatch(1)
            printLatch = latch

            currentApi.abortJob()
            Log.i(TAG, "[JOSH-PRINT-P2:TEST-DRAW] Starting test job (50.0x30.0mm), text=\"$text\"")
            val started = currentApi.startJob(50.0, 30.0, 0)
            if (!started) {
                Log.w(TAG, "[JOSH-PRINT-P2:TEST-DRAW] startJob(50, 30, 0) returned false")
                return false
            }
            currentApi.setItemHorizontalAlignment(1) // Center
            currentApi.setItemVerticalAlignment(1)   // Center
            currentApi.drawTextRegular(text, 2.0, 2.0, 46.0, 26.0, 4.5, 1)
            val committed = currentApi.commitJob()
            Log.i(TAG, "[JOSH-PRINT-P3:TEST-SUBMIT] commitJob returned: $committed, awaiting physical hardware ACK")
            if (!committed) {
                return false
            }

            val completed = try {
                latch.await(15_000L, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            Log.i(TAG, "[JOSH-PRINT-P4:TEST-RESULT] Physical print result: completed=$completed, success=$lastPrintSuccess")
            completed && lastPrintSuccess
        } catch (e: Exception) {
            Log.e(TAG, "[JOSH-PRINT-P4:TEST-ERROR] Error during test print", e)
            false
        } finally {
            printLatch = null
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
            Log.i(TAG, "[JOSH-PRINT-P5:TEST-FINALIZE] State restored to ${state.get()}")
        }
    }

    private fun containFitToPage(
        src: Bitmap,
        pageW: Int,
        pageH: Int,
        alignment: String,
    ): Bitmap {
        val page = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(page)
        canvas.drawColor(Color.WHITE)
        if (src.width <= 0 || src.height <= 0) return page
        val scale = Math.min(pageW.toFloat() / src.width, pageH.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = if (alignment.equals("left", ignoreCase = true)) 0f else (pageW - dw) / 2f
        val top = if (alignment.equals("left", ignoreCase = true)) 0f else (pageH - dh) / 2f
        val paint = Paint().apply {
            isFilterBitmap = true
            isDither = true
            isAntiAlias = false
        }
        canvas.drawBitmap(src, null, RectF(left, top, left + dw, top + dh), paint)
        return page
    }

    private fun submitMmJob(
        api: LPAPI,
        bitmap: Bitmap,
        widthMm: Double,
        heightMm: Double,
        xMm: Double,
        yMm: Double,
        params: Bundle?,
        alignment: String = "center",
    ): Boolean {
        return try {
            if (!api.startJob(widthMm, heightMm, 0)) {
                false
            } else {
                val hAlign = if (alignment.equals("left", ignoreCase = true)) 0 else 1
                val vAlign = if (alignment.equals("left", ignoreCase = true)) 0 else 1
                try {
                    api.setItemHorizontalAlignment(hAlign)
                    api.setItemVerticalAlignment(vAlign)
                } catch (_: Exception) {}
                api.drawBitmap(bitmap, xMm, yMm, widthMm, heightMm)
                if (params != null) {
                    api.commitJobWithParam(params)
                } else {
                    api.commitJob()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[JOSH-PRINT-P3:SUBMIT] startJob(mm)+drawBitmap(mm) threw", e)
            false
        }
    }

    /**
     * Check if a device name matches DothanTech SDK printer model formats.
     */
    fun isDeviceNameSupported(name: String?): Boolean {
        if (name.isNullOrBlank()) return false
        return try {
            com.dothantech.b.b.g(name)
        } catch (e: Throwable) {
            false
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State Accessors
    // ═══════════════════════════════════════════════════════════════════

    fun getState(): State = state.get()

    fun isConnected(): Boolean {
        val currentApi = api ?: return false
        val isOpened = try {
            currentApi.isPrinterOpened
        } catch (e: Exception) {
            false
        }
        if (isOpened) {
            val s = state.get()
            if (s == State.DISCONNECTED || s == State.IDLE || s == State.PRINT_SUCCESS || s == State.PRINT_FAILED) {
                state.set(State.CONNECTED)
            }
            return true
        }
        return false
    }

    fun getStateSnapshot(): Map<String, Any?> {
        return mapOf(
            "state" to state.get().name,
            "isConnected" to isConnected(),
            "isPrinting" to isPrinting.get(),
            "isDiscovering" to isDiscovering.get(),
            "printerName" to connectedPrinterName,
            "macAddress" to connectedMacAddress,
            "lastError" to lastError,
            "lastConnectedAt" to lastConnectedAt.get(),
            "density" to density,
            "speed" to speed,
            "gapType" to gapType,
            "gapLength" to gapLengthMm,
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LPAPI Callback Handlers (always called on main thread)
    // ═══════════════════════════════════════════════════════════════════

    private fun handleConnected(address: PrinterAddress?) {
        Log.i(TAG, "[CONNECTED] ${address?.shownName ?: address?.macAddress}")
        connectedPrinterAddress = address
        connectedPrinterName = address?.shownName ?: api?.printerName
        connectedMacAddress = address?.macAddress
        connectingMacAddress = null
        lastConnectedAt.set(System.currentTimeMillis())
        isConnecting.set(false)

        setState(State.CONNECTED)
        connectLatch?.countDown()

        listener?.onStateChanged(State.CONNECTED, mapOf(
            "printerName" to connectedPrinterName,
            "macAddress" to connectedMacAddress,
            "timestamp" to lastConnectedAt.get(),
        ))
    }

    private fun handleDisconnected() {
        Log.i(TAG, "[DISCONNECTED] Previous: ${connectedPrinterName ?: connectedMacAddress}, isConnecting=${isConnecting.get()}")
        val wasConnected = state.get() == State.CONNECTED ||
                state.get() == State.PRINTING ||
                state.get() == State.PRINT_SUCCESS ||
                state.get() == State.PRINT_FAILED

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        connectingMacAddress = null

        // If actively connecting, DO NOT abort the connection attempt or count down the latch!
        // Transient Disconnected callbacks from a prior session or initial state must not fail the handshake.
        if (!isConnecting.get()) {
            setState(State.DISCONNECTED)
            listener?.onStateChanged(State.DISCONNECTED, mapOf(
                "wasConnected" to wasConnected,
                "timestamp" to System.currentTimeMillis(),
            ))
        }

        // Release print latch if waiting (print will fail)
        if (isPrinting.get()) {
            lastPrintSuccess = false
            printLatch?.countDown()
        }

        // Attempt auto-reconnect if unexpected disconnect while previously connected.
        // Guard: do NOT auto-reconnect if a manual connect() call is already in progress,
        // because the Disconnected callback may fire as part of the closePrinter() cleanup
        // that precedes every connect attempt.
        if (wasConnected && lastConnectedAddress != null && !isConnecting.get()) {
            Log.i(TAG, "[AUTO_RECONNECT] Unexpected disconnect — scheduling reconnect")
            // Don't block the main thread — run reconnect on a worker
            Thread({
                try {
                    Thread.sleep(500) // brief pause before reconnect
                    reconnect()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                }
            }, "josh-reconnect").start()
        } else if (wasConnected && isConnecting.get()) {
            Log.d(TAG, "[AUTO_RECONNECT] Suppressed — manual connect in progress")
        }
    }

    private fun handlePrinterDiscovered(address: PrinterAddress) {
        val mac = address.macAddress ?: return
        val key = mac.uppercase()

        // Deduplicate by MAC
        if (discoveredPrinters.containsKey(key)) return

        val shownName = (address.shownName ?: "").trim()
        val lowerName = shownName.lowercase()

        // Filter: DO NOT claim devices that belong to TD-404, Tejas, Rudra, Tez, Shakti, or Dev printers!
        // NOTE: "sez" or "seznik" is the brand prefix and must NOT be filtered out.
        if (lowerName.contains("tejas") ||
            lowerName.contains("rudra") ||
            lowerName.contains("td-404") ||
            lowerName.contains("td404") ||
            lowerName.contains("tez") ||
            lowerName.contains("shakti") ||
            lowerName.contains("dev") ||
            lowerName.contains("veer") ||
            lowerName.contains("caysn")
        ) {
            Log.d(TAG, "[PRINTER_IGNORED_NON_JOSH] Ignoring non-JOSH printer in JOSH scan: $shownName ($mac)")
            return
        }

        // Only accept if verified by DothanTech SDK or matches known Josh/LPAPI name patterns
        val isDothanModel = isDeviceNameSupported(shownName)
        val isJoshName = lowerName.contains("josh") ||
            lowerName.contains("lpapi") ||
            lowerName.contains("dothan") ||
            lowerName.contains("dzprinter") ||
            lowerName.startsWith("ld08") ||
            lowerName.startsWith("lp08") ||
            lowerName.startsWith("lp12") ||
            lowerName.startsWith("dt-") ||
            lowerName.startsWith("dt_") ||
            lowerName.startsWith("dp-") ||
            lowerName.startsWith("dp_") ||
            lowerName.startsWith("jc")

        if (!isDothanModel && !isJoshName) {
            Log.d(TAG, "[PRINTER_IGNORED_UNKNOWN] Ignoring non-JOSH device: $shownName ($mac)")
            return
        }

        discoveredPrinters[key] = address

        Log.i(TAG, "[PRINTER_FOUND] name=${address.shownName} mac=$mac")

        val data = mapOf<String, Any?>(
            "id" to mac,
            "name" to (address.shownName ?: mac),
            "macAddress" to mac,
            "transport" to "josh-lpapi",
            "sdkId" to "josh",
            "bonded" to false,
        )
        listener?.onPrinterDiscovered(data)
    }

    private fun handlePrintSuccess() {
        Log.i(TAG, "[PRINT_SUCCESS]")
        lastPrintSuccess = true
        setState(State.PRINT_SUCCESS)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "SUCCESS", emptyMap())
    }

    private fun handlePrintFailed(reason: String) {
        Log.e(TAG, "[PRINT_FAILED] $reason")
        lastPrintSuccess = false
        lastError = "JOSH_PRINT_FAILED: $reason"
        setState(State.PRINT_FAILED)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "FAILED", mapOf("reason" to reason))
        emitError("JOSH_PRINT_FAILED", reason)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State + Event Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun setState(newState: State) {
        val old = state.getAndSet(newState)
        if (old != newState) {
            Log.d(TAG, "[STATE] $old → $newState")
        }
    }

    private fun emitError(code: String, message: String) {
        listener?.onError(code, message)
    }

    private fun emitPrintProgress(jobId: String, progress: String, data: Map<String, Any?>) {
        listener?.onPrintProgress(jobId, progress, data)
    }
}
```

