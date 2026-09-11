'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useSetUser } from '@/lib/session';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') ?? '/kits';

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

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-10 w-full max-w-sm space-y-4"
      aria-describedby={error ? 'auth-error' : undefined}
    >
      <h1 className="text-2xl font-semibold">
        {mode === 'login' ? 'Sign in' : 'Create your account'}
      </h1>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />
        {mode === 'register' && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>
      {error && (
        <p id="auth-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <a className="underline" href="/register">
              Create one
            </a>
          </>
        ) : (
          <>
            Already registered?{' '}
            <a className="underline" href="/login">
              Sign in
            </a>
          </>
        )}
      </p>
    </form>
  );
}
