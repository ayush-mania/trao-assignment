'use client';
import type { KitMeta } from '@trao/core';
import { Button } from '@/components/ui/button';

/** Says what it will keep before it runs, so a regeneration is never a surprise. */
export function RegenerateButton({
  label,
  itemIds,
  meta,
  onClick,
  pending,
  sectionEdited,
}: {
  label: string;
  itemIds: string[];
  meta: KitMeta;
  onClick: () => void;
  pending: boolean;
  sectionEdited?: boolean;
}) {
  const kept = itemIds.filter((id) => {
    const m = meta.items[id];
    return m && (m.origin !== 'generated' || m.pinned);
  }).length;
  const replaced = itemIds.length - kept;
  const hint =
    itemIds.length > 0
      ? `replaces ${replaced} generated, keeps ${kept} edited/pinned/yours`
      : sectionEdited
        ? 'you edited this; regenerating overwrites it'
        : undefined;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        aria-describedby={hint ? `${label}-hint` : undefined}
      >
        {pending ? 'Regenerating…' : label}
      </Button>
      {hint && (
        <span id={`${label}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}
