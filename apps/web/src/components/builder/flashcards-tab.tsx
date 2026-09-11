'use client';
import type { Kit, KitMeta } from '@trao/core';
import { Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';
import { EditableText } from './editable-text';
import { OriginBadge } from './origin-badge';
import { RegenerateButton } from './regenerate-button';

export function FlashcardsTab({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  const m = useBuilderMutation(id);
  useEffect(() => {
    if (m.error) {
      toast.error(m.error);
      m.clearError();
    }
  }, [m.error, m]);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {kit.flashcards.length} card{kit.flashcards.length === 1 ? '' : 's'}. Click any side to
          edit.
        </p>
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
      {kit.flashcards.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No flashcards yet. Add one or regenerate.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2" aria-busy={pending}>
        {kit.flashcards.map((f) => (
          <li
            key={f.id}
            className="group flex flex-col rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{f.id}</span>
              {f.requirement_ids.map((r) => (
                <span key={r} className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
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
              className="mt-1 font-medium"
            />
            <EditableText
              label={`Back of ${f.id}`}
              value={f.back}
              onSave={(back) =>
                m.mutate({ run: () => builderApi.editFlashcard(id, f.id, { back }) })
              }
              rows={3}
              placeholder="Back — the answer in a sentence or two"
              className="text-sm text-muted-foreground focus:text-foreground"
            />
            <div className="mt-auto flex justify-end gap-1 pt-2 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={meta.items[f.id]?.pinned ? `Unpin ${f.id}` : `Pin ${f.id}`}
                aria-pressed={meta.items[f.id]?.pinned ?? false}
                onClick={() =>
                  m.mutate({
                    run: () => builderApi.pin(id, f.id, !(meta.items[f.id]?.pinned ?? false)),
                  })
                }
              >
                {meta.items[f.id]?.pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${f.id}`}
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
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4"
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
          <label className="min-w-40 flex-1 space-y-1 text-xs">
            Front
            <Input name="front" required autoFocus />
          </label>
          <label className="min-w-40 flex-1 space-y-1 text-xs">
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
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> Add a flashcard
        </Button>
      )}
    </div>
  );
}
