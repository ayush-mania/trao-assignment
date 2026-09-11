// Bulk upload: a JSON array of { jd, company_url, days } or a CSV with those headers.
export interface CaseInput {
  jd: string;
  company_url: string;
  days: number;
}

export function parseCasesFile(
  name: string,
  text: string,
): { cases: CaseInput[]; problems: string[] } {
  const problems: string[] = [];
  const rows: unknown[] = name.toLowerCase().endsWith('.csv')
    ? parseCsv(text)
    : parseJson(text, problems);
  const cases: CaseInput[] = [];
  rows.forEach((row, i) => {
    const r = row as Record<string, unknown>;
    const jd = String(r.jd ?? '').trim();
    const company_url = String(r.company_url ?? r.url ?? '').trim();
    const days = Number(r.days);
    if (!jd) problems.push(`row ${i + 1}: missing jd`);
    if (!company_url) problems.push(`row ${i + 1}: missing company_url`);
    if (!Number.isInteger(days) || days < 1)
      problems.push(`row ${i + 1}: days must be a whole number ≥ 1`);
    if (jd && company_url && Number.isInteger(days) && days >= 1)
      cases.push({ jd, company_url, days });
  });
  return { cases, problems };
}

function parseJson(text: string, problems: string[]): unknown[] {
  try {
    const v = JSON.parse(text) as unknown;
    if (Array.isArray(v)) return v;
    problems.push('JSON must be an array of cases');
  } catch {
    problems.push('File is not valid JSON');
  }
  return [];
}

/** Minimal RFC-4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
