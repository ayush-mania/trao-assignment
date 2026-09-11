// Builder endpoints. Every call returns the new { kit, meta } which replaces the cached document.
import type { Kit, KitMeta, QuestionCategory } from '@trao/core';
import { API_URL, ApiError } from './api';

export type BuilderResult = { kit: Kit; meta: KitMeta };
export type RegenerateSection =
  'company_brief' | 'schedule' | 'flashcards' | `questions:${QuestionCategory}`;

async function send(method: string, path: string, body?: unknown): Promise<BuilderResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server');
  }
  const json = (await res.json().catch(() => null)) as
    (BuilderResult & { error?: { code: string; message: string } }) | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'HTTP',
      json?.error?.message ?? `Request failed (${res.status})`,
    );
  return json as BuilderResult;
}

export const builderApi = {
  editQuestion: (id: string, qid: string, patch: Record<string, unknown>) =>
    send('PATCH', `/kits/${id}/questions/${qid}`, patch),
  editFlashcard: (id: string, fid: string, patch: Record<string, unknown>) =>
    send('PATCH', `/kits/${id}/flashcards/${fid}`, patch),
  editBrief: (id: string, patch: { summary?: string; what_they_do?: string }) =>
    send('PATCH', `/kits/${id}/brief`, patch),
  addQuestion: (
    id: string,
    q: {
      category: QuestionCategory;
      prompt: string;
      answer_outline?: string;
      difficulty?: number;
      requirement_ids?: string[];
    },
  ) => send('POST', `/kits/${id}/questions`, q),
  addFlashcard: (id: string, f: { front: string; back?: string; requirement_ids?: string[] }) =>
    send('POST', `/kits/${id}/flashcards`, f),
  deleteItem: (id: string, itemId: string) => send('DELETE', `/kits/${id}/items/${itemId}`),
  reorder: (id: string, category: QuestionCategory, ids: string[]) =>
    send('PUT', `/kits/${id}/order`, { category, ids }),
  move: (id: string, qid: string, to: QuestionCategory, index?: number) =>
    send('POST', `/kits/${id}/questions/${qid}/move`, { to, index }),
  pin: (id: string, itemId: string, pinned: boolean) =>
    send('POST', `/kits/${id}/items/${itemId}/pin`, { pinned }),
  regenerate: (id: string, section: RegenerateSection, days?: number) =>
    send('POST', `/kits/${id}/regenerate`, { section, days }),
};
