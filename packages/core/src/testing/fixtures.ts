// Shared test fixture: a small, fully valid Appendix A kit. Tests mutate copies of it.
import type { Kit } from '../validation/kit-schema.js';

export function makeValidKit(overrides: Partial<Kit> = {}): Kit {
  return structuredClone({
    source: {
      company: 'Acme',
      company_url: 'http://localhost:8099/acme/',
      role: 'Senior Backend Engineer',
      location: 'Remote',
      jd_chars: 1200,
      researched_at: '2026-09-11T10:00:00Z',
      pages_used: ['http://localhost:8099/acme/', 'http://localhost:8099/acme/careers'],
    },
    company_brief: {
      summary: 'Acme builds widgets.',
      what_they_do: 'Widgets for enterprises.',
      sources: ['http://localhost:8099/acme/'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'senior',
      responsibilities: ['Own the billing service'],
      requirements: [
        { id: 'r1', text: '5+ years with Node.js', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Mentors junior engineers', kind: 'behavioural', priority: 'must' },
        { id: 'r3', text: 'Experience with Kafka', kind: 'technical', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How does the Node.js event loop handle I/O?',
        answer_outline: 'libuv, phases, microtasks',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Tell me about a time you mentored someone.',
        answer_outline: 'STAR',
        difficulty: 1,
      },
      {
        id: 'q3',
        requirement_ids: ['r3'],
        category: 'system-design',
        prompt: 'Design an event pipeline with Kafka.',
        answer_outline: 'partitions, consumers, idempotency',
        difficulty: 3,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'Event loop phases?',
        back: 'timers, poll, check...',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Node.js internals', question_ids: ['q1', 'q3'], minutes: 60 },
        { day: 2, focus: 'Behavioural', question_ids: ['q2'], minutes: 30 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  });
}
