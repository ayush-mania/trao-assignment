'use client';
// Session state for the whole app: who is signed in, and a gate that sends visitors to /login.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
  if (loading || !user)
    return <p className="p-8 text-sm text-muted-foreground">Checking your session…</p>;
  return <>{children}</>;
}

export function ErrorState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="m-8 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
