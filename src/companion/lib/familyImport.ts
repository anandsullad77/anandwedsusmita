import type { Fn, HouseholdImport } from './types';

export const IMPORT_LIMITS = { bytes: 2 * 1024 * 1024, families: 500, people: 2000, cap: 20 };
export const familyKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

// Used again by the demo backend so validation also protects direct API calls.
export function validateHouseholdImport(households: HouseholdImport[], functions: Pick<Fn, 'id'>[]) {
  if (!households.length || households.length > IMPORT_LIMITS.families) throw new Error('Upload between 1 and 500 families.');
  const names = new Set<string>();
  const functionIds = new Set(functions.map(f => f.id));
  let people = 0;
  for (const h of households) {
    if (h.invitationType && !['individual', 'family'].includes(h.invitationType)) throw new Error('Choose Individual or Family.');
    if (h.invitationType === 'individual' && (h.cap !== 1 || h.people.length !== 1)) throw new Error('An individual invitation must have exactly one person and one place.');
    if (!h.name.trim() || h.name.length > 200) throw new Error('Family names must contain 1–200 characters.');
    if (names.has(familyKey(h.name))) throw new Error(`Duplicate family: ${h.name}.`);
    names.add(familyKey(h.name));
    if (h.side !== null && !['Bride', 'Groom', 'Both'].includes(h.side)) throw new Error(`Invalid side for ${h.name}.`);
    if ((h.invitedBy?.length ?? 0) > 200) throw new Error(`Invited by is too long for ${h.name}.`);
    if (!Number.isInteger(h.cap) || h.cap < 1 || h.cap > IMPORT_LIMITS.cap || h.people.length > h.cap) throw new Error(`Max people for ${h.name} must be 1–20 and cover everyone listed.`);
    if (!h.people.length) throw new Error(`Add at least one person to ${h.name}.`);
    if ((functionIds.size > 0 && !h.functionIds.length) || h.functionIds.some(id => !functionIds.has(id))) throw new Error(`Choose valid functions for ${h.name}.`);
    const personNames = new Set<string>();
    for (const p of h.people) {
      if (!p.name.trim() || p.name.length > 200) throw new Error(`Person names in ${h.name} must contain 1–200 characters.`);
      if (personNames.has(familyKey(p.name))) throw new Error(`Duplicate person ${p.name} in ${h.name}.`);
      personNames.add(familyKey(p.name));
      if (p.phone !== null && !/^\+?\d{7,15}$/.test(p.phone)) throw new Error(`Invalid WhatsApp number for ${p.name}.`);
      if (typeof p.isChild !== 'boolean') throw new Error(`Invalid Child value for ${p.name}.`);
    }
    people += h.people.length;
  }
  if (people > IMPORT_LIMITS.people) throw new Error('Upload at most 2,000 people at a time.');
}
