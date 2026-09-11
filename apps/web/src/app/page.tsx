import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Prepare for the interview you actually have.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Paste the job description and the company&apos;s website. We research the company and how
        they hire, extract what the role really asks for, and build a question bank, flashcards and
        a day-by-day plan you can reshape and practise against.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button nativeButton={false} render={<Link href="/register" />}>
          Create an account
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
    </section>
  );
}
