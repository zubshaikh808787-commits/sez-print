# Admin Panel — Brief

## Scope

An admin panel covering: telemetry (users, prints, template usage), content management (templates, clipart, stickers), and reviews & suggestions.

**Design reference note:** You asked for this to reference the design at  on your machine. I don't have access to your local filesystem — that path exists only on your computer, not in this environment. To actually match that design, upload the relevant screenshots or files here and I'll reference them directly. Until then, this brief describes structure and functionality only, with no visual design decisions baked in.

## Open Question — User Tracking

You want number of users in telemetry. Right now the app has no accounts — earlier in this project we settled on **anonymous device-based tracking** (a device ID generated on first app open), specifically *without* a signup/login screen, to keep onboarding frictionless.

This still works for a user *count* — each distinct device ID is a user. What it does **not** give you:
- Cross-device tracking (same person, two phones, counted twice)
- Reinstalls counted as new users
- Any way to attribute a review or suggestion to a real identity

If you need real accounts for this admin panel's number of users to mean something more precise, that requires adding a signup/login flow to the app — a real feature, not just an admin panel decision. **Recommendation: keep anonymous device tracking for now**, and label the metric Devices or Active Devices rather than Users in the dashboard UI, so nobody misreads it as verified headcount. Revisit real accounts only if a future feature (saved templates across devices, etc.) actually needs them.

---

## Structure — 4 Pages

### Page 1 — Telemetry

| Metric | Description | Data needed |
|---|---|---|
| Number of users | Count of distinct device IDs seen |  table, count of rows |
| Number of templates | Count of published templates |  table, count of rows |
| Number of prints | Print event count, broken down: **today / last 3 days / last 7 days / this month / lifetime** |  table, timestamp-filtered counts |
| Template-wise print count | How many times each template was printed |  table grouped by  |
| Printer name logging | Which printer brand/model each print used |  field, already scoped in earlier printer bridge work (: dev/labelx/tez/td404/josh) |

**File types involved:**
- Backend: API endpoints returning  responses for each metric
- Frontend: dashboard cards/charts, built as  (React) components if using the Next.js stack discussed earlier
- Data export (optional): downloadable  for any of the above tables, for offline analysis

### Page 2 — Upload / Content Management

| Content type | Fields | File types accepted |
|---|---|---|
| Template | Preview image, size (width × height mm), name, category | Preview:  / . Underlying template data:  (the  structure, same format used by the mobile editor) |
| Clipart | File upload, name |  /  (vector preferred for clean scaling) |
| Sticker | File upload, name |  (transparency needed) /  |

**File types involved:**
- Upload form:  component with drag-and-drop
- Storage: uploaded assets land in an S3-style bucket (or equivalent), backend stores just the URL + metadata in Postgres
- Template data specifically needs a  payload alongside the image — the image is just a preview thumbnail; the actual template (what gets loaded into the editor) is structured data, not a flat image

### Page 3 — Reviews & Suggestions

*(Part of your original scope, not in the 4-page list above — including it here since it was explicitly named in scope. Confirm if this should be a separate page or folded into Telemetry.)*

- Reviews list: rating, text, associated template, device ID, date — filterable/sortable
- Suggestions inbox: free-text feedback with a status field (new / reviewing / planned / rejected / shipped)

**File types involved:**
- Data:  API responses, same as Telemetry
- Export:  for reviews/suggestions if you want to analyze feedback offline

### Page 4 — *(Not yet specified)*

You said the dashboard has 4 pages but only described 2 in detail (Telemetry, Upload), plus Reviews & Suggestions from the original scope makes 3. What should Page 4 be? Common candidates for an admin panel like this:

- **Settings/Admin management** — admin user roles, permissions, who can upload content vs. just view metrics
- **Existing content management** — a separate page from upload for editing/deleting/featuring templates, clipart, and stickers already live (upload ≠ manage)

Flagging this rather than guessing — tell me which one (or something else) and I'll fill it in.

---

## Recommended Stack (carried over from earlier admin panel discussion in this project)

- **Backend:** Node.js API + Postgres
- **Frontend:** Next.js (React) web app
- **File storage:** S3-compatible bucket for template/clipart/sticker assets
- **Auth (for admins only, separate from the anonymous-device mobile app):** standard admin login with roles

## Next Steps

1. Confirm Page 4's purpose
2. Confirm whether Devices is an acceptable relabeling of Users, or whether real accounts are actually required
3. Upload the design reference files from your local  folder so the visual design can be matched, not just the functionality
