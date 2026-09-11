'use client';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Kit, KitMeta, Question, QuestionCategory } from '@trao/core';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';
import { CATEGORIES, CATEGORY_LABEL, QuestionCard } from './question-card';
import { RegenerateButton } from './regenerate-button';

export function QuestionsTab({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  const m = useBuilderMutation(id);
  useEffect(() => {
    if (m.error) {
      toast.error(m.error);
      m.clearError();
    }
  }, [m.error, m.clearError, m]);
  const [regenerating, setRegenerating] = useState<QuestionCategory | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byCategory = (c: QuestionCategory): Question[] => {
    const order = meta.order[c] ?? [];
    const inCat = kit.questions.filter((q) => q.category === c);
    return [...inCat].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  };

  function onDragEnd(c: QuestionCategory) {
    return (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = byCategory(c).map((q) => q.id);
      const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
      m.mutate({
        run: () => builderApi.reorder(id, c, next),
        optimistic: (doc) => ({
          ...doc,
          meta: { ...doc.meta, order: { ...doc.meta.order, [c]: next } },
        }),
      });
    };
  }

  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  return (
    <div className="space-y-10">
      {uncovered.size > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium">Not yet covered by any question</p>
          <p className="mt-1 text-muted-foreground">
            {[...uncovered].map((r) => (
              <span
                key={r}
                className="mr-1.5 inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
                title={kit.role.requirements.find((x) => x.id === r)?.text}
              >
                {r}
              </span>
            ))}
            — add a question for them or regenerate a category.
          </p>
        </div>
      )}
      {CATEGORIES.map((c) => {
        const qs = byCategory(c);
        return (
          <section key={c} aria-labelledby={`cat-${c}`} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 id={`cat-${c}`} className="text-lg font-semibold tracking-tight">
                {CATEGORY_LABEL[c]}{' '}
                <span className="text-sm font-normal text-muted-foreground">{qs.length}</span>
              </h3>
              {c === 'company-fit' && kit.company_brief.sources.length === 0 && qs.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Nothing was found about this company, so company-fit questions would be invented —
                  write your own below.
                </span>
              ) : (
                <RegenerateButton
                  label={`Regenerate ${c}`}
                  itemIds={qs.map((q) => q.id)}
                  meta={meta}
                  pending={regenerating === c}
                  onClick={() => {
                    setRegenerating(c);
                    m.mutateAsync({
                      run: () => builderApi.regenerate(id, `questions:${c}`),
                    }).finally(() => setRegenerating(null));
                  }}
                />
              )}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd(c)}
            >
              <SortableContext items={qs.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-3" aria-busy={regenerating === c}>
                  {qs.map((q) => (
                    <QuestionCard
                      key={q.id}
                      q={q}
                      meta={meta.items[q.id]}
                      requirements={kit.role.requirements}
                      onEdit={(patch) =>
                        m.mutate({
                          run: () => builderApi.editQuestion(id, q.id, patch),
                          optimistic: (doc) => ({
                            ...doc,
                            kit: doc.kit && {
                              ...doc.kit,
                              questions: doc.kit.questions.map((x) =>
                                x.id === q.id ? { ...x, ...patch } : x,
                              ),
                            },
                            meta: {
                              ...doc.meta,
                              items: {
                                ...doc.meta.items,
                                [q.id]: {
                                  ...(doc.meta.items[q.id] ?? {
                                    pinned: false,
                                    gen: 1,
                                    updatedAt: '',
                                  }),
                                  origin:
                                    doc.meta.items[q.id]?.origin === 'manual' ? 'manual' : 'edited',
                                },
                              },
                            },
                          }),
                        })
                      }
                      onPin={(pinned) =>
                        m.mutate({
                          run: () => builderApi.pin(id, q.id, pinned),
                          optimistic: (doc) => ({
                            ...doc,
                            meta: {
                              ...doc.meta,
                              items: {
                                ...doc.meta.items,
                                [q.id]: {
                                  ...(doc.meta.items[q.id] ?? {
                                    origin: 'generated',
                                    gen: 1,
                                    updatedAt: '',
                                  }),
                                  pinned,
                                },
                              },
                            },
                          }),
                        })
                      }
                      onDelete={() =>
                        m.mutate({
                          run: () => builderApi.deleteItem(id, q.id),
                          optimistic: (doc) => ({
                            ...doc,
                            kit: doc.kit && {
                              ...doc.kit,
                              questions: doc.kit.questions.filter((x) => x.id !== q.id),
                            },
                          }),
                        })
                      }
                      onMove={(to) =>
                        m.mutate({
                          run: () => builderApi.move(id, q.id, to),
                          optimistic: (doc) => ({
                            ...doc,
                            kit: doc.kit && {
                              ...doc.kit,
                              questions: doc.kit.questions.map((x) =>
                                x.id === q.id ? { ...x, category: to } : x,
                              ),
                            },
                          }),
                        })
                      }
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {qs.length === 0 && (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No {CATEGORY_LABEL[c].toLowerCase()} questions yet.
              </p>
            )}
            <AddQuestion
              category={c}
              requirements={kit.role.requirements}
              onAdd={(q) => m.mutate({ run: () => builderApi.addQuestion(id, q) })}
            />
          </section>
        );
      })}
    </div>
  );
}

function AddQuestion({
  category,
  requirements,
  onAdd,
}: {
  category: QuestionCategory;
  requirements: Kit['role']['requirements'];
  onAdd: (q: { category: QuestionCategory; prompt: string; requirement_ids: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> Add a question
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const prompt = String(f.get('prompt') ?? '').trim();
        if (!prompt) return;
        onAdd({ category, prompt, requirement_ids: f.getAll('req').map(String) });
        setOpen(false);
      }}
    >
      <label className="flex-1 space-y-1 text-xs">
        Question
        <Input name="prompt" required autoFocus placeholder="Write your own question" />
      </label>
      <fieldset className="text-xs">
        <legend>Covers</legend>
        <div className="flex flex-wrap gap-2">
          {requirements.map((r) => (
            <label key={r.id} className="flex items-center gap-1" title={r.text}>
              <input type="checkbox" name="req" value={r.id} /> {r.id}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="sm">
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
