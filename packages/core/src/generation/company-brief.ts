// Company brief from retrieved text only (Sections 3, 10). No research → no model call, an honest
// brief that says what could not be found. Sources are the URLs actually used.
import { z } from 'zod';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_PREAMBLE, wrapUntrusted } from '../llm/prompting.js';
import type { Kit } from '../validation/kit-schema.js';
import { hasAnyResearch, researchSources, type ResearchContext } from './research-context.js';

const BriefSchema = z.object({
  summary: z.string().min(1),
  what_they_do: z.string().min(1),
  hiring_process: z.string().max(1500).default(''),
});

export interface CompanyBriefResult {
  brief: Kit['company_brief'];
  /** What the hiring page / discussion say about the process, for question generation. */
  hiringProcess: string;
  llmCalls: number;
}

const SYSTEM = `You write a short, factual company brief for someone preparing for an interview.
${UNTRUSTED_PREAMBLE}
Rules:
- Use only facts present in the documents. If something is not stated, say it is not known. Never guess at size, funding, products or process.
- "summary": 2-4 sentences: what the company is, who it serves, anything notable about how it works.
- "what_they_do": 1-3 sentences on products/services in plain language.
- "hiring_process": what the documents say about interview stages and format; empty string if nothing is stated.
Return JSON: {"summary","what_they_do","hiring_process"}`;

export async function generateCompanyBrief(
  ctx: ResearchContext,
  llm: LlmClient,
): Promise<CompanyBriefResult> {
  const name = ctx.companyName || 'the company';
  if (!hasAnyResearch(ctx)) {
    const why = ctx.gaps.length ? ` Reasons: ${ctx.gaps.join('; ')}.` : '';
    return {
      brief: {
        summary: `No public information about ${name} could be retrieved from ${ctx.companyUrl || 'the given website'} or from public discussion, so this brief is intentionally empty rather than invented.${why}`,
        what_they_do: 'Not known from available sources.',
        sources: [],
      },
      hiringProcess: '',
      llmCalls: 0,
    };
  }

  const docs = [
    ctx.aboutPage && wrapUntrusted(`about page ${ctx.aboutPage.url}`, ctx.aboutPage.text, 6_000),
    ctx.homepage &&
      ctx.homepage !== ctx.aboutPage &&
      wrapUntrusted(`homepage ${ctx.homepage.url}`, ctx.homepage.text, 4_000),
    ctx.hiringPage &&
      wrapUntrusted(`hiring page ${ctx.hiringPage.url}`, ctx.hiringPage.text, 6_000),
    ...ctx.discussion
      .slice(0, 6)
      .map((d) => wrapUntrusted(`public discussion ${d.url}`, `${d.title}\n${d.text}`, 800)),
  ].filter((d): d is string => Boolean(d));

  const missing = [
    !ctx.aboutPage && !ctx.homepage ? 'no about page or homepage was retrievable' : null,
    !ctx.hiringPage ? 'no hiring page was found on the site' : null,
    ctx.discussion.length === 0
      ? 'no public discussion of their interview process was found'
      : null,
  ].filter((m): m is string => Boolean(m));

  const { data } = await llm.completeJson({
    system: SYSTEM,
    user: `Company: ${name}\nWebsite: ${ctx.companyUrl}\n\n${docs.join('\n\n')}`,
    schema: BriefSchema,
    temperature: 0.2,
  });

  const caveat = missing.length ? ` Note: ${missing.join('; ')}.` : '';
  return {
    brief: {
      summary: `${data.summary.trim()}${caveat}`,
      what_they_do: data.what_they_do.trim(),
      sources: researchSources(ctx),
    },
    hiringProcess: data.hiring_process.trim(),
    llmCalls: 1,
  };
}
