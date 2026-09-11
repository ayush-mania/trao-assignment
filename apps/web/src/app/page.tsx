import { ArrowRight, BookOpenCheck, ListChecks, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: Search,
    title: 'We research',
    text: 'The company site is crawled for what they do and how they hire; public interview discussion is searched.',
  },
  {
    icon: ListChecks,
    title: 'You get a kit',
    text: 'Requirements the posting actually states, questions per category, flashcards and a day-by-day plan.',
  },
  {
    icon: BookOpenCheck,
    title: 'You reshape and practise',
    text: 'Edit, reorder, regenerate one section without losing your edits, then drill the cards.',
  },
];

export default function Home() {
  return (
    <section className="py-10 md:py-20">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Interview preparation
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
        Prepare for the interview you actually have.
      </h1>
      <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
        Paste the job description and the company&apos;s website. Nothing is invented: a thin
        posting gives you a thin kit that says so.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" className="gap-2" nativeButton={false} render={<Link href="/register" />}>
          Create an account <ArrowRight className="size-4" />
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
      <ol className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.title} className="rounded-xl border p-5">
            <s.icon className="size-5 text-primary" />
            <h2 className="mt-3 font-medium">{s.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
