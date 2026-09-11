// Coverage is code's decision, not the model's (Sections 3-4). findGaps is a set difference; the
// loop generates questions only for the gaps and re-checks, stopping when no must-have is
// uncovered, when a pass makes no progress, or at the pass cap.
import type { LlmClient } from '../llm/client.js';
import { generateQuestionsForCategory, type QuestionGenInput } from '../generation/questions.js';
import type { Question, QuestionCategory, Requirement } from '../validation/kit-schema.js';

export const MAX_COVERAGE_PASSES = 3;

export interface CoverageGaps {
  uncovered: string[];
  uncoveredMust: string[];
  uncoveredNice: string[];
}

export function findGaps(requirements: Requirement[], questions: Question[]): CoverageGaps {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  const missing = requirements.filter((r) => !covered.has(r.id));
  return {
    uncovered: missing.map((r) => r.id),
    uncoveredMust: missing.filter((r) => r.priority === 'must').map((r) => r.id),
    uncoveredNice: missing.filter((r) => r.priority === 'nice').map((r) => r.id),
  };
}

export interface CoveragePass {
  pass: number;
  gapsBefore: string[];
  generated: number;
  gapsAfter: string[];
}

export interface CoverageResult {
  questions: Question[];
  passes: number;
  uncovered: string[];
  log: CoveragePass[];
  stoppedBecause: 'covered' | 'no_progress' | 'max_passes' | 'nothing_to_do';
}

/**
 * Second pass (and third) over the gaps. `passes` counts the initial generation as pass 1, so a kit
 * that needed one gap-closing round reports passes: 2.
 */
export async function closeCoverage(
  input: QuestionGenInput,
  initial: Question[],
  llm: LlmClient,
  opts: { maxPasses?: number } = {},
): Promise<CoverageResult> {
  const maxPasses = opts.maxPasses ?? MAX_COVERAGE_PASSES;
  const questions = [...initial];
  const log: CoveragePass[] = [];
  let passes = 1;
  let gaps = findGaps(input.requirements, questions);
  if (gaps.uncoveredMust.length === 0) {
    return { questions, passes, uncovered: gaps.uncovered, log, stoppedBecause: gaps.uncovered.length ? 'covered' : 'nothing_to_do' };
  }

  let stoppedBecause: CoverageResult['stoppedBecause'] = 'max_passes';
  while (passes < maxPasses) {
    passes += 1;
    const before = gaps.uncovered;
    // Close must-have gaps; take nice-to-have gaps along in the same calls since they cost nothing extra.
    const targets = input.requirements.filter((r) => before.includes(r.id));
    let generated = 0;
    for (const [category, reqs] of groupByCategory(targets)) {
      const extra = await generateQuestionsForCategory(
        { category, requirements: reqs, count: reqs.length },
        input,
        llm,
        {
          extraGuidance:
            `These requirements have no question yet. Write exactly one question per requirement and ` +
            `reference its id in requirement_ids: ${reqs.map((r) => r.id).join(', ')}.`,
        },
      );
      for (const q of extra) {
        if (q.requirement_ids.length === 0) continue; // an unattributed question closes nothing
        questions.push({ id: `q${questions.length + 1}`, ...q });
        generated += 1;
      }
    }
    gaps = findGaps(input.requirements, questions);
    log.push({ pass: passes, gapsBefore: before, generated, gapsAfter: gaps.uncovered });
    if (gaps.uncoveredMust.length === 0) {
      stoppedBecause = 'covered';
      break;
    }
    if (gaps.uncovered.length >= before.length) {
      stoppedBecause = 'no_progress';
      break;
    }
  }
  return { questions, passes, uncovered: gaps.uncovered, log, stoppedBecause };
}

function groupByCategory(reqs: Requirement[]): Map<QuestionCategory, Requirement[]> {
  const out = new Map<QuestionCategory, Requirement[]>();
  for (const r of reqs) {
    const cat: QuestionCategory = r.kind === 'behavioural' ? 'behavioural' : 'technical';
    out.set(cat, [...(out.get(cat) ?? []), r]);
  }
  return out;
}
