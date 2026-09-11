'use client';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useSession, useSetUser } from '@/lib/session';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  return (
    <Suspense>
      <Inner mode={mode} />
    </Suspense>
  );
}

function Inner({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useSetUser();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') ?? '/kits';
  useEffect(() => {
    if (user) router.replace('/kits');
  }, [user, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    try {
      const { user } =
        mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      setUser(user);
      router.replace(next.startsWith('/') ? next : '/kits');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <div className="mx-auto max-w-sm py-8 md:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isLogin ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isLogin ? 'Sign in to get back to your kits.' : 'Your kits are private to your account.'}
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-5"
        aria-describedby={error ? 'auth-error' : undefined}
        noValidate={false}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
          />
          {!isLogin && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>
        {error && (
          <p
            id="auth-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isLogin ? 'No account? ' : 'Already registered? '}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={isLogin ? '/register' : '/login'}
        >
          {isLogin ? 'Create one' : 'Sign in'}
        </Link>
      </p>
    </div>
  );
}
