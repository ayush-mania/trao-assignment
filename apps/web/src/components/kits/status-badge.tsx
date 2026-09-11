import { Badge } from '@/components/ui/badge';

const LABEL: Record<
  string,
  { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  queued: { text: 'Queued', variant: 'outline' },
  running: { text: 'Generating', variant: 'secondary' },
  done: { text: 'Ready', variant: 'default' },
  failed: { text: 'Failed', variant: 'destructive' },
};

export function StatusBadge({ status }: { status: string }) {
  const l = LABEL[status] ?? { text: status, variant: 'outline' as const };
  return <Badge variant={l.variant}>{l.text}</Badge>;
}
