import type { Kit } from '@trao/core';
import { Badge } from '@/components/ui/badge';

export function RoleTab({ kit }: { kit: Kit }) {
  const covered = new Set(kit.questions.flatMap((q) => q.requirement_ids));
  return (
    <div className="space-y-6">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Title</dt>
          <dd>{kit.role.title || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Seniority</dt>
          <dd>{kit.role.seniority || '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location</dt>
          <dd>{kit.source.location || '—'}</dd>
        </div>
      </dl>
      <section>
        <h3 className="mb-2 font-medium">Requirements ({kit.role.requirements.length})</h3>
        {kit.role.requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The description stated no explicit requirements, so none were invented.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {kit.role.requirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                <Badge variant={r.priority === 'must' ? 'default' : 'outline'}>{r.priority}</Badge>
                <Badge variant="secondary">{r.kind}</Badge>
                <span>{r.text}</span>
                {!covered.has(r.id) && (
                  <span className="text-xs text-destructive">no question yet</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {kit.role.responsibilities.length > 0 && (
        <section>
          <h3 className="mb-2 font-medium">Responsibilities</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {kit.role.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
