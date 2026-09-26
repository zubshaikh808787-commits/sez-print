# How printing is wired

The editor draws the label. Printing is a separate step. The app looks at the printer model you chose, then calls that model's native Android module. The module talks to the vendor SDK, which talks to the printer over Bluetooth.

The PC server is a second, smaller path. It only prints to a TD-404 that is on the same network.

## Models in the app

Defined in `src/constants/printer-models.ts`.

| Name on screen | Driver id | Vendor SDK | Connection the app uses | Typical resolution |
|----------------|-----------|------------|-------------------------|--------------------|
| SEZNIK TEJAS / RUDRA | `td404` | Ninestar `labelprinter.aar` | Classic Bluetooth from the phone. Wi-Fi only from the Node server. | 304 DPI (203 DPI also mentioned) |
| SEZNIK JOSH | `josh` | LPAPI jar (`LPAPI-2026-01-08-R.jar`) | Bluetooth through the vendor library | 203 DPI |
| SEZNIK DEV | `dev` | AutoReplyPrint | Classic Bluetooth | 203 DPI |
| SEZNIK TEZ / SHAKTI | `tez` | Tez / Yixin-style SDK | Classic Bluetooth | 203 DPI |
| SEZNIK LABEL X | `labelx` | LuckPrinter / GD985 | Classic Bluetooth | 203 DPI |

## Where the code lives

| Piece | Folder |
|-------|--------|
| JOSH phone module | `modules/josh-printer/` |
| TD-404 phone module | `modules/td404-printer/` |
| TEZ phone module | `modules/tez-printer/` |
| DEV phone module | `modules/dev-printer/` |
| Label X phone module | `modules/labelx-printer/` |
| Which model is which | `src/constants/printer-models.ts` |
| App-side print routing | `src/lib/printer/printer-manager.ts` |
| Node server | `backend/` |
| Server SDK list | `backend/sdks/registry.js` (only TD-404 is registered) |
| TD-404 Wi-Fi adapter | `backend/sdks/td404/` |
| JOSH vendor files | `JOSH SDK/` |
| Label X / GD985 vendor files | `backend/GD985-SDK/` |

## What the server can do

`backend/sdks/registry.js` registers one adapter: TD-404.

| Link | Vendor SDK can do it? | This Node server can do it? |
|------|----------------------|-----------------------------|
| Wi-Fi, TCP port 9100 | Yes | Yes |
| Classic Bluetooth | Yes | No — returns `TRANSPORT_REQUIRES_NATIVE` |
| Bluetooth Low Energy | Yes, inside the Android library | No |
| USB | Yes | No |
| Serial | Yes | No |
| JOSH, DEV, TEZ, Label X | Those SDKs exist on the phone | Not registered on the server at all |

Health check, when the server is running: `GET http://localhost:8787/health`.
