# India retail-pharmacy compliance research — findings for a single-store web/PWA system

Legend: **[M]** legally mandatory today · **[S]** state-level / inspector expectation, not in central rules · **[R]** recommended/good practice · **[D]** draft, future-dated or unenforced · **[?]** could not verify from a primary source.

Research date: 19 Sep 2026. Several 2026 items (Schedule H2 expansion, Income-tax Act 2025, pregabalin H1 entry) are recent; re-verify before relying on them in a spec.

---

## 1. Drugs & Cosmetics Act 1940 / Drugs Rules 1945 — retail sale

### 1.1 Schedule-by-schedule sale conditions

| Schedule | Rx needed | Rx retained by pharmacy | Register | Pharmacist supervision | Label marking (Rule 97) |
|---|---|---|---|---|---|
| **H** | Yes — Rule 65(9)(a) [M] | No statutory retention; pharmacist must *endorse* the Rx with seller name/address + date (Rule 65(11)) [M] | Prescription register, Rule 65(3) [M] | Yes, Rule 65(2) [M] | "Rx" + Schedule H warning |
| **H1** | Yes [M] | As for H; some inspectors expect a copy [S] | **Separate** H1 register, Rule 65(3)(h), kept **3 years** [M] | Yes [M] | "Rx" in red + red-bordered H1 warning box |
| **X** | Yes; Rx **in duplicate** — Rule 65(9) [M] | **One copy retained 2 years** [M] | Prescription register + separate bound, page-numbered X register; stock under **lock & key**; needs licence **Form 20F** [M] | Yes [M] | "XRx" in red |
| **G** | **No** — label-caution schedule only [M for label] | — | Rule 65(3) only if sold on Rx | — | red-box caution |
| **C / C(1)** (biologicals, injectables, insulin, vaccines) | Only if also in H/H1/X | — | If sold **without** Rx, Rule 65(4) requires an entry in a register **or cash/credit memo book** (serial no., date, purchaser name/address, drug, qty, manufacturer, batch, signature) [M] | — | — |
| **"OTC"** | India has no legal OTC category. Anything not in H/H1/X may be sold without Rx. Schedule K lists household remedies sellable without licence; CDSCO draft to add ~16 OTC drugs to Schedule K [D]. | — | — | — | — |

Sources: Rule 65 — https://indiankanoon.org/doc/147665881/ ; Rule 65(3) — https://indiankanoon.org/doc/153141077/ ; Rule 97 — https://indiankanoon.org/doc/81088286/ ; Schedule G — https://laafon.com/schedule-g-drugs-list-warning-labels-and-medical-uses/ ; Schedule X — https://laafon.com/schedule-x-drugs-list/ , https://drugscontrol.tn.gov.in/guidelines_procedures_grant_renewal_retail_wholesale_licences_schedule_x_drugs.html ; Schedule K — https://drugscontrol.org/pdf/schedule_k.pdf , https://bnblegal.com/article/deciphering-the-regulatory-void-of-over-the-counter-medicines-in-india/ , https://cliniexperts.com/draft-notification-to-add-16-drugs-as-otc-under-schedule-k-of-drugs-rules-1945/

### 1.2 Prescription register — Rule 65(3) [M]
Every supply on an RMP's prescription must be recorded *at the time of supply* with:
(a) serial number; (b) date of supply; (c) name and address of prescriber; (d) name and address of patient; (e) name of drug and quantity; (f) for Schedule C, H, H1: manufacturer name, batch number, expiry date; (g) signature of the registered pharmacist; (h) **Schedule H1: separate register** with prescriber name+address, patient name, drug name, quantity — "maintained for three years and open for inspection".
Retention of the general prescription register: secondary sources state "not less than two years from the date of last entry" [?].
Sources: https://indiankanoon.org/doc/153141077/ ; H1 notification GSR 588(E) 30-Aug-2013 — https://ntep.in/node/938/CP-schedule-h-1-regulation ; model H1 register — https://nhsrcindia.org/sites/default/files/2021-07/Attachment%20A,%20Schedule%20H1%20register%20and%20NDPS%20Forms.pdf

Current H1 list: 46 original entries + oxytocin (GSR 795(E) 2018), tapentadol (GSR 258(E) 2021), oseltamivir & zanamivir (GSR 95(E) Feb 2024), **pregabalin (GSR 377(E) 13-May-2026, operative ~Nov 2026)** [D until then]. The system needs a **versioned, date-effective schedule master**, not a static flag. Source: https://laafon.com/understanding-the-schedule-h1-drug-list/

**Monthly H1 inspection:** no central rule requires a monthly check; the rule says "open for inspection". Some state FDAs run periodic H1 audits. Treat monthly reconciliation as [R]/[S]. Source: https://shelflifepro.in/blog/schedule-h1-drug-register-compliance-guide/

### 1.3 Valid prescription — Rule 65(10) [M]
In writing, signed and dated by the RMP; prescriber name and address; patient name and address; total amount of medicine and dose. Rule 65(11): dispenser must note seller name/address and date on the Rx; **not to be dispensed more than once** unless the prescriber says so. Software: capture Rx image/ID, prescriber name + registration no., patient name/address, "dispensed" endorsement, refill/repeat control.

### 1.4 Retail bill / cash memo
- The Drugs Rules contain **no stand-alone particulars list for a retail cash memo** for Rx sales; the obligation sits in the Rule 65(3) register. Rule 65(4) lets non-Rx Schedule C sales be recorded in a cash/credit memo book with serial no., date, purchaser name & address, drug & qty, manufacturer, batch, signature [M].
- Rule 65(5) (wholesale) has an explicit memo list: date, name/address/licence number of seller, buyer details, drug name, qty, batch, manufacturer, signature; copies preserved 3 years [M for wholesale]. Retail systems mirror this list as best practice [R].
- "Rx"/warning text on the bill: not required by law. Printing "Sold on prescription of Dr ___" is [R].
- Pharmacist name/registration no. on the bill: no central rule. PCI Pharmacy Practice Regulations 2015 reg. 3.3(b) require RP name, registration no., qualification and photo displayed at the dispensing area [M under Pharmacy Act]. Maharashtra FDA practice expects Rx bills signed by the RP [S]. Recommend printing RP name + registration no. on every Rx bill and storing the RP user-ID against each Rx sale [R/S].
- Drug licence numbers on the bill: mandatory only for wholesale memos; universal practice at retail [S/R].
- Practical bill field set = GST fields (§4) + drug fields: drug name, pack/qty, batch, expiry, manufacturer, MRP, prescriber name (+regn no.), patient name, RP name/regn no., seller licence numbers.
Sources: https://indiankanoon.org/doc/147665881/ ; PCI regs — https://thc.nic.in/Central%20Governmental%20Regulations/Pharmacy%20Practice%20Regulations%202015.pdf ; https://medpharmaenterprises.com/FDA_DRUG_LICENCE.php

### 1.5 Other Rule 65 conditions [M]
- 65(15) shop description: "Drugstore" (no RP), "Chemists and Druggists" (RP employed), "Pharmacy" (RP + compounding).
- 65(16) Inspection Book in Form 35.
- 65(17) **no sale after expiry**; expired stock segregated and returned/disposed.
- 65(18) physician samples / "not for sale" supplies cannot be sold — block at billing.
- 65(19) repacked/loose-dispensed drugs need a label with drug name, quantity, dealer name/address.
- Rule 64(2): retail premises ≥10 m². Source: https://indiankanoon.org/doc/80611693/

---

## 2. NDPS Act 1985 / NDPS Rules at retail
- Psychotropic medicines (alprazolam, diazepam, clonazepam, zolpidem, phenobarbitone…) are sold under the D&C licence; NDPS Rule 66 limits patients to prescribed quantities (secondary sources cite 100 dosage units, up to 300 on Rx) [M] [?] verify wording. Most are also Schedule H/H1. Rule 67: Form 6 consignment note for transport, records 2 years.
- **Essential Narcotic Drugs (ENDs)** — morphine, fentanyl, methadone, oxycodone, codeine (>100 mg/unit), hydrocodone — Chapter VA (Rules 52A–52N). Dispensing by Recognised Medical Institutions and authorised chemists. Records: **Form 3D daily account per drug**, Form 3C consignment note, Form 3E patient record, annual return Form 3-I; retained 2 years. [M if the store handles ENDs; most retail chemists do not.]
- State NDPS Rules can add licences/registers [S].
Sources: https://palliumindia.org/wp-content/uploads/2020/05/Forms-and-Official-Documents-Relevant-to-ENDs.pdf ; https://indiankanoon.org/doc/184182041/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC9122147/

---

## 3. Retail drug licences

| Form | Scope |
|---|---|
| 20 | Retail sale of drugs other than Schedule C, C(1), X |
| 21 | Retail sale of Schedule C & C(1) drugs |
| 20F | Retail sale of Schedule X (only to holders of 20+21) |
| 20A / 21A | Restricted retail licence without a registered pharmacist |
| 20B / 21B | Wholesale |

- Since the Tenth Amendment Rules 2017 (GSR 1337(E)), licences are **perpetual**, subject to a **retention fee every 5 years**. Store: licence no., form type, issuing authority, date of issue, next retention-fee due date, licensee name, premises address, RP name & registration no. Sources: https://drugscontrol.py.gov.in/sites/default/files/gsr-1337.pdf ; https://drugs.delhi.gov.in/drugs/procedures-obtaining-licences
- **Registered pharmacist presence:** Rx drugs supplied "only by or under the personal supervision of a registered pharmacist" (Rule 65(2)); Pharmacy Act 1948 s.42; PCI regs 2015: RP appointment in force at all times (3.4), RP personally hands over Rx drugs (9.1), RP may not serve more than one pharmacy (13(d),(e)). [M]
- **Logging implication:** record which RP user authorised each Rx sale (Rule 65(3)(g)), have a "pharmacist on duty" state and block Rx-schedule billing when no RP session is active, keep an immutable log of RP sign-offs. A login-bound attestation with timestamp is the usual inspector-acceptable substitute for a signature [R].

---

## 4. GST
- **HSN & rates (post GST 2.0, w.e.f. 22 Sep 2025):** GST Council 56th meeting: all other drugs and medicines 12% → **5%**; **36 life-saving drugs to Nil**; medical devices 18% → 5%; wadding/gauze/bandages (3005), diagnostic kits (3822), glucometers → 5%. Chapter 30: 3003 (bulk), **3004 (retail-pack medicaments incl. Ayurvedic/Unani/Homoeopathic)**, 3005, 3006. Cosmetics, sanitizers etc. remain at 18%. Rate must be **per-HSN/per-SKU with effective dates**. Sources: https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau.pdf ; https://busy.in/gst-rates/medicines/ ; https://tallysolutions.com/gst/hsn-code-3004-product-classification-gst-rate-business-filing-guide/
- **MRP is tax-inclusive** — LMPC Rule 2(m), DPCO para 24/25; para 26 forbids selling above MRP. Regular-scheme pharmacy back-calculates: taxable value = price ÷ (1 + rate); tax split CGST/SGST (or IGST). After the Sept-2025 cut, re-stickering was not mandatory; retailers sold old stock at reduced effective price — supports "MRP override with reason + effective date". Sources: https://www.taxtmi.com/article/detailed?id=17256 ; https://indiankanoon.org/doc/32366040/ ; https://www.pharmabiz.com/NewsDetails.aspx?aid=181342&sid=1
- **Composition vs regular:** composition (CGST s.10) — turnover ≤ ₹1.5 cr; traders pay 1% of turnover; cannot collect GST, no ITC; must issue a **Bill of Supply**; files CMP-08 quarterly + GSTR-4 annually. Regular — tax invoice, ITC, GSTR-1 + GSTR-3B. The bill template must switch between "Tax Invoice" and "Bill of Supply". Sources: https://cleartax.in/s/gst-composition-scheme
- **E-invoicing (Sep 2026):** mandatory for AATO > ₹5 crore (B2B only); B2C outside e-invoicing; 30-day IRN reporting for AATO ≥ ₹10 cr. Dynamic QR on B2C only at AATO > ₹500 cr. Sources: https://getswipe.in/blog/article/e-invoice-turnover-limit-2026-5-crore-rule-india ; https://einvoice6.gst.gov.in/content/e-invoice-b2c-qr-code-applicability-penalty-contents-generation-exemption-list/
- **Invoice fields (Rule 46) [M]:** supplier name, address, GSTIN; consecutive serial no. (≤16 chars, unique per FY); date; recipient name/address/GSTIN if registered; for unregistered recipients: name, address, state when taxable value ≥ ₹50,000; HSN; description; quantity + UQC; total value; taxable value; rate & amount of CGST/SGST/IGST; place of supply; reverse-charge flag; signature. Below ₹200 to unregistered buyer no invoice needed unless demanded — consolidated daily invoice allowed (s.31(3)(b)). Rule 46A: one Invoice-cum-Bill of Supply when taxable + exempt items go to the same B2C customer. Sources: https://taxguru.in/goods-and-service-tax/tax-invoice-requirements-section-31-cgst-act-gst-rule-46.html ; https://cleartax.in/v/gst/gst-rules/cgst-rule-46a-invoice-cum-bill-of-supply
- **HSN digits (Notif. 78/2020):** AATO ≤ ₹5 cr → 4-digit HSN mandatory on B2B, optional on B2C; > ₹5 cr → 6-digit on all. GSTR-1 Table 12 (from May-2025) split into B2B and B2C tabs with dropdown HSN; Table 13 document summary mandatory. Sources: https://www.caclubindia.com/guide/reporting-of-hsn-codes-in-gstr-1/
- **GSTR-1 / 3B data:** B2B invoice-wise, B2C-large, B2C-others (state+rate-wise aggregate), credit/debit notes, nil/exempt summary, HSN summary, document series. 3B needs outward totals and ITC available/reversed (incl. reversals for expired-stock write-offs under s.17(5)(h)).
- **Credit notes (s.34):** report by 30 November following the FY; from 1 Oct 2025 supplier's tax reduction conditional on registered recipient reversing ITC via IMS. Sources: https://taxguru.in/goods-and-service-tax/section-34-understanding-credit-notes-gst.html
- **Expired-goods returns — CBIC Circular 72/46/2018-GST:** (a) return as fresh supply — retailer issues tax invoice at original purchase value (composition dealer issues bill of supply); or (b) supplier issues a credit note; retailer reverses ITC if within the s.34 window. Purchase-return module needs both document types and an ITC-reversal ledger. Source: https://cbic-gst.gov.in/pdf/Circular-72-46-EXPIRED-DRUGS.pdf

---

## 5. DPCO 2013 / NPPA
- Para 16: ceiling prices revised annually by WPI on/before 1 April; para 20: non-scheduled MRP may not rise >10% in 12 months; **para 24: retailer must display the price list (Form V)**; **para 26: no sale above the price list or label MRP, whichever is less**; para 28: dealer may not refuse to sell a drug in stock. Overcharging recoverable with interest. [M]
- Implication: MRP captured **per batch**, never sold above it; allow "sell below printed MRP" when revisions lower the ceiling; a **price-revision watchlist** is [R]. Sources: https://indiankanoon.org/doc/32366040/ ; https://www.pib.gov.in/PressReleasePage.aspx?PRID=2038955

---

## 6. Data protection & digital health

### 6.1 DPDP Act 2023 + DPDP Rules 2025
- Rules notified 13/14 Nov 2025. Phasing: Phase 1 (14 Nov 2025) Data Protection Board; Phase 2 (14 Nov 2026) consent-manager registration; **Phase 3 (13/14 May 2027) all substantive obligations** — notice/consent, security safeguards, breach reporting, children's data, retention/erasure, rights. [D → M in 2027]
- Key obligations once live: itemised plain-language **notice** (Rule 3); **consent** unless a legitimate use applies (e.g., processing required to comply with law — the Rule 65 register data — or medical emergency); **security safeguards** — encryption, access control, monitoring, backups, processor contracts, **logs retained ≥ 1 year** (Rule 6); **breach**: inform individuals and the Board without delay, detailed report within **72 hours** (Rule 7); erase when purpose served unless law requires retention (Rule 8); **children (<18): verifiable parental consent**, with a healthcare exemption (Rule 10); grievance response ≤ 90 days; rights of access, correction, erasure, nomination. No "sensitive data" tier.
- Penalties: up to ₹250 cr (security), ₹200 cr (breach notification), ₹200 cr (children), ₹50 cr other.
- **IT Act s.43A / SPDI Rules 2011 repealed effective 13 May 2027.** Until then SPDI Rules apply: medical records and health condition are Sensitive Personal Data; published privacy policy, consent for collection, purpose limitation, reasonable security practices, no retention beyond need. [M today]
Sources: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ; https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/ ; https://www.snrlaw.in/indias-digital-personal-data-protection-regime-takes-effect/ ; https://www.scrut.io/post/dpdp-rules ; https://www.dpdpa.com/theschedule.html ; https://indiankanoon.org/doc/101774797/

Practical read-across: patient name/address for H1/X registers is lawful under "compliance with law" but still needs notice; keep register data for the statutory period even if a customer requests erasure; log access to Rx/patient records; encrypt at rest; 72-hour breach runbook; parental-consent flag when storing a minor's data for loyalty/marketing.

### 6.2 ABDM — voluntary for a private retail pharmacy
- HFR registration is free and voluntary; "Pharmacy" is a listed facility type. ABHA linking voluntary. NHA mandated ABDM integration only for PM-JAY-empanelled providers. [R]
- Integration path: NHA sandbox milestones M1 (ABHA create/verify), M2 (HIP — push records as FHIR bundles), M3 (HIU — fetch with consent); HL7 FHIR R4 with ABDM profiles. [R / D]
Sources: https://abdm.gov.in/strapicms/uploads/Health_Facility_Registry_SOP_b40e4bb9be.pdf ; https://nirmitee.io/blog/abdm-integration-milestones-m1-m2-m3-m4-multi-software-guide/
- **E-prescriptions:** Telemedicine Practice Guidelines 2020 — RMP sends a signed digital prescription; transmitting directly to a pharmacy needs patient consent; Schedule X and NDPS drugs cannot be prescribed via telemedicine. The 26 Mar 2020 MoHFW notification permitting doorstep delivery against emailed prescriptions (Rx valid 30 days, 7 days acute) is still in force; DTAB sub-committee (May 2025) recommended continuing it. [M, contested] Sources: https://www.mondaq.com/india/healthcare/921874/telemedicine-practice-guidelines ; https://medicaldialogues.in/news/industry/pharma/dtab-panel-recommends-continuing-doorstep-medicine-delivery-amid-e-pharmacy-concerns-179132

---

## 7. Record retention, audit trail, e-pharmacy status

| Record | Minimum retention | Basis |
|---|---|---|
| Schedule H1 register | **3 years** | Rule 65(3)(h) [M] |
| Prescription register (H/C/X) | ≥ 2 years from last entry [?] | Rule 65(3) |
| Schedule X duplicate Rx | **2 years** | Rule 65(9) [M] |
| Wholesale memos & purchase records | **3 years** | Rule 65(5) [M] |
| NDPS Form 3C/3D/3E | 2 years from last entry | NDPS Rules Ch. VA [M] |
| PCI prescription/patient record | **5 years**; produce within 72 h | PCI PPR 2015 reg 6.2 [M for the RP] |
| GST books, invoices, credit notes, stock register | **72 months from due date of annual return** (FY 2025-26 kept till 31 Dec 2032) | CGST s.36 [M] |
| Income-tax books | 6 years (1961 Act); Income-tax Act 2025 → 7 tax years [?]; practical floor **8 years** | https://www.incometaxindia.gov.in/w/rule-6f |
| DPDP processing logs | ≥ 1 year | DPDP Rule 6 [D→M May 2027] |

- **Tamper-evidence — CGST Rule 56(8)** [M]: entries may not be erased/overwritten; **"where the registers … are maintained electronically, a log of every entry edited or deleted shall be maintained."** Rule 57: electronic records need backups, producible on demand in readable form. This is the legal basis for an append-only audit log. Sources: https://gstzen.in/a/maintenance-of-accounts-by-registered-persons-cgst-rule-56.html ; https://cleartax.in/v/gst/gst-rules/cgst-rule-57-generation-and-maintenance-of-electronic-records
- **MCA audit-trail mandate** (Companies (Accounts) Rules, from 1 Apr 2023): accounting software must record an audit trail with an edit log that cannot be disabled — applies only if the pharmacy is a company [M for companies; R otherwise]. Source: https://www.india-briefing.com/news/india-mandates-audit-trail-compliance-for-all-companies-explainer-key-obligations-34837.html/
- **Digital H1 register acceptability:** not expressly authorised or prohibited; inspectors expect it printable in register format, batch-linked, tamper-evident [S/R].
- **E-pharmacy rules:** 2018 draft Rules never notified; 2023 Bill not enacted; no binding e-pharmacy regulation [D]. An offline licensed store using a web/PWA billing system needs no additional licence, as long as sales are effected from the licensed premises under RP supervision. Sources: https://www.scconline.com/blog/post/2023/11/02/regulation-of-online-pharmacies-in-india/ ; https://spiceroutelegal.com/publications/regulation-of-e-pharmacies-in-india/

---

## 8. Barcoding / track-and-trace
- **Schedule H2, GSR 823(E), in force 1 Aug 2023** [M for manufacturers]: top-300 brands carry a Bar Code or QR on the primary pack encoding: unique product ID, generic name, brand name, manufacturer name & address, batch no., mfg date, expiry date, manufacturing licence no. **No format/symbology standard is prescribed**; no central verification database. Sources: CDSCO FAQ — https://thehealthmaster.com/wp-content/uploads/2023/07/FAQS-by-CDSCO-on-25-07-2023-On-Implementation-of-GSR-823E-dt.-17-11-2022-with-respect-to-Bar-Code-or-QR-Code-on-Top-300-Brands.pdf
- **Expansion — Drugs (Seventh Amendment) Rules 2026, GSR 506(E) 22 Jun 2026:** adds all vaccines, all NDPS drugs, all anticancer drugs (from 1 Jul 2027) and all antimicrobials (from 1 Jul 2028) [D until then]. Sources: https://medicaldialogues.in/news/industry/pharma/health-ministry-brings-vaccines-antibiotics-cancer-drugs-under-qr-code-tracking-framework-173735
- DGFT export track-and-trace withdrawn Jan 2025.
- **Scanner design:** expect (a) plain EAN-13 (GTIN only), (b) GS1 DataMatrix/QR with AIs 01 GTIN, 10 batch, 17 expiry YYMMDD, 11 mfg, 21 serial, (c) proprietary QR payloads, (d) legacy 1D on cartons. Parser: try GS1 AI parsing first, fall back to regex for batch/expiry keys, always let the operator confirm batch+expiry manually [R].

---

## 9. Other items a compliance reviewer will look for
- **Cold-chain / temperature logs:** no central retail rule; Rule 64 premises conditions require adequate storage; CDSCO Good Distribution Practices expect temperature monitoring records. Treat twice-daily fridge log with excursion alerts as [S/R]. Sources: https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/Guidance_doc/GDP.pdf
- **Expired-drug segregation & disposal:** Rule 65(17) [M]; CDSCO guidance on disposal (26 May 2025) [R]: segregate, record, return up the chain; Biomedical Waste Rules 2016 for final disposal. Software: expiry quarantine status, non-saleable flag, return-to-supplier documents, disposal log. Source: https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadPublic_NoticesFiles/Guidance%20document%20on%20disposal.pdf
- **FSSAI:** selling nutraceuticals/supplements → FSSAI registration (turnover ≤ ₹12 lakh) or State licence (> ₹12 lakh); print FSSAI no. on invoices for food items [M if sold] [?] thresholds.
- **Legal Metrology (Packaged Commodities) Rules 2011:** Rule 26 exempts DPCO formulations; medical devices notified as drugs are NOT exempt [?]. For FMCG/devices/supplements: MRP inclusive of taxes, net qty, manufacturer, month-year of manufacture; Rule 18(2): no retailer may sell above declared MRP. Source: https://indiankanoon.org/doc/16907015/
- **Pharmacy Practice Regulations 2015 (PCI)** [M for the RP]: RP details displayed (3.3); no substitution without RMP consent (4.3, 13(c)); pharmaceutical assessment for every Rx (9.1); patient confidentiality (9.1(c)); counselling (9.3); prescription records 5 years, "efforts shall be made to computerize" (6.2).

## Items not verified from a primary source [?]
1. Verbatim retention period of the general Rule 65(3) prescription register.
2. Verbatim text of NDPS Rule 66(1)/(2).
3. Exact DPDP Rules gazette date (13 vs 14 Nov 2025).
4. Income-tax Act 2025 seven-year retention.
5. FSSAI retailer thresholds for a chemist selling supplements.
6. 2025 LMPC amendment status for medical devices.
7. Any state FDA circular formally requiring pharmacist name/registration number on bills.
