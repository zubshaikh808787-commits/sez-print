# TD-404 / Ninestar Label Printer SDK — Analysis

Source package: `TD-404 SDK/APP SDK`  
Vendored under: `backend/sdks/td404/vendor/`

## What this SDK is

It is a **native mobile print SDK**, not a Node.js library.

| Platform | Artifact | Package |
|----------|----------|---------|
| Android | `labelprinter.aar` | `com.ninestar.printer.*` |
| iOS | Demo `TplSdkTest` + PDF docs | TPL SDK (vendor) |

Demo app: `NinestarPrinterDemo` (Android).

## Transports discovered (from AAR `classes.jar`)

| Class | Transport | Usable from Node? |
|-------|-----------|-------------------|
| `SppBluetoothPort` | Classic Bluetooth **SPP** | No — needs Android Bluetooth stack |
| `BleBluetoothPort` | Bluetooth **LE (GATT)** | No — needs Android BLE stack |
| `EthernetPort` | **Wi‑Fi / LAN TCP** (demo port **9100**) | **Yes** — Node `net.Socket` |
| `UsbPort` | USB OTG | No — device USB host |
| `SerialPortControl` / `SerialPortFinder` | Serial | Desktop/embedded only |

**Wi‑Fi is available** on this printer SDK: the Android demo builds:

```kotlin
PrinterDevices.Build()
  .setDeviceType(DeviceType.WIFI)
  .setIp(ip)
  .setPort(9100)
  .build()
```

Then `PrinterManager` selects `EthernetPort` and calls `openPort()`.

## Android Bluetooth flow (SPP)

1. Permissions: `BLUETOOTH`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, location (for discovery on older Android).
2. `BlueListActivity` starts classic discovery (`BluetoothAdapter.startDiscovery`).
3. Filters `DEVICE_TYPE_CLASSIC` devices (SPP-capable).
4. User picks device → returns `macAddress` + `bluetoothName`.
5. Connect:

```kotlin
PrinterDevices.Build()
  .setDeviceType(DeviceType.BLUETOOTH)
  .setBlueName(name)
  .setMacAddress(mac)
  .build()
printerManager.connectPrinter(device)  // → SppBluetoothPort.openPort()
```

6. Print: `LabelCommand` / `EscCommand` / `CpclCommand` → `byte[]` → `sendDataToPrinter(bytes, false)`.

**BLE:** `BleBluetoothPort` exists in the AAR (for printers that advertise LE). The demo UI only wires SPP discovery; BLE would use the same `PrinterDevices` builder with the BLE device type once documented in the vendor PDF.

## Android Wi‑Fi flow

1. Printer and phone on the same LAN (or printer soft-AP).
2. Enter printer IP; port **9100** (raw print socket — common for label printers).
3. `DeviceType.WIFI` → `EthernetPort`.
4. Same print APIs as Bluetooth after connect.

## iOS

Vendor docs: `vendor/docs/IOS Interface Documentation-EN.pdf`  
Demo project: `Print Label SDK-IOS/TplSdkTest`.

Expect CoreBluetooth for BLE and External Accessory / classic profiles depending on the printer firmware. **Wi‑Fi raw TCP 9100** works the same on iOS (`NWConnection` / `CFStream`) and does not require the AAR — the Node backend path mirrors that.

iOS **cannot** use the Android `.aar`. You must link the iOS SDK from the vendor package inside an Expo config plugin / native module (same pattern as Android).

## Command languages inside the AAR

- `LabelCommand` — TSC / TSPL-style label commands (`addSize`, `addGap`, `addBitmap`, `addPrint`) — used by `PrintContent.kt`
- `EscCommand` — ESC/POS
- `CpclCommand` — CPCL

## How Sez Print should integrate

```
┌─────────────────────┐     REST      ┌──────────────────────────────┐
│ Expo app (Android/  │ ────────────► │ backend/ (this Node service) │
│ iOS)                │               │  sdks/td404 → WiFi TCP :9100 │
│                     │               │  sdks/<future>               │
│ Native module wraps │               └──────────────────────────────┘
│ labelprinter.aar /  │
│ iOS TPL SDK for BT  │
└─────────────────────┘
```

- **Wi‑Fi printers:** app or backend can send raster/TSPL/ESC bytes to `ip:9100`.
- **Bluetooth printers:** app must use native SDK on-device; backend stores printer profiles and job history only.
- **Multiple printers / SDKs:** register more adapters in `sdks/registry.js`.

## Backend API (this folder)

See root `README.md` for `GET /api/sdks`, `POST /api/printers/connect`, `POST /api/printers/:id/print`, etc.
