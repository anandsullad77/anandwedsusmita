import ExcelJS from 'exceljs';
import type { Cell, Worksheet } from 'exceljs';
import { familyKey, IMPORT_LIMITS, validateHouseholdImport } from '../lib/familyImport';
import type { Fn, HouseholdImport } from '../lib/types';

export const HEADERS = ['Family name', 'Person name', 'WhatsApp number', 'Child', 'Side', 'Invited by', 'Max people', 'Invited to'] as const;
export type WorkbookPreview = { families: HouseholdImport[]; errors: string[]; filename: string };

function styleSheet(sheet: Worksheet, widths: number[]) {
  widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B1A12' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

export async function downloadFamilyTemplate(functions: Fn[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Anand & Susmita';
  const sheet = workbook.addWorksheet('Families');
  sheet.addRow([...HEADERS]);
  sheet.addRow(['Sample Kulkarni family', 'Savita Kulkarni', '+919876543210', 'No', 'Bride', 'Anand', 6, 'All']);
  sheet.addRow(['Sample Kulkarni family', 'Ravi Kulkarni', '', 'No', '', '', '', '']);
  sheet.addRow(['Sample Kulkarni family', 'Anu Kulkarni', '', 'Yes', '', '', '', '']);
  sheet.addRow(['Sample Rao family', 'Meena Rao', '+919876543211', 'No', 'Groom', 'Susmita', 6, 'All']);
  styleSheet(sheet, [30, 26, 24, 12, 14, 24, 15, 40]);
  sheet.getColumn(3).numFmt = '@';
  sheet.autoFilter = 'A1:H5';
  sheet.getCell('A1').note = 'Required on every row. Repeat the same family name to group people into one invite.';
  sheet.getCell('B1').note = 'Required. One person per row.';
  sheet.getCell('C1').note = 'Optional. Enter as text with country code, for example +919876543210.';
  for (let row = 2; row <= IMPORT_LIMITS.people + 1; row++) {
    sheet.getCell(row, 4).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'], showErrorMessage: true, error: 'Choose Yes or No.' };
    sheet.getCell(row, 5).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Bride,Groom,Both"'], showErrorMessage: true, error: 'Choose Bride, Groom or Both.' };
    sheet.getCell(row, 7).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 20], showErrorMessage: true, error: 'Enter a whole number from 1 to 20.' };
  }
  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRows([
    ['Column / step', 'How to fill it in'],
    ['Start here', 'Replace or delete every example row in Families. Keep the header row and save as .xlsx.'],
    ['Family name', 'Required on every row. The same name groups people into one family and one personal invite link. Use distinct names for different families.'],
    ['Person name', 'Required. Add one person per row; repeat the family name for each member.'],
    ['WhatsApp number', 'Optional. Include country code (for example +919876543210). This column is formatted as text. At least one number per family makes sharing easier.'],
    ['Child', 'Yes or No. Blank means No.'],
    ['Side', 'Bride, Groom or Both. Optional. Fill on the first family row or repeat the same value.'],
    ['Invited by', 'Optional host name. Fill on the first family row or repeat the same value.'],
    ['Max people', 'Optional whole number from 1 to 20, at least the number of listed members. Blank allows 6 people, or the listed count if greater.'],
    ['Invited to', 'All or blank invites the family to every function. For selected functions, use names from Functions separated by semicolons. Fill on the first family row or repeat the same selection.'],
    ['Existing families', 'A matching family name (ignoring case and extra spaces) is skipped. Existing family members, RSVP answers and invite links are kept.'],
    ['After uploading', 'Review the preview and click Create families & invites. Each new family gets a personal invite link with status Not sent. Use Send on WhatsApp to share it.'],
    ['Limits', 'Up to 500 families, 2,000 people and a 2 MB .xlsx file per upload. Formulas are not accepted.']
  ]);
  styleSheet(instructions, [24, 105]);
  instructions.eachRow((row, i) => { if (i > 1) { row.height = 56; row.alignment = { wrapText: true, vertical: 'top' }; } });
  const functionSheet = workbook.addWorksheet('Functions');
  functionSheet.addRow(['Function name', 'Starts at', 'Venue']);
  functions.forEach(f => functionSheet.addRow([f.nameEn, f.startsAt, f.venue ?? '']));
  styleSheet(functionSheet, [40, 32, 50]);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'families-and-invites-template.xlsx';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error('Replace formulas with plain values.');
    if ('richText' in value) return value.richText.map(part => part.text).join('').trim();
    if ('text' in value) return value.text.trim();
    throw new Error('Use plain text or numbers, not dates or cell errors.');
  }
  return String(value).trim();
}

type Group = { family: HouseholdImport; firstRow: number; metadata: Map<string, string> };

export async function readFamilyWorkbook(file: File, functions: Fn[]): Promise<WorkbookPreview> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an Excel .xlsx file. Save older .xls files as .xlsx first.');
  if (file.size > IMPORT_LIMITS.bytes) throw new Error('The Excel file must be 2 MB or smaller.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error('Could not read this Excel file. Use the sample template and save it as .xlsx (without a password).'); }
  const sheet = workbook.getWorksheet('Families') ?? workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook has no worksheet. Use the sample template.');
  if (sheet.rowCount > IMPORT_LIMITS.people + 1 || sheet.columnCount > 50) throw new Error('The Families sheet can contain at most 2,000 people and 50 columns. Remove extra rows or columns.');
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = cellText(cell).toLowerCase();
    if (!header) return;
    if (!HEADERS.some(h => h.toLowerCase() === header)) throw new Error(`Unknown column "${cell.text}". Keep the sample template headers.`);
    if (columns.has(header)) throw new Error(`Duplicate column "${cell.text}".`);
    columns.set(header, col);
  });
  for (const header of ['Family name', 'Person name']) {
    if (!columns.has(header.toLowerCase())) throw new Error(`Missing column "${header}". Use the sample template.`);
  }
  const errors: string[] = [];
  const groups = new Map<string, Group>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return;
    try {
      const values = Object.fromEntries(HEADERS.map(header => [header, columns.has(header.toLowerCase()) ? cellText(row.getCell(columns.get(header.toLowerCase())!)) : ''])) as Record<typeof HEADERS[number], string>;
      if (Object.values(values).every(v => !v)) return;
      const name = values['Family name'];
      const person = values['Person name'];
      if (!name || !person) throw new Error('Family name and Person name are required on every person row.');
      if (name.length > 200 || person.length > 200 || values['Invited by'].length > 200) throw new Error('Names and Invited by must be 200 characters or fewer.');
      const child = values.Child.toLowerCase();
      if (!['', 'yes', 'no', 'true', 'false', '1', '0'].includes(child)) throw new Error('Child must be Yes or No.');
      const rawPhone = values['WhatsApp number'];
      const phone = rawPhone.replace(/[\s().-]/g, '') || null;
      if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new Error('WhatsApp number must contain 7–15 digits, with an optional + and country code.');
      const rawSide = values.Side;
      const side = ['Bride', 'Groom', 'Both'].find(s => s.toLowerCase() === rawSide.toLowerCase()) ?? null;
      if (rawSide && !side) throw new Error('Side must be Bride, Groom or Both.');
      const rawCap = values['Max people'];
      const cap = rawCap ? Number(rawCap) : null;
      if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > IMPORT_LIMITS.cap)) throw new Error('Max people must be a whole number from 1 to 20.');
      const rawFunctions = values['Invited to'];
      let functionIds = functions.map(f => f.id);
      if (rawFunctions && rawFunctions.toLowerCase() !== 'all') {
        functionIds = [...new Set(rawFunctions.split(';').map(text => {
          const matches = functions.filter(f => familyKey(f.nameEn) === familyKey(text) || f.id === text.trim());
          if (matches.length !== 1) throw new Error(`Unknown or ambiguous function "${text.trim()}". Use names from the Functions sheet, separated by semicolons.`);
          return matches[0].id;
        }))];
      }
      const key = familyKey(name);
      let group = groups.get(key);
      if (!group) {
        group = { family: { name, side: null, invitedBy: null, cap: 6, functionIds: functions.map(f => f.id), people: [] }, firstRow: rowNumber, metadata: new Map() };
        groups.set(key, group);
      }
      const metadata = [['Side', rawSide, side ?? ''], ['Invited by', values['Invited by'], values['Invited by']], ['Max people', rawCap, String(cap)], ['Invited to', rawFunctions, [...functionIds].sort().join(';')]];
      for (const [label, raw, canonical] of metadata) {
        if (!raw) continue;
        const previous = group.metadata.get(label);
        if (previous !== undefined && previous !== canonical) throw new Error(`${label} conflicts with another row for ${group.family.name}. Use the same value or leave it blank.`);
        group.metadata.set(label, canonical);
      }
      if (group.family.people.some(p => familyKey(p.name) === familyKey(person))) throw new Error(`Person "${person}" is listed more than once in ${group.family.name}.`);
      if (rawSide) group.family.side = side;
      if (values['Invited by']) group.family.invitedBy = values['Invited by'];
      if (cap !== null) group.family.cap = cap;
      if (rawFunctions) group.family.functionIds = functionIds;
      group.family.people.push({ name: person, phone, isChild: ['yes', 'true', '1'].includes(child) });
    } catch (e) { errors.push(`Row ${rowNumber}: ${(e as Error).message}`); }
  });
  const families = [...groups.values()].map(group => {
    if (!group.metadata.has('Max people')) group.family.cap = Math.max(6, group.family.people.length);
    if (group.family.people.length > group.family.cap || group.family.cap > IMPORT_LIMITS.cap) errors.push(`Row ${group.firstRow}: ${group.family.name} has ${group.family.people.length} people; Max people must cover them and cannot exceed 20.`);
    return group.family;
  });
  if (!errors.length) {
    try { validateHouseholdImport(families, functions); } catch (e) { errors.push((e as Error).message); }
  }
  return { families, errors, filename: file.name };
}
