'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useSession, useSetUser } from '@/lib/session';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const setUser = useSetUser();
  const router = useRouter();
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <header className="border-b">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3"
        >
          <Link href={user ? '/kits' : '/'} className="font-semibold tracking-tight">
            Prep Kit
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link href="/kits/new" className="text-sm underline-offset-4 hover:underline">
                  New kit
                </Link>
                <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await api.logout();
                    setUser(null);
                    router.push('/login');
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm underline-offset-4 hover:underline">
                  Sign in
                </Link>
                <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
                  Create account
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
