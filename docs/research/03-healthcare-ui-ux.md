# UI/UX conventions for counter-side medical / pharmacy software — research findings

Research date: 19 Sep 2026. Epic, Cerner/Oracle Health, athenahealth, PioneerRx, Marg and GoFrugal do not publish palettes as design tokens; public health design systems (NHS, VA, USWDS) and ISMP guidance are the strongest citable sources.

---

## 1. Colour

### What real healthcare systems ship (hex values)

**NHS digital service manual** (https://service-manual.nhs.uk/design-system/styles/colour)
- Primary Blue #005eb8, Dark Blue #003087; brand green #007f3b; red #d5281b; yellow #ffeb3b
- Neutrals: text #212b32, secondary text #4c6272, #768692, #aeb7bd, borders #d8dde0, page background #f0f4f5, white #ffffff
- Functional: error #d5281b, success #007f3b, focus #ffeb3b; link #005eb8
- Page background is Grey 5 #f0f4f5 "to reduce glare and meet dyslexia-friendly guidelines"; white reserved to emphasise important content blocks.

**VA Design System** (https://design.va.gov/foundation/color-palette)
- Primary #005ea2, primary-dark #1a4480, primary-light #73b3e7
- Text #1b1b1b, base-medium #71767a, borders/disabled #a9aeb1, base-lightest #f0f0f0
- Success #00a91c, Warning #ffbe2e, Error #d54309, Info #00bde3, Focus #face00

**USWDS** (https://designsystem.digital.gov/design-tokens/color/theme-tokens/ ; https://designsystem.digital.gov/design-tokens/color/state-tokens/)
- primary #005ea2, primary-dark #1a4480, primary-darker #162e51, primary-light #73b3e7, primary-lighter #d9e8f6
- error #d54309 / error-lighter #f4e3db; warning #ffbe2e / warning-lighter #faf3d1; success #00a91c / success-lighter #ecf3ec; info #00bde3 / info-lighter #e7f6f8; disabled #757575

**Commercial EHR / pharmacy products**
- Epic Hyperspace: light default plus optional dark scheme "to reduce eye strain".
- Cerner/Oracle Health: Terra UI (React, open source, archived May 2024) with terra-clinical components (https://github.com/cerner/terra-clinical).
- athenahealth: "Forge" enterprise system; brand palette purples/greens.
- PioneerRx: colour-coded workflow queues "green, yellow, or red based on their status" (https://www.pioneerrx.com/pharmacy-software).

### Why neutral base + one restrained accent
- NHS reserves red/green/yellow for error/success/focus and warns "Make sure that what the colour is 'saying' is available in other ways".
- AAMI HE75: colour "should be used as a redundant design feature", never the sole carrier of meaning (https://research-collective.com/color-in-medical-device-design/).
- IEC 60601-1-8 fixes red = high priority, yellow = medium priority for medical alarms (https://www.sameskydevices.com/blog/a-guide-to-iec-60601-1-8-and-medical-alarm-systems). ISO 22324: red = danger, yellow = caution, green = safe, blue = informational only, grey = information unavailable (https://en.wikipedia.org/wiki/ISO_22324). ISO 9241-125:2017 has clauses on avoiding information by colour alone and overuse of colours.
- Phansalkar et al. / I-MeDeSA principles for medication alerts: red/orange = high hazard, green/blue = low hazard; fewer than 10 colours total (https://pmc.ncbi.nlm.nih.gov/articles/PMC3241174/).
- Consequence: if red/amber/green mean severity, they cannot also be branding or decoration; the base should be white/off-white/grey with a blue or teal accent so the first saturated red on screen is always a warning.

### Blue / teal "trust" — weak evidence, strong convention
- Marketing sources claim blue appears in ~85% of healthcare logos. Treat as convention. The harder argument is semantic: blue is the only saturated hue with no alarm meaning in IEC 60601-1-8 / ISO 22324.

### Eye strain, long shifts, dark mode
- Computer vision syndrome prevalence 69% overall in a 2023 meta-analysis; nurses highest among healthcare groups (https://onlinelibrary.wiley.com/doi/10.1111/jan.15140).
- NN/g: "light mode won across all dimensions" for visual acuity; advantage grows as text gets smaller (https://www.nngroup.com/articles/dark-mode/). 2025 Ergonomics study: cognitive scores higher in light mode (https://www.tandfonline.com/doi/full/10.1080/00140139.2025.2483451).
- Practical: default light mode at a daytime counter; dark mode opt-in for night shifts, re-verify every status colour.

### Colour-blindness and contrast
- Red-green deficiency ~8% of men, ~0.5% of women (https://www.section508.gov/create/making-color-usage-accessible/). WCAG 1.4.1: never colour alone. NHS found worded callout headings beat icons for warnings (https://service-manual.nhs.uk/design-system/components/warning-callout).
- WCAG 2.1 AA: 4.5:1 normal text, 3:1 large text, 3:1 UI component boundaries (1.4.11) (https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html).
- Radix Colors: 12 steps per hue; steps 1–2 backgrounds, 3–5 component states, 6–8 borders/focus, 9–10 solid fills, 11–12 text; 11/12 guaranteed APCA Lc 60 / Lc 90 on step 2 (https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).

---

## 2. Layout

### Navigation and screen structure
- Left vertical nav suits broad IAs (https://www.nngroup.com/articles/vertical-nav/). A slim top bar carries global search and user/store switcher.
- POS split screen is the industry default: item search/scan on the left, persistent cart on the right (https://learn.microsoft.com/en-us/dynamics365/commerce/pos-screen-layouts). Checkout: form two-thirds left, sticky summary one-third right, totals above the primary CTA.
- Minimise modals: NN/g prefers non-modal side panels so reference data stays visible (https://www.nngroup.com/articles/modal-nonmodal-dialog/ ; https://www.nngroup.com/articles/data-tables/).

### Data tables
- NN/g: first column is a human-readable identifier; freeze headers; zebra striping and hover; visible active-filter state; 1–2 inline row actions max; batch actions via checkboxes.
- Right-align numeric columns (NHS `nhsuk-table__cell--numeric`).
- Carbon row heights: compact 24px, short 32px, default 48px, tall 64px; 14px header/body (https://v10.carbondesignsystem.com/components/data-table/style/).
- Expert-tool density: power users convert density into efficiency; extra padding means more scrolling (https://mattstromawn.com/writing/ui-density/).

### Type sizes and fonts
- NHS: 19px desktop body (consumer-facing). VA: Source Sans Pro, 16px root. Carbon: IBM Plex, 14px body/table cells. Atlassian: 14px default, 12px floor.
- ISMP: "easy-to-read, larger size fonts (e.g., 11- to 12-point font)" ≈ 15–16px, familiar sans-serif (https://www.ismp.org/system/files/resources/2019-03/Electronic-Guidelines-2019.pdf).
- Net: 14px enterprise body norm, 16px government norm, 12px floor for secondary table text; drug name + strength lines at 14–16px.
- Tabular numerals: `font-variant-numeric: tabular-nums` for aligned prices/quantities. Inter, Roboto, Source Sans, IBM Plex all ship tabular figures.

---

## 3. Interaction

### Keyboard-first billing (Indian incumbents)
- Marg ERP hotkeys: Alt+N new sale bill, Alt+A counter sale, F3 item discount, F4 bill discount, F5 net rate, F6 rate, F10 show only available stock, F11 return cash, Ctrl+Tab batch detail, Tab/End save (https://care.margcompusoft.com/margerp/general-queries/166661/1/SHORTCU). This is the muscle memory Indian counter staff already have.
- Barcode scanners in HID/keyboard-wedge mode type into whatever has focus; configure prefix and Enter suffix, keep a focused capture input, detect scans by inter-key timing (https://barcodescanneremulator.dev/guides/hid-keyboard-wedge).
- Schedule H2 QR payloads can prefill batch and expiry, not just product.

### Search and product selection (ISMP rules)
- Item 19: require at least the first 5 letters for short-name matching ("met" confuses methotrexate, metFORMIN, methadone, metroNIDAZOLE).
- Item 20/23: display name, then strength, then dosage form ("diazePAM 5 mg tablet").
- Item 21: show the reference name in parentheses for look-alike products.
- Item 22: sort alphabetically; strengths numerically low→high.
- Item 27: spaces between name, dose and unit.

### Confirmations, undo, forgiving errors
- NN/g: confirmation dialogs only before serious irreversible actions; prefer undo (https://www.nngroup.com/articles/confirmation-dialog/).
- Controlled drugs are the legitimate hard confirmation: H1 register capture of prescriber and patient before an H1/X line can be billed.
- Autosave drafts ("unsaved changes: draft #1234") rather than silently committing.
- Atlassian forms: labels above, asterisk legend, inline validation, never disable submit — explain instead (https://atlassian.design/components/form/usage).

### Touch targets and focus
- WCAG 2.5.5 (AAA) 44×44 px; WCAG 2.2 2.5.8 (AA) 24×24 px minimum; Apple 44pt; Material 48dp. Design to 44–48 px for a tablet counter.
- Focus: 2.4.7 visible indicator; NHS and VA use high-visibility yellow focus (#ffeb3b / #face00) with dark inner outline.
- Errors: 3.3.1 identify field and describe in text; 3.3.3 suggest the fix. NHS error summary: top of main content, "There is a problem", focus moved to it, each error links to its field (https://service-manual.nhs.uk/design-system/components/error-summary).

---

## 4. Alert design

### Alert fatigue
- Meta-analysis (Felisberto 2024): physician override 90%; drug-drug 95.1% (https://journals.sagepub.com/doi/10.1177/14604582241263242).
- Expert panel: 33 class-based DDIs should be non-interruptive; ~one-third of all alerts (https://pmc.ncbi.nlm.nih.gov/articles/PMC3628052/).

### Tiering works
- Paterno 2009: tiered site 29% compliance vs 10%. Level 1 hard stop 100% vs 34%; Level 2 interruptive with override reason; Level 3 display-only (https://pmc.ncbi.nlm.nih.gov/articles/PMC2605599/).
- Hard stops review: 88% improved process outcomes, only 50% health outcomes; harms include workflow avoidance and false documentation (https://pmc.ncbi.nlm.nih.gov/articles/PMC6915824/).
- Alert content: signal word + hazard + instructions + consequences; corrective actions not just Accept/Cancel; place alerts next to data entry. ISMP item 40: phrase warnings affirmatively.

### Message components in reference systems
- Atlassian: flags for low severity; banners for loss of function; modal only for critical; never auto-dismiss critical (https://atlassian.design/components/flag/usage).
- Carbon: inline persistent; toast 5 s; icons identify kind.
- VA: no auto-dismiss; `role="alert"` for time-sensitive, `role="status"` for advisory (https://design.va.gov/components/alert/).
- NHS: warning callout (yellow card, worded heading) for time-critical info.

### Expiry / stock states
- Convention: expired = red, near-expiry = yellow, remainder neutral/green; FEFO views sort soonest-first. Combine with "not colour alone": badge text ("Expired", "Exp 12 d") plus icon plus row tint at Radix step 2–3 intensity.

---

## 5. Localisation realities for India
- Numbers: 2-2-3 grouping — 1,00,000 (lakh), 1,00,00,000 (crore); `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'})` → "₹12,34,567.89". Apply lakh grouping to money; keep dose numbers unseparated.
- Dates: DD/MM/YYYY dominant. Expiry on packs is MM/YYYY or MM/YY with implied last day of month. UI expiry field should be MM/YY.
- Pack hierarchy: box = N strips, strip = N tablets; sell loose.
- Language: Hindi UI is a selling point in tier-2/3 cities (PharmaPOS full Hindi; Marg Hindi support) (https://www.adrine.in/blog/best-pharmacy-software-india).

---

## 6. Pharmacy-specific usability guidance (ISMP)
- Tall Man lettering for look-alike pairs: hydrALAZINE / HYDROmorphone / hydrOXYzine, predniSONE / prednisoLONE, glipiZIDE / glyBURIDE, DOPamine / DOBUTamine, vinCRIStine / vinBLAStine, traMADol / traZODone, buPROPion / busPIRone, NIFEdipine / niCARdipine, cefTRIAXone / ceFAZolin / cefTAZidime, amLODIPine / aMILoride, ALPRAZolam / LORazepam / clonazePAM, carBAMazepine / OXcarbazepine (https://www.ismp.org/system/files/resources/2023-01/ISMP_Tallman_Letters_012523_MS5087%20(2).pdf). Recommended "particularly when medication names appear alphabetically in drop-down menus and search results".
- Name presentation: generic lowercase except Tall Man; brand capitalised first letter only; never all-caps; capitalise terminal "L" (propranoloL); no drug-name abbreviations.
- Dose designations: no trailing zeros (5 mg never 5.0 mg), always leading zeros (0.3 mg), spell out "units", mcg not µ, mL not cc, no period after units, "daily" not QD/OD.
- 2024 ISMP List of Error-Prone Abbreviations applies to pharmacy computer screens (https://www.ismp.org/system/files/resources/2024-04/ISMP_ErrorProneAbbreviation_List.pdf).

---

## 7. Design systems worth borrowing from

| System | Tables | Forms | Alerts | Notable |
|---|---|---|---|---|
| NHS.UK frontend | Caption, numeric right-align, responsive stack ≤768px | Error summary at top, auto-focus, error linked to field | Warning callout (yellow, worded heading); contrast 11.9:1+ | #f0f4f5 page background to cut glare |
| VA Design System | Roboto Mono for tabular data | 16px, rem-only sizing | Info/success/warning/error, no auto-dismiss, explicit ARIA | USWDS tokens |
| Atlassian | Sort/pagination; edit via panel not inline | Labels above, asterisk legend, never-disabled submit | Flag / banner / inline / modal hierarchy | 14px default body, 12px floor |
| IBM Carbon | Row heights 24/32/48/64px; 14px | Inline error supplementing field state | Inline (persistent) vs toast (5 s) | Best documented density controls |
| Radix / shadcn | Headless TanStack Table | Radix primitives for focus/keyboard; react-hook-form | Alert with icon/title/description | 12-step scales with APCA-guaranteed text steps |
| Terra UI (Cerner) | terra-clinical-data-grid | Unsaved-changes prompt | Alerts in terra-core | Only open-source EHR-vendor system; archived 2024 |

### Cross-cutting numbers
- Text contrast 4.5:1 (AA), UI/graphics 3:1, AAA 7:1.
- Touch 44×44 px (WCAG AAA / Apple) or 48 dp (Material); WCAG 2.2 AA floor 24×24 px.
- Body 14px (enterprise) – 16px (gov); tables ≥12px; drug-name lines 15–16px.
- Table rows 32px for dense inventory, 48px for billing lines with batch + expiry sub-text.
- Toast lifetime 5 s but never for errors/critical.
- Alert tiers: hard stop only for top severity; interruptive-with-reason for moderate; display-only for low.
- Override baseline to beat: 90–95%.
