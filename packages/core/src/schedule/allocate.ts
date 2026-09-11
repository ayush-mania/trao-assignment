// Deterministic study schedule (Section 8). Arithmetic and allocation only — no model.
// Exactly `days` days; every must-have requirement appears; heavier, higher-priority material
// lands earlier; integer minutes; every day has something to do.
import {
  MAX_DAYS,
  type Kit,
  type Question,
  type Requirement,
  type ScheduleDay,
} from '../validation/kit-schema.js';

export const MINUTES_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 10, 2: 15, 3: 25 };
export const MIN_DAY_MINUTES = 30;

interface Topic {
  requirement: Requirement | null; // null = questions that cover no requirement (company-fit)
  questions: Question[];
  minutes: number;
  weight: number;
}

export function buildSchedule(
  days: number,
  requirements: Requirement[],
  questions: Question[],
): Kit['schedule'] {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`days must be an integer between 1 and ${MAX_DAYS}, got ${days}`);
  }
  const topics = buildTopics(requirements, questions);
  const buckets: { minutes: number; topics: Topic[] }[] = Array.from({ length: days }, () => ({
    minutes: 0,
    topics: [],
  }));

  // Must-have topics first, then nice, each group heaviest first. A topic goes to the lightest day
  // among those not later than the last day already holding a must-have of higher weight, so that
  // priority order is respected while load stays balanced.
  let frontier = 0;
  for (const topic of topics) {
    const window = buckets.slice(0, Math.min(days, frontier + 1));
    let target = 0;
    for (let i = 0; i < window.length; i++)
      if (window[i]!.minutes < window[target]!.minutes) target = i;
    if (buckets[target]!.minutes > 0 && frontier < days - 1 && topic.requirement) {
      // If every day in the window already has work, open the next day to keep spreading.
      frontier += 1;
      const candidate = buckets[frontier]!;
      if (candidate.minutes < buckets[target]!.minutes) target = frontier;
    }
    buckets[target]!.topics.push(topic);
    buckets[target]!.minutes += topic.minutes;
  }

  const scheduleDays: ScheduleDay[] = buckets.map((b, i) => ({
    day: i + 1,
    focus: focusFor(b.topics),
    question_ids: b.topics.flatMap((t) => t.questions.map((q) => q.id)),
    minutes: Math.max(MIN_DAY_MINUTES, Math.round(b.minutes)),
  }));

  fillEmptyDays(scheduleDays, topics, questions);
  assertValid(days, requirements, questions, scheduleDays);
  return { days_available: days, days: scheduleDays };
}

function buildTopics(requirements: Requirement[], questions: Question[]): Topic[] {
  const byReq = new Map<string, Question[]>();
  const orphan: Question[] = [];
  const known = new Set(requirements.map((r) => r.id));
  for (const q of questions) {
    // A question covering several requirements is studied with the one that has the fewest
    // questions so far (ties → listed order). Real kits tag a broad requirement such as
    // "3+ years" on almost every question; filing by first id piled 12 questions onto one day.
    const candidates = q.requirement_ids.filter((id) => known.has(id));
    const home = candidates.reduce<string | undefined>(
      (best, id) =>
        best === undefined || (byReq.get(id)?.length ?? 0) < (byReq.get(best)?.length ?? 0)
          ? id
          : best,
      undefined,
    );
    if (home) byReq.set(home, [...(byReq.get(home) ?? []), q]);
    else orphan.push(q);
  }
  const topics: Topic[] = requirements.map((r) => {
    const qs = byReq.get(r.id) ?? [];
    const minutes = qs.reduce((s, q) => s + MINUTES_BY_DIFFICULTY[q.difficulty as 1 | 2 | 3], 0);
    const avgDifficulty = qs.length ? qs.reduce((s, q) => s + q.difficulty, 0) / qs.length : 1;
    return {
      requirement: r,
      questions: qs,
      minutes,
      weight: (r.priority === 'must' ? 3 : 1) * avgDifficulty,
    };
  });
  topics.sort((a, b) => {
    const pa = a.requirement!.priority === 'must' ? 0 : 1;
    const pb = b.requirement!.priority === 'must' ? 0 : 1;
    return pa - pb || b.weight - a.weight || b.minutes - a.minutes;
  });
  if (orphan.length) {
    topics.push({
      requirement: null,
      questions: orphan,
      minutes: orphan.reduce((s, q) => s + MINUTES_BY_DIFFICULTY[q.difficulty as 1 | 2 | 3], 0),
      weight: 0,
    });
  }
  return topics;
}

function focusFor(topics: Topic[]): string {
  if (topics.length === 0) return 'Review';
  const names = topics.map((t) => (t.requirement ? t.requirement.text : 'Company and fit'));
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} (+${names.length - 3} more)` : shown;
}

/**
 * More days than topics (e.g. a 60-day request): spare days become review days that revisit
 * earlier material, must-haves and hard questions first, so no day is empty and ids stay valid.
 */
function fillEmptyDays(days: ScheduleDay[], topics: Topic[], questions: Question[]): void {
  const pool = topics.flatMap((t) => t.questions);
  const cycle = pool.length ? pool : questions;
  let cursor = 0;
  for (const day of days) {
    if (day.question_ids.length > 0) continue;
    if (cycle.length === 0) {
      day.focus = 'General preparation: research the company and rehearse your introduction';
      day.minutes = MIN_DAY_MINUTES;
      continue;
    }
    const take = Math.min(3, cycle.length);
    const picked = Array.from({ length: take }, () => cycle[cursor++ % cycle.length]!);
    day.question_ids = picked.map((q) => q.id);
    day.focus = `Review: ${focusFor(topics.filter((t) => t.questions.some((q) => picked.includes(q))))}`;
    day.minutes = Math.max(
      MIN_DAY_MINUTES,
      picked.reduce((s, q) => s + MINUTES_BY_DIFFICULTY[q.difficulty as 1 | 2 | 3], 0),
    );
  }
}

/** Section 8 post-conditions. A violation here is a bug in this file, so it throws. */
function assertValid(
  days: number,
  requirements: Requirement[],
  questions: Question[],
  out: ScheduleDay[],
): void {
  if (out.length !== days) throw new Error(`schedule has ${out.length} days, expected ${days}`);
  const qids = new Set(questions.map((q) => q.id));
  const scheduled = new Set(out.flatMap((d) => d.question_ids));
  for (const id of scheduled)
    if (!qids.has(id)) throw new Error(`schedule references unknown question ${id}`);
  for (const d of out) {
    if (!Number.isInteger(d.minutes) || d.minutes < 1)
      throw new Error(`day ${d.day} has invalid minutes ${d.minutes}`);
  }
  const coveredByScheduled = new Set(
    questions.filter((q) => scheduled.has(q.id)).flatMap((q) => q.requirement_ids),
  );
  for (const r of requirements) {
    const hasQuestion = questions.some((q) => q.requirement_ids.includes(r.id));
    if (r.priority === 'must' && hasQuestion && !coveredByScheduled.has(r.id)) {
      throw new Error(`must-have ${r.id} has questions but none is scheduled`);
    }
  }
}
