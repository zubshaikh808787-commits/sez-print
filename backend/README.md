# Sez Print Backend

Node.js API for **multi-SDK label printer** orchestration.

## Quick start

```bash
cd backend
npm install
npm run dev   # frees port 8787 first, then starts with --watch
```

If you previously saw `Waiting for file changes before restarting…`, another process was holding **8787**. `npm run free-port` (or `npm run dev`) clears it automatically.
Health: `GET http://localhost:8787/health`

## SDK layout (add more printers here)

```
backend/sdks/
  registry.js          ← register adapters
  types.js             ← shared contract
  td404/               ← Ninestar TD-404
    index.js           ← Node WiFi adapter + native hints
    ANALYSIS.md        ← Bluetooth / WiFi / iOS findings
    vendor/
      android/labelprinter.aar
      android-demo/    ← PrinterManager, MainActivity, PrintContent
      docs/            ← Android + iOS PDF manuals
  <future-sdk>/        ← drop in another vendor the same way
```

## TD-404 findings (summary)

| Link | Supported by vendor SDK? | Works in this Node backend? |
|------|--------------------------|-----------------------------|
| Bluetooth SPP (classic) | Yes — `SppBluetoothPort` | No — must wrap AAR / iOS SDK in the Expo app |
| Bluetooth LE | Yes — `BleBluetoothPort` in AAR | No — native only |
| **Wi‑Fi / LAN** | Yes — `EthernetPort`, demo **port 9100** | **Yes** — TCP raw socket |
| USB | Yes — `UsbPort` | No — native only |

Commands inside AAR: **LabelCommand (TSC)**, **EscCommand (ESC/POS)**, **CpclCommand**.

Full write-up: [`sdks/td404/ANALYSIS.md`](./sdks/td404/ANALYSIS.md)

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sdks` | List registered SDKs |
| GET | `/api/sdks/td404` | TD-404 capabilities |
| GET | `/api/printers` | Connected sessions |
| POST | `/api/printers/connect` | Connect (`wifi` or request native BT hint) |
| DELETE | `/api/printers/:id` | Disconnect |
| POST | `/api/printers/:id/print` | Send raw/base64 bytes |
| POST | `/api/printers/:id/print-sample` | Send sample TSC label |

### Connect Wi‑Fi TD-404

```bash
curl -X POST http://localhost:8787/api/printers/connect ^
  -H "Content-Type: application/json" ^
  -d "{\"sdkId\":\"td404\",\"transport\":\"wifi\",\"ip\":\"192.168.1.50\",\"port\":9100,\"name\":\"Counter TD-404\"}"
```

### Print sample

```bash
curl -X POST http://localhost:8787/api/printers/<printerId>/print-sample ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Hello TD-404\",\"widthMm\":50,\"heightMm\":30}"
```

### Bluetooth connect (returns 501 + native hint)

```bash
curl -X POST http://localhost:8787/api/printers/connect ^
  -H "Content-Type: application/json" ^
  -d "{\"sdkId\":\"td404\",\"transport\":\"bluetooth-spp\",\"macAddress\":\"AA:BB:CC:DD:EE:FF\"}"
```

Use that hint to implement an Expo native module that loads `labelprinter.aar` (Android) / iOS TPL SDK.
