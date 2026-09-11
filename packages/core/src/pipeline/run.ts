// The pipeline: one deliberate step per advance() call, each responding to what earlier steps found.
// Used unchanged by the API's in-process runner and by `npm run evaluate` (Section 9).
import { createHash } from 'node:crypto';
import { closeCoverage } from '../coverage/coverage.js';
import { extractRequirements } from '../extraction/extract-requirements.js';
import { generateCompanyBrief } from '../generation/company-brief.js';
import { generateFlashcards } from '../generation/flashcards.js';
import { generateQuestions, type QuestionGenInput } from '../generation/questions.js';
import type { ResearchContext } from '../generation/research-context.js';
import type { LlmClient } from '../llm/client.js';
import { LlmError } from '../llm/types.js';
import { crawlSite, type CrawlOptions } from '../retrieval/crawl-site.js';
import { searchPublicDiscussion, type DiscussionOptions } from '../retrieval/public-discussion.js';
import { buildSchedule } from '../schedule/allocate.js';
import { MAX_DAYS, type Kit } from '../validation/kit-schema.js';
import { validateKit } from '../validation/validate-kit.js';
import {
  createRunState,
  STEPS,
  type RunErrorCode,
  type RunInput,
  type RunState,
  type StepRecord,
} from './state.js';

export interface RunDeps {
  llm: LlmClient;
  crawl: Omit<CrawlOptions, 'fetchImpl'> & { fetchImpl?: typeof fetch };
  discussion?: DiscussionOptions;
  now?: () => Date;
}

export const MAX_JD_CHARS = 50_000;

/** Stable identity of a submission, for duplicate detection (Section 10). */
export function fingerprint(input: RunInput): string {
  const norm = `${input.jd.trim().replace(/\s+/g, ' ').toLowerCase()}\n${input.company_url.trim().toLowerCase()}\n${input.days}`;
  return createHash('sha256').update(norm).digest('hex');
}

/** Runs exactly one step. Never throws for research problems; sets status/error for real failures. */
export async function advance(state: RunState, deps: RunDeps): Promise<RunState> {
  if (state.status === 'done' || state.status === 'failed') return state;
  const name = STEPS[state.step];
  if (!name) return { ...state, status: 'done' };
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const next: RunState = {
    ...state,
    status: 'running',
    startedAt: state.startedAt ?? startedAt.toISOString(),
    artifacts: { ...state.artifacts },
    steps: [...state.steps],
  };
  const record: StepRecord = {
    name,
    status: 'ok',
    startedAt: startedAt.toISOString(),
    ms: 0,
    notes: [],
  };

  try {
    await runStep(name, next, deps, record);
    record.ms = now().getTime() - startedAt.getTime();
    next.steps.push(record);
    next.step += 1;
    if (next.step >= STEPS.length) {
      next.status = 'done';
      next.finishedAt = now().toISOString();
    }
    return next;
  } catch (err) {
    record.status = 'failed';
    record.ms = now().getTime() - startedAt.getTime();
    const { code, message } = classify(err);
    record.notes.push(message);
    next.steps.push(record);
    next.status = 'failed';
    next.error = { code, message };
    next.finishedAt = now().toISOString();
    return next;
  }
}

export async function runToCompletion(
  initial: RunState | RunInput,
  deps: RunDeps,
  onProgress?: (state: RunState) => void | Promise<void>,
): Promise<RunState> {
  let state: RunState = 'steps' in initial ? initial : createRunState(initial);
  while (state.status !== 'done' && state.status !== 'failed') {
    state = await advance(state, deps);
    await onProgress?.(state);
  }
  return state;
}

class InputError extends Error {}

async function runStep(name: (typeof STEPS)[number], s: RunState, deps: RunDeps, rec: StepRecord) {
  const a = s.artifacts;
  switch (name) {
    case 'validate_input': {
      const jd = s.input.jd.trim();
      if (jd.length === 0) throw new InputError('job description is empty');
      if (jd.length > MAX_JD_CHARS)
        throw new InputError(`job description exceeds ${MAX_JD_CHARS} characters`);
      if (!Number.isInteger(s.input.days) || s.input.days < 1 || s.input.days > MAX_DAYS) {
        throw new InputError(`days must be an integer between 1 and ${MAX_DAYS}`);
      }
      rec.notes.push(`jd ${jd.length} chars, ${s.input.days} day(s)`);
      return;
    }
    case 'extract_requirements': {
      a.role = await extractRequirements(s.input.jd, deps.llm);
      const must = a.role.requirements.filter((r) => r.priority === 'must').length;
      rec.notes.push(
        `${a.role.requirements.length} requirements (${must} must), ${a.role.rejected.length} rejected`,
      );
      if (a.role.thin) rec.notes.push('thin job description');
      return;
    }
    case 'crawl_company': {
      const crawl = await crawlSite(s.input.company_url, deps.crawl);
      const about = crawl.pages.find((p) => p.kind === 'about') ?? null;
      const hiring = crawl.pages.find((p) => p.kind === 'hiring') ?? null;
      const gaps: string[] = [];
      if (!crawl.homepage) {
        const why = crawl.skipped[0]?.reason ?? 'unknown';
        gaps.push(`company site unreachable (${why})`);
        rec.status = 'skipped';
      } else if (!hiring) {
        gaps.push(
          `no hiring page found on the site (${crawl.pages.length} pages crawled, stopped: ${crawl.stoppedBecause})`,
        );
      }
      a.research = {
        companyName: a.role?.company || hostnameOf(s.input.company_url),
        companyUrl: s.input.company_url,
        homepage: crawl.homepage,
        aboutPage: about ?? (crawl.homepage?.kind === 'about' ? crawl.homepage : null),
        hiringPage: hiring,
        discussion: [],
        gaps,
      };
      a.pagesUsed = crawl.pages.map((p) => p.url);
      rec.notes.push(
        `${crawl.pages.length} pages fetched, ${crawl.skipped.length} skipped, stopped: ${crawl.stoppedBecause}`,
      );
      rec.notes.push(hiring ? `hiring page: ${hiring.url}` : 'no hiring page found');
      if (about) rec.notes.push(`about page: ${about.url}`);
      return;
    }
    case 'search_discussion': {
      const research = a.research as ResearchContext;
      const r = await searchPublicDiscussion(research.companyName, deps.discussion);
      research.discussion = r.snippets;
      if (r.snippets.length === 0) {
        research.gaps.push('no public discussion of the interview process found');
        rec.status = 'skipped';
      }
      rec.notes.push(`${r.snippets.length} snippets for "${r.query}"`);
      for (const sk of r.skipped) rec.notes.push(`${sk.source} skipped: ${sk.reason}`);
      return;
    }
    case 'company_brief': {
      const r = await generateCompanyBrief(a.research as ResearchContext, deps.llm);
      a.brief = r.brief;
      a.hiringProcess = r.hiringProcess;
      rec.notes.push(
        r.llmCalls === 0
          ? 'no research available: honest empty brief'
          : `${r.brief.sources.length} sources`,
      );
      if (r.llmCalls === 0) rec.status = 'skipped';
      return;
    }
    case 'generate_questions': {
      const { questions, plan } = await generateQuestions(genInput(s), deps.llm);
      a.questions = questions;
      rec.notes.push(
        plan.map((p) => `${p.category}: ${p.count}`).join(', ') ||
          'no categories (no requirements)',
      );
      rec.notes.push(`${questions.length} questions`);
      return;
    }
    case 'close_coverage': {
      const r = await closeCoverage(genInput(s), a.questions ?? [], deps.llm);
      a.questions = r.questions;
      a.coverage = { passes: r.passes, uncovered: r.uncovered, log: r.log };
      rec.notes.push(
        `${r.passes} pass(es), stopped: ${r.stoppedBecause}, uncovered: ${r.uncovered.join(', ') || 'none'}`,
      );
      return;
    }
    case 'flashcards': {
      a.flashcards = await generateFlashcards(
        a.role!.requirements,
        { title: a.role!.title },
        deps.llm,
      );
      rec.notes.push(`${a.flashcards.length} flashcards`);
      return;
    }
    case 'build_schedule': {
      a.schedule = buildSchedule(s.input.days, a.role!.requirements, a.questions ?? []);
      rec.notes.push(
        `${a.schedule.days.length} days, ${a.schedule.days.reduce((t, d) => t + d.minutes, 0)} minutes total`,
      );
      return;
    }
    case 'assemble_and_validate': {
      const role = a.role!;
      const research = a.research as ResearchContext;
      const now = (deps.now ?? (() => new Date()))();
      const candidate: Kit = {
        source: {
          company: research.companyName,
          company_url: s.input.company_url,
          role: role.title,
          location: role.location,
          jd_chars: s.input.jd.trim().length,
          researched_at: now.toISOString(),
          pages_used: a.pagesUsed ?? [],
        },
        company_brief: a.brief!,
        role: {
          title: role.title,
          seniority: role.seniority,
          responsibilities: role.responsibilities,
          requirements: role.requirements,
        },
        questions: a.questions ?? [],
        flashcards: a.flashcards ?? [],
        schedule: a.schedule!,
        coverage: {
          uncovered_requirement_ids: a.coverage?.uncovered ?? [],
          passes: a.coverage?.passes ?? 1,
        },
      };
      if (role.note)
        candidate.company_brief = {
          ...candidate.company_brief,
          summary: `${candidate.company_brief.summary}\n\n${role.note}`,
        };
      const v = validateKit(candidate);
      if (!v.ok) {
        throw new KitInvalid(v.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
      }
      a.kit = v.kit;
      rec.notes.push('kit validated');
      return;
    }
  }
}

class KitInvalid extends Error {}

function genInput(s: RunState): QuestionGenInput {
  const role = s.artifacts.role!;
  return {
    role: { title: role.title, seniority: role.seniority, responsibilities: role.responsibilities },
    requirements: role.requirements,
    research: s.artifacts.research as ResearchContext,
    hiringProcess: s.artifacts.hiringProcess ?? '',
  };
}

function classify(err: unknown): { code: RunErrorCode; message: string } {
  if (err instanceof InputError) return { code: 'INVALID_INPUT', message: err.message };
  if (err instanceof KitInvalid)
    return { code: 'KIT_INVALID', message: `generated kit failed validation: ${err.message}` };
  if (err instanceof LlmError)
    return { code: 'LLM_UNAVAILABLE', message: `LLM providers exhausted: ${err.message}` };
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
