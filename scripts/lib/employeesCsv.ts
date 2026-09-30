/** Pure helpers for scripts/import-employees.ts (no Firebase here, so they are easy to test). */

export type EmployeeType = 'main' | 'waiting';

export interface EmployeeRow {
  /** 1-based line number in the file (for error messages). */
  line: number;
  employeeId: string;
  name: string;
  type: EmployeeType;
  /** null → the script falls back to the only bus in the project. */
  busId: string | null;
}

/** Minimal CSV parser: quoted fields, "" escapes, CRLF, UTF-8 BOM, and , ; or TAB as the delimiter. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  endRow();
  return rows;
}

/** Expected header: employeeId,name,type[,busId]  (type = main | waiting). Collects ALL problems at once. */
export function parseEmployees(
  text: string,
  normalizeId: (raw: string) => string,
  idPattern: RegExp,
): { rows: EmployeeRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  const rows: EmployeeRow[] = [];
  if (table.length === 0) return { rows, errors: ['الملف فارغ.'] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const [iId, iName, iType, iBus] = [col('employeeId'), col('name'), col('type'), col('busId')];
  if (iId < 0 || iName < 0 || iType < 0) {
    return { rows, errors: ['الصف الأول لازم يحتوي على الأعمدة: employeeId,name,type (و busId اختياري).'] };
  }

  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const employeeId = normalizeId(cell(iId));
    const name = cell(iName).replace(/\s+/g, ' ');
    const type = cell(iType).toLowerCase();
    const busId = cell(iBus) || null;

    if (!idPattern.test(employeeId)) errors.push(`سطر ${line}: رقم الموظف "${cell(iId)}" غير صالح (3–32 حرف/رقم: A–Z, 0–9, _ أو -).`);
    if (!name) errors.push(`سطر ${line}: الاسم فارغ.`);
    if (type !== 'main' && type !== 'waiting') errors.push(`سطر ${line}: النوع "${cell(iType)}" لازم يكون main أو waiting.`);
    if (seen.has(employeeId)) errors.push(`سطر ${line}: رقم الموظف ${employeeId} مكرر (ظهر في سطر ${seen.get(employeeId)}).`);
    seen.set(employeeId, line);

    rows.push({ line, employeeId, name, type: type as EmployeeType, busId });
  });

  if (rows.length === 0) errors.push('لا يوجد موظفين في الملف.');
  return { rows, errors };
}
