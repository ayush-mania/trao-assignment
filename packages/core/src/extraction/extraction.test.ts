import { describe, expect, it } from 'vitest';
import { fakeLlm } from '../testing/fake-llm.js';
import { extractRequirements } from './extract-requirements.js';
import { derivePriority, indexOfLoose } from './priority.js';

const JD = `Senior Backend Engineer
Acme Robotics, Berlin (hybrid)

About the role
You will own the telemetry ingestion service and mentor junior engineers.

Requirements:
- 5+ years of experience with Node.js and TypeScript
- Strong knowledge of PostgreSQL
- Experience mentoring junior engineers

Nice to have:
- Familiarity with Kafka
- Bonus points for Kubernetes experience`;

describe('derivePriority (wording rules)', () => {
  it('reads must from the Requirements heading and nice from explicit wording', () => {
    expect(
      derivePriority({ jd: JD, evidence: '5+ years of experience with Node.js and TypeScript' }),
    ).toBe('must');
    expect(derivePriority({ jd: JD, evidence: 'Strong knowledge of PostgreSQL' })).toBe('must');
    expect(derivePriority({ jd: JD, evidence: 'Familiarity with Kafka' })).toBe('nice');
    expect(derivePriority({ jd: JD, evidence: 'Bonus points for Kubernetes experience' })).toBe(
      'nice',
    );
  });

  it('lets an explicit nice phrase override a must heading', () => {
    const jd = 'Requirements:\n- Python\n- Ideally some Go experience';
    expect(derivePriority({ jd, evidence: 'Ideally some Go experience' })).toBe('nice');
    expect(derivePriority({ jd, evidence: 'Python' })).toBe('must');
  });

  it.each([
    [
      '5 plus years is not a nice-to-have',
      'Requirements:\n- 5 plus years of experience with Python',
      '5 plus years of experience with Python',
      'must',
    ],
    [
      'depth adjectives do not beat a nice heading',
      'Nice to have:\n- Strong knowledge of Kubernetes',
      'Strong knowledge of Kubernetes',
      'nice',
    ],
    [
      'the list occurrence wins over an intro mention',
      'We use Kubernetes and Go across the platform.\n\nNice to have:\n- Kubernetes',
      'Kubernetes',
      'nice',
    ],
    [
      'unbulleted lines are not headings',
      'Nice to have:\nTerraform experience\nGo experience\n- Experience with Rust',
      'Experience with Rust',
      'nice',
    ],
    [
      'is a plus reads as nice',
      'Requirements:\n- Python\n- Experience with Rust is a plus',
      'Experience with Rust is a plus',
      'nice',
    ],
  ])('%s', (_name, jd, evidence, expected) => {
    expect(derivePriority({ jd, evidence })).toBe(expected);
  });

  it('indexOfLoose ignores case and whitespace differences', () => {
    expect(indexOfLoose('Foo   bar\n baz', 'foo bar baz')).toBe(0);
    expect(indexOfLoose('abc', 'zzz')).toBe(-1);
  });
});

describe('extractRequirements', () => {
  it('keeps evidenced requirements, derives priority from wording, assigns ids in code', async () => {
    const llm = fakeLlm([
      {
        title: 'Senior Backend Engineer',
        seniority: 'senior',
        location: 'Berlin (hybrid)',
        company: 'Acme Robotics',
        responsibilities: ['own the telemetry ingestion service'],
        requirements: [
          {
            text: 'Node.js and TypeScript (5+ years)',
            evidence: '5+ years of experience with Node.js and TypeScript',
            kind: 'technical',
          },
          {
            text: 'Mentoring junior engineers',
            evidence: 'Experience mentoring junior engineers',
            kind: 'behavioural',
          },
          {
            text: 'Kubernetes',
            evidence: 'Bonus points for Kubernetes experience',
            kind: 'technical',
          },
          {
            text: 'AWS certification',
            evidence: 'AWS Certified Solutions Architect',
            kind: 'technical',
          },
          { text: 'Kubernetes experience', evidence: 'Kubernetes experience', kind: 'technical' },
        ],
      },
    ]);
    const r = await extractRequirements(JD, llm);
    expect(r.requirements).toEqual([
      { id: 'r1', text: 'Node.js and TypeScript (5+ years)', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
      { id: 'r3', text: 'Kubernetes', kind: 'technical', priority: 'nice' },
      { id: 'r4', text: 'Kubernetes experience', kind: 'technical', priority: 'nice' },
    ]);
    expect(r.rejected).toEqual([
      {
        text: 'AWS certification',
        evidence: 'AWS Certified Solutions Architect',
        reason: 'no_evidence',
      },
    ]);
    expect(r.thin).toBe(false);
    expect(r.company).toBe('Acme Robotics');
    expect(llm.calls[0]!.user).toContain('<document label="job description">');
  });

  it('drops logistics the model mislabels as requirements (start date, remote)', async () => {
    const llm = fakeLlm([
      {
        title: 'React developer',
        requirements: [
          { text: 'React', evidence: 'React developer needed', kind: 'technical' },
          { text: 'start immediately', evidence: 'start immediately', kind: 'behavioural' },
          { text: 'Remote', evidence: 'Remote', kind: 'domain' },
        ],
      },
    ]);
    const r = await extractRequirements('React developer needed.\nRemote, start immediately.', llm);
    expect(r.requirements.map((x) => x.text)).toEqual(['React']);
    expect(r.rejected.map((x) => x.reason)).toEqual(['not_a_requirement', 'not_a_requirement']);
  });

  it('flags a two-line JD as thin and does not pad it', async () => {
    const llm = fakeLlm([
      {
        title: 'Engineer',
        requirements: [{ text: 'Go', evidence: 'Go developer', kind: 'technical' }],
      },
    ]);
    const r = await extractRequirements('Go developer wanted.\nRemote.', llm);
    expect(r.thin).toBe(true);
    expect(r.requirements).toHaveLength(1);
    expect(r.note).toMatch(/deliberately thin/);
  });

  it('accepts an empty requirement list as a valid answer', async () => {
    const llm = fakeLlm([{ title: '', requirements: [] }]);
    const r = await extractRequirements('We are hiring. Apply now.', llm);
    expect(r.requirements).toEqual([]);
    expect(r.thin).toBe(true);
  });
});
