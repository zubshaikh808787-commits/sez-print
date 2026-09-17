# LuckPrinter Android SDK Integration Guide

## 1. Overview

LuckPrinter Android SDK is a Bluetooth thermal printer SDK that supports scanning, connecting, and printing to 230+ Bluetooth printer models. The SDK handles device discovery, connection management, image processing, print job dispatch, and firmware OTA updates internally.

**SDK package:** `com.luckprinter.sdk_new`
**Main entry point:** `com.luckprinter.sdk_new.device.PrinterHelper` (singleton)
**AAR files:**

| Region | AAR File |
|--------|----------|
| China | `libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar` |
| Overseas | `libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar` |

Choose one AAR based on your primary market region.

## 2. Quick Start

1. Copy the appropriate AAR file to your app's `libs/` directory
2. Add AAR and dependencies in `build.gradle`
3. Add required permissions to `AndroidManifest.xml`
4. Initialize the SDK in your `Application.onCreate()`
5. Register listeners, scan for devices, connect, and print

## 3. Environment Requirements

| Item | Requirement |
|------|-------------|
| Min SDK | Android 5.0 (API 21) |
| Target SDK | Android 15 (API 35) |
| Language | Java / Kotlin |
| Architecture | armeabi-v7a, arm64-v8a |
| Java Version | Java 8+ |

## 4. Dependencies

In your app module's `build.gradle`:

```gradle
dependencies {
    // Choose one AAR based on your region
    // For China market:
    implementation files('libs/LuckPrinterSdk_OtherCompanyChina_V1.3.8.aar')
    // For overseas market:
    implementation files('libs/LuckPrinterSdk_OtherCompanyAbroad_V1.3.8.aar')

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

Add the following permissions to `AndroidManifest.xml`:

```xml
<!-- Bluetooth and location permissions -->
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
    // Android 12+: request BLUETOOTH_CONNECT and BLUETOOTH_SCAN
    requestPermissions(new String[]{
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
    }, REQUEST_CODE);
} else {
    // Android 11 and below: request location permissions
    requestPermissions(new String[]{
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    }, REQUEST_CODE);
}
```

## 6. SDK Initialization

Initialize the SDK in your `Application` class:

```java
import com.luckprinter.sdk_new.device.PrinterHelper;

public class MyApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        String asKey = "YOUR_APP_AS_KEY"; // Contact LuckPrinter team to obtain your key
        PrinterHelper.getInstance().init(this, asKey, BuildConfig.DEBUG);
    }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | `Context` | Application context |
| `asKey` | `String` | Unique key assigned to your app. Without a valid key, printer connections will fail |
| `isDebug` | `boolean` | Enable SDK debug logging |

> **Important:** The `asKey` is required for printer authentication. An invalid or missing key will cause the printer to disconnect. Contact the LuckPrinter team to obtain your unique key.

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

// Register
PrinterHelper.getInstance().addConnectListener(connectionListener);

// Remove (e.g., in onDestroy)
PrinterHelper.getInstance().removeConnectListener(connectionListener);
```

### 7.2 Device Status Listener

Receives real-time device status change events (paper out, cover open, overheating, low battery, etc.):

```java
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;

OnReceiveDeviceStatusListener statusListener = status -> {
    switch (status) {
        case PrinterStatus.PRINTER_STATUS_OUTPAPER:
            // Paper out
            break;
        case PrinterStatus.PRINTER_STATUS_OPENCOVER:
            // Cover open
            break;
        case PrinterStatus.PRINTER_STATUS_OVERHEAT:
            // Overheating
            break;
        case PrinterStatus.PRINTER_STATUS_LOWVAL:
            // Low battery
            break;
        case PrinterStatus.PRINTER_STATUS_PRINTTING:
            // Already printing
            break;
        case PrinterStatus.PRINTER_STATUS_RECHARGE:
            // Charging
            break;
        case PrinterStatus.PRINTER_STATUS_NOT_LABEL:
            // Label not detected
            break;
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

OnEventListener eventListener = new OnEventListener() {
    @Override
    public void onLabelPaperError() {
        // Label paper placement error
        Toast.makeText(context, "Label paper placed incorrectly", Toast.LENGTH_SHORT).show();
    }
};

PrinterHelper.getInstance().addEventListener(eventListener);
PrinterHelper.getInstance().removeEventListener(eventListener);
```

## 8. Device Discovery

Use `ClassicScanDeviceHelper` to scan for available printers. The helper automatically filters and only returns supported printer devices.

```java
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;
import com.luckprinter.sdk_new.BtReceiver;

ClassicScanDeviceHelper scanHelper = new ClassicScanDeviceHelper(context);

scanHelper.setScanDeviceListener(new BtReceiver.Listener() {
    @Override
    public void foundDev(int type, String name, String mac) {
        // Found a printer: type = Bluetooth device type, name = Bluetooth name, mac = MAC address
        // Add to your device list UI
    }

    @Override
    public void startDiscovery() {
        // Scanning started - show loading indicator
    }

    @Override
    public void finishDiscovery() {
        // Scanning finished - hide loading indicator
    }
});

// Initialize (must call before startScanDevice)
scanHelper.init();

// Start scanning (automatically enables Bluetooth if disabled)
scanHelper.startScanDevice();

// Stop scanning
scanHelper.stopScanDevice();

// Cleanup (call in onDestroy)
scanHelper.unInit();
```

## 9. Connect / Disconnect

### 9.1 Connect

```java
import android.bluetooth.BluetoothDevice;

String printerName = "LuckP_L3_12345";
String printerMac = "AA:BB:CC:DD:EE:FF";

// bluetoothType: BluetoothDevice.DEVICE_TYPE_CLASSIC (Classic Bluetooth)
//                or BluetoothDevice.DEVICE_TYPE_LE (BLE)
boolean result = PrinterHelper.getInstance().connectLuck(printerName, printerMac,
        BluetoothDevice.DEVICE_TYPE_CLASSIC);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `String` | Printer Bluetooth name |
| `address` | `String` | Printer MAC address |
| `bluetoothType` | `int` | `BluetoothDevice.DEVICE_TYPE_CLASSIC` or `DEVICE_TYPE_LE` |

**Returns:** `true` if connection attempt was initiated, `false` otherwise.

Actual connection result is delivered via `OnClientConnectionListener.onLuckConnected()` or `onLuckDisConnected()`.

### 9.2 Disconnect

```java
PrinterHelper.getInstance().disconnectLuck();
```

### 9.3 Check Connection Status

```java
boolean isConnected = PrinterHelper.getInstance().isConnectedLuck();
```

## 10. Print Methods

All print methods internally check printer status before starting. If the printer reports an error (no paper, cover open, overheating, low battery), the `onPrintFail(int status)` callback is triggered with the corresponding error code.

### 10.1 Continuous Paper Printing

```java
import com.luckprinter.sdk_new.callback.OnPrintCallback;

Bitmap bitmap = ...; // Your image (should be dithered via OpenCV or similar)
int copies = 1;

PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onStartPrint() {
        // Print job started
    }

    @Override
    public void onPrintIndexStart(Bitmap bmp, int page, int total) {
        // Page `page` of `total` started printing
    }

    @Override
    public void onPrintIndexEnd(Bitmap bmp, int page, int total) {
        // Page `page` of `total` finished printing
    }

    @Override
    public void onPrintSuccess() {
        // All copies physically printed (paper fully fed out)
    }

    @Override
    public void onPrintFail(int status) {
        // Print failed with error code (see Error Codes section)
    }
});
```

**Overloads:**

```java
// Simple version (no grayscale)
void print(Bitmap bitmap, int printNum, OnPrintCallback onPrintCallback)

// Full version with grayscale support
void print(Bitmap bitmap, boolean isGray, int grayLevel, int printNum, OnPrintCallback onPrintCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `bitmap` | `Bitmap` | Image to print |
| `isGray` | `boolean` | Whether to use grayscale printing |
| `grayLevel` | `int` | Grayscale levels, e.g. 4, 8, or 16 |
| `printNum` | `int` | Number of copies |
| `onPrintCallback` | `OnPrintCallback` | Print callbacks |

**Print Once (single page of a multi-page job):**

```java
PrinterHelper.getInstance().printOnce(bitmap, printIndex, printNum, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Single page printed successfully
    }

    @Override
    public void onFail() {
        // Failed
    }
});

// With grayscale
PrinterHelper.getInstance().printOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.2 Label Paper Printing

```java
PrinterHelper.getInstance().printTag(bitmap, copies, new OnPrintCallback() {
    @Override
    public void onPrintSuccess() {
        // Label printing completed
    }

    @Override
    public void onPrintFail(int status) {
        // Failed
    }

    // ... other callbacks same as continuous paper
});

// With grayscale
PrinterHelper.getInstance().printTag(bitmap, isGray, grayLevel, copies, callback);
```

**Print Once:**

```java
PrinterHelper.getInstance().printTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.3 Circular Label Paper

```java
PrinterHelper.getInstance().printCircleTag(bitmap, copies, callback);
PrinterHelper.getInstance().printCircleTag(bitmap, isGray, grayLevel, copies, callback);

// Print Once
PrinterHelper.getInstance().printCircleTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printCircleTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.4 Black Mark Label Paper

```java
PrinterHelper.getInstance().printBlackTag(bitmap, copies, callback);
PrinterHelper.getInstance().printBlackTag(bitmap, isGray, grayLevel, copies, callback);

// Print Once
PrinterHelper.getInstance().printBlackTagOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printBlackTagOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.5 A4 Folder Paper

Only available on A4 printers (check with `isA4Printer()`):

```java
if (PrinterHelper.getInstance().isA4Printer()) {
    PrinterHelper.getInstance().printFolder(bitmap, copies, callback);
    PrinterHelper.getInstance().printFolder(bitmap, isGray, grayLevel, copies, callback);

    // Print Once
    PrinterHelper.getInstance().printFolderOnce(bitmap, printIndex, printNum, callback);
    PrinterHelper.getInstance().printFolderOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
}
```

**Set A4 paper size:**

```java
// Set custom A4 dimensions in millimeters
PrinterHelper.getInstance().setA4PaperSize(widthMM, heightMM);
```

### 10.6 Tattoo Paper

```java
PrinterHelper.getInstance().printTattoo(bitmap, copies, callback);
PrinterHelper.getInstance().printTattoo(bitmap, isGray, grayLevel, copies, callback);

// Print Once
PrinterHelper.getInstance().printTattooOnce(bitmap, printIndex, printNum, callback);
PrinterHelper.getInstance().printTattooOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.7 Water Transfer Paper

```java
PrinterHelper.getInstance().printWaterTransfer(bitmap, isGray, grayLevel, copies, callback);

// Print Once
PrinterHelper.getInstance().printWaterTransferOnce(bitmap, isGray, grayLevel, printIndex, printNum, callback);
```

### 10.8 Sheet Label (Deprecated)

```java
// Deprecated - use printTag instead
@Deprecated
PrinterHelper.getInstance().printSheetLabel(tagWidthMM, tagHeightMM, speed, density, bitmap, count);
```


## 11. Device Information Queries

### 12.1 Get Device Model

```java
PrinterHelper.getInstance().printerModelLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String model) {
        // e.g., "LuckP_L3"
    }
    @Override
    public void onFail() {}
});
```

### 12.2 Get Serial Number

```java
PrinterHelper.getInstance().printerSNLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String sn) {
        // Device serial number
    }
    @Override
    public void onFail() {}
});
```

### 12.3 Get Firmware Version

```java
PrinterHelper.getInstance().printerVersionLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String version) {
        // e.g., "V1.3.8"
    }
    @Override
    public void onFail() {}
});
```

### 12.4 Get Boot Version

```java
PrinterHelper.getInstance().printerBootLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String bootVersion) {
        // Boot version string
    }
    @Override
    public void onFail() {}
});
```

### 12.5 Get All Information

Batch query all device info at once:

```java
PrinterHelper.getInstance().getAllInfo(new OnPrinterInfoCallback() {
    @Override
    public void onStart() {
        // Query started
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
        // All info collected
    }
});
```

### 12.6 Get Printer Status

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

### 12.7 Get Battery Level

```java
PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer battery) {
        // Battery percentage (typically 0-100)
    }
    @Override
    public void onFail() {}
});
```

## 12. Device Settings

### 13.1 Print Density

```java
// Get current density
PrinterHelper.getInstance().getDensityLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer density) {
        // Current density value
    }
    @Override
    public void onFail() {}
});

// Set density
int densityValue = 8; // Value depends on printer model
PrinterHelper.getInstance().setDensityLuck(densityValue, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Density set successfully
    }
    @Override
    public void onFail() {
        // Failed to set density
    }
});
```

Available density values vary by printer model. Query `getDensityList()` for supported values:

```java
List<Integer> densities = PrinterHelper.getInstance().getDensityList();
Integer defaultDensity = PrinterHelper.getInstance().getDefaultDensity();
```

### 13.2 Print Speed

```java
// Get current speed
PrinterHelper.getInstance().getSpeed(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer speed) {
        // Current speed value
    }
    @Override
    public void onFail() {}
});

// Set speed
int speedValue = 4; // 0-8 range for most printers
PrinterHelper.getInstance().setSpeedLuck(speedValue, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Speed set successfully
    }
    @Override
    public void onFail() {
        // Failed to set speed
    }
});
```

Check if the printer supports speed setting:

```java
boolean supported = PrinterHelper.getInstance().isSupportSetSpeed();
List<Integer> speeds = PrinterHelper.getInstance().getSpeedList();
Integer defaultSpeed = PrinterHelper.getInstance().getDefaultSpeed();
```

### 13.3 Auto Shutdown Time

```java
// Get auto shutdown time
PrinterHelper.getInstance().getShutTimeLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer minutes) {
        // Auto shutdown time in minutes
    }
    @Override
    public void onFail() {}
});

// Set auto shutdown time (0 = never shutdown)
int minutes = 30;
PrinterHelper.getInstance().setShutTimeLuck(minutes, new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Shutdown time set successfully
    }
    @Override
    public void onFail() {}
});
```

### 13.4 Factory Reset

```java
PrinterHelper.getInstance().setRecoveryLuck(new ResultCallback<Integer>() {
    @Override
    public void onSuccess(Integer data) {
        // Factory reset completed
    }
    @Override
    public void onFail() {
        // Factory reset failed
    }
});
```

### 13.5 Query Printer Configuration

```java
PrinterHelper.getInstance().printerSettingLuck(new ResultCallback<String>() {
    @Override
    public void onSuccess(String md5) {
        // Configuration MD5 hash
    }
    @Override
    public void onFail() {}
});
```

## 13. Paper Feed

```java
// Feed paper forward by specified dots
int dots = 144;
PrinterHelper.getInstance().printLineDotsLuck(dots);

// Feed paper backward by specified dots
PrinterHelper.getInstance().printReverseLineDotsLuck(dots);
```

## 14. Firmware OTA Update

```java
import com.luckprinter.sdk_new.callback.UpdateListener;

File firmwareFile = new File("/path/to/firmware.bin");

PrinterHelper.getInstance().updatePrinterLuck(firmwareFile, new UpdateListener() {
    @Override
    public void onStart() {
        // Update started
    }

    @Override
    public void onProgress(int progress) {
        // Progress 0-100
        Log.d("OTA", "Update progress: " + progress + "%");
    }

    @Override
    public void onError() {
        // Update failed
    }

    @Override
    public void onComplete() {
        // Update completed successfully
    }
});
```

## 15. Error Codes

The SDK reports error codes via `OnPrintCallback.onPrintFail(int status)` and `OnReceiveDeviceStatusListener.onDeviceStatus(int status)`.

### 16.1 Print Error Codes

| Constant | Value | Description | Recommended Action |
|----------|-------|-------------|-------------------|
| `PRINTER_STATUS_OUTPAPER` | 0 | No paper / paper not properly loaded | Ask user to insert paper correctly |
| `PRINTER_STATUS_OPENCOVER` | 1 | Printer cover/lid is open | Ask user to close the printer cover |
| `PRINTER_STATUS_OVERHEAT` | 2 | Printer is overheating | Wait for the printer to cool down before retrying |
| `PRINTER_STATUS_LOWVAL` | 3 | Low battery level | Charge the printer or connect to power |
| `PRINTER_STATUS_PRINTTING` | 4 | Printer is already printing | Wait for current job to complete |
| `PRINTER_STATUS_RECHARGE` | 5 | Printer is currently charging | Wait or print while charging if supported |
| `PRINTER_STATUS_NOT_LABEL` | 6 | Label not detected (label printers) | Ask user to properly position the label |

A generic error code of `-1` indicates a non-specific print failure (e.g., connection lost during printing).

## 16. Status Monitoring

### 17.1 Real-time Status Push

Register `OnReceiveDeviceStatusListener` (see [Section 7.2](#72-device-status-listener)) to receive real-time status changes. The printer actively pushes status updates for:

- Paper out / paper loaded
- Cover open / cover closed
- Overheating / cooling down
- Low battery / battery charged
- Charging state changes

### 17.2 Label Paper Error

Register `OnEventListener` (see [Section 7.4](#74-event-listener)) to receive `onLabelPaperError()` when label paper is placed incorrectly.

## 17. FAQ

### Q1: Can the printer detect paper before printing?

**Yes.** Before every print command, the SDK internally calls `getStatusBeforePrint()`, which queries the printer status including paper detection (`PrinterStatusData.isLackPaper`). If paper is not loaded, the print command fails and `onPrintFail(int status)` is called with `PRINTER_STATUS_OUTPAPER = 0`.

You can also manually query status at any time:
```java
PrinterHelper.getInstance().getPrinterStatus(callback);
```

### Q2: Can the app be notified when paper is correctly loaded?

The SDK does not provide a dedicated "paper loaded" push notification. However, you can:
1. Register `OnReceiveDeviceStatusListener` to receive real-time device status change events.
2. Poll `getPrinterStatus()` and check `isLackPaper` field.

### Q3: Does `onPrintSuccess()` confirm physical printing is complete?

**Yes.** `OnPrintCallback.onPrintSuccess()` is invoked only when the printer has physically completed the entire print job (all pages printed and paper fully fed out). This is not merely a "data sent" notification.

### Q4: Can I get print progress (0-100%)?

The SDK provides **page-level progress** via `onPrintIndexStart(bitmap, page, num)` and `onPrintIndexEnd(bitmap, page, num)`, which report which page is being printed out of the total. It does not provide a continuous 0-100% percentage during a single page's print, but you can calculate progress based on the page index.

### Q5: What error codes can `onPrintFail()` return?

See the [Error Codes table (Section 15)](#15-error-codes) above for the complete list.

### Q6: Can I query battery level on demand?

**Yes.** `PrinterHelper.getInstance().getBatteryLuck(ResultCallback<Integer> callback)` returns the battery percentage.

### Q7: Does the printer push battery level changes automatically?

**No.** The SDK does not provide a dedicated battery push notification. For real-time battery monitoring, periodic polling via `getBatteryLuck()` is recommended.

### Q8: Can I update printer firmware over-the-air?

**Yes.** `PrinterHelper.getInstance().updatePrinterLuck(File file, UpdateListener listener)` supports OTA firmware updates. The `UpdateListener` provides `onStart()`, `onProgress(int progress)` (0-100), `onError()`, and `onComplete()` callbacks.

### Q9: Can I connect to multiple printers simultaneously?

**No.** The SDK uses a singleton `PrinterHelper` that manages one active printer connection at a time. Simultaneous multi-printer connections are not supported.

## 18. ProGuard Rules

If you use ProGuard for code obfuscation, add the following rules to your `proguard-rules.pro`:

```proguard
-keep class com.luckprinter.sdk_new.** {*;}
-keep class com.clj.fastble.** {*;}
-keep class com.itpp.** {*;}
-keep class com.jniclass.** {*;}
```

## 19. Complete Integration Example

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

        // 1. Request permissions
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
                Toast.makeText(this, "Permissions required for Bluetooth printer", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void onPermissionsGranted() {
        // 2. Register listeners
        registerListeners();

        // 3. Start device discovery
        startScan();
    }

    private void registerListeners() {
        // Connection listener
        PrinterHelper.getInstance().addConnectListener(new OnClientConnectionListener() {
            @Override
            public void onLuckConnected(String name, String address) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "Connected: " + name, Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onLuckDisConnected() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "Disconnected", Toast.LENGTH_SHORT).show()
                );
            }
        });

        // Device status listener
        PrinterHelper.getInstance().addDeviceStatusListener(new OnReceiveDeviceStatusListener() {
            @Override
            public void onDeviceStatus(int status) {
                runOnUiThread(() -> {
                    switch (status) {
                        case PrinterStatus.PRINTER_STATUS_OUTPAPER:
                            Toast.makeText(PrinterDemoActivity.this, "No paper", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_OPENCOVER:
                            Toast.makeText(PrinterDemoActivity.this, "Cover open", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_OVERHEAT:
                            Toast.makeText(PrinterDemoActivity.this, "Overheating", Toast.LENGTH_SHORT).show();
                            break;
                        case PrinterStatus.PRINTER_STATUS_LOWVAL:
                            Toast.makeText(PrinterDemoActivity.this, "Low battery", Toast.LENGTH_SHORT).show();
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
                    // Update your device list UI here
                });
            }

            @Override
            public void startDiscovery() {
                // Show scanning indicator
            }

            @Override
            public void finishDiscovery() {
                // Hide scanning indicator
            }
        });
        scanHelper.init();
        scanHelper.startScanDevice();

        // Auto-stop scanning after 10 seconds
        runOnUiThread(() -> scanHelper.stopScanDevice(), 10000);
    }

    /**
     * Call this when user selects a printer from the list
     */
    private void connectToPrinter(int index) {
        if (index < 0 || index >= deviceNames.size()) return;
        selectedIndex = index;

        String name = deviceNames.get(index);
        String mac = deviceMacs.get(index);

        PrinterHelper.getInstance().connectLuck(name, mac, BluetoothDevice.DEVICE_TYPE_CLASSIC);
    }

    /**
     * Print an image (call after connected)
     */
    private void printImage(Bitmap bitmap, int copies) {
        if (!PrinterHelper.getInstance().isConnectedLuck()) {
            Toast.makeText(this, "Not connected", Toast.LENGTH_SHORT).show();
            return;
        }

        PrinterHelper.getInstance().print(bitmap, copies, new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "Printing started", Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintIndexStart(Bitmap bmp, int page, int total) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "Printing page " + page + "/" + total, Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintSuccess() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this, "Print completed", Toast.LENGTH_SHORT).show()
                );
            }

            @Override
            public void onPrintFail(int status) {
                runOnUiThread(() -> {
                    String errorMsg = "Print failed: " + getErrorDescription(status);
                    Toast.makeText(PrinterDemoActivity.this, errorMsg, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    /**
     * Query battery level
     */
    private void queryBattery() {
        if (!PrinterHelper.getInstance().isConnectedLuck()) return;

        PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer battery) {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "Battery: " + battery + "%", Toast.LENGTH_SHORT).show()
                );
            }
            @Override
            public void onFail() {
                runOnUiThread(() ->
                    Toast.makeText(PrinterDemoActivity.this,
                        "Failed to get battery level", Toast.LENGTH_SHORT).show()
                );
            }
        });
    }

    private String getErrorDescription(int status) {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER: return "No paper";
            case PrinterStatus.PRINTER_STATUS_OPENCOVER: return "Cover open";
            case PrinterStatus.PRINTER_STATUS_OVERHEAT: return "Overheating";
            case PrinterStatus.PRINTER_STATUS_LOWVAL: return "Low battery";
            case PrinterStatus.PRINTER_STATUS_PRINTTING: return "Already printing";
            case PrinterStatus.PRINTER_STATUS_RECHARGE: return "Charging";
            case PrinterStatus.PRINTER_STATUS_NOT_LABEL: return "Label not detected";
            default: return "Unknown error (" + status + ")";
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanHelper != null) {
            scanHelper.unInit();
            scanHelper = null;
        }
        // Disconnect when leaving
        if (PrinterHelper.getInstance().isConnectedLuck()) {
            PrinterHelper.getInstance().disconnectLuck();
        }
    }
}
```
