# Deep look: good and bad of each SDK inside this project

This is about how Sez Print uses the SDKs, not a review of the vendor companies. “Good” means the project gets a real capability from that SDK. “Bad” means a limit, a fragile trick, or a mismatch that shows up when you print.

Shared rule for every SDK below: the phone path is Android only. The Node server only speaks TD-404 Wi-Fi. A job is a picture (PNG) plus a few settings. The vendor library then turns that picture into whatever language that printer understands.

## TD-404 (TEJAS / RUDRA) — Ninestar

The phone module opens a classic Bluetooth socket and builds a TSPL job with Ninestar’s `LabelCommand`. The server, separately, opens TCP port 9100 and sends raw bytes. Those are two different doors into the same printer family.

**Good, in this project**

- It is the only SDK with two working transports: Bluetooth on the phone, Wi-Fi from the PC.
- The library already knows TSC/TSPL, ESC/POS, and CPCL. The app uses TSPL for labels, which matches jewellery and cable labels.
- Default print is 304 DPI. The code treats 304 DPI as 12 dots per millimetre and 203 DPI as 8 dots per millimetre, because a naive `dpi / 25.4` calculation (646 dots on a 54 mm label) gets clipped when the head wants 648. That fix is in the native print path on purpose.
- Density, speed, gap, threshold, copies, and rotation are passed through. Direction defaults to 1 because direction 0 mirrors the picture along the feed and the print no longer matches the screen.
- Bitmap packing is done in the native library, so the phone does not have to do the slow JavaScript path of PNG to gray to 1-bit to TSPL for the fast print.

**Bad, in this project**

- Bluetooth Low Energy, USB, and serial exist inside `labelprinter.aar` and are not what the app calls. The demo UI only searches classic Bluetooth. If a printer only advertises BLE, this app will not find it the way the library could.
- iOS needs a different TPL SDK. The Android file cannot be dropped into an iPhone build.
- The server cannot open Bluetooth. Asking it to returns `TRANSPORT_REQUIRES_NATIVE`.
- Wi-Fi connect gives up after 5 seconds. A printer that is slow to accept the socket looks identical to a wrong IP.
- Name matching includes TSC, POSTEK, and GAINSCHA. Those brands are not all TD-404. The wrong machine can be selected and then get TSPL it does not understand.
- A missing PNG or a failed decode throws immediately (`pngBase64 is required`, `Could not decode PNG for print`). There is no second try inside this function.

## JOSH — LPAPI (Dothantech)

The module wraps `DzPrinter` / LPAPI. It discovers printers, connects by address, and submits a fitted bitmap. Hardware progress callbacks tell the app when the printer really started, finished, or failed.

**Good, in this project**

- This is the only driver that waits for a hardware acknowledgement, not just “bytes left the phone”. Logs mark data sent, then physical print success or hardware failure.
- Gap type, gap length, density, and speed are first-class settings. That matches die-cut stock, which is what the JOSH screen claims.
- Discovery stops itself on a timeout, and it refuses to scan while Bluetooth is off or while another scan is already running.
- Print results include timings (decode, fit, submit, wait), so a slow job can be blamed on the right step.

**Bad, in this project**

- Startup uses reflection to push an Android `Application` into `com.dothantech.common.a.g`. If a future LPAPI jar renames that class, init fails even though the public API looks fine. The code already catches that and logs a warning, then tries `DzPrinter.init`.
- Discovery is skipped entirely when Bluetooth is off. The user sees an empty list, not a clear “turn Bluetooth on” from the SDK itself unless the JS layer adds it.
- Names include NIIMBOT, D110, B21, B1. Those are the same family as some LPAPI devices, but not every one is a Seznik JOSH. A match can connect and still print at the wrong width or gap.
- There is no Wi-Fi path and no iOS module.
- If the printer never sends the hardware “print finished” event, the code falls back to a safety timer after data transmission. A job can be marked done before the label is out.

## DEV — AutoReplyPrint

The module tries the vendor’s SPP port first, then a direct Bluetooth RFCOMM socket if that fails. It can print a label image, a receipt string, and a test page, and it can calibrate.

**Good, in this project**

- Two connect methods. If the vendor open-port call fails, it still tries a raw RFCOMM socket, which matches an older Bluetooth service in this product line.
- It can do both die-cut labels and plain receipt text. The other drivers are label-only.
- Status and calibration are exposed, so paper type is not only a guess in JavaScript.

**Bad, in this project**

- Connect retries several modes and sleeps 150–200 ms between steps. A bad address feels slow before it fails with `Failed to establish Bluetooth connection`.
- 203 DPI only in the model table. Fine lines that look sharp on a 304 DPI TD-404 look heavier here.
- Generic names (`POS-58`, `MTP`, `RPP`, `MPT`) will list receipt printers that are not this SDK. Sending a label bitmap to a 58 mm receipt head clips or scales badly.
- The vendor library is a native `.so` style API (`Pointer` handles). A crash inside `CP_Port_Open` is harder to catch than a normal Java exception.
- No server adapter, no iOS.

## TEZ / SHAKTI — Flashlabel-style OEM

This is the most defensive module. Work goes through a queue, a connection guard, and a retry policy. The JS side checks that the installed APK’s revision is `tez-connect-v3` before connect.

**Good, in this project**

- Commands are serialized (`SerialTaskQueue`), so two taps cannot send two jobs into one Bluetooth socket at once.
- Retry is explicit: 3 tries, 300 ms base, exponential backoff. A short radio glitch does not fail the whole label on the first error.
- Calibration, battery, and status are separate calls, not buried inside print.
- Stale APK is a hard stop with a human sentence, instead of a native crash from a function the old APK does not have.

**Bad, in this project**

- The retry delay doubles each attempt (`baseDelay * 2^attempt`). A long failure string (many retries) waits a long time. The policy caps the shift at 30, which is still a huge wait if someone raises `maxAttempts`.
- Android only. The diagnostic says that in plain text.
- You must rebuild the app whenever this native module changes. JS-only reload leaves the phone on the old revision and connect is refused.
- It is not on the Node server. There is no Wi-Fi fallback.

## Label X — LuckPrinter / GD985

The module initializes LuckPrinter, registers a custom printer profile, and prints with the vendor’s bitmap command list. The vendor folder also contains an iOS demo and a Wi-Fi guide. The app does not use those.

**Good, in this project**

- The profile is specific: 203 DPI, 48 mm max width (384 dots), gray printing on, speed setting off, density only 0, 1, or 2.
- Two command scripts are registered: one for continuous paper and one for die-cut (`print` vs `printTag`). The die-cut script is not the same bytes as the receipt script.
- The vendor SDK can report printer status (`PrinterStatus`) and connect or disconnect by callback, so the app can show “connected” from the printer, not only from the phone socket.
- The vendor docs cover Wi-Fi setup, device info, and firmware update error codes, if that work is added later.

**Bad, in this project**

- The profile forces `bleEnable(false)` and `btType("classic_ble")` while BLE is off. A Label X that only connects over BLE will not match this profile.
- Density only has three steps (0, 1, 2). The shared print-quality helper in the app aims at density around 10 for other heads. Passing 10 into Label X does not mean “darker” the same way it does on TD-404.
- Max width is hard-coded at 48 mm. A wider Label X roll is clipped by this profile even if the hardware could print it.
- Speed cannot be set (`supportSetSpeed(false)`). The speed slider in a shared print panel does nothing useful for this driver.
- The print command waits up to 60 seconds for an OK callback (`4f4b` or `aa`). A printer that never answers holds the job for a full minute.
- iOS demo and Wi-Fi docs in `backend/GD985-SDK/` are unused. The Expo module is classic Bluetooth on Android only.
- Init needs a vendor key. A wrong or empty key fails inside `PrinterHelper` and the log is the only clue.
- Name list mixes `LABELX`, `GD985`, `MINIX`, `U8`, `PPP1`, `LPC50`. Several of those are different LuckPrinter models with different widths.

## How they compare when you print the same label

| Question | TD-404 | JOSH | DEV | TEZ | Label X |
|----------|--------|------|-----|-----|---------|
| Phone Bluetooth | Yes | Yes | Yes, two methods | Yes, queued and retried | Yes, vendor profile |
| Wi-Fi from the PC server | Yes, port 9100 | No | No | No | No (docs only) |
| iOS in this app | No | No | No | No | No (demo only) |
| Default sharpness | 304 DPI | 203 DPI | 203 DPI | 203 DPI | 203 DPI, 48 mm cap |
| Knows the printer finished | Socket write | Hardware progress callback | Vendor port result | Pipeline result after retry | OK callback, up to 60 s |
| Gap / die-cut | Gap mm in TSPL | Gap type and length | Calibration | Calibration | Separate die-cut command list |
| Fragile point | Wrong brand name, BLE unused | Reflection init, safety timer | Generic POS names, native handle | Must rebuild APK | Density scale, 48 mm cap, BLE off |

## What “good” does not mean

A longer vendor ZIP is not a better integration. TD-404’s library can do USB and BLE, and Label X’s folder has iOS and Wi-Fi, but Sez Print does not call those paths. The good column above is only what a print from this app can rely on today.
