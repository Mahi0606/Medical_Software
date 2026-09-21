import type { InteractionRuleLike } from './interactions.js';

/**
 * Starter interaction set for a retail pharmacy counter. Not exhaustive.
 * Compiled from commonly cited pairs in standard references (BNF interaction appendix,
 * Stockley's, Medscape checker). The pharmacist can edit, add or disable rules in the app.
 */
const SRC = 'Starter set – verify against BNF/Stockley';
const r = (saltA: string, saltB: string, severity: InteractionRuleLike['severity'], message: string, advice: string): InteractionRuleLike => ({ saltA, saltB, severity, message, advice });

export const STARTER_INTERACTION_RULES: InteractionRuleLike[] = [
  // Anticoagulant bleeding risk
  r('warfarin', 'aspirin', 'major', 'Warfarin with aspirin raises bleeding risk sharply.', 'Confirm the prescriber intends both; advise the patient to report any bleeding.'),
  r('warfarin', 'ibuprofen', 'major', 'Warfarin with an NSAID raises the risk of serious bleeding.', 'Prefer paracetamol for pain; check with the prescriber.'),
  r('warfarin', 'diclofenac', 'major', 'Warfarin with an NSAID raises the risk of serious bleeding.', 'Prefer paracetamol for pain; check with the prescriber.'),
  r('warfarin', 'aceclofenac', 'major', 'Warfarin with an NSAID raises the risk of serious bleeding.', 'Prefer paracetamol for pain; check with the prescriber.'),
  r('warfarin', 'azithromycin', 'moderate', 'Azithromycin can increase the effect of warfarin.', 'Advise an INR check within a few days.'),
  r('warfarin', 'ciprofloxacin', 'major', 'Ciprofloxacin increases warfarin levels and bleeding risk.', 'Contact the prescriber; INR monitoring needed.'),
  r('warfarin', 'metronidazole', 'major', 'Metronidazole markedly increases warfarin effect.', 'Contact the prescriber; INR monitoring needed.'),
  r('warfarin', 'fluconazole', 'major', 'Fluconazole markedly increases warfarin effect.', 'Contact the prescriber; INR monitoring needed.'),
  // Nitrates + PDE5
  r('sildenafil', 'isosorbide dinitrate', 'major', 'Sildenafil with a nitrate can cause a dangerous fall in blood pressure.', 'Do not dispense together without the prescriber confirming; separate by at least 24 hours.'),
  r('sildenafil', 'isosorbide mononitrate', 'major', 'Sildenafil with a nitrate can cause a dangerous fall in blood pressure.', 'Do not dispense together without the prescriber confirming.'),
  r('sildenafil', 'nitroglycerin', 'major', 'Sildenafil with a nitrate can cause a dangerous fall in blood pressure.', 'Do not dispense together without the prescriber confirming.'),
  r('tadalafil', 'isosorbide dinitrate', 'major', 'Tadalafil with a nitrate can cause a dangerous fall in blood pressure.', 'Do not dispense together without the prescriber confirming; separate by 48 hours.'),
  r('tadalafil', 'isosorbide mononitrate', 'major', 'Tadalafil with a nitrate can cause a dangerous fall in blood pressure.', 'Do not dispense together without the prescriber confirming.'),
  // Serotonin syndrome / seizures
  r('tramadol', 'fluoxetine', 'major', 'Tramadol with an SSRI raises the risk of serotonin syndrome and seizures.', 'Check with the prescriber; warn about agitation, sweating, tremor.'),
  r('tramadol', 'sertraline', 'major', 'Tramadol with an SSRI raises the risk of serotonin syndrome and seizures.', 'Check with the prescriber.'),
  r('tramadol', 'escitalopram', 'major', 'Tramadol with an SSRI raises the risk of serotonin syndrome and seizures.', 'Check with the prescriber.'),
  r('tramadol', 'paroxetine', 'major', 'Tramadol with an SSRI raises the risk of serotonin syndrome and seizures.', 'Check with the prescriber.'),
  r('tramadol', 'ondansetron', 'moderate', 'Ondansetron may reduce the pain relief from tramadol and both prolong the QT interval.', 'Use if prescribed together; watch for palpitations.'),
  // Sedation / respiratory depression
  r('alprazolam', 'tramadol', 'major', 'Benzodiazepine with an opioid increases sedation and slowed breathing.', 'Confirm with the prescriber; counsel not to drive or drink alcohol.'),
  r('clonazepam', 'tramadol', 'major', 'Benzodiazepine with an opioid increases sedation and slowed breathing.', 'Confirm with the prescriber; counsel not to drive or drink alcohol.'),
  r('alprazolam', 'codeine', 'major', 'Benzodiazepine with an opioid increases sedation and slowed breathing.', 'Confirm with the prescriber.'),
  r('diazepam', 'codeine', 'major', 'Benzodiazepine with an opioid increases sedation and slowed breathing.', 'Confirm with the prescriber.'),
  r('alprazolam', 'cetirizine', 'minor', 'Both cause drowsiness.', 'Advise caution with driving.'),
  r('clonazepam', 'chlorpheniramine', 'minor', 'Both cause drowsiness.', 'Advise caution with driving.'),
  // Methotrexate
  r('methotrexate', 'ibuprofen', 'major', 'NSAIDs reduce methotrexate clearance and can cause toxicity.', 'Check with the prescriber before dispensing.'),
  r('methotrexate', 'diclofenac', 'major', 'NSAIDs reduce methotrexate clearance and can cause toxicity.', 'Check with the prescriber before dispensing.'),
  r('methotrexate', 'trimethoprim', 'major', 'Trimethoprim with methotrexate can cause severe bone-marrow suppression.', 'Do not dispense together without the prescriber confirming.'),
  r('methotrexate', 'amoxicillin', 'moderate', 'Penicillins can raise methotrexate levels.', 'Advise the patient to report mouth ulcers or fever.'),
  // Macrolides / azoles
  r('clarithromycin', 'atorvastatin', 'major', 'Clarithromycin raises atorvastatin levels; risk of muscle damage.', 'Suggest pausing the statin during the course; check with the prescriber.'),
  r('clarithromycin', 'simvastatin', 'major', 'Clarithromycin raises simvastatin levels; risk of muscle damage.', 'Suggest pausing the statin during the course; check with the prescriber.'),
  r('clarithromycin', 'rosuvastatin', 'moderate', 'Clarithromycin can raise rosuvastatin levels.', 'Advise to report muscle pain.'),
  r('clarithromycin', 'amlodipine', 'moderate', 'Clarithromycin raises amlodipine levels; risk of low blood pressure.', 'Advise to watch for dizziness.'),
  r('clarithromycin', 'digoxin', 'major', 'Clarithromycin raises digoxin levels.', 'Check with the prescriber; digoxin level monitoring.'),
  r('clarithromycin', 'carbamazepine', 'major', 'Clarithromycin raises carbamazepine levels.', 'Check with the prescriber.'),
  r('clarithromycin', 'colchicine', 'major', 'Clarithromycin with colchicine can cause fatal colchicine toxicity.', 'Do not dispense together without the prescriber confirming.'),
  r('domperidone', 'ketoconazole', 'major', 'Both prolong the QT interval; risk of serious arrhythmia.', 'Do not dispense together without the prescriber confirming.'),
  r('domperidone', 'fluconazole', 'major', 'Both prolong the QT interval; risk of serious arrhythmia.', 'Do not dispense together without the prescriber confirming.'),
  r('domperidone', 'erythromycin', 'major', 'Both prolong the QT interval; risk of serious arrhythmia.', 'Do not dispense together without the prescriber confirming.'),
  r('fluconazole', 'amiodarone', 'major', 'Both prolong the QT interval.', 'Check with the prescriber.'),
  r('fluconazole', 'glimepiride', 'moderate', 'Fluconazole raises sulfonylurea levels; risk of low blood sugar.', 'Advise the patient to watch for hypoglycaemia.'),
  // Potassium / renal
  r('spironolactone', 'potassium chloride', 'major', 'Both raise potassium; risk of dangerous hyperkalaemia.', 'Check with the prescriber.'),
  r('spironolactone', 'enalapril', 'moderate', 'Both raise potassium.', 'Advise periodic potassium checks.'),
  r('spironolactone', 'ramipril', 'moderate', 'Both raise potassium.', 'Advise periodic potassium checks.'),
  r('spironolactone', 'telmisartan', 'moderate', 'Both raise potassium.', 'Advise periodic potassium checks.'),
  r('spironolactone', 'losartan', 'moderate', 'Both raise potassium.', 'Advise periodic potassium checks.'),
  r('ibuprofen', 'enalapril', 'moderate', 'NSAIDs blunt blood-pressure control and strain the kidneys with ACE inhibitors.', 'Prefer paracetamol; keep NSAID use short.'),
  r('ibuprofen', 'ramipril', 'moderate', 'NSAIDs blunt blood-pressure control and strain the kidneys with ACE inhibitors.', 'Prefer paracetamol; keep NSAID use short.'),
  r('ibuprofen', 'telmisartan', 'moderate', 'NSAIDs blunt blood-pressure control and strain the kidneys with ARBs.', 'Prefer paracetamol; keep NSAID use short.'),
  r('diclofenac', 'telmisartan', 'moderate', 'NSAIDs blunt blood-pressure control and strain the kidneys with ARBs.', 'Prefer paracetamol; keep NSAID use short.'),
  r('lithium', 'ibuprofen', 'major', 'NSAIDs raise lithium levels.', 'Check with the prescriber.'),
  r('lithium', 'enalapril', 'major', 'ACE inhibitors raise lithium levels.', 'Check with the prescriber.'),
  // Antiplatelet / GI
  r('ibuprofen', 'aspirin', 'moderate', 'Ibuprofen can block the heart-protective effect of low-dose aspirin.', 'Take aspirin at least 30 minutes before ibuprofen, or prefer paracetamol.'),
  r('diclofenac', 'aspirin', 'moderate', 'Two antiplatelet-acting drugs increase bleeding and stomach risk.', 'Prefer paracetamol for pain.'),
  r('prednisolone', 'ibuprofen', 'moderate', 'Steroid with NSAID raises the risk of stomach bleeding.', 'Advise taking with food; consider a gastroprotective.'),
  r('prednisolone', 'diclofenac', 'moderate', 'Steroid with NSAID raises the risk of stomach bleeding.', 'Advise taking with food; consider a gastroprotective.'),
  r('omeprazole', 'clopidogrel', 'moderate', 'Omeprazole reduces the activation of clopidogrel.', 'Pantoprazole is the usual alternative; check with the prescriber.'),
  r('sertraline', 'ibuprofen', 'moderate', 'SSRIs with NSAIDs increase bleeding risk.', 'Prefer paracetamol.'),
  // Fluoroquinolones
  r('ciprofloxacin', 'prednisolone', 'moderate', 'Fluoroquinolone with a steroid raises tendon-rupture risk.', 'Advise to report tendon pain and avoid strenuous exercise.'),
  r('levofloxacin', 'prednisolone', 'moderate', 'Fluoroquinolone with a steroid raises tendon-rupture risk.', 'Advise to report tendon pain.'),
  r('ciprofloxacin', 'tizanidine', 'major', 'Ciprofloxacin greatly raises tizanidine levels; severe low blood pressure and sedation.', 'Do not dispense together without the prescriber confirming.'),
  r('ciprofloxacin', 'theophylline', 'major', 'Ciprofloxacin raises theophylline levels; risk of seizures.', 'Check with the prescriber.'),
  r('ciprofloxacin', 'calcium carbonate', 'moderate', 'Calcium blocks the absorption of ciprofloxacin.', 'Take the antibiotic 2 hours before or 6 hours after calcium or antacids.'),
  r('ciprofloxacin', 'magaldrate', 'moderate', 'Antacids block the absorption of ciprofloxacin.', 'Separate doses by at least 2 hours.'),
  r('levofloxacin', 'calcium carbonate', 'moderate', 'Calcium blocks the absorption of levofloxacin.', 'Separate doses by at least 2 hours.'),
  r('doxycycline', 'calcium carbonate', 'moderate', 'Calcium blocks the absorption of doxycycline.', 'Separate doses by at least 2 hours.'),
  r('doxycycline', 'ferrous sulphate', 'moderate', 'Iron blocks the absorption of doxycycline.', 'Separate doses by at least 2 hours.'),
  // Thyroid absorption
  r('levothyroxine', 'calcium carbonate', 'moderate', 'Calcium reduces levothyroxine absorption.', 'Take levothyroxine on an empty stomach, 4 hours apart from calcium.'),
  r('levothyroxine', 'ferrous sulphate', 'moderate', 'Iron reduces levothyroxine absorption.', 'Separate by 4 hours.'),
  r('levothyroxine', 'omeprazole', 'minor', 'Acid suppression can reduce levothyroxine absorption over time.', 'Advise consistent timing; thyroid tests as usual.'),
  // Cardio
  r('digoxin', 'amiodarone', 'major', 'Amiodarone roughly doubles digoxin levels.', 'Check with the prescriber; digoxin dose usually halved.'),
  r('metoprolol', 'verapamil', 'major', 'Beta-blocker with verapamil can cause severe slowing of the heart.', 'Check with the prescriber.'),
  r('atenolol', 'verapamil', 'major', 'Beta-blocker with verapamil can cause severe slowing of the heart.', 'Check with the prescriber.'),
  r('amlodipine', 'simvastatin', 'moderate', 'Amlodipine raises simvastatin levels.', 'Simvastatin dose usually kept at or below 20 mg.'),
  r('atorvastatin', 'fenofibrate', 'moderate', 'Statin with fibrate raises the risk of muscle damage.', 'Advise to report muscle pain or dark urine.'),
  // Enzyme inducers / contraception
  r('carbamazepine', 'ethinylestradiol', 'major', 'Carbamazepine makes the contraceptive pill unreliable.', 'Advise additional contraception; inform the prescriber.'),
  r('rifampicin', 'ethinylestradiol', 'major', 'Rifampicin makes the contraceptive pill unreliable.', 'Advise additional contraception during and 4 weeks after the course.'),
  r('rifampicin', 'atorvastatin', 'moderate', 'Rifampicin lowers atorvastatin levels.', 'Inform the prescriber.'),
  // Gout
  r('allopurinol', 'azathioprine', 'major', 'Allopurinol blocks azathioprine breakdown; severe marrow toxicity.', 'Do not dispense together without the prescriber confirming a reduced dose.'),
  // Diabetes
  r('glimepiride', 'ciprofloxacin', 'moderate', 'Fluoroquinolones can cause unpredictable blood-sugar swings with sulfonylureas.', 'Advise closer sugar monitoring.'),
  r('metformin', 'ranitidine', 'minor', 'Ranitidine may slightly raise metformin levels.', 'No action usually needed.'),
  // Anti-infectives
  r('metronidazole', 'lithium', 'moderate', 'Metronidazole can raise lithium levels.', 'Check with the prescriber.'),
  r('azithromycin', 'hydroxychloroquine', 'moderate', 'Both can prolong the QT interval.', 'Use only if prescribed together; report palpitations.'),
  r('ondansetron', 'azithromycin', 'moderate', 'Both can prolong the QT interval.', 'Use only if prescribed together.'),
].map((x) => ({ ...x, source: SRC })) as (InteractionRuleLike & { source: string })[];
