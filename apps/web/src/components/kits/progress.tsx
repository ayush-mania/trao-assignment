'use client';
import type { RunState, StepName } from '@trao/core';
import { Check, Circle, Loader2, Minus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Mirrors packages/core STEPS. Kept local because the web bundle must not import core's runtime.
export const STEPS: StepName[] = [
  'validate_input',
  'extract_requirements',
  'crawl_company',
  'search_discussion',
  'company_brief',
  'generate_questions',
  'close_coverage',
  'flashcards',
  'build_schedule',
  'assemble_and_validate',
];

const LABELS: Record<StepName, string> = {
  validate_input: 'Check the input',
  extract_requirements: 'Extract requirements from the description',
  crawl_company: 'Crawl the company site',
  search_discussion: 'Look for public interview discussion',
  company_brief: 'Write the company brief',
  generate_questions: 'Generate questions per category',
  close_coverage: 'Check every requirement has a question',
  flashcards: 'Make flashcards',
  build_schedule: 'Allocate the study schedule',
  assemble_and_validate: 'Assemble and validate the kit',
};

export function GenerationProgress({
  state,
  status,
  onRetry,
  retrying,
  compact = false,
}: {
  state: RunState;
  status: 'queued' | 'running' | 'done' | 'failed';
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  const records = new Map(state.steps.map((s) => [s.name, s]));
  const current = STEPS[state.step];
  const pct = Math.round((state.steps.length / STEPS.length) * 100);
  const live = status === 'queued' || status === 'running';

  return (
    <section
      aria-live="polite"
      aria-busy={live}
      className={cn('rounded-xl border', compact ? 'p-4' : 'p-5 md:p-6')}
    >
      {!compact && (
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-medium">
              {live && <Loader2 className="size-4 animate-spin text-primary" />}
              {status === 'queued' && 'Waiting to start'}
              {status === 'running' && 'Building your kit'}
              {status === 'done' && 'Kit ready'}
              {status === 'failed' && 'Generation stopped'}
            </h2>
            <span className="text-sm tabular-nums text-muted-foreground">
              {state.steps.length}/{STEPS.length}
            </span>
          </div>
          <Progress value={pct} className="mt-3 h-1.5" aria-label={`${pct}% complete`} />
          {live && (
            <p className="mt-2 text-xs text-muted-foreground">
              Usually one to two minutes. You can leave and come back — progress is saved after
              every step.
            </p>
          )}
        </div>
      )}
      <ol className="space-y-1">
        {STEPS.map((name) => {
          const rec = records.get(name);
          const isCurrent = status === 'running' && name === current && !rec;
          const pending = !rec && !isCurrent;
          return (
            <li
              key={name}
              className={cn('flex gap-3 rounded-lg px-2 py-1.5', isCurrent && 'bg-accent/60')}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {rec?.status === 'ok' && (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                )}
                {rec?.status === 'skipped' && <Minus className="size-4 text-muted-foreground" />}
                {rec?.status === 'failed' && <X className="size-4 text-destructive" />}
                {isCurrent && <Loader2 className="size-4 animate-spin text-primary" />}
                {pending && <Circle className="size-3 text-muted-foreground/50" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm',
                    pending && 'text-muted-foreground',
                    rec?.status === 'failed' && 'text-destructive',
                  )}
                >
                  {LABELS[name]}
                  {rec?.status === 'skipped' && (
                    <span className="ml-2 text-xs text-muted-foreground">skipped</span>
                  )}
                  {rec && rec.status !== 'failed' && rec.ms >= 1000 && (
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                      {(rec.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </p>
                {rec && rec.notes.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5">
                    {rec.notes.map((n, i) => (
                      <li key={i} className="truncate text-xs text-muted-foreground" title={n}>
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {status === 'failed' && state.error && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-medium">{state.error.code.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-muted-foreground">{state.error.message}</p>
          {onRetry && (
            <Button className="mt-3 gap-2" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              {retrying ? 'Retrying…' : 'Retry from the failed step'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
