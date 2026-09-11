// Typed client for apps/api. One place for the base URL, credentials, and error shape.
import type { Kit, KitMeta, RunState } from '@trao/core';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export interface KitSummary {
  _id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  input: { company_url: string; days: number };
  state: Pick<RunState, 'steps' | 'error'>;
  kit: { source?: Kit['source']; role?: { title: string } } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KitDoc {
  _id: string;
  status: KitSummary['status'];
  input: { jd: string; company_url: string; days: number };
  state: RunState;
  kit: Kit | null;
  meta: KitMeta;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the API running?');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'HTTP',
      e?.message ?? `Request failed (${res.status})`,
      e?.issues,
    );
  }
  return body as T;
}

export const api = {
  me: () => call<{ user: User }>('/auth/me'),
  register: (email: string, password: string) =>
    call<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    call<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => call<void>('/auth/logout', { method: 'POST' }),

  listKits: () => call<{ kits: KitSummary[] }>('/kits'),
  getKit: (id: string) => call<{ kit: KitDoc }>(`/kits/${id}`),
  createKit: (input: { jd: string; company_url: string; days: number }) =>
    call<{ kit: KitDoc; reused: boolean }>('/kits', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createKits: (cases: { jd: string; company_url: string; days: number }[]) =>
    call<{ kits: { id: string; reused: boolean }[] }>('/kits/bulk', {
      method: 'POST',
      body: JSON.stringify({ cases }),
    }),
  retryKit: (id: string) => call<{ kit: KitDoc }>(`/kits/${id}/retry`, { method: 'POST' }),
  deleteKit: (id: string) => call<void>(`/kits/${id}`, { method: 'DELETE' }),
};
