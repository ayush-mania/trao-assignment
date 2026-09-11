// Flashcards per requirement cluster; f ids and requirement_ids are verified in code.
import { z } from 'zod';
import { looseString, looseStringArray, rootArrayAs } from '../llm/lenient.js';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_PREAMBLE } from '../llm/prompting.js';
import type { Flashcard, Requirement } from '../validation/kit-schema.js';

const ProposedCards = z.preprocess(
  rootArrayAs('flashcards'),
  z.object({
    flashcards: z
      .array(
        z.object({
          front: z.string().trim().min(1).max(200),
          back: looseString.pipe(z.string().trim().min(1).max(1000)),
          requirement_ids: looseStringArray.default([]),
        }),
      )
      .default([]),
  }),
);

const SYSTEM = `You write revision flashcards for interview preparation.
${UNTRUSTED_PREAMBLE}
Rules:
- front: a crisp question or term (max 120 characters). back: the answer in 1-3 sentences a candidate can recall aloud.
- Each card references the requirement ids it helps with. Use only ids from the list.
- Cover every requirement at least once; must-have requirements get 2 cards, nice-to-have get 1.
Return JSON: {"flashcards":[{"front","back","requirement_ids":["r1"]}]}`;

export async function generateFlashcards(
  requirements: Requirement[],
  role: { title: string },
  llm: LlmClient,
): Promise<Flashcard[]> {
  if (requirements.length === 0) return [];
  const known = new Set(requirements.map((r) => r.id));
  const { data } = await llm.completeJson({
    system: SYSTEM,
    user: `Role: ${role.title || 'unknown'}\nRequirements (id [priority] text):\n${requirements
      .map((r) => `${r.id} [${r.priority}] ${r.text}`)
      .join('\n')}`,
    schema: ProposedCards,
    temperature: 0.3,
  });
  return data.flashcards.slice(0, 40).map((c, i) => ({
    id: `f${i + 1}`,
    front: c.front.trim(),
    back: c.back.trim(),
    requirement_ids: [...new Set(c.requirement_ids.filter((id) => known.has(id)))],
  }));
}
