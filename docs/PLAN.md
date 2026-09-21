# Pharmacy Management System — Phase 2 Plan

Status: proposed, awaiting owner confirmation. Date: 19 Sep 2026.
Research inputs: `docs/research/01-market-features.md`, `02-india-compliance.md`, `03-healthcare-ui-ux.md`, `04-label-printing.md`.

## 0. Confirmed context
- Country: India (Drugs & Cosmetics Rules, GST, DPDP, PCI regulations).
- Users: registered pharmacist, billing clerks, owner/manager. No customer-facing portal in v1.
- Single store now; branch identity in every stock and document table so multi-branch is additive later.
- Platform: web app, installable as a PWA, used on a counter PC (keyboard + barcode scanner + thermal receipt printer + label printer) and optionally a tablet.
- Label printer is present in the store and must be supported from day one.

## 1. Feature phasing

### MVP (v1 — built in Phase 3)
Store setup
- Store profile: name, address, GSTIN, GST scheme (regular / composition), drug licence numbers (Form 20, 21, 20F) with retention-fee due dates, registered pharmacist name and registration number, FSSAI number (optional), invoice series prefix.
- Users and roles: Owner, Pharmacist, Clerk. Pharmacist-on-duty toggle; Rx-schedule sales require an active pharmacist session and record which pharmacist authorised the sale.

Catalogue and stock
- Item master: brand name, generic/salt composition with strengths, dosage form, manufacturer, pack configuration (box → strip → unit), HSN, GST rate with effective dates, schedule (none/G/H/H1/X, date-effective), rack, min/max stock, manufacturer barcode (EAN/GTIN), cold-chain flag, not-for-sale flag.
- Batch-level inventory: batch no., mfg, expiry (MM/YY), MRP, purchase rate, quantity in base units, supplier. Immutable stock ledger (every movement is a row; balances derived).
- CSV import for items and opening stock. Small seed dataset of common Indian brands for demo/testing.
- Substitutes: same salt + strength, in stock, shown at billing.

Purchasing and suppliers
- Supplier master with ledger and outstanding.
- Purchase / GRN entry: per line item, batch, mfg/expiry, pack, paid qty, free qty, PTR, discount, MRP, GST; scheme capture; short-expiry warning at inward; MRP-below-previous warning. CSV import of distributor invoices with column mapping.
- Purchase returns (expiry / breakage / damage): both GST routes from CBIC Circular 72/46/2018 (return as supply with our tax invoice, or supplier credit note with ITC reversal record). Expired stock moves to a quarantine status and is unsellable.
- Label printing at GRN: print N labels per batch (defaults to received quantity).

Billing (POS)
- Keyboard-first split screen: search left, cart right, totals fixed. Search by brand prefix, salt, rack, item code, scan.
- Scanner as keyboard wedge: always-focused capture input; parser handles EAN-13, GS1 DataMatrix/QR (AIs 01/10/17/21), Schedule H2 free-text QR payloads, and our own Code 128 batch codes.
- FEFO batch picker showing expiry, MRP, stock in strips and loose, rack; expired batches blocked; near-expiry flagged; lower-MRP batch flagged.
- Strip / loose quantity; per-line and bill discounts with role caps; warning below purchase rate; GST back-calculated from tax-inclusive MRP per line; Tax Invoice vs Bill of Supply by store scheme; invoice-cum-bill-of-supply when nil-rated and taxable items mix.
- Schedule gating: H requires prescriber name; H1 and X require prescriber name + registration no., patient name + address, prescription image or reference, pharmacist authorisation; X additionally records duplicate-prescription retention.
- Customer: walk-in default; phone-number lookup; credit (udhaar) sales to customer ledger; customer details captured automatically when required by Rule 46 (≥ ₹50,000) or by schedule rules.
- Payments: cash, card, UPI, credit, split; change due.
- Hold / resume bills; re-bill from a previous invoice.
- Print: 80 mm / 58 mm thermal and A4/A5, with store name, address, GSTIN, licence numbers, serial number, per-line batch and expiry, HSN, tax split, pharmacist name/registration on Rx bills. Share via WhatsApp link (pre-filled message with bill summary and PDF link).
- Sales returns against an original bill with credit note.
- Marg-compatible hotkeys where they do not conflict with the browser (F3 line discount, F4 bill discount, F10 in-stock only, Ctrl+Tab batch detail, Alt+N new bill, Alt+S save/pay, Alt+H hold, Esc back).

Regulatory registers and audit
- Schedule H1 register and Schedule X register generated automatically from sales, in the statutory column layout, printable/exportable; retained regardless of deletions.
- Prescription register (Rule 65(3)) for all Rx-schedule sales.
- Append-only audit log for every create/update/delete on documents, stock, prices and masters (CGST Rule 56(8)); reason required for edits to posted documents; no hard delete of posted documents (soft cancel with reversal).
- Retention policy engine: nothing inside statutory windows is purgeable.

Barcode labels
- Template designer with field toggles and preview; built-in templates: product/batch label 50 × 25 mm, two-up 38 × 25 mm, loose-dispense label (Rule 65(19)), shelf label.
- Default label structure: item name + strength; batch and expiry; MRP inclusive of taxes and pack; Code 128 barcode of the batch code with human-readable text; optional store name and GS1 DataMatrix when GTIN is known.
- v1 print route: browser print through the installed printer driver, millimetre-exact CSS page sizes, with a printer profile per label size. Raw TSPL/ZPL via WebUSB or QZ Tray is Phase 2.

Alerts and dashboard
- Home dashboard: today's sales, cash in drawer, low stock count, expiring in 30/60/90 days with value at risk, expired quarantine, customer dues, supplier dues, licence retention due, pharmacist-on-duty status.
- Alert tiers: blocking only for expired stock, no pharmacist on duty for Rx items, not-for-sale items, sale above MRP; interruptive with reason for below-cost sale and H1/X capture; passive badges for near-expiry, low stock, lower-MRP batch.

Reports
- Day book / counter close, sales register, purchase register, GSTR-1 summary (B2B, B2C, HSN split, document series), GSTR-3B outward summary, stock and batch stock, near-expiry by supplier, dead stock, profit by item / salt / supplier / customer, customer outstanding, supplier outstanding, H1/X registers, audit log. CSV export on every report.

Platform
- Installable PWA; app shell and reference data cached; drafts saved locally so a dropped connection does not lose a bill in progress. Full offline billing with sync is Phase 2.
- Nightly automatic database snapshot plus one-click backup download; restore procedure documented.
- Localisation scaffold (English strings externalised; Hindi in Phase 2); Indian digit grouping; DD/MM/YYYY; MM/YY expiry.

### Phase 2 (after v1 is in daily use)
- Offline billing with per-counter invoice series and background sync; conflict handling on stock.
- Raw TSPL/ZPL label printing (WebUSB or QZ Tray) and ESC/POS receipt printing with cash-drawer kick.
- Reorder suggestions from min/max and sales velocity; draft purchase orders per supplier; email/WhatsApp PO.
- WhatsApp Business API for invoices, payment links, refill reminders; SMS fallback.
- Prescription refill schedule and reminders.
- Drug-interaction and look-alike/sound-alike warnings (requires licensing or curating an interaction dataset; tiered per alert-fatigue research).
- Tally export; e-invoice (IRN) for stores above ₹5 crore turnover; e-way bill.
- Dark mode (opt-in, night shift). (Hindi UI removed from the roadmap on 19 Sep 2026 at the owner's request.)
- Doctor-wise sales; loyalty points; customer statements.
- Analytics: margin trends, top movers, supplier performance.

### Phase 3
- Multi-branch: branch switcher, inter-branch transfers, consolidated reports, central item master.
- ABDM: HFR registration data, ABHA linking, dispense records as FHIR bundles (M2), consent-based fetch (M3).
- Home delivery / online order intake; ONDC seller-app integration.
- Owner mobile app (read-only dashboards, approvals).
- Cold-chain temperature log with excursion alerts.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript end to end | One language for web, server and shared validation (GST math, schedule rules) so the billing rules cannot drift between client and server. |
| Frontend | React 19 + Vite, TanStack Router, TanStack Query, TanStack Table, react-hook-form + Zod | Mature, keyboard-friendly, headless table for dense inventory grids, form validation shared with the API. |
| UI primitives | Radix UI primitives + Tailwind CSS, own design tokens | Radix gives accessible focus and keyboard behaviour out of the box; tokens are ours so the palette and density are controlled, not inherited from a consumer kit. |
| PWA | vite-plugin-pwa (Workbox) | Installable, cached shell, offline drafts via IndexedDB (Dexie). |
| Backend | Node 22 + Fastify + Zod-typed routes | Fast, schema-validated JSON API; Node 22 is already installed on the target machine. |
| Database | SQLite (better-sqlite3, WAL mode) via Drizzle ORM, with migrations | Single store, a few counters: SQLite is zero-ops, transactional, trivially backed up as one file, and fast on a counter PC. Drizzle keeps the schema portable; multi-branch in Phase 3 moves the same schema to PostgreSQL. Trade-off stated: PostgreSQL would be chosen today if hosting many stores centrally. |
| Auth | Session cookies, Argon2 password hashing, role and permission checks on the server | No third-party dependency; works on LAN without internet. |
| Printing | Browser print with print CSS (receipts, A4, labels); pdf generation server-side (pdf-lib) for WhatsApp/download | No installs in v1. Raw printer languages in Phase 2. |
| Barcodes | bwip-js (Code 128, EAN-13, GS1 DataMatrix) | Renders both on-screen and in print; supports GS1 AIs. |
| Testing | Vitest (unit: GST, FEFO, schedule rules, GS1 parser), Playwright (billing flow, keyboard), axe-core in CI | The money and compliance logic gets unit tests; the counter flow gets an end-to-end test; accessibility regressions are caught automatically. |
| Repo | pnpm workspace: `apps/web`, `apps/api`, `packages/shared` | Shared Zod schemas and domain functions. |
| Deploy | Single Node process serving API + built web app; runs on the counter PC or a small VPS; HTTPS via Caddy when hosted | PWA and WebUSB need HTTPS or localhost. |

## 3. Architecture and data model

### Architecture
- Modular monolith: `catalog`, `inventory`, `purchasing`, `billing`, `customers`, `compliance`, `labels`, `reports`, `auth`, `audit`.
- Every write goes through a service that (1) validates with the shared Zod schema, (2) runs in a transaction, (3) appends stock ledger rows where stock changes, (4) appends an audit row. Controllers never touch tables directly.
- Documents (purchase, sale, returns) have a lifecycle: draft → posted → cancelled. Posted documents are immutable; corrections are reversing documents.
- `branch_id` on every stock, document and register table; v1 has exactly one branch row.
- Numbering: per document type and branch, financial-year-scoped, gapless for posted documents (Rule 46). Per-counter series is a Phase 2 switch.
- Time and money: all timestamps UTC in storage, displayed in IST; money stored as integer paise; quantities stored in base units (integers).

### Core entities (abridged)
- `store`, `branch`, `licence` (type, number, authority, issued, retention_due), `user` (role, pharmacist_registration_no), `session`, `duty_log` (pharmacist on/off).
- `item` (name, generic_name, form, manufacturer_id, hsn, pack_units_per_strip, strips_per_box, rack, min_qty, max_qty, ean, cold_chain, not_for_sale, tall_man_name), `item_salt` (salt, strength, unit), `item_schedule` (schedule, effective_from, effective_to), `hsn_gst_rate` (hsn, rate, effective_from).
- `supplier`, `manufacturer`, `customer` (phone, name, address, gstin, credit_limit, dob, guardian_consent_flag), `doctor` (name, registration_no, address).
- `batch` (item_id, batch_no, mfg, expiry, mrp_paise, purchase_rate_paise, supplier_id, status: active/quarantined/returned), `stock_ledger` (batch_id, branch_id, qty_delta, reason, document_type, document_id, created_at, user_id).
- `purchase` / `purchase_line` (qty, free_qty, ptr, discount_pct, scheme_note, gst_rate), `purchase_return` / lines (route: supply_invoice | credit_note, itc_reversal_paise).
- `sale` (type: tax_invoice | bill_of_supply | invoice_cum_bos, customer_id, doctor_id, pharmacist_user_id, prescription_id, status, totals), `sale_line` (batch_id, qty_units, unit_mode: strip|loose, mrp, rate, discount, taxable, cgst, sgst, igst), `payment` (mode, amount), `sale_return` / lines / `credit_note`.
- `prescription` (image_ref, doctor_id, patient name/address, date, valid_till, repeats_allowed, dispensed_count).
- `register_h1`, `register_x`, `register_rx` (denormalised statutory rows written at posting time; never updated).
- `label_template`, `label_job`.
- `audit_log` (entity, entity_id, action, before_json, after_json, user_id, reason, at) — append-only; DB trigger blocks UPDATE/DELETE on it.
- `backup_run`, `alert_state`.

### Key domain rules (shared package, unit-tested)
- GST back-calculation from tax-inclusive price, rounding per line to paise, invoice-level rounding to nearest rupee with a rounding-off line.
- FEFO batch ordering; expired exclusion; near-expiry thresholds.
- Unit conversion strip ↔ loose; loose rate = strip MRP / units per strip, rounded half-up to paise.
- Schedule resolution by date; H1/X mandatory field sets.
- GS1 element-string parser (FNC1 / GS separators, fixed- and variable-length AIs) with fallback regex for H2 QR text.
- Indian number formatting; MM/YY → last day of month.

## 4. UI/UX direction

### Palette (light theme, default)
Rationale from research: public health design systems (NHS, VA/USWDS) all use a white or near-white base with a single blue accent; medical alarm standards (IEC 60601-1-8, ISO 22324) assign red to high priority and yellow/amber to caution, and AAMI HE75 requires colour to be redundant. Blue is the only saturated hue with no alarm meaning, so it is the accent. Red, amber and green are reserved for state and never appear decoratively. Light mode is the default because legibility of small numerals is better in positive polarity at a bright counter.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| bg.page | #f3f5f7 | app background (NHS-style off-white to cut glare) | — |
| bg.surface | #ffffff | cards, tables, inputs | — |
| border.subtle | #d6dce2 | dividers, table rules (decorative) | — |
| border.input | #7b8997 | input and control boundaries | ≥3:1 on white |
| text.primary | #1b2733 | body | 15.2:1 on white |
| text.secondary | #52606d | labels, helper text | 6.5:1 on white |
| text.disabled | #6b7785 | disabled labels | 4.6:1 on white |
| accent | #1e5a8a | primary buttons, links, active nav, focus | 7.3:1 on white; white on it 7.3:1 |
| accent.hover | #174a72 | hover/pressed | — |
| accent.bg | #e8f0f7 | selected rows, info callouts | accent text on it 6.3:1 |
| danger | #b42318 | errors, expired, blocked, destructive | 6.6:1 on white |
| danger.bg | #fdecea | error callouts, expired row tint | danger text on it 5.8:1 |
| warning | #9a4b00 | near-expiry, low stock, caution text/icon | 6.2:1 on white |
| warning.bg | #fff4e0 | caution callouts, near-expiry row tint | warning text on it 5.7:1 |
| success | #1e7b4f | saved, paid, in-stock confirmation (sparingly) | 5.3:1 on white |
| success.bg | #e6f4ec | success callouts | success text on it 4.6:1 |
| focus.ring | #0f3a5c | 2 px outline + 2 px white offset | 11.8:1 on white |

Colour-blind safety: red and green are never the only distinction. Every state carries an icon and text ("Expired", "Exp in 12 d", "Low: 3 strips"). Warning uses amber-brown rather than yellow-green so it separates from success under deuteranopia. Charts use accent tints plus pattern or direct labels.

### Typography
- Font: Inter (self-hosted) with `font-variant-numeric: tabular-nums`; system-ui fallback.
- Base 16 px for forms and billing lines; 14 px in dense tables; 12 px floor for helper text only. Drug name + strength at 16 px semibold (ISMP 11–12 pt guidance).
- Drug names follow ISMP order: name, strength, form; Tall Man lettering for listed pairs; no trailing zeros; strengths sorted numerically in results.

### Layout
- Left vertical nav (collapsible to icons), slim top bar with global search, pharmacist-on-duty indicator and user menu.
- Billing: full-width split screen, search + results left (60%), cart right (40%) with totals and pay button fixed at bottom right; batch picker as an inline expandable row, not a modal.
- Tables: 36 px rows for inventory, 48 px for billing lines (two-line: name / batch + expiry); sticky headers; numeric columns right-aligned; first column is the human-readable name; row tints for expired (danger.bg) and near-expiry (warning.bg) plus badge.
- Side panels for edit/detail so reference data stays visible; modals only for hard stops and irreversible confirmations.

### Interaction
- Keyboard-first: every billing action reachable without a mouse; visible shortcut hints; Marg-compatible keys where possible; Enter adds highlighted item, Tab moves to qty, Esc backs out.
- Scanner capture input always focused on billing and GRN screens; scan detection by inter-key timing and terminator.
- Confirmation only for: posting a bill with H1/X items (captures register data), cancelling a posted document, deleting a master. Everything else is undoable or editable in draft.
- Autosave drafts locally every change; "Unsaved bill restored" banner on return.
- Alert tiers as defined in §1; blocking alerts use a modal with a worded heading and the single corrective action; passive alerts are badges and row tints.
- Forms: labels above fields, required marked, inline validation on blur, error summary at top with links to fields, submit never disabled.

## 5. Accessibility requirements (WCAG 2.1 AA, verified in CI with axe-core and manual keyboard passes)
- Contrast: text ≥ 4.5:1, large text and UI boundaries ≥ 3:1 (table above; no exceptions in the token set).
- Colour never the sole carrier of meaning (1.4.1); icons plus text on every status.
- Keyboard: all functionality operable by keyboard (2.1.1), no traps (2.1.2), logical focus order (2.4.3), visible focus (2.4.7) with the 2 px ring on every control; skip-to-content link.
- Target size: buttons and inputs ≥ 44 × 44 CSS px on billing and GRN; ≥ 24 px everywhere (2.5.8 AA in 2.2, exceeding 2.1 AA).
- Text resizes to 200% without loss (1.4.4); reflow at 320 px width for non-table views (1.4.10); tables scroll horizontally with sticky first column.
- Forms: labels and instructions (3.3.2), error identification in text (3.3.1), error suggestion (3.3.3), confirmation for financial submissions (3.3.4) via review step on bill post.
- Live regions: cart total and scan results announced via `aria-live="polite"`; blocking alerts use `role="alertdialog"` with focus moved in and returned.
- Language: `lang="en-IN"`; Hindi strings later with `lang="hi"` per element.
- Plain language: no regulatory jargon on buttons ("Save and print bill", not "Post invoice"); helper text explains H1 capture in one sentence; empty states explain the next action.
- Motion: no animation essential to understanding; respects `prefers-reduced-motion`.
- Timeouts: sessions warn before expiry and preserve drafts (2.2.1).

## 6. Compliance mapping (requirement → feature)
| Requirement | Feature |
|---|---|
| Rule 65(2), PCI 2015: RP supervision of Rx sales | Pharmacist-on-duty gate; pharmacist_user_id on every Rx sale; duty log |
| Rule 65(3) prescription register; 65(3)(h) H1 register 3 yrs | Auto-written `register_rx` / `register_h1`, printable, retention lock |
| Rule 65(9) Schedule X duplicate Rx retained 2 yrs; 20F licence | Schedule X flow with Rx image retention and X register; 20F on store profile |
| Rule 65(17) no sale after expiry | Expired batches quarantined, blocked at billing |
| Rule 65(18) samples not for sale | `not_for_sale` flag blocks billing |
| Rule 65(19) loose dispensing label | Loose-dispense label template |
| CGST Rule 46 / 46A invoice content; s.31 | Invoice templates per scheme; auto customer capture ≥ ₹50,000; invoice-cum-BoS |
| CGST Rule 56(8) edit/delete log; s.36 72-month retention | Append-only audit log; retention policy |
| GST 2.0 rates; HSN reporting | Date-effective HSN rates; GSTR-1 HSN summary B2B/B2C |
| Circular 72/46/2018 expired returns | Purchase-return routes with ITC reversal record |
| DPCO para 26 no sale above MRP | Batch MRP cap; override only downward with reason |
| SPDI Rules now; DPDP May 2027 | Encryption at rest of prescription images and customer PII fields, access logging, privacy notice text, consent flag, breach-report checklist |
| Schedule H2 QR | GS1/free-text QR parser prefilling batch and expiry |
| Legal Metrology Rule 18(2) | Label MRP always equals batch MRP; never above |

## 7. Decisions made without asking (override any of these)
1. SQLite over PostgreSQL for v1 (reasoning in §2).
2. Offline billing deferred to Phase 2; v1 protects in-progress bills locally.
3. Label printing in v1 goes through the OS printer driver; raw TSPL later.
4. Drug-interaction alerts deferred: no free, licensed India-appropriate interaction dataset; will curate or license in Phase 2.
5. WhatsApp in v1 is a share link, not the Business API.
6. English UI first with strings externalised; Hindi in Phase 2.
7. Customer data minimisation: walk-in bills store no personal data unless law or the customer requires it.
