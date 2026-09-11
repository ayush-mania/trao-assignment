'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const kitKey = (id: string) => ['kit', id] as const;

/** Polls every 2s while the kit is queued or running (the persisted step state drives the timeline). */
export function useKit(id: string) {
  return useQuery({
    queryKey: kitKey(id),
    queryFn: () => api.getKit(id),
    refetchInterval: (query) => {
      const s = query.state.data?.kit.status;
      return s === 'queued' || s === 'running' ? 2000 : false;
    },
  });
}
