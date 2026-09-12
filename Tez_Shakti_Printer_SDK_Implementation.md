# Tez & Shakti Printer — Implementation Guide

> Based on the `com.yx.print:PrintSDK` ("Flashlabel" / "it_space") white-label Bluetooth
> print SDK analysis. This SDK is a generic OEM binary — the same one likely underlying
> your existing Tejas/Rudra/Josh printer integrations — so the architecture below mirrors
> what you've already shipped, with the Tez/Shakti-specific gaps closed.
>
> ⚠️ Note: this doc is written from the earlier analysis session's findings (screenshot).
> The raw `Flaslabel_SDK_JavaDoc.rar` could not be extracted in this session (no unrar/7z
> tool, no network access). Re-verify exact method names/signatures against the real
> JavaDoc before merging — treat class/method names below as **near-certain but not
> byte-verified**.

---

## 1. How the SDK Mechanism Works

### 1.1 Connection Layer
`PrinterManage → Printer → ConnectListener`

1. `SDKUtils.init(application, appKey)` — once, in `Application#onCreate`.
2. `PrinterManage.getInstance().getScanner(SocketType.SPP)` — for BT discovery.
3. `PrinterManage.getInstance().getPrinter(SocketType.SPP)` — the actual printer handle.
   - `SocketType`: `SPP=1`, `BLE=2`, `USB=4`, `WIFI=0`.
4. `ScanListener.onFound(DeviceItem)` — fires per discovered device.
5. Build a `DeviceItem` from the `BluetoothDevice` / MAC.
   - **Critical field: `DeviceItem.modelKey`** — the "printer instruction matching key."
     One SDK binary drives many rebranded hardware models via this key. If Tez/Shakti's
     key is wrong or missing, commands can silently no-op *even after a successful
     connection* — this is the #1 silent-failure trap.
6. Register listeners **before** connecting:
   ```java
   printer.setListener(connectListener);
   printer.setTaskCallback(globalTaskCallback);
   printer.connect(deviceItem);
   ```
7. `ConnectListener` callbacks (note the SDK's own typos — don't "fix" them, they're the
   real method names): `onConneted()`, `onConnetFailed(msg)`, `closed()`.

### 1.2 Command System
Every device operation is a static factory on `Command`, queued via
`printer.addTask(command, tag, hasCall, callback)`.

Common factories: `get_status()`, `get_battervol()`, `get_DENSITY()`,
`set_Density(int)`, `set_paperType(int)`, `calibration()`, `LEARN_LABEL()`,
`print_SELFTEST()`.

Two callback tiers:
| Tier | Method | Meaning |
|---|---|---|
| Ack | `sendStatus()` | Fires per queued task — cheap, just "command was sent" |
| Result | `readCall(TaskCallBean)` | Actual decoded device response |

`TaskCallBean.status` values: `OK(1)`, `FAIL(-1)`, `DEFAULT(0)`, `TIMEOUT(-2)`.

`get_status()` returns a **bitmask** — your best pre-flight gate:

| Bit | Meaning |
|---|---|
| `0x00` | Idle (ready) |
| `0x01` | Printing |
| `0x02` | Cover open |
| `0x04` | No paper |
| `0x08` | Low battery |
| `0x10` | Overheat |

### 1.3 Image / Print Pipeline
`PrintImgHelper` / `PrintBuild` — **100% bitmap-based**, no native vector/text primitives.
This is exactly why "prints don't match preview" bugs happen: if your preview renderer and
your bitmap rasterizer don't share the same rendering path, you get drift.

```java
helper.setImgData(threshold, new ImgData(name, bitmap));
helper.build(callback); // chain:
//   .cls()
//   .enable()
//   .CreatePage(widthMm, heightMm)
//   .paperType(x)
//   .density(0-15)
//   .speed(1-8)
//   .printImg(name, count)
//   .disenable()
helper.run(build);
```

### 1.4 Calibration — Two Distinct, Easily-Confused Commands
| Command | Purpose |
|---|---|
| `Command.calibration()` | Sensor **light-intensity** calibration for gap/black-mark detection |
| `Command.LEARN_LABEL()` | **Paper-length learning** (teaches the exact label length once fed) |

Both are **meaningless unless `paperType` is already set correctly** for the loaded media —
gap-sensing and black-mark-sensing calibrate on physically different signals.

### 1.5 Documented Inconsistency to Flag
`PrintBuild.paperType()`'s summary text lists hex values (`0x10/0x20/0x30/0x40`), but its
own `@param` block and `PrinterConstantPool.PaperType` enum agree on plain integers:

```
GAP = 0
CONTINUOUS = 1
BLACK = 2
TATTOO = 3
```

**Treat 0–3 as authoritative.** The hex line reads like stale copy-paste from an older SDK
revision. Confirm with one physical test per printer model before trusting either doc.

---

## 2. Design Goals for the Tez/Shakti Wrapper

1. **Connection guarding** — no command may be dispatched unless `Printer` is in a
   confirmed-connected state.
2. **Serial task queue** — calibration / print / status calls must not interleave; the
   SDK talks over a single byte stream, so concurrent `addTask()` calls will corrupt it.
3. **Retry with backoff** on `TIMEOUT` / `FAIL` responses.
4. **Calibrate → Learn** as one gated sequence, checked against `get_status()` before and
   after each step.
5. **Preview-accurate print path** — same rasterization pipeline for on-screen preview and
   for the bitmap sent to `PrintImgHelper`.
6. **modelKey correctness** for Tez and Shakti specifically (see §4).

---

## 3. Reference Architecture

```
PrinterSessionManager
 ├─ ConnectionGuard        (tracks connect state, exposes isReady())
 ├─ SerialTaskQueue         (single-threaded executor, one addTask() in flight at a time)
 ├─ RetryPolicy             (exponential backoff on TIMEOUT/FAIL)
 ├─ CalibrationController   (calibration() -> verify -> LEARN_LABEL() -> verify)
 └─ PrintPipeline           (shared raster path: Preview == PrintBuild input)
```

### 3.1 ConnectionGuard

```java
public class ConnectionGuard implements ConnectListener {
    public enum State { DISCONNECTED, CONNECTING, CONNECTED, FAILED }

    private volatile State state = State.DISCONNECTED;
    private final List<Runnable> onReadyQueue = new CopyOnWriteArrayList<>();

    public void connect(Printer printer, DeviceItem device) {
        state = State.CONNECTING;
        printer.setListener(this);
        printer.connect(device);
    }

    @Override
    public void onConneted() {           // SDK's own spelling — do not "correct"
        state = State.CONNECTED;
        drainReadyQueue();
    }

    @Override
    public void onConnetFailed(String msg) {
        state = State.FAILED;
        // surface msg to caller / trigger reconnect policy
    }

    @Override
    public void closed() {
        state = State.DISCONNECTED;
    }

    public boolean isReady() { return state == State.CONNECTED; }

    public void runWhenReady(Runnable task) {
        if (isReady()) task.run();
        else onReadyQueue.add(task);
    }

    private void drainReadyQueue() {
        for (Runnable r : onReadyQueue) r.run();
        onReadyQueue.clear();
    }
}
```

### 3.2 SerialTaskQueue

Prevents overlapping `addTask()` calls — the actual cause of most "commands silently
ignored" bugs on these SDKs.

```java
public class SerialTaskQueue {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Printer printer;

    public SerialTaskQueue(Printer printer) { this.printer = printer; }

    public CompletableFuture<TaskCallBean> submit(Command command, String tag, RetryPolicy retry) {
        CompletableFuture<TaskCallBean> future = new CompletableFuture<>();
        executor.submit(() -> dispatchWithRetry(command, tag, retry, future, 0));
        return future;
    }

    private void dispatchWithRetry(Command command, String tag, RetryPolicy retry,
                                    CompletableFuture<TaskCallBean> future, int attempt) {
        printer.addTask(command, tag, true, new TaskCallback() {
            @Override public void sendStatus() { /* ack — log only */ }

            @Override public void readCall(TaskCallBean result) {
                if (result.status == 1 /* OK */) {
                    future.complete(result);
                } else if (attempt < retry.maxAttempts()
                        && (result.status == -1 /* FAIL */ || result.status == -2 /* TIMEOUT */)) {
                    long delay = retry.backoffMillis(attempt);
                    CompletableFuture.delayedExecutor(delay, TimeUnit.MILLISECONDS)
                        .execute(() -> dispatchWithRetry(command, tag, retry, future, attempt + 1));
                } else {
                    future.completeExceptionally(
                        new PrinterCommandException(tag, result.status));
                }
            }
        });
    }
}
```

### 3.3 RetryPolicy

```java
public class RetryPolicy {
    private final int maxAttempts;
    private final long baseDelayMs;

    public RetryPolicy(int maxAttempts, long baseDelayMs) {
        this.maxAttempts = maxAttempts;
        this.baseDelayMs = baseDelayMs;
    }

    public int maxAttempts() { return maxAttempts; }

    public long backoffMillis(int attempt) {
        return baseDelayMs * (1L << attempt); // exponential
    }

    public static RetryPolicy standard() { return new RetryPolicy(3, 300); }
}
```

### 3.4 CalibrationController

```java
public class CalibrationController {
    private final SerialTaskQueue queue;

    public CalibrationController(SerialTaskQueue queue) { this.queue = queue; }

    public CompletableFuture<Void> calibrateThenLearn(int paperType) {
        return queue.submit(Command.set_paperType(paperType), "set_paperType", RetryPolicy.standard())
            .thenCompose(r -> queue.submit(Command.calibration(), "calibration", RetryPolicy.standard()))
            .thenCompose(r -> verifyIdle())
            .thenCompose(r -> queue.submit(Command.LEARN_LABEL(), "learn_label", RetryPolicy.standard()))
            .thenCompose(r -> verifyIdle())
            .thenApply(r -> null);
    }

    private CompletableFuture<TaskCallBean> verifyIdle() {
        return queue.submit(Command.get_status(), "get_status", RetryPolicy.standard())
            .thenCompose(status -> {
                if (isIdle(status)) return CompletableFuture.completedFuture(status);
                CompletableFuture<TaskCallBean> retry = new CompletableFuture<>();
                CompletableFuture.delayedExecutor(200, TimeUnit.MILLISECONDS)
                    .execute(() -> verifyIdle().whenComplete((r, e) -> {
                        if (e != null) retry.completeExceptionally(e); else retry.complete(r);
                    }));
                return retry;
            });
    }

    private boolean isIdle(TaskCallBean status) {
        int bitmask = status.data; // adjust field name to actual JavaDoc
        return bitmask == 0x00;
    }
}
```

**Sequencing rule:** never call `calibration()` or `LEARN_LABEL()` without setting
`paperType` first in the same session, and always confirm `get_status() == 0x00` (idle,
no fault bits) both before starting and after each step — cover-open / no-paper /
overheat bits mid-calibration mean the result is garbage even if the SDK reports success.

### 3.5 PrintPipeline — Preview-Accurate Printing

The core "what I see isn't what prints" bug is almost always a **rasterization
mismatch** between your preview canvas and the bitmap fed to `PrintImgHelper`. Fix:
share one renderer.

```java
public class PrintPipeline {
    private final SerialTaskQueue queue;

    public PrintPipeline(SerialTaskQueue queue) { this.queue = queue; }

    /**
     * renderForPrint MUST use the exact same layout/scale/DPI logic as the
     * on-screen preview renderer — same canvas size in mm -> px conversion,
     * same font metrics, same image scaling filter. Do not maintain two
     * separate rasterization code paths.
     */
    public Bitmap renderForPrint(LabelDocument doc, int widthMm, int heightMm, int dpi) {
        return SharedLabelRenderer.render(doc, widthMm, heightMm, dpi);
        // SharedLabelRenderer is also what backs the on-screen preview.
    }

    public CompletableFuture<Void> print(LabelDocument doc, PrintOptions opts) {
        Bitmap bmp = renderForPrint(doc, opts.widthMm, opts.heightMm, opts.dpi);

        PrintImgHelper helper = new PrintImgHelper();
        helper.setImgData(opts.threshold, new ImgData(opts.name, bmp));

        return helper.build(callback -> {
            callback.cls();
            callback.enable();
            callback.CreatePage(opts.widthMm, opts.heightMm);
            callback.paperType(opts.paperType);   // 0=GAP,1=CONTINUOUS,2=BLACK,3=TATTOO
            callback.density(opts.density);       // 0-15
            callback.speed(opts.speed);            // 1-8
            callback.printImg(opts.name, opts.count);
            callback.disenable();
        }).thenCompose(build -> runBuildOnQueue(helper, build));
    }

    private CompletableFuture<Void> runBuildOnQueue(PrintImgHelper helper, Object build) {
        CompletableFuture<Void> future = new CompletableFuture<>();
        queue.submitRaw(() -> helper.run(build, future)); // pseudocode — adapt to actual run() signature
        return future;
    }
}
```

Checklist to guarantee pixel-for-pixel preview match:
- [ ] Preview canvas and print bitmap use **identical mm→px conversion** (same DPI constant).
- [ ] Threshold/dithering applied to the print bitmap is **previewed**, not applied silently
      only at print time — otherwise gap-sensing marks or fine text can disappear on paper
      but look fine on screen.
- [ ] Any auto-scale-to-fit logic runs once, upstream of both preview and print, not
      independently in two places.
- [ ] Rotation/mirroring (if the printhead orientation requires it) is applied only in the
      print path, and documented as an intentional preview/print divergence — not a bug.

---

## 4. Tez/Shakti-Specific Gaps to Close

1. **`modelKey` mapping** — confirm the exact `modelKey` string/int for Tez and for Shakti
   with hardware/firmware team or the vendor doc; a wrong key is the most common
   "connects but nothing happens" failure on white-label SDKs like this.
2. **Paper type per device** — Tez and Shakti may ship with different default media (gap
   vs. black-mark vs. continuous). Don't hardcode `paperType`; read it from device config.
3. **Bluetooth reconnection** — reference (read-only, no code changes) how your existing
   Tejas/Rudra/Josh integrations handle:
   - stale/cached `BluetoothDevice` bonding after OS-level unpair,
   - reconnect-on-app-resume,
   - handling `closed()` mid-print vs. mid-idle differently (a `closed()` during an
     active print job should trigger a resume/retry flow, not just a generic reconnect).
4. **ITG reference only** — per your instruction, ITG's Bluetooth handling is reviewed only
   as a pattern reference (e.g. how it structures its own connection-guard/retry
   equivalent) — no code or config from ITG is touched or reused directly.

---

## 5. Testing Checklist Before Rollout

- [ ] `get_status()` bitmask verified against real device for all 6 flag combinations
      (idle, printing, cover-open, no-paper, low-battery, overheat).
- [ ] `paperType` 0–3 verified against the enum, not the (likely stale) hex doc comment.
- [ ] Calibration run on both gap-sensing and black-mark media, each on both Tez and
      Shakti hardware.
- [ ] Retry/backoff triggers correctly on a forced `TIMEOUT` (e.g. printer put to sleep
      mid-command).
- [ ] Concurrent print + status-poll from another screen does **not** interleave commands
      (verify via the `SerialTaskQueue`, not by accident of timing).
- [ ] Preview bitmap byte-compared against the bitmap actually sent to `PrintImgHelper`
      for at least one label with fine text and one with a barcode/QR.
- [ ] Reconnect flow tested: kill printer power mid-job, mid-calibration, and while idle —
      confirm distinct, correct recovery in each case.

---

## Open Item
Re-verify all class/method names above (`Command`, `PrintImgHelper`, `TaskCallBean` field
names, `PrinterConstantPool` enum values, exact `PrinterManage`/`Printer` method
signatures) against the actual `Flaslabel_SDK_JavaDoc` once it's available in an extractable
format (zip, or unpacked html/txt) — this doc encodes the analysis faithfully but hasn't been
byte-checked against the raw JavaDoc in this session.
