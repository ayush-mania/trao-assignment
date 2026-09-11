import { describe, expect, it } from 'vitest';
import type { Question, Requirement } from '../validation/kit-schema.js';
import { buildSchedule, MIN_DAY_MINUTES } from './allocate.js';

const reqs: Requirement[] = [
  { id: 'r1', text: 'Node.js', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Kafka', kind: 'technical', priority: 'nice' },
  { id: 'r4', text: 'System design', kind: 'technical', priority: 'must' },
  { id: 'r5', text: 'GraphQL', kind: 'technical', priority: 'nice' },
];
let n = 0;
const q = (
  ids: string[],
  difficulty: 1 | 2 | 3,
  category: Question['category'] = 'technical',
): Question => ({
  id: `q${++n}`,
  requirement_ids: ids,
  category,
  prompt: 'p',
  answer_outline: '',
  difficulty,
});
const questions: Question[] = [
  q(['r1'], 2),
  q(['r1'], 3),
  q(['r2'], 1, 'behavioural'),
  q(['r2'], 2, 'behavioural'),
  q(['r3'], 2),
  q(['r4'], 3, 'system-design'),
  q(['r4'], 3, 'system-design'),
  q(['r5'], 1),
  q([], 1, 'company-fit'),
  q([], 1, 'company-fit'),
];

const mustIds = reqs.filter((r) => r.priority === 'must').map((r) => r.id);
const coveredIn = (days: ReturnType<typeof buildSchedule>['days']) =>
  new Set(
    days
      .flatMap((d) => d.question_ids)
      .flatMap((id) => questions.find((x) => x.id === id)!.requirement_ids),
  );

describe('buildSchedule', () => {
  it.each([1, 2, 5, 60])(
    'produces exactly %i days, all must-haves, valid ids, integer minutes',
    (days) => {
      const s = buildSchedule(days, reqs, questions);
      expect(s.days_available).toBe(days);
      expect(s.days).toHaveLength(days);
      expect(s.days.map((d) => d.day)).toEqual(Array.from({ length: days }, (_, i) => i + 1));
      const covered = coveredIn(s.days);
      for (const id of mustIds) expect(covered.has(id)).toBe(true);
      for (const d of s.days) {
        expect(Number.isInteger(d.minutes)).toBe(true);
        expect(d.minutes).toBeGreaterThanOrEqual(MIN_DAY_MINUTES);
        expect(d.question_ids.length).toBeGreaterThan(0);
        expect(d.focus.length).toBeGreaterThan(0);
      }
    },
  );

  it('schedules every question exactly once when days <= topics', () => {
    const s = buildSchedule(3, reqs, questions);
    const all = s.days.flatMap((d) => d.question_ids).sort();
    expect(all).toEqual(questions.map((x) => x.id).sort());
  });

  it('puts must-have and harder material before nice-to-have', () => {
    const s = buildSchedule(5, reqs, questions);
    const dayOf = (rid: string) =>
      s.days.findIndex((d) =>
        d.question_ids.some((id) => questions.find((x) => x.id === id)!.requirement_ids[0] === rid),
      );
    expect(dayOf('r4')).toBeLessThanOrEqual(dayOf('r3'));
    expect(dayOf('r1')).toBeLessThanOrEqual(dayOf('r5'));
    expect(s.days[0]!.focus).toMatch(/System design|Node\.js/);
  });

  it('turns spare days into review days that reuse earlier questions (60-day case)', () => {
    const s = buildSchedule(60, reqs, questions);
    const review = s.days.filter((d) => d.focus.startsWith('Review'));
    expect(review.length).toBeGreaterThan(40);
    expect(new Set(s.days.slice(0, 6).flatMap((d) => d.question_ids)).size).toBe(questions.length);
  });

  it('still yields N valid days for a thin kit with no questions', () => {
    const s = buildSchedule(3, [], []);
    expect(s.days).toHaveLength(3);
    for (const d of s.days) {
      expect(d.question_ids).toEqual([]);
      expect(d.minutes).toBe(MIN_DAY_MINUTES);
      expect(d.focus).toMatch(/General preparation/);
    }
  });

  it('rejects a non-integer or non-positive day count', () => {
    expect(() => buildSchedule(0, reqs, questions)).toThrow(/positive integer/);
    expect(() => buildSchedule(2.5, reqs, questions)).toThrow(/positive integer/);
  });
});
