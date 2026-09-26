# Sez Print — printer SDK report

Plain-language notes on the printer SDKs in this project: what each one is, what works, what does not, and the errors you will actually see.

This is not a vendor manual. It describes how these SDKs are used inside Sez Print.

## Read this first

| File | What it covers |
|------|----------------|
| [01-how-printing-is-wired.md](./01-how-printing-is-wired.md) | Which model uses which SDK, and where the code lives |
| [02-errors-you-will-see.md](./02-errors-you-will-see.md) | Real failures the app and the server raise |
| [03-each-sdk.md](./03-each-sdk.md) | Good and bad points for TD-404, JOSH, DEV, TEZ, and Label X |
| [04-problems-across-all-sdks.md](./04-problems-across-all-sdks.md) | Issues that are not tied to one vendor |
| [05-deep-good-and-bad.md](./05-deep-good-and-bad.md) | Deeper good and bad points, from how each SDK is actually called |

## Short version

The phone app has **five Android printer drivers**. They do not share one print language. Picking the wrong model sends the job to the wrong SDK.

The small Node server in `backend/` only knows **TD-404 over Wi-Fi** (port 9100). It cannot do Bluetooth.

**iOS is not implemented** for these modules, even where the vendor folder includes an iOS demo.

**Expo Go cannot load these SDKs.** The phone needs a development build (`npx expo run:android`) made after the native module was added. Otherwise the app says the module is not available.
