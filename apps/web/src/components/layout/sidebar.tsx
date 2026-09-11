'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, Plus, XCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** The kit list as a persistent rail (ChatGPT-style): status at a glance, one click to any kit. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const q = useQuery({
    queryKey: ['kits'],
    queryFn: () => api.listKits(),
    refetchInterval: (query) =>
      query.state.data?.kits.some((k) => k.status === 'queued' || k.status === 'running')
        ? 3000
        : false,
  });
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          className="w-full justify-start gap-2"
          nativeButton={false}
          render={<Link href="/kits/new" onClick={onNavigate} />}
        >
          <Plus className="size-4" /> New kit
        </Button>
      </div>
      <p className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Your kits
      </p>
      <ScrollArea className="min-h-0 flex-1 px-2">
        {q.isPending ? (
          <div className="space-y-2 p-2" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        ) : q.error ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Could not load kits.</p>
        ) : q.data.kits.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No kits yet. Create your first one.
          </p>
        ) : (
          <ul className="space-y-0.5 pb-3">
            {q.data.kits.map((k) => {
              const active = pathname.startsWith(`/kits/${k._id}`);
              const title = k.kit?.role?.title || 'Untitled role';
              const company = k.kit?.source?.company || '';
              return (
                <li key={k._id}>
                  <Link
                    href={`/kits/${k._id}`}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <StatusIcon status={k.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {company ||
                          (k.status === 'done' ? 'Unknown company' : statusLabel(k.status))}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const base = cn('size-4 shrink-0', className);
  if (status === 'running')
    return <Loader2 className={cn(base, 'animate-spin text-primary')} aria-label="Generating" />;
  if (status === 'done')
    return (
      <CheckCircle2
        className={cn(base, 'text-emerald-600 dark:text-emerald-400')}
        aria-label="Ready"
      />
    );
  if (status === 'failed')
    return <XCircle className={cn(base, 'text-destructive')} aria-label="Failed" />;
  return <Circle className={cn(base, 'text-muted-foreground')} aria-label="Queued" />;
}

export function statusLabel(status: string): string {
  return (
    { queued: 'Queued', running: 'Generating…', done: 'Ready', failed: 'Failed' }[status] ?? status
  );
}
