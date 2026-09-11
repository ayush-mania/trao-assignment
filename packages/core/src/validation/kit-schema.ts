// Appendix A kit structure. Field names are exact and must not change (Section 5).
// Unknown keys are stripped on parse so a validated kit is always the canonical shape.
import { z } from 'zod';

/** Upper bound on a schedule length; the brief's largest case is 60 days. */
export const MAX_DAYS = 365;

export const REQUIREMENT_KINDS = ['technical', 'behavioural', 'domain'] as const;
export const REQUIREMENT_PRIORITIES = ['must', 'nice'] as const;
export const QUESTION_CATEGORIES = [
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
] as const;

const nonEmpty = z.string().trim().min(1);

// Ids are assigned by our code, never by the model (D19), so their shape is an internal invariant:
// r<n> for requirements, q<n> for questions, f<n> for flashcards. Binding the prefix per list catches
// wiring bugs (a question id where a requirement id belongs) that a loose "non-empty string" would not.
export const RequirementId = z.string().regex(/^r\d+$/, 'requirement ids look like r1');
export const QuestionId = z.string().regex(/^q\d+$/, 'question ids look like q1');
export const FlashcardId = z.string().regex(/^f\d+$/, 'flashcard ids look like f1');

export const RequirementSchema = z.object({
  id: RequirementId,
  text: nonEmpty,
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(REQUIREMENT_PRIORITIES),
});

export const QuestionSchema = z.object({
  id: QuestionId,
  requirement_ids: z.array(RequirementId),
  category: z.enum(QUESTION_CATEGORIES),
  prompt: nonEmpty,
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

export const FlashcardSchema = z.object({
  id: FlashcardId,
  front: nonEmpty,
  back: z.string(),
  requirement_ids: z.array(RequirementId),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: nonEmpty,
  question_ids: z.array(QuestionId),
  minutes: z.number().int().min(1),
});

export const KitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().min(0),
    researched_at: z.iso.datetime({ offset: true }),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema),
  }),
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: z.object({
    days_available: z.number().int().min(1).max(MAX_DAYS),
    days: z.array(ScheduleDaySchema),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(RequirementId),
    passes: z.number().int().min(0),
  }),
});

export type Kit = z.infer<typeof KitSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];
