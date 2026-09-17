# LuckPrinter Android SDK 集成指南

## 1. 概述

LuckPrinter Android SDK 是一款蓝牙热敏打印机 SDK，支持扫描、连接和打印 230 多种蓝牙打印机型号。SDK 内部处理设备发现、连接管理、图像处理、打印任务分发和固件 OTA 升级。

**SDK 包名：** `com.luckprinter.sdk_new`
**主入口：** `com.luckprinter.sdk_new.device.PrinterHelper`（单例）
**AAR 文件：**

| 地区 | AAR 文件 |
|------|----------|
| 国内版 | `libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar` |
| 海外版 | `libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` |

根据主要目标市场区域选择一个 AAR 即可。

## 2. 快速开始

1. 将对应的 AAR 文件复制到 app 的 `libs/` 目录
2. 在 `build.gradle` 中添加 AAR 和依赖
3. 在 `AndroidManifest.xml` 中添加所需权限
4. 在 `Application.onCreate()` 中初始化 SDK
5. 注册监听器、扫描设备、连接、打印

## 3. 环境要求

| 项目 | 要求 |
|------|------|
| 最低 SDK | Android 5.0 (API 21) |
| 目标 SDK | Android 15 (API 35) |
| 语言 | Java / Kotlin |
| 架构 | armeabi-v7a, arm64-v8a |
| Java 版本 | Java 8+ |

## 4. 依赖配置

在 app 模块的 `build.gradle` 中：

```gradle
dependencies {
    // 根据地区选择一个 AAR
    // 国内市场：
    implementation files('libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar')
    // 海外市场：
    implementation files('libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar')

    // 网络库（SDK 必需）
    implementation 'com.squareup.okhttp3:okhttp:4.10.0'
}
```

### 4.1 FastBle 依赖（可选）

是否引入 FastBle 取决于打印机与 App 的通讯方式，以 LuckPrinter 提供的设备说明为准。对于 **BLE 通讯** 的设备：

1. 添加 FastBle 依赖
2. 在初始化时调用 `PrinterHelper.getInstance().setEnableBle(true)`

```gradle
dependencies {
    implementation 'com.github.Jasonchenlijian:FastBle:2.4.0'
}
```

**未引入 FastBle 时，请勿调用 `setEnableBle(true)`。**

引入 FastBle 时，项目级 `settings.gradle` 需包含 JitPack 仓库：

```gradle
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url "https://jitpack.io" }
    }
}
```

## 5. 权限

在 `AndroidManifest.xml` 中添加以下权限：

```xml
<!-- 蓝牙和定位权限 -->
<uses-permission android:name="android.permission.BLUETOOTH"/>
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN"/>
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
```

**权限请求逻辑：**

```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    // Android 12+：请求 BLUETOOTH_CONNECT 和 BLUETOOTH_SCAN
    requestPermissions(new String[]{
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
    }, REQUEST_CODE);
} else {
    // Android 11 及以下：请求定位权限
    requestPermissions(new String[]{
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    }, REQUEST_CODE);
}
```

## 6. SDK 初始化

在 `Application` 类中初始化 SDK：

```java
import com.luckprinter.sdk_new.device.PrinterHelper;

public class MyApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        String asKey = "YOUR_APP_AS_KEY"; // 联系 LuckPrinter 团队获取你的密钥
        PrinterHelper.getInstance().init(this, asKey, BuildConfig.DEBUG);
    }
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `context` | `Context` | Application 上下文 |
| `asKey` | `String` | 分配给你的唯一密钥。没有有效密钥，打印机连接将失败 |
| `isDebug` | `boolean` | 是否开启 SDK 调试日志 |

> **重要：** `asKey` 是打印机认证所必需的。无效或缺失密钥会导致打印机断开连接。请联系 LuckPrinter 团队获取你的唯一密钥。

## 7. 监听器注册

### 7.1 连接监听器

```java
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;

OnClientConnectionListener connectionListener = new OnClientConnectionListener() {
    @Override
    public void onLuckConnected(String name, String address) {
        // 已连接：name = 打印机蓝牙名称，address = MAC 地址
    }

    @Override
    public void onLuckDisConnected() {
        // 已断开连接
    }
};

// 注册
PrinterHelper.getInstance().addConnectListener(connectionListener);

// 移除（如在 onDestroy 中）
PrinterHelper.getInstance().removeConnectListener(connectionListener);
```

### 7.2 设备状态监听器

接收设备实时状态变化事件（缺纸、开盖、过热、低电量等）：

```java
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;

OnReceiveDeviceStatusListener statusListener = status -> {
    switch (status) {
        case PrinterStatus.PRINTER_STATUS_OUTPAPER:
            // 缺纸
            break;
        case PrinterStatus.PRINTER_STATUS_OPENCOVER:
            // 开盖
            break;
        case PrinterStatus.PRINTER_STATUS_OVERHEAT:
            // 过热
            break;
        case PrinterStatus.PRINTER_STATUS_LOWVAL:
            // 低电量
            break;
        case PrinterStatus.PRINTER_STATUS_PRINTTING:
            // 正在打印中
            break;
        case PrinterStatus.PRINTER_STATUS_RECHARGE:
            // 充电中
            break;
        case PrinterStatus.PRINTER_STATUS_NOT_LABEL:
            // 未检测到标签纸
            break;
    }
};

PrinterHelper.getInstance().addDeviceStatusListener(statusListener);
PrinterHelper.getInstance().removeDeviceStatusListener(statusListener);
```

### 7.3 设备禁用监听器

当设备被平台禁用时触发：

```java
import com.luckprinter.sdk_new.callback.DeviceForbiddenListener;

DeviceForbiddenListener forbiddenListener = () -> {
    // 设备已被禁用
    PrinterUtil.showToast("设备已被禁用");
};

PrinterHelper.getInstance().addDeviceForbiddenListener(forbiddenListener);
PrinterHelper.getInstance().removeDeviceForbiddenListener(forbiddenListener);
```

### 7.4 事件监听器

```java
import com.luckprinter.sdk_new.callback.OnEventListener;

OnEventListener eventListener = new OnEventListener() {
    @Override
    public void onLabelPaperError() {
        // 标签纸放置错误
        Toast.makeText(context, "标签纸放置不正确", Toast.LENGTH_SHORT).show();
    }
};

PrinterHelper.getInstance().addEventListener(eventListener);
PrinterHelper.getInstance().removeEventListener(eventListener);
```

## 8. 设备发现

使用 `ClassicScanDeviceHelper` 扫描可用打印机。该助手会自动过滤，仅返回支持的打印机设备。

```java
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;
import com.luckprinter.sdk_new.BtReceiver;

ClassicScanDeviceHelper scanHelper = new ClassicScanDeviceHelper(context);

scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
    @Override
    public void foundDev(int type, String name, String mac) {
        // 发现打印机：type = 蓝牙设备类型，name = 蓝牙名称，mac = MAC 地址
        // 添加到设备列表 UI
    }

    @Override
    public void startDiscovery() {
        // 扫描开始 - 显示加载指示器
    }

    @Override
    public void finishDiscovery() {
        // 扫描结束 - 隐藏加载指示器
    }
});

// 初始化（必须在 startScanDevice 之前调用）
scanHelper.init();

// 开始扫描（如果蓝牙未开启会自动开启）
scanHelper.startScanDevice();

// 停止扫描
scanHelper.stopScanDevice();

// 清理（在 onDestroy 中调用）
scanHelper.unInit();
```

## 9. 连接 / 断开连接

### 9.1 连接

```java
import android.bluetooth.BluetoothDevice;

String printerName = "LuckP_L3_12345";
String printerMac = "AA:BB:CC:DD:EE:FF";

// bluetoothType: BluetoothDevice.DEVICE_TYPE_CLASSIC (经典蓝牙)
//                或 BluetoothDevice.DEVICE_TYPE_LE (BLE)
boolean result = PrinterHelper.getInstance().connectLuck(printerName, printerMac,
        BluetoothDevice.DEVICE_TYPE_CLASSIC);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `String` | 打印机蓝牙名称 |
| `address` | `String` | 打印机 MAC 地址 |
| `bluetoothType` | `int` | `BluetoothDevice.DEVICE_TYPE_CLASSIC` 或 `DEVICE_TYPE_LE` |

**返回值：** 连接尝试已发起返回 `true`，否则返回 `false`。

实际连接结果通过 `OnClientConnectionListener.onLuckConnected()` 或 `onLuckDisConnected()` 回调。

### 9.2 断开连接

```java
PrinterHelper.getInstance().disconnectLuck();
```

### 9.3 检查连接状态

```java
boolean isConnected = PrinterHelper.getInstance().isConnectedLuck();
```

## 10. 打印方法

所有打印方法内部会在打印前检查打印机状态。如果打印机报告错误（缺纸、开盖、过热、低电量），`onPrintFail(int status)` 回调会被触发并携带相应的错误码。

### 10.1 连续纸打印

```java
import com.luckprinter.sdk_new.callback.OnPrintCallback;

Bitmap bitmap = ...; // 你的图片（应通过 OpenCV 等方式进行抖动处理）
int copies = 1;

PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onStartPrint() {
        // 打印任务开始
    }

    @Override
    public void onPrintIndexStart(Bitmap bmp, int page, int total) {
        // 第 `page` 页，共 `total` 页，开始打印
    }

    @Override
    public void onPrintIndexEnd(Bitmap bmp, int page, int total) {
        // 第 `page` 页，共 `total` 页，打印完成
    }

    @Override
    public void onPrintSuccess() {
        // 所有份数已物理打印完成（纸张完全送出）
    }

    @Override
    public void onPrintFail(int status) {
        // 打印失败，携带错误码（见错误码部分）
    }
});
```

**重载方法：**

```java
// 简单版本（无灰度）
void print(Bitmap bitmap, int printNum, OnPrintCallback onPrintCallback)

// 完整版本，支持灰度打印
void print(Bitmap bitmap, boolean isGray, int grayLevel, int printNum, OnPrintCallback onPrintCallback)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `bitmap` | `Bitmap` | 要打印的图像 |
| `isGray` | `boolean` | 是否使用灰度打印 |
| `grayLevel` | `int` | 灰度级数，如 4、8 或 16 |
| `printNum` | `int` | 打印份数 |
| `onPrintCallback` | `OnPrintCallback` | 打印回调 |

**单次打印（多页任务中的单页）：**

```java
PrinterHelper.getInstance().printOnce(bitmap, printIndex, printNum, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 单页打印成功
    }

    @Override
    public void onFail() {
        // 失败
    }
});

// 带灰度
PrinterHelper.getInstance().printOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.2 标签纸打印

```java
PrinterHelper.getInstance().printTag(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onPrintSuccess() {
        // 标签打印完成
    }

    @Override
    public void onPrintFail(int status) {
        // 失败
    }

    // ... 其他回调与连续纸相同
});

// 带灰度
PrinterHelper.getInstance().printTag(bitmap, isGray, grayLevel, copies, callback);
```

**单次打印：**

```java
PrinterHelper.getInstance().printTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.3 圆形标签纸

```java
PrinterHelper.getInstance().printCircleTag(bitmap, copies, callback);
PrinterHelper.getInstance().printCircleTag(bitmap, isGray, grayLevel, copies, callback);

// 单次打印
PrinterHelper.getInstance().printCircleTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printCircleTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.4 黑标标签纸

```java
PrinterHelper.getInstance().printBlackTag(bitmap, copies, callback);
PrinterHelper.getInstance().printBlackTag(bitmap, isGray, grayLevel, copies, callback);

// 单次打印
PrinterHelper.getInstance().printBlackTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printBlackTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.5 A4 折叠纸

仅适用于 A4 打印机（可通过 `isA4Printer()` 检查）：

```java
if (PrinterHelper.getInstance().isA4Printer()) {
    PrinterHelper.getInstance().printFolder(bitmap, copies, callback);
    PrinterHelper.getInstance().printFolder(bitmap, isGray, grayLevel, copies, callback);

    // 单次打印
    PrinterHelper.getInstance().printFolderOnce(bitmap, printIndex, printNum, callback);
    PrinterHelper.getInstance().printFolderOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
}
```

**设置 A4 纸张尺寸：**

```java
// 设置自定义 A4 尺寸（毫米）
PrinterHelper.getInstance().setA4PaperSize(widthMM, heightMM);
```

### 10.6 纹身纸

```java
PrinterHelper.getInstance().printTattoo(bitmap, copies, callback);
PrinterHelper.getInstance().printTattoo(bitmap, isGray, grayLevel, copies, callback);

// 单次打印
PrinterHelper.getInstance().printTattooOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printTattooOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.7 水转印纸

```java
PrinterHelper.getInstance().printWaterTransfer(bitmap, isGray, grayLevel, copies, callback);

// 单次打印
PrinterHelper.getInstance().printWaterTransferOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.8 单张标签（已废弃）

```java
// 已废弃 - 请使用 printTag 替代
@Deprecated
PrinterHelper.getInstance().printSheetLabel(tagWidthMM, tagHeightMM, speed, density, bitmap, count);
```


## 11. 设备信息查询

### 11.1 获取设备型号

```java
PrinterHelper.getInstance().printerModelLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String model) {
        // 例如："LuckP_L3"
    }
    @Override
    public void onFail() {}
});
```

### 11.2 获取序列号

```java
PrinterHelper.getInstance().printerSNLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String sn) {
        // 设备序列号
    }
    @Override
    public void onFail() {}
});
```

### 11.3 获取固件版本

```java
PrinterHelper.getInstance().printerVersionLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String version) {
        // 例如："V1.3.8"
    }
    @Override
    public void onFail() {}
});
```

### 11.4 获取 Boot 版本

```java
PrinterHelper.getInstance().printerBootLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String bootVersion) {
        // Boot 版本字符串
    }
    @Override
    public void onFail() {}
});
```

### 11.5 获取所有信息

一次性批量查询所有设备信息：

```java
PrinterHelper.getInstance().getAllInfo(new OnPrinterInfoCallback() {
    @Override
    public void onStart() {
        // 查询开始
    }

    @Override
    public void onVersion(String ver) { }
    @Override
    public void onName(String name) { }
    @Override
    public void onMac(String mac) { }
    @Override
    public void onSn(String sn) { }
    @Override
    public void onModel(String model) { }
    @Override
    public void onBattery(String battery) { }
    @Override
    public void onShutTime(int shutTime) { }
    @Override
    public void onDensity(int density) { }

    @Override
    public void onFinish() {
        // 所有信息已收集完毕
    }
});
```

### 11.6 获取打印机状态

```java
import com.luckprinter.sdk_new.bean.PrinterStatusData;

PrinterHelper.getInstance().getPrinterStatus(new ResultCallback<PrinterStatusData>() {
    @Override
    public void onSuccess(PrinterStatusData data) {
        boolean isPrinting = data.getIsPrinting() == 1;
        boolean isCoverOpen = data.getIsOpen() == 1;
        boolean isPaperOut = data.getIsLackPaper() == 1;
        boolean isLowBattery = data.getIsLackElec() == 1;
        boolean isOverheating = data.getIsOverheat() == 1;
        boolean isCharging = data.getIsRecharge() == 1;
    }
    @Override
    public void onFail() {}
});
```

### 11.7 获取电量

```java
PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer battery) {
        // 电量百分比（通常为 0-100）
    }
    @Override
    public void onFail() {}
});
```

## 12. 设备设置

### 12.1 打印浓度

```java
// 获取当前浓度
PrinterHelper.getInstance().getDensityLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer density) {
        // 当前浓度值
    }
    @Override
    public void onFail() {}
});

// 设置浓度
int densityValue = 8; // 具体值取决于打印机型号
PrinterHelper.getInstance().setDensityLuck(densityValue, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 浓度设置成功
    }
    @Override
    public void onFail() {
        // 浓度设置失败
    }
});
```

可用的浓度值因打印机型号而异。可通过 `getDensityList()` 查询支持的值：

```java
List<Integer> densities = PrinterHelper.getInstance().getDensityList();
Integer defaultDensity = PrinterHelper.getInstance().getDefaultDensity();
```

### 12.2 打印速度

```java
// 获取当前速度
PrinterHelper.getInstance().getSpeed(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer speed) {
        // 当前速度值
    }
    @Override
    public void onFail() {}
});

// 设置速度
int speedValue = 4; // 大多数打印机范围为 0-8
PrinterHelper.getInstance().setSpeedLuck(speedValue, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 速度设置成功
    }
    @Override
    public void onFail() {
        // 速度设置失败
    }
});
```

检查打印机是否支持速度设置：

```java
boolean supported = PrinterHelper.getInstance().isSupportSetSpeed();
List<Integer> speeds = PrinterHelper.getInstance().getSpeedList();
Integer defaultSpeed = PrinterHelper.getInstance().getDefaultSpeed();
```

### 12.3 自动关机时间

```java
// 获取自动关机时间
PrinterHelper.getInstance().getShutTimeLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer minutes) {
        // 自动关机时间（分钟）
    }
    @Override
    public void onFail() {}
});

// 设置自动关机时间（0 = 永不关机）
int minutes = 30;
PrinterHelper.getInstance().setShutTimeLuck(minutes, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 关机时间设置成功
    }
    @Override
    public void onFail() {}
});
```

### 12.4 恢复出厂设置

```java
PrinterHelper.getInstance().setRecoveryLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 恢复出厂设置完成
    }
    @Override
    public void onFail() {
        // 恢复出厂设置失败
    }
});
```

### 12.5 查询打印机配置

```java
PrinterHelper.getInstance().printerSettingLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String md5) {
        // 配置 MD5 哈希值
    }
    @Override
    public void onFail() {}
});
```

## 13. 走纸

```java
// 正向走纸指定点数
int dots = 144;
PrinterHelper.getInstance().printLineDotsLuck(dots);

// 反向走纸指定点数
PrinterHelper.getInstance().printReverseLineDotsLuck(dots);
```

## 14. 固件 OTA 升级

```java
import com.luckprinter.sdk_new.callback.UpdateListener;

File firmwareFile = new File("/path/to/firmware.bin");

PrinterHelper.getInstance().updatePrinterLuck(firmwareFile, new UpdateListener() {
    @Override
    public void onStart() {
        // 升级开始
    }

    @Override
    public void onProgress(int progress) {
        // 进度 0-100
        Log.d("OTA", "升级进度: " + progress + "%");
    }

    @Override
    public void onError() {
        // 升级失败
    }

    @Override
    public void onComplete() {
        // 升级完成
    }
});
```

## 15. 错误码

SDK 通过 `OnPrintCallback.onPrintFail(int status)` 和 `OnReceiveDeviceStatusListener.onDeviceStatus(int status)` 报告错误码。

### 15.1 打印错误码

| 常量 | 值 | 描述 | 建议操作 |
|------|-----|------|----------|
| `PRINTER_STATUS_OUTPAPER` | 0 | 缺纸 / 纸张未正确装入 | 请用户正确装入纸张 |
| `PRINTER_STATUS_OPENCOVER` | 1 | 打印机盖打开 | 请用户关闭打印机盖 |
| `PRINTER_STATUS_OVERHEAT` | 2 | 打印机过热 | 等待打印机冷却后再重试 |
| `PRINTER_STATUS_LOWVAL` | 3 | 电量低 | 为打印机充电或连接电源 |
| `PRINTER_STATUS_PRINTTING` | 4 | 打印机正在打印中 | 等待当前任务完成 |
| `PRINTER_STATUS_RECHARGE` | 5 | 打印机充电中 | 等待或充电时打印（如支持） |
| `PRINTER_STATUS_NOT_LABEL` | 6 | 未检测到标签（标签打印机） | 请用户正确放置标签纸 |

通用错误码 `-1` 表示非特定打印失败（例如打印过程中连接断开）。

## 16. 状态监控

### 16.1 实时状态推送

注册 `OnReceiveDeviceStatusListener`（见 [第 7.2 节](#72-设备状态监听器)）接收实时状态变化。打印机会主动推送以下状态更新：

- 缺纸 / 纸张已装入
- 开盖 / 关盖
- 过热 / 冷却中
- 低电量 / 电量已充满
- 充电状态变化

### 16.2 标签纸错误

注册 `OnEventListener`（见 [第 7.4 节](#74-事件监听器)）在标签纸放置不正确时接收 `onLabelPaperError()` 回调。

## 17. 常见问题

### Q1: 打印机能在打印前检测纸张吗？

**可以。** 每次打印命令前，SDK 内部会调用 `getStatusBeforePrint()`，查询打印机状态（包括缺纸检测 `PrinterStatusData.isLackPaper`）。如果纸张未装入，打印命令会失败，`onPrintFail(int status)` 会被调用并携带 `PRINTER_STATUS_OUTPAPER = 0` 错误码。

你也可以随时手动查询状态：
```java
PrinterHelper.getInstance().getPrinterStatus(callback);
```

### Q2: 应用能在纸张正确装入时收到通知吗？

SDK 不提供专门的"纸张已装入"推送通知。但你可以：
1. 注册 `OnReceiveDeviceStatusListener` 接收设备实时状态变化事件。
2. 轮询 `getPrinterStatus()` 并检查 `isLackPaper` 字段。

### Q3: `onPrintSuccess()` 是否确认物理打印已完成？

**是的。** `OnPrintCallback.onPrintSuccess()` 仅在打印机已物理完成整个打印任务（所有页面已打印且纸张完全送出）时被调用。这不仅仅是"数据已发送"的通知。

### Q4: 能获取打印进度（0-100%）吗？

SDK 提供**页面级进度**：通过 `onPrintIndexStart(bitmap, page, num)` 和 `onPrintIndexEnd(bitmap, page, num)` 回调报告当前正在打印第几页，共几页。它不提供单页打印过程中的连续 0-100% 百分比，但你可以根据页码索引自行计算进度。

### Q5: `onPrintFail()` 可以返回哪些错误码？

参见上方 [错误码表（第 15 节）](#15-错误码) 中的完整列表。

### Q6: 能按需查询电量吗？

**可以。** `PrinterHelper.getInstance().getBatteryLuck(ResultCallback<Integer> callback)` 返回电量百分比。

### Q7: 打印机会自动推送电量变化吗？

**不会。** SDK 不提供专门的电量推送通知。实时监控电量建议通过 `getBatteryLuck()` 定期轮询。

### Q8: 能通过 OTA 升级打印机固件吗？

**可以。** `PrinterHelper.getInstance().updatePrinterLuck(File file, UpdateListener listener)` 支持 OTA 固件升级。`UpdateListener` 提供 `onStart()`、`onProgress(int progress)`（0-100）、`onError()` 和 `onComplete()` 回调。

### Q9: 能同时连接多台打印机吗？

**不能。** SDK 使用单例 `PrinterHelper`，同时只能管理一台活动打印机连接。不支持多打印机同时连接。

## 18. ProGuard 规则

如果你使用 ProGuard 进行代码混淆，请在 `proguard-rules.pro` 中添加以下规则：

```proguard
-keep class com.luckprinter.sdk_new.** {*;}
-keep class com.clj.fastble.** {*;}
-keep class com.itpp.** {*;}
-keep class com.jniclass.** {*;}
```

## 19. 完整集成示例

```java
import android.Manifest;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import com.luckprinter.sdk_new.BtReceiver;
import com.luckprinter.sdk_new.PrinterStatus;
import com.luckprinter.sdk_new.bean.PrinterStatusData;
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;
import com.luckprinter.sdk_new.callback.OnPrintCallback;
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.callback.ResultCallback;
import com.luckprinter.sdk_new.device.PrinterHelper;
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;

import java.util.ArrayList;

public class PrinterDemoActivity extends AppCompatActivity {

    private ClassicScanDeviceHelper scanHelper;
    private ArrayList<String> deviceNames = new ArrayList<>();
    private ArrayList<String> deviceMacs = new ArrayList<>();
    private int selectedIndex = -1;

    private static final int REQ_PERMISSIONS = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // setContentView(...);

        // 1. 请求权限
        requestPermissionsIfNeeded();
    }

    private void requestPermissionsIfNeeded() {
        ArrayList<String> permissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            permissions.add(Manifest.permission.BLUETOOTH_SCAN);
        } else {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        boolean needRequest = false;
        for (String perm : permissions) {
            if (ActivityCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }

        if (needRequest) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), REQ_PERMISSIONS);
        } else {
            onPermissionsGranted();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                onPermissionsGranted();
            } else {
                Toast.makeText(this, "需要蓝牙和定位权限才能使用打印机", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void onPermissionsGranted() {
        // 2. 注册监听器
        registerListeners();

        // 3. 开始设备发现
        startScan();
    }

    private void registerListeners() {
        // 连接监听器
        PrinterHelper.getInstance().addConnectListener(new OnClientConnectionListener() {
            @Override
            public void onLuckConnected(String name, String address) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "已连接: " + name, Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onLuckDisConnected() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "已断开连接", Toast.LENGTH_SHORT).show()
                );
            }
        });

        // 设备状态监听器
        PrinterHelper.getInstance().addDeviceStatusListener(new OnReceiveDeviceStatusListener() {
            @Override
            public void onDeviceStatus(int status) {
                runOnUiThread(() -> {
                    switch (status) {
                        case PrinterStatus.PRINTER_STATUS_OUTPAPER:
                            Toast.makeText(PrinterDemoActivity.this, "缺纸", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_OPENCOVER:
                            Toast.makeText(PrinterDemoActivity.this, "开盖", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_OVERHEAT:
                            Toast.makeText(PrinterDemoActivity.this, "过热", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_LOWVAL:
                            Toast.makeText(PrinterDemoActivity.this, "低电量", Toast.LENGTH_SHORT).show();
                            break;
                    }
                });
            }
        });
    }

    private void startScan() {
        scanHelper = new ClassicScanDeviceHelper(this);
        scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
            @Override
            public void foundDev(int type, String name, String mac) {
                runOnUiThread(() -> {
                    deviceNames.add(name);
                    deviceMacs.add(mac);
                    // 在此更新设备列表 UI
                });
            }

            @Override
            public void startDiscovery() {
                // 显示扫描指示器
            }

            @Override
            public void finishDiscovery() {
                // 隐藏扫描指示器
            }
        });
        scanHelper.init();
        scanHelper.startScanDevice();

        // 10 秒后自动停止扫描
        runOnUiThread(() -> scanHelper.stopScanDevice(), 10000);
    }

    /**
     * 用户从列表选择打印机时调用
     */
    private void connectToPrinter(int index) {
        if (index < 0 || index >= deviceNames.size()) return;
        selectedIndex = index;

        String name = deviceNames.get(index);
        String mac = deviceMacs.get(index);

        PrinterHelper.getInstance().connectLuck(name, mac, BluetoothDevice.DEVICE_TYPE_CLASSIC);
    }

    /**
     * 打印图片（连接后调用）
     */
    private void printImage(Bitmap bitmap, int copies) {
        if (!PrinterHelper.getInstance().isConnectedLuck()) {
            Toast.makeText(this, "未连接", Toast.LENGTH_SHORT).show();
            return;
        }

        PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "打印已开始", Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintIndexStart(Bitmap bmp, int page, int total) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "正在打印第 " + page + "/" + total + " 页", Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintSuccess() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "打印完成", Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintFail(int status) {
                runOnUiThread(() -> {
                    String errorMsg = "打印失败: " + getErrorDescription(status);
                    Toast.makeText(PrinterDemoActivity.this, errorMsg, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    /**
     * 查询电量
     */
    private void queryBattery() {
        if (!PrinterHelper.getInstance().isConnectedLuck()) return;

        PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer battery) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "电量: " + battery + "%", Toast.LENGTH_SHORT).show()
                );
            }
            @Override
            public void onFail() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "获取电量失败", Toast.LENGTH_SHORT).show()
                );
            }
        });
    }

    private String getErrorDescription(int status) {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER: return "缺纸";
            case PrinterStatus.PRINTER_STATUS_OPENCOVER: return "开盖";
            case PrinterStatus.PRINTER_STATUS_OVERHEAT: return "过热";
            case PrinterStatus.PRINTER_STATUS_LOWVAL: return "低电量";
            case PrinterStatus.PRINTER_STATUS_PRINTTING: return "正在打印中";
            case PrinterStatus.PRINTER_STATUS_RECHARGE: return "充电中";
            case PrinterStatus.PRINTER_STATUS_NOT_LABEL: return "未检测到标签纸";
            default: return "未知错误 (" + status + ")";
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanHelper != null) {
            scanHelper.unInit();
            scanHelper = null;
        }
        // 离开时断开连接
        if (PrinterHelper.getInstance().isConnectedLuck()) {
            PrinterHelper.getInstance().disconnectLuck();
        }
    }
}
```
