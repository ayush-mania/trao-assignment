// Builder state (ADR 0008). Lives BESIDE the Appendix A kit, never inside it, so batch output and
// the validator only ever see a pure kit. Keyed by the stable ids code already assigns.
import { QUESTION_CATEGORIES, type Kit, type QuestionCategory } from '../validation/kit-schema.js';

export type ItemOrigin = 'generated' | 'edited' | 'manual';

export interface ItemMeta {
  origin: ItemOrigin;
  pinned: boolean;
  /** Generation counter of the item's section when it was created. */
  gen: number;
  updatedAt: string;
}

export type SectionKey =
  'company_brief' | 'schedule' | `questions:${QuestionCategory}` | 'flashcards';

export interface KitMeta {
  items: Record<string, ItemMeta>;
  /** Regeneration counter per section; regenerating bumps it. */
  gens: Partial<Record<SectionKey, number>>;
  /** Brief and schedule are single objects, so their edited state is per section. */
  sections: { company_brief: { origin: ItemOrigin }; schedule: { origin: ItemOrigin } };
  /** Display order of questions per category; reorder changes this, never the content. */
  order: Partial<Record<QuestionCategory, string[]>>;
  /** Monotonic id counters: an id is never reused, even after delete + regenerate. */
  counters: { q: number; f: number };
}

export function allocId(meta: KitMeta, prefix: 'q' | 'f'): string {
  meta.counters[prefix] += 1;
  return `${prefix}${meta.counters[prefix]}`;
}

function maxId(prefix: 'q' | 'f', items: { id: string }[]): number {
  let max = 0;
  for (const { id } of items) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export function initMeta(kit: Kit, now = new Date().toISOString()): KitMeta {
  const items: KitMeta['items'] = {};
  for (const q of kit.questions)
    items[q.id] = { origin: 'generated', pinned: false, gen: 1, updatedAt: now };
  for (const f of kit.flashcards)
    items[f.id] = { origin: 'generated', pinned: false, gen: 1, updatedAt: now };
  const order: KitMeta['order'] = {};
  for (const c of QUESTION_CATEGORIES) {
    const ids = kit.questions.filter((q) => q.category === c).map((q) => q.id);
    if (ids.length) order[c] = ids;
  }
  const gens: KitMeta['gens'] = { company_brief: 1, schedule: 1, flashcards: 1 };
  for (const c of QUESTION_CATEGORIES) gens[`questions:${c}`] = 1;
  return {
    items,
    gens,
    sections: { company_brief: { origin: 'generated' }, schedule: { origin: 'generated' } },
    order,
    counters: { q: maxId('q', kit.questions), f: maxId('f', kit.flashcards) },
  };
}

/** Sort kit.questions by meta.order (category order, then position) so the kit reflects reordering. */
export function orderedQuestions(kit: Kit, meta: KitMeta): Kit['questions'] {
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const out: Kit['questions'] = [];
  const seen = new Set<string>();
  for (const c of QUESTION_CATEGORIES) {
    for (const id of meta.order[c] ?? []) {
      const q = byId.get(id);
      if (q && !seen.has(id)) {
        out.push(q);
        seen.add(id);
      }
    }
  }
  for (const q of kit.questions) if (!seen.has(q.id)) out.push(q); // safety: never lose a question
  return out;
}
