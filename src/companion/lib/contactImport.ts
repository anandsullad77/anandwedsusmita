import { IMPORT_LIMITS, familyKey } from './familyImport';
import type { AdminHousehold } from './types';

export type SharedContact = { name?: string[]; tel?: string[] };
export type ContactDraft = { id: string; selected: boolean; name: string; family: string; phone: string; phones: string[] };
type ContactPicker = { select(properties: string[], options: { multiple: boolean }): Promise<SharedContact[]> };

export function contactPicker(): ContactPicker | null {
  const contacts = (navigator as Navigator & { contacts?: ContactPicker }).contacts;
  return window.isSecureContext && typeof contacts?.select === 'function' ? contacts : null;
}

// Unprefixed Indian mobile numbers use the wedding's country code. Preserve
// other international numbers and let review validation catch invalid entries.
export function contactPhone(value: string) {
  let phone = value.trim().replace(/^tel:/i, '').replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (/^0\d{10}$/.test(phone)) phone = phone.slice(1);
  if (/^\d{10}$/.test(phone)) return '+91' + phone;
  if (/^\d{11,15}$/.test(phone)) return '+' + phone;
  return phone;
}

export function contactDrafts(contacts: SharedContact[]): ContactDraft[] {
  if (!contacts.length) throw new Error('No contacts were found. Choose contacts with names or phone numbers.');
  if (contacts.length > IMPORT_LIMITS.families) throw new Error('Choose up to 500 contacts at a time.');
  return contacts.map(contact => {
    const name = contact.name?.find(n => n.trim())?.trim() ?? '';
    const phones = [...new Set((contact.tel ?? []).map(contactPhone).filter(Boolean))];
    return { id: crypto.randomUUID(), selected: true, name, family: name ? `${name}'s family` : '', phone: phones[0] ?? '', phones };
  });
}

const unescapeVcard = (value: string) => value.replace(/\\([nN,;\\])/g, (_, char: string) => /n/i.test(char) ? '\n' : char).trim();
const decodeQuotedPrintable = (value: string) => {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let i = 0; i < value.length;) {
    if (value[i] === '=' && /^[\da-f]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16)); i += 3;
    } else {
      const char = String.fromCodePoint(value.codePointAt(i)!);
      bytes.push(...encoder.encode(char)); i += char.length;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

export function readContactFile(text: string): SharedContact[] {
  // vCard 2.1 quoted-printable continuations and vCard 3/4 folded lines.
  const unfolded = text.replace(/=\r?\n/g, '').replace(/\r?\n[ \t]/g, '');
  const cards = [...unfolded.matchAll(/BEGIN:VCARD\s*\r?\n([\s\S]*?)\r?\nEND:VCARD/gi)];
  if (!cards.length) throw new Error('This file has no readable contacts. Export a .vcf contact file from your Contacts app and try again.');
  if (cards.length > IMPORT_LIMITS.families) throw new Error('Choose up to 500 contacts at a time.');
  return cards.map(([, body]) => {
    const contact: SharedContact = { name: [], tel: [] };
    let fallback = '';
    for (const line of body.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const header = line.slice(0, colon);
      const property = header.split(';')[0].split('.').pop()?.toUpperCase();
      let value = line.slice(colon + 1);
      if (/ENCODING=QUOTED-PRINTABLE/i.test(header)) value = decodeQuotedPrintable(value);
      if (property === 'FN') contact.name!.push(unescapeVcard(value));
      if (property === 'N') {
        const parts = value.split(/(?<!\\);/).map(unescapeVcard);
        fallback = [parts[3], parts[1], parts[2], parts[0], parts[4]].filter(Boolean).join(' ');
      }
      if (property === 'TEL') contact.tel!.push(unescapeVcard(value));
    }
    if (!contact.name!.length && fallback) contact.name!.push(fallback);
    return contact;
  });
}

export function contactReview(rows: ContactDraft[], existing: AdminHousehold[]) {
  const families = new Set(existing.map(h => familyKey(h.name)));
  const phones = new Set(existing.flatMap(h => h.people.map(p => contactPhone(p.phone ?? '').replace(/^\+/, '')).filter(Boolean)));
  return rows.map(row => {
    if (!row.selected) return { row, issue: '', duplicate: false };
    const key = familyKey(row.family), phone = contactPhone(row.phone).replace(/^\+/, '');
    const duplicate = families.has(key) || (!!phone && phones.has(phone));
    const issue = !row.name.trim() || !row.family.trim() ? 'Add a guest name and family name.'
      : row.name.trim().length > 200 || row.family.trim().length > 200 ? 'Keep names within 200 characters.'
      : row.phone.trim() && !/^\+?\d{7,15}$/.test(contactPhone(row.phone)) ? 'Check the phone number, including its country code.' : '';
    if (!duplicate && !issue) { families.add(key); if (phone) phones.add(phone); }
    return { row, issue, duplicate };
  });
}
