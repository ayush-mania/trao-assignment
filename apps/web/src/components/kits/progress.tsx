'use client';
import type { RunState, StepName } from '@trao/core';

// Mirrors packages/core STEPS. Kept local because the web bundle must not import core's runtime
// (it depends on node:dns, node:crypto). Types only cross this boundary.
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
import { Button } from '@/components/ui/button';

const LABELS: Record<StepName, string> = {
  validate_input: 'Check the input',
  extract_requirements: 'Extract requirements from the description',
  crawl_company: 'Crawl the company site for what they do and how they hire',
  search_discussion: 'Look for public discussion of their interviews',
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
}: {
  state: RunState;
  status: 'queued' | 'running' | 'done' | 'failed';
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const doneNames = new Map(state.steps.map((s) => [s.name, s]));
  const current = STEPS[state.step];
  return (
    <section
      aria-live="polite"
      aria-busy={status === 'queued' || status === 'running'}
      className="rounded-lg border p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">
          {status === 'queued' && 'Waiting to start'}
          {status === 'running' && 'Building your kit…'}
          {status === 'done' && 'Kit ready'}
          {status === 'failed' && 'Generation stopped'}
        </h2>
        <span className="text-sm text-muted-foreground">
          {state.steps.length}/{STEPS.length} steps
        </span>
      </div>
      <ol className="space-y-2">
        {STEPS.map((name) => {
          const rec = doneNames.get(name);
          const isCurrent = status === 'running' && name === current && !rec;
          const icon = rec
            ? rec.status === 'ok'
              ? '✓'
              : rec.status === 'skipped'
                ? '–'
                : '✕'
            : isCurrent
              ? '…'
              : '○';
          return (
            <li key={name} className="flex gap-3 text-sm">
              <span
                aria-hidden
                className={`w-4 text-center ${rec?.status === 'failed' ? 'text-destructive' : rec ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={rec || isCurrent ? '' : 'text-muted-foreground'}>
                  {LABELS[name]}
                  {rec?.status === 'skipped' && (
                    <span className="ml-2 text-xs text-muted-foreground">(skipped)</span>
                  )}
                  {rec && rec.status !== 'failed' && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(rec.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </p>
                {rec && rec.notes.length > 0 && (
                  <ul className="mt-0.5 text-xs text-muted-foreground">
                    {rec.notes.map((n, i) => (
                      <li key={i} className="truncate" title={n}>
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
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium">{state.error.code.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-muted-foreground">{state.error.message}</p>
          {onRetry && (
            <Button className="mt-3" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry from the failed step'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
