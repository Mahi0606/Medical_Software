# DawaDesk

Billing, inventory, purchasing, barcode labels and compliance registers for a single Indian retail pharmacy. Web app, installable as a PWA, runs on the counter PC or a small server.

Research, plan and design decisions live in [docs/PLAN.md](docs/PLAN.md) and [docs/research/](docs/research/).

## Quick start

Requirements: Node 22 or newer.

```bash
npm install
npm run seed        # creates data/pharmacy.db with demo store, items, batches, users
npm run dev         # API on http://localhost:3000, web app on http://localhost:5173
```

Demo logins (change them in Settings → Users):

| Username   | Password    | Role       |
|------------|-------------|------------|
| owner      | owner1234   | Owner      |
| pharmacist | pharma1234  | Pharmacist |
| clerk      | clerk1234   | Clerk      |

The seed marks the pharmacist on duty so Schedule H/H1 items can be billed straight away. In real use the pharmacist toggles duty from the top bar.

## Production run (single machine)

```bash
npm run build       # builds the web app into apps/web/dist and the API into apps/api/dist
npm start           # serves API + web app on http://localhost:3000
```

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `PHARMA_DATA_DIR` | `./data` | Database, backups and prescription uploads |
| `PHARMA_DB_PATH` | `data/pharmacy.db` | SQLite file |
| `PHARMA_BACKUP_DIR` | `data/backups` | Nightly backups (last 30 kept) |
| `COOKIE_SECRET` | dev value | Set a long random string in production |
| `COOKIE_SECURE` | false | Set `true` when served over HTTPS |

Put the app behind HTTPS (Caddy or nginx) when it is reached from other devices; the PWA install prompt and camera capture need a secure origin (localhost is fine without it).

## Hardware

- **Barcode scanner** in keyboard-wedge mode with an Enter suffix. Scans are detected anywhere on the billing and receipt screens.
- **Receipt printer**: choose 80 mm, 58 mm, A5 or A4 in Settings → Printing. Printing goes through the browser print dialog; set the printer as default and turn off headers/footers once.
- **Label printer** (TVS LP46, TSC, Zebra or similar): in Labels → Templates pick the roll size (50 × 25 mm single or 38 × 25 mm two-up). Either print through the OS dialog (select the label printer, matching paper size, no margins, 100% scale) or use **Print via USB** in Chrome/Edge, which sends TSPL or ZPL straight to the printer. On Windows the USB route needs the WinUSB driver (Zadig) for that printer.
- **Receipt printer over USB**: the bill page has a direct ESC/POS print button (80 or 58 mm, optional cash-drawer kick).
- **Offline**: billing keeps working without internet; give each device its own counter code on the Offline & sync page.
- **WhatsApp**: works out of the box with click-to-chat links; enter Meta Cloud API credentials under Messages → Settings to send automatically.

## Project layout

```
packages/shared   domain rules shared by API and UI: GST math, units, expiry, schedules, GS1 parsing, Zod schemas
apps/api          Fastify + SQLite (Drizzle). Services enforce every business rule; routes are thin.
apps/web          React + Vite PWA. features/* per screen, components/ui design system, lib/ utilities.
docs/             plan and research
data/             runtime data (ignored by git)
```

## Tests

```bash
npm test                                  # shared domain unit tests + API integration tests
npm run dev & npx -w apps/web playwright test   # browser smoke tests with axe accessibility scans
```

## Phase 2 features

Offline billing with sync, direct USB label and receipt printing, reorder suggestions and purchase orders, WhatsApp messages with dues and refill reminders, drug-interaction and duplicate-therapy checks, Tally XML / e-invoice / GSTR-1 exports, and an analytics panel. Details in [docs/BUILD-NOTES.md](docs/BUILD-NOTES.md).

## Compliance notes (India)

- Schedule H, H1 and X sales require a pharmacist on duty and prescription details; H1 and X entries are written to append-only registers in the statutory column layout and can be printed or exported per financial year.
- Expired batches cannot be billed. Move them to quarantine and return them to the supplier; both GST routes from CBIC Circular 72/46/2018 are supported and the ITC reversal is recorded.
- Every edit or deletion is logged in an append-only audit trail (CGST Rule 56(8)); posted documents are cancelled with reversals, never deleted.
- MRP is tax-inclusive; GST is back-calculated per line and the invoice switches between Tax Invoice, Bill of Supply and Invoice-cum-Bill of Supply automatically.
- Nightly backups; download a copy regularly. Restore by replacing `data/pharmacy.db` while the app is stopped.
