'use client';
import type { Kit, KitMeta } from '@trao/core';
import { useState } from 'react';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';
import { EditableText } from './editable-text';
import { RegenerateButton } from './regenerate-button';

export function BriefTab({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  const m = useBuilderMutation(id);
  const [pending, setPending] = useState(false);
  const save = (patch: { summary?: string; what_they_do?: string }) =>
    m.mutate({
      run: () => builderApi.editBrief(id, patch),
      optimistic: (doc) => ({
        ...doc,
        kit: doc.kit && { ...doc.kit, company_brief: { ...doc.kit.company_brief, ...patch } },
      }),
    });
  return (
    <div className="space-y-4">
      {m.error && (
        <p role="alert" className="text-sm text-destructive">
          {m.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {meta.sections.company_brief.origin === 'edited'
            ? 'You edited this brief.'
            : 'Generated from the sources below.'}
        </p>
        <RegenerateButton
          label="Regenerate brief"
          itemIds={[]}
          meta={meta}
          sectionEdited={meta.sections.company_brief.origin === 'edited'}
          pending={pending}
          onClick={() => {
            setPending(true);
            m.mutateAsync({ run: () => builderApi.regenerate(id, 'company_brief') }).finally(() =>
              setPending(false),
            );
          }}
        />
      </div>
      <section className="space-y-1">
        <h3 className="text-sm font-medium">Summary</h3>
        <EditableText
          label="Company summary"
          value={kit.company_brief.summary}
          onSave={(summary) => save({ summary })}
          rows={5}
        />
      </section>
      <section className="space-y-1">
        <h3 className="text-sm font-medium">What they do</h3>
        <EditableText
          label="What they do"
          value={kit.company_brief.what_they_do}
          onSave={(what_they_do) => save({ what_they_do })}
          rows={3}
        />
      </section>
      <section>
        <h3 className="text-sm font-medium">Sources</h3>
        {kit.company_brief.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sources — nothing could be retrieved about this company, so nothing was invented.
          </p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {kit.company_brief.sources.map((s) => (
              <li key={s}>
                <a className="underline break-all" href={s} target="_blank" rel="noreferrer">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
