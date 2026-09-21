# Build notes and deviations from the plan

Status as of 19 Sep 2026. Product name: DawaDesk (demo store in the seed: Om Medical and General Stores). See `docs/PLAN.md` for the agreed plan.

## Deviations (and why)

| Plan | Built | Reason |
|---|---|---|
| pnpm workspace | npm workspaces | pnpm is not installed on the target machine and npm 10 handles workspaces; nothing else changes. |
| Argon2 password hashing | Node `crypto.scrypt` | Same security class, no native dependency to compile on the counter PC. |
| pdf-lib for WhatsApp/download PDFs | Browser print to PDF; WhatsApp share sends a text summary via `wa.me` | Avoids a server-side PDF pipeline in v1; the print view is the PDF. Business API delivery of the PDF is Phase 2 as planned. |
| Postgres-ready Drizzle schema | SQLite with Drizzle, plus `branch_id` on stock/document tables | As planned; only noting that the migration to Postgres will need the few `sql.raw` column qualifiers in reports reviewed. |
| Search input as ARIA combobox | Plain search box with a live region and button rows | The combobox/listbox pattern conflicted with the inline batch picker and failed axe (`aria-required-children`, `nested-interactive`). The replacement passes WCAG checks and keeps the same keys. |
| Fixed left navigation | Collapsible navigation: full labels or a slim icon rail, remembered per device, auto-collapsed on Billing, Ctrl+B toggles |  Owner asked for the whole screen at the counter; the rail keeps every section one click away for non-technical staff. |
| Cart as a table | Cart lines as a stacked list | A table with five columns broke at 1280 px wide screens (common counter PCs); the list keeps 44 px controls and stays legible. |

## Scope delivered in v1

- Store setup, roles, pharmacist-on-duty gate, licences with retention-fee tracking.
- Item master with salts, schedule (date-effective history), pack hierarchy, rack, EAN; CSV import; substitutes by salt signature.
- Batch inventory with append-only stock ledger; opening stock; adjustments; quarantine and disposal; expiry views.
- Purchases (GRN) with schemes, free goods, weighted cost, warnings; distributor CSV import; cancellation with reversal; expiry/damage returns on both CBIC 72/46/2018 routes with ITC reversal recorded.
- Billing: keyboard-first, scanner as keyboard wedge (EAN, GS1 DataMatrix/QR, Schedule H2 text, in-house Code 128), FEFO with inline batch switch, strip/loose, discount caps by role, below-MRP override with reason, GST back-calculation, Tax Invoice / Bill of Supply / Invoice-cum-Bill of Supply, Schedule H/H1/X gating, walk-in or customer, credit with limit check, split payments, change, hold/resume, local drafts, re-bill, cancel, partial returns with credit notes.
- Registers: prescription (RX), H1 and X, written at posting time, append-only, per-FY serials, print and CSV.
- Labels: templates (50×25, 38×25 two-up, loose dispense, shelf), Code 128 / EAN-13 / GS1 DataMatrix / QR, true-size preview, print through the OS driver, job history for reprints, one-click from GRN.
- Reports: day book, sales/purchase registers, GSTR-1 (B2B, B2C rate-wise, HSN B2B/B2C, credit notes, document series), GSTR-3B summary with ITC reversal, stock/reorder, near-expiry by supplier, dead stock, profit by item/salt/supplier/customer/doctor/user/day, outstanding, schedule volumes. CSV export everywhere.
- Audit log (append-only, DB-enforced), nightly backups with download, PWA install, dark mode opt-in, Indian formats.

## Phase 2 (built 19 Sep 2026)

| Area | What shipped | Notes |
|---|---|---|
| Offline billing | Snapshot of items, batches, customers, prescribers, interaction rules and store kept in IndexedDB; billing reads fall back to it when the network is down; bills post to a local outbox with a device series `INV-<counter>/<FY>/<seq>` and replay through the normal sale endpoint; per-device counter code; Offline & sync page with retry/discard (discards are audited on the server); server allows stock to go negative for synced bills and logs it; pharmacist-on-duty at the time of the offline sale is carried with the bill. | Multiple series are permitted under CGST Rule 46. Held bills and drafts remain local. |
| Direct printing | TSPL and ZPL label output and ESC/POS receipts with cash-drawer kick, sent over WebUSB from Chrome/Edge, with a raw-file download fallback. | Untested on hardware in this session; generators are unit-tested and sample files were inspected. |
| Reorder & purchase orders | Suggestions from min/max and sales velocity net of pending POs, grouped by supplier; PO create/edit/send (WhatsApp text or print)/cancel; receiving against a PO prefills the receipt and tracks received quantities. | |
| Messages & reminders | Outbox with manual (click-to-chat) and Meta WhatsApp Cloud API modes; bill copies (manual or automatic), dues reminders, refill reminders driven by days-of-supply on the bill; consent rules per DPDP. | SMS provider not implemented; channel field reserved. |
| Drug interactions | Starter rule set (about 80 salt pairs) editable in-app; checks cart pairs, the customer's last 30 days of purchases, duplicate salts and look-alike names; major → bill blocked until the pharmacist records a reason (stored on the bill and audited), moderate → warning, minor → note. | Not a complete reference; stated in the UI. |
| Exports & analytics | Tally XML (sales, purchases, credit and debit notes; configurable ledgers), e-invoice schema 1.1 JSON with a pre-check, GSTR-1 offline-tool JSON; analytics panel with 12-month trend, movers, supplier performance, payment mix, busiest hours. | Invoice numbers are 17 characters; the IRP allows 16, so shorten the prefix before using e-invoice JSON. |

Not built in Phase 2: SMS fallback, loyalty points, e-way bill, live IRP submission (needs GSP credentials).

## Known limits (unchanged from plan)

- Multi-branch, ABDM, home delivery/ONDC, owner mobile app and cold-chain logging remain Phase 3. Hindi UI was dropped from the roadmap at the owner's request (19 Sep 2026).
- `labels` bundle includes the full bwip-js encoder set (~1 MB, lazy-loaded only on that page).
- The prescription-register retention period for Schedule H (not H1) sales could not be verified from a primary source; the app keeps all register rows indefinitely, which is the safe reading.

## Verification performed

- `npm test`: 45 shared domain tests (GST, units, expiry, GS1, schedules) and 8 API integration tests (posting, gating, credit, returns, purchases, ITC reversal, append-only guards).
- Playwright smoke suite with axe-core WCAG 2.1 A/AA scans on login, dashboard, billing (cash flow and H1 block), bill detail, labels and reports.
- Production build (`vite build`) and PWA service worker generation.
