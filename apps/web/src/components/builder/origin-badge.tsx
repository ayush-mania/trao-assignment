import type { ItemMeta } from '@trao/core';
import { Pin } from 'lucide-react';

/** Shows what a regeneration will and will not touch: edited, manual and pinned items survive. */
export function OriginBadge({ meta }: { meta: ItemMeta | undefined }) {
  if (!meta) return null;
  const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';
  return (
    <>
      {meta.pinned && (
        <span className={`${pill} bg-primary/10 text-primary`}>
          <Pin className="size-3" /> pinned
        </span>
      )}
      {meta.origin === 'edited' && (
        <span className={`${pill} bg-amber-500/10 text-amber-700 dark:text-amber-400`}>edited</span>
      )}
      {meta.origin === 'manual' && (
        <span className={`${pill} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`}>
          yours
        </span>
      )}
    </>
  );
}
