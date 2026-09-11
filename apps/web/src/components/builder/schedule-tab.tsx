'use client';
import type { Kit } from '@trao/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { builderApi } from '@/lib/builder-api';
import { useBuilderMutation } from '@/lib/use-builder';

export function ScheduleTab({ id, kit }: { id: string; kit: Kit }) {
  const m = useBuilderMutation(id);
  const [days, setDays] = useState(kit.schedule.days_available);
  const [pending, setPending] = useState(false);
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const total = kit.schedule.days.reduce((t, d) => t + d.minutes, 0);
  return (
    <div className="space-y-4">
      {m.error && (
        <p role="alert" className="text-sm text-destructive">
          {m.error}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPending(true);
          m.mutateAsync({ run: () => builderApi.regenerate(id, 'schedule', days) }).finally(() =>
            setPending(false),
          );
        }}
      >
        <label className="space-y-1 text-xs">
          Days until the interview
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-28"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? 'Rebuilding…' : 'Rebuild schedule'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {kit.schedule.days.length} days · {total} minutes total · deterministic, no model involved
        </span>
      </form>
      <ol className="space-y-2">
        {kit.schedule.days.map((d) => (
          <li key={d.day} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                Day {d.day} <span className="font-normal text-muted-foreground">— {d.focus}</span>
              </h3>
              <span className="text-sm text-muted-foreground">{d.minutes} min</span>
            </div>
            {d.question_ids.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {d.question_ids.map((qid) => (
                  <li key={qid} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{qid}</span>
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
