// Question generation, one call per category with category-specific instructions (Section 3:
// "the two should not come from the same call with the same instructions"). What was found about
// the hiring process changes which categories are requested and how many questions each gets.
import { z } from 'zod';
import { looseString, looseStringArray, rootArrayAs } from '../llm/lenient.js';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_PREAMBLE, wrapUntrusted } from '../llm/prompting.js';
import type { Question, QuestionCategory, Requirement } from '../validation/kit-schema.js';
import { hiringSignals, type ResearchContext } from './research-context.js';

const ProposedQuestions = z.preprocess(
  rootArrayAs('questions'),
  z.object({
    questions: z
      .array(
        z.object({
          prompt: z.string().trim().min(1).max(600),
          answer_outline: looseString.pipe(z.string().max(2000)).default(''),
          requirement_ids: looseStringArray.default([]),
          difficulty: z.number().default(2),
        }),
      )
      .default([]),
  }),
);

export interface CategoryPlan {
  category: QuestionCategory;
  requirements: Requirement[];
  count: number;
}

export interface QuestionGenInput {
  role: { title: string; seniority: string; responsibilities: string[] };
  requirements: Requirement[];
  research: ResearchContext;
  /** From the brief step: what the hiring page/discussion say about the process. */
  hiringProcess: string;
}

/**
 * Decide which categories to generate and how many questions each gets. Deterministic.
 * Technical/domain requirements → technical; behavioural → behavioural; system design and
 * company-fit depend on seniority and on what the hiring page says.
 */
export function planCategories(input: QuestionGenInput): CategoryPlan[] {
  const { requirements, research, role } = input;
  const signals = hiringSignals(research);
  const technical = requirements.filter((r) => r.kind === 'technical' || r.kind === 'domain');
  const behavioural = requirements.filter((r) => r.kind === 'behavioural');
  const senior = /senior|staff|principal|lead|architect|head/i.test(
    `${role.title} ${role.seniority}`,
  );
  const plans: CategoryPlan[] = [];

  if (technical.length) {
    // A take-home-first process asks fewer whiteboard-style questions; algorithms-heavy asks more.
    const per = signals.takeHome && !signals.algorithms ? 1 : 2;
    plans.push({
      category: 'technical',
      requirements: technical,
      count: clamp(technical.length * per, 3, 12),
    });
  }
  if (behavioural.length || signals.behavioural || role.responsibilities.length) {
    plans.push({
      category: 'behavioural',
      requirements: behavioural,
      count: clamp(behavioural.length * 2, 3, 8),
    });
  }
  if (technical.length && (senior || signals.systemDesign)) {
    plans.push({
      category: 'system-design',
      requirements: technical,
      count: signals.systemDesign ? 4 : 2,
    });
  }
  if (
    research.aboutPage ||
    research.homepage ||
    research.hiringPage ||
    research.discussion.length
  ) {
    plans.push({ category: 'company-fit', requirements: [], count: 3 });
  }
  return plans;
}

const CATEGORY_INSTRUCTIONS: Record<QuestionCategory, string> = {
  technical: `Write technical interview questions that test the listed requirements directly. Mix conceptual "explain how X works" questions with practical "how would you debug/implement Y" ones. answer_outline lists the 3-5 points a strong answer covers. difficulty 1 = fundamentals, 2 = applied, 3 = deep or tricky.`,
  behavioural: `Write behavioural interview questions in the "Tell me about a time..." form, each tied to a listed requirement or responsibility (mentoring, ownership, collaboration, incidents, communication). answer_outline is a STAR skeleton naming what a strong story includes. difficulty reflects how much reflection and seniority the question demands.`,
  'system-design': `Write system design interview prompts grounded in the role's domain and the listed technical requirements: scale, data flow, failure modes, trade-offs. answer_outline lists the components and trade-offs an interviewer expects to hear. difficulty 2 or 3.`,
  'company-fit': `Write questions an interviewer at THIS company would plausibly ask about motivation and fit, grounded strictly in the company documents (products, customers, values, stated process). answer_outline says what to research or mention. difficulty 1 or 2. requirement_ids may be empty.`,
};

const SYSTEM_BASE = `You generate interview preparation questions.
${UNTRUSTED_PREAMBLE}
General rules:
- Each question must reference the ids of the requirements it tests in "requirement_ids" (use only ids from the list given; empty only when told it may be empty).
- Do not invent requirements or company facts; if the documents do not say something, do not assume it.
- Prompts are self-contained and specific to this role, never generic filler.
Return JSON: {"questions":[{"prompt","answer_outline","requirement_ids":["r1"],"difficulty":1-3}]}`;

export async function generateQuestionsForCategory(
  plan: CategoryPlan,
  input: QuestionGenInput,
  llm: LlmClient,
  opts: { extraGuidance?: string } = {},
): Promise<Omit<Question, 'id'>[]> {
  const known = new Set(input.requirements.map((r) => r.id));
  const reqList =
    plan.requirements.map((r) => `${r.id} [${r.priority}] ${r.text}`).join('\n') || '(none)';
  const context = [
    `Role: ${input.role.title || 'unknown'} (${input.role.seniority || 'seniority unknown'})`,
    input.role.responsibilities.length
      ? `Responsibilities:\n- ${input.role.responsibilities.join('\n- ')}`
      : '',
    // Derived from crawled pages, so it stays inside the untrusted boundary like any other web text.
    input.hiringProcess
      ? wrapUntrusted(
          'what company documents say about their interview process',
          input.hiringProcess,
          1_500,
        )
      : 'Nothing is known about their interview process.',
    plan.category === 'company-fit' ? companyDocs(input.research) : '',
    `Requirements to cover (id [priority] text):\n${reqList}`,
    `Write exactly ${plan.count} questions.`,
    opts.extraGuidance ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data } = await llm.completeJson({
    system: `${SYSTEM_BASE}\n\nCategory: ${plan.category}\n${CATEGORY_INSTRUCTIONS[plan.category]}`,
    user: context,
    schema: ProposedQuestions,
    temperature: 0.4,
  });

  return data.questions.slice(0, plan.count + 2).map((q) => ({
    requirement_ids: [...new Set(q.requirement_ids.filter((id) => known.has(id)))],
    category: plan.category,
    prompt: q.prompt.trim(),
    answer_outline: q.answer_outline.trim(),
    difficulty: clamp(Math.round(q.difficulty), 1, 3),
  }));
}

/** Runs the plan sequentially (rate limits) and assigns q ids in code. */
export async function generateQuestions(
  input: QuestionGenInput,
  llm: LlmClient,
): Promise<{ questions: Question[]; plan: CategoryPlan[] }> {
  const plan = planCategories(input);
  const questions: Question[] = [];
  for (const p of plan) {
    const generated = await generateQuestionsForCategory(p, input, llm);
    for (const q of generated) questions.push({ id: `q${questions.length + 1}`, ...q });
  }
  return { questions, plan };
}

function companyDocs(research: ResearchContext): string {
  return [
    research.aboutPage && wrapUntrusted('about page', research.aboutPage.text, 3_000),
    research.homepage &&
      research.homepage !== research.aboutPage &&
      wrapUntrusted('homepage', research.homepage.text, 2_000),
    research.hiringPage && wrapUntrusted('hiring page', research.hiringPage.text, 3_000),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
