'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ItemMeta, Question, QuestionCategory, Requirement } from '@trao/core';
import { GripVertical, Pin, PinOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditableText } from './editable-text';
import { OriginBadge } from './origin-badge';

export const CATEGORIES: QuestionCategory[] = [
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
];
export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

const selectCls =
  'h-7 rounded-md border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40';

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
  const style = { transform: CSS.Transform.toString(transform), transition };
  const reqText = (id: string) => requirements.find((r) => r.id === id)?.text ?? id;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-xl border bg-card transition-shadow',
        isDragging ? 'z-10 opacity-80 shadow-lg' : 'hover:shadow-sm',
      )}
    >
      <div className="flex gap-2 p-3 pl-1.5 md:p-4 md:pl-2">
        <button
          type="button"
          className="mt-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={`Reorder ${q.id}. Press space to pick up, arrow keys to move, space to drop.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{q.id}</span>
            <span aria-hidden>·</span>
            <span>difficulty {q.difficulty}</span>
            {q.requirement_ids.map((id) => (
              <span
                key={id}
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono"
                title={reqText(id)}
              >
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
            className="mt-1 text-[15px] font-medium"
          />
          <EditableText
            label={`Answer outline for ${q.id}`}
            value={q.answer_outline}
            onSave={(answer_outline) => onEdit({ answer_outline })}
            rows={2}
            placeholder="Answer outline — what a strong answer covers"
            className="text-sm text-muted-foreground focus:text-foreground"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 px-2 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Difficulty
              <select
                aria-label={`Difficulty for ${q.id}`}
                className={selectCls}
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
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Category
              <select
                aria-label={`Move ${q.id} to category`}
                className={selectCls}
                value={q.category}
                onChange={(e) => onMove(e.target.value as QuestionCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex-1" />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={meta?.pinned ? `Unpin ${q.id}` : `Pin ${q.id}`}
              aria-pressed={meta?.pinned ?? false}
              onClick={() => onPin(!(meta?.pinned ?? false))}
            >
              {meta?.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${q.id}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
