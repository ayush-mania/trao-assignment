// Structure + referential integrity validation, run before a kit is persisted or emitted (Section 13).
// Zod checks shape; the integrity pass checks the cross-references Appendix A requires:
// ids unique and stable, every referenced id exists, schedule spans exactly days_available.
import { KitSchema, type Kit } from './kit-schema.js';

export interface KitIssue {
  path: string;
  message: string;
}

export type ValidateKitResult = { ok: true; kit: Kit } | { ok: false; issues: KitIssue[] };

export function validateKit(input: unknown): ValidateKitResult {
  const parsed = KitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const issues = checkIntegrity(parsed.data);
  return issues.length === 0 ? { ok: true, kit: parsed.data } : { ok: false, issues };
}

export function checkIntegrity(kit: Kit): KitIssue[] {
  const issues: KitIssue[] = [];

  const requirementIds = uniqueIds(kit.role.requirements, 'role.requirements', issues);
  const questionIds = uniqueIds(kit.questions, 'questions', issues);
  uniqueIds(kit.flashcards, 'flashcards', issues);

  kit.questions.forEach((q, i) =>
    q.requirement_ids.forEach((rid, j) => {
      if (!requirementIds.has(rid)) {
        issues.push({
          path: `questions.${i}.requirement_ids.${j}`,
          message: `unknown requirement id ${rid}`,
        });
      }
    }),
  );
  kit.flashcards.forEach((f, i) =>
    f.requirement_ids.forEach((rid, j) => {
      if (!requirementIds.has(rid)) {
        issues.push({
          path: `flashcards.${i}.requirement_ids.${j}`,
          message: `unknown requirement id ${rid}`,
        });
      }
    }),
  );
  kit.coverage.uncovered_requirement_ids.forEach((rid, i) => {
    if (!requirementIds.has(rid)) {
      issues.push({
        path: `coverage.uncovered_requirement_ids.${i}`,
        message: `unknown requirement id ${rid}`,
      });
    }
  });
  // coverage must be derivable from the questions, not asserted: a kit that claims full coverage
  // while a requirement has no question would hide a coverage-loop bug.
  const covered = new Set(kit.questions.flatMap((q) => q.requirement_ids));
  const expectedUncovered = kit.role.requirements.map((r) => r.id).filter((id) => !covered.has(id));
  const declared = [...kit.coverage.uncovered_requirement_ids].sort();
  if (JSON.stringify(declared) !== JSON.stringify([...expectedUncovered].sort())) {
    issues.push({
      path: 'coverage.uncovered_requirement_ids',
      message: `expected [${expectedUncovered.join(', ')}] from questions, got [${declared.join(', ')}]`,
    });
  }

  const { days_available, days } = kit.schedule;
  if (days.length !== days_available) {
    issues.push({
      path: 'schedule.days',
      message: `expected exactly ${days_available} days, got ${days.length}`,
    });
  }
  days.forEach((d, i) => {
    if (d.day !== i + 1) {
      issues.push({
        path: `schedule.days.${i}.day`,
        message: `expected day ${i + 1}, got ${d.day}`,
      });
    }
    d.question_ids.forEach((qid, j) => {
      if (!questionIds.has(qid)) {
        issues.push({
          path: `schedule.days.${i}.question_ids.${j}`,
          message: `unknown question id ${qid}`,
        });
      }
    });
  });

  return issues;
}

function uniqueIds(items: { id: string }[], path: string, issues: KitIssue[]): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      issues.push({ path: `${path}.${i}.id`, message: `duplicate id ${item.id}` });
    }
    seen.add(item.id);
  });
  return seen;
}
