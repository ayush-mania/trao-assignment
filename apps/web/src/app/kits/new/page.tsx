'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { parseCasesFile, type CaseInput } from '@/lib/parse-cases';
import { RequireSession } from '@/lib/session';

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
  const [bulk, setBulk] = useState<{ cases: CaseInput[]; problems: string[]; name: string } | null>(
    null,
  );

  const single = useMutation({
    mutationFn: (input: CaseInput) => api.createKit(input),
    onSuccess: ({ kit }) => {
      void qc.invalidateQueries({ queryKey: ['kits'] });
      router.push(`/kits/${kit._id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? describe(e) : 'Something went wrong'),
  });
  const many = useMutation({
    mutationFn: (cases: CaseInput[]) => api.createKits(cases),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kits'] });
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setBulk(null);
    setBulk({ ...parseCasesFile(file.name, await file.text()), name: file.name });
  }

  const busy = single.isPending || many.isPending;
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <form
        onSubmit={onSubmit}
        className="space-y-5"
        aria-describedby={error ? 'form-error' : undefined}
      >
        <h1 className="text-2xl font-semibold">New prep kit</h1>
        <div className="space-y-1.5">
          <Label htmlFor="jd">Job description</Label>
          <Textarea
            id="jd"
            name="jd"
            required
            minLength={1}
            rows={12}
            placeholder="Paste the full posting here. Short postings produce short kits — we never invent requirements."
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <div className="space-y-1.5">
            <Label htmlFor="company_url">Company website</Label>
            <Input
              id="company_url"
              name="company_url"
              type="url"
              required
              placeholder="https://company.example"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="days">Days until interview</Label>
            <Input
              id="days"
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={5}
              required
            />
          </div>
        </div>
        {error && (
          <p id="form-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {single.isPending ? 'Starting…' : 'Generate kit'}
        </Button>
      </form>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Preparing for several roles?</h2>
        <p className="text-sm text-muted-foreground">
          Upload a JSON array or CSV with <code>jd</code>, <code>company_url</code> and{' '}
          <code>days</code> per row. Each row becomes its own kit.
        </p>
        <Input
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={onFile}
          aria-label="Cases file"
        />
        {bulk && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{bulk.name}</strong>: {bulk.cases.length} valid case
              {bulk.cases.length === 1 ? '' : 's'}
              {bulk.problems.length > 0 && `, ${bulk.problems.length} skipped`}
            </p>
            {bulk.problems.length > 0 && (
              <ul className="list-disc pl-5 text-muted-foreground">
                {bulk.problems.slice(0, 5).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              disabled={busy || bulk.cases.length === 0}
              onClick={() => many.mutate(bulk.cases)}
            >
              {many.isPending
                ? 'Starting…'
                : `Generate ${bulk.cases.length} kit${bulk.cases.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function describe(e: ApiError): string {
  if (e.issues?.length) return e.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
  return e.message;
}
