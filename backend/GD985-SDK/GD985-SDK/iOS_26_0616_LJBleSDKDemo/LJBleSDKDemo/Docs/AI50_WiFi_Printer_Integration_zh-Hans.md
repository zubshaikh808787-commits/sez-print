# AI50 WiFi 打印机 iOS 接入文档

> 基于 **LuckBleSDK** 公开头文件整理。本文仅描述对外暴露的 API 与推荐接入流程，不包含 SDK 内部实现细节。  
> SDK 源码路径：`/Users/apple/Desktop/BleSDK/LuckBleSDK`

---

## 目录

1. [概述](#1-概述)
2. [架构说明](#2-架构说明)
3. [环境要求与集成](#3-环境要求与集成)
4. [SDK 初始化](#4-sdk-初始化)
5. [蓝牙连接流程](#5-蓝牙连接流程)
6. [WiFi 配网与管理](#6-wifi-配网与管理)
7. [设备信息与状态查询](#7-设备信息与状态查询)
8. [打印能力](#8-打印能力)
9. [固件升级 OTA](#9-固件升级-ota)
10. [通知与回调](#10-通知与回调)
11. [错误码](#11-错误码)
12. [数据类型与枚举](#12-数据类型与枚举)
13. [完整 API 参考](#13-完整-api-参考)
14. [推荐接入时序](#14-推荐接入时序)
15. [常见问题](#15-常见问题)

---

## 1. 概述

AI50 是一款 **WiFi 口袋打印机**，在 LuckBleSDK 中通过 **蓝牙 BLE** 与 App 通信，完成：

- WiFi 配网（SSID / 密码下发）
- 设备信息、状态、电量等查询
- 浓度、音量、关机等设置
- 图片打印
- 固件 OTA 升级

SDK 中的类型关系：

```
LuckPrinterInfo
    └── LuckPrinter
            └── LJWiFiPrinter    ← WiFi 打印机基类（公开头文件）
                    └── LJ_AI50  ← AI50 机型（公开头文件，无额外方法）
```

除 `LJWiFiPrinter` / `LJ_AI50` 专有接口外，AI50 还继承 `LuckPrinter` 的通用打印、OTA、状态查询等能力。

---

## 2. 架构说明

| 层级 | 类名 | 职责 |
|------|------|------|
| 连接管理 | `JKBleManager` | 扫描、连接、断开蓝牙；持有当前 `printer` 实例 |
| WiFi 全局配置 | `LJWiFiConfig` | 单例；配网、状态监听、部分设备设置（不依赖强转实例） |
| WiFi 打印机实例 | `LJWiFiPrinter` / `LJ_AI50` | 连接后通过 `JKBleManager.printer` 获取；完整 WiFi 能力 |
| 打印机基类 | `LuckPrinter` | 打印、OTA、通用状态/信息接口 |
| 设备信息模型 | `LuckPrinterInfo` | 型号、SN、电量、WiFi SSID、音量等属性 |
| 图片工具 | `LuckTool` | 缩放、抖动、二值化等图片预处理（可选） |

**重要说明：**

1. AI50 的控制通道是 **蓝牙**，WiFi 主要用于打印机接入局域网；配网完成后仍通过 BLE 发送打印与控制指令（由 SDK 封装）。
2. 设备蓝牙广播名通常以 **`AI50_`** 为前缀（Demo 中的过滤规则；具体以 `LuckPrinterInfo.filterPrefixList` 为准）。
3. 连接成功后，`LuckPrinter.printerType` 为 **`LJWifiPocketPrinter`（值为 8）** 时可判定为 WiFi 口袋打印机。

---

## 3. 环境要求与集成

### 3.1 系统要求

- iOS 13.0+（建议 iOS 15+）
- Xcode 15+
- 真机调试（蓝牙相关功能需真机；SDK 框架可能不含 Simulator 架构）

### 3.2 依赖框架

集成 LuckBleSDK 时，通常还需要：

- `LuckBleSDK.framework`
- `ImageDataProcesser.xcframework`（SDK 依赖）
- 系统框架：`CoreBluetooth`、`UIKit`

### 3.3 导入头文件

**Objective-C**

```objc
#import <LuckBleSDK/LuckBleSDK.h>
// WiFi 打印机实例 API（需额外导入）
#import <LuckBleSDK/LJWiFiPrinter.h>
#import <LuckBleSDK/LJ_AI50.h>
```

> 说明：`LuckBleSDK.h` 已包含 `JKBleManager`、`LuckPrinter`、`LJWiFiConfig` 等；`LJWiFiPrinter.h` 需单独导入。

**Swift**

```swift
import LuckBleSDK
// 若使用 LJWiFiPrinter 专有方法，需在 Bridging Header 中导入 LJWiFiPrinter.h
```

### 3.4 Info.plist 权限

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>需要蓝牙权限以连接 AI50 WiFi 打印机</string>
```

如需从相册选图打印，还需相册权限：

```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>需要访问相册以选择打印图片</string>
```

---

## 4. SDK 初始化

### 4.1 设置 AppKey

`JKBleManager` 提供两个 Key 属性，**错误的 Key 将导致无法连接设备**：

| 属性 | 说明 |
|------|------|
| `asKey` | 国内版 AppKey |
| `abroadAsKey` | 海外版 AppKey |

**Objective-C**

```objc
JKBleManager *manager = [JKBleManager sharedInstance];
manager.abroadAsKey = @"your_app_key_here";  // 或 manager.asKey
manager.isConnectLast = NO;  // 是否自动连接上次设备，按需设置
```

**Swift**

```swift
let manager = JKBleManager.sharedInstance()
manager.abroadAsKey = "your_app_key_here"
manager.isConnectLast = false
```

### 4.2 建议的应用启动配置

1. 设置 AppKey  
2. 注册蓝牙连接/断开通知（见 [§10](#10-通知与回调)）  
3. 监听 `kLuckPrinterCanSendTaskNoticeName`，**收到后再发送业务指令**  

---

## 5. 蓝牙连接流程

### 5.1 扫描设备

```objc
[[JKBleManager sharedInstance] scanPrinters];
```

```swift
JKBleManager.sharedInstance().scanPrinters()
```

停止扫描：

```objc
[[JKBleManager sharedInstance] stopScanPrinters];
```

发现设备通知：`kBleDidPeripheralFoundNoticeName`  
`object` 字典中包含 `peripheral`（`CBPeripheral`）。

### 5.2 连接设备

```objc
[[JKBleManager sharedInstance] connect:peripheral timeout:8];
```

```swift
JKBleManager.sharedInstance().connect(peripheral, timeout: 8)
```

| 通知名 | 含义 |
|--------|------|
| `kBleDidConnectPeripheralNoticeName` | 连接成功 |
| `kBleDidFailToConnectPeripheralNoticeName` | 连接失败 |
| `kBleDidDisconnectPeripheralNoticeName` | 已断开 |
| `kBleDidChangeStateNoticeName` | 系统蓝牙状态变化 |

### 5.3 获取当前打印机实例

连接成功后：

```objc
LuckPrinter *printer = [JKBleManager sharedInstance].printer;
LJWiFiPrinter *wifiPrinter = (LJWiFiPrinter *)printer;  // 或判断 printerType
```

```swift
guard let printer = JKBleManager.sharedInstance().printer as? LJWiFiPrinter else { return }
```

### 5.4 断开连接

```objc
[[JKBleManager sharedInstance] disconnect:peripheral];
```

### 5.5 其他连接辅助 API（JKBleManager）

| 方法 | 说明 |
|------|------|
| `+ sharedInstance` | 单例 |
| `printer` | 当前连接的打印机实例 |
| `bleState` | 系统蓝牙状态（`CBManagerState`） |
| `lastConnectPrinterName` | 上次连接设备名称 |
| `getLastConnectPrinterInfo` | 上次连接设备信息字典 |
| `getSystemConnectPrinter` | 系统已连接的外设列表 |
| `autoConnectToLastPrinterIfHas` | 自动连接上次设备 |
| `connectPrinterwhichNameIs:` | 按名称连接（扫码场景） |
| `cancelConnectFromName` | 取消按名称连接 |

---

## 6. WiFi 配网与管理

WiFi 相关能力可通过 **`LJWiFiConfig` 单例** 或 **`LJWiFiPrinter` 实例** 调用。两者均已在头文件中暴露，功能大部分重叠；**已连接设备后推荐使用实例方法**，全局监听可使用 `LJWiFiConfig`。

### 6.1 WiFi 配网

向打印机下发 SSID 与密码：

**LJWiFiConfig**

```objc
[[LJWiFiConfig sharedInstance] wifiConfigSSID:@"YourWiFi"
                                        pwd:@"YourPassword"
                                   complete:^(LJWiFiStatus status, NSError *error) {
    // 处理配网结果
}];
```

**LJWiFiPrinter**

```objc
[wifiPrinter wifiConfigSSID:@"YourWiFi"
                        pwd:@"YourPassword"
                   complete:^(LJWiFiStatus status, NSError *error) {
    // 处理配网结果
}];
```

**Swift 示例**

```swift
LJWiFiConfig.sharedInstance().wifiConfigSSID("YourWiFi", pwd: "YourPassword") { status, error in
    // ...
}

wifiPrinter.wifiConfigSSID("YourWiFi", pwd: "YourPassword") { status, error in
    // ...
}
```

### 6.2 监听 WiFi 状态（设备主动上报）

**LJWiFiConfig**（带 error 回调）：

```objc
[[LJWiFiConfig sharedInstance] addWifiStatus:^(LJWiFiStatus status, NSError *error) {
    // 6000 连接中 / 6001 成功 / 6002 密码错误 / 6003 断开 / 6009 未知
}];
```

**LJWiFiPrinter**（仅 status）：

```objc
[wifiPrinter addWifiStatus:^(LJWiFiStatus status) {
    // ...
}];
```

也可设置属性回调：

```objc
wifiPrinter.connectStatusCallback = ^(LJWiFiStatus status) { /* 配网回调，非连接中时会置空 */ };
wifiPrinter.statusCallback = ^(LJWiFiStatus status) { /* 状态监听 */ };
```

### 6.3 查询 WiFi 连接状态（App 主动查询）

```objc
[wifiPrinter getWifiConnectStatusComplete:^(LJWiFiQueryStatus status, NSError *error) {
    // 0 未连接 / 1 连接中 / 2 已连接
}];
```

`LJWiFiConfig` 提供同名方法 `getWifiConnectStatusComplete:`。

### 6.4 扫描周围 WiFi 信号

> **仅 `LJWiFiPrinter` 暴露**，`LJWiFiConfig` 中对应方法在头文件内已注释，不可用。

```objc
[wifiPrinter getWifiPrinterAroundSignal:10
                               complete:^(NSArray<NSString *> *wifiList, NSError *error) {
    // wifiList：周围 WiFi 名称列表
}];
```

参数 `count`：期望返回的热点数量。

### 6.5 恢复出厂 / 重置设备

```objc
[wifiPrinter wifiResetDevice];
// 或
[[LJWiFiConfig sharedInstance] wifiResetDevice];
```

无回调；重置后设备 WiFi 等配置恢复默认。

---

## 7. 设备信息与状态查询

### 7.1 获取完整设备信息

**LJWiFiConfig / LJWiFiPrinter**

```objc
[wifiPrinter getWifiPrinterDeviceInfoComplete:^(LuckPrinterInfo *info, NSError *error) {
    NSLog(@"版本: %@, SN: %@, 型号: %@, 电量: %lu",
          info.version, info.sn, info.model, (unsigned long)info.power);
    NSLog(@"SSID: %@, 音量: %ld/%ld", info.ssid, (long)info.volume, (long)info.maxVolume);
}];
```

返回类型为 `LuckPrinterInfo *`，包含 WiFi 打印机扩展字段：

| 属性 | 说明 |
|------|------|
| `ssid` | 当前连接的 WiFi 名称 |
| `volume` | 当前音量 |
| `maxVolume` | 最大音量 |
| `wifiStatus` | WiFi 状态码 |

**分包回调（LJWiFiPrinter 专有）**

若设备信息分包返回，可使用：

```objc
wifiPrinter.infoCallback = ^(NSObject *info, BOOL isFinish) {
    // isFinish == YES 表示全部接收完毕
};
wifiPrinter.packetCache; // NSMutableDictionary，缓存各分包数据
```

### 7.2 单项查询 API（LJWiFiPrinter）

| 方法 | 说明 | 回调参数 |
|------|------|----------|
| `getWifiPrinterModelComplete:` | 查询型号 | `NSString *model` |
| `getWifiPrinterSNComplete:` | 查询 SN | `NSString *sn` |
| `getWifiPrinterVersionComplete:` | 查询固件版本 | `NSString *version` |
| `getWifiPrinterStatua:` | 查询打印机状态 | `LPPrinterState status` |
| `getWifiPrinterPower:` | 查询电量 | `NSInteger power`（0–100） |
| `getWifiPrinterDensity:` | 查询浓度 | `NSInteger density` |
| `getWifiPrinterCloseTime:` | 查询自动关机时间 | `NSInteger time`（分钟） |
| `getWifiPrinterVolumeComplete:` | 查询音量 | `max`, `current` |
| `getWifiPrinterModeComplete:` | 查询 Boot/模式 | `NSInteger model` |
| `getWifiPrinterPaperType:` | 查询纸张类型 | `LPPaperType type` |

**LJWiFiConfig** 另提供：`getWifiPrinterModelComplete:`、`getWifiPrinterDeviceInfoComplete:`、`getWifiPrinterVolumeComplete:`、`setWifiPrinterCloseTime:complete:` 等（见 [§13.3](#133-ljwificonfig)）。

### 7.3 打印机状态位（LPPrinterState）

`LPPrinterState` 为位掩码（`NS_OPTIONS`），可组合判断：

| 枚举值 | 含义 |
|--------|------|
| `LPPrinterStatePrinting` | 打印中 |
| `LPPrinterStateOpenCover` | 开盖 |
| `LPPrinterStateOutPaper` | 缺纸 |
| `LPPrinterStatePower` | 低电量 |
| `LPPrinterStateHot` | 过热 |
| `LPPrinterStateCharging` | 充电中 |
| `LPPrinterStateMotorHot` | 电机过热 |
| `LPPrinterStateBusy` | 繁忙 |
| `LPPrinterStateNoFoundLabel` | 未找到标签纸 |
| `LPPrinterStateNone` | 正常 |

**Objective-C 判断示例**

```objc
if (status & LPPrinterStateOutPaper) {
    // 缺纸
}
```

### 7.4 继承自 LuckPrinter 的通用查询

| 方法 | 说明 |
|------|------|
| `getState:` | 获取打印机状态 |
| `getPrinterInfo:` | 获取打印机信息（Swift 中可能映射为 `getInfo`） |
| `getPowerCompelete:` | 获取电量 |

---

## 8. 打印能力

### 8.1 打印前准备

1. 确认蓝牙已连接，且收到 `kLuckPrinterCanSendTaskNoticeName`  
2. 设置纸张类型（如需要）：`setWifiPrinterPaperType:complete:` 或属性 `paperType`  
3. 对图片进行缩放 / 抖动 / 二值化预处理（推荐使用 `LuckTool` 或 `LuckPrinter` 的 `ddPreviewImage:` / `ezPreviewImage:`）  
4. 设置打印份数  

### 8.2 设置打印份数

**LJWiFiPrinter 专有**

```objc
[wifiPrinter setWifiPrinterCopies:2 complete:^(NSError *error) {
    // ...
}];
```

### 8.3 打印方式一：LuckPrinter 通用打印（推荐）

继承自 `LuckPrinter`，会先查询状态再打印：

```objc
// 卷纸打印
[wifiPrinter printImages:@[processedImage]
                  copies:1
                callback:^(NSError *error) {
    if (!error) { /* 成功 */ }
}];
```

**Swift**

```swift
wifiPrinter.print([processedImage], copies: 1) { error in
    // ...
}
```

其他继承方法：

| 方法 | 说明 |
|------|------|
| `printLabelImages:copies:callback:` | 标签纸打印 |
| `printTattooImages:copies:callback:` | 纹身纸打印 |
| `printFoldImages:copies:callback:` | 折叠纸打印 |
| `printGrayImages:copies:callback:` | 灰度卷纸打印 |
| `printGrayLabelImages:copies:callback:` | 灰度标签打印 |
| `printRollImages:copies:callback:` | 卷纸打印 |
| `normalPrintImages:config:callback:` | 通用可配置打印（`LuckPrintConfig`） |

**LuckPrintConfig 属性**

| 属性 | 说明 |
|------|------|
| `density` | 浓度，0 表示默认 |
| `copies` | 份数 |
| `printType` | `LJPrintTypeNormal/Label/Tattoo/Fold/SheetLabel` |
| `isGrayPrint` | 是否灰度打印 |

### 8.4 打印方式二：LJWiFiPrinter 专用发送

```objc
[wifiPrinter printerSendImage:processedImage
                     complete:^(BOOL isSuccsess) {
    // ...
}];

// 灰度打印
[wifiPrinter printerSendGrayImage:processedImage
                        grayLevel:16
                         complete:^(BOOL isSuccsess) {
    // ...
}];
```

> 使用此方式前通常需先调用 `setWifiPrinterCopies:complete:` 设置份数。

### 8.5 图片预处理工具（LuckTool）

| 方法 | 说明 |
|------|------|
| `+ scallImage:toWidth:` | 按宽度缩放 |
| `+ scallImage:maxHeight:maxWidth:` | 限定最大宽高缩放 |
| `+ dither:` | 抖动处理 |
| `+ erzhi:` | 二值化 |
| `+ gray:` | 灰度 |
| `+ getBitmapByteArrayGrayFromImage:mode:perByte:` | 灰度打印字节数据 |

**LuckPrinter 图片预览处理**

| 方法 | 说明 |
|------|------|
| `normalPreviewImage:` | 缩放到打印机可用尺寸 |
| `ezPreviewImage:` | 缩放 + 二值化 |
| `ddPreviewImage:` | 缩放 + 抖动 |

打印前建议设置：

```objc
wifiPrinter.paperType = LPPaperTypeJZ;  // 卷纸
wifiPrinter.isLabel = NO;
```

---

## 9. 固件升级 OTA

继承自 `LuckPrinter`：

```objc
NSData *fwData = [NSData dataWithContentsOfFile:firmwarePath];

[wifiPrinter updateVersion:fwData
                 onProcess:^(CGFloat progress) {
    // progress：0.0 ~ 1.0
} callback:^(NSError *error) {
    if (!error) { /* 升级成功 */ }
}];
```

| 方法 | 说明 |
|------|------|
| `updateVersion:callback:` | OTA（无进度） |
| `updateVersion:onProcess:callback:` | OTA（带进度） |
| `safeUpdateVersion:callback:` | 安全 OTA |

**OTA 相关属性**

| 属性 | 说明 |
|------|------|
| `otaSate` | OTA 状态（`LJOTASate`） |
| `otaProcessBlcok` | 进度回调块 |

**固件文件格式**：通常为 `.bin` 或 `.prtu`（以设备要求为准）。

**OTA 错误码**（`LJOTAError`）：见 [§11.2](#112-ota-错误码-ljotaerror)。

---

## 10. 通知与回调

### 10.1 蓝牙通知（JKBleManager.h）

| 宏定义 | 说明 |
|--------|------|
| `kBleDidConnectPeripheralNoticeName` | 蓝牙连接成功 |
| `kBleDidDisconnectPeripheralNoticeName` | 蓝牙断开 |
| `kBleDidFailToConnectPeripheralNoticeName` | 连接失败 |
| `kBleDidChangeStateNoticeName` | 蓝牙开关/权限状态变化 |
| `kBleDidPeripheralFoundNoticeName` | 发现新设备 |

### 10.2 打印机通知（LuckPrinter.h）

| 宏定义 | 说明 |
|--------|------|
| `kLuckPrinterCanSendTaskNoticeName` | **可以发送指令**（重要） |
| `kLuckPrinterDidNotSupportNoticeName` | 设备不支持 |
| `kLuckPrinterPaperCantLocationName` | 纸张无法定位 |
| `kLuckPrinterGetModelName` | 获取到型号 |

### 10.3 推荐监听示例（Swift）

```swift
NotificationCenter.default.addObserver(
    forName: NSNotification.Name("kLuckPrinterCanSendTaskNoticeName"),
    object: nil,
    queue: .main
) { _ in
    // 此时可以安全调用打印、查询、配网等 API
}
```

---

## 11. 错误码

### 11.1 通用错误（LJErrorType）

| 值 | 枚举 | 说明 |
|----|------|------|
| 70000 | `LJError_Task_Doing` | 任务执行中 |
| 70001 | `LJError_Task_Timeout` | 请求超时 |
| 70002 | `LJError_Printer_Noconnected` | 打印机未连接 |
| 70003 | `LJError_WifiConfigFail` | WiFi 配网失败 |
| -1 | `LJError_Unknown` | 未知错误 |

### 11.2 OTA 错误码（LJOTAError）

| 值 | 枚举 | 说明 |
|----|------|------|
| 90001 | `LJOTA_SIZE_ERROR` | 文件大小错误 |
| 90002 | `LJOTA_FILE_MD5_ERROR` | MD5 错误 |
| 90003 | `LJOTA_SAME_MD5_ERROR` | 固件相同 |
| 90004 | `LJOTA_PROTOCOL_PARSE_ERROR` | 协议解析错误 |
| 90005 | `LJOTA_FAIL_ERROR` | 升级失败 |
| 90006 | `LJOTA_TIMEOUT_ERROR` | 超时 |
| 90007 | `LJOTA_SIGNATURE_ERROR` | 签名错误 |
| 90008 | `LJOTA_NONSUPPORT_SAFEUPDATE_ERROR` | 不支持安全更新 |

---

## 12. 数据类型与枚举

### 12.1 WiFi 配网状态（LJWiFiStatus）

| 值 | 枚举 | 说明 |
|----|------|------|
| 6000 | `LJWiFiStatusConnecting` | WiFi 连接中 |
| 6001 | `LJWiFiStatusSuccess` | 连接成功 |
| 6002 | `LJWiFiStatusPWDError` | 密码错误 |
| 6003 | `LJWiFiStatusDisconnect` | 已断开 |
| 6009 | `LJWiFiStatusNone` | 未知 |

### 12.2 WiFi 查询状态（LJWiFiQueryStatus）

| 值 | 枚举 | 说明 |
|----|------|------|
| 0 | `LJWiFiQueryStatusNone` | 未连接 |
| 1 | `LJWiFiQueryStatusConnecting` | 连接中 |
| 2 | `LJWiFiQueryStatusConnected` | 已连接 |

### 12.3 打印机类型（LJPrinterType）

AI50 对应：

| 值 | 枚举 | 说明 |
|----|------|------|
| 8 | `LJWifiPocketPrinter` | WiFi 口袋打印机 |

### 12.4 纸张类型（LPPaperType）

| 值 | 枚举 | 说明 |
|----|------|------|
| 0x10 | `LPPaperTypeJZ` | 卷纸 |
| 0x20 | `LPPaperTypeBQ` | 标签纸 |
| 0x30 | `LPPaperTypeZD` | 折叠纸 |
| 0x40 | `LPPaperTypeWS` | 纹身纸 |
| 0x50 | `LPPaperTypeHBBQ` | 黑标标签 |
| 0x21 | `LPPaperTypeCircleLabel` | 圆形标签 |
| 0x60 | `LPPaperTypeWZY` | 水转印纸 |

---

## 13. 完整 API 参考

以下仅列出 **AI50 WiFi 相关公开头文件** 中的接口。

### 13.1 JKBleManager

| 类型 | 名称 | 说明 |
|------|------|------|
| 属性 | `printer` | 当前 `LuckPrinter *` |
| 属性 | `bleState` | 蓝牙状态 |
| 属性 | `asKey` / `abroadAsKey` | AppKey |
| 属性 | `isConnectLast` | 是否自动连接上次设备 |
| 方法 | `+ sharedInstance` | 单例 |
| 方法 | `scanPrinters` | 开始扫描 |
| 方法 | `stopScanPrinters` | 停止扫描 |
| 方法 | `connect:timeout:` | 连接外设 |
| 方法 | `disconnect:` | 断开外设 |
| 方法 | `connectPrinterwhichNameIs:` | 按名称连接 |
| 方法 | `autoConnectToLastPrinterIfHas` | 自动连接 |
| 方法 | `lastConnectPrinterName` | 上次设备名 |
| 方法 | `getLastConnectPrinterInfo` | 上次设备信息 |
| 方法 | `getSystemConnectPrinter` | 系统已连接外设 |
| 方法 | `cancelConnectFromName` | 取消连接 |

### 13.2 LJWiFiPrinter

| 类型 | 名称 | 说明 |
|------|------|------|
| 属性 | `connectStatusCallback` | 配网状态回调 |
| 属性 | `statusCallback` | WiFi 状态监听 |
| 属性 | `infoCallback` | 分包设备信息回调 |
| 属性 | `packetCache` | 分包缓存字典 |
| 方法 | `wifiConfigSSID:pwd:complete:` | WiFi 配网 |
| 方法 | `wifiResetDevice` | 恢复出厂 |
| 方法 | `getWifiConnectStatusComplete:` | 查询 WiFi 状态 |
| 方法 | `addWifiStatus:` | 监听 WiFi 状态 |
| 方法 | `getWifiPrinterAroundSignal:complete:` | 扫描周围 WiFi |
| 方法 | `getWifiPrinterDeviceInfoComplete:` | 获取设备信息 |
| 方法 | `getWifiPrinterStatua:` | 获取打印机状态 |
| 方法 | `getWifiPrinterPower:` | 获取电量 |
| 方法 | `getWifiPrinterDensity:` | 获取浓度 |
| 方法 | `setWifiPrinterDensity:complete:` | 设置浓度 |
| 方法 | `getWifiPrinterPaperType:` | 获取纸张类型 |
| 方法 | `setWifiPrinterPaperType:complete:` | 设置纸张类型 |
| 方法 | `getWifiPrinterCloseTime:` | 获取关机时间 |
| 方法 | `setWifiPrinterCloseTime:complete:` | 设置关机时间 |
| 方法 | `getWifiPrinterVolumeComplete:` | 获取音量 |
| 方法 | `setWifiPrinterVolume:Complete:` | 设置音量 |
| 方法 | `getWifiPrinterModeComplete:` | 获取 Boot 模式 |
| 方法 | `setWifiPrinterMode:Complete:` | 设置 Boot 模式 |
| 方法 | `getWifiPrinterModelComplete:` | 获取型号 |
| 方法 | `getWifiPrinterSNComplete:` | 获取 SN |
| 方法 | `getWifiPrinterVersionComplete:` | 获取版本 |
| 方法 | `setWifiPrinterLanguage:Complete:` | 设置语言 |
| 方法 | `setWifiPrinterCopies:complete:` | 设置打印份数 |
| 方法 | `printerSendImage:complete:` | 发送图片打印 |
| 方法 | `printerSendGrayImage:grayLevel:complete:` | 灰度打印 |

### 13.3 LJWiFiConfig

| 方法 | 说明 |
|------|------|
| `+ sharedInstance` | 单例 |
| `wifiConfigSSID:pwd:complete:` | WiFi 配网 |
| `wifiResetDevice` | 恢复出厂 |
| `getWifiConnectStatusComplete:` | 查询 WiFi 状态 |
| `addWifiStatus:` | 监听 WiFi 状态 |
| `getWifiPrinterDeviceInfoComplete:` | 获取设备信息 |
| `setWifiPrinterCloseTime:complete:` | 设置关机时间 |
| `getWifiPrinterVolumeComplete:` | 获取音量 |
| `setWifiPrinterVolume:Complete:` | 设置音量 |
| `getWifiPrinterModelComplete:` | 获取型号 |
| `setWifiPrinterModel:Complete:` | 设置型号 |
| `setWifiPrinterLanguage:Complete:` | 设置语言 |

> `getWifiPrinterAroundSignal:complete:` 在 `LJWiFiConfig.h` 中已注释，**不可用**。

### 13.4 LJ_AI50

```objc
@interface LJ_AI50 : LJWiFiPrinter
@end
```

无额外公开方法；连接 AI50 设备后实例实际类型为 `LJ_AI50` 或 `LJWiFiPrinter`。

### 13.5 LuckPrinter（AI50 可用的继承 API）

| 方法 | 说明 |
|------|------|
| `printImages:copies:callback:` | 卷纸打印 |
| `printLabelImages:copies:callback:` | 标签打印 |
| `printTattooImages:copies:callback:` | 纹身打印 |
| `printFoldImages:copies:callback:` | 折叠纸打印 |
| `printGrayImages:copies:callback:` | 灰度打印 |
| `normalPrintImages:config:callback:` | 通用打印 |
| `updateVersion:callback:` | OTA |
| `updateVersion:onProcess:callback:` | OTA（带进度） |
| `safeUpdateVersion:callback:` | 安全 OTA |
| `getState:` | 获取状态 |
| `getPrinterInfo:` | 获取信息 |
| `getPowerCompelete:` | 获取电量 |
| `synchronizeToPrinterCompelete:` | 同步属性到设备 |
| `normalPreviewImage:` / `ezPreviewImage:` / `ddPreviewImage:` | 图片预处理 |
| `pausePrint` / `resumePrint` | 暂停 / 继续打印 |
| `clearPrintTask` | 取消打印任务 |

---

## 14. 推荐接入时序

```
App 启动
  │
  ├─ 1. 设置 JKBleManager.asKey / abroadAsKey
  ├─ 2. 注册蓝牙 & kLuckPrinterCanSendTaskNoticeName 通知
  │
  ▼
扫描 AI50 设备（scanPrinters）
  │
  ├─ 监听 kBleDidPeripheralFoundNoticeName，过滤 AI50_ 前缀
  │
  ▼
用户选择设备 → connect:timeout:
  │
  ├─ kBleDidConnectPeripheralNoticeName
  ├─ 等待 kLuckPrinterCanSendTaskNoticeName  ← 必须
  │
  ▼
（可选）WiFi 配网 wifiConfigSSID:pwd:complete:
  │
  ├─ addWifiStatus: 监听配网结果
  │
  ▼
查询设备信息 / 状态 / 电量
  │
  ▼
图片预处理 → printImages:copies:callback: 或 printerSendImage:complete:
  │
  ▼
（可选）updateVersion:onProcess:callback: 固件升级
  │
  ▼
disconnect: 或用户退出
```

---

## 15. 常见问题

### Q1：扫描不到 AI50 设备？

- 确认 AppKey 正确  
- 确认 Info.plist 已声明蓝牙权限  
- 确认手机蓝牙已开启  
- 设备名称是否以 `AI50_` 开头（或查看 `LuckPrinterInfo.filterPrefixList`）  
- 真机调试，非模拟器  

### Q2：连接成功但发指令无响应？

- 必须等待 **`kLuckPrinterCanSendTaskNoticeName`** 后再调用业务 API  
- 确认 `JKBleManager.printer` 非空  

### Q3：如何判断当前设备是 AI50 WiFi 打印机？

```objc
LuckPrinter *p = [JKBleManager sharedInstance].printer;
if ([p isKindOfClass:[LJWiFiPrinter class]] || p.printerType == LJWifiPocketPrinter) {
    // WiFi 打印机
}
```

### Q4：配网成功但查询状态仍为未连接？

- 配网成功（`LJWiFiStatusSuccess`）后稍等片刻再调用 `getWifiConnectStatusComplete:`  
- 同时监听 `addWifiStatus:` 获取设备主动上报  

### Q5：Swift 中部分方法名不同？

Objective-C 方法导入 Swift 后可能被重命名，例如：

| Objective-C | Swift（常见） |
|-------------|-------------|
| `printImages:copies:callback:` | `print(_:copies:callback:)` |
| `getPrinterInfo:` | `getInfo(_:)` |
| `synchronizeToPrinterCompelete:` | `synchronize(completionHandler:)` |
| `printFoldImages:copies:callback:` | `printFold(_:copies:callback:)` |

以 Xcode 代码补全为准。

### Q6：LJWiFiDeviceInfoModel 是什么？

头文件 `LJWiFiDeviceInfoModel.h` 定义了 WiFi 设备信息原始字段模型（如 `DSN`、`HWV`、`SWV` 等），主要用于分包回调 `infoCallback` 的解析场景。常规业务推荐使用 `getWifiPrinterDeviceInfoComplete:` 返回的 **`LuckPrinterInfo`**。

---

## 附录：相关头文件清单

| 头文件 | 说明 |
|--------|------|
| `LuckBleSDK.h` | SDK 主入口 |
| `JKBleManager.h` | 蓝牙管理 |
| `LJWiFiConfig.h` | WiFi 全局配置单例 |
| `LJWiFiPrinter.h` | WiFi 打印机实例 API |
| `LJ_AI50.h` | AI50 机型 |
| `LuckPrinter.h` | 打印机基类 |
| `LuckPrinterInfo.h` | 设备信息 / 枚举 |
| `LuckTool.h` | 图片工具 |
| `LuckPrintConfig.h` | 通用打印配置 |
| `LJError.h` | 错误码 |
| `LJWiFiDeviceInfoModel.h` | WiFi 设备原始信息模型（高级场景） |

---

*文档版本：1.0 | 基于 LuckBleSDK 公开头文件整理*
