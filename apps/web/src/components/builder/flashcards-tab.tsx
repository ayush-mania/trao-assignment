'use client';
import type { Kit, KitMeta } from '@trao/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';
import { EditableText } from './editable-text';
import { OriginBadge } from './origin-badge';
import { RegenerateButton } from './regenerate-button';

export function FlashcardsTab({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  const m = useBuilderMutation(id);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      {m.error && (
        <p role="alert" className="text-sm text-destructive">
          {m.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{kit.flashcards.length} cards</p>
        <RegenerateButton
          label="Regenerate flashcards"
          itemIds={kit.flashcards.map((f) => f.id)}
          meta={meta}
          pending={pending}
          onClick={() => {
            setPending(true);
            m.mutateAsync({ run: () => builderApi.regenerate(id, 'flashcards') }).finally(() =>
              setPending(false),
            );
          }}
        />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {kit.flashcards.map((f) => (
          <li key={f.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{f.id}</span>
              {f.requirement_ids.map((r) => (
                <span key={r} className="rounded bg-muted px-1.5 py-0.5">
                  {r}
                </span>
              ))}
              <OriginBadge meta={meta.items[f.id]} />
            </div>
            <EditableText
              label={`Front of ${f.id}`}
              value={f.front}
              onSave={(front) =>
                m.mutate({ run: () => builderApi.editFlashcard(id, f.id, { front }) })
              }
              rows={2}
              className="font-medium"
            />
            <EditableText
              label={`Back of ${f.id}`}
              value={f.back}
              onSave={(back) =>
                m.mutate({ run: () => builderApi.editFlashcard(id, f.id, { back }) })
              }
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="ghost"
                aria-pressed={meta.items[f.id]?.pinned ?? false}
                onClick={() =>
                  m.mutate({
                    run: () => builderApi.pin(id, f.id, !(meta.items[f.id]?.pinned ?? false)),
                  })
                }
              >
                {meta.items[f.id]?.pinned ? 'Unpin' : 'Pin'}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-destructive"
                onClick={() =>
                  m.mutate({
                    run: () => builderApi.deleteItem(id, f.id),
                    optimistic: (doc) => ({
                      ...doc,
                      kit: doc.kit && {
                        ...doc.kit,
                        flashcards: doc.kit.flashcards.filter((x) => x.id !== f.id),
                      },
                    }),
                  })
                }
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.mutate({
              run: () =>
                builderApi.addFlashcard(id, {
                  front: String(f.get('front')),
                  back: String(f.get('back') ?? ''),
                }),
            });
            setAdding(false);
          }}
        >
          <label className="flex-1 space-y-1 text-xs">
            Front
            <Input name="front" required autoFocus />
          </label>
          <label className="flex-1 space-y-1 text-xs">
            Back
            <Input name="back" />
          </label>
          <Button type="submit" size="sm">
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          + Add a flashcard
        </Button>
      )}
    </div>
  );
}
