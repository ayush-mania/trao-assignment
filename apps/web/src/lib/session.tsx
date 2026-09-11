'use client';
// Session state for the whole app: who is signed in, and a gate that sends visitors to /login.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorBlock } from '@/components/ui/page-state';
import { api, ApiError, type User } from './api';

export function useSession() {
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.me()).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  return { user: q.data ?? null, loading: q.isPending, error: q.error, refetch: q.refetch };
}

export function useSetUser() {
  const qc = useQueryClient();
  return (user: User | null) => qc.setQueryData(['me'], user);
}

/** Wrap a protected page: renders children only with a session, otherwise redirects with ?next=. */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { user, loading, error, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user && !error) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, error, router, pathname]);
  if (error)
    return (
      <ErrorState
        message={(error as Error).message}
        action={
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={() => refetch()}
          >
            Try again
          </button>
        }
      />
    );
  if (loading || !user) return <SessionSkeleton />;
  return <>{children}</>;
}

export function ErrorState({ message, action }: { message: string; action?: React.ReactNode }) {
  return <ErrorBlock message={message} action={action} />;
}

/** Loading state that, after a few seconds, explains the wait: the free API host sleeps when idle. */
function SessionSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Checking your session"
    >
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      {slow && (
        <p className="text-sm text-muted-foreground">
          Waking up the server — it sleeps when idle on free hosting. This can take up to a minute
          the first time.
        </p>
      )}
    </div>
  );
}
