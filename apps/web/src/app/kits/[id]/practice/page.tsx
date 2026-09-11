'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Confidence, Flashcard, PracticeState } from '@trao/core';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBlock, PageHeader } from '@/components/ui/page-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { API_URL, ApiError } from '@/lib/api';
import { RequireSession } from '@/lib/session';
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
  // A session is a fixed order computed when it starts; ratings during it do not reshuffle it.
  const [session, setSession] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const reset = useMutation({
    mutationFn: () => practiceCall<void>(`/kits/${id}/practice`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData(['practice', id], { practice: {} });
      setSession(null);
      setIndex(0);
      setRevealed(false);
    },
  });

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
    return (
      <ErrorBlock
        message={(kitQ.error ?? practiceQ.error)!.message}
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/kits" />}>
            Back to your kits
          </Button>
        }
      />
    );
  if (!kitQ.data.kit.kit)
    return (
      <ErrorBlock
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

  const pct =
    session && session.length
      ? Math.round((Math.min(index, session.length) / session.length) * 100)
      : 0;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/kits/${id}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {kitQ.data.kit.kit.role.title || 'Kit'}
          </Link>
        }
        title="Practice"
        description={
          cards.length
            ? `${covered} of ${cards.length} covered${shaky > 0 ? ` · ${shaky} shaky` : ''}`
            : undefined
        }
        actions={
          covered > 0 && !session ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => reset.mutate()}
            >
              <RotateCcw className="size-3.5" /> Reset progress
            </Button>
          ) : undefined
        }
      />

      {cards.length === 0 && (
        <EmptyState
          title="No flashcards yet"
          description="Add or regenerate flashcards in the builder, then come back to practise."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href={`/kits/${id}`} />}>
              Open the builder
            </Button>
          }
        />
      )}

      {cards.length > 0 && (!session || finished) && (
        <EmptyState
          icon={RotateCcw}
          title={
            finished
              ? 'Session done'
              : covered === 0
                ? 'Start your first session'
                : 'Ready for another round?'
          }
          description={
            finished
              ? 'The next session starts with what you were least sure about, then what you have not seen for longest.'
              : 'Unseen cards come first, then the ones you rated shaky. Space reveals, 1 / 2 / 3 rates.'
          }
          action={
            <Button size="lg" onClick={start}>
              {covered === 0 ? 'Start' : 'Start next session'}
            </Button>
          }
        />
      )}

      {current && !finished && (
        <section aria-live="polite" className="space-y-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Card {index + 1} of {session!.length}
              {state[current.id] && ` · last time: ${LABELS[state[current.id]!.confidence]}`}
            </span>
            <span className="font-mono">{current.id}</span>
          </div>
          <Progress value={pct} className="h-1" aria-label={`${pct}% of the session`} />
          <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <p className="text-lg font-medium leading-snug md:text-xl">{current.front}</p>
            {!revealed ? (
              <Button className="mt-8 gap-2" size="lg" onClick={() => setRevealed(true)} autoFocus>
                Reveal answer <Kbd>space</Kbd>
              </Button>
            ) : (
              <>
                <p className="mt-6 whitespace-pre-wrap rounded-xl bg-muted/60 p-4 text-[15px] leading-relaxed">
                  {current.back}
                </p>
                <fieldset className="mt-6">
                  <legend className="mb-3 text-sm text-muted-foreground">
                    How confident did you feel?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {([1, 2, 3] as Confidence[]).map((c) => (
                      <Button
                        key={c}
                        size="lg"
                        variant={c === 1 ? 'destructive' : c === 3 ? 'default' : 'secondary'}
                        className="gap-2"
                        onClick={() => onRate(c)}
                        autoFocus={c === 2}
                      >
                        {LABELS[c]} <Kbd>{c}</Kbd>
                      </Button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Coverage</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate">{c.front}</span>
                <span
                  className={`shrink-0 text-xs ${!state[c.id] ? 'text-muted-foreground' : state[c.id]!.confidence === 1 ? 'text-destructive' : state[c.id]!.confidence === 3 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
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
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}
