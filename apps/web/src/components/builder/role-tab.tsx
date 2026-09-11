import type { Kit } from '@trao/core';
import { cn } from '@/lib/utils';

export function RoleTab({ kit }: { kit: Kit }) {
  const covered = new Set(kit.questions.flatMap((q) => q.requirement_ids));
  const facts = [
    ['Title', kit.role.title],
    ['Seniority', kit.role.seniority],
    ['Location', kit.source.location],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-8">
      {facts.length > 0 && (
        <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <section>
        <h3 className="mb-3 text-lg font-semibold tracking-tight">
          Requirements{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {kit.role.requirements.length}
          </span>
        </h3>
        {kit.role.requirements.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            The description stated no explicit requirements, so none were invented.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {kit.role.requirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="w-7 font-mono text-xs text-muted-foreground">{r.id}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    r.priority === 'must'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {r.priority}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {r.kind}
                </span>
                <span className="min-w-0 flex-1">{r.text}</span>
                {!covered.has(r.id) && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    no question yet
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {kit.role.responsibilities.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold tracking-tight">Responsibilities</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {kit.role.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
