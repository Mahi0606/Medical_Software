import { storeSchema, type StoreInput } from '@pharma/shared';

export interface Licence { id: number; branchId: number; type: string; number: string; issuedBy: string | null; issuedOn: string | null; validTill: string | null; retentionFeeDue: string | null; notes: string | null; createdAt: string }

export interface Store {
  id: number; name: string; legalName: string | null; addressLine1: string; addressLine2: string | null; city: string; state: string; stateCode: string; pincode: string; phone: string; email: string | null; gstin: string | null;
  gstScheme: 'regular' | 'composition'; invoicePrefix: string; pharmacistName: string | null; pharmacistRegNo: string | null; pharmacistCouncil: string | null; footerNote: string | null; upiId: string | null;
  printFormat: 'thermal80' | 'thermal58' | 'a5' | 'a4'; nearExpiryDays: number; maxDiscountPctClerk: number; maxDiscountPctPharmacist: number; setupComplete: boolean; updatedAt: string | null; licences: Licence[];
}

/** Only the keys PUT /store accepts, so a partial edit (e.g. printing) can be merged into the full record. */
export function storeBody(store: Store, patch: Partial<StoreInput> = {}): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...store, ...patch };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(storeSchema.shape)) out[k] = merged[k] ?? null;
  return out;
}

/** GST state codes (Notification 1/2017 list, as amended for J&K/Ladakh and the merged DNH & DD). */
export const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' }, { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' }, { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' }, { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' }, { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' }, { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' }, { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' }, { code: '35', name: 'Andaman & Nicobar Islands' }, { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' }, { code: '97', name: 'Other Territory' },
];

export const ROLE_LABELS: Record<string, string> = { owner: 'Owner', pharmacist: 'Pharmacist', clerk: 'Clerk' };
export const PRINT_FORMATS: { value: Store['printFormat']; label: string; hint: string }[] = [
  { value: 'thermal80', label: '80 mm thermal roll', hint: 'Most counter printers (TVS, Epson TM series)' },
  { value: 'thermal58', label: '58 mm thermal roll', hint: 'Compact printers; fewer characters per line' },
  { value: 'a5', label: 'A5 sheet', hint: 'Half-page bill on a laser or inkjet printer' },
  { value: 'a4', label: 'A4 sheet', hint: 'Full-page GST tax invoice' },
];
