# Pharmacy / Medical-Store Software: Evidence-Backed Feature Inventory (India focus)

Research date: 19 Sep 2026.

Sources read: Marg ERP (dealer mirror of feature page, care KB, SoftwareSuggest listing, Capterra + SoftwareSuggest + Trustpilot reviews), GoFrugal RetailEasy Pharmacy (product page, H1 blog, expiry blog, Capterra + SoftwareSuggest reviews), Medeil (site, SoftwareSuggest, Capterra reviews), Vyapar (pharmacy page, Capterra reviews), myBillBook (pharmacy page, Capterra reviews), Halemind (product page, GetApp), EasySol (chemist page, Techjockey reviews), SWIL/RetailGraph (product page), PharmaSoft, Medicin, eVitalRx (site, Techjockey reviews), Pharmacy Pro, PharmOS; global: PioneerRx, Liberty PharmacyOne, Computer-Rx; buyer-side: Capterra pharmacy category, SoftwareSuggest category, pioma/adrine/codingclave buyer guides, clotouch Rule-65 checklist; domain: GS1 India barcoding guide (PDF), hello-pharma barcode mandate summary, ShelfLifePro H1 register guide, Terra Insight stockist reconciliation, invoicedataextraction distributor-invoice anatomy, PTR/PTS calculators. Main margcompusoft.com pages could not be fetched (TLS cert failure); Marg claims come from its care KB, a dealer mirror page, and third-party listings.

---

## 1. CORE features (present in essentially every Indian product)

### 1.1 Item master + batch-wise inventory with expiry and MRP
- Every product tracks stock per batch with batch no., mfg date, expiry date and MRP as batch attributes, not item attributes. SWIL: "Track every drug batch with manufacturing date, expiry date, and MRP" (https://www.swindia.com/product/pharmacy-software/). Vyapar: "Record batch number for every product at the time of billing", "Display expiry date on invoices" (https://vyaparapp.in/free/billing-software-for-retail-shop/pharmacy). myBillBook: "Manage medicine inventory at strip and batch level" (https://mybillbook.in/s/pharmacy-billing-software/).
- Why MRP is per batch: MRP printed on the pack changes across batches (DPCO/NLEM ceilings, GST rate changes, trade schemes); the retailer must sell at the MRP printed on that batch's pack. Terra Insight lists "MRP recompute trigger" events and says batch-level cost variations "demand separate tracking rather than SKU-average costing" (https://www.terra-insight.com/insights/pharmacy-stockist-reconciliation-india/). Buyer guide: without batch-level tracking "the same item across different expiries collapses into one line and you lose visibility" (https://www.pioma.in/post/pharmacy-billing-software-in-india-buyer-s-guide-2026). Recurring Vyapar complaint: "you have to enter the expiry date every time you receive a new batch of the same product—there's no batch-level tracking" (https://smallretailai.com/vyapar-app-review-for-small-retail/).
- Legal grounding: Rule 65 requires that for Schedule C/H/H1 drugs "the record must give the name of the manufacturer, the batch number and the expiry date" (https://clotouch.com/blog/discover-7-best-pharmacy-pos-software-solutions-business-bbb/).
- Multi-unit (strip vs loose tablet). Marg "Multi Unit billing": item master holds a conversion (e.g. 10 tablets per strip), "Unit-2 Name" = Strip; the item can then be sold "in both strip and tablet options" (https://care.margcompusoft.com/margerp/inventory/2001/1/How-we-can-enable-multi). PharmOS: "Box / strip / loose unit picker" (https://pharmos.app/). Loose rate = strip rate / units per strip (https://www.raseedapp.com/blog/pharmacy-billing-software/).
- Rack/shelf location on item master: Marg "Batch And Rack Management" (https://www.softwaresuggest.com/marg-pharmacy); GoFrugal "Rack and shelf management to pick products efficiently during checkout" (https://www.gofrugal.com/retail/pharmacy-software/); Vyapar "rack-wise tracking"; PharmOS "godown / rack / bin".
- Pre-loaded medicine database (brand, salt/composition, manufacturer, pack, HSN, GST%): Marg "5 lakh+ medicines" searchable "by salt, substitute, and HSN code"; GoFrugal "50,000+ prefilled drug database"; Medeil "135,000 drug list inbuilt with generic names" (https://www.softwaresuggest.com/medeil); eVitalRx "4,00,000+ medicines with salt contents and images"; Pharmacy Pro "2,00,000+ Product Master with images, substitutes and salt-level search" (https://pharmacypro.io/).
- Schedule classification on item (H, H1, X, narcotic) used to gate sales.

### 1.2 POS billing / sales invoice (GST tax invoice)
- Item search by brand name, salt/composition, barcode, item code, rack; batch picker showing expiry/MRP/qty; FEFO default. EasySol: "Pop-up message for short expiry and lower MRP" at billing; "Prevents expired and banned item sales with automated locks" (https://easysol.in/chemist-software.html). GoFrugal: "block drugs with shorter expiry during inward and sales". Rule-65 checklist expects the system to "block (not warn of) expired batches" (clotouch).
- Keyboard-driven: Marg claims "keyboard shortcuts to enhance billing speed by 40%"; SWIL "Bill in under 10 seconds"; PharmOS "Counter billing in 12 seconds". Full Marg hotkey list: https://care.margcompusoft.com/margerp/general-queries/166661/1/SHORTCU
- Invoice content specific to India: GST slabs on medicines Nil/5%/12%/18% (pre Sept-2025; see compliance doc), HSN 3004 for retail medicaments (https://invoicedataextraction.com/blog/india-pharma-distributor-invoice-batch-expiry-extraction), item-wise batch + expiry printed on the bill, drug licence number on every bill (Vyapar: "Add drug license number directly to invoices"). Discount per line and on bill; MRP-inclusive pricing (tax back-calculated).
- Payment modes: cash / card / UPI / credit (udhaar) with split. Marg "PAY NOW link" on WhatsApp bill; UPI QR on invoice is common (https://docs.payu.in/reference/print-invoice-qr-api).
- Print: A4/A5 and thermal 58mm/80mm formats (https://vyaparapp.in/free/billing-software-for-retail-shop/thermal-printer). Hardware at counter: barcode scanner (₹2–4k), thermal printer (₹3.5–7k), cash drawer, UPS (pioma).
- Sales return / credit note against a bill: Medicin "Automatic Sale & Sale Return Module", "GST Based CN Management" (https://www.medicinsoftware.com/pharmacy-management-software).
- Held bills / multiple counters: Medicin "11 Sales Counters Facility"; buyer guide asks for "Counter-wise user roles (pharmacist vs assistant)" (pioma).
- Re-bill from history: EasySol "New sale invoice generation from customer's previous invoice", "Quick invoice generation from customer's prescription".

### 1.3 Purchase entry / GRN, with schemes and free goods
- Distributor invoice line anatomy: item, HSN, batch, mfg/expiry, pack size, paid qty, free qty, PTR (rate), MRP, discount %, GST %, line amount. "Free quantity must be captured as a distinct column on the same row as the paid quantity, tied to the same item and the same batch" so cost is weighted correctly (invoicedataextraction).
- Scheme types: quantity deals "10+1", "20+2"; Marg "Deal+ Free" auto-calculates on purchase (https://care.margcompusoft.com/margerp/rate-and-discount-master/165042/1/Sales-Scheme-on-Purchase-Discount). PharmOS offers "five scheme types".
- Purchase import: Marg imports purchase from Excel/DBF/CSV and via Retailio integration (https://care.margcompusoft.com/margerp/transaction-import/153/1/What-is-the-procedure-to); EasySol "Purchase Import from email and FTP Server"; Medicin "Automatic Purchase (.csv / .txt) from email"; Pharmacy Pro "Auto-import distributor invoices from email"; eVitalRx users cite "CSV upload and barcode scanning, which saves my data entry time" (https://www.techjockey.com/reviews/evitalrx).
- Purchase rate/MRP checks: GoFrugal "Purchase rate discrepancy summary"; EasySol flags "Non-supplied, Short-supplied and Excess-supplied items" vs order; GoFrugal warns on short-expiry inward (https://www.gofrugal.com/blog/pharmacy-expiry-management/).
- Margin math: retailer margin ~16–20% on MRP (~6% trade margin on some H1 antibiotics), stockist 8–10%, PTR = (MRP − margin)/(1+GST) (https://www.nilrisepharma.com/ptr-and-pts-calculator).

### 1.4 Supplier management and purchase returns (expiry/breakage)
- Supplier master with ledger, outstanding, payment tracking, supplier-wise discounts (EasySol; Vyapar "Party-Wise Ledger").
- Expiry return to distributor is a first-class flow: EasySol "Quick Searching of Expiries and transfer to respective suppliers"; GoFrugal "distributor wise item list feature", returns valued "based on MRP, purchase rate or landing cost", then "a credit note" from the distributor. Trade reality: manufacturer caps returns (~5% of offtake), breakage allowance 0.5–2%, credit arrives 30–60 days later (Terra Insight). GST: supplier issues credit note; ITC reversal on buyer side (https://www.mastersindia.co/blog/return-of-expired-drugs-medicine-under-gst/).

### 1.5 Customers, credit (udhaar), prescriptions
- Customer master with phone as key, purchase history, outstanding/credit sales; payment reminders on WhatsApp (myBillBook); SWIL "Maintain complete purchase records per patient".
- Prescription capture: doctor name + patient linked to bill; GoFrugal "automatically refill customers' prescribed medicines during a specified period"; EasySol "daily reminder four days before the due date"; Medicin "Patient Repeat Purchase Alert". Prescription image storage recommended by H1 guides.

### 1.6 Reports
Day book / cash-counter close (EasySol "Day Check List"), sales/purchase registers, GSTR-1/3B summaries (SWIL "GSTR-1 compatible reports"), stock/batch stock, expiry and near-expiry (30/60/90 days), non-moving/slow-moving/dead stock, profit reports "Bill wise, company wise, item wise, customer wise, salt wise" (EasySol), supplier-wise expiry, customer outstanding, user-wise edit/delete audit (Medicin). Medicin advertises "200+ reports", GoFrugal users cite "1000 plus reports" (https://www.capterra.com/p/71693/GoFrugal-POS-Software/reviews/).

### 1.7 Regulatory registers (Schedule H/H1/X, narcotics)
- H1 register per sale: date, brand name, generic name/composition, qty, batch no., patient name + address, prescriber name, prescriber registration no.; 3-year retention; digital register acceptable only if "tamper-proof ... full audit trail" and "printable on demand in exactly this column layout" (https://shelflifepro.in/blog/schedule-h1-drug-register-compliance-guide/). GoFrugal: system "does not allow them to sell without doctor prescription for schedule H1 drugs" (https://www.gofrugal.com/blog/schedule-h1-drugs/). Vyapar: "Only admin or authorised staff can activate restricted medicines". Frequent inspector findings: missing batch numbers, brand without composition, missing doctor reg. no., backdated entries.
- Drug licence expiry tracking (PharmOS "Drug licence tracker with 30/14/7/0-day expiry alerts").

### 1.8 User roles, audit, backup
- Multi-user with rights (EasySol "Multi level user security"; eVitalRx staff logins + "Staff performance reports").
- Backup: Pharmacy Pro "Dual backup — local + Google Drive"; PioneerRx benchmark "Automated backup every 15 minutes both locally and offsite" (https://www.pioneerrx.com/pharmacy-software).

---

## 2. ADVANCED / differentiating features

- Substitute suggestion by salt + strength, filtered to in-stock: Marg, GoFrugal, EasySol, eVitalRx ("suggests generic medicines which are in stock").
- Drug interaction / clinical alerts: rare in Indian retail products. Medeil claims "alerts for drug interactions or controlled substances" (https://www.medeil.com/en/medeil-pharmacy-software/). Global: Liberty "Clinical SmartCheck" with "drug-to-drug, dose check, and allergy checks ... Look alike, sound alike alerts" (https://libertysoftware.com/pharmacy/). Indian pharmacists use standalone checkers (https://www.pharmdinfo.com/community-pharmacist-forum-f255/top-5-drug-interaction-checking-software-programs-for-indian-pharmacists-t4167.html).
- Barcode / 2D QR on Indian packs: since 1 Aug 2023 top-300 brands (Schedule H2) carry a code with GTIN, names, manufacturer, batch, mfg, expiry, licence no. (https://hello-pharma.com/pharma-serialization/india-pharma-barcoding-requirements/). GS1 India recommends GS1 DataMatrix (AIs 01, 17, 10, optionally 21) (https://admin.gs1india.org/uploads/Implementation_Guide_1_ef1188321a.pdf). Other packs have no scannable code, so products print in-house labels (SWIL, Marg, myBillBook).
- WhatsApp/SMS invoice, payment link, refill reminders: Marg, eVitalRx, myBillBook, GoFrugal; PharmOS parses free-text WhatsApp orders into bill lines.
- Reorder automation / PO suggestion: Marg "Generate Reorders on Sale, Minimum Stock, Today's Sale, Zero Stock, or Manually"; GoFrugal min/max with recommended reorder qty; PioneerRx "Usage-Based Ordering".
- Distributor ordering integrations (B2B): Marg "ERP-to-ERP Order" (https://www.margerp.in/); Retailio (PharmEasy B2B) invoice auto-import.
- e-Invoicing / e-Way bill: Marg, myBillBook, Vyapar, PharmOS. Mostly relevant to wholesale side.
- Multi-branch sync / HO: GoFrugal HQ with indents consolidation and inter-outlet transfers; Marg "Data Sync (Per Location)" only in Gold edition.
- Offline mode: desktop incumbents offline-first; cloud players mostly not ("eVitalRx ... can't be used offline"; myBillBook "Offline billing doesn't function properly"). Pharmacy Pro "Hybrid: full offline counter + remote management". Buyer guides list "unreliability without internet connectivity" as a failure mode.
- Doctor-wise sales / commission: GoFrugal, Marg, RetailGraph.
- Loyalty: Medicin, SWIL, eVitalRx, Marg; PioneerRx phone-number loyalty IDs.
- Home delivery / online orders / ONDC: Marg Silver+, Medicin, GoFrugal branded app, eVitalRx (ONDC/Amazon/Flipkart, "VitRun" delivery).
- ABDM/ABHA: eVitalRx claims "NHA-approved, ABDM-compliant, FHIR-compliant". No evidence of mainstream retail POS pushing dispensation records to ABHA yet.
- Tally export / integrated accounting: EasySol and Medicin full accounting; Medicin "Tally Export"; GoFrugal integrates TallyPrime (https://pharmastok.com/blog/tally-vs-pharmacy-software-india).
- Expiry/near-expiry alerts, dead stock, margin analysis dashboards: PharmOS "Near-expiry dashboard with value-at-risk"; GoFrugal "Margin visibility reporting".
- Cashier controls / pilferage: Marg, GoFrugal physical stock audit, Medicin user-wise delete/update report.
- Mobile owner apps: Marg eOwner, GoFrugal WhatsNow, SWIL app, Medicin Owner App.
- Global-only (not needed in India): insurance adjudication, Med Sync, adherence scores, IVR, compounding, LTC eMAR.

---

## 3. Common complaints about existing products

Marg ERP (Trustpilot 2.4/5 from 112 reviews): support and dealer lock-in ("After making the payment, nobody answers my calls"), renewal pricing surprises, "software easily corrupted", "Getting print output in half page" after updates, "Interface is dated — looks like early 2000s software" (https://codingclave.com/blog/best-pharmacy-software-india-2026). Positives: reliable core, keyboard speed, GST filing.

GoFrugal: "Software is a bit slow", "Poor interface design slows transaction processing", high initial cost (https://www.capterra.com/p/71693/GoFrugal-POS-Software/reviews/).

Vyapar: no true batch-level tracking, WhatsApp invoices sent blank, "App hang/lag issues", "data disappeared" after sync (https://www.capterra.com/p/180579/Vyapar/reviews/).

myBillBook: calculation errors, "App crashes during billing", "Offline billing doesn't function properly", settings reset after updates (https://www.capterra.com/p/202732/FloBooks/reviews/).

Medeil: "Limited customization", "unable to manage multi location handling" (https://www.capterra.com/p/117249/Medeil/reviews/).

EasySol: "constrained workflow", "absence of effective search capabilities" (https://www.techjockey.com/reviews/easysol-pharma-software).

eVitalRx: can't work offline; "Can make the app more user friendly" (https://www.techjockey.com/reviews/evitalrx).

Net differentiation signals: (a) responsive support and transparent pricing; (b) offline-capable counter with cloud sync is the unmet middle ground; (c) real batch-level MRP/expiry with strip/loose units; (d) fast keyboard search by brand prefix and salt with in-stock substitutes; (e) frictionless purchase import; (f) H1 register generated automatically with immutable audit trail; (g) don't break print formats or reset settings on updates.

---

## 4. Typical counter billing workflow (Indian retail pharmacy)

1. Open bill / pick customer: walk-in by default; for credit or repeat customers, search by mobile; optional doctor name (mandatory when any H1 item lands on the bill).
2. Find item: type first letters of brand; alternates are salt search, rack code, item code, or scan. If out of stock, show substitutes with same salt+strength that are in stock.
3. Pick batch: FEFO list showing expiry, MRP, available qty (strips and loose), rack; short-expiry flagged; expired batches blocked. Scanning a 2D code selects the batch automatically.
4. Quantity and unit: strips or loose tablets; loose price = strip MRP / units per strip; stock decrements in base units.
5. Price and discount: rate defaults to batch MRP (GST-inclusive); line or bill-level % discount, capped by role; warn if selling below purchase rate. GST back-calculated per line.
6. Schedule checks: for H1/X items prompt for doctor name + registration number and patient address, write H1 register, retain prescription image.
7. Payment: cash / card / UPI QR / credit to customer ledger / split. Change due computed.
8. Print / send: thermal or A4/A5 with dealer name, address, drug licence no., GSTIN, serial bill no., item-wise batch+expiry, tax breakup; WhatsApp PDF. Bill takes ~10–15 s.
9. After sale: stock, customer history, H1 register, day book updated; refill reminder scheduled; returns handled against original bill with credit note.

## Price/positioning references
Marg: ₹8,100 Basic / ₹12,600 Silver / ₹25,200 Gold one-time + AMC; Medeil ₹0/₹700/₹1,600 per month; myBillBook from ₹399/yr; Vyapar ~₹3,399/yr; eVitalRx ~₹3,500–50,000/yr; Pharmacy Pro ₹12–18k one-time; GoFrugal ~₹1,500–7,000/month; cloud SaaS "₹500–1,500/month per counter" (pioma).
