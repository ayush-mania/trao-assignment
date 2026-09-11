import { describe, expect, it } from 'vitest';
import { makeValidKit } from '../testing/fixtures.js';
import { validateKit } from './validate-kit.js';

function issuesOf(kit: unknown) {
  const r = validateKit(kit);
  return r.ok ? [] : r.issues;
}

describe('validateKit — structure (Appendix A)', () => {
  it('accepts a valid kit and returns the canonical shape', () => {
    const r = validateKit(makeValidKit());
    expect(r.ok).toBe(true);
  });

  it('strips unknown keys so output is exactly Appendix A', () => {
    const r = validateKit({ ...makeValidKit(), extra: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect('extra' in r.kit).toBe(false);
  });

  it.each([
    ['source.company_url', (k: any) => delete k.source.company_url],
    ['company_brief.sources', (k: any) => (k.company_brief.sources = 'x')],
    ['role.requirements.0.kind', (k: any) => (k.role.requirements[0].kind = 'soft')],
    ['role.requirements.0.priority', (k: any) => (k.role.requirements[0].priority = 'required')],
    ['questions.0.category', (k: any) => (k.questions[0].category = 'coding')],
    ['questions.0.difficulty', (k: any) => (k.questions[0].difficulty = 4)],
    ['questions.0.difficulty', (k: any) => (k.questions[0].difficulty = 1.5)],
    ['schedule.days.0.minutes', (k: any) => (k.schedule.days[0].minutes = 45.5)],
    ['schedule.days.0.minutes', (k: any) => (k.schedule.days[0].minutes = 0)],
    ['schedule.days_available', (k: any) => (k.schedule.days_available = 0)],
    ['source.researched_at', (k: any) => (k.source.researched_at = 'yesterday')],
    ['coverage.passes', (k: any) => (k.coverage.passes = -1)],
    ['questions.0.id', (k: any) => (k.questions[0].id = 'question-1')],
    ['questions.0.id', (k: any) => (k.questions[0].id = 'r1')],
    ['questions.0.requirement_ids.0', (k: any) => (k.questions[0].requirement_ids = ['q1'])],
    ['schedule.days.0.question_ids.0', (k: any) => (k.schedule.days[0].question_ids = ['f1'])],
  ])('rejects invalid %s', (path, mutate) => {
    const kit = makeValidKit();
    mutate(kit);
    expect(issuesOf(kit).map((i) => i.path)).toContain(path);
  });
});

describe('validateKit — referential integrity', () => {
  it('rejects duplicate requirement ids', () => {
    const kit = makeValidKit();
    kit.role.requirements[1]!.id = 'r1';
    expect(issuesOf(kit)).toContainEqual({
      path: 'role.requirements.1.id',
      message: 'duplicate id r1',
    });
  });

  it('rejects duplicate question ids', () => {
    const kit = makeValidKit();
    kit.questions[2]!.id = 'q1';
    expect(issuesOf(kit).map((i) => i.path)).toContain('questions.2.id');
  });

  it('rejects a question referencing an unknown requirement', () => {
    const kit = makeValidKit();
    kit.questions[0]!.requirement_ids = ['r99'];
    expect(issuesOf(kit).map((i) => i.path)).toContain('questions.0.requirement_ids.0');
  });

  it('rejects a flashcard referencing an unknown requirement', () => {
    const kit = makeValidKit();
    kit.flashcards[0]!.requirement_ids = ['r42'];
    expect(issuesOf(kit).map((i) => i.path)).toContain('flashcards.0.requirement_ids.0');
  });

  it('rejects coverage listing an unknown requirement', () => {
    const kit = makeValidKit();
    kit.coverage.uncovered_requirement_ids = ['r7'];
    expect(issuesOf(kit).map((i) => i.path)).toContain('coverage.uncovered_requirement_ids.0');
  });

  it('rejects coverage that contradicts the questions', () => {
    const kit = makeValidKit();
    kit.questions = kit.questions.filter((q) => !q.requirement_ids.includes('r3'));
    kit.schedule.days[0]!.question_ids = ['q1'];
    expect(issuesOf(kit).map((i) => i.path)).toContain('coverage.uncovered_requirement_ids');
    kit.coverage.uncovered_requirement_ids = ['r3'];
    expect(validateKit(kit).ok).toBe(true);
  });

  it('rejects a schedule whose length differs from days_available', () => {
    const kit = makeValidKit();
    kit.schedule.days_available = 3;
    expect(issuesOf(kit)).toContainEqual({
      path: 'schedule.days',
      message: 'expected exactly 3 days, got 2',
    });
  });

  it('rejects days that are not numbered 1..N in order', () => {
    const kit = makeValidKit();
    kit.schedule.days[1]!.day = 3;
    expect(issuesOf(kit).map((i) => i.path)).toContain('schedule.days.1.day');
  });

  it('rejects a schedule referencing a question that does not exist', () => {
    const kit = makeValidKit();
    kit.schedule.days[0]!.question_ids = ['q1', 'q404'];
    expect(issuesOf(kit).map((i) => i.path)).toContain('schedule.days.0.question_ids.1');
  });

  it('allows an empty kit skeleton for a thin JD (no requirements, no questions)', () => {
    const kit = makeValidKit();
    kit.role.requirements = [];
    kit.questions = [];
    kit.flashcards = [];
    kit.schedule = {
      days_available: 1,
      days: [{ day: 1, focus: 'General preparation', question_ids: [], minutes: 30 }],
    };
    expect(validateKit(kit).ok).toBe(true);
  });
});
