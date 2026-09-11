'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { GenerationProgress } from '@/components/kits/progress';
import { StatusBadge } from '@/components/kits/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { ErrorState, RequireSession } from '@/lib/session';
import { kitKey, useKit } from '@/lib/use-kit';

export default function KitPage() {
  return (
    <RequireSession>
      <KitView />
    </RequireSession>
  );
}

function KitView() {
  const { id } = useParams<{ id: string }>();
  const q = useKit(id);
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retryKit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: kitKey(id) }),
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" aria-label="Loading kit" />;
  if (q.error)
    return (
      <ErrorState
        message={q.error.message}
        action={<Button onClick={() => q.refetch()}>Try again</Button>}
      />
    );
  const doc = q.data.kit;
  const title = doc.kit?.role.title || 'Prep kit';
  const company = doc.kit?.source.company || doc.input.company_url;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {company} · {doc.input.days} day{doc.input.days === 1 ? '' : 's'}
          </p>
        </div>
        <StatusBadge status={doc.status} />
      </header>
      {doc.status !== 'done' && (
        <GenerationProgress
          state={doc.state}
          status={doc.status}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      )}
      {retry.error && <ErrorState message={retry.error.message} />}
      {doc.status === 'done' && doc.kit && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            How this kit was researched and built
          </summary>
          <div className="mt-3">
            <GenerationProgress state={doc.state} status="done" />
          </div>
        </details>
      )}
      {doc.status === 'done' && doc.kit && (
        <p className="text-sm text-muted-foreground">
          Builder view lands in the next slice: {doc.kit.role.requirements.length} requirements,{' '}
          {doc.kit.questions.length} questions, {doc.kit.flashcards.length} flashcards,{' '}
          {doc.kit.schedule.days.length}-day schedule.
        </p>
      )}
    </div>
  );
}
