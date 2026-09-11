import { LlmError, type LlmErrorKind } from './types.js';

/** Map an HTTP failure to an LlmError, reading Retry-After when present. */
export function httpFailure(
  provider: string,
  status: number,
  body: string,
  headers: Headers,
): LlmError {
  const retryAfterMs = parseRetryAfter(headers.get('retry-after'));
  const kind: LlmErrorKind =
    status === 429
      ? 'rate_limit'
      : status === 401 || status === 403
        ? 'auth'
        : status >= 500
          ? 'server'
          : 'bad_request';
  return new LlmError(
    kind,
    `${provider} HTTP ${status}: ${body.slice(0, 300)}`,
    provider,
    retryAfterMs,
  );
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; text: string; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text(), headers: res.headers };
  } catch (err) {
    throw new LlmError(
      'network',
      `${provider} request failed: ${(err as Error).message}`,
      provider,
    );
  } finally {
    clearTimeout(timer);
  }
}
