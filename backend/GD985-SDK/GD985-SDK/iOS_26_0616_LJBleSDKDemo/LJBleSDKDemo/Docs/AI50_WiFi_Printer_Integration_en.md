# AI50 WiFi Printer iOS Integration Guide

> Based on **LuckBleSDK** public headers only. This document describes exposed APIs and recommended integration flows. **SDK internal implementation is not covered.**  
> SDK source path: `/Users/apple/Desktop/BleSDK/LuckBleSDK`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Requirements & Integration](#3-requirements--integration)
4. [SDK Initialization](#4-sdk-initialization)
5. [Bluetooth Connection Flow](#5-bluetooth-connection-flow)
6. [WiFi Provisioning & Management](#6-wifi-provisioning--management)
7. [Device Info & Status Queries](#7-device-info--status-queries)
8. [Printing](#8-printing)
9. [Firmware OTA](#9-firmware-ota)
10. [Notifications & Callbacks](#10-notifications--callbacks)
11. [Error Codes](#11-error-codes)
12. [Data Types & Enums](#12-data-types--enums)
13. [Complete API Reference](#13-complete-api-reference)
14. [Recommended Integration Sequence](#14-recommended-integration-sequence)
15. [FAQ](#15-faq)

---

## 1. Overview

The **AI50** is a **WiFi pocket printer**. In LuckBleSDK, the app communicates with the device over **Bluetooth LE (BLE)** to perform:

- WiFi provisioning (SSID / password)
- Device info, status, and battery queries
- Density, volume, shutdown time, and other settings
- Image printing
- Firmware OTA updates

Class hierarchy in the SDK:

```
LuckPrinterInfo
    └── LuckPrinter
            └── LJWiFiPrinter    ← WiFi printer base class (public header)
                    └── LJ_AI50  ← AI50 model (public header, no extra methods)
```

In addition to `LJWiFiPrinter` / `LJ_AI50` APIs, AI50 inherits general printing, OTA, and status APIs from `LuckPrinter`.

---

## 2. Architecture

| Layer | Class | Responsibility |
|-------|-------|----------------|
| Connection | `JKBleManager` | Scan, connect, disconnect BLE; holds current `printer` |
| Global WiFi config | `LJWiFiConfig` | Singleton; provisioning, status listener, some settings |
| WiFi printer instance | `LJWiFiPrinter` / `LJ_AI50` | Obtained from `JKBleManager.printer` after connect |
| Printer base | `LuckPrinter` | Print, OTA, general status/info APIs |
| Device info model | `LuckPrinterInfo` | Model, SN, battery, WiFi SSID, volume, etc. |
| Image utilities | `LuckTool` | Scale, dither, binarize (optional preprocessing) |

**Important notes:**

1. AI50 control traffic goes over **Bluetooth**. WiFi is used for the printer to join the LAN; print and control commands are still sent via BLE (encapsulated by the SDK).
2. BLE broadcast names typically use the **`AI50_`** prefix (Demo filter rule; see `LuckPrinterInfo.filterPrefixList` for the authoritative list).
3. After connection, `LuckPrinter.printerType == LJWifiPocketPrinter` (value **8**) indicates a WiFi pocket printer.

---

## 3. Requirements & Integration

### 3.1 Requirements

- iOS 13.0+ (iOS 15+ recommended)
- Xcode 15+
- Physical device for BLE (SDK framework may not include Simulator slices)

### 3.2 Dependencies

When integrating LuckBleSDK you typically need:

- `LuckBleSDK.framework`
- `ImageDataProcesser.xcframework` (SDK dependency)
- System frameworks: `CoreBluetooth`, `UIKit`

### 3.3 Import Headers

**Objective-C**

```objc
#import <LuckBleSDK/LuckBleSDK.h>
// WiFi printer instance APIs (additional import)
#import <LuckBleSDK/LJWiFiPrinter.h>
#import <LuckBleSDK/LJ_AI50.h>
```

> `LuckBleSDK.h` includes `JKBleManager`, `LuckPrinter`, `LJWiFiConfig`, etc. Import `LJWiFiPrinter.h` separately for instance APIs.

**Swift**

```swift
import LuckBleSDK
// Import LJWiFiPrinter.h in Bridging Header for LJWiFiPrinter-specific APIs
```

### 3.4 Info.plist Permissions

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth is required to connect to the AI50 WiFi printer</string>
```

For photo picking:

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Photo library access is required to select images for printing</string>
```

---

## 4. SDK Initialization

### 4.1 AppKey

`JKBleManager` exposes two key properties. **An invalid key prevents device connection:**

| Property | Description |
|----------|-------------|
| `asKey` | Domestic AppKey |
| `abroadAsKey` | International AppKey |

**Objective-C**

```objc
JKBleManager *manager = [JKBleManager sharedInstance];
manager.abroadAsKey = @"your_app_key_here";  // or manager.asKey
manager.isConnectLast = NO;
```

**Swift**

```swift
let manager = JKBleManager.sharedInstance()
manager.abroadAsKey = "your_app_key_here"
manager.isConnectLast = false
```

### 4.2 Recommended Startup Steps

1. Set AppKey  
2. Register BLE connect/disconnect notifications (see [§10](#10-notifications--callbacks))  
3. Observe `kLuckPrinterCanSendTaskNoticeName` and **only send commands after it fires**

---

## 5. Bluetooth Connection Flow

### 5.1 Scan

```objc
[[JKBleManager sharedInstance] scanPrinters];
```

```swift
JKBleManager.sharedInstance().scanPrinters()
```

Stop scanning:

```objc
[[JKBleManager sharedInstance] stopScanPrinters];
```

Discovery notification: `kBleDidPeripheralFoundNoticeName`  
`object` dictionary contains `peripheral` (`CBPeripheral`).

### 5.2 Connect

```objc
[[JKBleManager sharedInstance] connect:peripheral timeout:8];
```

```swift
JKBleManager.sharedInstance().connect(peripheral, timeout: 8)
```

| Notification | Meaning |
|--------------|---------|
| `kBleDidConnectPeripheralNoticeName` | Connected |
| `kBleDidFailToConnectPeripheralNoticeName` | Connection failed |
| `kBleDidDisconnectPeripheralNoticeName` | Disconnected |
| `kBleDidChangeStateNoticeName` | System Bluetooth state changed |

### 5.3 Get Current Printer Instance

After connection:

```objc
LuckPrinter *printer = [JKBleManager sharedInstance].printer;
LJWiFiPrinter *wifiPrinter = (LJWiFiPrinter *)printer;
```

```swift
guard let printer = JKBleManager.sharedInstance().printer as? LJWiFiPrinter else { return }
```

### 5.4 Disconnect

```objc
[[JKBleManager sharedInstance] disconnect:peripheral];
```

### 5.5 Other JKBleManager APIs

| Method | Description |
|--------|-------------|
| `+ sharedInstance` | Singleton |
| `printer` | Current `LuckPrinter *` |
| `bleState` | System Bluetooth state (`CBManagerState`) |
| `lastConnectPrinterName` | Last connected device name |
| `getLastConnectPrinterInfo` | Last connected device info dictionary |
| `getSystemConnectPrinter` | System-connected peripherals |
| `autoConnectToLastPrinterIfHas` | Auto-connect last device |
| `connectPrinterwhichNameIs:` | Connect by name (QR scan scenarios) |
| `cancelConnectFromName` | Cancel connect-by-name |

---

## 6. WiFi Provisioning & Management

WiFi APIs are available via **`LJWiFiConfig` singleton** or **`LJWiFiPrinter` instance**. Both are public; they largely overlap. **Prefer instance methods when connected**; use `LJWiFiConfig` for global status listening.

### 6.1 WiFi Provisioning

Send SSID and password to the printer:

**LJWiFiConfig**

```objc
[[LJWiFiConfig sharedInstance] wifiConfigSSID:@"YourWiFi"
                                        pwd:@"YourPassword"
                                   complete:^(LJWiFiStatus status, NSError *error) {
    // Handle result
}];
```

**LJWiFiPrinter**

```objc
[wifiPrinter wifiConfigSSID:@"YourWiFi"
                        pwd:@"YourPassword"
                   complete:^(LJWiFiStatus status, NSError *error) {
    // Handle result
}];
```

**Swift**

```swift
LJWiFiConfig.sharedInstance().wifiConfigSSID("YourWiFi", pwd: "YourPassword") { status, error in
    // ...
}
```

### 6.2 Listen for WiFi Status (Device-Reported)

**LJWiFiConfig** (with error):

```objc
[[LJWiFiConfig sharedInstance] addWifiStatus:^(LJWiFiStatus status, NSError *error) {
    // 6000 connecting / 6001 success / 6002 wrong password / 6003 disconnected / 6009 unknown
}];
```

**LJWiFiPrinter** (status only):

```objc
[wifiPrinter addWifiStatus:^(LJWiFiStatus status) {
    // ...
}];
```

Property callbacks:

```objc
wifiPrinter.connectStatusCallback = ^(LJWiFiStatus status) { /* cleared when not connecting */ };
wifiPrinter.statusCallback = ^(LJWiFiStatus status) { /* status listener */ };
```

### 6.3 Query WiFi Connection Status (App-Initiated)

```objc
[wifiPrinter getWifiConnectStatusComplete:^(LJWiFiQueryStatus status, NSError *error) {
    // 0 not connected / 1 connecting / 2 connected
}];
```

`LJWiFiConfig` exposes the same method.

### 6.4 Scan Nearby WiFi Networks

> **Only exposed on `LJWiFiPrinter`**. The corresponding method in `LJWiFiConfig.h` is commented out and **not available**.

```objc
[wifiPrinter getWifiPrinterAroundSignal:10
                               complete:^(NSArray<NSString *> *wifiList, NSError *error) {
    // wifiList: nearby SSID names
}];
```

`count`: desired number of access points to return.

### 6.5 Factory Reset

```objc
[wifiPrinter wifiResetDevice];
// or
[[LJWiFiConfig sharedInstance] wifiResetDevice];
```

No callback; resets WiFi and related settings to defaults.

---

## 7. Device Info & Status Queries

### 7.1 Full Device Info

**LJWiFiConfig / LJWiFiPrinter**

```objc
[wifiPrinter getWifiPrinterDeviceInfoComplete:^(LuckPrinterInfo *info, NSError *error) {
    NSLog(@"Version: %@, SN: %@, Model: %@, Battery: %lu",
          info.version, info.sn, info.model, (unsigned long)info.power);
    NSLog(@"SSID: %@, Volume: %ld/%ld", info.ssid, (long)info.volume, (long)info.maxVolume);
}];
```

Returns `LuckPrinterInfo *` with WiFi-specific fields:

| Property | Description |
|----------|-------------|
| `ssid` | Connected WiFi SSID |
| `volume` | Current volume |
| `maxVolume` | Maximum volume |
| `wifiStatus` | WiFi status code |

**Packet callback (LJWiFiPrinter only)**

When device info arrives in multiple packets:

```objc
wifiPrinter.infoCallback = ^(NSObject *info, BOOL isFinish) {
    // isFinish == YES when all packets received
};
wifiPrinter.packetCache; // NSMutableDictionary for packet cache
```

### 7.2 Individual Query APIs (LJWiFiPrinter)

| Method | Description | Callback |
|--------|-------------|----------|
| `getWifiPrinterModelComplete:` | Query model | `NSString *model` |
| `getWifiPrinterSNComplete:` | Query SN | `NSString *sn` |
| `getWifiPrinterVersionComplete:` | Query firmware version | `NSString *version` |
| `getWifiPrinterStatua:` | Query printer status | `LPPrinterState status` |
| `getWifiPrinterPower:` | Query battery | `NSInteger power` (0–100) |
| `getWifiPrinterDensity:` | Query density | `NSInteger density` |
| `getWifiPrinterCloseTime:` | Query auto shutdown time | `NSInteger time` (minutes) |
| `getWifiPrinterVolumeComplete:` | Query volume | `max`, `current` |
| `getWifiPrinterModeComplete:` | Query boot/mode | `NSInteger model` |
| `getWifiPrinterPaperType:` | Query paper type | `LPPaperType type` |

**LJWiFiConfig** also exposes: `getWifiPrinterModelComplete:`, `getWifiPrinterDeviceInfoComplete:`, `getWifiPrinterVolumeComplete:`, `setWifiPrinterCloseTime:complete:`, etc. (see [§13.3](#133-ljwificonfig)).

### 7.3 Printer Status Flags (LPPrinterState)

`LPPrinterState` is a bitmask (`NS_OPTIONS`):

| Value | Meaning |
|-------|---------|
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

**Example**

```objc
if (status & LPPrinterStateOutPaper) {
    // Out of paper
}
```

### 7.4 Inherited LuckPrinter Queries

| Method | Description |
|--------|-------------|
| `getState:` | Get printer state |
| `getPrinterInfo:` | Get printer info (Swift: may be `getInfo`) |
| `getPowerCompelete:` | Get battery level |

---

## 8. Printing

### 8.1 Before Printing

1. Ensure BLE is connected and `kLuckPrinterCanSendTaskNoticeName` has fired  
2. Set paper type if needed: `setWifiPrinterPaperType:complete:` or `paperType` property  
3. Preprocess image (scale / dither / binarize via `LuckTool` or `ddPreviewImage:` / `ezPreviewImage:`)  
4. Set copy count  

### 8.2 Set Copy Count

**LJWiFiPrinter**

```objc
[wifiPrinter setWifiPrinterCopies:2 complete:^(NSError *error) {
    // ...
}];
```

### 8.3 Option A: LuckPrinter General Print (Recommended)

Inherited from `LuckPrinter`; checks status before printing:

```objc
[wifiPrinter printImages:@[processedImage]
                  copies:1
                callback:^(NSError *error) {
    if (!error) { /* success */ }
}];
```

**Swift**

```swift
wifiPrinter.print([processedImage], copies: 1) { error in
    // ...
}
```

Other inherited methods:

| Method | Description |
|--------|-------------|
| `printLabelImages:copies:callback:` | Label paper |
| `printTattooImages:copies:callback:` | Tattoo paper |
| `printFoldImages:copies:callback:` | Fold paper |
| `printGrayImages:copies:callback:` | Grayscale roll paper |
| `printGrayLabelImages:copies:callback:` | Grayscale label |
| `printRollImages:copies:callback:` | Roll paper |
| `normalPrintImages:config:callback:` | Configurable print (`LuckPrintConfig`) |

**LuckPrintConfig properties**

| Property | Description |
|----------|-------------|
| `density` | Density; 0 = default |
| `copies` | Copy count |
| `printType` | `LJPrintTypeNormal/Label/Tattoo/Fold/SheetLabel` |
| `isGrayPrint` | Grayscale print flag |

### 8.4 Option B: LJWiFiPrinter Direct Send

```objc
[wifiPrinter printerSendImage:processedImage
                     complete:^(BOOL isSuccsess) {
    // ...
}];

[wifiPrinter printerSendGrayImage:processedImage
                        grayLevel:16
                         complete:^(BOOL isSuccsess) {
    // ...
}];
```

> Usually call `setWifiPrinterCopies:complete:` before this path.

### 8.5 Image Preprocessing (LuckTool)

| Method | Description |
|--------|-------------|
| `+ scallImage:toWidth:` | Scale to width |
| `+ scallImage:maxHeight:maxWidth:` | Scale within max bounds |
| `+ dither:` | Dither |
| `+ erzhi:` | Binarize |
| `+ gray:` | Grayscale |
| `+ getBitmapByteArrayGrayFromImage:mode:perByte:` | Grayscale print byte data |

**LuckPrinter preview helpers**

| Method | Description |
|--------|-------------|
| `normalPreviewImage:` | Scale to printer size |
| `ezPreviewImage:` | Scale + binarize |
| `ddPreviewImage:` | Scale + dither |

Before printing:

```objc
wifiPrinter.paperType = LPPaperTypeJZ;  // roll paper
wifiPrinter.isLabel = NO;
```

---

## 9. Firmware OTA

Inherited from `LuckPrinter`:

```objc
NSData *fwData = [NSData dataWithContentsOfFile:firmwarePath];

[wifiPrinter updateVersion:fwData
                 onProcess:^(CGFloat progress) {
    // progress: 0.0 ~ 1.0
} callback:^(NSError *error) {
    if (!error) { /* success */ }
}];
```

| Method | Description |
|--------|-------------|
| `updateVersion:callback:` | OTA without progress |
| `updateVersion:onProcess:callback:` | OTA with progress |
| `safeUpdateVersion:callback:` | Secure OTA |

**OTA properties**

| Property | Description |
|----------|-------------|
| `otaSate` | OTA state (`LJOTASate`) |
| `otaProcessBlcok` | Progress callback block |

**Firmware formats**: typically `.bin` or `.prtu` (device-dependent).

See [§11.2](#112-ota-errors-ljotaerror) for OTA error codes.

---

## 10. Notifications & Callbacks

### 10.1 Bluetooth (JKBleManager.h)

| Macro | Description |
|-------|-------------|
| `kBleDidConnectPeripheralNoticeName` | Connected |
| `kBleDidDisconnectPeripheralNoticeName` | Disconnected |
| `kBleDidFailToConnectPeripheralNoticeName` | Connection failed |
| `kBleDidChangeStateNoticeName` | Bluetooth state changed |
| `kBleDidPeripheralFoundNoticeName` | Device discovered |

### 10.2 Printer (LuckPrinter.h)

| Macro | Description |
|-------|-------------|
| `kLuckPrinterCanSendTaskNoticeName` | **Ready to send commands** (important) |
| `kLuckPrinterDidNotSupportNoticeName` | Device not supported |
| `kLuckPrinterPaperCantLocationName` | Paper cannot be located |
| `kLuckPrinterGetModelName` | Model received |

### 10.3 Swift Example

```swift
NotificationCenter.default.addObserver(
    forName: NSNotification.Name("kLuckPrinterCanSendTaskNoticeName"),
    object: nil,
    queue: .main
) { _ in
    // Safe to call print, query, provision APIs
}
```

---

## 11. Error Codes

### 11.1 General Errors (LJErrorType)

| Value | Enum | Description |
|-------|------|-------------|
| 70000 | `LJError_Task_Doing` | Task in progress |
| 70001 | `LJError_Task_Timeout` | Request timeout |
| 70002 | `LJError_Printer_Noconnected` | Printer not connected |
| 70003 | `LJError_WifiConfigFail` | WiFi provisioning failed |
| -1 | `LJError_Unknown` | Unknown error |

### 11.2 OTA Errors (LJOTAError)

| Value | Enum | Description |
|-------|------|-------------|
| 90001 | `LJOTA_SIZE_ERROR` | Invalid file size |
| 90002 | `LJOTA_FILE_MD5_ERROR` | MD5 mismatch |
| 90003 | `LJOTA_SAME_MD5_ERROR` | Same firmware |
| 90004 | `LJOTA_PROTOCOL_PARSE_ERROR` | Protocol parse error |
| 90005 | `LJOTA_FAIL_ERROR` | Update failed |
| 90006 | `LJOTA_TIMEOUT_ERROR` | Timeout |
| 90007 | `LJOTA_SIGNATURE_ERROR` | Invalid signature |
| 90008 | `LJOTA_NONSUPPORT_SAFEUPDATE_ERROR` | Secure update not supported |

---

## 12. Data Types & Enums

### 12.1 WiFi Provisioning Status (LJWiFiStatus)

| Value | Enum | Description |
|-------|------|-------------|
| 6000 | `LJWiFiStatusConnecting` | Connecting |
| 6001 | `LJWiFiStatusSuccess` | Success |
| 6002 | `LJWiFiStatusPWDError` | Wrong password |
| 6003 | `LJWiFiStatusDisconnect` | Disconnected |
| 6009 | `LJWiFiStatusNone` | Unknown |

### 12.2 WiFi Query Status (LJWiFiQueryStatus)

| Value | Enum | Description |
|-------|------|-------------|
| 0 | `LJWiFiQueryStatusNone` | Not connected |
| 1 | `LJWiFiQueryStatusConnecting` | Connecting |
| 2 | `LJWiFiQueryStatusConnected` | Connected |

### 12.3 Printer Type (LJPrinterType)

AI50:

| Value | Enum | Description |
|-------|------|-------------|
| 8 | `LJWifiPocketPrinter` | WiFi pocket printer |

### 12.4 Paper Type (LPPaperType)

| Value | Enum | Description |
|-------|------|-------------|
| 0x10 | `LPPaperTypeJZ` | Roll paper |
| 0x20 | `LPPaperTypeBQ` | Label paper |
| 0x30 | `LPPaperTypeZD` | Fold paper |
| 0x40 | `LPPaperTypeWS` | Tattoo paper |
| 0x50 | `LPPaperTypeHBBQ` | Black-mark label |
| 0x21 | `LPPaperTypeCircleLabel` | Circle label |
| 0x60 | `LPPaperTypeWZY` | Waterslide paper |

---

## 13. Complete API Reference

Only APIs from **public AI50 WiFi headers** are listed.

### 13.1 JKBleManager

| Kind | Name | Description |
|------|------|-------------|
| Property | `printer` | Current `LuckPrinter *` |
| Property | `bleState` | Bluetooth state |
| Property | `asKey` / `abroadAsKey` | AppKey |
| Property | `isConnectLast` | Auto-connect last device |
| Method | `+ sharedInstance` | Singleton |
| Method | `scanPrinters` | Start scan |
| Method | `stopScanPrinters` | Stop scan |
| Method | `connect:timeout:` | Connect peripheral |
| Method | `disconnect:` | Disconnect peripheral |
| Method | `connectPrinterwhichNameIs:` | Connect by name |
| Method | `autoConnectToLastPrinterIfHas` | Auto-connect |
| Method | `lastConnectPrinterName` | Last device name |
| Method | `getLastConnectPrinterInfo` | Last device info |
| Method | `getSystemConnectPrinter` | System-connected peripherals |
| Method | `cancelConnectFromName` | Cancel connect-by-name |

### 13.2 LJWiFiPrinter

| Kind | Name | Description |
|------|------|-------------|
| Property | `connectStatusCallback` | Provisioning status callback |
| Property | `statusCallback` | WiFi status listener |
| Property | `infoCallback` | Packet device-info callback |
| Property | `packetCache` | Packet cache dictionary |
| Method | `wifiConfigSSID:pwd:complete:` | WiFi provisioning |
| Method | `wifiResetDevice` | Factory reset |
| Method | `getWifiConnectStatusComplete:` | Query WiFi status |
| Method | `addWifiStatus:` | Listen WiFi status |
| Method | `getWifiPrinterAroundSignal:complete:` | Scan nearby WiFi |
| Method | `getWifiPrinterDeviceInfoComplete:` | Get device info |
| Method | `getWifiPrinterStatua:` | Get printer status |
| Method | `getWifiPrinterPower:` | Get battery |
| Method | `getWifiPrinterDensity:` | Get density |
| Method | `setWifiPrinterDensity:complete:` | Set density |
| Method | `getWifiPrinterPaperType:` | Get paper type |
| Method | `setWifiPrinterPaperType:complete:` | Set paper type |
| Method | `getWifiPrinterCloseTime:` | Get shutdown time |
| Method | `setWifiPrinterCloseTime:complete:` | Set shutdown time |
| Method | `getWifiPrinterVolumeComplete:` | Get volume |
| Method | `setWifiPrinterVolume:Complete:` | Set volume |
| Method | `getWifiPrinterModeComplete:` | Get boot mode |
| Method | `setWifiPrinterMode:Complete:` | Set boot mode |
| Method | `getWifiPrinterModelComplete:` | Get model |
| Method | `getWifiPrinterSNComplete:` | Get SN |
| Method | `getWifiPrinterVersionComplete:` | Get version |
| Method | `setWifiPrinterLanguage:Complete:` | Set language |
| Method | `setWifiPrinterCopies:complete:` | Set copy count |
| Method | `printerSendImage:complete:` | Send image for print |
| Method | `printerSendGrayImage:grayLevel:complete:` | Grayscale print |

### 13.3 LJWiFiConfig

| Method | Description |
|--------|-------------|
| `+ sharedInstance` | Singleton |
| `wifiConfigSSID:pwd:complete:` | WiFi provisioning |
| `wifiResetDevice` | Factory reset |
| `getWifiConnectStatusComplete:` | Query WiFi status |
| `addWifiStatus:` | Listen WiFi status |
| `getWifiPrinterDeviceInfoComplete:` | Get device info |
| `setWifiPrinterCloseTime:complete:` | Set shutdown time |
| `getWifiPrinterVolumeComplete:` | Get volume |
| `setWifiPrinterVolume:Complete:` | Set volume |
| `getWifiPrinterModelComplete:` | Get model |
| `setWifiPrinterModel:Complete:` | Set model |
| `setWifiPrinterLanguage:Complete:` | Set language |

> `getWifiPrinterAroundSignal:complete:` is **commented out** in `LJWiFiConfig.h` and not available.

### 13.4 LJ_AI50

```objc
@interface LJ_AI50 : LJWiFiPrinter
@end
```

No additional public methods. After connecting an AI50, the instance type is `LJ_AI50` or `LJWiFiPrinter`.

### 13.5 LuckPrinter (Inherited APIs Usable on AI50)

| Method | Description |
|--------|-------------|
| `printImages:copies:callback:` | Roll paper print |
| `printLabelImages:copies:callback:` | Label print |
| `printTattooImages:copies:callback:` | Tattoo print |
| `printFoldImages:copies:callback:` | Fold print |
| `printGrayImages:copies:callback:` | Grayscale print |
| `normalPrintImages:config:callback:` | Configurable print |
| `updateVersion:callback:` | OTA |
| `updateVersion:onProcess:callback:` | OTA with progress |
| `safeUpdateVersion:callback:` | Secure OTA |
| `getState:` | Get status |
| `getPrinterInfo:` | Get info |
| `getPowerCompelete:` | Get battery |
| `synchronizeToPrinterCompelete:` | Sync properties to device |
| `normalPreviewImage:` / `ezPreviewImage:` / `ddPreviewImage:` | Image preprocessing |
| `pausePrint` / `resumePrint` | Pause / resume |
| `clearPrintTask` | Cancel print queue |

---

## 14. Recommended Integration Sequence

```
App launch
  │
  ├─ 1. Set JKBleManager.asKey / abroadAsKey
  ├─ 2. Register BLE & kLuckPrinterCanSendTaskNoticeName observers
  │
  ▼
Scan AI50 devices (scanPrinters)
  │
  ├─ Listen to kBleDidPeripheralFoundNoticeName, filter AI50_ prefix
  │
  ▼
User selects device → connect:timeout:
  │
  ├─ kBleDidConnectPeripheralNoticeName
  ├─ Wait for kLuckPrinterCanSendTaskNoticeName  ← required
  │
  ▼
(Optional) WiFi provisioning wifiConfigSSID:pwd:complete:
  │
  ├─ addWifiStatus: for provisioning result
  │
  ▼
Query device info / status / battery
  │
  ▼
Preprocess image → printImages:copies:callback: or printerSendImage:complete:
  │
  ▼
(Optional) updateVersion:onProcess:callback: for OTA
  │
  ▼
disconnect: or user exits
```

---

## 15. FAQ

### Q1: Cannot discover AI50 devices?

- Verify AppKey  
- Verify Info.plist Bluetooth permission  
- Ensure phone Bluetooth is on  
- Device name should start with `AI50_` (or check `LuckPrinterInfo.filterPrefixList`)  
- Use a physical device, not Simulator  

### Q2: Connected but commands don't work?

- Wait for **`kLuckPrinterCanSendTaskNoticeName`** before calling APIs  
- Ensure `JKBleManager.printer` is non-nil  

### Q3: How to detect AI50 WiFi printer?

```objc
LuckPrinter *p = [JKBleManager sharedInstance].printer;
if ([p isKindOfClass:[LJWiFiPrinter class]] || p.printerType == LJWifiPocketPrinter) {
    // WiFi printer
}
```

### Q4: Provisioning succeeded but query still shows not connected?

- Wait briefly after `LJWiFiStatusSuccess` before calling `getWifiConnectStatusComplete:`  
- Also use `addWifiStatus:` for device-reported updates  

### Q5: Swift method names differ?

| Objective-C | Swift (common) |
|-------------|----------------|
| `printImages:copies:callback:` | `print(_:copies:callback:)` |
| `getPrinterInfo:` | `getInfo(_:)` |
| `synchronizeToPrinterCompelete:` | `synchronize(completionHandler:)` |
| `printFoldImages:copies:callback:` | `printFold(_:copies:callback:)` |

Refer to Xcode autocomplete for authoritative names.

### Q6: What is LJWiFiDeviceInfoModel?

Header `LJWiFiDeviceInfoModel.h` defines raw WiFi device info fields (`DSN`, `HWV`, `SWV`, etc.) for advanced `infoCallback` packet parsing. For typical apps, use **`LuckPrinterInfo`** from `getWifiPrinterDeviceInfoComplete:`.

---

## Appendix: Public Header Files

| Header | Description |
|--------|-------------|
| `LuckBleSDK.h` | SDK main entry |
| `JKBleManager.h` | Bluetooth manager |
| `LJWiFiConfig.h` | WiFi global config singleton |
| `LJWiFiPrinter.h` | WiFi printer instance APIs |
| `LJ_AI50.h` | AI50 model |
| `LuckPrinter.h` | Printer base class |
| `LuckPrinterInfo.h` | Device info / enums |
| `LuckTool.h` | Image utilities |
| `LuckPrintConfig.h` | General print config |
| `LJError.h` | Error codes |
| `LJWiFiDeviceInfoModel.h` | Raw WiFi device info model (advanced) |

---

*Document version: 1.0 | Based on LuckBleSDK public headers*
