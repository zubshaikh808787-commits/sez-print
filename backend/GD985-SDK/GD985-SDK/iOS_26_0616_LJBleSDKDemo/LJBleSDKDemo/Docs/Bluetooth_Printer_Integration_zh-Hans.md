# 蓝牙打印机 iOS 接入文档

> 基于 **LuckBleSDK** 公开头文件整理。本文仅描述对外暴露的 API 与推荐接入流程，不包含 SDK 内部实现细节。  
> SDK 源码路径：`/Users/apple/Desktop/BleSDK/LuckBleSDK`

---

## 目录

1. [概述](#1-概述)
2. [架构说明](#2-架构说明)
3. [环境要求与集成](#3-环境要求与集成)
4. [SDK 初始化](#4-sdk-初始化)
5. [蓝牙连接流程](#5-蓝牙连接流程)
6. [设备识别与在线配置](#6-设备识别与在线配置)
7. [设备信息与状态查询](#7-设备信息与状态查询)
8. [参数设置](#8-参数设置)
9. [打印能力](#9-打印能力)
10. [图片预处理](#10-图片预处理)
11. [走纸与任务控制](#11-走纸与任务控制)
12. [固件升级 OTA](#12-固件升级-ota)
13. [面单机（LuckPrinterMD）](#13-面单机luckprintermd)
14. [低级指令（LPSendTask）](#14-低级指令lpsendtask)
15. [通知与回调](#15-通知与回调)
16. [错误码](#16-错误码)
17. [数据类型与枚举](#17-数据类型与枚举)
18. [完整 API 参考](#18-完整-api-参考)
19. [推荐接入时序](#19-推荐接入时序)
20. [常见问题](#20-常见问题)

---

## 1. 概述

LuckBleSDK 通过 **蓝牙 BLE** 连接各类鹿匠及合作品牌的热敏/标签/A4/纹身等打印机，提供统一的：

- 设备扫描与连接
- 型号、SN、版本、电量、状态查询
- 浓度、速度、关机时间、纸张类型等设置
- 卷纸 / 标签 / 折叠纸 / 纹身纸等多种打印模式
- 固件 OTA 升级
- 在线设备配置（`LuckConfig`）

### 与 AI50 WiFi 打印机的区别

| 类型 | 典型蓝牙名 | 实例类型 | 文档 |
|------|-----------|----------|------|
| **蓝牙打印机**（本文） | 各品牌前缀，非 `AI50_` | `LuckPrinter` 及其子类 | 本文档 |
| **AI50 WiFi 打印机** | `AI50_` 前缀 | `LJWiFiPrinter` / `LJ_AI50` | 见 `AI50_WiFi_Printer_Integration_zh-Hans.md` |

连接成功后，若 `printerType == LJWifiPocketPrinter`（8）或实例为 `LJWiFiPrinter`，请使用 AI50 WiFi 专用文档。

### 类型关系（公开头文件）

```
LuckPrinterInfo          ← 设备属性（型号、SN、浓度、纸张等）
    └── LuckPrinter      ← 蓝牙打印机基类（打印、OTA、查询）
            └── LuckPrinterMD   ← 面单机扩展（公开头文件）
            └── LJWiFiPrinter   ← WiFi 打印机（见 AI50 文档，本文不展开）
```

SDK 会根据连接的外设自动创建对应机型实例，App 侧通常以 **`LuckPrinter *`** 使用即可。

---

## 2. 架构说明

| 组件 | 头文件 | 职责 |
|------|--------|------|
| `JKBleManager` | `JKBleManager.h` | BLE 扫描、连接、断开；持有 `printer` |
| `LuckPrinter` | `LuckPrinter.h` | 打印、OTA、状态/信息查询、任务发送 |
| `LuckPrinterInfo` | `LuckPrinterInfo.h` | 设备属性与纸张/标签尺寸 |
| `LuckPrinterFactory` | `LuckPrinterFactory.h` | 按外设创建打印机实例、拉取配置 |
| `LuckTool` | `LuckTool.h` | 图片缩放、抖动、二值化 |
| `UIImage (Luck)` | `UIImage+Luck.h` | 图片抖动/二值化分类方法 |
| `LuckPrintConfig` | `LuckPrintConfig.h` | 通用打印配置 |
| `LuckLabelSize` | `LuckLabelSize.h` | 标签/纸张尺寸 |
| `LPSendTask` | `LPSendTask.h` | 可组合的底层蓝牙指令任务 |
| `ConfigCommand` | `ConfigCommand.h` | 在线配置指令封装 |
| `LuckConfig` | `LuckConfig.h` | 在线设备配置管理 |
| `LuckConfigModel` | `LuckConfigModel.h` | 配置 JSON 模型 |
| `LuckPrinterMD` | `LuckPrinterMD.h` | 面单机专用接口 |
| `LJError` | `LJError.h` | 错误码定义 |

---

## 3. 环境要求与集成

### 3.1 系统要求

- iOS 13.0+（建议 iOS 15+）
- Xcode 15+
- **真机调试**（BLE 与部分 SDK 架构需真机）

### 3.2 依赖

- `LuckBleSDK.framework`
- `ImageDataProcesser.xcframework`
- 系统：`CoreBluetooth`、`UIKit`

### 3.3 导入

**Objective-C**

```objc
#import <LuckBleSDK/LuckBleSDK.h>
// 面单机可选
#import <LuckBleSDK/LuckPrinterMD.h>
```

**Swift**

```swift
import LuckBleSDK
// 面单机：Bridging Header 导入 LuckPrinterMD.h
```

`LuckBleSDK.h` 已聚合：`JKBleManager`、`LuckPrinter`、`LuckTool`、`LPSendTask`、`LuckConfig`、`LuckPrintConfig` 等。

### 3.4 Info.plist

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>需要蓝牙权限以连接打印机</string>
```

打印选图时建议增加相册权限说明。

---

## 4. SDK 初始化

### 4.1 AppKey（必须）

```objc
JKBleManager *mgr = [JKBleManager sharedInstance];
mgr.abroadAsKey = @"your_app_key";  // 海外
// mgr.asKey = @"your_app_key";     // 国内
mgr.isConnectLast = NO;             // 是否自动重连上次设备
```

错误的 AppKey 将导致 **无法连接设备**。

### 4.2 推荐启动流程

```objc
// 1. 设置 AppKey
// 2. 监听蓝牙连接/断开通知
// 3. 监听 kLuckPrinterCanSendTaskNoticeName（收到后再发业务指令）
// 4. 可选：加载 LuckConfig 在线配置
```

**Swift 示例**

```swift
func configLuckBleSDK() {
    JKBleManager.sharedInstance().abroadAsKey = "your_app_key"
    NotificationCenter.default.addObserver(
        forName: NSNotification.Name("kLuckPrinterCanSendTaskNoticeName"),
        object: nil, queue: .main
    ) { _ in
        // 可以查询、打印、设置参数
    }
}
```

---

## 5. 蓝牙连接流程

### 5.1 扫描

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

**发现设备通知**：`kBleDidPeripheralFoundNoticeName`  
`object` 为字典，含 key `peripheral`（`CBPeripheral *`）。

**过滤设备建议**：

- 排除 WiFi 机型前缀（如 Demo 中 `AI50_`）
- 或使用 `LuckPrinterInfo.filterPrefixList` 与 `LuckConfig.isContainDevice:` 判断是否在支持列表中

### 5.2 连接

```objc
[[JKBleManager sharedInstance] connect:peripheral timeout:8.0];
```

按名称连接（扫码场景）：

```objc
[[JKBleManager sharedInstance] connectPrinterwhichNameIs:@"DeviceName"];
```

### 5.3 获取打印机实例

连接成功且收到 `kLuckPrinterCanSendTaskNoticeName` 后：

```objc
LuckPrinter *printer = [JKBleManager sharedInstance].printer;
```

### 5.4 断开

```objc
[[JKBleManager sharedInstance] disconnect:peripheral];
```

### 5.5 JKBleManager 完整 API

| 类型 | 名称 | 说明 |
|------|------|------|
| 属性 | `printer` | 当前打印机 `LuckPrinter *`，未连接为 nil |
| 属性 | `bleState` | 系统蓝牙状态 `CBManagerState` |
| 属性 | `asKey` | 国内 AppKey |
| 属性 | `abroadAsKey` | 海外 AppKey |
| 属性 | `isConnectLast` | 是否自动连接上次设备 |
| 方法 | `+ sharedInstance` | 单例 |
| 方法 | `scanPrinters` | 开始扫描 |
| 方法 | `stopScanPrinters` | 停止扫描 |
| 方法 | `connect:timeout:` | 连接外设 |
| 方法 | `disconnect:` | 断开外设 |
| 方法 | `connectPrinterwhichNameIs:` | 按蓝牙名连接 |
| 方法 | `cancelConnectFromName` | 取消按名连接 |
| 方法 | `autoConnectToLastPrinterIfHas` | 自动连接上次设备 |
| 方法 | `lastConnectPrinterName` | 上次连接设备名 |
| 方法 | `getLastConnectPrinterInfo` | 上次连接信息字典 |
| 方法 | `getSystemConnectPrinter` | 系统已连接外设数组 |

### 5.6 蓝牙相关通知

| 宏 | 说明 |
|----|------|
| `kBleDidPeripheralFoundNoticeName` | 发现设备 |
| `kBleDidConnectPeripheralNoticeName` | 连接成功 |
| `kBleDidFailToConnectPeripheralNoticeName` | 连接失败 |
| `kBleDidDisconnectPeripheralNoticeName` | 已断开 |
| `kBleDidChangeStateNoticeName` | 系统蓝牙状态变化 |

---

## 6. 设备识别与在线配置

### 6.1 打印机类型（LJPrinterType）

连接后只读属性 `printer.printerType`：

| 值 | 枚举 | 说明 |
|----|------|------|
| 1 | `LJMiniPocketPrinter` | 2 寸迷你口袋机 |
| 2 | `LJA4Printer` | A4 机 |
| 3 | `LJMiniLabelPrinter` | 半寸迷你标签机 |
| 4 | `LJTattooPrinter` | 纹身机 |
| 5 | `LJLabelPrinter` | 标签机 |
| 6 | `LJSheetPrinter` | 面单机 |
| 7 | `LJDocumentTattooPrinter` | 文档纹身机 |
| 8 | `LJWifiPocketPrinter` | WiFi 口袋机（见 AI50 文档） |
| -1 | `LJUnknownPrinter` | 未知 |

只读布尔属性：`isA4Model`、`isMiniModel`、`isMDModel`、`isTattooModel`、`isLabelModel`、`isMiniLabel`。

`printerCategory`（NSInteger）：线上配置大类（1 迷你 / 2 A4 / 3 mini label / 4 纹身 / 5 标签 / 6 面单 / 7 文档纹身）。

### 6.2 蓝牙名前缀过滤

```objc
NSArray *prefixes = LuckPrinterInfo.filterPrefixList;
NSString *prefix = printer.prefix;
```

### 6.3 LuckPrinterFactory

| 方法 | 说明 |
|------|------|
| `+ printerWith:` | 根据 `CBPeripheral` 创建 `LuckPrinter` 实例 |
| `+ getPrinterConfigInfoWith:deviceType:complete:` | 获取设备在线配置 `LuckConfigModel` |
| `+ getPrinterInfoWith:deviceType:complete:` | 获取 model 与 sn 字符串 |

### 6.4 LuckConfig（在线配置）

单例 `[LuckConfig sharedInstance]`，用于从服务端下发 JSON 配置并缓存：

| API | 说明 |
|-----|------|
| `configs` | 所有设备配置列表 |
| `configData` | 当前设备配置 |
| `setDeviceConfigList:` | 设置并缓存配置列表 |
| `setDeviceConfigData:` | 设置并缓存单设备配置 |
| `+ isContainDevice:` | 判断蓝牙名是否在配置中 |
| `+ getCmd:sCmd:data:` | 构造指令 Data |
| `LuckJsonParse LuckModelArrayWithJson:` | JSON 转配置模型数组 |

`LuckConfigModel` 主要字段：`model`、`bluetoothList`、`property`（dpi、浓度/速度列表、支持纸张类型等）、`bootCommand`、`command`（自定义打印指令集）。

Boot 指令下发（`LuckPrinter`）：

```objc
[printer verifykDeviceMD5Command:bootCommandModel];
[printer setDeviceSettingCommand:settingCommandModel];
```

---

## 7. 设备信息与状态查询

> **前提**：已连接且收到 `kLuckPrinterCanSendTaskNoticeName`。

### 7.1 一次性获取全部信息

```objc
[printer getPrinterInfo:^(LuckPrinterInfo *info, NSError *error) {
    if (!error) {
        NSLog(@"model=%@ sn=%@ version=%@ power=%lu thick=%lu speed=%lu closeTime=%lu",
              info.model, info.sn, info.version,
              (unsigned long)info.power, (unsigned long)info.thick,
              (unsigned long)info.speed, (unsigned long)info.closeTime);
    }
}];
```

**Swift**：方法名通常为 `getInfo(_:)`。

### 7.2 单项查询

| 方法 | 说明 | 回调/返回值 |
|------|------|-------------|
| `getState:` | 打印机状态 | `LPPrinterState` |
| `getPowerCompelete:` | 电量 | `NSUInteger` 0–100 |
| `getPrinterInfo:` | 综合信息 | `LuckPrinterInfo *` |

也可直接读取 `printer` 上已缓存属性：`model`、`sn`、`version`、`mac`、`power`、`thick`、`speed`、`closeTime` 等（建议在 `getPrinterInfo` 回调后使用最新值）。

### 7.3 打印机状态（LPPrinterState）

位掩码，可组合：

| 枚举 | 含义 |
|------|------|
| `LPPrinterStatePrinting` | 打印中 |
| `LPPrinterStateOpenCover` | 开盖 |
| `LPPrinterStateOutPaper` | 缺纸 |
| `LPPrinterStatePower` | 低电量 |
| `LPPrinterStateHot` | 过热 |
| `LPPrinterStateCharging` | 充电中 |
| `LPPrinterStateMotorHot` | 电机过热 |
| `LPPrinterStateBusy` | 繁忙 |
| `LPPrinterStateNoFoundLabel` | 未找到标签 |
| `LPPrinterStateNone` | 正常 |

### 7.4 LuckPrinterInfo 常用只读/读写属性

| 属性 | 说明 |
|------|------|
| `name` / `model` / `sn` / `mac` / `version` | 基本信息 |
| `dpi` | 点密度（如 203） |
| `supportMaxWidth` | 最大纸宽（mm） |
| `supportWidthFormm` | 支持宽度文案列表 |
| `supportLabelSizes` | 支持的标签尺寸 |
| `densityList` / `speedList` | 配置支持的浓度/速度档位 |
| `maxDensity` / `maxSpeed` | 最大值 |
| `imageStretchRatio` | 打印前图片拉伸比，默认 1 |
| `isSupportGrayPrint` | 是否支持灰度打印 |
| `supportPrintGrayLevels` | 支持的灰度阶数 |
| `grayLevel` | 当前灰度阶数（默认 16） |
| `configurable` | 是否可配置 |
| `isConfig`（LuckPrinter） | 是否有线上配置 |

---

## 8. 参数设置

设置流程一般为：**修改 `LuckPrinter` 属性 → 调用同步方法下发到设备**。

### 8.1 可设置属性（LuckPrinterInfo）

| 属性 | 说明 | 典型值 |
|------|------|--------|
| `thick` | 打印浓度 | 参考 `densityList` |
| `closeTime` | 自动关机时间（分钟） | 10 / 20 / 30 |
| `speed` | 打印速度 | 参考 `speedList` |
| `paperType` | 纸张类型 | `LPPaperType` 枚举 |
| `isLabel` | 是否标签模式 | YES/NO |
| `labelSize` | 当前卷纸/宽度尺寸 | `LuckLabelSize *` |
| `sizeForLabelPrint` | 标签打印尺寸 | `LuckLabelSize *` |
| `walkLong` / `configWalkLong` | 走纸距离 | 见 [§11](#11-走纸与任务控制) |
| `grayLevel` | 灰度阶数 | 4 / 8 / 12 / 16 |
| `isPrinrGray` | 是否灰度打印 | BOOL |
| `heatLevel` | 加热补偿（部分机型） | NSInteger |

### 8.2 同步到打印机

```objc
printer.thick = 2;
printer.closeTime = 30;
printer.speed = 1;
printer.paperType = LPPaperTypeJZ;

[printer synchronizeToPrinterCompelete:^{
    // 同步完成
}];
```

**Swift**：`printer.synchronize { }`

### 8.3 纸张类型（LPPaperType）

| 值 | 枚举 | 说明 |
|----|------|------|
| 0x10 | `LPPaperTypeJZ` | 卷纸 |
| 0x20 | `LPPaperTypeBQ` | 标签纸 |
| 0x30 | `LPPaperTypeZD` | 折叠纸 |
| 0x40 | `LPPaperTypeWS` | 纹身纸 |
| 0x50 | `LPPaperTypeHBBQ` | 黑标标签 |
| 0x21 | `LPPaperTypeCircleLabel` | 圆形标签 |
| 0x60 | `LPPaperTypeWZY` | 水转印纸 |

### 8.4 标签尺寸（LuckLabelSize）

```objc
// 列出支持尺寸
NSArray *sizes = printer.supportLabelSizes;
for (LuckLabelSize *size in sizes) {
    NSLog(@"%@", size.labelTitle);  // 如 "50mm * 20mm"
}

// 标签打印前设置
printer.isLabel = YES;
printer.paperType = LPPaperTypeBQ;
printer.sizeForLabelPrint = sizes.firstObject;
```

静态工厂：`labelList12`、`labelList40`、`labelList50`、`labelList74`、`labelList100`、`labelList80`、`a4`、`a5`、`letter`、`legal` 等。

---

## 9. 打印能力

所有打印 API 均在 **`LuckPrinter.h`** 公开，调用前会自动查询打印机状态（方法注释说明「会先查询状态」）。

### 9.1 打印模式对照

| 业务场景 | 纸张设置 | 推荐 API |
|----------|----------|----------|
| 卷纸打印 | `paperType = JZ`, `isLabel = NO` | `printImages:copies:callback:` |
| 标签打印 | `paperType = BQ`, `isLabel = YES` | `printLabelImages:copies:callback:` |
| 折叠纸 / A4 折 | `paperType = ZD` | `printFoldImages:copies:callback:` |
| 纹身纸 | `paperType = WS` | `printTattooImages:copies:callback:` |
| 卷纸（别名） | `JZ` | `printRollImages:copies:callback:` |
| 灰度卷纸 | 设置 `grayLevel` | `printGrayImages:copies:callback:` |
| 灰度标签 | 标签模式 | `printGrayLabelImages:copies:callback:` |
| 通用可配置 | `LuckPrintConfig` | `normalPrintImages:config:callback:` |

### 9.2 卷纸打印示例

**Objective-C**

```objc
printer.paperType = LPPaperTypeJZ;
printer.isLabel = NO;

UIImage *processed = [printer ddPreviewImage:sourceImage];

[printer printImages:@[processed]
              copies:1
            callback:^(NSError *error) {
    if (!error) { /* 成功 */ }
}];
```

**Swift**

```swift
printer.paperType = .JZ
printer.isLabel = false
let processed = printer.ddPreviewImage(sourceImage)
printer.print([processed], copies: 1) { error in
    // ...
}
```

### 9.3 标签打印示例

```objc
printer.isLabel = YES;
printer.paperType = LPPaperTypeBQ;
printer.sizeForLabelPrint = printer.supportLabelSizes.firstObject;

UIImage *img = [printer ddPreviewImage:sourceImage];
[printer printLabelImages:@[img] copies:1 callback:^(NSError *error) { }];
```

### 9.4 折叠纸 / 纹身

```objc
printer.paperType = LPPaperTypeZD;
[printer printFoldImages:@[img] copies:1 callback:^(NSError *e) {}];

printer.paperType = LPPaperTypeWS;
[printer printTattooImages:@[img] copies:1 callback:^(NSError *e) {}];
```

### 9.5 通用打印（LuckPrintConfig）

```objc
LuckPrintConfig *config = [LuckPrintConfig new];
config.density = 2;           // 0 = 默认
config.copies = 1;
config.printType = LJPrintTypeNormal;  // Normal/Label/Tattoo/Fold/SheetLabel
config.isGrayPrint = NO;

[printer normalPrintImages:@[img] config:config callback:^(NSError *error, BOOL isFinish, NSUInteger printCount, NSUInteger printIndex) {
    // isFinish：是否全部打完；printCount/printIndex：进度
}];
```

### 9.6 打印控制

| 方法 | 说明 |
|------|------|
| `pausePrint` | 暂停打印 |
| `resumePrint` | 继续打印 |
| `clearPrintTask` | 取消所有打印任务 |
| `stopCurrentTask` | 停止当前任务 |
| `isHaveTask` | 是否有执行中任务 |

### 9.7 在线自定义指令打印

若设备配置了 `LuckConfigCommandModel`，可通过：

```objc
[printer sendConfigTaskList:commandList compelete:^(NSObject *obj) {
    // ...
}];
```

`ConfigCommand` 封装单条配置指令，含 `type`、`data`、`task` 等属性。

---

## 10. 图片预处理

打印前需将图片缩放到打印机 DPI 与纸宽，并做抖动或二值化。

### 10.1 LuckPrinter 内置处理

| 方法 | 说明 |
|------|------|
| `normalPreviewImage:` | 缩放到打印机可用尺寸 |
| `ezPreviewImage:` | 缩放 + 二值化 |
| `ddPreviewImage:` | 缩放 + 抖动（卷纸常用） |

标签打印建议使用 `ddPreviewImage:` 或 `ezPreviewImage:`。

### 10.2 LuckTool

| 方法 | 说明 |
|------|------|
| `scallImage:toWidth:` | 按宽度缩放 |
| `scallImage:maxHeight:maxWidth:` | 限定最大宽高 |
| `scallImage:toHeight:` | 按高度缩放 |
| `scaleAndFillImage:toSize:` | 缩放并填充 |
| `dither:` | 抖动 |
| `erzhi:` | 二值化 |
| `gray:` | 灰度 |
| `getBitmapByteArrayGrayFromImage:mode:perByte:` | 灰度打印字节数据 |
| `convertImageToBinaryData:` | 转二进制 |
| `rotateImage:byDegrees:` | 旋转 |

### 10.3 UIImage (Luck)

| 方法 | 说明 |
|------|------|
| `dither` | 抖动 |
| `covertToBinaryzation:` | 二值化（threshold 系数 0–1） |
| `grayForImage:forType:` | 灰度（多种算法） |

### 10.4 推荐预处理流程（卷纸）

```objc
printer.paperType = LPPaperTypeJZ;
CGFloat width = MIN(printer.supportMaxWidth, 210.0);
UIImage *scaled = [LuckTool scallImage:image toWidth:width * printer.dpi];

if (printer.imageStretchRatio != 1.0) {
    // 按 imageStretchRatio 拉伸高度
}

UIImage *processed = [printer ddPreviewImage:scaled];
// 或 [LuckTool dither:scaled];
```

---

## 11. 走纸与任务控制

### 11.1 走纸（毫米）

```objc
[printer setPrinterWalkLong:20];  // 走纸 20mm
[printer synchronizeToPrinterCompelete:^{ }];
```

属性 `walkLong` / `configWalkLong` 表示走纸距离（内部按 dpi 换算）。

### 11.2 发送底层任务

```objc
LPSendTask *task = [LPSendTask printerWalkTask:144 compelete:^(NSObject *obj) {
    // 走纸完成
}];
[printer sendTask:task];
```

常用任务工厂见 [§14](#14-低级指令lpsendtask)。

### 11.3 任务队列

```objc
[printer sendTaskList:taskArray compelete:^(NSObject *obj) {}];
```

---

## 12. 固件升级 OTA

```objc
NSData *fw = [NSData dataWithContentsOfFile:path];

[printer updateVersion:fw
             onProcess:^(CGFloat progress) {
    // 0.0 ~ 1.0
} callback:^(NSError *error) {
    if (!error) { /* 成功 */ }
}];
```

| 方法 | 说明 |
|------|------|
| `updateVersion:callback:` | OTA（无进度） |
| `updateVersion:onProcess:callback:` | OTA（带进度） |
| `safeUpdateVersion:callback:` | 安全 OTA |

**属性**：`otaSate`（`LJOTASate`）、`otaProcessBlcok`  
**固件格式**：通常 `.bin` 或 `.prtu`  
**OTA 错误码**：见 [§16.2](#162-ota-错误码)

---

## 13. 面单机（LuckPrinterMD）

当 `isMDModel == YES` 或实例为 `LuckPrinterMD` 时：

**额外属性**

| 属性 | 说明 |
|------|------|
| `mdWidth` / `mdHeight` / `mdM` / `gapM` | 面单尺寸与间隙 |
| `copies`（MD 类） | 份数 |

**额外方法**

| 方法 | 说明 |
|------|------|
| `imageTask:compelete:` | 面单图片任务 |
| `mdSendImageLoopCompelete:` | 面单发送循环 |

面单打印前典型设置：

```objc
LuckPrinterMD *md = (LuckPrinterMD *)printer;
md.mdWidth = 75;
md.mdHeight = 130;
md.mdM = 2;
printer.paperType = LPPaperTypeBQ;
printer.isLabel = YES;
```

---

## 14. 低级指令（LPSendTask）

`LPSendTask` 为公开头文件中的 **指令任务** 封装，通过 `[printer sendTask:]` 发送。

### 14.1 常用查询任务

| 工厂方法 | 说明 |
|----------|------|
| `getStateTaskCompelete:` | 状态 |
| `getInfoTaskCompelete:` | 信息 |
| `getThickTaskCompelete:` | 浓度 |
| `getSnTaskCompelete:` | SN |
| `getVersionTaskCompelete:` | 版本 |
| `getBatteryTaskCompelete:` | 电量 |
| `getModelTaskCompelete:` | 型号 |
| `getMacTaskCompelete:` | MAC |
| `getTimeTaskCompelete:` | 关机时间 |

### 14.2 常用设置任务

| 工厂方法 | 说明 |
|----------|------|
| `setThickTask:compelete:` | 设置浓度 |
| `setTimeTask:compelete:` | 设置关机时间 |
| `setPaperTask:compelete:` | 设置纸张类型 |
| `setPrintPageCountTask:compelete:` | 设置打印页数 |
| `printerWalkTask:compelete:` | 走纸 |
| `printerEnterPaperTaskCompelete:` | 进纸 |
| `printerOutPaperTaskCompelete:` | 退纸 |
| `printerLocationTaskCompelete:` | 定位 |
| `printerEnableTaskCompelete:` | 使能 |
| `printerStopTaskCompelete:` | 停止 |

### 14.3 OTA 相关任务

`otaStartTaskCompelete:`、`otaSearchTaskCompelete:`、`otaSendTask:loc:compelete:` 等（一般由 `updateVersion:` 内部调用，App 通常直接使用高层 OTA API）。

### 14.4 任务属性

| 属性 | 说明 |
|------|------|
| `data` | 指令数据 |
| `compelete` | 完成回调 `TaskCompelete` |
| `timeout` | 超时（秒） |
| `cmdType` | 任务类型 `LJTaskType` |

---

## 15. 通知与回调

### 15.1 蓝牙通知（见 §5.6）

### 15.2 打印机通知

| 宏 | 说明 |
|----|------|
| `kLuckPrinterCanSendTaskNoticeName` | **可以发送指令**（必须监听） |
| `kLuckPrinterDidNotSupportNoticeName` | 设备不支持 |
| `kLuckPrinterPaperCantLocationName` | 纸张无法定位 |
| `kLuckPrinterGetModelName` | 已获取型号 |

### 15.3 PrintCompelete 回调

`normalPrintImages:config:callback:` 使用：

```objc
typedef void(^PrintCompelete)(NSError *error, BOOL isFinish, NSUInteger printCount, NSUInteger printIndex);
```

---

## 16. 错误码

### 16.1 通用错误（LJErrorType）

| 值 | 枚举 | 说明 |
|----|------|------|
| 70000 | `LJError_Task_Doing` | 任务执行中 |
| 70001 | `LJError_Task_Timeout` | 超时 |
| 70002 | `LJError_Printer_Noconnected` | 未连接 |
| 70003 | `LJError_WifiConfigFail` | WiFi 配网失败（蓝牙机通常不涉及） |
| -1 | `LJError_Unknown` | 未知 |

### 16.2 OTA 错误码

| 值 | 枚举 | 说明 |
|----|------|------|
| 90001 | `LJOTA_SIZE_ERROR` | 文件大小错误 |
| 90002 | `LJOTA_FILE_MD5_ERROR` | MD5 错误 |
| 90003 | `LJOTA_SAME_MD5_ERROR` | 固件相同 |
| 90004 | `LJOTA_PROTOCOL_PARSE_ERROR` | 协议错误 |
| 90005 | `LJOTA_FAIL_ERROR` | 升级失败 |
| 90006 | `LJOTA_TIMEOUT_ERROR` | 超时 |
| 90007 | `LJOTA_SIGNATURE_ERROR` | 签名错误 |
| 90008 | `LJOTA_NONSUPPORT_SAFEUPDATE_ERROR` | 不支持安全升级 |

### 16.3 OTA 状态（LJOTASate）

`LJOTASate_Prepare` / `Updating` / `Failure` / `Success`

---

## 17. 数据类型与枚举

### 17.1 LJPrintType（LuckPrintConfig）

| 值 | 枚举 | 说明 |
|----|------|------|
| 0 | `LJPrintTypeNormal` | 卷纸 |
| 1 | `LJPrintTypeLabel` | 标签 |
| 2 | `LJPrintTypeTattoo` | 纹身 |
| 3 | `LJPrintTypeFold` | 折叠 |
| 4 | `LJPrintTypeSheetLabel` | 面单 |

### 17.2 PrintPauseStatus

`PrintPauseStatusNone` / `WaitPause` / `Pause`

### 17.3 LPManufacturerType

`LPManufacturerAY`（爱印）、`JRP`、`YX`（印向）、`Hain`（汉印）、`ZJ`、`LJ`（鹿匠）等。

---

## 18. 完整 API 参考

### 18.1 LuckPrinter 公开接口（#pragma mark - interface 及打印/OTA）

| 方法 | 说明 |
|------|------|
| `getState:` | 获取状态 |
| `getPrinterInfo:` | 获取信息 |
| `getPowerCompelete:` | 获取电量 |
| `synchronizeToPrinterCompelete:` | 同步属性 |
| `printImages:copies:callback:` | 卷纸打印 |
| `printRollImages:copies:callback:` | 卷纸打印 |
| `printLabelImages:copies:callback:` | 标签打印 |
| `printTattooImages:copies:callback:` | 纹身打印 |
| `printFoldImages:copies:callback:` | 折叠纸打印 |
| `printGrayImages:copies:callback:` | 灰度卷纸 |
| `printGrayLabelImages:copies:callback:` | 灰度标签 |
| `normalPrintImages:config:callback:` | 通用打印 |
| `normalPreviewImage:` / `ezPreviewImage:` / `ddPreviewImage:` | 图片预处理 |
| `updateVersion:callback:` | OTA |
| `updateVersion:onProcess:callback:` | OTA + 进度 |
| `safeUpdateVersion:callback:` | 安全 OTA |
| `pausePrint` / `resumePrint` | 暂停/继续 |
| `clearPrintTask` / `stopCurrentTask` / `isHaveTask` | 任务管理 |
| `sendTask:` | 发送 LPSendTask |
| `sendTaskList:compelete:` | 发送任务列表 |
| `sendConfigTaskList:compelete:` | 发送配置指令列表 |
| `deviceAuthWithList:Compelete:` | 设备授权 |
| `deviceWriteModel:` | 写入型号 |
| `verifykDeviceMD5Command:` | Boot MD5 校验 |
| `setDeviceSettingCommand:` | Boot 设置指令 |

> 头文件中标注为「内部集成用」的方法（如 `*SendImageLoopCompelete:`）**不在此列出**，不建议 App 直接调用。

### 18.2 LuckPrinter 常用属性

| 属性 | 说明 |
|------|------|
| `peripheral` | 蓝牙外设 |
| `isLabel` | 标签模式 |
| `isPrinrGray` | 灰度打印 |
| `pauseStatus` | 暂停状态 |
| `normalPrintComplete` | 通用打印回调 |
| `otaSate` / `otaProcessBlcok` | OTA 状态/进度 |

---

## 19. 推荐接入时序

```
App 启动
  ├─ 设置 AppKey
  ├─ 注册 kBleDid* / kLuckPrinterCanSendTaskNoticeName
  └─ （可选）加载 LuckConfig 在线配置
       │
       ▼
scanPrinters → 展示设备列表 → 用户选择
       │
       ▼
connect:timeout:
       ├─ kBleDidConnectPeripheralNoticeName
       └─ kLuckPrinterCanSendTaskNoticeName  ← 必须等待
       │
       ▼
getPrinterInfo → 展示型号/SN/电量
       │
       ├─ （可选）设置 thick / closeTime / speed / paperType
       └─ synchronizeToPrinterCompelete
       │
       ▼
图片预处理（LuckTool / ddPreviewImage）
       │
       ▼
printImages / printLabelImages / printFoldImages / …
       │
       ├─ （可选）updateVersion OTA
       └─ disconnect
```

---

## 20. 常见问题

### Q1：扫描不到设备？

- 检查 AppKey、蓝牙权限、手机蓝牙开关  
- 真机调试  
- 确认设备未被其他 App 占用  
- 参考 `LuckPrinterInfo.filterPrefixList` 与 `LuckConfig.isContainDevice:`  

### Q2：连接成功但无法打印？

- 是否收到 **`kLuckPrinterCanSendTaskNoticeName`**  
- `JKBleManager.printer` 是否为 nil  
- 打印机是否缺纸、开盖、低电（`getState:`）  

### Q3：如何判断该走哪种打印 API？

根据 `paperType` 与 `isLabel` 对照 [§9.1](#91-打印模式对照) 表格。

### Q4：Swift 方法名与文档不一致？

Objective-C 导入 Swift 后常见映射：

| Objective-C | Swift |
|-------------|-------|
| `printImages:copies:callback:` | `print(_:copies:callback:)` |
| `printLabelImages:…` | `printLabel(_:copies:callback:)` |
| `printFoldImages:…` | `printFold(_:copies:callback:)` |
| `getPrinterInfo:` | `getInfo(_:)` |
| `synchronizeToPrinterCompelete:` | `synchronize(completionHandler:)` |
| `getPowerCompelete:` | `getPower(compelete:)` |

以 Xcode 补全为准。

### Q5：浓度/速度可选值从哪里来？

优先使用 `printer.densityList`、`printer.speedList`（来自在线配置或设备能力）。

### Q6：AI50 设备能用本文档吗？

AI50（`AI50_` 前缀、`LJWifiPocketPrinter`）请使用 **AI50 WiFi 接入文档**；本文档适用于其他蓝牙热敏/标签/A4 机型。

---

## 附录：公开头文件清单

| 头文件 | 说明 |
|--------|------|
| `LuckBleSDK.h` | SDK 入口 |
| `JKBleManager.h` | 蓝牙管理 |
| `LuckPrinter.h` | 打印机主类 |
| `LuckPrinterInfo.h` | 设备信息与枚举 |
| `LuckPrinterFactory.h` | 实例工厂 |
| `LuckTool.h` | 图片工具 |
| `UIImage+Luck.h` | 图片分类 |
| `LuckPrintConfig.h` | 打印配置 |
| `LuckLabelSize.h` | 标签尺寸 |
| `LPSendTask.h` | 指令任务 |
| `ConfigCommand.h` | 配置指令 |
| `LuckConfig.h` / `LuckConfigModel.h` | 在线配置 |
| `LuckPrinterMD.h` | 面单机 |
| `LJError.h` | 错误码 |

---

*文档版本：1.0 | 基于 LuckBleSDK 公开头文件整理*
