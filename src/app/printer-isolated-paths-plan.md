# Printer Routing Architecture — Implementation Plan

**Goal:** one isolated communication path per printer brand. When a user connects to one
printer, that path is open and **every other path is closed**. Print jobs route through the
active path only, and land accurately.

**Scope:** connectivity, routing, dialect selection, job dispatch. The rendering/canvas
engine is already built and is **not** touched by this plan.

---

## 1. SDK Map

| Brand | SDK | Library | Dialects | Dialect kind | iOS |
|---|---|---|---|---|---|
| **DEV 2-in-1** | AutoReplyPrint | `autoreplyprint.jar` + JNA + `.so` | TSPL, ESC/POS | per-job | Impossible (JNA) |
| **JOSH** | DothanTech LPAPI | `LPAPI-2026-01-08-R.jar` | vector, bitmap, ESC/POS, TSPL | **device setting** | Ask vendor |
| **TEJAS / RUDRA** | Ninestar TD-404 | `labelprinter.aar` | TSPL, ESC/POS, CPCL | per-job | SDK corrupt, re-request |
| **LABELX** | LuckPrinter v1.3.8 | `LuckPrinterSdk_*_V1.3.8.aar` | bitmap only | n/a | `LuckBleSDK.xcframework` present |
| **TEZ / SHAKTI** | Y50 | `YXSDK` — **missing** | unknown | unknown | unknown |

---

## 2. Architecture

```
          app screens (editor · bulk · excel · pdf · image-to-label)
                              |
                              v
  ┌──────────────────────────────────────────────────────────┐
  │  printer-core  (pure TS — no native code)                 │
  │    contract · registry · router · discovery · queue       │
  └──────────────────────────────────────────────────────────┘
                              |
                          registry
                              |
   ┌──────────┬──────────┬──────────┬──────────┬──────────┐
   │   DEV    │   JOSH   │  TEJAS/  │  LABELX  │   TEZ/   │
   │          │          │  RUDRA   │          │  SHAKTI  │
   └──────────┴──────────┴──────────┴──────────┴──────────┘
        isolated native bridge per SDK — one folder each
```

**Rule:** each bridge is completely independent inside. They share nothing but the
TypeScript interface they expose. App screens never learn a brand name exists.

**Rule:** anything singular at the OS level (the Bluetooth radio, the active connection,
the job queue) lives **once**, in `printer-core`. It cannot live inside a bridge, because
bridge A has no way to know bridge B just took the radio.

### Folder layout

```
packages/
  printer-core/
    contract.ts          PrinterDriver, PrinterCapabilities, RasterJob
    registry.ts          driverId -> driver
    router.ts            ISOLATION: mutex + epoch + closeAll
    discovery.ts         ONE shared scan, per-driver claims() filters
    queue.ts             persisted serial bulk queue
    profiles.json        per-model geometry (dpi, head width, offsets)
    status.ts            unified PrinterStatus mapping

  printer-dev/           exists — migrate to contract
  printer-josh/          new — LPAPI
  printer-tejas/         new — Ninestar TD-404
  printer-labelx/        new — LuckPrinter
  printer-tez/           blocked on SDK
  printer-generic-spp/   fallback: raw RFCOMM + TSPL
```

`printer-generic-spp` is worth building early: it unblocks TEZ/SHAKTI today, covers the
next brand before its SDK arrives, and is a safety net when a vendor SDK misbehaves.

---

## 3. The Contract

Every bridge implements this. Nothing more, nothing less.

```ts
export type Transport = 'spp' | 'ble' | 'usb' | 'net';
export type Dialect   = 'vector' | 'bitmap' | 'tspl' | 'escpos' | 'cpcl';
export type Media     = 'gap' | 'bline' | 'continuous' | 'circle';

export interface PrinterCapabilities {
  driverId: string;
  platforms: ('android' | 'ios')[];
  transports: Transport[];
  dialects: Dialect[];
  defaultDialect: Dialect;
  dialectIsDeviceSetting: boolean;   // true = persists on hardware (JOSH only)
  dpi: 203 | 300;
  headWidthDots: number;
  maxLabelHeightMm: number;
  nativeCopies: boolean;             // can do PRINT n,m
  statusQuery: boolean;
  physicalCompletionCallback: boolean; // true = success means paper fed out
  maxChunkBytes: number;             // 2048 SPP · <=500 BLE
  mediaTypes: Media[];
  requiresLicenseKey: boolean;       // LABELX asKey
}

export interface RasterJob {
  png: string;           // base64, ALREADY at exact dot size
  widthMm: number; heightMm: number; gapMm: number;
  media: Media;
  copies: number; density: number; speed: number;
  rotation: 0 | 90 | 180 | 270;
  hOffsetMm?: number; vOffsetMm?: number;
  dialect?: Dialect;
}

export interface PrinterStatus {
  ready: boolean;
  noPaper: boolean; coverOpen: boolean; overheat: boolean;
  lowBattery: boolean; busy: boolean; labelNotDetected: boolean;
  raw?: Record<string, unknown>;
}

export interface DeviceDialects { supported: Dialect[]; active: Dialect }

export interface PrinterDriver {
  readonly capabilities: PrinterCapabilities;

  claims(device: DiscoveredDevice): boolean;   // discovery filter only

  connect(deviceId: string, name?: string): Promise<ConnectedDevice>;
  disconnect(): Promise<void>;                 // MUST be idempotent + total
  isConnected(): boolean;

  getStatus(): Promise<PrinterStatus>;
  getDialects(): Promise<DeviceDialects>;
  setDialect(d: Dialect): Promise<void>;
  calibrate?(media: Media): Promise<void>;

  printRaster(job: RasterJob, onProgress?: (p: Progress) => void): Promise<PrintResult>;
  printVector?(doc: VectorDoc): Promise<PrintResult>;   // JOSH only

  onDisconnected(cb: (reason: string) => void): () => void;
}
```

### Why raster is the canonical contract

- A **command-level** seam (app emits TSPL) fails — JOSH's LPAPI cannot accept a byte
  stream, and LABELX has no command language at all.
- A **raster** seam works everywhere: DEV `BITMAP`, TEJAS `addBitmap`, LABELX `printTag`,
  JOSH `printBitmap`.

`printVector()` is an **optional upgrade**, implemented only by JOSH. Use it when
`capabilities.dialects` includes `vector` and the template is vector-expressible (text,
barcode, QR, lines, boxes — no photos, no custom fonts). The printer renders natively, so
text and barcodes come out sharper. Fall back to raster otherwise.

---

## 4. Isolation — the core requirement

Enforced at **three** layers. Any one alone leaks.

### 4.1 Router (TypeScript)

```ts
type Route = { driverId: string; deviceId: string; epoch: number; dialect: Dialect };

class PrinterRouter {
  private route?: Route;
  private epoch = 0;
  private lock = new Mutex();

  /** Close EVERY registered driver, not just the one we believe is open. */
  private async closeAll() {
    this.route = undefined;
    this.epoch++;                                  // invalidate queued jobs FIRST
    await Promise.allSettled(
      registry.all().map(d => d.disconnect().catch(() => {}))
    );
    await sleep(300);                              // radio settle — not optional
  }

  async open(driverId: string, deviceId: string, dialect?: Dialect): Promise<Route> {
    return this.lock.runExclusive(async () => {
      await this.closeAll();

      const driver = registry.get(driverId);
      await driver.connect(deviceId);

      const d = dialect ?? driver.capabilities.defaultDialect;
      if (driver.capabilities.dialectIsDeviceSetting) {
        const live = await driver.getDialects();     // read hardware truth
        if (live.active !== d) await driver.setDialect(d);
      }

      this.route = { driverId, deviceId, epoch: ++this.epoch, dialect: d };
      driver.onDisconnected(() => { this.epoch++; this.route = undefined; });
      return this.route;
    });
  }

  async send(job: RasterJob, epoch: number) {
    const r = this.route;
    if (!r || r.epoch !== epoch) throw new StaleRouteError();
    return this.lock.runExclusive(() =>
      registry.get(r.driverId).printRaster({ ...job, dialect: r.dialect })
    );
  }
}
```

Two details that carry the whole design:

- **`epoch++` happens before the disconnects**, not after. Any job already in the queue is
  invalidated the instant a switch begins. Without this, a job queued for TEJAS can land on
  DEV mid-switch.
- **`closeAll()` iterates every registered driver.** TS state and a native handle *will*
  desync — app backgrounded, process restarted, SDK dropped the link silently. Closing only
  the driver you *think* is open is how you end up with two bound SPP sockets and a phone
  that needs a reboot.

### 4.2 Native — release the handle, don't just drop the reference

`disconnect()` must be **idempotent and total** in every bridge.

| Bridge | Required teardown |
|---|---|
| DEV | close output stream → close socket → `CP_Port_Close` → null all three *(already correct in `closeHandle()`)* |
| JOSH | `api.closePrinter()` → **`api.quit()`** → `api = null` — singleton from `LPAPI.Factory` |
| TEJAS/RUDRA | `portManager.closePort()` → **`portManager = null`** — it is a `static` field |
| LABELX | `disconnectLuck()` → `scanHelper.unInit()` → null helper |

JOSH and TEJAS hold **global/static state**. Dropping the Java reference without calling
`quit()` / `closePort()` leaves the link bound and the next connect to a different brand
fails with no useful error. **This is the single most likely cause of "printer A works
until I try printer B."**

Also wire teardown to the Expo module's `OnDestroy` so a process restart cannot orphan a
handle.

### 4.3 Discovery — one radio, one scan

Do **not** let each bridge run its own scan. Concurrent classic discovery + BLE scans
produce duplicates, missed devices and flaky connects.

- One scan in `printer-core/discovery.ts`.
- Each bridge contributes only `claims(device) => boolean` — name prefix, MAC OUI, service UUID.
- User sees **one** device list, each row pre-tagged with its driver. No brand dropdown.
- If two drivers claim one device, rank by specificity, let the user override once, remember it.

Existing filters to reuse: DEV `isLikelyDev(name)`; LABELX `LuckPrinterInfo.filterPrefixList`
(and `ClassicScanDeviceHelper` already returns only supported printers).

**Action:** collect the Bluetooth name prefix for all five brands as shown in the phone's
pairing list.

---

## 5. Fast, reliable connect

Most slow connects are a 12-second inquiry you didn't need.

1. **Cache `{mac, name, driverId, dialect}` on first success.** On reconnect go straight to
   `adapter.getRemoteDevice(mac)`. No scan. ~14 s → under 2 s.
2. **Cancel discovery before connecting, always.** RFCOMM is unreliable during inquiry:
   ```kotlin
   if (adapter.isDiscovering) { adapter.cancelDiscovery(); Thread.sleep(200) }
   ```
3. **Bond first, connect second.** If `bondState != BOND_BONDED`, call `createBond()` and
   wait for `ACTION_BOND_STATE_CHANGED` rather than letting the socket trigger pairing.
4. **Hard 6–8 s timeout per attempt**, then fall through. Never let a hung SDK call block the UI.
5. **Don't call `fetchUuidsWithSdp()`** — an SDP round trip costing seconds. All of these are
   SPP: use `00001101-0000-1000-8000-00805F9B34FB`.
6. **Fallback chain:** vendor SDK open → `createInsecureRfcommSocketToServiceRecord` →
   reflection `createRfcommSocket(1)`. DEV's mode order (`[1,0]` bonded, `[0,1]` unbonded)
   is the reference.
7. **Keep the socket open across a session.** Never reconnect per label.
8. **Keepalive:** status poll every ~20 s. These printers auto-sleep and drop SPP silently;
   a failed poll counts as a disconnect.

---

## 6. Dialect selection per brand

Same dropdown in the UI, different mechanics underneath. `dialectIsDeviceSetting` is what
keeps the screen from having to know.

### TEJAS / RUDRA — safe, client-side

Pure byte-builder choice. Nothing written to the device.

```kotlin
val bytes: Vector<Byte> = when (dialect) {
    "tspl" -> LabelCommand().apply {
        addUserCommand("\r\n")
        addSize(widthMm, heightMm); addGap(gapMm)
        addDirection(DIRECTION.FORWARD, MIRROR.NORMAL)
        addReference(0, 0); addDensity(DENSITY.DNESITY15)
        addQueryPrinterStatus(RESPONSE_MODE.ON)      // per-label handshake
        addCls()
        addBitmap(0, 0, BITMAP_MODE.OVERWRITE, bmp.width, bmp)
        addPrint(copies, 1)
    }.command

    "escpos" -> EscCommand().apply {
        addInitializePrinter()
        addRastBitImage(bmp, bmp.width, 0)
        addPrintAndFeedLines(3)
    }.command

    "cpcl" -> CpclCommand().apply {
        addInitializePrinter(heightDots, copies)
        addEGraphics(0, 0, widthBytes, heightDots, bmp)
        addPrint()
    }.command
}
portManager.writeDataImmediately(bytes, /* isReadReceive = */ true)
```

All three accept a bitmap (`addBitmap` / `addRastBitImage` / `addEGraphics`), so the
existing render engine feeds every dialect unchanged.

### JOSH — persistent device setting, handle with care

Not on the `LPAPI` class. It lives on `IDzPrinter` / `IDzPrinter2` underneath
(`LPAPI(IDzPrinter, Callback)`):

```java
// com.dothantech.printer.IDzPrinter2$PrinterParam
int   language;              // current
int[] supportedLanguages;    // what THIS unit accepts
int   printerDPI, printerWidth, paperWidth;

// IDzPrinter2
PrinterParam getPrinterParam();
boolean      refreshPrinterParam();
boolean      setPrinterParam(Bundle);        // key "LANGUAGE"

// IDzPrinter
boolean command(byte[]);                     // raw passthrough
boolean print(IAtESCPOS, Bundle);            // ESC/POS object path
```

Four routes: **vector** (`startJob` → `drawText`/`draw1DBarcode`/`draw2DQRCode` → `commitJob`),
**bitmap** (`printBitmap`), **ESC/POS**, **raw** (`command(byte[])`).

Two warnings:

- `setPrinterParam(LANGUAGE)` **persists across power cycles**. If a user flips JOSH to
  ESC/POS and the app then sends vector jobs, output is garbage until flipped back. Put it in
  a *device settings* screen, not a per-job toggle. Always `refreshPrinterParam()` +
  `getPrinterParam()` after connect and show hardware truth.
- The integers in `supportedLanguages[]` are **not named constants** in the jar. Log the
  array per model on first connect and build the mapping, or request the enum from DothanTech.

### DEV — per-job, but geometry differs

`commandSet: 'tspl' | 'escpos'` already exists in the module. Not a neutral toggle: the
ESC/POS path **ignores `heightMm`**, derives size from bitmap aspect, centres on the
printhead rather than the label, and byte-aligns height. Label stock defaults to TSPL;
picking ESC/POS must warn *"receipt mode — label height and gap sensor ignored."*

### LABELX — no dialect at all

Bitmap-only. `dialects: ['bitmap']` → UI hides the dropdown when `dialects.length === 1`.
Paper type is selected by **method**, driven by `RasterJob.media`:

```java
printTag(bitmap, copies, cb);        // gap labels
printBlackTag(bitmap, copies, cb);   // black mark
printCircleTag(bitmap, copies, cb);  // circular
printLuck(bitmap, copies, cb);       // continuous
// grayscale variants: printTag(bitmap, isGray, grayLevel, copies, cb)
```

---

## 7. Bulk print queue

Where reliability actually breaks.

- **One serial FIFO queue, persisted to disk.** Per-item state:
  `pending → rendered → sent → confirmed | failed`. Killed at label 300 of 500 → resume at 301.
- **Never fire hundreds of writes back-to-back.** These buffers are single-digit KB. Overrun
  gives truncated labels, garbage, or a silent stall that looks like a hang.
- **Identical labels** → native copies (`PRINT n,m`) where `capabilities.nativeCopies`.
- **Variable data** (Excel) → one label at a time, gated on a handshake.

### Gating signal per brand — use the strongest available

| Brand | Signal |
|---|---|
| TEJAS/RUDRA | `addQueryPrinterStatus(RESPONSE_MODE.ON)` + `isReadReceive=true` → `onReceive` — **true per-label handshake** |
| LABELX | `onPrintSuccess()` fires only when **paper has physically fed out**, plus `onPrintIndexStart/End` page progress |
| JOSH | `onPrintProgress` + `waitPrinterState` |
| DEV | `getStatus()` poll |
| fallback | computed delay = transfer time + `labelHeightMm / speedMmPerSec` |

### Retry policy

A write that failed **mid-label** is not safe to blindly retry — you can get a half label
followed by a full one, silently corrupting a numbered run. Policy: mark that item failed →
reconnect → reprint that single item → log it. Keep a per-item audit trail so the operator
can reconcile against physical output.

### Unified status

Map every SDK's codes onto one `PrinterStatus` so the error UI is identical everywhere.
LABELX reference set: `OUTPAPER`(0), `OPENCOVER`(1), `OVERHEAT`(2), `LOWVAL`(3),
`PRINTTING`(4), `RECHARGE`(5), `NOT_LABEL`(6), `-1` = connection lost.

---

## 8. Geometry lives in data, not code

The DEV bridge currently hardcodes 384-dot head, 378-dot print zone, 1.37 mm head offset.
That's specific to the DEV-7299 mechanism. Move all of it to `profiles.json`, keyed by model
string and refreshable from your server — otherwise every new model needs an APK release.

```json
{
  "DEV-7299": { "dpi": 203, "headWidthDots": 384, "printableDots": 378,
                "headOffsetLeftMm": 1.37, "maxWidthMm": 48 },
  "TD-404":   { "dpi": 203, "headWidthDots": 832, "printableDots": 832,
                "headOffsetLeftMm": 0,    "maxWidthMm": 104 }
}
```

Render at the **printer's** dpi (203 dpi = 8 dots/mm), never the phone's, and snap barcode
module widths to whole dots or scan rates drop.

---

## 9. iOS reality

| Brand | iOS status |
|---|---|
| DEV | **Impossible.** JNA + `.so` have no iOS equivalent. Module already returns `null`. |
| LABELX | **Ready.** `LuckBleSDK.xcframework` (ios-arm64 + simulator) + `ImageDataProcesser.xcframework`. BLE via `JKBleManager` — `scanPrinters` / `connect:timeout:` / `disconnect:`, NSNotification-driven, singleton `printer` property. |
| TEJAS/RUDRA | SDK exists but your upload is **corrupt** — every file under `Print Label SDK-IOS` is an AppleDouble `._` stub. Re-request. Their iOS API is BLE, `sepSize <= 500` byte chunks, behaviour branches on chip type (FYT/JH/HF/JL). |
| JOSH | DothanTech publishes an iOS LPAPI framework — not in your zip. Request it. |
| TEZ/SHAKTI | Unknown. |

**Structural constraint:** iOS cannot open Bluetooth Classic/SPP unless the printer is
MFi-certified (ExternalAccessory). Most cheap thermal printers are not. **On iOS, only BLE
printers work.** Put `platforms` in the capability descriptor and have the UI say
*"this printer is Android-only"* rather than failing mysteriously.

BLE also caps writes near 500 bytes vs 2048 over SPP. A 384×480 raster label ≈ 23 KB —
seconds per label. Build a real progress UI.

**Expo:** these are native modules, so EAS development builds only (not Expo Go). Config
plugin needed for `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` (Android 12+, `neverForLocation` or
location permission) and `NSBluetoothAlwaysUsageDescription` on iOS.

---

## 10. Per-bridge notes

### DEV — migrate, don't rewrite
1. `printDevPngLabel` → `printRaster`
2. add `capabilities` (`dialects: ['tspl','escpos']`, `dialectIsDeviceSetting: false`)
3. lift `BroadcastReceiver` into shared discovery; keep `isLikelyDev()` as `claims()`

Everything else is already correct — it is the reference implementation.

### TEJAS / RUDRA
- `PrinterManager.portManager` is **static** → null it on disconnect
- Vendor sleeps 300 ms between `closePort()` and next `openPort()` → keep it
- `openPort` / `closePort` / `writeDataImmediately` / `readData` all **block** → executor only, never main thread
- Transports available: `SppBluetoothPort`, `BleBluetoothPort`, `EthernetPort`, `UsbPort`
- Useful extras: `addPeel`, `addTear`, `addCutter`, `addCutterPieces`, `addLimitFeed`, `addReprint`

### LABELX
- **`asKey` required** — invalid/missing key causes disconnect. Procurement blocker.
- **Two region AARs**, ship one: `...China...` vs `...Abroad...`. India → Abroad (confirm; key is region-bound).
- **Network dependency** — requires `okhttp`, pulls online config (`LuckConfig`). Confirm offline behaviour with vendor.
- ABIs are **armeabi-v7a + arm64-v8a only** — won't run on an x86 Android emulator.
- `ClassicScanDeviceHelper` needs `init()` before scan, `unInit()` on destroy.
- Singleton, one connection at a time — matches the isolation model natively.
- Two device families in one SDK: Bluetooth (`LuckPrinter`) and **AI50 WiFi** (`LJWiFiPrinter`,
  BLE prefix `AI50_`, `printerType == 8`, 2.4 GHz only). **Confirm which GD985 is** — if any
  LABELX unit is AI50, that's a second driver, not a config flag.
- ProGuard: keep `com.luckprinter.sdk_new.**`, `com.clj.fastble.**`, `com.itpp.**`, `com.jniclass.**`

### JOSH
- `api.quit()` mandatory on disconnect (singleton)
- Print settings are **stateful on the API object** (`setPrintDarkness`, `setPrintSpeed`,
  `setPrintPageGapType`, `setItemOrientation`, …) — reset between jobs or they leak
- State machine, not a boolean: Connecting(0), Connected(1), Connected2, Printing, Working(4), Disconnected(5)
- Verify you can build `PrinterAddress` from MAC+name and skip `api.discovery()` entirely,
  keeping the unified device list

### TEZ / SHAKTI — blocked
Archive has `YXSDK.java`, `Printer_Y50.java`, `PrintCallBack.java`, plus scan/print/**firmware
update** activities — but **no `app/libs`, no `.aar`, no `.jar`**. Cannot build as shipped.
Point at `printer-generic-spp` meanwhile; many of these are TSPL-compatible over plain SPP.

---

## 11. Build order

| # | Task | Why this position |
|---|---|---|
| 1 | `printer-core` | Nothing testable without it; every bridge is written against it |
| 2 | Migrate **DEV** | Already built — cheapest way to prove the router |
| 3 | **TEJAS/RUDRA** | Best feedback signal (per-label handshake) → prove the bulk queue here so later bridges inherit working logic |
| 4 | **LABELX** | Start `asKey` request day 1, runs in parallel. Then bitmap-only = straightforward |
| 5 | **JOSH** | Hardest: vector path + persistent device language switch. Do it once the rest is settled |
| 6 | **TEZ/SHAKTI** | Blocked on SDK; generic SPP fallback meanwhile |

---

## 12. Open blockers

| Owner | Item |
|---|---|
| LuckPrinter (LABELX) | `asKey`; confirm China vs Abroad AAR for India; **does connect+print work offline?**; is GD985 Bluetooth or AI50 WiFi? |
| Ninestar (TEJAS/RUDRA) | Re-send `Print Label SDK-IOS` — current upload is `._` stubs only |
| DothanTech (JOSH) | iOS LPAPI framework; `supportedLanguages[]` integer enum |
| Y50 vendor (TEZ/SHAKTI) | The actual library (`.aar`/`.jar`); demo re-sent as `.zip` |
| You | **Bluetooth name prefix for all 5 brands** as shown in the pairing list — needed for `claims()` |
| You | Per-model specs: dpi, head width in dots, max label width, media types → `profiles.json` |
