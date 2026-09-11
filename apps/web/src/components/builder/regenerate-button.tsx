'use client';
import type { KitMeta } from '@trao/core';
import { Loader2, RefreshCw } from 'lucide-react';
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
      ? kept > 0
        ? `Replaces ${replaced} generated · keeps ${kept} you edited, pinned or wrote`
        : `Replaces all ${replaced} generated`
      : sectionEdited
        ? 'You edited this — regenerating overwrites it'
        : undefined;
  const hintId = `${label.replace(/\s+/g, '-')}-hint`;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={onClick}
        disabled={pending}
        aria-describedby={hint ? hintId : undefined}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {pending ? 'Regenerating…' : label}
      </Button>
      {hint && (
        <span id={hintId} className="text-[11px] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}
