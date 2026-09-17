# AI50 打印机 Android SDK 集成指南

## 1. 概述

AI50 是 LuckPrinter SDK 支持的 WiFi 智能热敏打印机。App 通过蓝牙与设备通信，可完成连续纸打印、WiFi 配网、设备信息查询、参数设置及固件 OTA 升级。

**SDK 包名：** `com.luckprinter.sdk_new`  
**主入口：** `com.luckprinter.sdk_new.device.PrinterHelper`（单例）

| 地区 | AAR 文件 |
|------|----------|
| 国内版 | `libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar` |
| 海外版 | `libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` |

根据目标市场选择其中一个 AAR 即可。

## 2. 快速开始

1. 将 AAR 复制到 app 的 `libs/` 目录，并配置 Gradle 依赖
2. 在 `AndroidManifest.xml` 中添加所需权限
3. 在 `Application.onCreate()` 中初始化 SDK
4. 注册监听器
5. 扫描 AI50 设备并连接
6. 调用打印、WiFi 配网或设备管理接口

## 3. 环境要求

| 项目 | 要求 |
|------|------|
| 最低 SDK | Android 5.0 (API 21) |
| 目标 SDK | Android 15 (API 35) |
| 语言 | Java / Kotlin |
| 架构 | armeabi-v7a, arm64-v8a |
| Java 版本 | Java 8+ |
| WiFi 网络 | 2.4 GHz（不支持 5 GHz） |

## 4. 依赖配置

在 app 模块的 `build.gradle` 中：

```gradle
dependencies {
    // 根据地区选择一个 AAR
    implementation files('libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar')
    // implementation files('libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar')

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

在 `AndroidManifest.xml` 中添加：

```xml
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
    requestPermissions(new String[]{
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
    }, REQUEST_CODE);
} else {
    requestPermissions(new String[]{
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    }, REQUEST_CODE);
}
```

WiFi 配网由打印机自行连接路由器，App 经蓝牙下发 SSID 与密码，无需申请 WiFi 相关权限。

## 6. SDK 初始化

在 `Application` 类中初始化 SDK：

```java
import com.luckprinter.sdk_new.device.PrinterHelper;

public class MyApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        String asKey = "YOUR_APP_AS_KEY";
        PrinterHelper.getInstance().init(this, asKey, BuildConfig.DEBUG);
    }
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `context` | `Context` | Application 上下文 |
| `asKey` | `String` | 应用密钥，缺失或无效将导致连接失败 |
| `isDebug` | `boolean` | 是否输出 SDK 调试日志 |

> **重要：** 请联系 LuckPrinter 团队获取正式 `asKey`。

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

PrinterHelper.getInstance().addConnectListener(connectionListener);
PrinterHelper.getInstance().removeConnectListener(connectionListener);
```

### 7.2 设备状态监听器

AI50 会通过该监听器推送打印状态与 WiFi 配网状态：

```java
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.PrinterStatus;

OnReceiveDeviceStatusListener statusListener = status -> {
    if (status >= PrinterStatus.WIFI_PRINTER_STATUS_CONNECTING
            && status <= PrinterStatus.WIFI_PRINTER_STATUS_NOT_CONNECTED) {
        // WiFi 状态，见第 16 节
    } else {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER:   break; // 缺纸
            case PrinterStatus.PRINTER_STATUS_OPENCOVER:  break; // 开盖
            case PrinterStatus.PRINTER_STATUS_OVERHEAT:   break; // 过热
            case PrinterStatus.PRINTER_STATUS_LOWVAL:     break; // 低电量
            case PrinterStatus.PRINTER_STATUS_PRINTTING:  break; // 打印中
            case PrinterStatus.PRINTER_STATUS_RECHARGE:   break; // 充电中
        }
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

PrinterHelper.getInstance().addEventListener(new OnEventListener() {
    @Override
    public void onLabelPaperError() { }
});
```

## 8. 设备发现

使用 `ClassicScanDeviceHelper` 扫描可用打印机：

```java
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;
import com.luckprinter.sdk_new.BtReceiver;

ClassicScanDeviceHelper scanHelper = new ClassicScanDeviceHelper(context);

scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
    @Override
    public void foundDev(int type, String name, String mac) {
        // 发现打印机：type = 蓝牙设备类型，name = 蓝牙名称，mac = MAC 地址
        // 将 AI50 打印机加入设备列表
    }

    @Override
    public void startDiscovery() { }

    @Override
    public void finishDiscovery() { }
});

scanHelper.init();
scanHelper.startScanDevice();
scanHelper.stopScanDevice();
scanHelper.unInit();
```

Android 11 及以下需开启系统定位服务，否则可能扫描不到设备。

## 9. 连接 / 断开连接

### 9.1 连接

```java
import android.bluetooth.BluetoothDevice;

boolean result = PrinterHelper.getInstance().connectLuck(name, mac, type);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `String` | 打印机蓝牙名称 |
| `address` | `String` | 打印机 MAC 地址 |
| `bluetoothType` | `int` | 扫描回调 `foundDev` 返回的设备类型 |

连接结果通过 `OnClientConnectionListener` 异步通知。切换设备时，SDK 会先断开当前连接再建立新连接。

### 9.2 断开连接

```java
PrinterHelper.getInstance().disconnectLuck();
```

### 9.3 检查连接状态

```java
boolean isConnected = PrinterHelper.getInstance().isConnectedLuck();
```

调用打印、WiFi 配网等接口前，应确认 `isConnectedLuck()` 为 `true`。

## 10. 连续纸打印

所有打印方法内部会在打印前检查打印机状态。若打印机报告错误（缺纸、开盖、过热、低电量），`onPrintFail(int status)` 将携带相应错误码。

### 10.1 发起打印

```java
import com.luckprinter.sdk_new.callback.OnPrintCallback;

Bitmap bitmap = ...; // 你的图片
int copies = 1;

PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onStartPrint() { }

    @Override
    public void onPrinting(int page, int num) {
        // 第 page 份，共 num 份
    }

    @Override
    public void onPrintSuccess() { }

    @Override
    public void onPrintFail(int status) { }
});
```

**方法签名：**

```java
void print(Bitmap bitmap, int printNum, OnPrintCallback onPrintCallback)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `bitmap` | `Bitmap` | 要打印的图像 |
| `printNum` | `int` | 打印份数 |
| `onPrintCallback` | `OnPrintCallback` | 打印回调 |

### 10.2 按打印宽度缩放（可选）

```java
int printWidth = PrinterHelper.getInstance().getPrintWidth();

int widthMM = 48;
int requireWidth = (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) * widthMM;
printWidth = Math.min(printWidth, requireWidth);

float scale = printWidth * 1.0f / bitmap.getWidth();
int printHeight = (int) (scale * bitmap.getHeight());
Bitmap resized = Bitmap.createScaledBitmap(bitmap, printWidth, printHeight, true);
```

## 11. 设备信息查询

### 11.1 单项查询

```java
PrinterHelper.getInstance().printerModelLuck(callback);     // 型号
PrinterHelper.getInstance().printerSNLuck(callback);        // 序列号
PrinterHelper.getInstance().printerVersionLuck(callback);   // 固件版本
PrinterHelper.getInstance().printerBootLuck(callback);      // Boot 版本
PrinterHelper.getInstance().getShutTimeLuck(callback);      // 自动关机时间（分钟）
PrinterHelper.getInstance().getPrinterStatus(callback);     // 打印机状态
PrinterHelper.getInstance().getBatteryLuck(callback);       // 电量（0–100）
PrinterHelper.getInstance().getDensityLuck(callback);       // 打印浓度
```

### 11.2 批量查询

```java
PrinterHelper.getInstance().getAllInfo(new OnPrinterInfoCallback() {
    @Override public void onStart() { }
    @Override public void onVersion(String ver) { }
    @Override public void onName(String name) { }
    @Override public void onMac(String mac) { }
    @Override public void onSn(String sn) { }
    @Override public void onModel(String model) { }
    @Override public void onBattery(String battery) { }
    @Override public void onShutTime(int shutTime) { }
    @Override public void onDensity(int density) { }
    @Override public void onFinish() { }
});
```

### 11.3 打印机状态

`getPrinterStatus()` 返回 `PrinterStatusData`，主要字段：

| 字段 | 含义 |
|------|------|
| `isPrinting` | 是否正在打印 |
| `isOpen` | 是否开盖 |
| `isLackPaper` | 是否缺纸 |
| `isLackElec` | 是否低电量 |
| `isOverheat` | 是否过热 |
| `isRecharge` | 是否充电中 |

## 12. 设备设置

### 12.1 打印浓度

```java
List<Integer> densityList = PrinterHelper.getInstance().getDensityList();

PrinterHelper.getInstance().getDensityLuck(callback);
PrinterHelper.getInstance().setDensityLuck(value, callback);
```

设置时 `value` 须为 `getDensityList()` 返回列表中的合法值。

### 12.2 自动关机时间

```java
PrinterHelper.getInstance().getShutTimeLuck(callback);

// 0 表示不自动关机
PrinterHelper.getInstance().setShutTimeLuck(minutes, callback);
```

### 12.3 设备音量

```java
PrinterHelper.getInstance().getDeviceVolume(new ResultCallback<VolumeBean>() {
    @Override
    public void onSuccess(VolumeBean data) {
        int volume = data.getVolume();
        int maxVolume = data.getMaxVolume();
    }

    @Override
    public void onFail() { }
});

PrinterHelper.getInstance().setDeviceVolume(volume, callback);
```

### 12.4 打印机语言

设置打印机界面显示语言。`language` 参数传入**国际化语言代码**（Language Code，如 ISO 639-1），而非语言名称。

**常用示例：**

| 语言 | 代码 |
|------|------|
| 英文 | `en` |
| 中文 | `zh` |

具体可用代码以打印机固件支持为准。

```java
import com.luckprinter.sdk_new.callback.ResultCallback;

String language = "zh"; // 国际化语言代码，如 en、zh

PrinterHelper.getInstance().setPrinterLanguage(language, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 设置成功
    }

    @Override
    public void onFail() {
        // 设置失败
    }
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `language` | `String` | 国际化语言代码，如 `en`、`zh` |
| `callback` | `ResultCallback<Integer>` | 设置结果回调 |

### 12.5 恢复出厂设置

```java
PrinterHelper.getInstance().resetDevice();
```

> 恢复出厂为不可逆操作，执行后设备参数将恢复默认值。

## 13. WiFi 配网

打印机通过蓝牙接收 WiFi 账号密码后自行连网，**仅支持 2.4 GHz WiFi**。

### 13.1 下发账号密码

```java
PrinterHelper.getInstance().sendWifiAccountPassword(ssid, password,
        new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // 指令发送成功，连网结果需查询 WiFi 状态
    }

    @Override
    public void onFail() { }
});
```

### 13.2 推荐流程

1. 建立蓝牙连接
2. 用户填写 2.4 GHz WiFi 的 SSID 与密码
3. 调用 `sendWifiAccountPassword()`
4. 通过 `getWifiState()` 或状态监听器确认连网结果

## 14. WiFi 状态

### 14.1 主动查询

```java
PrinterHelper.getInstance().getWifiState(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer status) { }

    @Override
    public void onFail() { }
});
```

### 14.2 状态码

| 常量 | 值 | 含义 |
|------|-----|------|
| `WIFI_PRINTER_STATUS_CONNECTING` | 100 | 连接中 |
| `WIFI_PRINTER_STATUS_CONNECTED` | 101 | 已连接 |
| `WIFI_PRINTER_STATUS_PWD_ERROR` | 102 | 密码错误 |
| `WIFI_PRINTER_STATUS_DISCONNECT` | 103 | 已断开 |
| `WIFI_PRINTER_STATUS_NOT_CONNECTED` | 104 | 未连接 |

上述状态也可由 `OnReceiveDeviceStatusListener` 推送。

## 15. 固件 OTA 升级

```java
File firmwareFile = new File("/path/to/firmware.bin");

PrinterHelper.getInstance().updatePrinterLuck(firmwareFile, new UpdateListener() {
    @Override
    public void onStart() { }

    @Override
    public void onProgress(int progress) { }

    @Override
    public void onError() { }

    @Override
    public void onComplete() { }
});
```

支持 `.BIN`、`.PRTU` 格式，升级过程中需保持蓝牙连接。

## 16. 错误码

### 16.1 打印 / 硬件状态

| 常量 | 值 | 描述 |
|------|-----|------|
| `PRINTER_STATUS_OUTPAPER` | 0 | 缺纸 |
| `PRINTER_STATUS_OPENCOVER` | 1 | 开盖 |
| `PRINTER_STATUS_OVERHEAT` | 2 | 过热 |
| `PRINTER_STATUS_LOWVAL` | 3 | 低电量 |
| `PRINTER_STATUS_PRINTTING` | 4 | 正在打印 |
| `PRINTER_STATUS_RECHARGE` | 5 | 充电中 |

### 16.2 WiFi 状态

见 [第 14.2 节](#142-状态码)。

## 17. API 功能一览

| 功能 | 接口 | 需连接 |
|------|------|--------|
| 扫描设备 | `ClassicScanDeviceHelper.startScanDevice()` | 否 |
| 连接设备 | `connectLuck()` | — |
| 断开蓝牙 | `disconnectLuck()` | 是 |
| 是否已连接 | `isConnectedLuck()` | — |
| 连续纸打印 | `print()` | 是 |
| 获取打印宽度 | `getPrintWidth()` | 是 |
| 是否 304 DPI | `is304Dpi()` | 是 |
| 查询型号 | `printerModelLuck()` | 是 |
| 查询 Boot 版本 | `printerBootLuck()` | 是 |
| 查询 SN | `printerSNLuck()` | 是 |
| 查询全部信息 | `getAllInfo()` | 是 |
| 查询固件版本 | `printerVersionLuck()` | 是 |
| 查询自动关机时间 | `getShutTimeLuck()` | 是 |
| 查询打印机状态 | `getPrinterStatus()` | 是 |
| 查询电量 | `getBatteryLuck()` | 是 |
| 查询浓度 | `getDensityLuck()` | 是 |
| 获取浓度档位 | `getDensityList()` | 是 |
| 设置浓度 | `setDensityLuck()` | 是 |
| 设置自动关机时间 | `setShutTimeLuck()` | 是 |
| WiFi 配网 | `sendWifiAccountPassword()` | 是 |
| 查询 WiFi 状态 | `getWifiState()` | 是 |
| 查询音量 | `getDeviceVolume()` | 是 |
| 设置音量 | `setDeviceVolume()` | 是 |
| 恢复出厂设置 | `resetDevice()` | 是 |
| 设置语言 | `setPrinterLanguage()` | 是 |
| 固件升级 | `updatePrinterLuck()` | 是 |

## 18. 常见问题

### Q1: 扫描不到 AI50？

- 检查蓝牙与定位权限是否已授予
- 确认 AI50 设备已开机且处于可被发现状态
- Android 11 及以下需开启系统定位服务

### Q2: WiFi 配网失败？

- 确认 WiFi 为 2.4 GHz 频段
- 核对 SSID 与密码
- 调用 `getWifiState()` 或监听 WiFi 状态推送
- 密码错误时返回 `WIFI_PRINTER_STATUS_PWD_ERROR`

### Q3: 能否同时连接多台设备？

SDK 使用单例 `PrinterHelper`，同时只能管理一条蓝牙连接。

## 19. ProGuard 规则

如果你使用 ProGuard 进行代码混淆，请在 `proguard-rules.pro` 中添加以下规则：

```proguard
-keep class com.luckprinter.sdk_new.** {*;}
-keep class com.clj.fastble.** {*;}
-keep class com.itpp.** {*;}
-keep class com.jniclass.** {*;}
```

## 20. 集成示例

```java
import android.bluetooth.BluetoothDevice;
import android.graphics.Bitmap;

import com.luckprinter.sdk_new.BtReceiver;
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;
import com.luckprinter.sdk_new.callback.OnPrintCallback;
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.device.PrinterHelper;
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;

public class Ai50IntegrationExample implements OnClientConnectionListener,
        OnReceiveDeviceStatusListener {

    private ClassicScanDeviceHelper scanHelper;

    public void init(Application app) {
        PrinterHelper.getInstance().init(app, "YOUR_APP_AS_KEY", false);
        PrinterHelper.getInstance().addConnectListener(this);
        PrinterHelper.getInstance().addDeviceStatusListener(this);
    }

    public void startScan(Context context) {
        scanHelper = new ClassicScanDeviceHelper(context);
        scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
            @Override
            public void foundDev(int type, String name, String mac) {
                // 更新 AI50 设备列表
            }

            @Override public void startDiscovery() { }
            @Override public void finishDiscovery() { }
        });
        scanHelper.init();
        scanHelper.startScanDevice();
    }

    public void connect(String name, String mac, int type) {
        PrinterHelper.getInstance().connectLuck(name, mac, type);
    }

    public void disconnect() {
        PrinterHelper.getInstance().disconnectLuck();
    }

    public void setupWifi(String ssid, String password) {
        if (!PrinterHelper.getInstance().isConnectedLuck()) {
            return;
        }
        PrinterHelper.getInstance().sendWifiAccountPassword(ssid, password, null);
    }

    public void printBitmap(Bitmap bitmap, int copies) {
        if (!PrinterHelper.getInstance().isConnectedLuck()) {
            return;
        }
        PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
            @Override public void onStartPrint() { }
            @Override public void onPrintSuccess() { }
            @Override public void onPrintFail(int status) { }
        });
    }

    @Override
    public void onLuckConnected(String name, String address) { }

    @Override
    public void onLuckDisConnected() { }

    @Override
    public void onDeviceStatus(int status) { }

    public void release() {
        if (scanHelper != null) {
            scanHelper.unInit();
        }
        PrinterHelper.getInstance().removeConnectListener(this);
        PrinterHelper.getInstance().removeDeviceStatusListener(this);
    }
}
```
