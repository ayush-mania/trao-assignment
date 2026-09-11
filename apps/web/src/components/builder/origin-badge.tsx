import type { ItemMeta } from '@trao/core';
import { Badge } from '@/components/ui/badge';

/** Shows what a regeneration will and will not touch: edited, manual and pinned items survive. */
export function OriginBadge({ meta }: { meta: ItemMeta | undefined }) {
  if (!meta) return null;
  return (
    <span className="flex gap-1">
      {meta.pinned && <Badge variant="secondary">pinned</Badge>}
      {meta.origin === 'edited' && <Badge variant="outline">edited</Badge>}
      {meta.origin === 'manual' && <Badge variant="outline">yours</Badge>}
    </span>
  );
}
