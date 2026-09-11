'use client';
// One mutation hook for every builder operation: optimistic cache update, rollback on error,
// and the server's { kit, meta } as the source of truth once it answers.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { KitDoc } from './api';
import { ApiError } from './api';
import type { BuilderResult } from './builder-api';
import { kitKey } from './use-kit';

export function useBuilderMutation(id: string) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (op: {
      run: () => Promise<BuilderResult>;
      optimistic?: (doc: KitDoc) => KitDoc;
    }) => op.run(),
    onMutate: async (op) => {
      setError(null);
      await qc.cancelQueries({ queryKey: kitKey(id) });
      const previous = qc.getQueryData<{ kit: KitDoc }>(kitKey(id));
      if (op.optimistic && previous)
        qc.setQueryData(kitKey(id), { kit: op.optimistic(previous.kit) });
      return { previous };
    },
    onError: (err, _op, ctx) => {
      if (ctx?.previous) qc.setQueryData(kitKey(id), ctx.previous);
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    },
    onSuccess: (result) => {
      qc.setQueryData<{ kit: KitDoc }>(kitKey(id), (old) =>
        old ? { kit: { ...old.kit, kit: result.kit, meta: result.meta } } : old,
      );
    },
  });
  return {
    mutate: m.mutate,
    mutateAsync: m.mutateAsync,
    pending: m.isPending,
    error,
    clearError: () => setError(null),
  };
}

/** Debounce text edits so typing never round-trips per keystroke (Section 12). */
export function useDebouncedSave(save: (value: string) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(value), ms);
    },
    [save, ms],
  );
}
