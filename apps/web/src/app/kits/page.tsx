'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { StatusBadge } from '@/components/kits/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { ErrorState, RequireSession } from '@/lib/session';

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
    // Keep the list fresh while anything is still generating.
    refetchInterval: (query) =>
      query.state.data?.kits.some((k) => k.status === 'queued' || k.status === 'running')
        ? 3000
        : false,
  });

  if (q.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading kits">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (q.error)
    return (
      <ErrorState
        message={q.error.message}
        action={<Button onClick={() => q.refetch()}>Try again</Button>}
      />
    );

  const kits = q.data.kits;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your kits</h1>
        <Button nativeButton={false} render={<Link href="/kits/new" />}>
          New kit
        </Button>
      </div>
      {kits.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No kits yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Paste a job description and the company&apos;s website to build your first prep kit.
            </p>
            <Button nativeButton={false} render={<Link href="/kits/new" />}>
              Create a kit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kits.map((k) => {
            const title = k.kit?.role?.title || 'Untitled role';
            const company = k.kit?.source?.company || hostOf(k.input.company_url);
            const lastStep = k.state.steps[k.state.steps.length - 1];
            return (
              <li key={k._id}>
                <Link
                  href={`/kits/${k._id}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {company || 'Unknown company'} · {k.input.days} day
                        {k.input.days === 1 ? '' : 's'}
                      </p>
                    </div>
                    <StatusBadge status={k.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {k.status === 'failed' && k.state.error
                      ? k.state.error.message
                      : lastStep
                        ? `${k.state.steps.length}/10 steps · ${lastStep.name.replace(/_/g, ' ')}`
                        : 'Waiting to start'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
