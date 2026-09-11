// Run state for one kit. Plain JSON so the API can persist it after every step and resume, and the
// batch CLI can drive it in a loop. `advance()` in run.ts moves it forward one step at a time (D10).
import type { ExtractedRole } from '../extraction/extract-requirements.js';
import type { ResearchContext } from '../generation/research-context.js';
import type { CoveragePass } from '../coverage/coverage.js';
import type { Flashcard, Kit, Question } from '../validation/kit-schema.js';

export const STEPS = [
  'validate_input',
  'extract_requirements',
  'crawl_company',
  'search_discussion',
  'company_brief',
  'generate_questions',
  'close_coverage',
  'flashcards',
  'build_schedule',
  'assemble_and_validate',
] as const;
export type StepName = (typeof STEPS)[number];

export type RunErrorCode = 'INVALID_INPUT' | 'LLM_UNAVAILABLE' | 'KIT_INVALID' | 'INTERNAL';

export interface RunInput {
  jd: string;
  company_url: string;
  days: number;
}

export interface StepRecord {
  name: StepName;
  status: 'ok' | 'skipped' | 'failed';
  startedAt: string;
  ms: number;
  /** Short human-readable facts for the progress UI and the batch log. */
  notes: string[];
}

export interface RunArtifacts {
  role?: ExtractedRole;
  research?: ResearchContext;
  pagesUsed?: string[];
  brief?: Kit['company_brief'];
  hiringProcess?: string;
  questions?: Question[];
  coverage?: { passes: number; uncovered: string[]; log: CoveragePass[] };
  flashcards?: Flashcard[];
  schedule?: Kit['schedule'];
  kit?: Kit;
}

export interface RunState {
  input: RunInput;
  /** Index into STEPS of the next step to run. */
  step: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  steps: StepRecord[];
  artifacts: RunArtifacts;
  error: { code: RunErrorCode; message: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function createRunState(input: RunInput): RunState {
  return {
    input: { jd: input.jd, company_url: input.company_url, days: input.days },
    step: 0,
    status: 'pending',
    steps: [],
    artifacts: {},
    error: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function currentStep(state: RunState): StepName | null {
  return STEPS[state.step] ?? null;
}
