import { describe, expect, it } from 'vitest';
import { LlmClient } from '../llm/client.js';
import { LlmError, type LlmProvider } from '../llm/types.js';
import { fakeLlm } from '../testing/fake-llm.js';
import { fixtureFetch } from '../testing/fixture-fetch.js';
import { validateKit } from '../validation/validate-kit.js';
import { advance, fingerprint, runToCompletion, type RunDeps } from './run.js';
import { createRunState, STEPS } from './state.js';

const JD = `Senior Backend Engineer at Acme Robotics

Requirements:
- 5+ years with Node.js and TypeScript
- Experience mentoring junior engineers

Nice to have:
- Familiarity with Kafka`;

// Scripted answers in the order the pipeline calls the model for this JD on the acme fixture:
// extract, brief, technical, behavioural, system-design, company-fit, (coverage pass for r3), flashcards.
function scriptedLlm() {
  return fakeLlm([
    {
      title: 'Senior Backend Engineer',
      seniority: 'senior',
      location: '',
      company: 'Acme Robotics',
      responsibilities: ['own services'],
      requirements: [
        {
          text: 'Node.js and TypeScript',
          evidence: '5+ years with Node.js and TypeScript',
          kind: 'technical',
        },
        {
          text: 'Mentoring junior engineers',
          evidence: 'Experience mentoring junior engineers',
          kind: 'behavioural',
        },
        { text: 'Kafka', evidence: 'Familiarity with Kafka', kind: 'technical' },
      ],
    },
    {
      summary: 'Acme builds warehouse robots.',
      what_they_do: 'Robots.',
      hiring_process: 'Take-home, then system design, then behavioural.',
    },
    { questions: [{ prompt: 'Event loop?', requirement_ids: ['r1'], difficulty: 2 }] },
    { questions: [{ prompt: 'Mentoring story?', requirement_ids: ['r2'], difficulty: 1 }] },
    {
      questions: [{ prompt: 'Design telemetry ingestion', requirement_ids: ['r1'], difficulty: 3 }],
    },
    { questions: [{ prompt: 'Why Acme?', requirement_ids: [], difficulty: 1 }] },
    {
      flashcards: [
        { front: 'Event loop phases?', back: 'timers, poll, check', requirement_ids: ['r1'] },
      ],
    },
  ]);
}

const deps = (llm: LlmClient, fetchImpl: typeof fetch = fixtureFetch): RunDeps => ({
  llm,
  crawl: { policy: { allowPrivate: true }, fetchImpl, delayMs: 0 },
  discussion: { fetchImpl },
});

describe('runToCompletion', () => {
  it('produces a valid kit from the acme fixture, using the hiring page and reporting coverage honestly', async () => {
    const llm = scriptedLlm();
    const s = await runToCompletion(
      { jd: JD, company_url: 'http://localhost:8099/acme/', days: 3 },
      deps(llm),
    );
    expect(s.status).toBe('done');
    expect(s.error).toBeNull();
    expect(s.steps.map((x) => x.name)).toEqual([...STEPS]);
    const kit = s.artifacts.kit!;
    expect(validateKit(kit).ok).toBe(true);
    expect(kit.source.pages_used).toContain(
      'http://localhost:8099/acme/company/handbook/how-we-interview',
    );
    expect(kit.role.requirements.map((r) => r.priority)).toEqual(['must', 'must', 'nice']);
    expect(kit.questions.map((q) => q.category)).toEqual([
      'technical',
      'behavioural',
      'system-design',
      'company-fit',
    ]);
    // r3 (nice) has no question: reported, not chased (no must-have gap → single pass)
    expect(kit.coverage).toEqual({ uncovered_requirement_ids: ['r3'], passes: 1 });
    expect(kit.schedule.days).toHaveLength(3);
    // The hiring page's process reached the question prompts, inside the untrusted boundary.
    expect(llm.calls[2]!.user).toContain('Take-home');
    expect(llm.calls[2]!.user).toContain('<document label="what company documents say');
  });

  it('still produces a kit when the company site is unreachable, with an honest brief and no brief call', async () => {
    const llm = fakeLlm([
      {
        title: 'Engineer',
        requirements: [{ text: 'Go', evidence: 'Go developer', kind: 'technical' }],
      },
      { questions: [{ prompt: 'Goroutines?', requirement_ids: ['r1'], difficulty: 2 }] },
      { questions: [{ prompt: 'Teamwork?', requirement_ids: [], difficulty: 1 }] },
      { flashcards: [] },
    ]);
    const dead = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const s = await runToCompletion(
      { jd: 'Go developer wanted.\nRemote.', company_url: 'http://localhost:1/', days: 1 },
      deps(llm, dead),
    );
    expect(s.status).toBe('done');
    const kit = s.artifacts.kit!;
    expect(kit.company_brief.summary).toMatch(/could be retrieved/);
    expect(kit.company_brief.summary).toMatch(/deliberately thin/);
    expect(kit.company_brief.sources).toEqual([]);
    expect(s.steps.find((x) => x.name === 'crawl_company')!.status).toBe('skipped');
    expect(s.steps.find((x) => x.name === 'company_brief')!.status).toBe('skipped');
  });

  it('fails with LLM_UNAVAILABLE when every provider is exhausted, keeping earlier steps', async () => {
    const dead: LlmProvider = {
      name: 'dead',
      model: 'x',
      async complete() {
        throw new LlmError('auth', 'bad key', 'dead');
      },
    };
    const llm = new LlmClient({
      providers: [dead],
      requestsPerMinute: 100,
      tokensPerMinute: 1e6,
      sleep: async () => {},
    });
    const s = await runToCompletion(
      { jd: JD, company_url: 'http://localhost:8099/acme/', days: 2 },
      deps(llm),
    );
    expect(s.status).toBe('failed');
    expect(s.error).toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(s.steps.map((x) => [x.name, x.status])).toEqual([
      ['validate_input', 'ok'],
      ['extract_requirements', 'failed'],
    ]);
  });

  it('rejects bad input before doing any work', async () => {
    const llm = fakeLlm([]);
    const s = await runToCompletion({ jd: '   ', company_url: 'x', days: 5 }, deps(llm));
    expect(s.error).toMatchObject({ code: 'INVALID_INPUT' });
    expect(llm.calls).toHaveLength(0);
    const s2 = await runToCompletion({ jd: JD, company_url: 'x', days: 0 }, deps(llm));
    expect(s2.error?.message).toMatch(/days must be an integer/);
  });

  it('resumes from a persisted mid-run state without redoing finished steps', async () => {
    const llm = scriptedLlm();
    let state = createRunState({ jd: JD, company_url: 'http://localhost:8099/acme/', days: 2 });
    for (let i = 0; i < 4; i++) state = await advance(state, deps(llm));
    const persisted = JSON.parse(JSON.stringify(state));
    const callsBefore = llm.calls.length;
    const done = await runToCompletion(persisted, deps(llm));
    expect(done.status).toBe('done');
    expect(done.steps).toHaveLength(STEPS.length);
    expect(llm.calls.length - callsBefore).toBe(6); // brief + 4 categories + flashcards; extraction not redone
  });
});

describe('fingerprint', () => {
  it('ignores whitespace and case differences but not days', () => {
    const a = fingerprint({
      jd: 'Senior  Engineer\n',
      company_url: 'https://acme.example/',
      days: 5,
    });
    expect(
      fingerprint({ jd: 'senior engineer', company_url: 'HTTPS://ACME.EXAMPLE/', days: 5 }),
    ).toBe(a);
    expect(
      fingerprint({ jd: 'senior engineer', company_url: 'https://acme.example/', days: 6 }),
    ).not.toBe(a);
  });
});
