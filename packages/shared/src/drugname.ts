/**
 * ISMP-style presentation of drug names: name, then strength, then form.
 * Tall Man lettering for common look-alike pairs (ISMP / FDA lists).
 */
const TALL_MAN: Record<string, string> = {
  hydralazine: 'hydrALAZINE', hydromorphone: 'HYDROmorphone', hydroxyzine: 'hydrOXYzine',
  prednisone: 'predniSONE', prednisolone: 'prednisoLONE', methylprednisolone: 'methylPREDNISolone',
  glipizide: 'glipiZIDE', glyburide: 'glyBURIDE', glimepiride: 'glimepiRIDE',
  dopamine: 'DOPamine', dobutamine: 'DOBUTamine',
  vincristine: 'vinCRIStine', vinblastine: 'vinBLAStine',
  tramadol: 'traMADol', trazodone: 'traZODone',
  bupropion: 'buPROPion', buspirone: 'busPIRone',
  nifedipine: 'NIFEdipine', nicardipine: 'niCARdipine', nimodipine: 'niMODipine',
  ceftriaxone: 'cefTRIAXone', cefazolin: 'ceFAZolin', ceftazidime: 'cefTAZidime', cefuroxime: 'cefUROXime', cefoxitin: 'ceFOXitin',
  amlodipine: 'amLODIPine', amiloride: 'aMILoride',
  alprazolam: 'ALPRAZolam', lorazepam: 'LORazepam', clonazepam: 'clonazePAM', diazepam: 'diazePAM',
  carbamazepine: 'carBAMazepine', oxcarbazepine: 'OXcarbazepine',
  metformin: 'metFORMIN', metronidazole: 'metroNIDAZOLE',
  chlorpromazine: 'chlorproMAZINE', chlorpropamide: 'chlorproPAMIDE',
  clomiphene: 'clomiPHENE', clomipramine: 'clomiPRAMINE',
  dimenhydrinate: 'dimenhyDRINATE', diphenhydramine: 'diphenhydrAMINE',
  fluoxetine: 'FLUoxetine', fluvoxamine: 'fluvoxaMINE', paroxetine: 'PARoxetine',
  lamivudine: 'lamiVUDine', lamotrigine: 'lamoTRIgine',
  levetiracetam: 'levETIRAcetam', levocarnitine: 'levOCARNitine',
  risperidone: 'risperiDONE', ropinirole: 'rOPINIRole',
  sulfadiazine: 'sulfADIAZINE', sulfasalazine: 'sulfaSALAzine',
  tizanidine: 'tiZANidine', tiagabine: 'tiaGABine',
  quinine: 'quiNINE', quinidine: 'quiNIDine',
  doxorubicin: 'DOXOrubicin', daunorubicin: 'DAUNOrubicin', idarubicin: 'IDArubicin',
  hydrocodone: 'HYDROcodone', oxycodone: 'oxyCODONE', oxymorphone: 'oxyMORphone',
  penicillamine: 'penicillAMINE',
};

export function tallMan(genericName: string): string {
  const key = genericName.trim().toLowerCase();
  return TALL_MAN[key] ?? genericName;
}

export function hasTallMan(genericName: string): boolean {
  return Object.prototype.hasOwnProperty.call(TALL_MAN, genericName.trim().toLowerCase());
}

/** "500 mg" — no trailing zeros, space between number and unit. */
export function formatStrength(value: number | string | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'string' ? Number(value) : value;
  const v = Number.isFinite(n) ? String(Number(n.toFixed(4))) : String(value);
  return unit ? `${v} ${unit}` : v;
}

export function displayGenericName(salts: { salt: string; strength?: number | string | null; unit?: string | null }[]): string {
  return salts
    .map((s) => {
      const st = formatStrength(s.strength, s.unit);
      return st ? `${tallMan(s.salt)} ${st}` : tallMan(s.salt);
    })
    .join(' + ');
}
