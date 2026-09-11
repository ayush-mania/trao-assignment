'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { StatusIcon, statusLabel } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBlock, PageHeader } from '@/components/ui/page-state';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { RequireSession } from '@/lib/session';

export default function KitsPage() {
  return (
    <RequireSession>
      <KitList />
    </RequireSession>
  );
}

function KitList() {
  const q = useQuery({
    queryKey: ['kits'],
    queryFn: () => api.listKits(),
    refetchInterval: (query) =>
      query.state.data?.kits.some((k) => k.status === 'queued' || k.status === 'running')
        ? 3000
        : false,
  });

  return (
    <>
      <PageHeader
        title="Your kits"
        description="One kit per role. Open a kit to reshape it or practise."
        actions={
          <Button className="gap-2" nativeButton={false} render={<Link href="/kits/new" />}>
            <Plus className="size-4" /> New kit
          </Button>
        }
      />
      {q.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading kits">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorBlock
          message={q.error.message}
          action={<Button onClick={() => q.refetch()}>Try again</Button>}
        />
      ) : q.data.kits.length === 0 ? (
        <EmptyState
          title="No kits yet"
          description="Paste a job description and the company's website. We research the company and build your first kit in a minute or two."
          action={
            <Button className="gap-2" nativeButton={false} render={<Link href="/kits/new" />}>
              <Plus className="size-4" /> Create your first kit
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {q.data.kits.map((k) => {
            const title = k.kit?.role?.title || 'Untitled role';
            const company = k.kit?.source?.company || 'Unknown company';
            const last = k.state.steps[k.state.steps.length - 1];
            const sub =
              k.status === 'failed' && k.state.error
                ? k.state.error.message
                : k.status === 'done'
                  ? `${company} · ${k.input.days} day${k.input.days === 1 ? '' : 's'}`
                  : last
                    ? `${statusLabel(k.status)} · step ${k.state.steps.length} of 10`
                    : 'Waiting to start';
            return (
              <li key={k._id}>
                <Link
                  href={`/kits/${k._id}`}
                  className="group flex items-center gap-4 px-4 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <StatusIcon status={k.status} className="size-5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span
                      className={`block truncate text-sm ${k.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {sub}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
