'use client';
import type { Kit, KitMeta } from '@trao/core';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';
import { EditableText } from './editable-text';
import { RegenerateButton } from './regenerate-button';

export function BriefTab({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  const m = useBuilderMutation(id);
  useEffect(() => {
    if (m.error) {
      toast.error(m.error);
      m.clearError();
    }
  }, [m.error, m]);
  const [pending, setPending] = useState(false);
  const save = (patch: { summary?: string; what_they_do?: string }) =>
    m.mutate({
      run: () => builderApi.editBrief(id, patch),
      optimistic: (doc) => ({
        ...doc,
        kit: doc.kit && { ...doc.kit, company_brief: { ...doc.kit.company_brief, ...patch } },
      }),
    });
  const edited = meta.sections.company_brief.origin === 'edited';
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {edited ? 'You edited this brief.' : 'Written from the sources below — nothing else.'}
        </p>
        <RegenerateButton
          label="Regenerate brief"
          itemIds={[]}
          meta={meta}
          sectionEdited={edited}
          pending={pending}
          onClick={() => {
            setPending(true);
            m.mutateAsync({ run: () => builderApi.regenerate(id, 'company_brief') }).finally(() =>
              setPending(false),
            );
          }}
        />
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Summary</h3>
        <EditableText
          label="Company summary"
          value={kit.company_brief.summary}
          onSave={(summary) => save({ summary })}
          rows={5}
          className="-mx-2 text-[15px]"
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">What they do</h3>
        <EditableText
          label="What they do"
          value={kit.company_brief.what_they_do}
          onSave={(what_they_do) => save({ what_they_do })}
          rows={3}
          className="-mx-2 text-[15px]"
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Sources</h3>
        {kit.company_brief.sources.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            No sources. Nothing could be retrieved about this company, so nothing was invented.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {kit.company_brief.sources.map((s) => (
              <li key={s}>
                <a
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="truncate">{s}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
