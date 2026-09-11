'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { KitBuilder } from '@/components/builder/kit-builder';
import { GenerationProgress } from '@/components/kits/progress';
import { Button } from '@/components/ui/button';
import { ErrorBlock, PageHeader } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { RequireSession } from '@/lib/session';
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

  if (q.isPending)
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading kit">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  if (q.error)
    return (
      <ErrorBlock
        message={q.error.message}
        action={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/kits" />}>
              Back to your kits
            </Button>
            {!(q.error instanceof ApiError && q.error.status === 404) && (
              <Button onClick={() => q.refetch()}>Try again</Button>
            )}
          </>
        }
      />
    );

  const doc = q.data.kit;
  const done = doc.status === 'done' && doc.kit;
  const title =
    doc.kit?.role.title || (doc.status === 'done' ? 'Untitled role' : 'Preparing your kit');
  const company =
    doc.kit?.source.company ||
    (doc.status === 'done' ? 'Unknown company' : hostOf(doc.input.company_url));

  return (
    <>
      <PageHeader
        eyebrow={company}
        title={title}
        description={`${doc.input.days} day${doc.input.days === 1 ? '' : 's'} until the interview${done ? ` · ${doc.kit!.role.requirements.length} requirements · ${doc.kit!.questions.length} questions` : ''}`}
        actions={
          done ? (
            <Button
              className="gap-2"
              nativeButton={false}
              render={<Link href={`/kits/${id}/practice`} />}
            >
              <GraduationCap className="size-4" /> Practise
            </Button>
          ) : undefined
        }
      />
      {!done && (
        <GenerationProgress
          state={doc.state}
          status={doc.status}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      )}
      {retry.error && (
        <div className="mt-4">
          <ErrorBlock message={retry.error.message} />
        </div>
      )}
      {done && (
        <>
          <details className="group mb-8 rounded-xl border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              How this kit was researched and built
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-2">
              <GenerationProgress state={doc.state} status="done" compact />
            </div>
          </details>
          <KitBuilder id={id} kit={doc.kit!} meta={doc.meta} />
        </>
      )}
    </>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
