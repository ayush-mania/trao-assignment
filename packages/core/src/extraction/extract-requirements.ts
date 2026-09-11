// JD → role + requirements (Section 3, Evaluation: 20 points for extraction).
// The model proposes; code disposes. Every requirement must quote the JD (anti-invention gate),
// priority is derived from the posting's wording, ids are assigned here.
import { z } from 'zod';
import { looseString, looseStringArray } from '../llm/lenient.js';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_PREAMBLE, wrapUntrusted } from '../llm/prompting.js';
import { REQUIREMENT_KINDS, type Requirement } from '../validation/kit-schema.js';
import { derivePriority, indexOfLoose } from './priority.js';

export const THIN_JD_CHARS = 200;

// Logistics the model sometimes lists as requirements ("start immediately", "Remote"). Anchored so
// a real skill mentioning these words in passing is not dropped.
const LOGISTICS =
  /^(start(ing)? (immediately|asap|date)|immediate start|remote|hybrid|on-?site|full[- ]time|part[- ]time|contract|permanent|salary|compensation|benefits|visa|relocation|(based|located) in .*|[a-z ]+ \(remote\))\.?$/i;

const ProposedSchema = z.object({
  title: looseString.pipe(z.string().max(200)).default(''),
  seniority: looseString.pipe(z.string().max(60)).default(''),
  location: looseString.pipe(z.string().max(120)).default(''),
  company: looseString.pipe(z.string().max(120)).default(''),
  responsibilities: looseStringArray.pipe(z.array(z.string().max(300)).max(25)).default([]),
  requirements: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(300),
        evidence: z.string().trim().min(4).max(300),
        kind: z.enum(REQUIREMENT_KINDS),
      }),
    )
    .max(60)
    .default([]),
});

export interface ExtractedRole {
  title: string;
  seniority: string;
  location: string;
  /** Company name as the JD states it (may be empty). */
  company: string;
  responsibilities: string[];
  requirements: Requirement[];
  /** Requirements the model proposed that did not quote the JD; kept for the run log. */
  rejected: {
    text: string;
    evidence: string;
    reason: 'no_evidence' | 'duplicate' | 'not_a_requirement';
  }[];
  /** True when the JD is too short to extract much from — the kit should say so. */
  thin: boolean;
  note: string | null;
}

const SYSTEM = `You extract structured facts from a job description for interview preparation.
${UNTRUSTED_PREAMBLE}
Rules:
- Only list requirements the description actually states. Do not infer, generalise or add typical requirements for the role.
- Include EVERY stated requirement, including those under "Nice to have", "Preferred", "Bonus" or "Plus" headings. Priority is decided separately; your job is completeness without invention.
- A requirement is a skill, experience, qualification or trait the candidate must bring. Logistics are NOT requirements: start date, location, remote/hybrid, salary, visa, hours, benefits, the job title itself.
- For each requirement, "evidence" must be an exact phrase copied verbatim from the description (10-200 characters) that states it.
- kind: "technical" for tools, languages, systems and engineering skills; "behavioural" for collaboration, leadership, communication, mentoring, ownership; "domain" for industry or product knowledge.
- One requirement per distinct skill; do not split one phrase into many.
- Responsibilities are what the person will do, taken from the description.
- If the description is very short, return few or zero requirements. An empty list is a correct answer for a thin description.
Return JSON: {"title","seniority","location","company","responsibilities":[...],"requirements":[{"text","evidence","kind"}]}`;

export async function extractRequirements(jd: string, llm: LlmClient): Promise<ExtractedRole> {
  const text = jd.trim();
  const thin = text.length < THIN_JD_CHARS;
  const { data } = await llm.completeJson({
    system: SYSTEM,
    user: `Extract the role and requirements.\n${wrapUntrusted('job description', text, 16_000)}`,
    schema: ProposedSchema,
    temperature: 0,
  });

  const requirements: Requirement[] = [];
  const rejected: ExtractedRole['rejected'] = [];
  const seen = new Set<string>();
  for (const r of data.requirements) {
    if (LOGISTICS.test(r.text) || LOGISTICS.test(r.evidence)) {
      rejected.push({ text: r.text, evidence: r.evidence, reason: 'not_a_requirement' });
      continue;
    }
    if (indexOfLoose(text, r.evidence) < 0) {
      rejected.push({ text: r.text, evidence: r.evidence, reason: 'no_evidence' });
      continue;
    }
    const key = normaliseKey(r.text);
    if (seen.has(key)) {
      rejected.push({ text: r.text, evidence: r.evidence, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    requirements.push({
      id: `r${requirements.length + 1}`,
      text: r.text.trim(),
      kind: r.kind,
      priority: derivePriority({ jd: text, evidence: r.evidence }),
    });
  }

  const tooFew = requirements.length < 2;
  const note =
    thin || tooFew
      ? `The job description is short (${text.length} characters) and yields ${requirements.length} explicit requirement(s). The kit is deliberately thin rather than padded with assumed requirements.`
      : null;

  return {
    title: data.title.trim(),
    seniority: data.seniority.trim(),
    location: data.location.trim(),
    company: data.company.trim(),
    responsibilities: data.responsibilities.map((s) => s.trim()).filter(Boolean),
    requirements,
    rejected,
    thin: thin || tooFew,
    note,
  };
}

function normaliseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
