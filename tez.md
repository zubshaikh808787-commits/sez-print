# PrintSDK (Y50 / Tez / Shakti) Integration Document
*(Translated and Structured from Official Vendor Specification `PrintSDK 接入文档`)*

---

## 1. SDK Integration Steps

### Step 1: Configure Maven Repository
Add the vendor Maven repository to your root `settings.gradle` / `build.gradle`:
```groovy
repositories {
    maven {
        url 'https://gitee.com/it_space/bluetooth-sdk/raw/master'
    }
}
```

### Step 2: Add Dependency in `app/build.gradle`
```groovy
dependencies {
    implementation 'com.yx.print:PrintSDK:68'
    // Or when using local AAR archive:
    // implementation files('libs/PrintSDK-68.aar')
}
```

### Step 3: Initialize SDK in Application
Initialize the SDK in your `Application.onCreate()`:
```java
// Using PrinterUtil:
PrinterUtil.openSDK(context, "key");

// Or using SDKUtils directly:
SDKUtils.init(context, "key");
```

---

## 2. Android Manifest Permissions

Add the following Bluetooth and Location permissions in `AndroidManifest.xml`:

```xml
<!-- Legacy Bluetooth Permissions (Android <= 11) -->
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_LOCATION_EXTRA_COMMANDS" />

<!-- Modern Bluetooth Runtime Permissions (Android 12+) -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

---

## 3. Bluetooth Scanning & Device Discovery

You can either use the SDK's built-in `ScannerBase` interface or implement your own Bluetooth scanning logic and construct the `DeviceItem` entity.

### Option A: Using SDK `ScannerBase`
```java
ScannerBase scanner = PrinterManage.getInstance().getScanner(PrinterConstantPool.SocketType.SPP);

scanner.startScan(new ScanListener() {
    @Override
    public void onStart() {
        Log.i("PrintSDK", "Bluetooth discovery started");
    }

    @Override
    public void onFound(DeviceItem deviceItem) {
        String name = deviceItem.getName();
        String mac = deviceItem.getAddress();
        String modelKey = deviceItem.getModelKey();
        Log.i("PrintSDK", "Found device: " + name + " (" + mac + "), modelKey=" + modelKey);
    }

    @Override
    public void onFinished() {
        Log.i("PrintSDK", "Bluetooth discovery finished");
    }

    @Override
    public void onFailed(String msg) {
        Log.e("PrintSDK", "Bluetooth discovery failed: " + msg);
    }
});
```

### Option B: Custom Scan Logic
If using system scanning or paired devices, create the `DeviceItem` directly:
```java
DeviceItem item = DeviceItem.build(macAddress);
// Or manually initialize fields if DeviceItem.build() filters out OEM names:
DeviceItem item = new DeviceItem();
item.setAddress(macAddress);
item.setName(deviceName);
item.setBlueDevice(bluetoothDevice);
item.setModelKey("Y50"); // Specify modelKey explicitly
```

---

## 4. Initialization Before Connection

> [!IMPORTANT]
> Always obtain the `Printer` instance and attach the `ConnectListener` **before** initiating connection.

```java
// 1. Get Printer instance for Bluetooth SPP (Serial Port Profile)
Printer printer = PrinterManage.getInstance().getPrinter(PrinterConstantPool.SocketType.SPP);

// 2. Set ConnectListener
// NOTE: Method names have vendor OEM typos (onConneted, onConnetFailed). Keep them as-is!
printer.setListener(new ConnectListener() {
    @Override
    public void onConneted() {
        Log.i("PrintSDK", "Printer connected successfully!");
    }

    @Override
    public void onConnetFailed(String msg) {
        Log.e("PrintSDK", "Printer connection failed: " + msg);
    }

    @Override
    public void closed() {
        Log.i("PrintSDK", "Printer connection closed");
    }
});

// 3. Set modelKey on DeviceItem
// If the device name is not in the SDK's automatic whitelist, manually set modelKey:
deviceItem.modelKey = "Y50"; // or "Z212", "GE920", "380", etc.
```

---

## 5. Connect and Disconnect

```java
// Connect to printer
printer.connect(deviceItem);

// Disconnect from printer
printer.disconnect();
```

---

## 6. Sending Commands & Querying Status

All hardware queries, settings, and calibration operations are queued through `printer.addTask(...)` with `TaskCallback`.

```java
printer.addTask(Command.get_status(), "status_task", true, new TaskCallback() {
    @Override
    public void sendStatus(TaskCallBean bean) {
        // Fired when the command packet is transmitted
        Log.d("PrintSDK", "Command sent ACK: " + bean.getMsg());
    }

    @Override
    public void readCall(TaskCallBean bean) {
        // Fired when the printer returns the response packet
        if (bean.getStatus() == PrinterConstantPool.Status.OK) {
            byte[] data = bean.getData();
            Log.i("PrintSDK", "Command success, data length: " + (data != null ? data.length : 0));
        } else {
            Log.e("PrintSDK", "Command failed: status=" + bean.getStatus() + ", msg=" + bean.getMsg());
        }
    }
});
```

### Available `Command` Factories

| Command Method | Purpose | Notes / Parameters |
|---|---|---|
| `Command.get_status()` | Query printer status bitmask | Returns status byte (see Section 7) |
| `Command.get_deviceName()` | Query printer device name | |
| `Command.get_SN()` | Query printer serial number | |
| `Command.get_version()` | Query firmware version | |
| `Command.get_battervol()` | Query battery voltage / level | |
| `Command.get_paperType()` | Query current paper sensor mode | |
| `Command.set_paperType(int type)` | Set paper sensor type | `0`=GAP, `1`=CONTINUOUS, `2`=BLACK, `3`=TATTOO |
| `Command.get_DENSITY()` | Query current print density | |
| `Command.set_Density(int density)` | Set print darkness / density | Range `0` to `15` |
| `Command.get_SPEED()` | Query current print speed | |
| `Command.set_Speed(float speed)` | Set print feed speed | Range `1.0` to `8.0` |
| `Command.calibration()` | Sensor light intensity calibration | Calibrates optical sensor threshold |
| `Command.LEARN_LABEL()` | Paper length auto-learning | Feeds and learns label height |
| `Command.print_SELFTEST()` | Print factory test label | Useful for verifying hardware |
| `Command.fixedPoint()` | Advance and align to gap / mark | |
| `Command.backoffPaper()` | Rewind paper to print start line | |
| `Command.forwardPaper()` | Feed paper to tear-off position | |

---

## 7. Status Bitmask Interpretation (`Command.get_status()`)

When calling `Command.get_status()`, byte 0 of `TaskCallBean.getData()` contains the status bitmask:

| Bitmask Flag | Hex Value | Decimal | Description |
|---|---|---|---|
| **IDLE / READY** | `0x00` | `0` | Normal idle state, ready for print jobs |
| **PRINTING** | `0x01` | `1` | Printer is currently active / printing |
| **COVER_OPEN** | `0x02` | `2` | Printer lid / cover is open |
| **NO_PAPER** | `0x04` | `4` | Out of paper or paper feed error |
| **LOW_BATTERY** | `0x08` | `8` | Battery level is too low to print |
| **OVERHEAT** | `0x10` | `16` | Print head temperature is too high |

---

## 8. Bitmap Printing Pipeline (`PrintImgHelper`)

The SDK uses `PrintImgHelper` and `PrintBuild` for raster bitmap printing:

```java
PrintImgHelper helper = printer.getHelper();

// 1. Register image data with dither threshold (1-254, default 128)
String imageName = "label_" + System.currentTimeMillis();
helper.setImgData(128, new ImgData(imageName, bitmap));

// 2. Build chained print sequence
PrintImgHelper.PrintBuild build = helper.build(new TaskCallback() {
    @Override
    public void sendStatus(TaskCallBean bean) {
        Log.d("PrintSDK", "Image sent ACK: " + bean.getMsg());
    }

    @Override
    public void readCall(TaskCallBean bean) {
        Log.i("PrintSDK", "Print job finished: status=" + bean.getStatus());
    }
});

build.cls();                                 // Clear page buffer
build.enable();                              // Enable print mode
build.CreatePage(widthMm, heightMm);         // Set label dimensions in mm
build.paperType(paperType);                  // Set paper type (0=gap, 1=continuous, 2=black, 3=tattoo)
build.density(density);                      // Set darkness (0-15)
build.speed(speed);                          // Set speed (1.0-8.0)
build.printImg(imageName, copies);           // Print image with copy count
build.disenable();                           // Disable print mode

// 3. Execute print build
helper.run(build);
```

---

## 9. Key Integration Gotchas & Recommendations

1. **Vendor Whitelist Bypassing**:
   * `DeviceItem.build(mac)` internally verifies if the Bluetooth name matches hardcoded prefixes. If your printer broadcasts as `Seznik_Tej`, `DeviceItem.build()` returns `null`. 
   * **Solution**: Manually instantiate `DeviceItem`, set `.setAddress(mac)`, `.setName(name)`, and explicitly set `.setModelKey("Y50")`.

2. **ModelKey Matching**:
   * Always provide the correct `modelKey` (`"Y50"` or `"Z212"`). If omitted or incorrect, command packets will be rejected by the printer firmware without error.

3. **Sensor Calibration Sequence**:
   * Run `Command.set_paperType(...)` **before** calling `Command.calibration()` or `Command.LEARN_LABEL()`.
   * Wait for the printer to return to `IDLE (0x00)` state between commands.
