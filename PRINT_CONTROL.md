# Print Control Investigation

> **Date:** 2026-09-23  
> **Scope:** Cancel-while-printing, pause/resume, and buffer/memory reporting on the five vendor printer SDKs.  
> **Not in scope:** Implementing any of these capabilities.  
> **Consumers:** Phase 5 Task 5.2 and Task 5.3 in [`ARCHITECTURE_REDESIGN_PLAN.md`](./ARCHITECTURE_REDESIGN_PLAN.md).

Nothing below was run on a physical printer. A claim that needs a printer is marked **UNVERIFIED (needs hardware)**.

---

## Method

Same standard as [`SDKS.md`](./SDKS.md): static inspection of the binaries and vendor material in this repository.

- **Java:** `javap -public` and `javap -c -p` on each JAR and on the Luck AAR's `classes.jar`.
- **Native:** `nm -D` and `llvm-objdump -d` on `libautoreplyprint.so` (arm64-v8a). `strings` on that library and on Tez's `libPrinterNative.so`. Constant-pool scans of every class file in the Tez and Josh JARs for `stop`, `cancel`, `abort`, `pause`, `buffer`, `memory`, `nextPrint`.
- **Vendor material:** Caysn sample under `dev and veer sdk/android/autoreplyprint_androidsample/` and `dev and veer sdk/docs/AutoReplyPrint_API_Reference.java`. Luck demo and `LuckPrinter_SDK_Integration_Guide-EN.md` under `backend/GD985-SDK/`. The Tez vendor demo directory `backend/Demo_small/` is listed in `.gitignore` and is **not present** in this working tree, so that demo could not be re-read.
- **Our wrappers:** `modules/*-printer/` Kotlin, recorded separately from what the SDK offers.
- **TSPL command meaning** for the Ninestar builders is taken from the published TSPL/TSPL2 programming manual (immediate commands `!R`, `!.`, `!S`, `~!A`). The repo's TD-404 PDF does not document these commands. Whether a given TD-404 / Tejas / Rudra unit implements them is **UNVERIFIED (needs hardware)**.

"Absent" below means the name does not appear in the enumerated public surface of that SDK's printer/helper class, and a constant-pool or export search of the rest of the binary found no additional method of that name.

---

## Summary

| SDK | Printers | Cancel While Printing | Pause / Resume | Buffer / Memory Info |
| :--- | :--- | :--- | :--- | :--- |
| Caysn AutoReplyPrint | Dev, Veer | **PARTIAL** — `CP_Printer_ClearPrinterBuffer(Pointer)`. Writes 5 bytes to the printer. Whether those bytes abort a label the printer has already accepted is **UNVERIFIED**. Our module does not call it. | **NO** | **NO** fill level. Adjacent signals only: `INFO_HAVEDATA`, `INFO_PRINTIDLE`, `INFO_RECVIDLE`, plus a received-byte counter and a printed-page id. `CP_Port_Available` is the phone's unread RX count. |
| LuckPrinter 1.3.8 | Label X, MiniX, GD985 | **PARTIAL** — `INormalDeviceOperation.stopPrintJobLuck` / `stopPrintJobLuckNoCallback`. Writes `10 FF F1 45`. **Not** a method on `PrinterHelper`. Our module does not call it. Effect on bytes already in the printer is **UNVERIFIED**. | **NO** | **NO**. `PrinterStatusData.getIsPrinting()` is a boolean. No buffer, free-memory, or capacity field. |
| PrintSDK-68 | Tez, Shakti | **PARTIAL** — `PrintImgHelper.stopPrint()`. Host-side only: clears the SDK's queues and interrupts its threads. It does not write an abort opcode. Whether the printer finishes data it has already received is **UNVERIFIED**. | **NO**. `nextPrint` is not in this JAR. | **NO**. `Command.get_status()` exists; no buffer or memory query. |
| Ninestar `labelprinter` | TD-404, Tejas, Rudra | **PARTIAL** — no method named cancel/abort/stop. `LabelCommand.addCls()` emits `CLS`, `addResetPrinter()` emits `ESC ! R`. Closing our RFCOMM socket stops further bytes. TSPL `ESC !.` ("cancel all printing files") is **not** wrapped. Hardware effect of `CLS` / `!R` mid-job is **UNVERIFIED**. | **NO** | **PARTIAL** — `addQueryPrinterMemory()` emits `~!A` (TSPL: free memory in bytes, not receive-buffer fill). No reply parser. `SppBluetoothPort.available()` is `InputStream.available()`. Our module calls neither. |
| DothanTech LPAPI | Josh | **PARTIAL** — `cancel()` flags the in-flight SDK job and reports `PrintFailReason.Cancelled`. `abortJob()` drops the local bitmap job. No abort opcode in the cancel handler that was disassembled. Effect on bytes already transmitted is **UNVERIFIED**. Our module calls `abortJob()` only as a pre-test reset, and never calls `cancel()`. | **NO**. `waitPrinterState` polls connection state; it does not resume a held job. | **NO**. `PrinterInfo` and `PrintParamName` have no buffer or memory field. `CMD_BUFFER_SIZE` is an internal error log. |

**Pause/resume:** no SDK exposes a true hold-and-continue. On every printer, the only pause that exists in code is batch-level: do not send the next label.

**Buffer fill:** no SDK reports how full the printer's receive buffer is. Phase 5's "pause rasterization when the printer buffer is full" cannot be built as written. See [Impact on existing plans](#impact-on-existing-plans).

---

## Answers that cut across all five

### 1. Does "cancel" abort a job already sent, or only stop the app from sending more?

| SDK | What the method actually does | Already-sent bytes |
| :--- | :--- | :--- |
| Dev | `CP_Printer_ClearPrinterBuffer` writes `10 05 FF 01 02` to the open port. `CP_Pos_ResetPrinter` writes `1B 40` (`ESC @`). | **UNVERIFIED (needs hardware).** The call does send a command, so it is not only a local flag. |
| Label X | `stopPrintJobLuck` writes `10 FF F1 45` and waits for a reply (`OK` / `AA` in our unused command map). | **UNVERIFIED (needs hardware).** |
| Tez | `stopPrint()` clears in-memory maps and lists, interrupts the bitmap and print threads, calls `Printer.clearTask()`, then posts handler message `102`, which is `What_READ`. No write of a cancel command. | Host stops enqueueing. Data already written to the socket is not recalled by this method. Printer-side outcome **UNVERIFIED**. |
| TD-404 | We own the socket. `closeSocket()` stops further writes. `CLS` and `ESC ! R` are available to write; neither is a method named cancel. | **UNVERIFIED (needs hardware).** |
| Josh | `cancel()` ORs flag `256` into `DzPrinter` and posts a handler message. The `256` branch of `onCancelMessage` reports `PrintProgress.Failed` / `PrintFailReason.Cancelled`. `abortJob()` calls a local teardown and returns `0`. | **UNVERIFIED (needs hardware).** The disassembled cancel path reports failure to the app; it does not show an abort opcode. |

UI wording has to follow this split. "Stop sending" is honest for Tez today. "Abort the printer" is only honest for a command whose effect has been seen on that unit (Dev clear-buffer, Label X stop, TD-404 `CLS` / `!R`). None of those effects have been seen yet.

### 2. Is there true pause/resume anywhere?

No. Searches of every `CP_*` export, every Luck device type's public methods, every Tez class-file constant pool, every Ninestar command builder, and the LPAPI facade found no `pause` or `resume` method.

The only pause available in any of the five is withholding the next label in our own batch loop.

### 3. Does any SDK report buffer fullness, free memory, or remaining capacity?

**No SDK reports receive-buffer fullness** (percent full, bytes free in the Bluetooth/print buffer, or "buffer is full" as a value we can poll for backpressure).

The nearest things, and why they are not that signal:

- **Dev** booleans `INFO_HAVEDATA` (info bit `0x08`), `INFO_PRINTIDLE` (`0x40`), `INFO_RECVIDLE` (`0x80`). Plus `CP_Printer_GetPrinterReceivedInfo` (cumulative bytes the printer reports having received) and `CP_Printer_GetPrinterPrintedInfo` (a printed page id). Those can drive ACK-style pacing. They are not a fill level.
- **Label X** `PrinterStatusData.getIsPrinting()` — printing or not.
- **Tez** `Command.get_status()` — a status query with no buffer field on `Command` or `Printer`.
- **TD-404** `LabelCommand.addQueryPrinterMemory()` emits `~!A\r\n`. The TSPL manual defines `~!A` as "inquires the free memory of the printer" and says the reply is a decimal byte count ended by `0x0D`. That is stored-file / DRAM free space, not the receive buffer. The SDK has no parser for the reply. TSPL `ESC ! S` status byte 2 has a bit meaning "Receive buffer full (RS-232)"; `LabelCommand` does not emit `!S` (its status query is `ESC ! ?`).
- **Josh** `PrinterState.Printing` is a boolean. `CMD_BUFFER_SIZE with ERROR` is a log line inside `DzPrinter` when a response packet looks wrong; it is not a public query.

### 4. Label X, if there is no cancel: what is the least-bad option?

There **is** a cancel command, one level under `PrinterHelper`. Prior inspection of `PrinterHelper` alone was right about that class and wrong about the SDK.

`PrinterHelper`'s 138 public methods include `disconnectLuck()` and `resetPrinterDevice()` and do **not** include `stop`, `cancel`, `abort`, `pause`, or `buffer`. The stop methods are on `INormalDeviceOperation`, implemented by `BaseNormalDevice`:

```java
void stopPrintJobLuckNoCallback();
void stopPrintJobLuck(ResultCallback<Integer> callback);
```

`stopPrintJobLuckNoCallback` writes four bytes: `10 FF F1 45`. `stopPrintJobLuck` writes the same bytes and waits on a read callback (the trailing `bipush 70` is the timeout argument to the transport). `AiYinNormalDevice` overrides this with `10 FF FE 45`. `SeznikMiniX` and `CustomNormalDevice` do not override it, so they use `10 FF F1 45`.

Our module registers every prefix (`Seznik MiniX_`, `LabelX_`, `GD985_`, `MiniX_`, `LuckP_`, `BTW_`) with `printerType("normal")`. `PrinterHelper.initDevice` then constructs `CustomNormalDevice`, which extends `BaseLujiangNormalDevice` → `BaseNormalDevice`, so the stop method is on the object `getPrinter()` / `printerDevice` returns. The caller has to cast to `INormalDeviceOperation`. `PrinterHelper` will not forward the call.

The built-in `sheetlabel.GD985` class implements `ISheetLabelDeviceOperation` and has **no** stop method. It is not the class our prefixes instantiate.

The vendor demo never calls `stopPrintJobLuck`. The integration guide's "factory reset" is `setRecoveryLuck`, which writes `10 FF 04` — a different command.

What the other `PrinterHelper` methods actually do:

| Method | What the bytecode does | Use as a mid-job abort? |
| :--- | :--- | :--- |
| `stopPrintJobLuck` on the device | Sends `10 FF F1 45` | The real candidate. **UNVERIFIED (needs hardware).** |
| `disconnectLuck()` | `c.e.a()` — closes the client port | Drops the link. Least-bad fallback if the stop command does not halt the mechanism. State left on the printer is **UNVERIFIED**. |
| `resetPrinterDevice()` | If **not** connected, replaces `printerDevice` with a new `BaseNormalDevice`. If connected, returns immediately. | Sends nothing. |
| `setRecoveryLuck` | Writes `10 FF 04`. The vendor guide titles this "Factory Reset". | Heavier than an abort. |
| `resetDevice()` | Only if the device is a `BaseLujiangWifiDevice`. | Wi-Fi AI50 factory reset. Our classic-BT path never hits it. |

Our wrapper calls `disconnectLuck()` on user disconnect and never calls `stopPrintJobLuck`. The `commandMap` built in `registerCustomProfiles()` contains the same `10fff145` bytes as a `DISABLE` step, and that map is never passed to the SDK (`setCustomPropertyMap` only stores `PrinterProperty`). That matches the dead-`commandMap` note in `SDKS.md`.

### 5. What happens to a partially sent job when the connection drops?

**UNVERIFIED (needs hardware) on every printer.** Static facts only:

| SDK | What "drop" does in code |
| :--- | :--- |
| Dev | `CP_Port_Close(handle)` closes the port. Our module also has a raw-RFCOMM fallback with its own close. |
| Label X | `disconnectLuck()` closes the client. The module does not call this from a print-cancel path today. |
| Tez | `Printer.disconnect()` / `disconnect_SDK` clears `commandInfos` and releases the helper. Bytes already in the kernel socket are not pulled back. |
| TD-404 | `closeSocket()` closes the RFCOMM socket we own. The SDK port classes are unused at runtime. |
| Josh | `closePrinter()` / `quit()` exist. `cancel(4)` and `cancel(16)` take the disconnect branch inside `onCancelMessage` (`PrinterState.Disconnected`). `cancel()` with no argument is flag `256` (print cancel), not the disconnect flags. |

---

## Per-SDK detail

### 1. Dev / Veer — Caysn AutoReplyPrint

**Files:** `modules/dev-printer/android/libs/autoreplyprint.jar`, `modules/dev-printer/android/src/main/jniLibs/arm64-v8a/libautoreplyprint.so`, vendor sample `dev and veer sdk/android/autoreplyprint_androidsample/`.

**Surface actually present.** The JNA interface `com.caysn.autoreplyprint.AutoReplyPrint` has **151** abstract methods. `nm -D` on the arm64 library exports **167** `CP_*` symbols. The 16 exports with no JNA method are `CP_Proto_*` (firmware update, including `CP_Proto_StopAtBoot`), LPT open/enum, and a few `CP_Label_Draw*` / `CP_Pos_PrintTextInBytes` variants. The "roughly 300" figure counts constants and helpers as well as functions; the callable `CP_*` surface is the 151 methods listed in the appendix. Every one of those 151 names was checked. The only names that match cancel / abort / stop / clear / reset / buffer / pause / memory are:

| Signature | Role |
| :--- | :--- |
| `boolean CP_Printer_ClearPrinterBuffer(Pointer handle)` | Candidate hardware clear. |
| `boolean CP_Printer_ClearPrinterError(Pointer handle)` | Clear error, not a job cancel. |
| `boolean CP_Pos_ResetPrinter(Pointer handle)` | `ESC @`. |
| `boolean CP_Page_ClearPage(Pointer handle)` | ESC/POS page-mode clear (`NZPosPrinter::POS_ClearPage`). Not a receive-buffer query. |
| `int CP_Port_Available(Pointer handle)` | Bytes the SDK can read from the port. |
| `boolean CP_Printer_GetPrinterStatusInfo(Pointer, LongByReference error, LongByReference info, LongByReference timestamp)` | Status bitfields. |
| `boolean CP_Printer_GetPrinterReceivedInfo(Pointer, IntByReference byteCount, LongByReference timestamp)` | Cumulative received-byte count. |
| `boolean CP_Printer_GetPrinterPrintedInfo(Pointer, IntByReference pageId, LongByReference timestamp)` | Printed page id. |
| `boolean CP_Pos_QueryPrintResult(Pointer, int pageId, int timeout)` | Wait for a print result. |

`CP_Proto_StopAtBoot` is a firmware-update export. It is not in the JAR and it is not a print cancel.

**What `ClearPrinterBuffer` sends.** `llvm-objdump` of `CP_Printer_ClearPrinterBuffer` stores `0x01FF0510` little-endian and a following byte `0x02`, then writes **5** bytes and succeeds only if the write returns 5. On the wire: `10 05 FF 01 02`.

**What `ResetPrinter` sends.** `NZPrinter::POS_Reset` writes **2** bytes, `0x401B` as a little-endian halfword: `1B 40` (`ESC @`, ESC/POS initialize).

**Status bits** (`CP_PrinterStatus`, masks from bytecode): errors `ERROR_CUTTER=2`, `NOPAPER=4`, `VOLTAGE=8`, `MARKER=16`, `ENGINE=32`, `OVERHEAT=64`, `COVERUP=128`, `MOTOR=256`. Info `LABELPAPER=2`, `LABELMODE=4`, `HAVEDATA=8`, `NOPAPERCANCELED=16`, `PAPERNOFETCH=32`, `PRINTIDLE=64`, `RECVIDLE=128`. `INFO_NOPAPERCANCELED` is a status the printer reports after a no-paper event; it is not a cancel API.

**Vendor sample.** `Test_Printer_ClearPrinterBuffer` is a menu entry that calls `CP_Printer_ClearPrinterBuffer(h)` and nothing else (`samplepos`, `cmddebugger`, `samplelabel_withoutautoreply`, and the other `TestFunction.java` copies). `Test_Pos_SampleTicket_80MM_2` calls clear-buffer and then `CP_Pos_ResetPrinter` **before** drawing the ticket, as a clean start, not as a mid-job abort. The `IntByReference cancel` arguments in `MainActivity` are passed to `CP_Port_Enum*` to cancel **discovery**, not a print. No sample implements pause, and none reads a buffer-fill value. The sample does print the received-byte count and printed page id from `GetPrinterReceivedInfo` / `GetPrinterPrintedInfo`.

**Our wrapper.** `DevPrinterModule.kt` calls `CP_Printer_GetPrinterStatusInfo`. It does not call `ClearPrinterBuffer`, `ClearPrinterError`, `ResetPrinter`, or the received/printed info queries.

**Verdicts.** Cancel: **PARTIAL** (command exists, hardware effect unverified, wrapper does not call it). Pause: **NO**. Buffer fill: **NO**.

### 2. Label X / MiniX / GD985 — LuckPrinter

**Files:** `modules/labelx-printer/android/libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` (`classes.jar`, 425 classes), vendor demo and guide under `backend/GD985-SDK/`.

**`PrinterHelper` public surface.** 138 public methods (`javap -public`). The complete list is in the appendix. Names matching stop / cancel / abort / pause / resume / buffer / memory / clear / reset:

- `disconnectLuck()`
- `resetPrinterDevice()`
- `resetDevice()`
- `setRecoveryLuck(ResultCallback<Integer>)`

No `stopPrint`, `cancel`, `abort`, `pause`, `resume`, or buffer/memory query on this class. `getPrinterStatus` / `printerStatusLuck` return `PrinterStatusData`.

**Where stop actually lives.** A `javap -public` pass over all 202 top-level classes under `com.luckprinter.sdk_new.device` found no `pause`, `resume`, `buffer`, or `memory` method on any of them. The only stop methods are:

| Class | Method | Bytes |
| :--- | :--- | :--- |
| `INormalDeviceOperation` / `BaseNormalDevice` | `stopPrintJobLuck`, `stopPrintJobLuckNoCallback` | `10 FF F1 45` |
| `BaseLujiangA4Device` | `stopPrintJobLuck` (override; longer read timeout) | `10 FF F1 45` |
| `AiYinNormalDevice`, `AiYinA4Device` | `stopPrintJobLuck` | `10 FF FE 45` |
| `AiYinA4Device` | `stopPrintJobLuckSimple()` (same bytes, no callback) | `10 FF FE 45` |

`BaseSheetLabelDevice` / `ISheetLabelDeviceOperation` (the family of the built-in `GD985` class) declares none of these. `CmdType.CLEAR_TSPL` is a slot name for a custom command list, not a method that sends anything by itself.

Device selection in `PrinterHelper.initDevice`: a custom property with `printerType` `"a4"` → `CustomA4Device`; `"sheet_label"` → `CustomSheetLabelDevice`; anything else → `CustomNormalDevice`. Our prefixes all set `"normal"`, so the connected object is a `CustomNormalDevice` and inherits `BaseNormalDevice.stopPrintJobLuck`.

Related commands on the same device, not cancels: `setRecoveryLuck` writes `10 FF 04` (the vendor guide's factory reset), and `enablePrinterLuck` writes `10 FF F1 <mode>`.

`PrinterStatus` constants are paper-out, cover-open, overheat, low voltage, printing, recharge, not-a-label, and Wi-Fi link states. `PrinterStatusData` fields: `isPrinting`, `isOpen`, `isLackPaper`, `isLackElec`, `isOverheat`, `isRecharge`. `PrinterInfoData` fields: `HWV`, `PCNT`, `DM`, `DSN`, `DID`, `SWV`, `BV`, `ACT`, `PLV`, `VBAT`, `WS`, `WN`, `MS`, `VL`. None is named buffer, memory, or capacity. The integration guide documents `getIsPrinting()` and does not document `MS` / `VL` as memory. They are not treated as a buffer report here.

**Vendor demo.** Menu and activities call `disconnectLuck`, `setRecoveryLuck` (guide §13.4, "Factory Reset"), and `resetDevice` (AI50 guide, also titled factory reset). Zero references to `stopPrintJobLuck`.

**Our wrapper.** Calls `disconnectLuck()`. Does not call `stopPrintJobLuck`. The local `commandMap` that contains `10fff145` is never submitted.

**Verdicts.** Cancel: **PARTIAL**. Pause: **NO**. Buffer fill: **NO**.

### 3. Tez / Shakti — PrintSDK-68

**Files:** `modules/tez-printer/android/libs/PrintSDK-68.jar` (88 classes), `modules/tez-printer/android/src/main/jniLibs/*/libPrinterNative.so`. `backend/Demo_small/` is not on disk.

**`PrintImgHelper` public methods** (extends obfuscated `com.print.myprinter.〇8〇0`):

```text
PrintImgHelper(Oo0)
void setImgData(int, ImgData)
void setImgDatas(int, List<ImgData>)
PrintBuild build()
PrintBuild build(TaskCallback)
void run(PrintBuild)
void stopPrint()
```

`stopPrint()` is `invokespecial` of the parent's `stopPrint()`. That parent method:

1. `Handler.removeCallbacksAndMessages(null)` on its handler, then `sendEmptyMessage(readWhat)`.
2. Same clear on `bitmapHandler`.
3. `bitmapThread.interrupt()` and `printThread.interrupt()`.
4. `imgCommands.clear()`, `builds.clear()`, `printer.clearTask()` (`commandInfos.clear()`).
5. If `isConnect`, `printer.sendWhat(102)`.

`102` is the field `What_READ` (set in `Oo0.<init>` next to `What_WRITE = 101`). `sendWhat` only does `Handler.sendEmptyMessageDelayed`. It does not write to the printer. `Command` has no `cancel`, `abort`, `stop`, `pause`, `clear`, or `buffer` factory. The full `Command` list is in the appendix. `cls()` exists on `PrintBuild` and the constant pool contains the string `CLS`; our pipeline calls `build.cls()` at the **start** of a job, which is the usual TSPL image-buffer clear before drawing, not an abort.

`Printer` public methods: `setListener`, `getDeviceItem`, `getHelper`, `connect`, `disconnect`, `release`, `isConnect`, `data2Str` (two overloads), `clearTask`, `addTask` (three overloads). `clearTask` clears the in-memory command list.

Constant-pool scan of all 88 classes: `stopPrint` appears only on `PrintImgHelper` and its parent; `nextPrint` appears **nowhere**; `pause`, `buffer`, and `memory` appear nowhere as method names. `cancelDiscovery` / `stopScan` are scanner methods. Native `libPrinterNative.so` strings for this topic are image-decoder noise (`buffer error`, `insufficient memory`), not a printer-status API.

The note in `TEZ_PRINTER_CALIBRATION_FIX.md` that quotes `Printer_Y50.nextPrint()` describes a decompiled shape that is **not in this JAR**. There is no per-page `nextPrint()` loop to use as a pause. The current batch mechanism is `run(PrintBuild)` appending a build, then `sendTask` writing `commandInfos` one at a time.

**Vendor demo.** Not available in this tree (`backend/Demo_small/` missing). Cannot confirm how that demo labeled the button. The method the prompt names, `PrintImgHelper.stopPrint()`, is the one above.

**Our wrapper.** `PrintPipeline` calls `helper.stopPrint()` at the start of every job ("Clean previous print state"), then builds a new job. That uses the SDK method as a pre-job reset of the SDK's own queues. It is not wired to a user-facing cancel of a job already on the printer.

**Verdicts.** Cancel: **PARTIAL** (stops the SDK sending more; does not send an abort command). Pause: **NO**. Buffer fill: **NO**.

### 4. TD-404 / Tejas / Rudra — Ninestar `labelprinter`

**Files:** `modules/td404-printer/android/libs/labelprinter.jar`. Our module does not call these builders at runtime; it writes its own TSPL on its own RFCOMM socket. The SDK is still the thing that was asked about.

**`LabelCommand` public methods** (60). Control-related:

| Method | Bytes emitted |
| :--- | :--- |
| `clrCommand()` | `Vector.clear()` of the **local** command buffer. Does not talk to the printer. |
| `addCls()` | `CLS\r\n` |
| `addQueryPrinterStatus()` | `1B 21 3F` (`ESC ! ?`) |
| `addResetPrinter()` | `1B 21 52` (`ESC ! R`) |
| `addQueryPrinterType()` | `~!T\r\n` |
| `addQueryPrinterLife()` | `~!@\r\n` |
| `addQueryPrinterMemory()` | `~!A\r\n` |
| `addQueryPrinterFile()` | `~!F\r\n` |
| `addQueryPrinterCodePage()` | `~!I\r\n` |
| `addUserCommand(String)` / `addUserCommand(byte[])` | Whatever the caller passes. |

No method is named cancel, abort, stop, or pause. A search of the `LabelCommand` bytecode found no `ESC !.` (`1B 21 2E`). The TSPL manual describes `ESC !.` as "cancel all printing files" (since firmware V7.00 EZ) and `ESC ! R` as "resets the printer" and deletes files downloaded into memory. `~!A` "inquires the free memory of the printer" as decimal digits ended by `0x0D`. `ESC ! S` (not wrapped) includes status-byte 1 value `` ` `` = Pause (the printer is in pause) and status-byte 2 value `H` = "Receive buffer full (RS-232)".

**`EscCommand` public methods** (72). The names that look like cancel are character-set operations: `addSelectOrCancelUserDefineCharacter`, `addCancelUserDefinedCharacters`, `addCancelKanjiMode`. `addInitializePrinter` is the ESC/POS initialize. `addQueryPrinterStatus` is present. None is a job abort or a buffer-fill query.

**`CpclCommand` public methods** (54). `clrCommand()` clears the local vector. No cancel, abort, stop, pause, buffer, or memory method. `addForm` / `addEnd` / `addPrint` are job structure, not flow control.

**Ports.** `PortManager`, `SppBluetoothPort`, `BleBluetoothPort`, `EthernetPort`, `UsbPort`. Public operations are open, write, read, close, callback. `PortManager.available()` is hardcoded `return -1`. `SppBluetoothPort.available()` returns `inputStream.available()`, the phone's unread input, or `-1` if the stream is null. No port method queries the printer's buffer.

**Our wrapper.** `Td404PrinterModule` writes its own TSPL, including `CLS\r\n` at the start of each label (image-buffer clear before `BITMAP` / `PRINT`, not a mid-job abort). `closeSocket()` closes RFCOMM on disconnect and on teardown. It does not send `ESC ! R`, `ESC !.`, or `~!A`.

**Verdicts.** Cancel: **PARTIAL** (commands exist that the TSPL manual defines as reset / image clear; the manual's dedicated "cancel all printing files" command is not wrapped; socket close always stops further bytes; hardware effect unverified). Pause: **NO**. Buffer/memory: **PARTIAL** (`~!A` is a free-memory query, not buffer fill; unused; reply handling absent; whether this firmware answers it is unverified).

### 5. Josh — DothanTech LPAPI

**Files:** `modules/josh-printer/android/libs/LPAPI-2026-01-08-R.jar`.

**`LPAPI` public methods:** 80, listed in the appendix. The control-related ones:

```text
void stopDiscovery();
PrinterState getPrinterState();
void cancel();
void closePrinter();
boolean waitPrinterState(PrinterState, int);
void abortJob();
```

**`abortJob()` vs `cancel()`.**

- `LPAPI.abortJob()` calls `IAtBitmap.abortJob()`. The implementation `com.dothantech.lpapi.a.abortJob()` calls a private teardown `e()` and returns `0`. It sits next to `startJob` / `endJob` and operates on the in-memory page list. Our `printTestText` calls it immediately before `startJob`, as a local reset of the drawing job.
- `LPAPI.cancel()` calls `IDzPrinter.cancel()`, which is `cancel(256)`.
- `LPAPI.stopDiscovery()` calls `cancel(131072)`.
- `DzPrinter.cancel(int)` ORs the flag into field `aa` and posts handler message what=`2` with that argument (`com.dothantech.common.aw.a(int, int)` → `Handler.obtainMessage(2, flag, 0)`).
- The handler's `onCancelMessage` switches on the flag. `256` requires a connected printer and a print-data payload, then calls `onPrintProgress(..., PrintProgress.Failed, PrintFailReason.Cancelled)`. Flags `4` and `16` move the printer to `Disconnected`. Flags `131072` and `262144` are discovery. The `256` branch that was disassembled does not store a command byte sequence.

Whether flag `256` also stops a write that is already on the wire is **UNVERIFIED (needs hardware)**. Statically, `cancel()` is "stop this job inside the SDK and report Cancelled." `abortJob()` is "drop the local bitmap job."

**`waitPrinterState(PrinterState, int)`.** Converts the timeout to a deadline and loops: if `getPrinterState()` equals the requested enum, return true; otherwise wait on a monitor in slices of at most 100 ms until the deadline. States are `Connecting`, `Connected`, `Connected2`, `Printing`, `Working`, `Disconnected`. This can be used to wait until the state is `Printing` or until it leaves `Printing`. It does not pause the printer and it does not resume a held job.

**`PrinterInfo` fields:** `deviceType`, `deviceName`, `deviceVersion`, `softwareVersion`, `deviceAddress`, `deviceAddrType`, `deviceDPI`, `deviceWidth`, `manufacturer`, `seriesName`, `devIntName`, `peripheralFlags`, `hardwareFlags`, `softwareFlags`, `mcuId`. No buffer, memory, or capacity field.

**`PrintParamName` constants:** `PAGE_KEY`, `PRINT_DARKNESS`, `PRINT_DENSITY`, `PRINT_SPEED`, `PRINT_DIRECTION`, `PRINT_SEPARATE_LINE`, `PRINT_COPIES`, `GAP_TYPE`, `GAP_LENGTH_01MM`, `GAP_LENGTH_PX`, `GAP_LENGTH`, `PRINT_ALIGNMENT`, `ANTI_COLOR`, `HOR_FLIP`, offsets and margins (`*_01MM` / `*_PX`), `IMAGE_THRESHOLD`, `PRINT_BLE`, `PRINT_CT`, `PRINT_DPI`, `SUPPORT_PAGE_KEY`. No buffer or memory name.

**Other strings that look related.** `getMyMemoryState` is on `com.dothantech.common.a` next to `Application onLowMemory()` — process memory, not the printer. `PackageBuffer.java` is the source file name of an obfuscated packet class. `CMD_BUFFER_SIZE with ERROR` is logged from a response decoder in `DzPrinter` and then the method returns; it is not exposed on `LPAPI`.

**Our wrapper.** Calls `abortJob()` before the test-print `startJob`. Does not call `cancel()` or `waitPrinterState` as a cancel or resume.

**Verdicts.** Cancel: **PARTIAL**. Pause: **NO**. Buffer fill: **NO**.

---

## What needs hardware

Each row is unsettled by the binaries. The test is the thing that would settle it.

1. **Dev — `CP_Printer_ClearPrinterBuffer`.** Start a multi-copy label job, call `CP_Printer_ClearPrinterBuffer` after the first label has started to leave the printer, and record whether the mechanism stops, finishes the current label, or prints the rest. Repeat with `CP_Pos_ResetPrinter` (`1B 40`) so the two commands are not confused.
2. **Dev — idle bits as pacing.** During a 10-label job, poll `CP_Printer_GetPrinterStatusInfo` and log `INFO_HAVEDATA`, `INFO_PRINTIDLE`, `INFO_RECVIDLE` against `GetPrinterReceivedInfo` and `GetPrinterPrintedInfo`. Confirm whether idle goes true between labels or only at the end. This decides whether ACK pacing is real on DEV-7299.
3. **Dev — cable pull.** Close the port after half a bitmap has been written. Record whether the printer prints a partial label, finishes that label, or faults.
4. **Label X — `stopPrintJobLuck`.** On a unit that connected as `CustomNormalDevice` (log `namePrefix`), cast `getPrinter()` to `INormalDeviceOperation` and call `stopPrintJobLuck` mid-job. Record the callback integer and whether paper stops. Repeat on a GD985-named unit to confirm it really took the custom-normal path and not `sheetlabel.GD985`.
5. **Label X — `disconnectLuck` mid-job.** Same job, call `disconnectLuck()` instead. Record the paper outcome and whether the next `connectLuck` works without a power cycle. This is the fallback if test 4 does not stop the mechanism.
6. **Label X — do not use `setRecoveryLuck` as cancel** until test 4 is done. If it is tried, expect a factory reset (`10 FF 04`), and confirm density, paper type, and shutdown time afterwards.
7. **Tez — `stopPrint` mid-job.** Call `PrintImgHelper.stopPrint()` after `run()` has started writing. Record whether the printer finishes the label, stops at a tear, or keeps printing later copies that were already queued. This confirms the host-only reading of the bytecode.
8. **Tez — socket drop.** `disconnect()` after the first label of a 5-copy job. Same observation.
9. **TD-404 — `CLS` vs `ESC ! R` vs `ESC !.` vs socket close.** Four runs, one command each, sent on the existing RFCOMM socket after the printer has started a 5-label job: `CLS\r\n`, `1B 21 52`, `1B 21 2E`, and `closeSocket()` with no command. Record which ones stop the mechanism and whether the printer needs a power cycle. `ESC !.` is not in the SDK; this test is what would justify writing it ourselves.
10. **TD-404 — `~!A`.** Send `~!A\r\n` on an idle printer and capture the reply bytes. Confirm it is a decimal free-memory number, and confirm it does **not** change while a large bitmap is streaming. If it does not change during streaming, it cannot be the Phase 5 backpressure signal.
11. **Josh — `cancel()` vs `abortJob()`.** Mid-job, call `LPAPI.cancel()` on one run and `abortJob()` on another. Record whether `onPrintProgress` fires `Failed`/`Cancelled`, whether paper stops, and whether a following `printBitmap` double-prints. `abortJob()` is expected to do nothing to the printer if the bytecode reading is right; the test is what proves it.
12. **Josh — `PrinterState` during a long job.** Poll `getPrinterState()` through a 10-label job. If it stays `Printing` until the end and never exposes a gap, it cannot pace the batch either.

---

## Impact on existing plans

Phase 5 in [`ARCHITECTURE_REDESIGN_PLAN.md`](./ARCHITECTURE_REDESIGN_PLAN.md) currently says:

- Task 5.2: "Monitor printer Bluetooth buffer status; pause rasterization when printer buffer is full; resume as pages are physically printed."
- Task 5.3: a Cancel button that "issues a clear-buffer command to the printer."
- Benchmark: "Job cancellation: Instantaneous (under 50ms) with proper hardware abort commands sent to the printer."

**The buffer-monitoring design does not survive.** No SDK in this repo can tell the app that the printer's receive buffer is full, how full it is, or how much of it is free. Task 5.2 cannot be implemented as written.

Task 5.2 has to become **per-adapter flow control that does not read buffer fill**:

- **ACK / idle pacing where a signal exists.** Dev: poll `CP_Printer_GetPrinterPrintedInfo` (page id) and `INFO_PRINTIDLE` / `INFO_RECVIDLE`, after hardware test 2 says the bits actually move between labels. Label X: `PrinterStatusData.getIsPrinting()` returning to not-printing. Tez: `TaskCallback.readCall` (already the completion path; the 15-second timer that reports success without it, documented in `SDKS.md`, must not be treated as "buffer has room"). Josh: `PrintProgress.Success`, with `PrinterState` only if hardware test 12 shows it changes per label. `DataEnded` is "bytes left the phone," which `SDKS.md` already separates from a printed label.
- **Time-based pacing where the signal is missing or stuck.** A fixed inter-label delay, tuned per printer on hardware, used when the ACK never arrives. Withhold the next raster until the delay or the ACK, whichever the adapter declares.
- **Do not** add a shared `bufferLevel()` on `PrinterAdapter`. There is nothing to return.

Task 5.3's "clear-buffer command" is not one command:

- Halt the batch iterator in every adapter. That part is ours and does not depend on the SDK.
- Then, per adapter: Dev `CP_Printer_ClearPrinterBuffer` (after hardware test 1); Label X `stopPrintJobLuck` (after hardware test 4), with `disconnectLuck()` as the fallback; Tez `stopPrint()` knowing it only stops the SDK; TD-404 write the command hardware test 9 selects, and close the socket if none of them stop the mechanism; Josh `cancel()`, not `abortJob()`.
- The benchmark "under 50 ms with a hardware abort on every printer" should be dropped or split per printer. Tez has no hardware abort in this SDK. The others have a candidate whose effect is still unverified.

`SDKS.md` is unchanged by this except where it said Label X's public helper has no cancel: that remains true of `PrinterHelper`, and it is incomplete for the SDK, because `INormalDeviceOperation.stopPrintJobLuck` exists and our connected device class inherits it.

---

## Appendix A — Dev JNA methods (all 151)

`javap -public` abstract methods on `com.caysn.autoreplyprint.AutoReplyPrint`. Pause, buffer-fill, and a dedicated abort name are not in this list. `CP_Printer_ClearPrinterBuffer` is the clear. `CP_Port_Available` is the host RX count.

```text
CP_Library_Version
CP_Port_EnumCom
CP_Port_EnumUsb
CP_Port_EnumNetPrinter
CP_Port_EnumBtDevice
CP_Port_EnumBleDevice
CP_Port_EnumWiFiP2PDevice
CP_Port_OpenCom
CP_Port_OpenUsb
CP_Port_OpenTcp
CP_Port_OpenBtSpp
CP_Port_OpenBtBle
CP_Port_WiFiP2P_Connect
CP_Port_WiFiP2P_Disconnect
CP_Port_WiFiP2P_IsConnected
CP_Port_Write
CP_Port_Read
CP_Port_ReadUntilByte
CP_Port_Available
CP_Port_SkipAvailable
CP_Port_IsConnectionValid
CP_Port_IsOpened
CP_Port_Close
CP_Port_AddOnPortOpenedEvent
CP_Port_AddOnPortOpenFailedEvent
CP_Port_AddOnPortClosedEvent
CP_Port_AddOnPortWrittenEvent
CP_Port_AddOnPortReceivedEvent
CP_Port_RemoveOnPortOpenedEvent
CP_Port_RemoveOnPortOpenFailedEvent
CP_Port_RemoveOnPortClosedEvent
CP_Port_RemoveOnPortWrittenEvent
CP_Port_RemoveOnPortReceivedEvent
CP_Printer_AddOnPrinterStatusEvent
CP_Printer_AddOnPrinterReceivedEvent
CP_Printer_AddOnPrinterPrintedEvent
CP_Printer_RemoveOnPrinterStatusEvent
CP_Printer_RemoveOnPrinterReceivedEvent
CP_Printer_RemoveOnPrinterPrintedEvent
CP_Printer_GetPrinterResolutionInfo
CP_Printer_GetPrinterFirmwareVersion
CP_Printer_GetPrinterStatusInfo
CP_Printer_GetPrinterReceivedInfo
CP_Printer_GetPrinterPrintedInfo
CP_Printer_GetPrinterLabelPositionAdjustmentInfo
CP_Printer_SetPrinterLabelPositionAdjustmentInfo
CP_Printer_ClearPrinterBuffer
CP_Printer_ClearPrinterError
CP_Pos_QueryRTStatus
CP_Pos_QueryPrintResult
CP_Pos_KickOutDrawer
CP_Pos_Beep
CP_Pos_FeedAndHalfCutPaper
CP_Pos_FullCutPaper
CP_Pos_HalfCutPaper
CP_Pos_FeedLine
CP_Pos_FeedDot
CP_Pos_PrintSelfTestPage
CP_Pos_PrintText
CP_Pos_PrintTextInUTF8
CP_Pos_PrintTextInGBK
CP_Pos_PrintTextInBIG5
CP_Pos_PrintTextInShiftJIS
CP_Pos_PrintTextInEUCKR
CP_Pos_PrintBarcode
CP_Pos_PrintQRCode
CP_Pos_PrintQRCodeUseEpsonCmd
CP_Pos_PrintDoubleQRCode
CP_Pos_PrintPDF417BarcodeUseEpsonCmd
CP_Pos_PrintRasterImageFromFile
CP_Pos_PrintRasterImageFromData
CP_Pos_PrintRasterImageFromPixels
CP_Pos_PrintHorizontalLine
CP_Pos_PrintHorizontalLineSpecifyThickness
CP_Pos_PrintMultipleHorizontalLinesAtOneRow
CP_Pos_ResetPrinter
CP_Pos_SetPrintSpeed
CP_Pos_SetPrintDensity
CP_Pos_SetSingleByteMode
CP_Pos_SetCharacterSet
CP_Pos_SetCharacterCodepage
CP_Pos_SetMultiByteMode
CP_Pos_SetMultiByteEncoding
CP_Pos_SetMovementUnit
CP_Pos_SetPrintAreaLeftMargin
CP_Pos_SetPrintAreaWidth
CP_Pos_SetHorizontalAbsolutePrintPosition
CP_Pos_SetHorizontalRelativePrintPosition
CP_Pos_SetVerticalAbsolutePrintPosition
CP_Pos_SetVerticalRelativePrintPosition
CP_Pos_SetAlignment
CP_Pos_SetTextScale
CP_Pos_SetAsciiTextFontType
CP_Pos_SetTextBold
CP_Pos_SetTextUnderline
CP_Pos_SetTextUpsideDown
CP_Pos_SetTextWhiteOnBlack
CP_Pos_SetTextRotate
CP_Pos_SetTextLineHeight
CP_Pos_SetAsciiTextCharRightSpacing
CP_Pos_SetKanjiTextCharSpacing
CP_Pos_SetBarcodeUnitWidth
CP_Pos_SetBarcodeHeight
CP_Pos_SetBarcodeReadableTextFontType
CP_Pos_SetBarcodeReadableTextPosition
CP_Page_SelectPageMode
CP_Page_SelectPageModeEx
CP_Page_ExitPageMode
CP_Page_PrintPage
CP_Page_ClearPage
CP_Page_SetPageArea
CP_Page_SetPageDrawDirection
CP_Page_DrawRect
CP_Page_DrawBox
CP_Page_DrawText
CP_Page_DrawTextInUTF8
CP_Page_DrawTextInGBK
CP_Page_DrawTextInBIG5
CP_Page_DrawTextInShiftJIS
CP_Page_DrawTextInEUCKR
CP_Page_DrawBarcode
CP_Page_DrawQRCode
CP_Page_DrawRasterImageFromFile
CP_Page_DrawRasterImageFromData
CP_Page_DrawRasterImageFromPixels
CP_BlackMark_EnableBlackMarkMode
CP_BlackMark_DisableBlackMarkMode
CP_BlackMark_SetBlackMarkMaxFindLength
CP_BlackMark_FindNextBlackMark
CP_BlackMark_SetBlackMarkPaperPrintPosition
CP_BlackMark_SetBlackMarkPaperCutPosition
CP_BlackMark_FullCutBlackMarkPaper
CP_BlackMark_HalfCutBlackMarkPaper
CP_Label_EnableLabelMode
CP_Label_DisableLabelMode
CP_Label_CalibrateLabel
CP_Label_FeedLabel
CP_Label_PageBegin
CP_Label_PagePrint
CP_Label_DrawText
CP_Label_DrawTextInUTF8
CP_Label_DrawTextInGBK
CP_Label_DrawBarcode
CP_Label_DrawQRCode
CP_Label_DrawPDF417Code
CP_Label_DrawImageFromFile
CP_Label_DrawImageFromData
CP_Label_DrawImageFromPixels
CP_Label_DrawLine
CP_Label_DrawRect
CP_Label_DrawBox
```

Native exports present in `libautoreplyprint.so` and absent from this JAR: `CP_Label_DrawQRCodeInBytes`, `CP_Label_DrawQRCodeInUTF8`, `CP_Label_DrawTextInBIG5`, `CP_Label_DrawTextInBytes`, `CP_Label_DrawTextInEUCKR`, `CP_Label_DrawTextInShiftJIS`, `CP_Port_EnumLpt`, `CP_Port_OpenLpt`, `CP_Pos_PrintTextInBytes`, `CP_Proto_OpenCom`, `CP_Proto_OpenUdp`, `CP_Proto_OpenUsb`, `CP_Proto_ReadFlash`, `CP_Proto_StopAtBoot`, `CP_Proto_UpdateProgramFromData`, `CP_Proto_UpdateProgramFromFile`.

## Appendix B — Luck `PrinterHelper` public methods

138 methods from `javap -public` on `com.luckprinter.sdk_new.device.PrinterHelper`. `stopPrintJobLuck` is not among them.

```text
getPrinter()
setEventRecorder(IEventRecorder)
init(Context, String, boolean)
setLogFilter(ILogFilter)
setEnableBle(boolean)
connectLuck(String, String)
connectLuck(String, String, int)
disconnectLuck()
resetPrinterDevice()
isConnectedLuck()
setUsePrintGray(boolean, int)
setUsePrintGray(boolean)
getPaperFeedDots()
setPaperFeedDots(int)
isSupportSetFeedPaperDistance()
print(Bitmap, int, OnPrintCallback)
print(Bitmap, boolean, int, int, OnPrintCallback)
printOnce(Bitmap, int, int, ResultCallback<Integer>)
printOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printWaterTransfer(Bitmap, boolean, int, int, OnPrintCallback)
printWaterTransferOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printTattoo(Bitmap, int, OnPrintCallback)
printTattoo(Bitmap, boolean, int, int, OnPrintCallback)
printTattooOnce(Bitmap, int, int, ResultCallback<Integer>)
printTattooOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printBlackTag(Bitmap, int, OnPrintCallback)
printBlackTag(Bitmap, boolean, int, int, OnPrintCallback)
printTag(Bitmap, int, OnPrintCallback)
printTag(Bitmap, boolean, int, int, OnPrintCallback)
printTagOnce(Bitmap, int, int, ResultCallback<Integer>)
printTagOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printCircleTag(Bitmap, int, OnPrintCallback)
printCircleTag(Bitmap, boolean, int, int, OnPrintCallback)
printCircleTagOnce(Bitmap, int, int, ResultCallback<Integer>)
printCircleTagOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printBlackTagOnce(Bitmap, int, int, ResultCallback<Integer>)
printBlackTagOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printFolder(Bitmap, int, OnPrintCallback)
printFolder(Bitmap, boolean, int, int, OnPrintCallback)
printFolderOnce(Bitmap, int, int, ResultCallback<Integer>)
printFolderOnce(Bitmap, boolean, int, int, int, ResultCallback<Integer>)
printSheetLabel(int, int, int, int, Bitmap, int)
addBitmapCache(Bitmap)
addBitmapCache(Bitmap, boolean)
getAllInfo(OnPrinterInfoCallback)
updatePrinterLuck(File, UpdateListener)
getShutTimeLuck(ResultCallback<Integer>)
setShutTimeLuck(int, ResultCallback<Integer>)
getDensityLuck(ResultCallback<Integer>)
setDensityLuck(int, ResultCallback<Integer>)
printerSettingLuck(ResultCallback<String>)
setPaperTypeLuck(int, ResultCallback<Integer>)
getSpeed(ResultCallback<Integer>)
setSpeedLuck(int, ResultCallback<Integer>)
getTimeFormat(ResultCallback<Integer>)
setTimeFormat(int, long, ResultCallback<Integer>)
getBatteryLuck(ResultCallback<Integer>)
setL2ProPrinterMode(int, ResultCallback<Integer>)
printerModelLuck(ResultCallback<String>)
printerBootLuck(ResultCallback<String>)
getPrinterStatus(ResultCallback<PrinterStatusData>)
printerVersionLuck(ResultCallback<String>)
printerSNLuck(ResultCallback<String>)
printerStatusLuck(ResultCallback<PrinterStatusData>)
printLineDotsLuck(int)
printReverseLineDotsLuck(int)
setRecoveryLuck(ResultCallback<Integer>)
addConnectListener(OnClientConnectionListener)
removeConnectListener(OnClientConnectionListener)
addDeviceStatusListener(OnReceiveDeviceStatusListener)
removeDeviceStatusListener(OnReceiveDeviceStatusListener)
addEventListener(OnEventListener)
removeEventListener(OnEventListener)
addDeviceForbiddenListener(DeviceForbiddenListener)
removeDeviceForbiddenListener(DeviceForbiddenListener)
getPrinterDevice()
is304Dpi()
getMinDensity()
getMaxDensity()
getMinSpeed()
getMaxSpeed()
getDensityList()
getDefaultDensityLevel()
getDefaultDensity()
getDefaultSpeedLevel()
getDefaultSpeed()
getSpeedList()
getNamePrefix()
isSupportSetSpeed()
isSupportPrintLabel()
isL3Printer()
isA4Printer()
isAiyinDevice()
isL90Printer()
isAvailableLocalDevice(String)
isAvailableLocalDevice(String, int)
isNormalPrinter(String, int)
isA4Printer(String, int)
isSheetLabelPrinter(String, int)
isDeviceConnectUseBle(String, int)
isNormalPrinter()
isSheetLabelPrinter()
getA4PrintWidth()
getA4PrintHeight()
isSupportPrintGray()
isSupportPrintGrayLevel(int)
isNeedHeightZoom()
getHeightZoomScale()
getPrintWidth()
getPrintMaxWidth()
getPrintWidthCM()
setDeviceSelectPaperSize(int)
getDeviceSelectPaperSize()
setDeviceLabelPaperType(PaperType)
setA4PaperSize(int, int)
sendCommand(byte[], ResultCallback<Integer>)
getClientPort()
setCustomPropertyMap(HashMap<String, PrinterProperty>)
addCustomPropertyMap(HashMap<String, PrinterProperty>)
setPrinterModel(String, ResultCallback<Integer>)
setClassicBluetoothName(String, ResultCallback<Integer>)
setBleBluetoothName(String, ResultCallback<Integer>)
sendWifiAccountPassword(String, String, ResultCallback<Integer>)
getWifiState(ResultCallback<Integer>)
getDeviceVolume(ResultCallback<VolumeBean>)
setDeviceVolume(int, ResultCallback<Integer>)
getDeviceAIMode(ResultCallback<String>)
setDeviceAIMode(String, ResultCallback<Integer>)
getDevicePaperType(ResultCallback<Integer>)
resetDevice()
setPrinterLanguage(String, ResultCallback<Integer>)
isAi50WifiPrinter()
getInstance()
```

Synthetic `access$000` … `access$400` are also public and are compiler bridges, not API.

## Appendix C — Tez `Command` factories

Complete public static factories on `com.print.printer.Command`. No cancel, abort, pause, or buffer factory.

```text
enable()
disenable()
fixedPoint()
linedots(int)
backoffPaper()
forwardPaper()
print_SELFTEST()
OPEN_AP()
CLOSE_AP()
update(String, File)
update(String, byte[])
get_deviceName()
get_btName()
get_SN()
get_version()
get_btVersion()
get_PAPER_STATUS()
get_LID()
get_battervol()
get_DENSITY()
set_Density(int)
set_Density_X(int)
get_paperType()
set_paperType(int)
set_paperType_X(int)
get_SPEED()
set_Speed(float)
get_shutTime()
set_ShutTime(int)
get_wifiMAC()
get_btMAC()
get_wifiIP()
get_wifiSSID()
get_DeviceInfo()
get_status()
DPI()
HARDWARE_VERSION()
FACTORY_RESET()
LEARN_LABEL()
get_RFID()
get_RFID_ENCRY()
get_RFID_UID()
get_mileage()
calibration()
```

`PrintBuild` adds `cls()`, `CreatePage(int, int)`, `speed`, `density`, `paperType`, `printImg`, `printLinedots`, `enable`, `disenable`, `fixedPoint`, `backoffPaper`, `forwardPaper`. `cls()` is the start-of-label clear, not `stopPrint`.

## Appendix D — Josh `LPAPI` public methods

```text
setPrinterConfigParams(Bundle)
discovery()
stopDiscovery()
isDeviceSupported(BluetoothDevice, String)
isPrinterSupported(String, String)
getAllPrinters(String)
getAllPrinterAddresses(String)
getFirstPrinter(String)
getFirstPrinterAddress(String)
openPrinter(String)
openPrinter(BluetoothDevice)
openPrinterByAddress(PrinterAddress)
openPrinterSync(String)
openPrinterByAddressSync(PrinterAddress)
getPrinterName()
getPrinterInfo()
getPrinterState()
isPrinterOpened()
cancel()
closePrinter()
reopenPrinter()
reopenPrinterSync()
quit()
setPrintPageGapType(int)
setPrintPageGapLength(int)
setPrintDarkness(int)
setPrintSpeed(int)
printBitmap(Bitmap, Bundle)
printATBitmap(IAtBitmap, Bundle)
waitPrinterState(PrinterState, int)
startJob(double, double, int)
abortJob()
commitJob()
commitJobWithParam(Bundle)
startPage()
endPage()
endJob()
getJobPages()
setDrawParam(String, Object)
getItemOrientation() / setItemOrientation(int)
getItemHorizontalAlignment() / setItemHorizontalAlignment(int)
getItemVerticalAlignment() / setItemVerticalAlignment(int)
getItemPenAlignment() / setItemPenAlignment(int)
setBackground(int)
drawText, drawTextRegular, drawRichText, drawTextWithIndent, drawTextWithScale
measureFontHeight
draw1DBarcode, draw2DQRCode, draw2DDataMatrix
drawRectangle, fillRectangle, drawRoundRectangle, fillRoundRectangle
drawEllipse, fillEllipse, drawCircle, fillCircle
drawLine, drawDashLine, drawDashLine2, drawDashLine4
drawImage, drawImageWithActualSize, drawImageWithThreshold
drawBitmap, drawBitmapWithActualSize, drawBitmapWithThreshold
drawBitmapStream, drawBitmapStreamWithActualSize, drawBitmapStreamWithThreshold
```

No `pause`, `resume`, or buffer/memory method. `IDzPrinter` also declares `cancel(int)`; `LPAPI.cancel()` is `cancel(256)` and `stopDiscovery()` is `cancel(131072)`.
