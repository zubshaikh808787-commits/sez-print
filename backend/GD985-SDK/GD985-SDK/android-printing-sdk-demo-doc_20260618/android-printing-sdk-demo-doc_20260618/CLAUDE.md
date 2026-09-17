# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Android demo app** for the LuckPrinter SDK — a Bluetooth thermal printer SDK supporting various printer models (label, continuous roll, A4 folder, tattoo, etc.). The app demonstrates SDK integration for scanning, connecting, and printing to Bluetooth printers.

**Package name:** `com.luckjingle.printersdk`
**Min SDK:** 21 (Android 5.0) | **Target SDK:** 35
**Language:** Java (with Kotlin plugin configured)

## Build Commands

```bash
cd android-printing-sdk-demo

# Build all variants
./gradlew assemble

# Build specific flavor (china or abroad)
./gradlew assembleChinaDebug
./gradlew assembleAbroadRelease

# Clean build
./gradlew clean assemble

# Install to device
./gradlew installAbroadDebug
```

**Product flavors:**
- `china` — uses `LuckPrinterSdk_OtherCompanyChina_V1.3.7.aar`
- `abroad` — uses `LuckPrinterSdk_OtherCompanyAbroad_V1.3.7.aar`

APK output naming: `sdkDemo-{version}_{flavor}-{timestamp}-release.apk`

## Architecture

### SDK Integration Point

All printer operations go through `PrinterHelper.getInstance()` (from `com.luckprinter.sdk_new`). The SDK is initialized in `App.onCreate()` with a region-specific `asKey`. Key SDK interfaces:

- `PrinterHelper` — main entry point for connect/print/device info
- `PrinterUtil` — utility methods (toast, dp conversion)
- `ClassicScanDeviceHelper` — Bluetooth device scanning
- `PrinterEnum` — supported printer model definitions

### Source Structure

```
app/src/main/java/com/luckprinter/demo/
├── App.java                          # Application class, SDK init
├── LuckPrinterSdkDemoActivity.java   # Main activity (all features)
├── BluetoothActivity.java            # Bluetooth unpair utility
├── MenuTypeEnum.java                 # Feature menu enum (27 operations)
├── PrinterDeviceAdapter.java         # RecyclerView adapter for device list
├── ButtonAdapter.java                # Grid adapter for feature buttons
├── OpenCVUtils.java                  # Image dithering (Floyd-Steinberg)
├── SPUtil.java                       # SharedPreferences util (tag dimensions)
├── EventRecorder.java                # SDK event logging
├── FileUriUtils.java                 # URI to file path conversion
├── DeviceItem.java                   # Bluetooth device model
├── bean/ButtonItem.java              # Menu button model
├── dialog/                           # Print configuration dialogs
├── repository/CustomPrinterData.java # Custom printer properties/commands
└── test/BleTest.java                 # BLE test utilities
```

### Key Flows

1. **Device Discovery** → `ClassicScanDeviceHelper` scans Bluetooth devices → populates `RecyclerView`
2. **Connect** → `PrinterHelper.connectLuck(name, mac, type)` → registers listeners
3. **Print** → Load bitmap → `OpenCVUtils.getFlyodBitmapNew()` (dithering) → `PrinterHelper.print/printTag/printCircleTag/etc.`
4. **Firmware Update** → `PrinterHelper.updatePrinterLuck(file, UpdateListener)`

### Custom Printer Registration

`CustomPrinterData` maps printer name prefixes (e.g., `"PPP1_"`, `"U8_"`) to `PrinterProperty` and `PrinterCommand` objects. Methods like `addP1()`, `addC50()` are commented out in `init()` — uncomment to enable specific printers in debug builds.

### Dependencies

- **OKHttp 4.10.0** — HTTP requests
- **FastBle 2.4.0** — BLE library (via JitPack)
- **Gson 2.10** / **FastJSON 1.2.83** — JSON serialization
- **OpenCV** — Image dithering (bundled in SDK AAR)

## Important Notes

- The signing config uses a test keystore (`test.jks`) with password `123456` — do not use in production.
- `android:allowBackup="false"` and `fullBackupContent="false"` are set for security.
- The SDK package is `com.luckprinter.sdk_new` — imports reference this, not the app's package.
- `BuildConfig.FLAVOR` is used to select the correct `asKey` at runtime.
