import { describe, expect, it } from 'vitest';
import { parseCasesFile } from './parse-cases';

describe('parseCasesFile (bulk upload)', () => {
  it('parses CSV with quoted multi-line descriptions and skips bad rows with reasons', () => {
    const csv =
      'jd,company_url,days\n"Senior Engineer\n\nRequirements:\n- Node, ""TypeScript""",http://a.example/,5\n,http://b.example/,3\nQA lead,http://c.example/,zero\n';
    const r = parseCasesFile('cases.csv', csv);
    expect(r.cases).toEqual([
      {
        jd: 'Senior Engineer\n\nRequirements:\n- Node, "TypeScript"',
        company_url: 'http://a.example/',
        days: 5,
      },
    ]);
    expect(r.problems).toEqual(['row 2: missing jd', 'row 3: days must be a whole number ≥ 1']);
  });

  it('parses a JSON array and rejects anything else', () => {
    expect(
      parseCasesFile('x.json', '[{"jd":"Dev","company_url":"http://a/","days":2}]').cases,
    ).toHaveLength(1);
    expect(parseCasesFile('x.json', '{"jd":"Dev"}').problems).toEqual([
      'JSON must be an array of cases',
    ]);
    expect(parseCasesFile('x.json', 'not json').problems).toEqual(['File is not valid JSON']);
  });
});
