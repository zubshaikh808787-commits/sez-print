# Problems that affect every SDK

## Five languages, one screen

Each vendor prints differently.

- TD-404 wants TSC / TSPL (or ESC/POS or CPCL).
- JOSH wants LPAPI drawing calls.
- DEV, TEZ, and Label X each take a PNG through their own native method.

A label prepared for one driver cannot be handed to another. Choosing the wrong model on the home screen is a mismatch, not a shared error code. The job can connect and still print blank, shifted, or not at all.

## A reload is not a rebuild

These SDKs are native code inside the Android app. Saving a TypeScript file and reloading Metro does not add them.

If the module is missing, the user sees "module is not available" even though the JS on the phone is current. Fix: USB debugging, then `npx expo run:android`.

## iOS is not done

Vendor folders for TD-404 and GD985 include iOS material. The Expo modules (`josh-printer`, `td404-printer`, `tez-printer`, `dev-printer`, `labelx-printer`) all refuse to load when the phone is not Android. An iPhone build will not drive these printers until a separate native module is written for each SDK that has an iOS library.

## The server and the phone are not the same list

| Place | SDKs it knows |
|-------|----------------|
| Phone (`printer-models.ts`) | td404, josh, dev, tez, labelx |
| Server (`backend/sdks/registry.js`) | td404 only, and only Wi-Fi |

Calling the local API to connect JOSH, TEZ, DEV, or Label X cannot work. The server answers `SDK_NOT_FOUND` or, for TD-404 Bluetooth, `TRANSPORT_REQUIRES_NATIVE`.

## Permissions look like an empty scan

Classic Bluetooth discovery on Android needs scan and connect permission. Older versions also need location while scanning. Denied permission returns no devices. That is easy to blame on the SDK.

## Name matching is fuzzy

`supportedNames` in `src/constants/printer-models.ts` overlaps brands (TSC, POSTEK, NIIMBOT, POS-58, GD985). That helps the scan list find a printer. It also lets a printer bind to the wrong driver.

## What is already documented elsewhere

| File | Covers | Does not cover |
|------|--------|----------------|
| `backend/README.md` | TD-404 Wi-Fi API and the Bluetooth 501-style hint | JOSH, DEV, TEZ, Label X, phone errors |
| `backend/sdks/td404/ANALYSIS.md` | TD-404 transports and command sets | The other four SDKs |
| `backend/GD985-SDK/.../AI50_WiFi_Printer_Integration_en.md` | Label X Wi-Fi and OTA codes | How the Expo app actually connects (Bluetooth) |

## Practical order when something fails

1. Confirm the model on the home screen matches the printer in your hand.
2. Confirm the phone is Android and the app is a development build, not Expo Go.
3. If TEZ says the APK is stale, rebuild. Do not keep retrying connect.
4. If the scan list is empty, check Bluetooth permission before changing SDK code.
5. If you are calling `localhost:8787`, only TD-404 Wi-Fi on port 9100 is valid.
