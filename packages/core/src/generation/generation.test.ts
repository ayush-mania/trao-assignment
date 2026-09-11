import { describe, expect, it } from 'vitest';
import type { CrawledPage } from '../retrieval/crawl-site.js';
import { fakeLlm } from '../testing/fake-llm.js';
import type { Requirement } from '../validation/kit-schema.js';
import { generateCompanyBrief } from './company-brief.js';
import { generateFlashcards } from './flashcards.js';
import { generateQuestions, planCategories } from './questions.js';
import {
  hiringSignals,
  nameFromTitle,
  resolveCompanyName,
  type ResearchContext,
} from './research-context.js';

const page = (url: string, text: string, kind: CrawledPage['kind']): CrawledPage => ({
  url,
  title: url,
  text,
  links: [],
  kind,
  score: 0,
});

const requirements: Requirement[] = [
  { id: 'r1', text: 'Node.js', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Kafka', kind: 'technical', priority: 'nice' },
];

const noResearch: ResearchContext = {
  companyName: 'Ghost Co',
  companyUrl: 'http://ghost.example/',
  homepage: null,
  aboutPage: null,
  hiringPage: null,
  discussion: [],
  gaps: ['company site unreachable (network_error)'],
};

const acme: ResearchContext = {
  companyName: 'Acme Robotics',
  companyUrl: 'http://localhost:8099/acme/',
  homepage: page('http://localhost:8099/acme/', 'Acme builds warehouse robots.', 'about'),
  aboutPage: page(
    'http://localhost:8099/acme/company/',
    'What we do: robots. Founded 2016.',
    'about',
  ),
  hiringPage: page(
    'http://localhost:8099/acme/company/handbook/how-we-interview',
    'A take-home exercise, then a system design interview, then a behavioural conversation. No whiteboard puzzles.',
    'hiring',
  ),
  discussion: [],
  gaps: [],
};

const role = {
  title: 'Senior Backend Engineer',
  seniority: 'senior',
  responsibilities: ['own billing'],
};

describe('generateCompanyBrief', () => {
  it('makes no model call and writes an honest brief when nothing was retrieved', async () => {
    const llm = fakeLlm([]);
    const r = await generateCompanyBrief(noResearch, llm);
    expect(r.llmCalls).toBe(0);
    expect(r.brief.summary).toMatch(/No public information about Ghost Co could be retrieved/);
    expect(r.brief.summary).toContain('company site unreachable');
    expect(r.brief.sources).toEqual([]);
  });

  it('uses retrieved documents and cites only real sources', async () => {
    const llm = fakeLlm([
      {
        summary: 'Acme builds robots.',
        what_they_do: 'Warehouse robots.',
        hiring_process: 'Take-home then system design.',
      },
    ]);
    const r = await generateCompanyBrief(acme, llm);
    expect(r.llmCalls).toBe(1);
    expect(r.brief.sources).toEqual([
      'http://localhost:8099/acme/company/',
      'http://localhost:8099/acme/company/handbook/how-we-interview',
      'http://localhost:8099/acme/',
    ]);
    expect(r.brief.summary).toContain('no public discussion of their interview process was found');
    expect(r.hiringProcess).toBe('Take-home then system design.');
    expect(llm.calls[0]!.user).toContain('<document label="hiring page');
  });
});

describe('planCategories', () => {
  it('requests system-design when the hiring page says so and fewer technical per requirement for take-home processes', () => {
    const plan = planCategories({ role, requirements, research: acme, hiringProcess: '' });
    expect(plan.map((p) => p.category)).toEqual([
      'technical',
      'behavioural',
      'system-design',
      'company-fit',
    ]);
    expect(plan.find((p) => p.category === 'system-design')!.count).toBe(4);
    expect(plan.find((p) => p.category === 'technical')!.count).toBe(3); // 2 technical reqs x 1, min 3
    expect(hiringSignals(acme)).toMatchObject({
      takeHome: true,
      systemDesign: true,
      algorithms: false,
    });
  });

  it('skips company-fit when nothing about the company was found; a mid-level technical role still gets 2 design questions', () => {
    const plan = planCategories({
      role: { ...role, seniority: 'mid', title: 'Engineer' },
      requirements,
      research: noResearch,
      hiringProcess: '',
    });
    expect(plan.map((p) => p.category)).toEqual(['technical', 'behavioural', 'system-design']);
    expect(plan[0]!.count).toBe(4); // 2 technical reqs x 2
    expect(plan.find((p) => p.category === 'system-design')!.count).toBe(2);
  });
});

describe('generateQuestions', () => {
  it('makes one call per category with different instructions and verifies requirement ids', async () => {
    const llm = fakeLlm([
      {
        questions: [
          {
            prompt: 'Explain the event loop',
            answer_outline: 'phases',
            requirement_ids: ['r1', 'r9'],
            difficulty: 5,
          },
        ],
      },
      {
        questions: [{ prompt: 'Tell me about mentoring', requirement_ids: ['r2'], difficulty: 1 }],
      },
      {
        questions: [
          { prompt: 'Design telemetry ingestion', requirement_ids: ['r1', 'r3'], difficulty: 3 },
        ],
      },
      { questions: [{ prompt: 'Why Acme?', requirement_ids: [], difficulty: 1 }] },
    ]);
    const { questions, plan } = await generateQuestions(
      { role, requirements, research: acme, hiringProcess: 'take-home' },
      llm,
    );
    expect(plan).toHaveLength(4);
    expect(llm.calls).toHaveLength(4);
    const systems = llm.calls.map((c) => c.system);
    expect(new Set(systems).size).toBe(4);
    expect(systems[0]).toContain('Category: technical');
    expect(systems[1]).toContain('Tell me about a time');
    expect(systems[2]).toContain('Category: system-design');
    expect(questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(questions[0]).toMatchObject({
      requirement_ids: ['r1'],
      difficulty: 3,
      category: 'technical',
    });
    expect(questions[3]).toMatchObject({ category: 'company-fit', requirement_ids: [] });
    expect(llm.calls[0]!.user).toContain('take-home');
  });
});

describe('generateFlashcards', () => {
  it('assigns f ids in code and drops unknown requirement ids; no call for zero requirements', async () => {
    const llm = fakeLlm([
      {
        flashcards: [
          { front: 'Event loop?', back: 'libuv phases', requirement_ids: ['r1', 'nope'] },
        ],
      },
    ]);
    const cards = await generateFlashcards(requirements, role, llm);
    expect(cards).toEqual([
      { id: 'f1', front: 'Event loop?', back: 'libuv phases', requirement_ids: ['r1'] },
    ]);
    const none = fakeLlm([]);
    expect(await generateFlashcards([], role, none)).toEqual([]);
    expect(none.calls).toHaveLength(0);
  });
});

describe('resolveCompanyName', () => {
  it('prefers the JD, then the site title, and never returns a hostname', () => {
    expect(resolveCompanyName('Acme Robotics', [])).toBe('Acme Robotics');
    expect(resolveCompanyName('', [{ title: 'Company - Acme Robotics' }])).toBe('Acme Robotics');
    expect(resolveCompanyName('', [{ title: 'Northwind Analytics' }])).toBe('Northwind Analytics');
    expect(resolveCompanyName('localhost', [{ title: 'Home' }])).toBe('');
    expect(nameFromTitle('About | Home')).toBe('');
  });
});
