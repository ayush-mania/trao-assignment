'use client';
import type { Kit } from '@trao/core';
import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';

export function ScheduleTab({ id, kit }: { id: string; kit: Kit }) {
  const m = useBuilderMutation(id);
  useEffect(() => {
    if (m.error) {
      toast.error(m.error);
      m.clearError();
    }
  }, [m.error, m]);
  const [days, setDays] = useState(kit.schedule.days_available);
  const [pending, setPending] = useState(false);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const total = kit.schedule.days.reduce((t, d) => t + d.minutes, 0);
  const n = kit.schedule.days.length;
  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPending(true);
          m.mutateAsync({ run: () => builderApi.regenerate(id, 'schedule', days) }).finally(() =>
            setPending(false),
          );
        }}
      >
        <label className="space-y-1 text-xs text-muted-foreground">
          Days until the interview
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-28 text-foreground"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" className="gap-1.5" disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {pending ? 'Rebuilding…' : 'Rebuild schedule'}
        </Button>
        <p className="basis-full text-xs text-muted-foreground sm:basis-auto sm:ml-auto">
          {n} day{n === 1 ? '' : 's'} · {Math.round(total / 60)}h {total % 60}m total · arithmetic,
          no model involved
        </p>
      </form>
      <ol className="space-y-3" aria-busy={pending}>
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                <span className="mr-2 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  Day {d.day}
                </span>
                {d.focus}
              </h3>
              <span className="text-sm tabular-nums text-muted-foreground">{d.minutes} min</span>
            </div>
            {d.question_ids.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {d.question_ids.map((qid) => (
                  <li key={qid} className="flex gap-2">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                      {qid}
                    </span>
                    <span className="truncate">{byId.get(qid)?.prompt ?? '(deleted)'}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
