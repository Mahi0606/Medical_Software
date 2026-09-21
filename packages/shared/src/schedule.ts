/**
 * Drugs & Cosmetics Rules 1945 schedules that affect retail sale.
 * NONE = no prescription required (India has no formal OTC category).
 */
export const SCHEDULES = ['NONE', 'G', 'H', 'H1', 'X'] as const;
export type Schedule = (typeof SCHEDULES)[number];

export interface ScheduleRequirements {
  rxRequired: boolean;
  prescriberNameRequired: boolean;
  prescriberRegNoRequired: boolean;
  patientNameRequired: boolean;
  patientAddressRequired: boolean;
  pharmacistRequired: boolean;
  /** Which statutory register receives the sale line. */
  register: 'RX' | 'H1' | 'X' | null;
  /** Schedule X: prescription in duplicate, one copy retained 2 years. */
  duplicateRxRetained: boolean;
  /** Human-readable, affirmative (ISMP) label for the counter. */
  label: string;
}

export function scheduleRequirements(s: Schedule): ScheduleRequirements {
  switch (s) {
    case 'X':
      return { rxRequired: true, prescriberNameRequired: true, prescriberRegNoRequired: true, patientNameRequired: true, patientAddressRequired: true, pharmacistRequired: true, register: 'X', duplicateRxRetained: true, label: 'Schedule X: prescription in duplicate, pharmacist sign-off, X register' };
    case 'H1':
      return { rxRequired: true, prescriberNameRequired: true, prescriberRegNoRequired: true, patientNameRequired: true, patientAddressRequired: true, pharmacistRequired: true, register: 'H1', duplicateRxRetained: false, label: 'Schedule H1: prescription and H1 register entry required' };
    case 'H':
      return { rxRequired: true, prescriberNameRequired: true, prescriberRegNoRequired: false, patientNameRequired: true, patientAddressRequired: false, pharmacistRequired: true, register: 'RX', duplicateRxRetained: false, label: 'Schedule H: prescription required' };
    case 'G':
      return { rxRequired: false, prescriberNameRequired: false, prescriberRegNoRequired: false, patientNameRequired: false, patientAddressRequired: false, pharmacistRequired: false, register: null, duplicateRxRetained: false, label: 'Schedule G: take under medical supervision' };
    default:
      return { rxRequired: false, prescriberNameRequired: false, prescriberRegNoRequired: false, patientNameRequired: false, patientAddressRequired: false, pharmacistRequired: false, register: null, duplicateRxRetained: false, label: '' };
  }
}

/** Rank so the strictest schedule in a cart wins. */
export function strictestSchedule(list: Schedule[]): Schedule {
  const order: Schedule[] = ['NONE', 'G', 'H', 'H1', 'X'];
  return list.reduce<Schedule>((acc, s) => (order.indexOf(s) > order.indexOf(acc) ? s : acc), 'NONE');
}

export interface RxDetails {
  doctorName?: string | null;
  doctorRegNo?: string | null;
  patientName?: string | null;
  patientAddress?: string | null;
  prescriptionRef?: string | null;
}

/** Returns the list of missing fields for the strictest schedule in the cart. */
export function missingRxFields(schedule: Schedule, rx: RxDetails, pharmacistOnDuty: boolean): string[] {
  const req = scheduleRequirements(schedule);
  const missing: string[] = [];
  if (req.pharmacistRequired && !pharmacistOnDuty) missing.push('A registered pharmacist must be on duty');
  if (req.prescriberNameRequired && !rx.doctorName?.trim()) missing.push("Prescriber's name");
  if (req.prescriberRegNoRequired && !rx.doctorRegNo?.trim()) missing.push("Prescriber's registration number");
  if (req.patientNameRequired && !rx.patientName?.trim()) missing.push("Patient's name");
  if (req.patientAddressRequired && !rx.patientAddress?.trim()) missing.push("Patient's address");
  return missing;
}
