# AI50 Printer Android SDK Integration Guide

## 1. Overview

AI50 is a WiFi-enabled smart thermal printer supported by the LuckPrinter SDK. Your app communicates with the device over Bluetooth to perform continuous paper printing, WiFi provisioning, device information queries, parameter configuration, and firmware OTA updates.

**SDK package:** `com.luckprinter.sdk_new`  
**Main entry point:** `com.luckprinter.sdk_new.device.PrinterHelper` (singleton)

| Region | AAR File |
|--------|----------|
| China | `libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar` |
| Overseas | `libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` |

Choose one AAR based on your target market.

## 2. Quick Start

1. Copy the AAR file to your app's `libs/` directory and configure Gradle dependencies
2. Add required permissions to `AndroidManifest.xml`
3. Initialize the SDK in `Application.onCreate()`
4. Register listeners
5. Scan for AI50 devices and connect
6. Call print, WiFi provisioning, or device management APIs

## 3. Environment Requirements

| Item | Requirement |
|------|-------------|
| Min SDK | Android 5.0 (API 21) |
| Target SDK | Android 15 (API 35) |
| Language | Java / Kotlin |
| Architecture | armeabi-v7a, arm64-v8a |
| Java Version | Java 8+ |
| WiFi Network | 2.4 GHz only (5 GHz not supported) |

## 4. Dependencies

In your app module's `build.gradle`:

```gradle
dependencies {
    // Choose one AAR based on your region
    implementation files('libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar')
    // implementation files('libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar')

    // Network library (required for SDK)
    implementation 'com.squareup.okhttp3:okhttp:4.10.0'
}
```

### 4.1 FastBle Dependency (Optional)

Whether to include FastBle depends on how the printer communicates with your app. Refer to the device documentation provided by LuckPrinter. For devices that use **BLE communication**:

1. Add the FastBle dependency
2. Call `PrinterHelper.getInstance().setEnableBle(true)` during initialization

```gradle
dependencies {
    implementation 'com.github.Jasonchenlijian:FastBle:2.4.0'
}
```

**Do not call `setEnableBle(true)` if FastBle is not included.**

When using FastBle, include the JitPack repository in your project-level `settings.gradle`:

```gradle
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url "https://jitpack.io" }
    }
}
```

## 5. Permissions

Add the following to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH"/>
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN"/>
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
```

**Permission request logic:**

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

For WiFi provisioning, the printer connects to the router on its own. Your app sends the SSID and password over Bluetooth. No WiFi-related permissions are required in the app.

## 6. SDK Initialization

Initialize the SDK in your `Application` class:

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

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `Context` | Application context |
| `asKey` | `String` | App authentication key. A missing or invalid key will cause connection failures |
| `isDebug` | `boolean` | Enable SDK debug logging |

> **Important:** Contact the LuckPrinter team to obtain your production `asKey`.

## 7. Listener Registration

### 7.1 Connection Listener

```java
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;

OnClientConnectionListener connectionListener = new OnClientConnectionListener() {
    @Override
    public void onLuckConnected(String name, String address) {
        // Connected: name = printer Bluetooth name, address = MAC address
    }

    @Override
    public void onLuckDisConnected() {
        // Disconnected
    }
};

PrinterHelper.getInstance().addConnectListener(connectionListener);
PrinterHelper.getInstance().removeConnectListener(connectionListener);
```

### 7.2 Device Status Listener

AI50 pushes print status and WiFi provisioning status through this listener:

```java
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.PrinterStatus;

OnReceiveDeviceStatusListener statusListener = status -> {
    if (status >= PrinterStatus.WIFI_PRINTER_STATUS_CONNECTING
            && status <= PrinterStatus.WIFI_PRINTER_STATUS_NOT_CONNECTED) {
        // WiFi status — see Section 14
    } else {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER:   break; // Paper out
            case PrinterStatus.PRINTER_STATUS_OPENCOVER:  break; // Cover open
            case PrinterStatus.PRINTER_STATUS_OVERHEAT:   break; // Overheating
            case PrinterStatus.PRINTER_STATUS_LOWVAL:     break; // Low battery
            case PrinterStatus.PRINTER_STATUS_PRINTTING:  break; // Printing
            case PrinterStatus.PRINTER_STATUS_RECHARGE:   break; // Charging
        }
    }
};

PrinterHelper.getInstance().addDeviceStatusListener(statusListener);
PrinterHelper.getInstance().removeDeviceStatusListener(statusListener);
```

### 7.3 Device Forbidden Listener

Triggered when the device is forbidden by the platform:

```java
import com.luckprinter.sdk_new.callback.DeviceForbiddenListener;

DeviceForbiddenListener forbiddenListener = () -> {
    // Device has been forbidden
    PrinterUtil.showToast("Device is forbidden");
};

PrinterHelper.getInstance().addDeviceForbiddenListener(forbiddenListener);
PrinterHelper.getInstance().removeDeviceForbiddenListener(forbiddenListener);
```

### 7.4 Event Listener

```java
import com.luckprinter.sdk_new.callback.OnEventListener;

PrinterHelper.getInstance().addEventListener(new OnEventListener() {
    @Override
    public void onLabelPaperError() { }
});
```

## 8. Device Discovery

Use `ClassicScanDeviceHelper` to scan for available printers:

```java
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;
import com.luckprinter.sdk_new.BtReceiver;

ClassicScanDeviceHelper scanHelper = new ClassicScanDeviceHelper(context);

scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
    @Override
    public void foundDev(int type, String name, String mac) {
        // Found a printer: type = Bluetooth device type, name = Bluetooth name, mac = MAC address
        // Add AI50 printers to your device list
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

On Android 11 and below, system location services must be enabled; otherwise devices may not be discovered.

## 9. Connect / Disconnect

### 9.1 Connect

```java
import android.bluetooth.BluetoothDevice;

boolean result = PrinterHelper.getInstance().connectLuck(name, mac, type);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `String` | Printer Bluetooth name |
| `address` | `String` | Printer MAC address |
| `bluetoothType` | `int` | Device type returned by the `foundDev` scan callback |

Connection results are delivered asynchronously via `OnClientConnectionListener`. When switching devices, the SDK disconnects the current printer before establishing a new connection.

### 9.2 Disconnect

```java
PrinterHelper.getInstance().disconnectLuck();
```

### 9.3 Check Connection Status

```java
boolean isConnected = PrinterHelper.getInstance().isConnectedLuck();
```

Ensure `isConnectedLuck()` returns `true` before calling print, WiFi provisioning, or other device APIs.

## 10. Continuous Paper Printing

All print methods check printer status before printing. If the printer reports an error (paper out, cover open, overheating, low battery), `onPrintFail(int status)` is invoked with the corresponding error code.

### 10.1 Start Printing

```java
import com.luckprinter.sdk_new.callback.OnPrintCallback;

Bitmap bitmap = ...; // Your image
int copies = 1;

PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onStartPrint() { }

    @Override
    public void onPrinting(int page, int num) {
        // Copy `page` of `num` total copies
    }

    @Override
    public void onPrintSuccess() { }

    @Override
    public void onPrintFail(int status) { }
});
```

**Method signature:**

```java
void print(Bitmap bitmap, int printNum, OnPrintCallback onPrintCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `bitmap` | `Bitmap` | Image to print |
| `printNum` | `int` | Number of copies |
| `onPrintCallback` | `OnPrintCallback` | Print callback |

### 10.2 Scale to Print Width (Optional)

```java
int printWidth = PrinterHelper.getInstance().getPrintWidth();

int widthMM = 48;
int requireWidth = (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) * widthMM;
printWidth = Math.min(printWidth, requireWidth);

float scale = printWidth * 1.0f / bitmap.getWidth();
int printHeight = (int) (scale * bitmap.getHeight());
Bitmap resized = Bitmap.createScaledBitmap(bitmap, printWidth, printHeight, true);
```

## 11. Device Information

### 11.1 Individual Queries

```java
PrinterHelper.getInstance().printerModelLuck(callback);     // Model
PrinterHelper.getInstance().printerSNLuck(callback);        // Serial number
PrinterHelper.getInstance().printerVersionLuck(callback);   // Firmware version
PrinterHelper.getInstance().printerBootLuck(callback);      // Boot version
PrinterHelper.getInstance().getShutTimeLuck(callback);      // Auto power-off time (minutes)
PrinterHelper.getInstance().getPrinterStatus(callback);     // Printer status
PrinterHelper.getInstance().getBatteryLuck(callback);       // Battery level (0–100)
PrinterHelper.getInstance().getDensityLuck(callback);       // Print density
```

### 11.2 Batch Query

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

### 11.3 Printer Status

`getPrinterStatus()` returns `PrinterStatusData` with the following key fields:

| Field | Meaning |
|-------|---------|
| `isPrinting` | Whether printing is in progress |
| `isOpen` | Whether the cover is open |
| `isLackPaper` | Whether paper is out |
| `isLackElec` | Whether battery is low |
| `isOverheat` | Whether the printer is overheating |
| `isRecharge` | Whether the printer is charging |

## 12. Device Settings

### 12.1 Print Density

```java
List<Integer> densityList = PrinterHelper.getInstance().getDensityList();

PrinterHelper.getInstance().getDensityLuck(callback);
PrinterHelper.getInstance().setDensityLuck(value, callback);
```

The `value` passed to `setDensityLuck()` must be one of the values returned by `getDensityList()`.

### 12.2 Auto Power-Off Time

```java
PrinterHelper.getInstance().getShutTimeLuck(callback);

// 0 means auto power-off is disabled
PrinterHelper.getInstance().setShutTimeLuck(minutes, callback);
```

### 12.3 Device Volume

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

### 12.4 Printer Language

Sets the language displayed on the printer UI. The `language` parameter must be an **internationalization language code** (Language Code, e.g. ISO 639-1), not a language display name.

**Common examples:**

| Language | Code |
|----------|------|
| English | `en` |
| Chinese | `zh` |

Supported codes depend on the printer firmware.

```java
import com.luckprinter.sdk_new.callback.ResultCallback;

String language = "zh"; // Internationalization language code, e.g. en, zh

PrinterHelper.getInstance().setPrinterLanguage(language, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Setting succeeded
    }

    @Override
    public void onFail() {
        // Setting failed
    }
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | `String` | Internationalization language code, e.g. `en`, `zh` |
| `callback` | `ResultCallback<Integer>` | Result callback |

### 12.5 Factory Reset

```java
PrinterHelper.getInstance().resetDevice();
```

> Factory reset is irreversible. All device parameters are restored to default values.

## 13. WiFi Provisioning

The printer receives WiFi credentials over Bluetooth and connects to the router on its own. **Only 2.4 GHz WiFi is supported.**

### 13.1 Send Credentials

```java
PrinterHelper.getInstance().sendWifiAccountPassword(ssid, password,
        new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Command sent successfully; query WiFi status for the connection result
    }

    @Override
    public void onFail() { }
});
```

### 13.2 Recommended Flow

1. Establish a Bluetooth connection
2. User enters the SSID and password for a 2.4 GHz WiFi network
3. Call `sendWifiAccountPassword()`
4. Confirm the result via `getWifiState()` or the status listener

## 14. WiFi Status

### 14.1 Active Query

```java
PrinterHelper.getInstance().getWifiState(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer status) { }

    @Override
    public void onFail() { }
});
```

### 14.2 Status Codes

| Constant | Value | Description |
|----------|-------|-------------|
| `WIFI_PRINTER_STATUS_CONNECTING` | 100 | Connecting |
| `WIFI_PRINTER_STATUS_CONNECTED` | 101 | Connected |
| `WIFI_PRINTER_STATUS_PWD_ERROR` | 102 | Incorrect password |
| `WIFI_PRINTER_STATUS_DISCONNECT` | 103 | Disconnected |
| `WIFI_PRINTER_STATUS_NOT_CONNECTED` | 104 | Not connected |

These statuses can also be pushed via `OnReceiveDeviceStatusListener`.

## 15. Firmware OTA Update

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

Supports `.BIN` and `.PRTU` formats. Keep the Bluetooth connection active during the update.

## 16. Error Codes

### 16.1 Print / Hardware Status

| Constant | Value | Description |
|----------|-------|-------------|
| `PRINTER_STATUS_OUTPAPER` | 0 | Paper out |
| `PRINTER_STATUS_OPENCOVER` | 1 | Cover open |
| `PRINTER_STATUS_OVERHEAT` | 2 | Overheating |
| `PRINTER_STATUS_LOWVAL` | 3 | Low battery |
| `PRINTER_STATUS_PRINTTING` | 4 | Printing |
| `PRINTER_STATUS_RECHARGE` | 5 | Charging |

### 16.2 WiFi Status

See [Section 14.2](#142-status-codes).

## 17. API Reference

| Feature | API | Connection Required |
|---------|-----|---------------------|
| Scan devices | `ClassicScanDeviceHelper.startScanDevice()` | No |
| Connect | `connectLuck()` | — |
| Disconnect Bluetooth | `disconnectLuck()` | Yes |
| Check connection | `isConnectedLuck()` | — |
| Continuous paper print | `print()` | Yes |
| Get print width | `getPrintWidth()` | Yes |
| Check 304 DPI | `is304Dpi()` | Yes |
| Query model | `printerModelLuck()` | Yes |
| Query Boot version | `printerBootLuck()` | Yes |
| Query SN | `printerSNLuck()` | Yes |
| Query all info | `getAllInfo()` | Yes |
| Query firmware version | `printerVersionLuck()` | Yes |
| Query auto power-off time | `getShutTimeLuck()` | Yes |
| Query printer status | `getPrinterStatus()` | Yes |
| Query battery | `getBatteryLuck()` | Yes |
| Query density | `getDensityLuck()` | Yes |
| Get density levels | `getDensityList()` | Yes |
| Set density | `setDensityLuck()` | Yes |
| Set auto power-off time | `setShutTimeLuck()` | Yes |
| WiFi provisioning | `sendWifiAccountPassword()` | Yes |
| Query WiFi status | `getWifiState()` | Yes |
| Query volume | `getDeviceVolume()` | Yes |
| Set volume | `setDeviceVolume()` | Yes |
| Factory reset | `resetDevice()` | Yes |
| Set language | `setPrinterLanguage()` | Yes |
| Firmware update | `updatePrinterLuck()` | Yes |

## 18. FAQ

### Q1: Cannot discover AI50?

- Verify Bluetooth and location permissions are granted
- Ensure the AI50 device is powered on and discoverable
- On Android 11 and below, enable system location services

### Q2: WiFi provisioning failed?

- Confirm the WiFi network is 2.4 GHz
- Verify the SSID and password
- Call `getWifiState()` or listen for WiFi status updates
- An incorrect password returns `WIFI_PRINTER_STATUS_PWD_ERROR`

### Q3: Can I connect to multiple devices at once?

The SDK uses a singleton `PrinterHelper` and manages only one active Bluetooth connection at a time.

## 19. ProGuard Rules

If you use ProGuard for code obfuscation, add the following to `proguard-rules.pro`:

```proguard
-keep class com.luckprinter.sdk_new.** {*;}
-keep class com.clj.fastble.** {*;}
-keep class com.itpp.** {*;}
-keep class com.jniclass.** {*;}
```

## 20. Integration Example

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
                // Update AI50 device list
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
