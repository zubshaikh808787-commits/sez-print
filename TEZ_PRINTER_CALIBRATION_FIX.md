# Tez Printer (YX / Y50 SDK) — Calibration & Print-Flow Bug Report

**Scope:** This document only covers the **Tez** printer integration, based on the
`Demo_Y50_Android.rar` project you uploaded (package `com.test.demo`, vendor SDK
`com.yx.print:PrintSDK:68`). Tejas, Rudra, and Josh were **not opened, read, or
modified** — none of their code exists in the uploaded archive, and none of the
fixes below touch shared/global state that those integrations would depend on.

**What I could / couldn't inspect:** The demo app's own source (Activities +
`YXSDK`/`Printer_Y50` wrapper classes) is fully visible and analyzed below.
The actual vendor SDK (`PrintSDK-68.aar`, pulled from
`https://gitee.com/it_space/bluetooth-sdk/raw/master`) is a **compiled binary
dependency, not source**, and gitee.com isn't reachable from my sandbox — so
I can't show you the inside of `PrintImgHelper.PrintBuild`. Where a fix depends
on an exact method inside that black box, I've said so explicitly and given you
the way to confirm it (decompile the AAR with `jadx`, or check the vendor's own
docs/changelog for v68).

---

## 1. Executive Summary — Ranked Root Causes

| # | Root cause | Explains |
|---|---|---|
| 1 | **`modelKey` is hardcoded to `"Z212"` for every scanned device** | Calibration issue **and** "different type of printer" symptom |
| 2 | **`paperW` / `paperH` are captured from the UI but never sent to the SDK** | Calibration issue (gap/label-length never configured) |
| 3 | **Tattoo paper is bucketed with gap-sensing paper** in the print-build logic | Calibration issue specifically on certain paper types |
| 4 | **`imgNames`/counters aren't reset at the start of `print()`, no re-entrancy guard, no thread-safety** | "Printing flow is damaging" (corrupted/garbled jobs, crashes, stuck state) |
| 5 | **Offset/X-Y calibration UI and factory-reset/upgrade UI are stubbed but non-functional** (missing IDs, hidden, unwired) | Explains why there's no way to *manually* recalibrate print position |

Root causes #1 and #2 are the most likely explanation for what you're seeing,
and they compound each other. I'll walk through the evidence for each, then
give you concrete patches.

---

## 2. Deep-Dive: How the Tez SDK Is Wired in This Demo

### 2.1 The SDK actually supports multiple physical printer models — not just one

This single SDK package is **not** written for one printer. The demo code
proves it targets at least three distinct hardware profiles, each needing its
own `modelKey`:

```java
// YXSDK.java — used by ScanActivity -> PrintActivity (the app's main/launcher flow)
public static YXSDK newInstance() {
    if (item == null || item.name == null) return null;
    item.modelKey = "Z212";        // <-- ALWAYS "Z212", no matter what was scanned
    return new Printer_Y50();
}
```

```java
// TestActivity.java — a second, separate flow (commented out of the manifest,
// so it's not the active launcher, but it's live code in the same module)
adapter = new ListAdapter(this, dev -> {
    dev.modelKey = "TP3Z431";      // <-- a DIFFERENT modelKey for "GE920"-named devices
    YXSDK.item = dev;
    printerUtil.connect();
});
...
if (!item.name.contains("GE920")) {
    return; // devices that aren't named GE920 are filtered out of this scan flow entirely
}
```

```java
// UpdateActivity.java — a third profile constant, only referenced in a
// commented-out firmware-update call
// Command update = Command.update(PrinterConstantPool.Command.UPDATE_1_YC3121, ...);
```

There's also this commented-out line in `PrintActivity.onCreate()`:

```java
// findViewById(R.id.paper_content).setVisibility(YXSDK.item.name.startsWith("380")?View.VISIBLE:View.GONE);
```

— which tells you the *original* vendor demo intended to show/hide the
paper-size inputs depending on whether the device name started with `"380"`,
i.e. the vendor already anticipated more than one hardware family needing
different handling. It's disabled now, so the paper-size fields show for
**every** device, even ones the rest of the code never actually configures
(see §2.2).

**Why this matters for you:** `PrinterConstantPool` model keys aren't cosmetic —
they select the internal command table, checksum/protocol quirks, and (most
importantly for you) the **gap/black-mark sensor calibration profile** the SDK
uses for that specific hardware revision. If your physical Tez unit isn't
actually a genuine `"Z212"`-profile board — which is entirely possible, since
this vendor clearly ships several rebadged variants under one SDK — then every
single print job is being calibrated with the *wrong* sensor thresholds and
protocol expectations for your actual hardware. That single line is consistent
with both symptoms you reported:

- **Calibration issue** — wrong sensor/gap thresholds for your real board.
- **"Different type of printer coming" during print** — the SDK is internally
  behaving as if a different model is connected, because you told it one is.

### 2.2 `paperW` / `paperH` are collected from the UI but never reach the printer

```java
// PrintActivity.java, inside statusCall.readCall()
yxsdk.paperW = getEtValue(paperWEt, 48);
yxsdk.paperH = getEtValue(paperHEt, 30);
...
yxsdk.print(getBitmap(R.raw.test1), count, paperType);
```

`paperW` and `paperH` are stored as public fields on `YXSDK`:

```java
public int paperW;
public int paperH;
```

But grep the entire module for where they're *read* again, and there's
nothing — `Printer_Y50.nextPrint()` never touches `paperW`/`paperH`:

```java
protected void nextPrint() {
    ...
    PrintImgHelper.PrintBuild build = helper.build(printCall);
    build.enable();
    if (sendIndex == 1 && isGap) build.backoffPaper();
    build.paperType(paperType);      // only the *type* (gap/black/continuous/tattoo) is sent
    build.printImg(imgNames.remove(0));
    if (isGap) {
        build.fixedPoint();          // <-- this is the actual gap/black-mark search-and-align step
        if (sendIndex == allCount) build.forwardPaper();
    } else {
        build.printLinedots(...);
    }
    build.disenable();
    helper.run(build);
}
```

`build.paperType(paperType)` only tells the printer *which sensing mode* to
use (gap / black-mark / continuous / tattoo). It never tells it the **physical
label length/width** the user typed in. For gap- and black-mark-sensing media,
most thermal engines (this is true of the whole class of printer this SDK
targets, not specific to one brand) need the expected label length so the
sensor knows the *search window* to look for the next gap/mark in — without
it, `fixedPoint()` is searching "blind," which shows up exactly as an
intermittent or hardware-dependent calibration failure: sometimes it happens
to land correctly, sometimes it drifts, times out, or advances the wrong
amount of paper.

This also explains why the *other three* printers you've integrated don't
show this problem — their SDKs likely either don't need this value, or set it
automatically on connect/print. This one apparently expects the integrator to
push it explicitly, and the demo simply never wires it up.

> **I can't tell you the exact method name to call** (something like
> `build.paperSize(w, h)` or `build.labelSize(w, h)` almost certainly exists in
> `PrintImgHelper.PrintBuild`, given the SDK already tracks a `dpi` field and
> scales images by it), because that class lives inside the compiled AAR, not
> in your uploaded source. **Action:** open `PrintSDK-68.aar` with `jadx` (or
> check the vendor's integration doc/changelog for v68) and look for a
> paper-size / label-size setter on `PrintImgHelper.PrintBuild`. Wire
> `yxsdk.paperW` / `yxsdk.paperH` into it the same way `paperType` already is.

### 2.3 Tattoo paper is calibrated as if it were gap/black-mark stock

```java
boolean isGap = paperType != PrinterConstantPool.PaperType.CONTINUOUS;
```

This line buckets **GAP, BLACK, and TATTOO** all into the "search for a
gap/mark and align to it" branch (`backoffPaper()` → `fixedPoint()` →
`forwardPaper()`). Only `CONTINUOUS` gets the simple fixed-feed path
(`printLinedots(...)`).

Tattoo transfer paper is, in the overwhelming majority of cases, a
**continuous roll with no physical gap or black timing mark** — there's
nothing for the sensor to find. If that's true of your stock, then every time
`TATTOO` is selected, the printer is told to hunt for a mark that doesn't
exist, which will either:

- time out (`TaskCallBean.status == TIMEOUT` → your code calls
  `stopPrint("打印超时")`), or
- feed an unpredictable amount of extra paper while searching, which looks
  exactly like a calibration/alignment problem on subsequent labels.

**Action:** confirm with your actual tattoo-paper stock whether it has a
gap/mark. If it doesn't, tattoo paper belongs on the same branch as
`CONTINUOUS`:

```java
boolean isGap = paperType == PrinterConstantPool.PaperType.GAP
             || paperType == PrinterConstantPool.PaperType.BLACK;
```

### 2.4 Why "the printing flow is damaging" — state corruption, not just calibration

`YXSDK` keeps print-job state (`imgNames`, `printIndex`, `sendIndex`,
`allCount`) as plain instance fields, mutated from **two different places**:

1. The UI thread, when you call `print(...)`.
2. The Bluetooth callback thread, inside `printCall.readCall(...)`, on every
   byte the printer sends back.

Two concrete bugs fall out of that:

**(a) `imgNames` is never cleared at the start of a job — only at the end.**

```java
public void print(List<Bitmap> bitmaps, int count, int paperType) {
    if (!printer.isConnect()) return;
    this.paperType = paperType;
    helper.stopPrint();
    ...
    for (int i = 0; i < count; i++) {
        for (int j = 0; j < bitmaps.size(); j++) {
            imgNames.add("name" + j);   // <-- appended, never cleared first
        }
    }
    printIndex = 1;
    sendIndex = 0;
    allCount = imgNames.size();
    nextPrint();
    ...
}
```

`imgNames` is only ever `clear()`-ed inside `stopPrint()`. If `print()` is
called a second time **before** a prior job reached `stopPrint()` — e.g. the
user double-taps the print button, or retries after a timeout that the app
hasn't fully unwound yet, or your own app layer calls `print()` again on a
retry path — you get leftover names from the previous attempt mixed with the
new batch, while `printIndex`/`sendIndex`/`allCount` get reset as if it were a
fresh job. That mismatch between "how many names are actually queued" and
"what the counters think is queued" is exactly the kind of bug that produces
inconsistent, hard-to-reproduce symptoms: wrong image printed, extra/missing
labels, or an `IndexOutOfBoundsException` on `imgNames.remove(0)` that kills
the job mid-print.

**(b) No re-entrancy guard, and no synchronization between the two threads
touching this state.**

Nothing in `print()`, `nextPrint()`, or `printCall` stops a second `print()`
call while a job is active, and nothing synchronizes access to
`imgNames`/`printIndex`/`sendIndex`/`allCount` between the UI thread and the
Bluetooth read-callback thread. This class of bug tends to be **more visible
on whichever printer has the least stable/slowest link**, since a slower or
flakier Bluetooth stack gives you more timeouts and more opportunity for a
user (or your retry logic) to trigger an overlapping call — which fits "this
only happens with Tez."

---

## 3. Concrete Fixes

All of these changes stay inside the four files that make up the Tez
integration: `YXSDK.java`, `Printer_Y50.java`, `PrintActivity.java`,
`ScanActivity.java`. Nothing here touches shared app-level singletons that
your Tejas/Rudra/Josh code would rely on.

### 3.1 Fix the `modelKey` (highest priority)

Replace the hardcoded assignment with a resolver, and log it so you can
confirm in the field which profile got selected:

```java
// YXSDK.java
public static YXSDK newInstance() {
    if (item == null || item.name == null) return null;
    item.modelKey = resolveModelKey(item.name);
    android.util.Log.d("TezPrinter", "Resolved modelKey=" + item.modelKey
            + " for device=" + item.name + " (" + item.address + ")");
    return new Printer_Y50();
}

private static String resolveModelKey(String deviceName) {
    if (deviceName.contains("GE920")) {
        return "TP3Z431";
    }
    // TODO: confirm the full name->modelKey table with the Tez/YX vendor
    // before shipping. "Z212" is only correct for the hardware family this
    // demo shipped with by default — don't assume every unit you receive is
    // that revision.
    return "Z212";
}
```

**Before you ship this fix**, get the vendor's real name→modelKey mapping
(or at minimum test against every physical Tez unit/revision you plan to
support) — I derived `"GE920" → "TP3Z431"` from your own demo code, but I
have no way to confirm whether that table is complete.

### 3.2 Send paper size to the SDK

Once you've found the correct setter on `PrintImgHelper.PrintBuild` (see
§2.2), wire it in next to `paperType`:

```java
// Printer_Y50.java, inside nextPrint()
build.paperType(paperType);
build.paperSize(paperW * dpi, paperH * dpi); // confirm exact method name against the AAR
```

If you don't want to touch the print loop while you confirm the API, at
minimum stop silently swallowing the value — log it so you're not flying
blind:

```java
PrintActivity.log("Sending print job with paperW=" + paperW + "mm, paperH=" + paperH + "mm, paperType=" + paperType);
```

### 3.3 Reclassify tattoo paper if your stock has no physical mark

```java
// Printer_Y50.java
boolean isGap = paperType == PrinterConstantPool.PaperType.GAP
             || paperType == PrinterConstantPool.PaperType.BLACK;
```

Only do this after confirming your tattoo stock is continuous — if it *does*
have a mark, leave the original grouping alone.

### 3.4 Make `print()` re-entrant-safe and reset state cleanly

```java
// YXSDK.java
private final Object jobLock = new Object();
private volatile boolean isPrinting = false;

public void print(List<Bitmap> bitmaps, int count, int paperType) {
    if (!printer.isConnect()) {
        return;
    }
    synchronized (jobLock) {
        if (isPrinting) {
            PrintActivity.log("Ignored print(): a job is already in progress");
            return;
        }
        isPrinting = true;
        this.paperType = paperType;
        helper.stopPrint();

        imgNames.clear();                 // <-- the actual fix: always start clean
        List<ImgData> list = new ArrayList<>();
        for (int i = 0; i < bitmaps.size(); i++) {
            list.add(new ImgData("name" + i, bitmaps.get(i)));
        }
        helper.setImgDatas(128, list);
        for (int i = 0; i < count; i++) {
            for (int j = 0; j < bitmaps.size(); j++) {
                imgNames.add("name" + j);
            }
        }
        printIndex = 1;
        sendIndex = 0;
        allCount = imgNames.size();
    }

    nextPrint();
    if (callBack != null) {
        callBack.startPrint();
        callBack.Printing(printIndex);
    }
}

public void stopPrint(String msg) {
    PrintActivity.log("停止打印 : " + msg);
    helper.stopPrint();
    synchronized (jobLock) {
        printIndex = 0;
        sendIndex = 0;
        allCount = 0;
        imgNames.clear();
        isPrinting = false;
    }
    callBack.stop(msg);
}
```

And guard the success path in `printCall.readCall(...)` the same way (reset
`isPrinting = false` when `printIndex >= allCount` triggers `stopPrint(...)`,
which the change above already covers since `stopPrint` now resets it).

On the UI side, disable the print trigger while a job is active so a user
can't even generate the overlapping call in the first place:

```java
// PrintActivity.java
} else if (id == R.id.btn3) {
    findViewById(R.id.btn3).setEnabled(false);
    yxsdk.printer.addTask(Command.get_status(), "", false, statusCall);
}
```

...and re-enable it in both the `success()` and `stop(String msg)` callbacks
you already pass into `setListen(...)`.

### 3.5 Decide what to do with the dead calibration UI

`activity_print.xml` has a hidden "偏移 X / Y" (offset) block whose two
`EditText`s **have no `android:id`** — so even if you flip
`visibility="gone"` to `"visible"`, there is no way to read those values in
code today; nothing in `PrintActivity.java` reads an offset or sends one to
the SDK. Same for the hidden "出厂设置" (factory reset) / "升级" (firmware
update) buttons — they exist in the layout but have no click listeners wired
in `initListen()`.

This isn't the cause of your current bug, but it's worth flagging: if part of
your calibration plan was "let the user nudge X/Y and save it," that feature
doesn't exist yet in this demo — it's a UI placeholder only. Either implement
it properly (give the EditTexts IDs, read them, find the corresponding
offset command in the SDK) or remove the dead markup so it doesn't get
mistaken for working functionality later.

---

## 4. Verification Checklist (do this before/after each fix)

1. **Isolate hardware from app logic first.** Tap "自检页" (`btn2` →
   `Command.print_SELFTEST()`). This prints the printer's own built-in test
   page, completely independent of `paperType`, `paperW/H`, `modelKey`
   resolution, and your image pipeline. If the self-test page feeds/aligns
   correctly but app-driven prints don't, that confirms the problem is in the
   app-side configuration (§2.1–2.3), not the physical unit or the Bluetooth
   link.
2. **Log the resolved `modelKey`** for every device you test against (added
   in §3.1) and cross-check it against what you know of that physical unit's
   real revision.
3. **Test every paper-type radio button against the physical stock actually
   loaded.** If switching from GAP to BLACK (or vice versa) "fixes" the
   symptom, that confirms a paperType/isGap mismatch to your media, not a
   modelKey problem.
4. **Watch the log output** (already wired via `PrintActivity.log(...)`) for
   the hex dump on each `printCall.readCall()`. A print job that consistently
   times out (`TIMEOUT` status) rather than getting a garbled/wrong response
   points at the gap search never succeeding — consistent with wrong
   modelKey or missing paper size. A response that comes back but is
   misinterpreted points more at a modelKey/protocol mismatch.
5. **Confirm connection transport.** `PrinterManage.getInstance().getPrinter(PrinterConstantPool.SocketType.SPP)`
   is hardcoded to classic Bluetooth SPP, and BLE-named devices are filtered
   out elsewhere in this same module (`item.name.endsWith("LE")`). Make sure
   your physical Tez unit is actually classic-BT, not BLE-only.
6. **Stress-test the re-entrancy fix** by rapidly double-tapping print and by
   forcing a timeout mid-job (e.g. move out of range) and immediately
   retrying — confirm the job either completes cleanly or reports `stop()`,
   never a silent hang or `IndexOutOfBoundsException`.

---

## 5. What Was Intentionally Left Alone

- No Tejas, Rudra, or Josh files exist in the uploaded archive, and none were
  touched.
- No shared/global app state outside the four Tez-specific files listed above
  was modified.
- `PrinterManage.getInstance()` is a singleton **inside the Tez SDK's own
  package** (`com.print.printer`) — it is not the same object your other
  three vendors' SDKs use, since each vendor ships its own `com.print.*`/
  equivalent namespace. Nothing here changes how Tejas/Rudra/Josh acquire or
  use their own printer managers.

---

## 6. Appendix: Files That Make Up the Tez Integration

```
app/src/main/java/com/test/demo/print/YXSDK.java          (core state + print loop, fixes in §3.1/§3.4)
app/src/main/java/com/test/demo/print/Printer_Y50.java     (per-model print sequencing, fixes in §3.2/§3.3)
app/src/main/java/com/test/demo/print/PrintCallBack.java   (unchanged)
app/src/main/java/com/test/demo/ui/PrintActivity.java      (UI wiring, fixes in §3.4/§3.5)
app/src/main/java/com/test/demo/ui/ScanActivity.java       (device selection, feeds modelKey resolution)
app/src/main/java/com/test/demo/ui/TestActivity.java       (secondary/inactive flow — evidence only, not part of your shipped launcher)
```
