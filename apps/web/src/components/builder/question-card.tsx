'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemMeta, Question, QuestionCategory, Requirement } from '@trao/core';
import { Button } from '@/components/ui/button';
import { EditableText } from './editable-text';
import { OriginBadge } from './origin-badge';

export const CATEGORIES: QuestionCategory[] = [
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
];

export function QuestionCard({
  q,
  meta,
  requirements,
  onEdit,
  onPin,
  onDelete,
  onMove,
}: {
  q: Question;
  meta: ItemMeta | undefined;
  requirements: Requirement[];
  onEdit: (patch: Partial<Question>) => void;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
  onMove: (to: QuestionCategory) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const reqText = (id: string) => requirements.find((r) => r.id === id)?.text ?? id;
  return (
    <li ref={setNodeRef} style={style} className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-1 cursor-grab rounded px-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reorder ${q.id}. Press space to pick up, arrow keys to move, space to drop.`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{q.id}</span>
            <span>difficulty {q.difficulty}</span>
            {q.requirement_ids.map((id) => (
              <span key={id} className="rounded bg-muted px-1.5 py-0.5" title={reqText(id)}>
                {id}
              </span>
            ))}
            <OriginBadge meta={meta} />
          </div>
          <EditableText
            label={`Question ${q.id}`}
            value={q.prompt}
            onSave={(prompt) => onEdit({ prompt })}
            rows={2}
            className="font-medium"
          />
          <EditableText
            label={`Answer outline for ${q.id}`}
            value={q.answer_outline}
            onSave={(answer_outline) => onEdit({ answer_outline })}
            rows={2}
            className="text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Difficulty
              <select
                aria-label={`Difficulty for ${q.id}`}
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={q.difficulty}
                onChange={(e) => onEdit({ difficulty: Number(e.target.value) })}
              >
                {[1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Move to
              <select
                aria-label={`Move ${q.id} to category`}
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={q.category}
                onChange={(e) => onMove(e.target.value as QuestionCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="xs"
              variant="ghost"
              aria-pressed={meta?.pinned ?? false}
              onClick={() => onPin(!(meta?.pinned ?? false))}
            >
              {meta?.pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button size="xs" variant="ghost" className="text-destructive" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
