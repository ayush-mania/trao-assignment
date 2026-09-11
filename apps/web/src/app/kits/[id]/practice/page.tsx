'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Confidence, Flashcard, PracticeState } from '@trao/core';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API_URL, ApiError } from '@/lib/api';
import { ErrorState, RequireSession } from '@/lib/session';
import { useKit } from '@/lib/use-kit';

// Mirrors packages/core practice/order.ts (types only cross the boundary; see docs/features/web.md).
function buildPracticeOrder(cards: Flashcard[], state: PracticeState): Flashcard[] {
  return cards
    .map((card, index) => ({ card, index, p: state[card.id] }))
    .sort((a, b) => {
      const ca = a.p?.confidence ?? 0;
      const cb = b.p?.confidence ?? 0;
      if (ca !== cb) return ca - cb;
      const ta = a.p ? Date.parse(a.p.seenAt) : 0;
      const tb = b.p ? Date.parse(b.p.seenAt) : 0;
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    })
    .map((x) => x.card);
}

async function practiceCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP',
      body?.error?.message ?? 'Request failed',
    );
  return body as T;
}

export default function PracticePage() {
  return (
    <RequireSession>
      <Practice />
    </RequireSession>
  );
}

const LABELS: Record<Confidence, string> = { 1: 'Shaky', 2: 'Okay', 3: 'Solid' };

function Practice() {
  const { id } = useParams<{ id: string }>();
  const kitQ = useKit(id);
  const qc = useQueryClient();
  const practiceQ = useQuery({
    queryKey: ['practice', id],
    queryFn: () => practiceCall<{ practice: PracticeState }>(`/kits/${id}/practice`),
  });
  const rate = useMutation({
    mutationFn: (v: { cardId: string; confidence: Confidence }) =>
      practiceCall<{ practice: PracticeState }>(`/kits/${id}/practice/rate`, {
        method: 'POST',
        body: JSON.stringify(v),
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['practice', id] });
      const prev = qc.getQueryData<{ practice: PracticeState }>(['practice', id]);
      qc.setQueryData(['practice', id], {
        practice: {
          ...(prev?.practice ?? {}),
          [v.cardId]: {
            confidence: v.confidence,
            seenAt: new Date().toISOString(),
            reviews: (prev?.practice[v.cardId]?.reviews ?? 0) + 1,
          },
        },
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['practice', id], ctx.prev),
    onSuccess: (data) => qc.setQueryData(['practice', id], data),
  });
  const reset = useMutation({
    mutationFn: () => practiceCall<void>(`/kits/${id}/practice`, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData(['practice', id], { practice: {} }),
  });

  // A session is a fixed order computed when it starts; ratings during it do not reshuffle it.
  const [session, setSession] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const cards = kitQ.data?.kit.kit?.flashcards ?? [];
  const state = useMemo(() => practiceQ.data?.practice ?? {}, [practiceQ.data]);
  const current = session?.[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        !current ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
        (e.target as HTMLElement)?.tagName === 'INPUT'
      )
        return;
      if (e.key === ' ' && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        onRate(Number(e.key) as Confidence);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function start() {
    setSession(buildPracticeOrder(cards, state));
    setIndex(0);
    setRevealed(false);
  }
  function onRate(confidence: Confidence) {
    if (!current) return;
    rate.mutate({ cardId: current.id, confidence });
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (kitQ.isPending || practiceQ.isPending)
    return <Skeleton className="h-64 w-full" aria-label="Loading practice" />;
  if (kitQ.error || practiceQ.error)
    return <ErrorState message={(kitQ.error ?? practiceQ.error)!.message} />;
  if (!kitQ.data.kit.kit)
    return (
      <ErrorState
        message="This kit is not finished yet."
        action={
          <Button nativeButton={false} render={<Link href={`/kits/${id}`} />}>
            Back to the kit
          </Button>
        }
      />
    );

  const covered = cards.filter((c) => state[c.id]).length;
  const shaky = cards.filter((c) => state[c.id]?.confidence === 1).length;
  const finished = session && index >= session.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Practice</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/kits/${id}`} className="underline">
              {kitQ.data.kit.kit.role.title || 'Kit'}
            </Link>{' '}
            · {covered} of {cards.length} covered{shaky > 0 && ` · ${shaky} shaky`}
          </p>
        </div>
        {session && !finished && (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Card {index + 1} of {session.length}
          </span>
        )}
      </header>

      {cards.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This kit has no flashcards yet. Add or regenerate some in the builder.
        </p>
      )}

      {cards.length > 0 && (!session || finished) && (
        <section className="space-y-4 rounded-lg border p-6 text-center">
          {finished ? (
            <>
              <h2 className="text-lg font-medium">Session done</h2>
              <p className="text-sm text-muted-foreground">
                Next session starts with what you were least sure about, then what you have not seen
                for longest.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-medium">
                {covered === 0 ? 'Start your first session' : 'Ready for another round?'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Unseen cards come first, then the ones you rated shaky. Space reveals, 1 / 2 / 3
                rates.
              </p>
            </>
          )}
          <Button onClick={start}>{covered === 0 ? 'Start' : 'Start next session'}</Button>
        </section>
      )}

      {current && !finished && (
        <section aria-live="polite" className="space-y-4 rounded-lg border p-6">
          <p className="text-xs text-muted-foreground">
            {current.id}
            {state[current.id] && ` · last time: ${LABELS[state[current.id]!.confidence]}`}
          </p>
          <p className="text-lg font-medium">{current.front}</p>
          {!revealed ? (
            <Button onClick={() => setRevealed(true)} autoFocus>
              Reveal answer <kbd className="ml-2 rounded border px-1 text-xs">space</kbd>
            </Button>
          ) : (
            <>
              <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">{current.back}</p>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-2 text-sm">How confident did you feel?</legend>
                {([1, 2, 3] as Confidence[]).map((c) => (
                  <Button
                    key={c}
                    variant={c === 1 ? 'destructive' : c === 3 ? 'default' : 'secondary'}
                    onClick={() => onRate(c)}
                    autoFocus={c === 2}
                  >
                    {LABELS[c]} <kbd className="ml-2 rounded border px-1 text-xs">{c}</kbd>
                  </Button>
                ))}
              </fieldset>
            </>
          )}
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Coverage</h2>
            {covered > 0 && (
              <Button size="xs" variant="ghost" onClick={() => reset.mutate()}>
                Reset progress
              </Button>
            )}
          </div>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{c.front}</span>
                <span
                  className={`shrink-0 text-xs ${!state[c.id] ? 'text-muted-foreground' : state[c.id]!.confidence === 1 ? 'text-destructive' : ''}`}
                >
                  {state[c.id]
                    ? `${LABELS[state[c.id]!.confidence]} · ${state[c.id]!.reviews}×`
                    : 'not covered'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
