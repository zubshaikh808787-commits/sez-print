# Printer SDK Investigation

> **Date:** 2026-09-23  
> **Scope:** The five vendor printer SDKs linked into the app through `modules/*-printer`, plus the vendor demo/doc bundles in `backend/GD985-SDK/`, `backend/sdks/td404/vendor/`, and `dev and veer sdk/`.  
> **Consumers:** Phase 6 of [`ARCHITECTURE_REDESIGN_PLAN.md`](./ARCHITECTURE_REDESIGN_PLAN.md) is written against these findings.

## Method

Every finding below comes from static inspection of the files in this repository. Nothing was validated on physical hardware.

- **Java/Kotlin binaries:** `javap` (public API and `-c -p` bytecode disassembly) against each `.jar` / AAR `classes.jar`.
- **Native binaries:** `nm -D` (JNI exports), `strings`, SHA-1 comparison, `lipo -info` for the iOS framework.
- **Vendor material:** sample/demo source, headers, and PDF manuals (via `pdftotext`).
- **Our wrappers:** the Kotlin module under each `modules/*-printer/android/src` and its `src/index.ts`, to record how the SDK is actually used today versus what it offers.
- **Built output:** `android/app/build/intermediates/merged_native_libs/` to see what actually ships in the APK.

Anything that can only be confirmed on a printer (real DPI of a given unit, physical feed alignment, margin accuracy, offline behaviour) is marked as such rather than estimated.

---

## App-Side Verification Pass (2026-09-23)

Five claims were re-checked against our integration code (`modules/*-printer/`) plus the vendor bytecode they call, and one of them against a freshly built APK. Results:

| # | Claim | Verdict | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | Tez connects by reflection, bypassing the allowlist | **Partially true** — see the corrected steps in §5 | `TezPrinterManager.kt` `preparePrinterSession` / `invokeSppConnect` / `resolveDeviceItem`; SDK `Oo0.connectBefore` → `NativeUtil.test3` |
| 2 | Josh injects `Application` into `com.dothantech.common.a.g`; `isDeviceNameSupported` calls `com.dothantech.b.b.g` | **Confirmed** (the first is reflection, the second a direct static call to an obfuscated class) | `JoshPrinterManager.kt` `initialize()` and `isDeviceNameSupported()`; `javap`: `private static Application g`, `public static boolean g(String)` |
| 3 | Tez's `libPrinterNative.so` ships and `pickFirst` resolves the clash | **Confirmed by build**, with one caveat: the local `android/` folder is missing the rule | Fresh `assembleDebug` without the rule fails (`2 files found with path 'lib/arm64-v8a/libPrinterNative.so'`); with the plugin's property it succeeds, and the APK's arm64 lib has SHA-1 `a2eb4810…` = Tez |
| 4 | Josh `gapLength` is always `3`, never overridden by JS, and lands in a 0.01 mm field | **Partially true** — the unit bug is real; "never overridden" is wrong | JS passes `Math.round(options.gapMm)` (user's gap, default `3`); SDK `GAP_LENGTH = "GAP_LENGTH_01MM"`; `setPrintPageGapLength` uses the same encoder. **Fixed 2026-09-23** |
| 5 | Label X licence payload includes firmware version; `501`/`505` trigger rejection; Tez has the same | **Label X: confirmed, with precision added. Tez: contradicted** (no network check exists) | `b.b.run()` payload keys; `"501"`/`"505"` string compare; no URLs in `PrintSDK-68.jar` or Tez's `.so` |

Details for each item are in the relevant SDK section below.

---

## 1. TD-404 / Tejas / Rudra — Ninestar `labelprinter`

**Files:** `modules/td404-printer/android/libs/labelprinter.jar` (linked), `labelprinter.aar` (same `classes.jar`, not linked); vendor copy and PDFs in `backend/sdks/td404/vendor/`.

**What it is.** A plain, un-obfuscated Java library (`com.ninestar.printer`, no native code) with command builders for TSPL (`LabelCommand`), ESC/POS (`EscCommand`) and CPCL (`CpclCommand`), plus port classes `SppBluetoothPort`, `BleBluetoothPort`, `EthernetPort` and `UsbPort`.

**How printing is invoked.** The SDK's `LabelCommand` API is dot/whole-mm based: `addSize(int, int)` and `addGap(int)` take integer millimetres, and `addBitmap(x, y, mode, width, Bitmap)` takes dots. **Our module does not use the SDK at runtime.** `LabelCommand` is imported but never called, and the Kotlin doc comments that say it is are wrong. Instead `Td404PrinterModule.printPngLabelNative` hand-builds TSPL (`SIZE` in fractional mm to 0.01, `GAP`/`BLINE`, `SPEED`, `DENSITY`, `DIRECTION`, `CLS`, `BITMAP x,y,bytesPerRow,h,0`, `PRINT 1`), packs the 1-bit bitmap itself, and writes it over its own RFCOMM socket (secure, then insecure, then reflective channel-1 fallback). The contract is therefore **mm page size (TSPL `SIZE`) plus a 1-bit bitmap in device dots**. Hand-rolling is actually better than the SDK here, because the SDK cannot express fractional-mm label sizes.

**Transports.** The SDK supports SPP, BLE, TCP (`EthernetPort`; the vendor doc and our Node backend use port 9100) and USB. The module implements SPP only. The Node backend (`backend/sdks/td404/index.js`) implements raw TCP.

**Integration risks.**
- Dots-per-mm is hardcoded to `12.0` when `dpi == 304` (nominal 304 DPI is 11.97 dots/mm, and a "300 DPI" head is 11.81). Which one is physically correct for a given TD-404 unit cannot be determined from the SDK files.
- There is no DPI query in the path we use. The SDK has `addQueryPrinterType()`, but its response format is undocumented. Today DPI comes from the user-selected profile (`td404-304` / `td404-203`, default 304).
- The unused AAR's manifest declares `<uses-feature android:name="android.hardware.usb.host" android:required="true"/>`. Swapping the JAR for the AAR would make the app uninstallable (and hidden on Play) for devices without USB host.
- The vendor Android PDF is 89 lines and covers connection setup only, with nothing on units or resolution. For iOS the repo has a PDF manual but no binary.

---

## 2. Dev (and Veer) — Caysn AutoReplyPrint

**Files:** `modules/dev-printer/android/libs/autoreplyprint.jar`, `jna-4.5.1.jar`, `nzio.jar`, and `src/main/jniLibs/*/libautoreplyprint.so` + `libjnidispatch.so`. Vendor bundle in `dev and veer sdk/` (Android sample source 2020-03-31, PDFs, iOS sample 2017-09-26).

**What it is.** A JNA binding (`com.caysn.autoreplyprint.AutoReplyPrint`) to a native C library with about 300 `CP_*` functions in five families:
- `CP_Port_*`: open COM, USB, TCP, BT SPP, and BT BLE; enumerate network, BT, BLE, and Wi-Fi P2P devices.
- `CP_Printer_*`: status, firmware version, **resolution**, and **label position adjustment**.
- `CP_Pos_*`: ESC/POS text and raster.
- `CP_Page_*`: page mode.
- `CP_Label_*`: `PageBegin` / `Draw*` / `PagePrint`, all in dots.

**How printing is invoked.** We use the SDK only as a **byte transport and status source**: `CP_Port_OpenBtSpp`, `CP_Port_Write`, `CP_Port_IsConnectionValid`, `CP_Printer_GetPrinterStatusInfo`, `CP_Label_CalibrateLabel`. There is also a raw-RFCOMM fallback if the SDK port fails. Job bytes are generated in `DevPrinterModule.kt` in one of two command sets, chosen by the `commandSet` option (native default `escpos`; the app exposes a TSPL/ESC-POS toggle via `devCommandSet`):
- **TSPL**: `SIZE` in fractional mm, `GAP` rounded to whole mm, `BITMAP`.
- **ESC/POS**: `GS v 0` raster, one row per command, then `ESC J` feed.

Either way the content is a **1-bit bitmap in dots**, with the page declared in mm only on the TSPL path.

**Transports.** The SDK offers SPP, BLE, TCP, USB, serial, and Wi-Fi P2P. The module uses SPP only.

**Integration risks.**
- **Hardcoded DEV-7299 geometry:** 8 dots/mm, and a 378-dot (47.25 mm) "symmetric zone" derived from the 58 mm mechanism's head position. A 50 mm design is 400 dots; `fit = 378/400 = 0.945` is applied to **both bitmap axes**. TSPL `SIZE` is still the requested millimetres (e.g. `50.00 mm`); the **raster** is what shrinks. Physical 47.25 mm needs a caliper. No UI warning. Product decision (`Q5`).
- **Unused capabilities that would remove the guesswork:** `CP_Printer_GetPrinterResolutionInfo(width_mm, height_mm, dots_per_mm)` (the vendor sample calls it), `CP_Printer_GetPrinterLabelPositionAdjustmentInfo` (printer-stored offsets), and the full native `CP_Label_*` drawing API.
- **Our-bridge — native `commandSet` default vs JS:** Kotlin defaults `commandSet` to `"escpos"` and treats anything other than exactly `"tspl"` as ESC/POS (`useEscPos = commandSet != "tspl"`). The ESC/POS path ignores `heightMm` and derives geometry from the bitmap's aspect (centres on the printhead, byte-aligns height). The JS wrapper in `modules/dev-printer/src/index.ts` always sends `commandSet: options.commandSet ?? 'tspl'` and documents why. This is **safe for every current caller** (they go through the wrapper / `printer-manager.ts`); a direct native `printPngLabel` call without `commandSet` silently switches geometry engines. Adapter 6.4a should make the native default match JS or reject unknown values.
- **Wrong documentation in the repo.** The PDFs under `dev and veer sdk/docs/` document the older **PrinterLibs / `nzio`** library (`com.lvrenyang.io`), not AutoReplyPrint. `nzio.jar` is linked but never imported. AutoReplyPrint's contract is only inferable from the sample source.
- **iOS would be a separate integration.** The only iOS binary is a 2017 `PrinterLibs.framework` (fat static: armv7, armv7s, i386, x86_64, arm64). It is not an xcframework, has no arm64-simulator slice, and is a different library from Android's AutoReplyPrint.
- ~~`isAvailable` returns `true` from its `catch` branch, so an SDK load failure reports "available."~~ **Fixed 2026-09-23:** the `catch` branch now returns `false`.
- **Veer:** the folder name and the name heuristics treat Veer as the Dev family. No separate Veer SDK exists in the repo.

---

## 3. Josh — DothanTech LPAPI

**Files:** `modules/josh-printer/android/libs/LPAPI-2026-01-08-R.jar` (pure Java, no native code).

**What it is.** DothanTech's LPAPI. Internals are obfuscated (`com.dothantech.a` … `h`), but the public facade `com.dothantech.lpapi.LPAPI` is clean. It is the only SDK here with a full **mm-native, job-based vector API**:
- `startJob(widthMm, heightMm, orientation)`
- `drawText*`, `draw1DBarcode`, `draw2DQRCode`, `draw2DDataMatrix`
- `drawRectangle` / `Line` / `Ellipse` / `Circle` / `DashLine`
- `drawBitmap(bmp, xMm, yMm, wMm, hMm)` and `drawBitmapWithThreshold`
- `commitJob()` / `commitJobWithParam(Bundle)`

It also has a pixel path, `printBitmap(Bitmap, Bundle)`. `getPrinterInfo()` returns `deviceDPI`, `deviceWidth`, `deviceName`, `deviceVersion`, `softwareVersion`, `manufacturer`, `seriesName` and `mcuId`. Print parameters (`IDzPrinter.PrintParamName`) include density, speed, copies, gap type/length, horizontal/vertical offset, margins, image threshold, `PRINT_DPI`, alignment and inversion.

**Units (verified in bytecode).** Every `*_01MM` parameter is in **0.01 mm**. `DzPrinter` converts the `*_PX` variant with `px × 2540 / printerDPI`. `PrintParamName.GAP_LENGTH` is an alias for `"GAP_LENGTH_01MM"`.

**How printing is invoked today.**
- **Primary path:** `api.printBitmap(bitmap, params)`, which is pixel-based, with H/V offsets baked into the pixels. The bitmap DPI comes from the app's printer setting via `joshEffectiveDpi` (`src/lib/printer/josh-print.ts`): `300` if the setting is exactly 300, otherwise `203`. The native side mirrors this (`val hardwareDpi = if (dpi == 300.0) 300.0 else HARDWARE_DPI`). The device-reported DPI is never read.
- **Fallbacks:** `startJob(mm)` + `drawBitmap(mm)` + `commitJob`, then `printBitmap(bitmap, null)`.
- The vector drawing API is used only by the test print. The KDoc on `printBitmap` claims size is "locked with `startJob(mm)`", but that is only true on the fallback path.

**Transports.** `AddressType` covers SPP, BLE, DUAL, Wi-Fi and USB. The module uses Bluetooth via `openPrinterByAddress`.

**Integration risks.**
- **Gap-length unit bug — confirmed; code fixed 2026-09-23, hardware confirmation pending.**
  - *Before the fix:* JS sent the user's gap rounded to whole mm (`printer-manager.ts`: `options.gapMm != null ? Math.max(0, Math.round(options.gapMm)) : 3`, fed from `print.tsx`'s gap stepper, default `3`). Kotlin then wrote that integer unchanged into both `setPrintPageGapLength(gapLengthValue)` and `putInt(PrintParamName.GAP_LENGTH, gapLengthValue)`. A 3 mm gap was therefore sent as `3` = 0.03 mm, and fractional gaps (e.g. 2.5 mm) were rounded first.
  - *Unit evidence (bytecode):* `PrintParamName.GAP_LENGTH = "GAP_LENGTH_01MM"`. `DzPrinter` reads `GAP_LENGTH_01MM` directly and converts `GAP_LENGTH_PX` with `px × 2540 / printerDPI`. `IDzPrinter.Factory.setPrintPageGapLength(int)` uses the same 3-byte encoder (threshold `16383`, cap `4194303`) as the `GAP_LENGTH_01MM` path in `com.dothantech.data.g`, so both calls take 0.01 mm.
  - *Fix:* the bridge contract is now "gap in millimetres, fractional allowed". `JoshPrinterManager.gapMmTo01mm()` converts to 0.01 mm at the SDK boundary (3 mm → `300`), for both `printBitmap` and `configureParams`, and logs the conversion. JS no longer rounds.
  - *Still needs hardware:* whether the printer uses this length at all when it gap-senses die-cut stock, and that feed is correct after the change.
- **DPI is never read from the device.** The app setting chooses 203 or 300 (see above). If the setting says anything other than 300 (for example the shared default 304 used for TD-404) while the unit is really 300 DPI, the pixel path prints at 203/300 = 67.7 % size. The fix is to read `getPrinterInfo().deviceDPI` or pass `PRINT_DPI`.
- **Initialization depends on obfuscated internals — confirmed.** `JoshPrinterManager.initialize()` does `Class.forName("com.dothantech.common.a")`, then `getDeclaredField("g")` / `isAccessible = true` / `field.set(null, app)`; the SDK field is `private static android.app.Application g`. `isDeviceNameSupported()` calls `com.dothantech.b.b.g(name)` directly (not reflection); in the SDK that is `public static boolean g(java.lang.String)`. The module also calls `com.dothantech.b.b.c(remoteDevice)` and `com.dothantech.b.b.b(remoteDevice)` directly. Any vendor re-obfuscation breaks all of these.
- **Possible duplicate prints.** There are four submission strategies in sequence. If one returns `false` after partially sending data, the next could print again. This can't be ruled out statically.
- **Our-bridge — false success on `DataEnded` (same class as Tez's 15 s timer).** `lpapiCallback.onPrintProgress` handles `PrintProgress.Success` (real hardware ACK) and `Failed`, but `PrintProgress.DataEnded` posts a **200 ms** delayed runnable that sets `lastPrintSuccess = true` and counts down the latch *if no Success has arrived*. The comment says this is for "models lacking hardware ACK." Bytes transmitted is not a printed label. Task 6.2 must declare Josh's completion signal as this weakest fallback, not `printer ack`.
- **Our-bridge — bitmap leak on failed prints.** In `printBitmap`, `bitmap.recycle()` runs only after `completed && lastPrintSuccess`. The `!submitted` early return, the `PRINT_TIMEOUT` return, and the `if (!lastPrintSuccess) return null` path all skip it, so repeated failed jobs accumulate full-page bitmaps.
- **Our-bridge — `"left"` alignment also forces top.** `containFitToPage` sets both `left = 0f` and `top = 0f` when `alignment.equals("left")`; `submitMmJob` sets both `hAlign` and `vAlign` to `0` on the same test. Horizontal and vertical alignment are one parameter.
- **The name list is unverified.** `SEZNIK_PRINTER_MODELS.josh.supportedNames` includes NIIMBOT / B21 / D110 / B1. The SDK files don't establish that LPAPI drives those; LPAPI has its own name filter.
- No iOS SDK in the repo.

---

## 4. Label X / MiniX / GD985 — LuckPrinter SDK v1.3.8 (Abroad)

**Files:** `modules/labelx-printer/android/libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` (Java + `jni/*/libPrinterNative.so`). The vendor bundle in `backend/GD985-SDK/` adds the "China" variant AAR, the Android demo, a 1,143-line `LuckPrinter_SDK_Integration_Guide-EN.md`, and an iOS demo with `LuckBleSDK.xcframework` + `ImageDataProcesser.xcframework`.

**What it is.** A `PrinterHelper` singleton (`com.luckprinter.sdk_new`) over many device families (`aiyin`, `hanyin`, `normal`, `a4`, `sheetlabel`, `wifi`, `zijiang`, `custom`). Helper packages `a`–`g` are obfuscated. It bundles its own `libPrinterNative.so` (JNI classes `com.print.libnative.Compress` / `Code941`).

**How printing is invoked.** **Bitmap-only.** The entry points are `print`, `printTag`, `printBlackTag`, `printCircleTag`, `printTattoo`, `printFolder` and `printWaterTransfer`, each taking `(Bitmap, [isGray, grayLevel], copies, OnPrintCallback)`, plus `*Once` variants. There is no page-size or mm parameter; the only mm-aware call is the deprecated `printSheetLabel(tagWidthMM, tagHeightMM, speed, density, bitmap, count)`. Physical size is bitmap pixels ÷ printer DPI, and the label boundary comes from the printer's gap sensor. Queryable facts: `is304Dpi()`, `getPrintWidth()`, `getPrintMaxWidth()`, `getDensityList()`, and model / SN / version / status. The SDK supports one connection at a time.

**How we use it.**
- **Init:** `PrinterHelper.init(context, asKey, false)` with the vendor demo's "abroad" key, then `setCustomPropertyMap` for the name prefixes `Seznik MiniX_`, `LabelX_`, `GD985_`, `MiniX_`, `LuckP_` and `BTW_` (203 DPI, 48 mm max width).
- **Sizing:** width in dots = `widthMm × 8` truncated; height is derived from the source bitmap's aspect ratio. No H/V offsets are applied.
- **Rasterization defaults (our wrapper):** Floyd–Steinberg dithering **on** (`dither` JS default `true`). The ditherer's cutoff is **hardcoded `128`** and does not read the `threshold` option. JS still sends `threshold: 145`, but that value only applies when `dither` is false (`applyThresholdBinarization`). So "dither on, threshold 145" is **not** both in effect on the normal path.

**Transports.** Classic Bluetooth (SPP) by default. BLE requires the FastBle dependency plus `setEnableBle(true)`; neither is present. There is Wi-Fi provisioning (`sendWifiAccountPassword`, AI50 Wi-Fi printers). The iOS SDK is CoreBluetooth BLE plus Wi-Fi configuration.

**Integration risks.**
- **Network licence check and device data sent to a third party — confirmed in bytecode (`b.b.run()`, a `TimerTask`).**
  - *Payload* (form-encoded POST via OkHttp to `https://api.gj.luckjingle.com/api/sdk/check2`, built in `g.d.a`): `asKey`, `sn`, `softwareVersion`, `mac`, `model`, `bluetoothname`. `softwareVersion` is filled from `PrinterHelper.printerVersionLuck(...)`, i.e. the version string the **printer** reports (its firmware/software version), not the app's. So "firmware version is sent" is correct in substance; the wire key is `softwareVersion`.
  - *Rejection codes:* the response JSON's `code` is compared as a string to exactly `"501"` or `"505"`. Either one calls `b.f.a()`, which logs `device already forbidden!!!` and, on the UI thread, calls `onDeviceForbidden()` on every registered `DeviceForbiddenListener`. Any other non-null `code` cancels the timer with no rejection. A null `code` (network failure, bad JSON) leaves the timer running for the next attempt. If `asKey` is null, `b.f.a()` is called immediately, with no network call.
  - *Effect in our app:* the SDK path above only notifies listeners; nothing in it disconnects or blocks printing. Our module (`LabelXPrinterModule.kt`) registers no `DeviceForbiddenListener`, so a rejection currently has no visible effect. The vendor guide's statement that an invalid key "will cause the printer to disconnect" is not borne out by this code path. Whether the server or firmware enforces anything else can only be checked on hardware.
  - *Key:* we ship the vendor demo key: `private val DEFAULT_AS_KEY = "7fec7c4703824444a8bcf8b24b148dec"`, passed to `PrinterHelper.getInstance().init(context.applicationContext, key, false)`.
- **Native library collision with Tez — confirmed by a fresh build (2026-09-23).**
  - *Hashes (arm64-v8a SHA-1):* Label X AAR `jni/` = `49b89a476206e3388a20ac4b1f6cefeea906d093`. Tez `jniLibs/` = `a2eb4810db60e9063a6aa9538ad6cbf933c1a210`. All four ABIs differ. Export sets and embedded allowlist strings overlap; the `.so` files are **not** identical. Treat as a shared **soname / JNI package**, not a proven corporate identity.
  - *What resolves it:* `plugins/with-android-packaging.js` (registered in `app.json`) injects `pickFirst '**/libPrinterNative.so'` into `app/build.gradle` and `android.packagingOptions.pickFirsts=**/libPrinterNative.so,…` into `gradle.properties`. **The current local `android/` folder contains neither injection** (it is gitignored and was generated before the plugin; a fresh `expo prebuild` or EAS build would include them). A fresh `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` from it **fails**: `2 files found with path 'lib/arm64-v8a/libPrinterNative.so'` (Tez module vs the transformed Label X AAR). The same build with `-Pandroid.packagingOptions.pickFirsts=**/libPrinterNative.so,lib/**/libPrinterNative.so,**/libc++_shared.so` (the plugin's exact value) succeeds, and `lib/arm64-v8a/libPrinterNative.so` in the resulting APK hashes to `a2eb4810…` — **Tez's build**. The older APKs in `android/app/build/outputs/` (release 2026-09-17, debug 2026-09-18) also contain Tez's copy (arm64 `a2eb48…`, armeabi-v7a `26b3f3…`).
  - *Consequence:* LuckPrinter runs against a native library it wasn't shipped with; hardware testing of Label X on the Tez build is required.
- **Hidden reverse dependency: Tez uses Label X's JNI classes.** Commit `3d7ad75` ("resolve duplicate classes Code941 and Compress…") deleted `com/print/libnative/Code941.class` and `Compress.class` from the in-repo `PrintSDK-68.jar`. Tez classes (`NativeManage`, `Oo0` and another obfuscated `com.print.myprinter` class) still reference them, so at runtime they resolve to **Label X's copies** from the AAR. Removing the Label X module would break Tez. The vendor JAR in the repo is therefore a modified binary, not the vendor's original.
- **Dead configuration.** `registerCustomProfiles()` builds a `commandMap` of custom byte sequences (enable, wake, paper type, position, disable). `PrinterHelper` has no API that accepts it, so those sequences never run.
- **Label height is not enforced.** Only width is controlled (and truncated). Physical length equals bitmap height ÷ DPI, and `is304Dpi()` / `getPrintWidth()` are never consulted.
- **Our-bridge — `isAvailable` can never return `false`.** `ensureSdkInitialized()` catches `Throwable` and only logs (never rethrows; `isInitialized` stays false). `Function("isAvailable")` then does `try { ensureSdkInitialized(); true } catch { false }`, so the catch is unreachable. Same class as the Dev `isAvailable` bug fixed 2026-09-23. Consequence: `getLabelXNativeDiagnostic`'s reason `"LuckPrinter SDK initialization failed"` is dead — `mod.isAvailable()` is always `true` once the module loads.
- **Our-bridge — dither cutoff ignores `threshold`.** `applyFloydSteinbergDithering` uses `if (oldVal < 128f)` and takes no threshold argument. The print path defaults `dither = true`, so `applyThresholdBinarization(…, threshold)` (the only reader of the 145 default) is skipped on the normal path.
- **Our-bridge — print promise can hang forever.** `printPngLabel` resolves only in `OnPrintCallback.onPrintSuccess` and rejects only in `onPrintFail` (or a synchronous throw before dispatch). There is no timeout. Opposite of Tez: Tez reports false success after 15 s; Label X never settles if the SDK invokes neither callback (disconnect mid-print, firmware hang).
- **Our-bridge — no `OnDestroy`.** Dev, TD-404 and Josh unregister receivers / close handles / `manager.destroy()` on teardown. Label X registers a discovery `BroadcastReceiver` (`registerDiscoveryReceiver`) and never disconnects the printer on module destroy. `stopScan` unregisters, but module teardown does not.
- **iOS would be a separate integration.** The xcframework (`LuckPrinter`, `LPSendTask`, `LuckPrintConfig`, …) has a different API shape.

---

## 5. Tez / Shakti — "PrintSDK-68"

**Files:** `modules/tez-printer/android/libs/PrintSDK-68.jar` + `src/main/jniLibs/*/libPrinterNative.so`.

**What it is.** A heavily obfuscated SDK (`com.print.*`, with Unicode-glyph class names under `com.print.myprinter` and at the package root) over `libPrinterNative.so`. The native library has TSPL, CPCL and ESC compressors, an IPP-style raster template (`Resolution=200x200`), and a **hardcoded model allowlist**: `T80, FlashToy, Y50, L13, … LuckP_D1S, …` plus the wildcard token `8888YXWL8888`. Module comments call it "Flashlabel OEM." LuckPrinter’s AAR also contains `com.print.libnative.Code941` / `Compress` and a **different** `libPrinterNative.so` (hashes do not match Tez). That is a shared **package/soname**, not a corporate filing.

**How printing is invoked.** **Bitmap-only**, through `PrintImgHelper`. The call sequence is:
1. `setImgData(threshold, ImgData(name, bitmap))`
2. `build(callback)` → `.cls().enable().CreatePage(int, int).paperType().density().speed()`
3. per copy: `backoffPaper()` / `printImg(name, n)` / `fixedPoint()` / `forwardPaper()` / `printLinedots(dots)`
4. `.disenable()`, then `run(build)`

`CreatePage` accepts **integers only**, so the module rounds label mm to whole mm. `Command` exposes `get_status`, `calibration`, `LEARN_LABEL`, `set_paperType`, **`DPI()`**, `get_DeviceInfo`, `HARDWARE_VERSION`, `get_RFID*`, `update(...)` (firmware) and `FACTORY_RESET`.

**Transports.** `SocketType` offers Wi-Fi, SPP, BLE, USB (`USBPrinterManage`) and Wi-Fi config. The module uses SPP.

**How connection is achieved (the unusual part) — verified 2026-09-23 against `TezPrinterManager.kt` and the SDK bytecode.**

*The gate:* `Printer.connect(DeviceItem)` delegates to `Oo0.connect(DeviceItem)`, which first calls `connectBefore(DeviceItem)`. That calls `NativeUtil.test3(0, deviceItem.name)`, failing with `"checkBTName failed! The SDK does not support this device!"` when the name isn't allowed. `test3` compares against a list returned from native code and also accepts the Java-side wildcard `8888PRINT8888`. Only after the gate does the SDK set `deviceItem`, call `helper.initHandler()`, assign `commandApi = new 〇Ooo.〇o0〇o0(deviceItem.modelKey)`, and call `init()`.

*What our code does instead* (introduced in commit `b29ad1a`, 2026-09-14; the earlier `259ee22` used the normal `connect`):
1. **Builds a `DeviceItem` with its public constructor and setters — not by reflection.** In `resolveDeviceItem`: `val item = DeviceItem()`, then `item.blueDevice = remote`, `item.address = cleanMac`, `item.modelKey = modelKey`, `item.name = deviceName ?: "Y50"`. `DeviceItem`'s fields are public. The code comment says why: "Never call DeviceItem.build(mac). That factory returns null for Seznik_Tej."
2. **Writes it into the class hierarchy by reflection.** `preparePrinterSession` walks `printer.javaClass` and its superclasses, and for every field with `field.type == DeviceItem::class.java` does `field.isAccessible = true` then `field.set(printer, device)`. In the SDK that field is `protected DeviceItem deviceItem` on `Oo0`. It then calls `printer.helper?.initHandler()`.
3. **Attempts to construct `commandApi` by reflection — and by static analysis this step always fails.** The code finds the field named `"commandApi"` and calls `field.type.getDeclaredConstructor(String::class.java)`, then `newInstance(device.modelKey ?: DEFAULT_MODEL_KEY)`. But the field's declared type is the **abstract** class `〇Ooo.O8〇oO8〇88`, whose only constructor is `public 〇Ooo.O8〇oO8〇88()`. The concrete class the SDK instantiates is `〇Ooo.〇o0〇o0(String)`. `getDeclaredConstructor(String)` therefore throws `NoSuchMethodException`, which is caught and logged as `"[TezPrinterManager] commandApi setup failed"`. Across the whole JAR, `commandApi` is only assigned in `connect(DeviceItem)` (skipped) and `release()` (sets `null`). SPP `OoO08o.connect(boolean)` can still open RFCOMM. `bmp2Gray` returns `null` when `commandApi` is null; `getData` can NPE. **This is our assignment bug:** constructing `new 〇Ooo.〇o0〇o0(modelKey)` (or restoring `connect(DeviceItem)` after a real allow-list) does not require a vendor conversation. Whether a unit has ever physically printed **needs hardware** (logcat + proof). Combined with the 15-second timer that resolves `success = true`, a failure here could be reported to the user as success.
4. **Calls `init()` reflectively** (`printer.javaClass.methods.firstOrNull { it.name == "init" && it.parameterCount == 0 }`).
5. **Invokes `connect(boolean)` reflectively** (`generateSequence(printer.javaClass) { it.superclass }`, taking the first declared method named `connect` with a single `boolean` parameter; `isAccessible = true`; `method.invoke(printer, false)`). **Correction:** this method is **public**, not private. It is declared `public void connect(boolean)` on `Oo0` and `o8o0`, and `public final` on `OoO08o`. It isn't part of the documented `Printer` API, which is why it's looked up by name.

*`modelKey` values:* `resolveModelKey(deviceName)` returns `"380"` (name contains `380`, starts with `tp3z`, or contains `3120`), `"YC3121"` (`yc3121` / `3121`), `"Z212"`, `"GE920"`, or `"Y50"` (contains `y50`, `tez`, `seznik`, `shakti`, starts with `yx`, or matches the word `tej`). Otherwise it returns `DEFAULT_MODEL_KEY = "Y50"`. Names containing `tejas`, `rudra`, `josh`, `dev`, `veer`, `caysn` or `td404` are forced to `"Y50"`. Because of step 3, the chosen `modelKey` currently reaches only `DeviceItem.modelKey`, not `commandApi`.

`SDKUtils.init(app, "sez-print")` passes a merchant key whose effect can't be determined from the obfuscated code.

**Integration risks.**
- **The most fragile integration of the five.** Reflection by name on obfuscated members will break silently on any SDK update, and the `commandApi` step above appears to be broken already (hardware check required).
- **It circumvents a vendor licensing gate.** That is a commercial/legal question, not only a technical one.
- **A wrong `modelKey` is undetectable.** It means the wrong command dialect.
- **Page size is whole-mm only**, and 8 dots/mm is hardcoded; `Command.DPI()` is unused.
- **False success.** If the SDK's `readCall` never fires, a 15-second safety timer resolves the print as `success = true`.
- **Our-bridge — `isAvailable` is hardcoded `true`.** `Function("isAvailable") { true }` in `TezPrinterModule.kt` performs no SDK, Bluetooth, or init check.
- **Our-bridge — no `OnDestroy`.** `OnCreate` initializes the manager; teardown never stops the scanner or releases the printer. Contrast Josh (`manager?.destroy()`), Dev (`closeHandle()`), TD-404 (`closeSocket()`).
- **Content can shrink.** `containFitToPage` aspect-fits and centres, so a bitmap whose aspect ratio differs from the rounded page shrinks.
- **Shares the `libPrinterNative.so` collision** described under Label X (different sha256; `pickFirst` keeps one). **Class-level reverse dependency:** current `PrintSDK-68.jar` has no `Code941`/`Compress` class files, but `NativeManage` still calls them; those classes live in the Luck AAR. Removing the Label X module can therefore `NoClassDefFoundError` Tez without Tez having copied Label X’s `.so`.
- **No network licence check.** Unlike Label X, neither `PrintSDK-68.jar` nor Tez's `libPrinterNative.so` contains any HTTP URL (only the clang toolchain string). The only gate is the local `test3` allowlist.
- No iOS SDK.

---

## Summary Table (ascending integration difficulty)

| Rank | SDK / File Name | Printer Name | Input Format (Contract) | Problems We Can Face | Accuracy Benchmark | Transport | Open Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Ninestar `labelprinter.jar` (`modules/td404-printer`) — SDK linked but unused at runtime; module writes raw TSPL | SEZNIK TEJAS / RUDRA (TD-404) | TSPL: `SIZE` in fractional mm + `BITMAP` 1-bit packed rows in device dots (module-generated). SDK builders themselves are integer-mm/dots only. | Hardcoded 12 dots/mm vs nominal 11.97; no DPI query in the path used; AAR manifest forces `usb.host required=true` if ever linked; Kotlin comments claim `LabelCommand` use that doesn't exist; SPP only in app. | Not measurable from SDK files; needs caliper test. Quantization is 0.083 mm/dot at 12 dots/mm. If the head is truly 304 DPI, the 12 vs 11.97 dots/mm assumption is a 0.26 % scale error (0.26 mm per 100 mm). | SDK: SPP, BLE, TCP 9100, USB. App: SPP (own RFCOMM). Backend: TCP. | Drop the SDK entirely and keep raw TSPL? Real dots/mm per unit (12 / 11.97 / 11.81)? Expose TCP from the app directly? |
| 2 | Caysn AutoReplyPrint (`autoreplyprint.jar` + `libautoreplyprint.so`, JNA; `nzio.jar` unused) | SEZNIK DEV (DEV-7299 58 mm), Veer | Raw bytes via `CP_Port_Write`: TSPL (`SIZE` mm + `BITMAP` dots) or ESC/POS `GS v 0` raster rows. SDK also offers a dot-based `CP_Label_*` drawing API (unused). | Labels > 47.25 mm: bitmap uniformly downscaled (378-dot cap, 378/400 = 0.945 on both axes); TSPL `SIZE` still requested mm; 8 dots/mm hardcoded despite `GetPrinterResolutionInfo`; TSPL `GAP` rounded to whole mm; two command sets with user-chosen default; repo docs are for a different library; iOS binary is a different 2017 library. | Not measurable from SDK files; needs caliper test. 0.125 mm/dot at 8 dots/mm. Code-level: 50 mm design’s **bitmap** is 47.25 mm wide; `SIZE` remains 50 mm. | SDK: SPP, BLE, TCP, USB, serial, Wi-Fi P2P. App: SPP (+ raw RFCOMM fallback). | Keep the 47.25 mm symmetric downscale or print 1:1 with calibration? Default TSPL or ESC/POS per firmware? Adopt SDK resolution query / stored label-position adjustment? |
| 3 | DothanTech LPAPI (`LPAPI-2026-01-08-R.jar`) | SEZNIK JOSH | Either (a) mm-native job: `startJob(wMm, hMm)` + `drawBitmap(bmp, x, y, w, h mm)` / vector `draw*` + `commitJob`, or (b) pixel `printBitmap(Bitmap, Bundle)` sized by device DPI. Params in 0.01 mm (`*_01MM`) or px. | Gap sent in whole mm into a 0.01 mm field (3 mm → 0.03 mm) — **code fixed 2026-09-23, hardware check pending**; DPI taken from the app setting (203 unless exactly 300), never from `getPrinterInfo().deviceDPI`; reflection into obfuscated `com.dothantech.common.a.g` plus direct calls to `com.dothantech.b.b`; 4-strategy fallback may double-submit; unverified model-name list. | Not measurable from SDK files; needs caliper test. At 203 DPI, 0.125 mm/dot. If a unit reports 300 DPI, the current pixel path would print at 67.7 % size. Native offsets resolve to 0.01 mm. | SDK: SPP, BLE, DUAL, Wi-Fi, USB. App: Bluetooth. | Pixel path vs mm-job path vs SDK vector drawing (sharper text/barcodes, loses exact editor parity)? Push calibration via `HORIZONTAL/VERTICAL_OFFSET_01MM` or keep baking into pixels? |
| 4 | LuckPrinter `LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` (+ bundled `libPrinterNative.so`) | SEZNIK LABEL X / MiniX / GD985 | Bitmap only: `printTag` / `print` / `printBlackTag(Bitmap, copies, cb)`; physical size = pixels ÷ printer DPI; label length from gap sensor. No mm parameter (except deprecated `printSheetLabel`). | Online key check posts `sn`, `mac`, `model`, `softwareVersion`, `bluetoothname` to the vendor server with the demo key (501/505 → forbidden callback, which we don't listen to); `libPrinterNative.so` replaced by Tez's copy via `pickFirst` (build-verified); Tez depends on this AAR's JNI classes; custom `commandMap` is dead code; height not enforced; width truncated; `is304Dpi()` unused; BLE unavailable without FastBle; single connection. | Not measurable from SDK files; needs caliper test. 0.125 mm/dot at 203 DPI; width truncation up to 1 dot. Label height accuracy depends on the bitmap and gap sensor, not an SDK parameter. | SDK: Classic BT (SPP), BLE (needs FastBle), Wi-Fi provisioning. iOS: BLE. App: Classic BT. | Obtain our own `asKey`? Accept/disclose SN+MAC transmission? Offline requirement? Which `libPrinterNative.so` build ships? |
| 5 | "PrintSDK-68" (`PrintSDK-68.jar` + `libPrinterNative.so`, obfuscated) | SEZNIK TEZ / SHAKTI (Y50-family model keys) | Bitmap only via `PrintImgHelper` build chain; page size `CreatePage(int mm, int mm)`; threshold applied by SDK. | Connect path bypasses the vendor allowlist via reflection on obfuscated members (verified); reflective `commandApi` construction targets an abstract type and always fails — **fixable in our code** by constructing `〇Ooo.〇o0〇o0(modelKey)` (print effect still needs hardware); `modelKey` guessed from name; runtime `Code941`/`Compress` resolve from the Luck AAR; whole-mm page size; 8 dots/mm hardcoded (`Command.DPI()` unused); 15 s timer reports success without a printer ACK; aspect-fit may shrink content; `libPrinterNative.so` `pickFirst` clash. | Not measurable from SDK files; needs caliper test. 0.125 mm/dot at 8 dots/mm. Code-level: page size rounded to whole mm (up to ±0.5 mm per axis). | SDK: SPP, BLE, Wi-Fi, USB, Wi-Fi config. App: SPP. | Get vendor authorization/allowlisting for Seznik names instead of bypassing? Query `Command.DPI()`? Treat timeout as failure? |

**Ranking basis.** This order reflects the evidence above: how much of the contract we already control (TD-404 and Dev are raw bytes we generate), how many unit/scale defects exist, and how much depends on obfuscated internals, licence checks or shared native code (Label X, Tez). A different **rollout order** for Phase 6 (dev → Label X → Tez/Shakti → Tejas/Rudra → Josh) was requested on 2026-09-23. It is recorded in `ARCHITECTURE_REDESIGN_PLAN.md` Phase 6 as the implementation sequence, with the reasons it differs from this ranking.

---

## Cross-Cutting Findings

These weren't part of the per-SDK questions but affect every driver:

- **Android only.** All five Expo modules declare `"platforms": ["android"]`, and the repo has no `ios/` project. iOS binaries exist only for Label X (`LuckBleSDK.xcframework`) and Dev (a *different* 2017 PrinterLibs framework); TD-404 has an iOS PDF only; Josh and Tez have nothing.
- **No shared protocol layer.** TSPL is generated in three independent places (`DevPrinterModule.kt`, `Td404PrinterModule.kt`, `src/lib/printer/tsc.ts`), each with its own rounding rules.
- **Every driver re-rasterizes.** Each module decodes a PNG and applies its own scaling, threshold or dither, with a hardcoded DPI. The Phase 4 1-bit buffer can't pass through unchanged without new native entry points.
- **No ProGuard/R8 keep rules** exist for `com.sun.jna`, `com.caysn`, `com.print`, `com.dothantech`, `com.luckprinter` or `com.ninestar`. Release minification is currently off (`android.enableMinifyInReleaseBuilds=false`), so this is latent. Turning minification on would break JNA, the JNI bindings, and the reflection-by-name lookups in Tez and Josh.
- **Unused binaries:** `td404-printer/android/libs/labelprinter.aar` and `dev-printer/android/libs/nzio.jar`.
- **The Tez and Label X modules are not independent.** They share one packaged `libPrinterNative.so` (Tez's build), and Tez needs Label X's `Code941` / `Compress` classes. Any plan that treats the five drivers as isolated adapters has to resolve this first.
- **The local `android/` folder is stale relative to `app.json`.** It lacks the `with-android-packaging` injections, so a local Gradle build fails on the native-library clash until `expo prebuild` is re-run (verified 2026-09-23).
- **Calibration is already persisted per device.** `src/stores/printer-store.ts` stores `printCalibration` (H/V offsets) in AsyncStorage, keyed by `deviceId` (the Bluetooth MAC on Android) and falling back to `sdkId`.
- **Marketing copy overclaims.** `src/constants/printer-models.ts` describes Josh as "native LPAPI vector graphics" and Label X as a "Vector & Die-Cut Engine." Both currently print bitmaps.

---

## Open Questions for Product

> Items 1, 2, 5 and 6 are **product/legal decisions. Do not resolve them in code without sign-off.** The code currently keeps the status quo for each.

1. **Tez licensing gate (product + legal).** Our Tez connect deliberately skips the SDK's `connectBefore` → `NativeUtil.test3` device-name check by driving obfuscated internals via reflection (§5). Options: (a) request vendor authorization — an allowlisted "Seznik" name, the `8888PRINT8888` wildcard in the printer's BT name, or a merchant key that makes the normal `Printer.connect(DeviceItem)` path pass; or (b) keep the reflection workaround and accept the commercial/legal exposure and fragility. Input for the decision: the workaround's `commandApi` step appears to fail already (static analysis; hardware check pending). Option (a) would restore the SDK's own initialisation.
2. **Label X device-data transmission (product + legal).** Whenever a Label X printer is connected, the SDK POSTs `asKey`, `sn`, `mac`, `model`, `softwareVersion` (the printer's reported version) and `bluetoothname` to `https://api.gj.luckjingle.com/api/sdk/check2`, using the vendor's **demo** key. Options: (a) obtain our own `asKey` from LuckPrinter; (b) keep the demo key and disclose the transmission in the privacy policy; (c) require fully offline operation (needs a hardware test with no network; the code path suggests a null response just retries, and rejection only notifies listeners we don't register). These aren't exclusive — (a) and (b) may both be needed.
3. **Which `libPrinterNative.so` ships.** Tez and Label X each bundle a different build of the same native library; only one can be packaged, and today it is Tez's (build-verified). Do we ask the vendor for a single build certified for both, or accept the current `pickFirst` (Tez copy) after hardware-testing Label X on it? Note that Tez also depends on Label X's JNI classes, so the two can't be separated without vendor help.
4. **Josh integration path.** LPAPI supports three paths: pixel `printBitmap`, mm-job `drawBitmap`, or native vector drawing (text and barcodes rendered by the printer SDK). Vector gives sharper output but gives up exact parity with the editor preview. Which is the product default?
5. **Dev 47.25 mm symmetric downscale (product).** Labels wider than 378 dots (47.25 mm) are uniformly scaled to fit, so a 50 × 30 mm design prints at 47.25 × 28.35 mm (94.5 %). Options: (a) accept this as a trade-off (keeps content inside the mechanically safe zone of the 58 mm DEV-7299); or (b) print 1:1 and rely on per-unit calibration, which risks edge clipping if the real printable width is narrower. Needs a caliper test of the real printable width either way. Related: should TSPL or ESC/POS be the default command set for shipped DEV firmware?
6. **TD-404 dots/mm (hardware measurement, not a code guess).** `Td404PrinterModule.kt` hardcodes 12.0 dots/mm for its "304 DPI" profile. The candidates are 12.0, 11.97 (nominal 304 DPI) and 11.81 (300 DPI). The difference is up to 1.6 % (1.6 mm per 100 mm). This must be settled by printing a long ruled proof (e.g. 100 mm) on each TD-404 / Tejas / Rudra unit type and measuring it with calipers. Do not change the constant until that measurement exists.
7. **DPI source of truth.** Four SDKs can report DPI or head width (Dev `GetPrinterResolutionInfo`, Josh `deviceDPI`/`deviceWidth`, Label X `is304Dpi`/`getPrintWidth`, Tez `Command.DPI()`). If the device answer disagrees with the selected profile, which wins? For TD-404 (no query), is the user's 203/304 choice sufficient once item 6 is measured?
8. **Calibration storage key and scope.** Today offsets are keyed by `deviceId`, which is the Bluetooth MAC on Android. Open cases:
   - **TD-404 over Wi-Fi/TCP 9100** has no Bluetooth MAC; an IP address is not stable (DHCP). An alternate key is needed: printer serial (if TD-404 exposes one — undocumented), the Wi-Fi MAC (if obtainable over TCP — undocumented), or a user-assigned printer name.
   - **iOS** (if in scope) exposes per-phone CoreBluetooth UUIDs, not MACs; the printer serial number (Josh `mcuId`, Label X `printerSNLuck`) is the likeliest stable key where an SDK exposes one.
   - Scope: offsets-only, or also density, speed and detected DPI?
   - Where an SDK accepts offsets natively (Josh `*_OFFSET_01MM`, Dev's printer-stored position adjustment), do we push calibration to the printer or keep baking it into the bitmap?
9. **Transport scope and defaults.** Today the app uses only Bluetooth SPP. Which extra transports are in scope for v1 (TD-404 Wi-Fi/TCP 9100 direct from the phone rather than via the Node backend; USB OTG for TD-404/Dev/Tez; BLE for Label X, which needs FastBle)? When a printer supports several, which is the default?
10. **iOS scope.** None of the five drivers has an iOS implementation, and three of the five have no iOS SDK in the repo. Is iOS printing a requirement, and if so, for which models?
11. **Firmware updates.** Tez (`Command.update`) and LuckPrinter (`updatePrinterLuck`) expose OTA firmware update. Should the app expose that, or explicitly avoid it?
12. **Unused SDK files.** Can `labelprinter.aar` and `nzio.jar` be removed, and should the vendor demo trees under `backend/` stay in the repo?
