# Barcode label printing for a retail pharmacy — research findings

Research date: 19 Sep 2026.

## 1. What incumbents print
- Marg ERP label format: default fields are Item Name, Item MRP and barcode (Item Code can replace name); label content sized in mm (example 48 × 24 mm), with columns-across, rows-per-label and gap settings; barcode field must be wrapped in asterisks in the template (https://care.margcompusoft.com/margerp/label/142448/1/How-we-can-design-label). Item-wise barcode printing is launched from Item Master or Inventory Reports; user enters number of labels, and can add date and a remark field (https://care.margcompusoft.com/margerp/barcode-queries/2048/1/How-to-print-item-wise).
- GoFrugal RPOS: supports direct thermal, thermal transfer and laser printers; label fields include product code, selling price, expiry date (MM/YY default, DD/MM/YY option), packing date, currency symbol, quantity; item text up to 20 characters; adjustable barcode width; optional rate validation before printing (https://community.gofrugal.com/portal/en/kb/articles/barcode-printer).
- Pharmacy label vendors list drug name, batch number, mfg and expiry date, barcode/QR, MRP, dosage instructions as standard printed elements (https://www.multipacklabels.com/pharmaceutical-labels.html).

## 2. Label sizes and stock
- Common Indian retail sticker sizes: 38 × 25 mm (small items), 50 × 25 mm (2" × 1"), 50 × 38 mm, 75 × 50 mm (https://www.hprt.com/blog/Guide-to-Create-Print-MRP-Barcode-Stickers-in-India.html). 50 × 25 mm direct-thermal rolls of 1000 are commodity items (https://www.meesho.com/50mm-x-25mm-direct-thermal-barcode-label-sticker-2-x-1-1000-labels-per-roll-white-self-adhesive-sticker-for-printing-barcode-and-mrp-pack-of-1/p/4a7c9w). 38 × 25 two-up rolls are the usual pharmacy choice because strips are small.
- Thermal transfer (ribbon) is preferred over direct thermal for durability in Indian heat; direct thermal is fine for short-lived shelf stock (HPRT guide above).

## 3. Printers and command languages
- TVS LP46 family (Neo/Lite/Plus): 203 dpi, 4" max width, TSPL-EZ compatible with EPL, ZPL and ZPL II emulation; ₹12,900–16,500 (https://www.tvselectronics.in/products/lp-46-lite ; https://annatechinc.com/tvs-electronics-lp-46-neo-label-and-barcode-printer/). TSC TE244 and Zebra desktop printers are the other common units (https://www.dash-international.in/barcode-printer.html).
- Practical consequence: one TSPL template covers most Indian counter printers; ZPL as the second dialect covers Zebra.

## 4. Printing from a web app — three routes
| Route | How | Pros | Cons |
|---|---|---|---|
| OS driver + browser print | Render label as HTML with `@page { size: 50mm 25mm; margin: 0 }`, print via the installed Windows/macOS driver | Zero install beyond the driver the store already has; any printer; same code renders on-screen preview | Print dialog unless kiosk flag; slower per label; driver-level scaling quirks |
| Raw TSPL/ZPL over WebUSB | `navigator.usb.requestDevice()`, claim interface, `transferOut` a TSPL string (`SIZE`, `GAP`, `CLS`, `TEXT`, `BARCODE`, `PRINT`) | Fastest, pixel-exact, no dialog | Chrome/Edge only; HTTPS required; Windows often needs Zadig/WinUSB driver swap which then breaks the normal driver (https://hackernoon.com/exploring-the-webusb-api-connecting-to-usb-devices-and-printing-with-tspltspl2) |
| Local print agent (QZ Tray, Zebra Browser Print) | Small desktop app bridges browser to local printers; web app sends raw commands over websocket | Works in all browsers; raw speed; also handles ESC/POS receipts and cash drawer | Must be installed on each workstation; QZ Tray needs a signing certificate for silent printing (https://qz.io/docs/getting-started ; https://developer.zebra.com/content/print-web-application) |

## 5. What to encode in the barcode
- GS1: pharmaceutical items are identified by GTIN + batch + expiry, encoded as AI (01), (10), (17) in a GS1 DataMatrix or GS1-128; human-readable titles GTIN / EXP / LOT may be printed in place of AIs (https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf ; https://www.gs1.org/docs/barcodes/GSCN_21-040_HealthcareExpDate.pdf).
- In-store practice: a Code 128 barcode carrying an internal code. Encoding a **batch-level** code (rather than item-level) lets one scan resolve item, batch and expiry at billing, which is what the Schedule H2 QR already does for top-300 brands. EAN-13 is the retail norm for manufacturer codes and should be stored on the item so manufacturer barcodes also scan (https://www.hprt.com/blog/Guide-to-Create-Print-MRP-Barcode-Stickers-in-India.html).

## 6. Legal points that touch the label
- Drugs Rule 65(19): loose-dispensed or repacked drugs must carry a label with drug name, quantity and dealer name/address (see compliance report §1.5).
- Legal Metrology (Packaged Commodities) Rules 2011: DPCO formulations are exempt (Rule 26) but non-drug items need MRP inclusive of all taxes, net quantity, manufacturer/packer, month-year of manufacture; a retailer sticker must never show an MRP above, or obscure, the manufacturer's printed MRP (Rule 18(2)).
- DPCO para 26: the label MRP must equal the batch MRP in the system; never a higher figure.

## 7. Recommended default label structure (derived)
Product / batch label, 50 × 25 mm (one-up) and 38 × 25 mm (two-up):
1. Line 1: item name + strength (bold, ISMP order: name, strength, form; Tall Man where applicable), truncated with ellipsis
2. Line 2: `B.No ABC123  Exp 08/27`
3. Line 3: `MRP ₹125.00 (incl. all taxes)  Pack 10s`
4. Barcode: Code 128, encoding the batch code; human-readable digits beneath; optional GS1 DataMatrix variant when GTIN is known
5. Optional footer: store short name, packing date

Loose-dispense label, 50 × 25 mm: drug name + strength, quantity dispensed, batch, expiry, store name + address, optional patient name and directions.

Store-configurable: label size, fields on/off, font scale, barcode symbology, number of labels (defaults to received quantity at GRN), printer route.
