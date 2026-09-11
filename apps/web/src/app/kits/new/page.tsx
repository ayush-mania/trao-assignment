'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-state';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { parseCasesFile, type CaseInput } from '@/lib/parse-cases';
import { RequireSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function NewKitPage() {
  return (
    <RequireSession>
      <NewKit />
    </RequireSession>
  );
}

function NewKit() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [jdLength, setJdLength] = useState(0);
  const [bulk, setBulk] = useState<{ cases: CaseInput[]; problems: string[]; name: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const single = useMutation({
    mutationFn: (input: CaseInput) => api.createKit(input),
    onSuccess: ({ kit, reused }) => {
      void qc.invalidateQueries({ queryKey: ['kits'] });
      if (reused) toast.info('You already have this kit — opening it.');
      router.push(`/kits/${kit._id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? describe(e) : 'Something went wrong'),
  });
  const many = useMutation({
    mutationFn: (cases: CaseInput[]) => api.createKits(cases),
    onSuccess: ({ kits }) => {
      void qc.invalidateQueries({ queryKey: ['kits'] });
      toast.success(`${kits.length} kit${kits.length === 1 ? '' : 's'} started`);
      router.push('/kits');
    },
    onError: (e) => setError(e instanceof ApiError ? describe(e) : 'Something went wrong'),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    single.mutate({
      jd: String(f.get('jd') ?? ''),
      company_url: String(f.get('company_url') ?? ''),
      days: Number(f.get('days')),
    });
  }

  async function readFile(file: File | undefined) {
    if (!file) return setBulk(null);
    setBulk({ ...parseCasesFile(file.name, await file.text()), name: file.name });
  }

  const busy = single.isPending || many.isPending;
  const thin = jdLength > 0 && jdLength < 200;
  return (
    <>
      <PageHeader
        title="New prep kit"
        description="Paste the posting and the company's website. Research and generation take a minute or two."
      />
      <form
        onSubmit={onSubmit}
        className="space-y-6"
        aria-describedby={error ? 'form-error' : undefined}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="jd">Job description</Label>
            <span
              className={cn(
                'text-xs',
                thin ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
              )}
              aria-live="polite"
            >
              {jdLength.toLocaleString()} chars{thin && ' · short posting → thin kit'}
            </span>
          </div>
          <Textarea
            id="jd"
            name="jd"
            required
            rows={12}
            className="min-h-56 resize-y text-[15px] leading-relaxed"
            placeholder="Paste the full posting. We only extract what it actually states — a short posting produces a short kit that says so."
            onChange={(e) => setJdLength(e.target.value.length)}
            maxLength={50_000}
          />
        </div>
        <div className="grid gap-6 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-2">
            <Label htmlFor="company_url">Company website</Label>
            <Input
              id="company_url"
              name="company_url"
              type="url"
              required
              placeholder="https://company.example"
            />
            <p className="text-xs text-muted-foreground">
              We crawl it for what they do and how they hire. Job boards are not needed.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="days">Days until interview</Label>
            <Input
              id="days"
              name="days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={5}
              required
            />
          </div>
        </div>
        {error && (
          <p
            id="form-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" className="gap-2" disabled={busy}>
            {single.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {single.isPending ? 'Starting…' : 'Generate kit'}
          </Button>
          <span className="text-xs text-muted-foreground">
            You can watch each research step as it runs.
          </span>
        </div>
      </form>

      <section className="mt-12 space-y-3">
        <h2 className="font-medium">Preparing for several roles?</h2>
        <p className="text-sm text-muted-foreground">
          Drop a JSON array or CSV with{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">jd</code>,{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">company_url</code> and{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">days</code> per row. Each row
          becomes its own kit.
        </p>
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a cases file"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void readFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragging ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
          )}
        >
          <FileUp className="size-5 text-muted-foreground" />
          <p className="mt-2 text-sm">
            <span className="font-medium">Choose a file</span> or drag it here
          </p>
          <p className="text-xs text-muted-foreground">.json or .csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="sr-only"
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
        </div>
        {bulk && (
          <div className="rounded-xl border p-4 text-sm">
            <p>
              <strong>{bulk.name}</strong> — {bulk.cases.length} valid case
              {bulk.cases.length === 1 ? '' : 's'}
              {bulk.problems.length > 0 && (
                <span className="text-muted-foreground">, {bulk.problems.length} skipped</span>
              )}
            </p>
            {bulk.problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {bulk.problems.slice(0, 5).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {bulk.problems.length > 5 && <li>…and {bulk.problems.length - 5} more</li>}
              </ul>
            )}
            <Button
              className="mt-3 gap-2"
              disabled={busy || bulk.cases.length === 0}
              onClick={() => many.mutate(bulk.cases)}
            >
              {many.isPending && <Loader2 className="size-4 animate-spin" />}
              {many.isPending
                ? 'Starting…'
                : `Generate ${bulk.cases.length} kit${bulk.cases.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

function describe(e: ApiError): string {
  if (e.issues?.length) return e.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
  return e.message;
}
