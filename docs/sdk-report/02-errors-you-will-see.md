# Errors you will actually see

These are failures the project code is written to raise. They are not a guess about the printer hardware.

## The native driver is not inside the installed app

Expo Go cannot load these printer SDKs. A normal Metro reload also cannot add them. The APK on the phone must be rebuilt after the module was added (`npx expo run:android`).

If it was not rebuilt, connect or print fails with one of these:

| Driver | Message |
|--------|---------|
| JOSH | `JOSH Bluetooth module is not available.` |
| JOSH print | `JOSH printPngLabel is not available on this platform.` |
| JOSH test text | `JOSH printTestText is not available on this platform.` |
| TD-404 | `TD-404 Bluetooth module is not available.` |
| TEZ | `Tez printer module not available` |
| TEZ, old APK | `Install a new development build to connect Seznik. Plug the phone in over USB and run: npx expo run:android` |
| TEZ, not linked | `Native module 'TezPrinter' is not compiled into the APK (...). Rebuild is required after adding native modules.` |
| TEZ, not Android | `Tez/Shakti SDK is only supported on Android` |
| Label X | `Label X printer module not available` |
| DEV | `Dev printer module not available` |

TEZ is the only driver that checks the APK revision (`tez-connect-v3`) and refuses an old build on purpose. The others just say the module is missing.

## Nothing is connected

Printing before a successful connect:

| Driver | Message |
|--------|---------|
| JOSH | `No JOSH printer connected.` |
| TD-404 | `No TD-404 printer connected.` |

The other drivers fail the same way: they check the native module, then check that a device is connected, before sending bytes.

## Asking the PC server to do Bluetooth

`POST /api/printers/connect` with a Bluetooth transport does not open Bluetooth. The server answers with code `TRANSPORT_REQUIRES_NATIVE` and explains that Bluetooth, USB, and serial must run on the phone.

Only this works on the server:

- `sdkId`: `td404`
- `transport`: `wifi`
- `ip`: the printer's address
- `port`: `9100` if you omit it

## Wi-Fi TD-404 never answers

| Situation | Message |
|-----------|---------|
| No IP address | `WiFi connect requires opts.ip` |
| Printer does not accept the socket within 5 seconds | `WiFi connect timeout <ip>:<port>` |
| Print body is not text, base64, or bytes | `Unsupported print payload` |
| SDK id is not `td404` | `Unknown SDK "..."` with code `SDK_NOT_FOUND` |

## Vendor errors that live in the SDK docs, not in our messages

Label X / GD985 (LuckPrinter) documents these. The app does not translate them into its own sentences yet.

| What you see | Meaning |
|--------------|---------|
| `kLuckPrinterDidNotSupportNoticeName` | The SDK saw a device it does not support |
| `LJError_Unknown` (`-1`) | Unknown error |
| `LJOTA_PROTOCOL_PARSE_ERROR` (`90004`) | Firmware update packet could not be read |
| `LJOTA_NONSUPPORT_SAFEUPDATE_ERROR` (`90008`) | This printer does not support that secure update |

## Bluetooth looks like "no printers"

On Android, discovery needs Bluetooth scan and connect permission. Older Android versions also need location permission for a scan. If those are denied, the list stays empty. That is a permission failure, not a broken SDK.
