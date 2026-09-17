# Bluetooth Printer iOS Integration Guide

> Based on **LuckBleSDK** public headers only. This document describes exposed APIs and recommended integration flows. **SDK internal implementation is not covered.**  
> SDK source path: `/Users/apple/Desktop/BleSDK/LuckBleSDK`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Requirements & Integration](#3-requirements--integration)
4. [SDK Initialization](#4-sdk-initialization)
5. [Bluetooth Connection Flow](#5-bluetooth-connection-flow)
6. [Device Identification & Online Config](#6-device-identification--online-config)
7. [Device Info & Status Queries](#7-device-info--status-queries)
8. [Parameter Settings](#8-parameter-settings)
9. [Printing](#9-printing)
10. [Image Preprocessing](#10-image-preprocessing)
11. [Paper Feed & Task Control](#11-paper-feed--task-control)
12. [Firmware OTA](#12-firmware-ota)
13. [Sheet Printer (LuckPrinterMD)](#13-sheet-printer-luckprintermd)
14. [Low-Level Commands (LPSendTask)](#14-low-level-commands-lpsendtask)
15. [Notifications & Callbacks](#15-notifications--callbacks)
16. [Error Codes](#16-error-codes)
17. [Data Types & Enums](#17-data-types--enums)
18. [Complete API Reference](#18-complete-api-reference)
19. [Recommended Integration Sequence](#19-recommended-integration-sequence)
20. [FAQ](#20-faq)

---

## 1. Overview

LuckBleSDK connects to LuckJiang and partner thermal, label, A4, and tattoo printers over **Bluetooth LE (BLE)**, providing:

- Device scan and connection
- Model, SN, version, battery, and status queries
- Density, speed, shutdown time, paper type settings
- Roll / label / fold / tattoo printing modes
- Firmware OTA updates
- Online device configuration (`LuckConfig`)

### Difference from AI50 WiFi Printers

| Type | Typical BLE Name | Instance Type | Documentation |
|------|------------------|---------------|---------------|
| **Bluetooth printers** (this doc) | Various prefixes, not `AI50_` | `LuckPrinter` and subclasses | This document |
| **AI50 WiFi printers** | `AI50_` prefix | `LJWiFiPrinter` / `LJ_AI50` | See `AI50_WiFi_Printer_Integration_en.md` |

After connection, if `printerType == LJWifiPocketPrinter` (8) or the instance is `LJWiFiPrinter`, use the AI50 WiFi guide instead.

### Type Hierarchy (Public Headers)

```
LuckPrinterInfo          ← Device properties (model, SN, density, paper, etc.)
    └── LuckPrinter      ← Bluetooth printer base (print, OTA, query)
            └── LuckPrinterMD   ← Sheet printer extension (public header)
            └── LJWiFiPrinter   ← WiFi printer (see AI50 doc; not covered here)
```

The SDK creates the correct model instance automatically; apps typically use **`LuckPrinter *`**.

---

## 2. Architecture

| Component | Header | Role |
|-----------|--------|------|
| `JKBleManager` | `JKBleManager.h` | BLE scan, connect, disconnect; holds `printer` |
| `LuckPrinter` | `LuckPrinter.h` | Print, OTA, status/info, task dispatch |
| `LuckPrinterInfo` | `LuckPrinterInfo.h` | Device properties, paper/label sizes |
| `LuckPrinterFactory` | `LuckPrinterFactory.h` | Create printer from peripheral, fetch config |
| `LuckTool` | `LuckTool.h` | Image scale, dither, binarize |
| `UIImage (Luck)` | `UIImage+Luck.h` | Dither/binarize category methods |
| `LuckPrintConfig` | `LuckPrintConfig.h` | General print configuration |
| `LuckLabelSize` | `LuckLabelSize.h` | Label/paper dimensions |
| `LPSendTask` | `LPSendTask.h` | Composable low-level BLE command tasks |
| `ConfigCommand` | `ConfigCommand.h` | Online config command wrapper |
| `LuckConfig` | `LuckConfig.h` | Online device config management |
| `LuckConfigModel` | `LuckConfigModel.h` | Config JSON models |
| `LuckPrinterMD` | `LuckPrinterMD.h` | Sheet printer APIs |
| `LJError` | `LJError.h` | Error code definitions |

---

## 3. Requirements & Integration

### 3.1 Requirements

- iOS 13.0+ (iOS 15+ recommended)
- Xcode 15+
- **Physical device** (BLE; SDK may lack Simulator slices)

### 3.2 Dependencies

- `LuckBleSDK.framework`
- `ImageDataProcesser.xcframework`
- System: `CoreBluetooth`, `UIKit`

### 3.3 Imports

**Objective-C**

```objc
#import <LuckBleSDK/LuckBleSDK.h>
// Optional for sheet printers
#import <LuckBleSDK/LuckPrinterMD.h>
```

**Swift**

```swift
import LuckBleSDK
// Sheet printer: import LuckPrinterMD.h in Bridging Header
```

`LuckBleSDK.h` aggregates `JKBleManager`, `LuckPrinter`, `LuckTool`, `LPSendTask`, `LuckConfig`, `LuckPrintConfig`, etc.

### 3.4 Info.plist

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth is required to connect to the printer</string>
```

Add photo library usage description if picking images for printing.

---

## 4. SDK Initialization

### 4.1 AppKey (Required)

```objc
JKBleManager *mgr = [JKBleManager sharedInstance];
mgr.abroadAsKey = @"your_app_key";  // international
// mgr.asKey = @"your_app_key";     // domestic
mgr.isConnectLast = NO;
```

An invalid AppKey **prevents device connection**.

### 4.2 Recommended Startup

```objc
// 1. Set AppKey
// 2. Observe BLE connect/disconnect notifications
// 3. Observe kLuckPrinterCanSendTaskNoticeName (send commands only after this)
// 4. Optional: load LuckConfig online configuration
```

---

## 5. Bluetooth Connection Flow

### 5.1 Scan

```objc
[[JKBleManager sharedInstance] scanPrinters];
```

Stop:

```objc
[[JKBleManager sharedInstance] stopScanPrinters];
```

**Discovery notification**: `kBleDidPeripheralFoundNoticeName`  
`object` is a dictionary with key `peripheral` (`CBPeripheral *`).

**Filtering suggestions**:

- Exclude WiFi model prefixes (e.g. Demo uses `AI50_`)
- Or use `LuckPrinterInfo.filterPrefixList` and `LuckConfig.isContainDevice:`

### 5.2 Connect

```objc
[[JKBleManager sharedInstance] connect:peripheral timeout:8.0];
```

Connect by name (QR scan):

```objc
[[JKBleManager sharedInstance] connectPrinterwhichNameIs:@"DeviceName"];
```

### 5.3 Get Printer Instance

After connect and `kLuckPrinterCanSendTaskNoticeName`:

```objc
LuckPrinter *printer = [JKBleManager sharedInstance].printer;
```

### 5.4 Disconnect

```objc
[[JKBleManager sharedInstance] disconnect:peripheral];
```

### 5.5 JKBleManager API Summary

| Kind | Name | Description |
|------|------|-------------|
| Property | `printer` | Current `LuckPrinter *`, nil if disconnected |
| Property | `bleState` | System Bluetooth state |
| Property | `asKey` / `abroadAsKey` | AppKey |
| Property | `isConnectLast` | Auto-reconnect last device |
| Method | `+ sharedInstance` | Singleton |
| Method | `scanPrinters` | Start scan |
| Method | `stopScanPrinters` | Stop scan |
| Method | `connect:timeout:` | Connect peripheral |
| Method | `disconnect:` | Disconnect |
| Method | `connectPrinterwhichNameIs:` | Connect by name |
| Method | `cancelConnectFromName` | Cancel connect-by-name |
| Method | `autoConnectToLastPrinterIfHas` | Auto-connect last device |
| Method | `lastConnectPrinterName` | Last device name |
| Method | `getLastConnectPrinterInfo` | Last device info dict |
| Method | `getSystemConnectPrinter` | System-connected peripherals |

### 5.6 Bluetooth Notifications

| Macro | Description |
|-------|-------------|
| `kBleDidPeripheralFoundNoticeName` | Device discovered |
| `kBleDidConnectPeripheralNoticeName` | Connected |
| `kBleDidFailToConnectPeripheralNoticeName` | Connection failed |
| `kBleDidDisconnectPeripheralNoticeName` | Disconnected |
| `kBleDidChangeStateNoticeName` | System Bluetooth state changed |

---

## 6. Device Identification & Online Config

### 6.1 Printer Type (LJPrinterType)

Read-only `printer.printerType`:

| Value | Enum | Description |
|-------|------|-------------|
| 1 | `LJMiniPocketPrinter` | 2" mini pocket |
| 2 | `LJA4Printer` | A4 |
| 3 | `LJMiniLabelPrinter` | Half-inch mini label |
| 4 | `LJTattooPrinter` | Tattoo |
| 5 | `LJLabelPrinter` | Label |
| 6 | `LJSheetPrinter` | Sheet/shipping label |
| 7 | `LJDocumentTattooPrinter` | Document tattoo |
| 8 | `LJWifiPocketPrinter` | WiFi pocket (see AI50 doc) |
| -1 | `LJUnknownPrinter` | Unknown |

Boolean flags: `isA4Model`, `isMiniModel`, `isMDModel`, `isTattooModel`, `isLabelModel`, `isMiniLabel`.

`printerCategory`: online config category (1 mini / 2 A4 / 3 mini label / 4 tattoo / 5 label / 6 sheet / 7 doc tattoo).

### 6.2 BLE Name Prefix Filter

```objc
NSArray *prefixes = LuckPrinterInfo.filterPrefixList;
NSString *prefix = printer.prefix;
```

### 6.3 LuckPrinterFactory

| Method | Description |
|--------|-------------|
| `+ printerWith:` | Create `LuckPrinter` from `CBPeripheral` |
| `+ getPrinterConfigInfoWith:deviceType:complete:` | Fetch `LuckConfigModel` |
| `+ getPrinterInfoWith:deviceType:complete:` | Fetch model and SN strings |

### 6.4 LuckConfig (Online Configuration)

Singleton `[LuckConfig sharedInstance]` for server-delivered JSON config:

| API | Description |
|-----|-------------|
| `configs` | All device configs |
| `configData` | Current device config |
| `setDeviceConfigList:` | Set and cache config list |
| `setDeviceConfigData:` | Set and cache single config |
| `+ isContainDevice:` | Check if BLE name is supported |
| `+ getCmd:sCmd:data:` | Build command `NSData` |
| `LuckJsonParse LuckModelArrayWithJson:` | Parse JSON to models |

Boot commands on `LuckPrinter`:

```objc
[printer verifykDeviceMD5Command:bootCommandModel];
[printer setDeviceSettingCommand:settingCommandModel];
```

---

## 7. Device Info & Status Queries

> **Prerequisite**: Connected and `kLuckPrinterCanSendTaskNoticeName` received.

### 7.1 Full Info

```objc
[printer getPrinterInfo:^(LuckPrinterInfo *info, NSError *error) {
    if (!error) {
        NSLog(@"model=%@ sn=%@ version=%@ power=%lu thick=%lu",
              info.model, info.sn, info.version, (unsigned long)info.power, (unsigned long)info.thick);
    }
}];
```

**Swift**: typically `getInfo(_:)`.

### 7.2 Individual Queries

| Method | Description | Result |
|--------|-------------|--------|
| `getState:` | Printer status | `LPPrinterState` |
| `getPowerCompelete:` | Battery | `NSUInteger` 0–100 |
| `getPrinterInfo:` | Combined info | `LuckPrinterInfo *` |

Cached properties on `printer`: `model`, `sn`, `version`, `mac`, `power`, `thick`, `speed`, `closeTime`, etc.

### 7.3 Printer Status (LPPrinterState)

Bitmask flags:

| Enum | Meaning |
|------|---------|
| `LPPrinterStatePrinting` | Printing |
| `LPPrinterStateOpenCover` | Cover open |
| `LPPrinterStateOutPaper` | Out of paper |
| `LPPrinterStatePower` | Low battery |
| `LPPrinterStateHot` | Overheated |
| `LPPrinterStateCharging` | Charging |
| `LPPrinterStateMotorHot` | Motor overheated |
| `LPPrinterStateBusy` | Busy |
| `LPPrinterStateNoFoundLabel` | Label not found |
| `LPPrinterStateNone` | Normal |

### 7.4 LuckPrinterInfo Properties

| Property | Description |
|----------|-------------|
| `name` / `model` / `sn` / `mac` / `version` | Basic info |
| `dpi` | Dots per inch (e.g. 203) |
| `supportMaxWidth` | Max paper width (mm) |
| `supportWidthFormm` | Supported width labels |
| `supportLabelSizes` | Supported label sizes |
| `densityList` / `speedList` | Configured density/speed options |
| `maxDensity` / `maxSpeed` | Maximum values |
| `imageStretchRatio` | Pre-print stretch ratio, default 1 |
| `isSupportGrayPrint` | Grayscale support |
| `grayLevel` | Grayscale levels (default 16) |
| `configurable` | Configurable device |
| `isConfig` (LuckPrinter) | Has online config |

---

## 8. Parameter Settings

Typical flow: **set properties → synchronize to device**.

### 8.1 Settable Properties

| Property | Description |
|----------|-------------|
| `thick` | Print density |
| `closeTime` | Auto shutdown (minutes) |
| `speed` | Print speed |
| `paperType` | `LPPaperType` |
| `isLabel` | Label mode |
| `labelSize` | Roll/width size |
| `sizeForLabelPrint` | Label print size |
| `grayLevel` | Grayscale levels |
| `isPrinrGray` | Grayscale print flag |
| `heatLevel` | Heat compensation (some models) |

### 8.2 Synchronize to Printer

```objc
printer.thick = 2;
printer.closeTime = 30;
printer.paperType = LPPaperTypeJZ;

[printer synchronizeToPrinterCompelete:^{
    // Done
}];
```

**Swift**: `printer.synchronize { }`

### 8.3 Paper Type (LPPaperType)

| Value | Enum | Description |
|-------|------|-------------|
| 0x10 | `LPPaperTypeJZ` | Roll |
| 0x20 | `LPPaperTypeBQ` | Label |
| 0x30 | `LPPaperTypeZD` | Fold |
| 0x40 | `LPPaperTypeWS` | Tattoo |
| 0x50 | `LPPaperTypeHBBQ` | Black-mark label |
| 0x21 | `LPPaperTypeCircleLabel` | Circle label |
| 0x60 | `LPPaperTypeWZY` | Waterslide |

### 8.4 Label Size (LuckLabelSize)

```objc
NSArray *sizes = printer.supportLabelSizes;
printer.isLabel = YES;
printer.paperType = LPPaperTypeBQ;
printer.sizeForLabelPrint = sizes.firstObject;
```

Static factories: `labelList12`, `labelList40`, `labelList50`, `a4`, `a5`, etc.

---

## 9. Printing

All print APIs are public in **`LuckPrinter.h`** and query printer status before printing.

### 9.1 Print Mode Matrix

| Scenario | Paper Setup | API |
|----------|-------------|-----|
| Roll | `JZ`, `isLabel = NO` | `printImages:copies:callback:` |
| Label | `BQ`, `isLabel = YES` | `printLabelImages:copies:callback:` |
| Fold / A4 fold | `ZD` | `printFoldImages:copies:callback:` |
| Tattoo | `WS` | `printTattooImages:copies:callback:` |
| Roll (alias) | `JZ` | `printRollImages:copies:callback:` |
| Grayscale roll | set `grayLevel` | `printGrayImages:copies:callback:` |
| Grayscale label | label mode | `printGrayLabelImages:copies:callback:` |
| Configurable | `LuckPrintConfig` | `normalPrintImages:config:callback:` |

### 9.2 Roll Print Example

```objc
printer.paperType = LPPaperTypeJZ;
printer.isLabel = NO;
UIImage *processed = [printer ddPreviewImage:sourceImage];
[printer printImages:@[processed] copies:1 callback:^(NSError *error) {}];
```

**Swift**

```swift
printer.paperType = .JZ
printer.isLabel = false
printer.print([processed], copies: 1) { error in }
```

### 9.3 Label Print

```objc
printer.isLabel = YES;
printer.paperType = LPPaperTypeBQ;
[printer printLabelImages:@[img] copies:1 callback:^(NSError *e) {}];
```

### 9.4 General Print (LuckPrintConfig)

```objc
LuckPrintConfig *config = [LuckPrintConfig new];
config.density = 2;
config.copies = 1;
config.printType = LJPrintTypeNormal;
config.isGrayPrint = NO;

[printer normalPrintImages:@[img] config:config
                    callback:^(NSError *error, BOOL isFinish, NSUInteger printCount, NSUInteger printIndex) {}];
```

### 9.5 Print Control

| Method | Description |
|--------|-------------|
| `pausePrint` | Pause |
| `resumePrint` | Resume |
| `clearPrintTask` | Cancel all print jobs |
| `stopCurrentTask` | Stop current task |
| `isHaveTask` | Task in progress |

---

## 10. Image Preprocessing

### 10.1 LuckPrinter Helpers

| Method | Description |
|--------|-------------|
| `normalPreviewImage:` | Scale to printer size |
| `ezPreviewImage:` | Scale + binarize |
| `ddPreviewImage:` | Scale + dither (common for roll) |

### 10.2 LuckTool

| Method | Description |
|--------|-------------|
| `scallImage:toWidth:` | Scale to width |
| `scallImage:maxHeight:maxWidth:` | Scale within bounds |
| `dither:` / `erzhi:` / `gray:` | Image processing |
| `getBitmapByteArrayGrayFromImage:mode:perByte:` | Grayscale byte data |

### 10.3 UIImage (Luck)

| Method | Description |
|--------|-------------|
| `dither` | Dither |
| `covertToBinaryzation:` | Binarize (threshold 0–1) |
| `grayForImage:forType:` | Grayscale algorithms |

---

## 11. Paper Feed & Task Control

### 11.1 Feed by Millimeters

```objc
[printer setPrinterWalkLong:20];  // 20 mm
[printer synchronizeToPrinterCompelete:^{ }];
```

### 11.2 Send Low-Level Task

```objc
LPSendTask *task = [LPSendTask printerWalkTask:144 compelete:^(NSObject *obj) {}];
[printer sendTask:task];
```

See [§14](#14-low-level-commands-lpsendtask) for common task factories.

---

## 12. Firmware OTA

```objc
NSData *fw = [NSData dataWithContentsOfFile:path];
[printer updateVersion:fw
             onProcess:^(CGFloat progress) {}
              callback:^(NSError *error) {}];
```

| Method | Description |
|--------|-------------|
| `updateVersion:callback:` | OTA without progress |
| `updateVersion:onProcess:callback:` | OTA with progress |
| `safeUpdateVersion:callback:` | Secure OTA |

Firmware formats: typically `.bin` or `.prtu`. See [§16.2](#162-ota-errors) for error codes.

---

## 13. Sheet Printer (LuckPrinterMD)

When `isMDModel == YES` or instance is `LuckPrinterMD`:

**Extra properties**: `mdWidth`, `mdHeight`, `mdM`, `gapM`, `copies`

**Extra methods**:

| Method | Description |
|--------|-------------|
| `imageTask:compelete:` | Sheet image task |
| `mdSendImageLoopCompelete:` | Sheet send loop |

Typical setup:

```objc
md.mdWidth = 75;
md.mdHeight = 130;
md.mdM = 2;
printer.paperType = LPPaperTypeBQ;
printer.isLabel = YES;
```

---

## 14. Low-Level Commands (LPSendTask)

Public command tasks sent via `[printer sendTask:]`.

### 14.1 Common Query Tasks

`getStateTaskCompelete:`, `getInfoTaskCompelete:`, `getThickTaskCompelete:`, `getSnTaskCompelete:`, `getVersionTaskCompelete:`, `getBatteryTaskCompelete:`, `getModelTaskCompelete:`, `getMacTaskCompelete:`, `getTimeTaskCompelete:`

### 14.2 Common Set Tasks

`setThickTask:compelete:`, `setTimeTask:compelete:`, `setPaperTask:compelete:`, `setPrintPageCountTask:compelete:`, `printerWalkTask:compelete:`, `printerEnterPaperTaskCompelete:`, `printerOutPaperTaskCompelete:`, `printerLocationTaskCompelete:`, `printerEnableTaskCompelete:`, `printerStopTaskCompelete:`

### 14.3 Task Properties

| Property | Description |
|----------|-------------|
| `data` | Command payload |
| `compelete` | Completion block |
| `timeout` | Timeout (seconds) |
| `cmdType` | `LJTaskType` |

---

## 15. Notifications & Callbacks

### 15.1 Printer Notifications

| Macro | Description |
|-------|-------------|
| `kLuckPrinterCanSendTaskNoticeName` | **Ready to send commands** (required) |
| `kLuckPrinterDidNotSupportNoticeName` | Device not supported |
| `kLuckPrinterPaperCantLocationName` | Paper cannot be located |
| `kLuckPrinterGetModelName` | Model received |

### 15.2 PrintCompelete

Used by `normalPrintImages:config:callback:`:

```objc
typedef void(^PrintCompelete)(NSError *error, BOOL isFinish, NSUInteger printCount, NSUInteger printIndex);
```

---

## 16. Error Codes

### 16.1 General (LJErrorType)

| Value | Enum | Description |
|-------|------|-------------|
| 70000 | `LJError_Task_Doing` | Task in progress |
| 70001 | `LJError_Task_Timeout` | Timeout |
| 70002 | `LJError_Printer_Noconnected` | Not connected |
| 70003 | `LJError_WifiConfigFail` | WiFi config failed |
| -1 | `LJError_Unknown` | Unknown |

### 16.2 OTA Errors

| Value | Enum | Description |
|-------|------|-------------|
| 90001–90008 | `LJOTA_*` | Size, MD5, signature, timeout, etc. |

### 16.3 OTA State (LJOTASate)

`Prepare` / `Updating` / `Failure` / `Success`

---

## 17. Data Types & Enums

### LJPrintType

`Normal` / `Label` / `Tattoo` / `Fold` / `SheetLabel`

### PrintPauseStatus

`None` / `WaitPause` / `Pause`

### LPManufacturerType

`AY`, `JRP`, `YX`, `Hain`, `ZJ`, `LJ`, etc.

---

## 18. Complete API Reference

### LuckPrinter Public Interface

| Method | Description |
|--------|-------------|
| `getState:` | Status |
| `getPrinterInfo:` | Info |
| `getPowerCompelete:` | Battery |
| `synchronizeToPrinterCompelete:` | Sync properties |
| `printImages:` / `printRollImages:` | Roll print |
| `printLabelImages:` | Label print |
| `printTattooImages:` | Tattoo print |
| `printFoldImages:` | Fold print |
| `printGrayImages:` / `printGrayLabelImages:` | Grayscale |
| `normalPrintImages:config:callback:` | Configurable print |
| `normalPreviewImage:` / `ezPreviewImage:` / `ddPreviewImage:` | Preprocessing |
| `updateVersion:*` / `safeUpdateVersion:` | OTA |
| `pausePrint` / `resumePrint` | Pause/resume |
| `clearPrintTask` / `stopCurrentTask` / `isHaveTask` | Task control |
| `sendTask:` / `sendTaskList:` / `sendConfigTaskList:` | Command dispatch |
| `deviceAuthWithList:` / `deviceWriteModel:` | Authorization |
| `verifykDeviceMD5Command:` / `setDeviceSettingCommand:` | Boot commands |

> Methods marked as internal integration (e.g. `*SendImageLoopCompelete:`) are **not listed** and should not be called by apps.

---

## 19. Recommended Integration Sequence

```
App launch → Set AppKey → Register notifications
    → scanPrinters → User selects device
    → connect:timeout:
    → Wait kLuckPrinterCanSendTaskNoticeName
    → getPrinterInfo → Optional settings + synchronize
    → Preprocess image → printImages / printLabelImages / …
    → Optional OTA → disconnect
```

---

## 20. FAQ

### Q1: No devices found?

Check AppKey, Bluetooth permission, phone Bluetooth, physical device, and `filterPrefixList` / `LuckConfig.isContainDevice:`.

### Q2: Connected but cannot print?

Wait for **`kLuckPrinterCanSendTaskNoticeName`**. Check `printer` non-nil and printer status (paper, cover, battery).

### Q3: Which print API to use?

See [§9.1](#91-print-mode-matrix).

### Q4: Swift name differences?

| Objective-C | Swift |
|-------------|-------|
| `printImages:…` | `print(_:copies:callback:)` |
| `printLabelImages:…` | `printLabel(_:…)` |
| `printFoldImages:…` | `printFold(_:…)` |
| `getPrinterInfo:` | `getInfo(_:)` |
| `synchronizeToPrinterCompelete:` | `synchronize(completionHandler:)` |

Use Xcode autocomplete as source of truth.

### Q5: Density/speed options?

Use `printer.densityList` and `printer.speedList`.

### Q6: Can AI50 use this document?

No — use the **AI50 WiFi Integration Guide** for `AI50_` / `LJWifiPocketPrinter` devices.

---

## Appendix: Public Header Files

| Header | Description |
|--------|-------------|
| `LuckBleSDK.h` | SDK entry |
| `JKBleManager.h` | Bluetooth manager |
| `LuckPrinter.h` | Main printer class |
| `LuckPrinterInfo.h` | Device info & enums |
| `LuckPrinterFactory.h` | Instance factory |
| `LuckTool.h` | Image utilities |
| `UIImage+Luck.h` | Image category |
| `LuckPrintConfig.h` | Print config |
| `LuckLabelSize.h` | Label sizes |
| `LPSendTask.h` | Command tasks |
| `ConfigCommand.h` | Config commands |
| `LuckConfig.h` / `LuckConfigModel.h` | Online config |
| `LuckPrinterMD.h` | Sheet printer |
| `LJError.h` | Error codes |

---

*Document version: 1.0 | Based on LuckBleSDK public headers*
