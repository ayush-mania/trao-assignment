'use client';
import { LogOut, Menu, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { useSession, useSetUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';

const PUBLIC = ['/', '/login', '/register'];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const setUser = useSetUser();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const withSidebar = Boolean(user) && !PUBLIC.includes(pathname);

  async function signOut() {
    await api.logout();
    setUser(null);
    router.push('/login');
  }

  const account = user && (
    <div className="flex items-center justify-between gap-2 border-t p-3">
      <span className="truncate text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={signOut}>
        <LogOut className="size-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {withSidebar && (
        <aside
          className="sticky top-0 hidden h-svh w-72 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex 2xl:w-80"
          aria-label="Kits"
        >
          <div className="flex h-14 items-center px-4">
            <Link href="/kits" className="flex items-center gap-2 font-semibold tracking-tight">
              <Sparkles className="size-4 text-primary" /> Prep Kit
            </Link>
          </div>
          <div className="min-h-0 flex-1">
            <Sidebar />
          </div>
          {account}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6',
            withSidebar && 'md:hidden',
          )}
        >
          {withSidebar ? (
            <>
              <Sheet open={open} onOpenChange={setOpen}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Open kit list"
                  onClick={() => setOpen(true)}
                >
                  <Menu className="size-5" />
                </Button>
                <SheetContent side="left" className="w-80 p-0">
                  <SheetTitle className="sr-only">Your kits</SheetTitle>
                  <div className="flex h-full flex-col">
                    <div className="flex h-14 items-center px-4 font-semibold">Prep Kit</div>
                    <div className="min-h-0 flex-1">
                      <Sidebar onNavigate={() => setOpen(false)} />
                    </div>
                    {account}
                  </div>
                </SheetContent>
              </Sheet>
              <Link href="/kits" className="font-semibold tracking-tight md:hidden">
                Prep Kit
              </Link>
            </>
          ) : (
            <Link
              href={user ? '/kits' : '/'}
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <Sparkles className="size-4 text-primary" /> Prep Kit
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!user && pathname !== '/login' && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
            )}
            {!user && pathname !== '/register' && (
              <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
                Get started
              </Button>
            )}
            {user && !withSidebar && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/kits" />}>
                Your kits
              </Button>
            )}
          </div>
        </header>
        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-10 xl:max-w-4xl 2xl:max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
