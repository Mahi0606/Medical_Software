import { describe, expect, it } from 'vitest';
import { STARTER_INTERACTION_RULES } from '../src/interaction-rules.js';
import { checkInteractions, matchSalt, saltsFromGenericText } from '../src/interactions.js';

describe('interactions', () => {
  it('extracts salts from composition text', () => {
    expect(saltsFromGenericText('Amoxicillin 500 mg + Clavulanic acid 125 mg')).toEqual(['Amoxicillin', 'Clavulanic acid']);
    expect(saltsFromGenericText('Magaldrate 400 mg + Simethicone 20 mg per 5 ml')).toEqual(['Magaldrate', 'Simethicone']);
    expect(saltsFromGenericText('Povidone iodine 5 %')).toEqual(['Povidone iodine']);
  });
  it('matches salt variants', () => {
    expect(matchSalt('amoxicillin', 'Amoxicillin trihydrate')).toBe(true);
    expect(matchSalt('aspirin', 'Aspirin')).toBe(true);
    expect(matchSalt('metformin', 'Metoprolol')).toBe(false);
  });
  it('finds a major interaction, a duplicate and a look-alike', () => {
    const r = checkInteractions([
      { itemId: 1, name: 'Warf 5', salts: ['Warfarin'] },
      { itemId: 2, name: 'Brufen 400', salts: ['Ibuprofen'] },
      { itemId: 3, name: 'Combiflam', salts: ['Ibuprofen', 'Paracetamol'] },
      { itemId: 4, name: 'Hydralazine', salts: ['Hydralazine'] },
      { itemId: 5, name: 'Atarax', salts: ['Hydroxyzine'] },
    ], STARTER_INTERACTION_RULES);
    expect(r.hasMajor).toBe(true);
    expect(r.findings.filter((f) => f.kind === 'interaction').length).toBe(2);
    expect(r.findings.some((f) => f.kind === 'duplicate' && f.salt === 'Ibuprofen')).toBe(true);
    expect(r.findings.some((f) => f.kind === 'lasa')).toBe(true);
  });
  it('checks cart against history but not history against history', () => {
    const r = checkInteractions([
      { itemId: 1, name: 'A', salts: ['Warfarin'], source: 'history' },
      { itemId: 2, name: 'B', salts: ['Aspirin'], source: 'history' },
      { itemId: 3, name: 'C', salts: ['Ciprofloxacin'] },
    ], STARTER_INTERACTION_RULES);
    expect(r.findings.filter((f) => f.kind === 'interaction').map((f) => (f as { saltB: string }).saltB + (f as { saltA: string }).saltA).sort()).toEqual(['CiprofloxacinWarfarin']);
  });
});
