# SEZ Print Desk

Browser desk for the SEZ Print team. It lives in `admin/` so it stays separate from the Expo app and the printer backend.

```bash
cd admin
npm install
npm run dev
```

Open http://localhost:3000

Sample sign-in (change these in Settings):

- Owner: `seznikadmin` / `Seznik01!`
- Editor: `editor@sez.local` / `sez-editor`

## Pages

1. **Overview** — devices, published templates, and prints for today, the last 3 days, the last 7 days, this month, and lifetime. Template totals and printer names (Dev, LabelX, Tez, TD-404, Josh) are on the same page. CSV downloads sit in the header.
2. **Library** — upload and manage templates, clipart, and stickers. A template needs a preview image plus the JSON document the phone editor loads (`designWidth`, `designHeight`, `layers`). Clipart accepts SVG or PNG. Stickers accept PNG or WebP.
3. **Feedback** — reviews (rating, text, template, device, date) and a suggestions inbox (`new`, `reviewing`, `planned`, `rejected`, `shipped`).
4. **Settings** — who can sign in, and whether they are an owner, editor, or viewer.

## Decisions from the brief

- The count is **Devices**, not users. The phone app has no accounts. One install is one device.
- Page 4 is **Settings** (admin roles). Managing templates that are already live sits on the Library page with upload, so you do not publish a file you cannot find again.
- There was no design folder in the repo. The desk uses the app’s navy (`#214668`) and teal (`#17A6B8`) on warm paper.

## Data

The desk stores records in `admin/data/store.json` and files in `admin/data/uploads`. Both are created on first launch and are gitignored. `schema.sql` is the Postgres shape for when this moves to RDS. Uploaded files are local stand-ins for an S3 bucket; each record stores a URL.

Set `SEZ_ADMIN_SECRET` before this desk is reachable beyond your computer. See `.env.example`.
