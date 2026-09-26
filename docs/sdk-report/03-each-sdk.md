# Each SDK — what is good and what is bad

## TD-404 / Ninestar (TEJAS, RUDRA)

**What it is.** The label-printer library from Ninestar. Android ships as `labelprinter.aar`. iOS is a separate TPL SDK in the vendor docs. The demo app is `NinestarPrinterDemo`.

**What it can talk to.** Classic Bluetooth (`SppBluetoothPort`), Bluetooth Low Energy (`BleBluetoothPort`), Wi-Fi (`EthernetPort`, port 9100), USB (`UsbPort`), and serial.

**Print languages inside the library.** TSC-style labels (`LabelCommand`), ESC/POS (`EscCommand`), and CPCL (`CpclCommand`).

**Good**

- Broadest vendor package in the repo: several cables and three command languages.
- Wi-Fi is a normal raw socket on port 9100, so the Node server can print without loading the Android library.
- Best resolution in the app list (304 DPI), which matters for small jewellery labels.
- A written analysis already exists at `backend/sdks/td404/ANALYSIS.md`.

**Bad**

- The Node server only implements Wi-Fi. Bluetooth from the server always fails with `TRANSPORT_REQUIRES_NATIVE`.
- Bluetooth Low Energy is inside the Android library, but the vendor demo screen only searches classic Bluetooth. LE is easy to assume is finished when the app never wired it.
- The Android `.aar` cannot be used on iPhone. iOS needs the vendor's own TPL SDK, and this Expo app does not include that module.
- The phone module throws as soon as the native code is missing from the APK.
- Name matching is wide (`TEJAS`, `RUDRA`, `TSC`, `POSTEK`, `GAINSCHA`, and others). A different brand can be offered as TD-404.

## JOSH / LPAPI

**What it is.** The LPAPI Bluetooth printing library, vendored as `JOSH SDK/Android SDK for Bluetooth Printing-EN-2026-03-04/LPAPI-2026-01-08-R.jar`. The phone module is `modules/josh-printer/`.

**Good**

- Matches the JOSH hardware story: gap type, gap length, density, and speed.
- PNG label printing returns timing (decode, fit, submit, wait), which makes slow jobs easier to see.
- Connect, reconnect, discovery, and a test-text print are all exposed.

**Bad**

- Android only. There is no Wi-Fi path in this app.
- Will not print until a device is connected (`No JOSH printer connected.`).
- Name filter includes `NIIMBOT`, `D110`, `B21`, and similar. A nearby printer of that family can be selected as JOSH and then fail inside the vendor library.
- Not registered on the Node server. The PC API cannot drive it.

## DEV / AutoReplyPrint

**What it is.** A 2-in-1 receipt and label driver. Phone module: `modules/dev-printer/`.

**Good**

- Status, paper calibration, PNG labels, and plain receipt text are all available.
- Useful when the same device prints a 50×30 mm die-cut label or a short receipt.

**Bad**

- Android only.
- 203 DPI, so fine jewellery text is weaker than TD-404.
- Same "module not in this APK" failure if the phone was not rebuilt.
- Name list includes generic POS names (`POS-58`, `MTP`, `RPP`). Those can belong to a different printer.

## TEZ / SHAKTI

**What it is.** The smart thermal driver with calibration. Phone module: `modules/tez-printer/`. Native revision string: `tez-connect-v3`.

**Good**

- Calibration, battery level, status, image print, and test text.
- Clearest error in the project: an old APK is rejected with instructions to rebuild, instead of a vague crash later.
- Diagnostic helper explains when the native module was never compiled in.

**Bad**

- Android only. The diagnostic says so directly.
- An old development build looks installed and still cannot connect, until you run `npx expo run:android` again.
- Not on the Node server.

## Label X / GD985 / LuckPrinter

**What it is.** LuckPrinter's OEM SDK. Vendor demos live under `backend/GD985-SDK/` (Android demo and an iOS demo, `LJBleSDKDemo`). Phone module: `modules/labelx-printer/`.

**Good**

- Vendor package includes Android and iOS demos, Wi-Fi setup notes, status, copies, and image print.
- The app module can scan, connect, read status, print a PNG, and print a test label.
- iOS integration notes in the vendor docs list Wi-Fi status, device info, and OTA error codes.

**Bad**

- This app's module is still Android-only. The iOS demo in the vendor folder is not linked into the Expo app.
- The Wi-Fi flow in the vendor docs is not what the Label X button in the app uses. The app uses Bluetooth.
- Supported names are a mixed list: `LABELX`, `GD985`, `MINIX`, `U8`, `PPP1`, `LPC50`. The wrong printer can match.
- The vendor can notify `kLuckPrinterDidNotSupportNoticeName` when the model is outside the SDK's list. The app does not turn that into a clear sentence yet.
- Not registered on the Node server.
